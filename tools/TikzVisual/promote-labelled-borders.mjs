// Explicit admission of one reviewed corpus. Ordinary comparisons are read-only.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {canonical,verifyLabelledSourceHashes} from './labelled-border-combined-common.mjs';
import {loadLabelledCache,labelledCacheSha256,labelledCacheDecodedSha256} from './labelled-border-cache.mjs';
import {labelledAdmissionQualification,labelledProfileFile,labelledGuardFiles,makeLabelledProfile,
  validateLabelledProfile,validateLabelledCheckedPair} from './labelled-border-admission-policy.mjs';

const base=path.join(root,'artifacts/labelled-border-promotion'),output=path.join(base,'run-'+randomUUID());
const artifacts={},toolHashes={};let phase='qualification',profileWritten=false;
const save=(p,b)=>writeArtifact(output,p,b,artifacts);
async function publish(report){const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',bytes);
  await writeArtifact(base,'latest.json',JSON.stringify({completed:report.completed,
    report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)},null,2)+'\n');
  return {report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)};}
try{
  await publish({completed:false,profileWritten:false,converterInvoked:false,artifacts});assert.equal(process.argv.length,2);
  const e=await loadLabelledCache(),inputs={};
  for(const[key,pin]of Object.entries(labelledAdmissionQualification)){
    assert.match(pin.file,/^artifacts\/labelled-border-(?:cache-controls|cached-trial|cached-controls)\/run-[a-f0-9-]+\/report.json$/);
    const bytes=await readFile(path.join(root,pin.file));assert.equal(sha256(bytes),pin.sha256);
    const report=JSON.parse(bytes),folder=path.dirname(path.join(root,pin.file));assert.equal(report.completed,true);
    for(const[p,h]of Object.entries(report.artifacts))assert.equal(sha256(await readFile(await outputPath(folder,p))),h,p);
    await verifyLabelledSourceHashes(report.toolHashes);
    inputs[key]={report,folder};await save('qualification/'+key+'/report.json',bytes);
  }
  const c=inputs.cache.report;
  assert.deepEqual([c.schemaVersion,c.completed,c.passed,c.converterInvoked,c.approvedImagePolicy,c.imageConformanceClaim,c.overallVerdict],
    [1,true,true,false,false,false,'pending']);assert.equal(c.cacheSha256,labelledCacheSha256);assert.equal(c.decodedSha256,labelledCacheDecodedSha256);
  assert.equal(c.controls.length,44);assert.ok(c.controls.every(c=>c.passed));
  assert.deepEqual([c.metricsRecomputed,c.pagesRecomputed,c.controlPngsReproduced],[17424,138,126]);
  const numeric=JSON.parse(await readFile(path.join(inputs.trial.folder,'candidate/report.json')));
  await verifyLabelledSourceHashes({...numeric.converterSources,...numeric.toolHashes});
  validateLabelledCheckedPair(inputs.trial.report,inputs.checker.report,e,numeric,labelledAdmissionQualification.trial.sha256);
  phase='reviewed-source-capture';
  for(const p of labelledGuardFiles(e)){const b=canonical(await readFile(path.join(root,p)));toolHashes[p]=sha256(b);await save('tool-sources/'+p,b);}
  const profile=makeLabelledProfile(e,toolHashes);validateLabelledProfile(profile,e);
  const bytes=Buffer.from(JSON.stringify(profile,null,2)+'\n');await save('profile.json',bytes);await verifyLabelledSourceHashes(toolHashes);
  // This is the only command that writes the public admission profile. No cache,
  // reference, font, previous profile or raw investigation report is rewritten.
  phase='profile-write';await writeFile(path.join(root,labelledProfileFile),bytes);profileWritten=true;
  assert.equal(sha256(canonical(await readFile(path.join(root,labelledProfileFile)))),sha256(bytes));
  const location=await publish({schemaVersion:1,completed:true,passed:true,profileWritten,converterInvoked:false,
    profileSha256:sha256(bytes),qualification:labelledAdmissionQualification,toolHashes,artifacts});
  console.log(JSON.stringify({kind:'labelled-border-promotion-output',completed:true,...location}));
}catch(error){process.exitCode=2;console.error(error.stack);await publish({completed:false,passed:false,profileWritten,converterInvoked:false,
  phase,error:error.message.replaceAll(root,'<repo>'),toolHashes,artifacts});}
