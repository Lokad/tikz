import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {calcHash,calcEqual} from './calc-saved-images.mjs';
import {decodeCalcPng} from './calc-png.mjs';
import {calcTrialCachePath} from './calc-trial-cache-codec.mjs';
import {decodeCalcProfile,validateCalcCheckedTrial,finishCalcAdmission,calcPolicyId,calcPolicyScope} from './calc-admission-policy.mjs';
import {calcNativeCacheSha256} from './calc-native-cache-pin.mjs';
import {calcTrialCacheSha256} from './calc-trial-cache-pin.mjs';
import {validateCalcAdmissionAgent} from './calc-admission-agent.mjs';
export function calcAdmissionBundle(files,prefix,role){
  const selected=new Map([...files].filter(([f])=>f.startsWith(prefix+'/')).map(([f,b])=>[f.slice(prefix.length+1),b])),bytes=selected.get('report.json');selected.delete('report.json');
  assert.ok(Buffer.isBuffer(bytes)&&bytes.length<=16000000);const report=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  calcEqual([report.schemaVersion,report.role,report.completed,report.phase,report.approvedImagePolicy,report.imageConformanceClaim,report.imageAdmission],[1,role,true,'complete',false,false,'pending'],'Owned calc proof role differs');
  assert.ok(report.artifacts&&Object.keys(report.artifacts).length>0);calcEqual([...selected.keys()].sort(),Object.keys(report.artifacts).sort(),'Owned calc proof coverage differs');
  for(const[f,h]of Object.entries(report.artifacts)){calcTrialCachePath(f);assert.equal(calcHash(selected.get(f)),h,'Owned calc proof artifact differs: '+prefix+'/'+f);}
  return{bytes,sha256:calcHash(bytes),report,files:selected,json:f=>JSON.parse(selected.get(f)),png:f=>decodeCalcPng(selected.get(f))};
}
function calcAdmissionMetadata(bytes,files,e){
  assert.ok(Buffer.isBuffer(bytes)&&bytes.length<=16000000);const r=JSON.parse(bytes);
  calcEqual([r.schemaVersion,r.role,r.completed,r.phase,r.passed,r.converterInvoked,r.nativeToolInvoked,r.approvedImagePolicy,r.imageConformanceClaim,r.imageAdmission],
    [1,'current-calc-conformance',true,'complete',true,true,false,true,true,'passed'],'Saved calc conformance role differs');
  calcEqual([r.policyId,r.policyScope,r.profileSha256,r.acceptancePinSha256],[calcPolicyId,calcPolicyScope,e.profileSha256,e.pinSha256]);
  calcEqual(r.renderer,e.profile.renderer);assert.ok(r.artifacts&&Object.keys(r.artifacts).length>0);calcEqual([...files.keys()].sort(),Object.keys(r.artifacts).sort(),'Saved calc conformance coverage differs');
  for(const[f,h]of Object.entries(r.artifacts)){calcTrialCachePath(f);assert.match(h,/^[a-f0-9]{64}$/);assert.equal(calcHash(files.get(f)),h,'Saved calc conformance artifact differs: '+f);}
  assert.equal(calcHash(files.get('profile.json')),e.profileSha256);decodeCalcProfile(files.get('profile.json'));assert.equal(calcHash(files.get('acceptance-pin.mjs')),e.pinSha256);
  assert.equal(calcHash(files.get('qualification/native-calibration.bin.gz')),calcNativeCacheSha256);assert.equal(calcHash(files.get('qualification/public-trial.bin.gz')),calcTrialCacheSha256);
  const trial=calcAdmissionBundle(files,'trial','calc-current-candidate-trial'),checker=calcAdmissionBundle(files,'checker','independent-calc-current-candidate-check'),
    recaptured=calcAdmissionBundle(files,'recaptured','calc-current-candidate-trial');
  const reference=calcAdmissionBundle(files,'reference-input','calc-native-trial-reference-projection');assert.equal(reference.sha256,e.reference.sha256);
  assert.equal(r.inputs.trial.sha256,trial.sha256);assert.equal(r.inputs.checker.sha256,checker.sha256);assert.equal(r.inputs.recaptured.sha256,recaptured.sha256);
  assert.equal(checker.report.input.file,r.inputs.trial.sourceFile);
  const expectedSources={...e.profile.guardToolHashes,...trial.json('candidate/candidate-source-hashes.json')};calcEqual(r.sourceHashes,expectedSources,'Saved current compiler/tool sources differ');
  const expected=new Set(['profile.json','acceptance-pin.mjs','qualification/native-calibration.bin.gz','qualification/public-trial.bin.gz','agent-inspection.json',
    'export-command.log','trial-command.log','checker-command.log']);
  for(const prefix of ['trial','checker','recaptured','reference-input']){const b={trial,checker,recaptured,'reference-input':reference}[prefix];expected.add(prefix+'/report.json');for(const f of b.files.keys())expected.add(prefix+'/'+f);}
  for(const[f,h]of Object.entries(expectedSources)){expected.add('source-captures/'+f);assert.equal(calcHash(files.get('source-captures/'+f)),h,'Saved calc source capture differs');}
  calcEqual([...files.keys()].sort(),[...expected].sort(),'Unexpected/missing admitted calc artifact');
  // Reject invalid ownership/entry metadata before full PNG validation. The
  // declared result is still compared with the independent result below.
  validateCalcAdmissionAgent(JSON.parse(files.get('agent-inspection.json')),trial,e.profile,r.result,files);
  return{bytes,sha256:calcHash(bytes),report:r,files,trial,checker,recaptured};
}
export function validateCalcAdmissionReport(bytes,files,e){
  const saved=calcAdmissionMetadata(bytes,files,e),{report:r,trial,checker,recaptured}=saved;
  const combined=validateCalcCheckedTrial(e,trial,checker,recaptured),result=finishCalcAdmission(e.profile,combined);calcEqual(r.result,result,'Saved calc verdict differs');
  calcEqual(r.metrics,combined.metrics);calcEqual(r.reproduction,combined.reproduction);
  return{bytes,sha256:calcHash(bytes),report:r,files,trial,checker,recaptured,combined,result};
}
async function readCalcAdmissionFiles(file,checkedSha256){
  assert.ok((await stat(file)).size<=16000000);const bytes=await readFile(file);if(checkedSha256!==undefined)assert.equal(calcHash(bytes),checkedSha256,'Control input differs from checked calc receipt');const r=JSON.parse(bytes);assert.ok(r.artifacts&&Object.keys(r.artifacts).length<=8192);
  const files=new Map();let total=0;for(const f of Object.keys(r.artifacts)){calcTrialCachePath(f);const full=path.join(path.dirname(file),f),size=(await stat(full)).size;
    total+=size;assert.ok(size<=100000000&&total<=512000000,'Calc conformance artifact bound exceeded');files.set(f,await readFile(full));}
  return{bytes,files};
}
export async function loadCalcAdmissionReport(file,e){
  const{bytes,files}=await readCalcAdmissionFiles(file);return validateCalcAdmissionReport(bytes,files,e);
}
export async function loadCalcAdmissionControlInput(file,e,checkedSha256){
  assert.match(checkedSha256,/^[a-f0-9]{64}$/);
  const{bytes,files}=await readCalcAdmissionFiles(file,checkedSha256);
  return{...calcAdmissionMetadata(bytes,files,e),positiveCheck:'caller-required'};
}
export async function verifyCalcAdmissionCurrentSources(saved,root,read=readFile){
  for(const[f,h]of Object.entries(saved.report.sourceHashes)){
    calcTrialCachePath(f);assert.equal(calcHash(await read(path.join(root,f))),h,'Stale admitted calc source: '+f);
  }
  return{sources:Object.keys(saved.report.sourceHashes).length,production:Object.keys(saved.report.sourceHashes).filter(f=>f.startsWith('src/Lokad.TikZ/')).length};
}
