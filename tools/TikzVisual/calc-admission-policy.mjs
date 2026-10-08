import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {calcHash,calcEqual} from './calc-saved-images.mjs';
import {loadCalcNativeCache,verifyCalcNativeCachePixels,replayCalcNativeCacheControls} from './calc-native-cache.mjs';
import {calcNativeCacheFile,calcNativeCacheSha256,calcNativeCacheDecodedSha256,calcNativeCacheProofs} from './calc-native-cache-pin.mjs';
import {loadCalcTrialCache,verifyCalcTrialCache,verifyCalcTrialCacheSources,replayCalcTrialCacheControls} from './calc-trial-cache.mjs';
import {calcTrialCacheFile,calcTrialCacheSha256,calcTrialCacheDecodedSha256,calcTrialCacheProofs} from './calc-trial-cache-pin.mjs';
import {calcTrialOwned,verifyCalcTrialPixels,verifyCalcTrialRecapture} from './calc-trial-saved.mjs';
import {calcPrimaryViews} from './calc-primary-policy.mjs';
import {calcPdfViews} from './calc-pdf-policy.mjs';
import {calcTrialCachePath} from './calc-trial-cache-codec.mjs';
import {calcProfileSha256} from './calc-profile-pin.mjs';
export const calcProfileFile='tools/TikzVisual/calc-profile.json';
export const calcProfilePinFile='tools/TikzVisual/calc-profile-pin.mjs';
export const calcPolicyId='chromium-153-pgf-calc-coordinates-v1';
export const calcPolicyScope='Only the fixed glyph-free calc-coordinates fixture, with black opaque 0.4-pt strokes and the recorded native coordinate/transform encodings. Original-driver primary and ordinary-PDF agreement use independently calibrated native limits. Other labels, paint options, libraries and interactions require separate evidence. Hosted execution is unverified.';
export const calcGateCounts={nativeQualification:{pairs:636,regions:15564},qualificationControls:{controls:47,negativeReplays:40},publicTraceParity:{conversions:1},
  numeric:{checks:466},frame:{checks:10},primary:{views:24},originalPdf:{views:4},candidatePdf:{views:4},
  comparator:{opaquePrimaryViews:264,opaquePdfViews:44,controlledViews:168},savedPixels:{pairs:540,regions:13212},sourceBinding:{artifacts:3022,pngs:2196},currentBuild:{exports:2}};
const entries=['calc-admission-policy.mjs','calc-admission-reader.mjs','calc-admission-agent.mjs','calc-admission-self-test.mjs',
  'calc-admission-child.mjs','prepare-calc-admission.mjs','compare-calc-conformance.mjs','check-calc-conformance.mjs'].map(f=>'tools/TikzVisual/'+f);
const digest=value=>calcHash(Buffer.from(JSON.stringify(value)));
export async function loadCalcQualification(root){
  const native=await loadCalcNativeCache(root,{pixels:false}),publicTrial=await loadCalcTrialCache(root,{pixels:false});
  await verifyCalcTrialCacheSources(publicTrial.evidence,root);
  const reference=calcTrialOwned(publicTrial.evidence.trial,'reference');
  for(const key of ['primary','pdf']){
    const nativeBundle=native.evidence[key],prefix=key==='primary'?'primaryCalibration':'pdfCalibration';
    assert.equal(calcHash(reference.files.get(prefix+'/report.json')),nativeBundle.sha256,'Public/native qualification differs');
    for(const[f,b]of reference.files)if(f.startsWith(prefix+'/')&&f!==prefix+'/report.json')assert.ok(nativeBundle.files.get(f.slice(prefix.length+1)).equals(b),'Public/native projection differs: '+f);
  }
  return{native,publicTrial,reference};
}
export async function calcAdmissionSources(e,root,read=readFile){
  const result={};for(const hashes of [e.native.evidence.sources,e.publicTrial.evidence.sources])for(const[f,h]of Object.entries(hashes)){
    if(f.startsWith('src/Lokad.TikZ/'))continue;assert.ok(!Object.hasOwn(result,f)||result[f]===h,'Conflicting calc admission source');result[f]=h;
  }
  const queue=[...entries],seen=new Set();for(let i=0;i<queue.length;i++){
    const f=queue[i];if(seen.has(f)||f===calcProfilePinFile)continue;seen.add(f);assert.match(f,/^tools\/TikzVisual\/[a-z0-9.-]+\.mjs$/);
    const bytes=await read(path.join(root,f)),h=calcHash(bytes);assert.ok(!Object.hasOwn(result,f)||result[f]===h,'Changed pinned calc source: '+f);result[f]=h;
    for(const m of bytes.toString().matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g))queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(f),m[1])));
  }
  return Object.fromEntries(Object.entries(result).sort(([a],[b])=>a<b?-1:a>b?1:0));
}
export function makeCalcProfile(e,guardToolHashes){
  const n=e.native.evidence,p=e.publicTrial.evidence,reference=p.reference;
  return{schemaVersion:1,id:calcPolicyId,scope:calcPolicyScope,approvedImagePolicy:true,
    qualification:{native:{file:calcNativeCacheFile,sha256:calcNativeCacheSha256,decodedSha256:calcNativeCacheDecodedSha256,proofHashes:Object.fromEntries(Object.entries(calcNativeCacheProofs).map(([k,v])=>[k,v.sha256]))},
      publicTrial:{file:calcTrialCacheFile,sha256:calcTrialCacheSha256,decodedSha256:calcTrialCacheDecodedSha256,proofHashes:Object.fromEntries(Object.entries(calcTrialCacheProofs).map(([k,v])=>[k,v.sha256]))}},
    renderer:n.primary.report.renderer,requiredGates:Object.keys(calcGateCounts),gateCounts:calcGateCounts,
    views:{primary:calcPrimaryViews,pdf:['original-svg','candidate-svg'].flatMap(route=>calcPdfViews.map(v=>({route,...v})))},
    nativeBindings:{sourceSha256:reference.cache.sourceSha256,originalSvgSha256:reference.cache.observerSvgSha256,pdfSha256:reference.pin.pdfSha256,
      primaryFrameSha256:digest(reference.primaryFrame),pdfRegistrationSha256:digest(reference.registration),primaryPolicySha256:digest(n.primary.report.policy),pdfPolicySha256:digest(n.pdf.report.policy)},
    controls:{native:Object.fromEntries(['primary','pdf'].map(k=>[k,n[k+'Controls'].report.controls.map(c=>c.name)])),public:p.controls.report.controls.map(c=>c.name)},
    claims:{primary:'exact only when every required decoded primary view is identical; otherwise calibrated native match',pdf:'separately calibrated original/public SVG versus ordinary PDF',hostedExecution:'unverified'},
    guardToolHashes};
}
export async function validateCalcProfile(profile,e,root,read=readFile){
  calcEqual(profile,makeCalcProfile(e,await calcAdmissionSources(e,root,read)),'Changed fixed calc profile');
  assert.ok(!Object.keys(profile.guardToolHashes).some(f=>f.startsWith('src/')));
}
export function decodeCalcProfile(bytes){
  assert.ok(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=4000000);assert.equal(calcHash(bytes),calcProfileSha256,'Unreviewed calc profile bytes');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export async function verifyCalcProfileGuards(profile,root,read=readFile){
  for(const[f,h]of Object.entries(profile.guardToolHashes)){calcTrialCachePath(f);assert.match(h,/^[a-f0-9]{64}$/);assert.equal(calcHash(await read(path.join(root,f))),h,'Current calc profile tool differs: '+f);}
}
export async function loadCalcPolicy(root){
  const e=await loadCalcQualification(root),profileBytes=await readFile(path.join(root,calcProfileFile)),profile=decodeCalcProfile(profileBytes);
  await validateCalcProfile(profile,e,root);await verifyCalcProfileGuards(profile,root);
  const pinBytes=await readFile(path.join(root,calcProfilePinFile));assert.ok(pinBytes.toString().includes("calcProfileSha256='"+calcProfileSha256+"'"));
  return{...e,profile,profileBytes,profileSha256:calcHash(profileBytes),pinBytes,pinSha256:calcHash(pinBytes)};
}
export function verifyCalcQualificationPixels(e,{progress=()=>{}}={}){
  const native=verifyCalcNativeCachePixels(e.native.evidence,{progress}),publicTrial=verifyCalcTrialCache(e.publicTrial.cache).metrics;
  assert.equal(native.primary.decodedPairs+native.pdf.decodedPairs,636);assert.equal(native.primary.regionalChecks+native.pdf.regionalChecks,15564);
  return{native,publicTrial};
}
export function replayCalcQualificationControls(e,{progress=()=>{}}={}){
  const native=replayCalcNativeCacheControls(e.native.evidence,{progress}),publicTrial=replayCalcTrialCacheControls(e.publicTrial.evidence);
  assert.equal(native.length+publicTrial.length,40);return{native,publicTrial};
}
export function validateCalcCheckedTrial(e,trial,checker,recaptured){
  const c=checker.report;calcEqual([c.role,c.completed,c.phase,c.converterInvoked,c.nativeToolInvoked,c.rendererRecaptured,c.approvedImagePolicy,c.imageConformanceClaim,c.imageAdmission],
    ['independent-calc-current-candidate-check',true,'complete',true,false,true,false,false,'pending'],'Current calc checker role differs');
  assert.equal(c.input.sha256,trial.sha256);assert.equal(calcHash(checker.files.get('input-report.json')),trial.sha256);assert.equal(calcHash(checker.files.get('recapture-report.json')),recaptured.sha256);
  calcEqual(trial.report.renderer,e.profile.renderer,'Current calc renderer differs');calcEqual(recaptured.report.renderer,e.profile.renderer,'Recaptured calc renderer differs');
  const reference=calcTrialOwned(trial,'reference');assert.equal(reference.sha256,e.reference.sha256,'Current calc native projection differs');
  const metrics=verifyCalcTrialPixels(trial);calcEqual(metrics,c.metrics);calcEqual(metrics,checker.json('decoded-metrics.json'));
  const command=c.commands.find(row=>row.log==='source-recapture-command.log');assert.ok(command&&command.exitCode===0&&command.executable==='node');
  assert.equal(command.arguments[0],'tools/TikzVisual/trial-calc.mjs');assert.equal(command.arguments.length,3);
  const reproduction=verifyCalcTrialRecapture(trial,recaptured,command.arguments.slice(1));calcEqual(reproduction,c.reproduction);calcEqual(reproduction,checker.json('source-binding.json'));
  const candidate=calcTrialOwned(trial,'candidate'),fresh=checker.json('fresh-public-report.json');assert.equal(fresh.completed,true);assert.equal(fresh.role,'calc-coordinate-candidate-export');
  calcEqual([fresh.schemaVersion,fresh.phase,fresh.approvedImagePolicy,fresh.imageConformanceClaim,fresh.imageAdmission],[1,'complete',false,false,'pending'],'Fresh public export role differs');
  assert.equal(calcHash(checker.files.get('fresh-public-report.json')),c.freshPublic.sha256);
  calcEqual(Object.keys(fresh.artifacts).sort(),Object.keys(candidate.report.artifacts).sort(),'Fresh public export coverage differs');
  calcEqual(fresh.details,candidate.report.details,'Fresh public trace/numeric summary differs');
  for(const f of Object.keys(candidate.report.artifacts).filter(f=>f!=='candidate-provenance.json'))assert.equal(candidate.report.artifacts[f],fresh.artifacts[f],'Fresh current export differs: '+f);
  assert.equal(calcHash(checker.files.get('fresh-public-provenance.json')),fresh.artifacts['candidate-provenance.json'],'Fresh public provenance differs');
  calcEqual(c.commands.map(row=>({executable:row.executable,arguments:row.arguments,exitCode:row.exitCode,log:row.log})),[
    {executable:'dotnet',arguments:['run','--project','tools/TikzReference','-c','Release','--no-restore','--','export-calc-coordinates'],exitCode:0,log:'fresh-public-command.log'},
    {executable:'node',arguments:command.arguments,exitCode:0,log:'source-recapture-command.log'}],'Current checker command coverage differs');
  for(const[f,h]of Object.entries({...trial.report.sourceHashes,...c.sourceHashes}))assert.equal(h,e.profile.guardToolHashes[f],'Changed current comparison source: '+f);
  const gates=Object.fromEntries(Object.entries(calcGateCounts).map(([name,counts])=>[name,{state:'passed',...counts}]));
  return{passed:true,gates,metrics,reproduction};
}
export function finishCalcAdmission(profile,combined){
  assert.equal(profile.approvedImagePolicy,true);calcEqual(Object.keys(combined.gates),profile.requiredGates,'Calc admission gate coverage differs');
  for(const[name,counts]of Object.entries(profile.gateCounts)){
    const gate=combined.gates[name];assert.ok(['passed','failed'].includes(gate.state));calcEqual(Object.fromEntries(Object.keys(counts).map(k=>[k,gate[k]])),counts,'Calc admission gate count differs');
    calcEqual(Object.keys(gate),['state',...Object.keys(counts)],'Unexpected calc gate fields');
  }
  const firstFailedGate=profile.requiredGates.find(k=>combined.gates[k].state!=='passed')??null,passed=firstFailedGate===null;assert.equal(combined.passed,passed,'False calc aggregate');
  return{passed,verdict:passed?'pass':'fail',firstFailedGate,gates:combined.gates,approvedImagePolicy:true,imageConformanceClaim:passed};
}
