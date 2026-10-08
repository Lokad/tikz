import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {calcHash,loadCalcSavedReport} from './calc-saved-images.mjs';
import {loadCalcPolicy,verifyCalcProfileGuards,validateCalcCheckedTrial,finishCalcAdmission,calcPolicyId,calcPolicyScope} from './calc-admission-policy.mjs';
import {calcTrialOwned} from './calc-trial-saved.mjs';
import {runCalcChild,readCalcChild,ownCalcBundle} from './calc-admission-child.mjs';
import {makeCalcAdmissionAgent} from './calc-admission-agent.mjs';
import {validateCalcAdmissionReport} from './calc-admission-reader.mjs';
assert.equal(process.argv.length,2);const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.join(root,'artifacts/calc-conformance/run-'+randomUUID());
await mkdir(output,{recursive:true});const artifacts={},files=new Map(),inputs={},sourceHashes={};let phase='immutable-profile',converterInvoked=false,e;
const relative=f=>path.relative(root,f).split(path.sep).join('/');
async function save(f,b){await mkdir(path.dirname(path.join(output,f)),{recursive:true});await writeFile(path.join(output,f),b);artifacts[f]=calcHash(b);files.set(f,b);}
async function publish(completed,details={}){const b=Buffer.from(JSON.stringify({schemaVersion:1,role:'current-calc-conformance',completed,phase,passed:completed,converterInvoked,nativeToolInvoked:false,
  approvedImagePolicy:completed,imageConformanceClaim:completed,imageAdmission:completed?'passed':'pending',policyId:calcPolicyId,policyScope:calcPolicyScope,
  profileSha256:e?.profileSha256,acceptancePinSha256:e?.pinSha256,renderer:e?.profile.renderer,sourceHashes,inputs,artifacts,...details},null,2)+'\n');
  if(completed){validateCalcAdmissionReport(b,files,e);for(const[f,h]of Object.entries(sourceHashes))assert.equal(calcHash(await readFile(path.join(root,f))),h,'Current calc source changed before completion');}
  await writeFile(path.join(output,'report.json'),b);console.log(JSON.stringify({completed,phase,report:relative(path.join(output,'report.json')),sha256:calcHash(b)}));return b;}
await publish(false);
try{
  e=await loadCalcPolicy(root);Object.assign(sourceHashes,e.profile.guardToolHashes);
  await save('profile.json',e.profileBytes);await save('acceptance-pin.mjs',e.pinBytes);await save('qualification/native-calibration.bin.gz',e.native.compressed);await save('qualification/public-trial.bin.gz',e.publicTrial.compressed);
  await ownCalcBundle(e.reference,'reference-input',save);
  phase='fresh-public-export';converterInvoked=true;const candidateHandle=await runCalcChild(root,'dotnet',['run','--project','tools/TikzReference','-c','Release','--no-restore','--','export-calc-coordinates'],'export',save,60000);
  const candidate=await readCalcChild(root,candidateHandle,'calc-coordinate-candidate-export');
  phase='current-trial';const trialHandle=await runCalcChild(root,process.execPath,['tools/TikzVisual/trial-calc.mjs',candidateHandle.report,relative(path.join(output,'reference-input/report.json'))],'trial',save);
  const trial=await readCalcChild(root,trialHandle,'calc-current-candidate-trial');await ownCalcBundle(trial,'trial',save);inputs.trial={sourceFile:trialHandle.report,report:'trial/report.json',sha256:trial.sha256};
  phase='independent-current-check';const checkHandle=await runCalcChild(root,process.execPath,['tools/TikzVisual/check-calc-trial.mjs',trialHandle.report],'checker',save);
  const checker=await readCalcChild(root,checkHandle,'independent-calc-current-candidate-check');await ownCalcBundle(checker,'checker',save);inputs.checker={sourceFile:checkHandle.report,report:'checker/report.json',sha256:checker.sha256};
  const log=checker.files.get('source-recapture-command.log').toString(),handle=JSON.parse(log.slice(log.lastIndexOf('{"completed":')).trim()),recaptured=await readCalcChild(root,handle,'calc-current-candidate-trial');
  await ownCalcBundle(recaptured,'recaptured',save);inputs.recaptured={sourceFile:handle.report,report:'recaptured/report.json',sha256:recaptured.sha256};
  phase='fixed-family-admission';const combined=validateCalcCheckedTrial(e,trial,checker,recaptured),result=finishCalcAdmission(e.profile,combined);assert.equal(result.passed,true);
  Object.assign(sourceHashes,calcTrialOwned(trial,'candidate').json('candidate-source-hashes.json'));
  for(const[f,h]of Object.entries(sourceHashes)){const b=await readFile(path.join(root,f));assert.equal(calcHash(b),h);await save('source-captures/'+f,b);}
  await save('agent-inspection.json',Buffer.from(JSON.stringify(makeCalcAdmissionAgent(trial,e.profile,result),null,2)+'\n'));await verifyCalcProfileGuards(e.profile,root);
  for(const[f,h]of Object.entries(artifacts))assert.equal(calcHash(await readFile(path.join(output,f))),h);phase='complete';
  await publish(true,{result,metrics:combined.metrics,reproduction:combined.reproduction});
}catch(error){process.exitCode=1;await publish(false,{error:error.message.replaceAll(root,'<repo>').slice(0,2000)});console.error(error.stack);}
