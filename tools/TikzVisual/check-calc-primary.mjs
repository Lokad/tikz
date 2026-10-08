// Native-only calibration reader and complete source-to-image recapture.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {loadCalcSavedReport,calcHash,calcEqual} from './calc-saved-images.mjs';
import {verifyCalcCalibrationPixels,verifyCalcCalibrationRecapture} from './calc-primary-saved.mjs';
import {readCalcLayoutEvidence} from './calc-layout-evidence.mjs';

assert.equal(process.argv.length,3,'Usage: node tools/TikzVisual/check-calc-primary.mjs <completed-native-primary-calibration/report.json>');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.join(root,'artifacts/calc-primary-checks/run-'+randomUUID()),artifacts={};
await mkdir(output,{recursive:true});
const relative=file=>path.relative(root,file).split(path.sep).join('/');
async function save(file,bytes){await mkdir(path.dirname(path.join(output,file)),{recursive:true});await writeFile(path.join(output,file),bytes);artifacts[file]=calcHash(bytes);}
const json=(file,value)=>save(file,Buffer.from(JSON.stringify(value,null,2)+'\n'));
let phase='saved-calibration',rendererRecaptured=false;
async function publish(completed,details={}){
  const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'independent-native-calc-primary-check',completed,phase,converterInvoked:false,nativeToolInvoked:false,
    approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',rendererRecaptured,artifacts,...details},null,2)+'\n');
  await writeFile(path.join(output,'report.json'),bytes);console.log(JSON.stringify({completed,phase,report:relative(path.join(output,'report.json')),sha256:calcHash(bytes)}));
}
await publish(false);
try{
  const input=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'native-calc-primary-calibration');await save('input-report.json',input.bytes);
  for(const[file,digest]of Object.entries(input.report.sourceHashes))assert.equal(calcHash(await readFile(path.join(root,file))),digest,'Calibration source changed: '+file);
  const sourceHashes={};for(const file of ['check-calc-primary.mjs','calc-primary-saved.mjs']){
    const key='tools/TikzVisual/'+file,bytes=await readFile(path.join(root,key));sourceHashes[key]=calcHash(bytes);await save('source-captures/'+key,bytes);
  }
  const pin=JSON.parse(await readFile(path.join(root,'tests/Reference/CalcCoordinates/pdf-pin.json')));
  const cacheBytes=await readFile(path.join(root,'tests/Reference/CalcCoordinates/points.json')),cache=JSON.parse(cacheBytes);
  calcEqual(input.json('points.json'),cache,'Calibration native cache differs');
  assert.equal(calcHash(input.files.get('native/report.json')),pin.nativeReportSha256);
  const nativeFiles=new Map([...input.files].filter(([f])=>f.startsWith('native/')).map(([f,b])=>[f.slice(7),b]));
  readCalcLayoutEvidence(Object.fromEntries(nativeFiles),cache);
  phase='independent-png-metrics';const metrics=verifyCalcCalibrationPixels(input);await json('decoded-metrics.json',metrics);
  phase='source-recapture';
  const nativeReport=input.json('native/report.json');await save('bound-native/report.json',input.files.get('native/report.json'));
  for(const[file,digest]of Object.entries(nativeReport.artifacts)){assert.equal(calcHash(nativeFiles.get(file)),digest);await save('bound-native/'+file,nativeFiles.get(file));}
  const nativeArgument=relative(path.join(output,'bound-native/report.json'));
  const command=promisify(execFile)(process.execPath,['tools/TikzVisual/calibrate-calc-primary.mjs',nativeArgument],{cwd:root,windowsHide:true,timeout:600000,maxBuffer:2000000});
  rendererRecaptured=true;
  let result;try{result=await command;}catch(error){await save('recapture-command.log',Buffer.from((error.stdout??'')+(error.stderr??'')));throw error;}
  await save('recapture-command.log',Buffer.from(result.stdout+result.stderr));
  const handle=JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));assert.equal(handle.completed,true);
  const fresh=await loadCalcSavedReport(path.join(root,handle.report),'native-calc-primary-calibration');assert.equal(fresh.sha256,handle.sha256);
  await save('recapture-report.json',fresh.bytes);const reproduction=verifyCalcCalibrationRecapture(input,fresh,nativeArgument);await json('source-binding.json',reproduction);
  for(const[file,digest]of Object.entries({...input.report.sourceHashes,...sourceHashes}))assert.equal(calcHash(await readFile(path.join(root,file))),digest);
  for(const[file,digest]of Object.entries(artifacts))assert.equal(calcHash(await readFile(path.join(output,file))),digest);
  phase='complete';await publish(true,{input:{file:process.argv[2],sha256:input.sha256},sourceHashes,metrics,reproduction,
    remaining:['ordinary PDF calibration and sensitivity','public current-candidate trial','reviewed combined admission','broader interactions','root integration']});
}catch(error){process.exitCode=1;await publish(false,{error:error.message.replaceAll(root,'<repo>').slice(0,2000)});console.error(error.stack);}
