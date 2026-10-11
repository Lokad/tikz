// Public malformed-input coverage; generated inputs never enter a native engine.
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {captureProcess} from './qualification-process.mjs';
import {root,writeArtifact,sha256} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport} from './calc-saved-images.mjs';

const flags=process.argv.slice(2);assert.ok(flags.length===0||flags.length===1&&flags[0]==='--controls',
 'Usage: node tools/TikzVisual/verify-adversarial.mjs [--controls]');
const output=path.join(root,'artifacts/adversarial/run-'+randomUUID()),artifacts={},steps=[],start=performance.now();
const report={schemaVersion:1,role:'tikz-bounded-adversarial-workflow',completed:false,phase:'start',artifacts,steps,
 approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',nativeToolInvoked:false,
 scope:'Fixed malformed UTF-16 corpus, conversion invariants and fresh saved-input replay; focused ongoing cancellation and feature limits remain ordinary-test requirements. Native/image conformance is separate.'};
const save=(file,bytes)=>writeArtifact(output,file,bytes,artifacts);
const publish=()=>writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
async function inputs(){
 const hashes={};
 async function visit(folder){for(const item of await readdir(path.join(root,folder),{withFileTypes:true})){
  const file=folder+'/'+item.name;if(item.isDirectory()){if(!['bin','obj'].includes(item.name))await visit(file);}
  else hashes[file]=sha256(await readFile(path.join(root,file)));
 }}
 await visit('src');await visit('tools/TikzAdversarial');
 for(const file of ['Directory.Build.props','Directory.Build.targets','Directory.Packages.props','global.json',
  'tools/TikzVisual/verify-adversarial.mjs','tools/TikzVisual/qualification-process.mjs',
  'tools/TikzVisual/shape-oracle-bundle.mjs','tools/TikzVisual/calc-saved-images.mjs'])
  hashes[file]=sha256(await readFile(path.join(root,file)));
 return Object.fromEntries(Object.entries(hashes).sort(([a],[b])=>a.localeCompare(b,'en')));
}
async function command(phase,args,timeout){
 report.phase=phase;console.log(JSON.stringify({phase}));await publish();
 const started=performance.now(),result=await captureProcess('dotnet',args,{cwd:root,timeout,maxBytes:200000});
 await save(phase+'.log',result.output.replaceAll(root,'<repo>'));
 // Failed workers preserve their case identity and exact inputs before admission.
 for(const file of ['cases.json','results.json','selection.json','worker.json','replay.json','failure.json']){
  const bytes=await readFile(path.join(output,file)).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
  if(bytes)await save(file,bytes);
 }
 steps.push({phase,wallSeconds:(performance.now()-started)/1000,exitCode:result.exitCode,failure:result.failure});await publish();
 assert.equal(result.failure,null,phase+': '+result.failure);assert.equal(result.exitCode,0,phase+': inspect '+phase+'.log');
}
async function replayControls(dll){
 const originalCases=await readFile(path.join(output,'cases.json')),originalResults=await readFile(path.join(output,'results.json')),controls=[];
 for(const name of ['changed-source-code-units','changed-result-hash']){
  const prefix='controls/'+name,folder=path.join(output,prefix);let cases=originalCases,results=originalResults;
  if(name==='changed-source-code-units'){const changed=JSON.parse(cases);changed[0].SourceUtf16CodeUnits[0]=65;cases=JSON.stringify(changed);}
  else{const changed=JSON.parse(results);changed[0].resultSha256='0'.repeat(64);results=JSON.stringify(changed);}
  await save(prefix+'/cases.json',cases);await save(prefix+'/results.json',results);
  const result=await captureProcess('dotnet',[dll,'replay',folder],{cwd:root,timeout:120000,maxBytes:200000});
  await save(prefix+'/replay.log',result.output.replaceAll(root,'<repo>'));assert.equal(result.failure,null,name);assert.equal(result.exitCode,1,name+' was accepted');
  const bytes=await readFile(path.join(folder,'failure.json'));await save(prefix+'/failure.json',bytes);const failure=JSON.parse(bytes);
  assert.equal(failure.completed,false);assert.equal(failure.phase,'saved-code-unit-replay');assert.equal(failure.currentCase,'valid-0');
  const expected=name==='changed-source-code-units'?'Saved source differs from the deterministic corpus':'Saved conversion result differs';
  assert.equal(failure.Message,expected);controls.push({name,rejected:true,phase:failure.phase,currentCase:failure.currentCase});
 }
 return controls;
}
try{
 await mkdir(output,{recursive:true});const sourceHashes=await inputs();await save('source-hashes.json',JSON.stringify(sourceHashes,null,2)+'\n');await publish();
 await command('build',['build','tools/TikzAdversarial','-c','Release','-p:RestoreLockedMode=true'],300000);
 const dll=path.join(root,'tools/TikzAdversarial/bin/Release/net10.0/TikzAdversarial.dll');
 await command('generate',[dll,'generate',output],120000);
 const worker=JSON.parse(await readFile(path.join(output,'worker.json')));
 assert.equal(worker.completed,true);assert.equal(worker.phase,'complete');assert.equal(worker.seed,0x54494b5a);assert.equal(worker.cases,5746);
 assert.equal(worker.unexpected,0);assert.equal(worker.failures.length,0);assert.equal(worker.successes+worker.diagnosticFailures,5746);
 assert.equal(worker.cultureChecks,2048);assert.equal(worker.parallelChecks,512);assert.equal(worker.cancellationChecks,64);
 const assembly=await readFile(path.join(root,'tools/TikzAdversarial/bin/Release/net10.0/Lokad.TikZ.dll'));
 assert.equal(sha256(assembly),worker.assemblySha256);await save('qualified-assembly.sha256',worker.assemblySha256+'\n');
 const savedHashes={...artifacts};await command('replay',[dll,'replay',output],120000);
 for(const file of ['cases.json','results.json','selection.json','worker.json'])assert.equal(artifacts[file],savedHashes[file],'Replay changed '+file);
 const replay=JSON.parse(await readFile(path.join(output,'replay.json')));assert.equal(replay.completed,true);assert.equal(replay.reproduced,5746);assert.ok(replay.nonScalarSources>0);
 assert.equal(replay.assemblySha256,worker.assemblySha256,'Replay used another converter assembly');
 if(flags.length){report.phase='replay-controls';await publish();report.controls=await replayControls(dll);}
 assert.deepEqual(await inputs(),sourceHashes,'Source changed during adversarial verification');
 report.result={cases:5746,successes:worker.successes,diagnosticFailures:worker.diagnosticFailures,unexpected:0,
  cultureChecks:2048,parallelChecks:512,cancellationChecks:64,replayed:5746,nonScalarSources:replay.nonScalarSources,
  productionAssemblySha256:worker.assemblySha256};
 report.completed=true;report.phase='complete';report.wallSeconds=(performance.now()-start)/1000;await publish();
 const checked=await loadCalcSavedReport(path.join(output,'report.json'),report.role);
 console.log(JSON.stringify({completed:true,report:path.relative(root,path.join(output,'report.json')).replaceAll('\\','/'),sha256:checked.sha256,wallSeconds:report.wallSeconds,...report.result}));
}catch(error){report.completed=false;report.error=error.message;report.wallSeconds=(performance.now()-start)/1000;await publish();
 console.log(JSON.stringify({completed:false,report:path.relative(root,path.join(output,'report.json')).replaceAll('\\','/')}));console.error(error.stack);process.exitCode=1;}
