// Verify the owned result, then reconstruct it from current public sources.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {calcHash,calcEqual} from './calc-saved-images.mjs';
import {loadCalcPolicy,verifyCalcProfileGuards,validateCalcCheckedTrial} from './calc-admission-policy.mjs';
import {loadCalcAdmissionReport,verifyCalcAdmissionCurrentSources} from './calc-admission-reader.mjs';
import {ownCalcBundle,runCalcChild,readCalcChild} from './calc-admission-child.mjs';
assert.equal(process.argv.length,3);const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.join(root,'artifacts/calc-conformance-checks/run-'+randomUUID());
await mkdir(output,{recursive:true});const artifacts={};let phase='owned-result';
const relative=f=>path.relative(root,f).split(path.sep).join('/');
async function save(f,b){await mkdir(path.dirname(path.join(output,f)),{recursive:true});await writeFile(path.join(output,f),b);artifacts[f]=calcHash(b);}
async function publish(completed,details={}){const b=Buffer.from(JSON.stringify({schemaVersion:1,role:'independent-calc-conformance-check',completed,phase,converterInvoked:phase!=='owned-result',nativeToolInvoked:false,
  approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'verification',artifacts,...details},null,2)+'\n');await writeFile(path.join(output,'report.json'),b);
  console.log(JSON.stringify({completed,phase,report:relative(path.join(output,'report.json')),sha256:calcHash(b)}));}
await publish(false);
try{
  const e=await loadCalcPolicy(root),saved=await loadCalcAdmissionReport(path.resolve(root,process.argv[2]),e);await verifyCalcAdmissionCurrentSources(saved,root);await save('input-report.json',saved.bytes);
  phase='current-source-reconstruction';await ownCalcBundle(saved.trial,'bound-trial',save);
  const handle=await runCalcChild(root,process.execPath,['tools/TikzVisual/check-calc-trial.mjs',relative(path.join(output,'bound-trial/report.json'))],'independent-recapture',save);
  const check=await readCalcChild(root,handle,'independent-calc-current-candidate-check');await ownCalcBundle(check,'current-check',save);
  const log=check.files.get('source-recapture-command.log').toString(),recaptureHandle=JSON.parse(log.slice(log.lastIndexOf('{"completed":')).trim());
  const recaptured=await readCalcChild(root,recaptureHandle,'calc-current-candidate-trial');await ownCalcBundle(recaptured,'current-recapture',save);
  const combined=validateCalcCheckedTrial(e,saved.trial,check,recaptured);assert.equal(combined.passed,true);
  calcEqual(check.report.metrics,saved.report.metrics);calcEqual(check.report.reproduction,saved.report.reproduction);
  await verifyCalcProfileGuards(e.profile,root);const sourceGuards=await verifyCalcAdmissionCurrentSources(saved,root);
  for(const[f,h]of Object.entries(artifacts))assert.equal(calcHash(await readFile(path.join(output,f))),h);phase='complete';await publish(true,{input:{file:process.argv[2],sha256:saved.sha256},
    profileSha256:e.profileSha256,metrics:check.report.metrics,reproduction:check.report.reproduction,currentCheck:handle,currentRecapture:recaptureHandle,sourceGuards,
    coverage:'Complete saved profile/gates/source/agent validation plus fresh public conversion and complete owned trial recapture. Scope remains the fixed glyph-free fixture.'});
}catch(error){process.exitCode=1;await publish(false,{error:error.message.replaceAll(root,'<repo>').slice(0,2000)});console.error(error.stack);}
