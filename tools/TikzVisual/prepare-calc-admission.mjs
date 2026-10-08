import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {calcHash} from './calc-saved-images.mjs';
import {loadCalcQualification,calcAdmissionSources,makeCalcProfile,validateCalcProfile,verifyCalcQualificationPixels,replayCalcQualificationControls} from './calc-admission-policy.mjs';
assert.equal(process.argv.length,2);const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.join(root,'artifacts/calc-admission-preparation/run-'+randomUUID());
await mkdir(output,{recursive:true});let phase='immutable-evidence';const artifacts={};
async function save(f,b){await mkdir(path.dirname(path.join(output,f)),{recursive:true});await writeFile(path.join(output,f),b);artifacts[f]=calcHash(b);}
async function publish(completed,details={}){const b=Buffer.from(JSON.stringify({schemaVersion:1,role:'calc-admission-preparation',completed,phase,converterInvoked:false,nativeToolInvoked:false,
  browserInvoked:false,trackedProfileWritten:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',artifacts,...details},null,2)+'\n');
  await writeFile(path.join(output,'report.json'),b);console.log(JSON.stringify({completed,phase,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:calcHash(b)}));}
await publish(false);
try{
  const e=await loadCalcQualification(root),sources=await calcAdmissionSources(e,root);for(const[f,h]of Object.entries(sources)){const b=await readFile(path.join(root,f));assert.equal(calcHash(b),h);await save('source-captures/'+f,b);}
  phase='independent-qualification-pixels';const metrics=verifyCalcQualificationPixels(e,{progress:route=>console.log(JSON.stringify({phase,route}))});
  phase='actual-qualification-corruptions';const controls=replayCalcQualificationControls(e,{progress:control=>console.log(JSON.stringify({phase,control}))});
  const profile=makeCalcProfile(e,sources);await validateCalcProfile(profile,e,root);const bytes=Buffer.from(JSON.stringify(profile,null,2)+'\n');await save('profile.json',bytes);
  await save('qualification-metrics.json',Buffer.from(JSON.stringify(metrics,null,2)+'\n'));await save('qualification-controls.json',Buffer.from(JSON.stringify(controls,null,2)+'\n'));
  phase='complete';await publish(true,{profile:path.relative(root,path.join(output,'profile.json')).split(path.sep).join('/'),profileSha256:calcHash(bytes),sourceGuards:Object.keys(sources).length,
    requiredGates:profile.requiredGates,metrics,negativeReplays:controls.native.length+controls.publicTrial.length,scope:profile.scope});
}catch(error){process.exitCode=1;await publish(false,{error:error.message.replaceAll(root,'<repo>').slice(0,2000)});console.error(error.stack);}
