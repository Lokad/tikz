// A candidate profile is saved under artifacts; review never edits a tracked pin.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact,outputPath} from './shape-oracle-bundle.mjs';
import {loadArrowCurrentImageCache,arrowCurrentImageProofs} from './arrow-current-image-cache.mjs';
import {arrowAdmissionSources,makeArrowProfile,validateArrowProfile,verifyArrowGuards,validateArrowCheckedTrial,finishArrowAdmission} from './arrow-admission-policy.mjs';

assert.equal(process.argv.length,2);
const output=await outputPath(path.join(root,'artifacts/arrow-admission-preparation/run-'+randomUUID())),artifacts={},save=(p,b)=>writeArtifact(output,p,b,artifacts);
const e=await loadArrowCurrentImageCache(),sources=await arrowAdmissionSources(e),hashes={};
for(const[file,s]of sources){hashes[file]=s.sha256;await save('source-captures/'+file,s.bytes);}
const profile=makeArrowProfile(e,hashes);await validateArrowProfile(profile,e);e.profile=profile;await verifyArrowGuards(e);
for(const[role,pin]of Object.entries(arrowCurrentImageProofs))await save('qualification/'+pin.file,e.get(pin.file));
const combined=await validateArrowCheckedTrial(e,e.model,e.reports.reader,p=>e.get('proofs/reader/'+p),arrowCurrentImageProofs.producer.sha256,'historical-qualification');
assert.equal(finishArrowAdmission(e,combined).passed,true);
const bytes=Buffer.from(JSON.stringify(profile,null,2)+'\n');await save('profile.json',bytes);
await save('native-limit-bindings.json',e.model.read('native-limit-bindings.json'));
await writeArtifact(output,'report.json',JSON.stringify({schemaVersion:1,completed:true,converterInvoked:false,nativeToolInvoked:false,browserInvoked:false,
  trackedProfileWritten:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',profileSha256:sha256(bytes),
  historicalQualificationChecked:true,sourceGuards:sources.size,inputs:Object.keys(profile.inputHashes).length,requiredGates:profile.requiredGates,artifacts},null,2)+'\n');
console.log(JSON.stringify({completed:true,profile:path.relative(root,path.join(output,'profile.json')).split(path.sep).join('/'),sha256:sha256(bytes),trackedProfileWritten:false}));
