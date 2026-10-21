// Acceptance gap: timeout/output/spawn errors must close and retain partial logs.
import assert from 'node:assert/strict';
import promises from 'node:fs/promises';
import {mkdir,writeFile} from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {captureProcess} from './qualification-process.mjs';
import {loadCalcSavedReport,calcHash} from './calc-saved-images.mjs';
import {runCalcChild} from './calc-admission-child.mjs';
const run=(source,options={})=>captureProcess(process.execPath,['-e',source],{timeout:5000,...options});
let r=await run('process.stdout.write("out");process.stderr.write("err")');assert.equal(r.exitCode,0);assert.equal(r.failure,null);assert.ok(r.output.includes('out')&&r.output.includes('err'));
assert.equal(r.stdout,'out');assert.equal(r.stderr,'err');
r=await run('process.stdout.write("before failure");process.exit(7)');assert.equal(r.exitCode,7);assert.equal(r.failure,null);assert.equal(r.output,'before failure');
r=await run('process.stdout.write("before timeout");setInterval(()=>{},1000)',{timeout:500});assert.equal(r.failure,'timeout');assert.equal(r.output,'before timeout');
r=await run('process.stdout.write("before overflow");setTimeout(()=>process.stdout.write("x".repeat(10000)),50)',{maxBytes:100});assert.equal(r.failure,'output-bound');assert.equal(r.output,'before overflow');
r=await captureProcess('lokad-no-such-native-tool-5f192d',[],{timeout:1000});assert.equal(r.failure,'ENOENT');assert.equal(r.output,'');
console.log('Shared bounded process controls: 5 passed.');

// A separate parent watchdog cleans up the exact test child if escalation fails.
// The child's finite fallback keeps a broken helper from leaving a process alive.
if (process.platform !== 'win32') {
  const folder = fileURLToPath(new URL('../../artifacts/process-termination-controls/run-' + randomUUID() + '/', import.meta.url));
  await mkdir(folder, {recursive: true});
  for (const overflow of [false, true]) {
    const pidFile = path.join(folder, overflow ? 'overflow.json' : 'timeout.json');
    const source = `const fs=require('node:fs');
      fs.writeFileSync(${JSON.stringify(pidFile)},JSON.stringify({pid:process.pid,parent:process.ppid}));
      process.on('SIGTERM',()=>{fs.writeFileSync(${JSON.stringify(pidFile + '.signal')},'SIGTERM');process.stdout.write('SIGTERM observed\\n');});
      process.stdout.write('ready\\n');
      ${overflow ? "setTimeout(()=>process.stdout.write('x'.repeat(10000)),100);" : ''}
      setTimeout(()=>process.exit(42),4000);`;
    let watchdogUsed = false;
    const watchdog = setTimeout(async () => {
      watchdogUsed = true;
      const identity = JSON.parse(await promises.readFile(pidFile, 'utf8'));
      assert.equal(identity.parent, process.pid);
      try { process.kill(identity.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }, 2500);
    try {
      const result = await run(source, {timeout: 1000, maxBytes: overflow ? 100 : 2000000});
      assert.equal(watchdogUsed, false, 'Independent termination watchdog was needed');
      assert.equal(result.failure, overflow ? 'output-bound' : 'timeout');
      assert.equal(result.terminationEscalated, true);
      assert.equal(result.terminationFailure, null);
      assert.ok(result.stdout.includes('ready\n'));
      assert.equal(await promises.readFile(pidFile + '.signal', 'utf8'), 'SIGTERM');
      const identity = JSON.parse(await promises.readFile(pidFile, 'utf8'));
      assert.throws(() => process.kill(identity.pid, 0), {code: 'ESRCH'});
    } finally { clearTimeout(watchdog); }
  }
  const holderFile = path.join(folder, 'pipe-holder.json');
  const parent = `const fs=require('node:fs'),{spawn}=require('node:child_process');
    const holder=spawn(process.execPath,['-e','setTimeout(()=>{},4000)'],{stdio:['ignore','inherit','inherit']});
    fs.writeFileSync(${JSON.stringify(holderFile)},JSON.stringify({pid:holder.pid,owner:${process.pid}}));
    process.stdout.write('inherited pipe\\n');process.exit(0);`;
  let watchdog;
  const deadline = new Promise((resolve, reject) => { watchdog = setTimeout(() => reject(new Error('Independent close watchdog expired')), 2500); });
  const pending = run(parent, {timeout: 500});
  try {
    const result = await Promise.race([pending, deadline]);
    assert.equal(result.failure, 'timeout');
    assert.equal(result.terminationFailure, 'close-timeout');
    assert.equal(result.terminationEscalated, false);
    assert.equal(result.stdout, 'inherited pipe\n');
  } finally {
    clearTimeout(watchdog);
    const identity = JSON.parse(await promises.readFile(holderFile, 'utf8'));
    assert.equal(identity.owner, process.pid);
    try { process.kill(identity.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    await pending;
  }
  console.log('Shared Unix termination controls: ignored SIGTERM on timeout/output exhaustion, hard kill, child cleanup and inherited-pipe close bound passed.');
}

// Parallel artifact loading must settle every in-flight read before rejection.
const folder=fileURLToPath(new URL('../../artifacts/shared-loader-controls/run-'+randomUUID()+'/',import.meta.url));
await mkdir(folder,{recursive:true});const artifacts={};
for(let n=0;n<16;n++){const bytes=Buffer.from('shared asset '+n);await writeFile(path.join(folder,n+'.bin'),bytes);artifacts[n+'.bin']=calcHash(bytes);}
const reportFile=path.join(folder,'report.json'),role='shared-saved-report-controls';
const report={schemaVersion:1,role,completed:true,phase:'complete',approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',artifacts};
await writeFile(reportFile,JSON.stringify(report));const positive=await loadCalcSavedReport(reportFile,role);
assert.deepEqual([...positive.files.keys()],Object.keys(artifacts));
const originalRead=promises.readFile;let active=0,maximum=0,reads=0;
let releaseGood;const goodStarted=new Promise(resolve=>{releaseGood=resolve;});
const fallback=setTimeout(()=>releaseGood(),1000);
try{
  promises.readFile=async(file,...args)=>{
    if(path.dirname(String(file))!==folder.slice(0,-1)||path.basename(String(file))==='report.json')return originalRead(file,...args);
    active++;reads++;maximum=Math.max(maximum,active);
    try{if(path.basename(String(file))==='0.bin')await goodStarted;else{releaseGood();await new Promise(resolve=>setTimeout(resolve,40));}return await originalRead(file,...args);}
    finally{active--;}
  };syncBuiltinESMExports();report.artifacts['0.bin']='0'.repeat(64);await writeFile(reportFile,JSON.stringify(report));
  await assert.rejects(loadCalcSavedReport(reportFile,role),/Artifact hash differs/);
  assert.ok(maximum>1&&maximum<=8,'Missing bounded concurrent reads');assert.equal(active,0,'Read remains active after rejection');
  const settledReads=reads;await new Promise(resolve=>setTimeout(resolve,60));assert.equal(reads,settledReads,'Read began after rejection');
}finally{clearTimeout(fallback);promises.readFile=originalRead;syncBuiltinESMExports();}
console.log('Shared saved-report controls: order, concurrency bound and failure settlement passed.');

// Report-owning children share the bounded process helper without parsing a
// diagnostic on stderr as a receipt, and retain failed reports and payloads.
await writeFile(reportFile,positive.bytes);
const repository=fileURLToPath(new URL('../../',import.meta.url));
const receipt={completed:true,report:path.relative(repository,reportFile).replaceAll('\\','/'),sha256:positive.sha256};
const emit='process.stdout.write('+JSON.stringify(JSON.stringify(receipt))+');process.stderr.write("diagnostic only");';
const saved=new Map(),save=async(file,bytes)=>saved.set(file,Buffer.from(bytes));
const child=await runCalcChild(repository,process.execPath,['-e',emit],'positive',save,5000,true);
assert.ok(child.bytes.equals(positive.bytes));assert.equal(child.report.role,role);
assert.ok(saved.get('positive-command.log').toString().endsWith('diagnostic only'));
await assert.rejects(runCalcChild(repository,process.execPath,['-e',emit+'process.exit(7);'],'failed',save,5000),/Child execution failed: failed: exit 7/);
assert.ok(saved.get('failed/failed/report.json').equals(positive.bytes));
for(const[file,bytes]of positive.files)assert.ok(saved.get('failed/failed/'+file).equals(bytes));
console.log('Shared report-child controls: stdout receipt, stderr retention and failed payload retention passed.');
