// Fresh public conversion, independent saved metrics, owned source recapture.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {loadCalcSavedReport,calcHash,calcEqual} from './calc-saved-images.mjs';
import {calcTrialOwned,verifyCalcTrialPixels,verifyCalcTrialRecapture} from './calc-trial-saved.mjs';
import {currentCalcSources,readCalcTrialReference} from './calc-trial-reference.mjs';
assert.equal(process.argv.length,3,'Usage: node tools/TikzVisual/check-calc-trial.mjs <completed-public-trial/report.json>');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.join(root,'artifacts/calc-public-checks/run-'+randomUUID());
await mkdir(output,{recursive:true});const artifacts={},sourceHashes={},commands=[];let phase='bound-trial',converterInvoked=false,rendererRecaptured=false;
const relative=f=>path.relative(root,f).split(path.sep).join('/');
async function save(f,b){await mkdir(path.dirname(path.join(output,f)),{recursive:true});await writeFile(path.join(output,f),b);artifacts[f]=calcHash(b);}
const json=(f,o)=>save(f,Buffer.from(JSON.stringify(o,null,2)+'\n'));
async function publish(completed,details={}){const b=Buffer.from(JSON.stringify({schemaVersion:1,role:'independent-calc-current-candidate-check',completed,phase,
  converterInvoked,nativeToolInvoked:false,rendererRecaptured,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',sourceHashes,artifacts,commands,...details},null,2)+'\n');
  await writeFile(path.join(output,'report.json'),b);console.log(JSON.stringify({completed,phase,report:relative(path.join(output,'report.json')),sha256:calcHash(b)}));}
async function child(executable,args,name,timeout){let result;try{result=await promisify(execFile)(executable,args,{cwd:root,windowsHide:true,timeout,maxBuffer:2000000});}
  catch(error){await save(name+'-command.log',Buffer.from((error.stdout??'')+(error.stderr??'')));throw error;}
  await save(name+'-command.log',Buffer.from(result.stdout+result.stderr));commands.push({executable:executable===process.execPath?'node':executable,arguments:args,exitCode:0,log:name+'-command.log'});
  let handle;try{handle=JSON.parse(result.stdout.trim());}catch{const marker=result.stdout.lastIndexOf('{"completed":');assert.ok(marker>=0);handle=JSON.parse(result.stdout.slice(marker).trim());}
  assert.equal(handle.completed,true);assert.match(handle.report,/^artifacts\/[a-z-]+\/run-[a-f0-9-]+\/report\.json$/);assert.equal(calcHash(await readFile(path.join(root,handle.report))),handle.sha256);return handle;
}
async function materialize(prefix,bundle){await save(prefix+'/report.json',bundle.bytes);for(const[f,digest]of Object.entries(bundle.report.artifacts)){
  const bytes=bundle.files.get(f);assert.equal(calcHash(bytes),digest);await save(prefix+'/'+f,bytes);}return relative(path.join(output,prefix,'report.json'));}
await publish(false);
try{
  const input=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'calc-current-candidate-trial');await save('input-report.json',input.bytes);
  const candidate=calcTrialOwned(input,'candidate'),referenceBundle=calcTrialOwned(input,'reference'),reference=readCalcTrialReference(referenceBundle);
  await currentCalcSources(root,{...reference.nativeSourceHashes,...referenceBundle.report.sourceHashes,...input.report.sourceHashes,...candidate.json('candidate-source-hashes.json')});
  for(const file of ['check-calc-trial.mjs','calc-trial-saved.mjs']){const key='tools/TikzVisual/'+file,b=await readFile(path.join(root,key));sourceHashes[key]=calcHash(b);await save('source-captures/'+key,b);}
  phase='fresh-public-conversion';converterInvoked=true;
  const freshHandle=await child('dotnet',['run','--project','tools/TikzReference','-c','Release','--no-restore','--','export-calc-coordinates'],'fresh-public',60000);
  const fresh=await loadCalcSavedReport(path.join(root,freshHandle.report),'calc-coordinate-candidate-export');assert.equal(fresh.sha256,freshHandle.sha256);
  for(const f of Object.keys(candidate.report.artifacts).filter(f=>f!=='candidate-provenance.json'))assert.equal(calcHash(fresh.files.get(f)),calcHash(candidate.files.get(f)),'Fresh public export differs: '+f);
  await save('fresh-public-report.json',fresh.bytes);await save('fresh-public-provenance.json',fresh.files.get('candidate-provenance.json'));
  phase='independent-png-metrics';const metrics=verifyCalcTrialPixels(input);await json('decoded-metrics.json',metrics);console.log(JSON.stringify({phase,decodedPairs:metrics.decodedPairs,regionalChecks:metrics.regionalChecks}));
  phase='owned-source-recapture';const args=[await materialize('bound-candidate',candidate),await materialize('bound-reference',referenceBundle)];rendererRecaptured=true;
  const handle=await child(process.execPath,['tools/TikzVisual/trial-calc.mjs',...args],'source-recapture',600000);
  const recaptured=await loadCalcSavedReport(path.join(root,handle.report),'calc-current-candidate-trial');assert.equal(recaptured.sha256,handle.sha256);
  await save('recapture-report.json',recaptured.bytes);const reproduction=verifyCalcTrialRecapture(input,recaptured,args);await json('source-binding.json',reproduction);
  await currentCalcSources(root,{...reference.nativeSourceHashes,...referenceBundle.report.sourceHashes,...input.report.sourceHashes,...candidate.json('candidate-source-hashes.json'),...sourceHashes});
  for(const[f,digest]of Object.entries(artifacts))assert.equal(calcHash(await readFile(path.join(output,f))),digest);
  phase='complete';await publish(true,{input:{file:process.argv[2],sha256:input.sha256},metrics,reproduction,freshPublic:freshHandle,
    provenanceScope:'Fresh conversion must reproduce every functional export artifact and compiler source guard. Fresh commit/build/working-tree provenance is retained separately; recapture uses the owned original export without altering its provenance.',
    remaining:['reviewed combined admission','broader interactions','root integration']});
}catch(error){process.exitCode=1;await publish(false,{error:error.message.replaceAll(root,'<repo>').slice(0,2000)});console.error(error.stack);}
