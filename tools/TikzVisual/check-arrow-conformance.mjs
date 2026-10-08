// Full saved-proof replay: compile again and bind every image/crop and RGB moment.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact,outputPath} from './shape-oracle-bundle.mjs';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {loadArrowAdmissionReport} from './arrow-admission-reader.mjs';
import {runArrowChild,copyArrowChild} from './arrow-admission-owned-child.mjs';
import {validateArrowCheckedTrial,finishArrowAdmission,verifyArrowGuards} from './arrow-admission-policy.mjs';

assert.equal(process.argv.length,3);
const output=await outputPath(path.join(root,'artifacts/arrow-conformance-checks/run-'+randomUUID())),artifacts={},save=(p,b)=>writeArtifact(output,p,b,artifacts);
let phase='saved-admission',inputReportSha256;
try{
  const b=await loadArrowAdmissionReport(process.argv[2]);inputReportSha256=b.inputReportSha256;
  await save('input-report.json',b.reportBytes);await save('profile.json',b.e.profileBytes);
  const trialFolder=await outputPath(path.join(root,'artifacts/arrow-current-trials/run-'+randomUUID()));
  await writeArtifact(trialFolder,'report.json',b.read('trial/report.json'));await writeArtifact(trialFolder,'manifest.json',b.read('trial/manifest.json'));
  for(const[file,bytes]of b.trial.assets)await writeArtifact(trialFolder,file,bytes);
  const trialFile=path.relative(root,path.join(trialFolder,'report.json')).split(path.sep).join('/');
  phase='independent-full-current-replay';const child=await runArrowChild('checker',trialFile,save);await copyArrowChild(child,'checker',save);assert.equal(child.status,0);
  const read=file=>readFile(path.join(child.folder,file));
  const combined=finishArrowAdmission(b.e,await validateArrowCheckedTrial(b.e,b.trial,child.report,read,sha256(b.read('trial/report.json'))));
  assertNativeEqual(combined,b.report.combined);await verifyArrowGuards(b.e);phase='complete';
  const bytes=Buffer.from(JSON.stringify({schemaVersion:1,comparisonKind:'independent-arrow-conformance-check',completed:true,phase,inputReport:process.argv[2],inputReportSha256,
    converterInvoked:true,nativeToolInvoked:false,approvedImagePolicy:true,imageConformanceClaim:true,overallVerdict:'pass',profileSha256:b.e.profileSha256,
    checker:{sourceFile:child.reportPath,sha256:child.sha256},combined,artifacts},null,2)+'\n');await writeArtifact(output,'report.json',bytes);
  console.log(JSON.stringify({completed:true,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));
}catch(error){process.exitCode=2;console.error(error.stack);await writeArtifact(output,'report.json',JSON.stringify({completed:false,phase,inputReportSha256,
  converterInvoked:phase==='independent-full-current-replay',approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',error:error.message.slice(0,1000).replaceAll(root,'<repo>'),artifacts},null,2)+'\n');}
