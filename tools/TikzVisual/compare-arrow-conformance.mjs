// One owned fresh trial and independent check precede fixed-family admission.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact,outputPath} from './shape-oracle-bundle.mjs';
import {arrowCanonical} from './arrow-native-contract.mjs';
import {arrowCurrentImageCacheSha256} from './arrow-current-image-cache.mjs';
import {loadArrowCurrentTrial} from './arrow-current-trial-reader.mjs';
import {loadArrowPolicy,verifyArrowGuards,validateArrowCheckedTrial,finishArrowAdmission,arrowPolicyId,arrowPolicyScope} from './arrow-admission-policy.mjs';
import {runArrowChild,copyArrowChild} from './arrow-admission-owned-child.mjs';
import {buildArrowAdmissionAgent,validateArrowAdmissionAgent,arrowAdmissionViewer} from './arrow-admission-agent.mjs';
import {validateArrowAdmissionBundle} from './arrow-admission-reader.mjs';

assert.equal(process.argv.length,2);
const base=path.join(root,'artifacts/arrow-conformance'),output=await outputPath(path.join(base,'run-'+randomUUID())),artifacts={},inputs={},sourceHashes={};
const save=(p,b)=>writeArtifact(output,p,b,artifacts),relative=p=>path.relative(root,p).split(path.sep).join('/');
let phase='immutable-profile',converterInvoked=false,e;
async function publish(completed,details){
  const report={schemaVersion:1,comparisonKind:'current-arrow-conformance',completed,phase,passed:completed,converterInvoked,nativeToolInvoked:false,
    approvedImagePolicy:completed,imageConformanceClaim:completed,imageAdmission:completed?'passed':'pending',overallVerdict:completed?'pass':'pending',
    policyId:arrowPolicyId,policyScope:arrowPolicyScope,renderer:e?.profile.renderer,profileSha256:e?.profileSha256,acceptancePinSha256:e?.acceptancePinSha256,
    qualificationCacheSha256:arrowCurrentImageCacheSha256,inputs,sourceHashes,...details,artifacts};
  const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',bytes);
  await writeArtifact(base,'latest.json',JSON.stringify({completed,report:relative(path.join(output,'report.json')),sha256:sha256(bytes)})+'\n');
  console.log(JSON.stringify({kind:'arrow-conformance',final:completed||Boolean(details?.error),completed,passed:completed,phase,report:relative(path.join(output,'report.json')),sha256:sha256(bytes)}));
  return bytes;
}
try{
  await publish(false);e=await loadArrowPolicy();Object.assign(sourceHashes,e.profile.guardToolHashes);
  await save('profile.json',e.profileBytes);await save('acceptance-pin.mjs',e.acceptancePinBytes);await save('qualification/current-combined.bin.gz',e.compressed);
  for(const[file,hash]of Object.entries(sourceHashes)){const bytes=arrowCanonical(await readFile(path.join(root,file)));assert.equal(sha256(bytes),hash);await save('source-captures/'+file,bytes);}
  phase='fresh-current-trial';converterInvoked=true;const trialChild=await runArrowChild('trial',undefined,save);
  inputs.trial={sourceFile:trialChild.reportPath,report:'trial/report.json',sha256:trialChild.sha256};
  await copyArrowChild(trialChild,'trial',save);assert.equal(trialChild.status,0,'Current trial failed; saved evidence retained.');
  const trial=await loadArrowCurrentTrial(trialChild.reportPath);
  phase='independent-current-check';const checkerChild=await runArrowChild('checker',trialChild.reportPath,save);
  inputs.checker={sourceFile:checkerChild.reportPath,report:'checker/report.json',sha256:checkerChild.sha256};
  await copyArrowChild(checkerChild,'checker',save);assert.equal(checkerChild.status,0,'Independent current check failed; saved evidence retained.');
  phase='fixed-family-admission';
  const raw=await validateArrowCheckedTrial(e,trial,checkerChild.report,file=>readFile(path.join(checkerChild.folder,file)),trialChild.sha256),combined=finishArrowAdmission(e,raw);assert.equal(combined.passed,true);
  const agent=buildArrowAdmissionAgent(trial.json('agent-inspection.json'));await save('agent-inspection.json',JSON.stringify(agent)+'\n');validateArrowAdmissionAgent(agent,trial.json('agent-inspection.json'),artifacts);
  await save('index.html',arrowAdmissionViewer(agent));await verifyArrowGuards(e);
  const assets=new Map();for(const[file,hash]of Object.entries(artifacts)){const bytes=await readFile(await outputPath(output,file));assert.equal(sha256(bytes),hash);assets.set(file,bytes);}
  phase='complete';
  // Validate before publishing the approved terminal report.
  const proposed={schemaVersion:1,comparisonKind:'current-arrow-conformance',completed:true,phase,passed:true,converterInvoked:true,nativeToolInvoked:false,
    approvedImagePolicy:true,imageConformanceClaim:true,imageAdmission:'passed',overallVerdict:'pass',policyId:arrowPolicyId,policyScope:arrowPolicyScope,
    renderer:e.profile.renderer,profileSha256:e.profileSha256,acceptancePinSha256:e.acceptancePinSha256,qualificationCacheSha256:arrowCurrentImageCacheSha256,
    inputs,sourceHashes,combined,agent:'agent-inspection.json',viewer:'index.html',artifacts};
  await validateArrowAdmissionBundle(Buffer.from(JSON.stringify(proposed)+'\n'),assets,e);
  await publish(true,{combined,agent:'agent-inspection.json',viewer:'index.html'});
}catch(error){process.exitCode=2;console.error(error.stack);await publish(false,{error:error.message.slice(0,1000).replaceAll(root,'<repo>')});}
