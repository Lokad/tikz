// Reviewed fixed-fixture admission; raw observations remain unapproved.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root,sha256} from './shape-oracle-bundle.mjs';
import {canonical} from './labelled-border-combined-common.mjs';
import {loadLabelledCache,labelledCacheFile,labelledCacheSha256,labelledCacheDecodedSha256,labelledSame} from './labelled-border-cache.mjs';
import {shapeViews} from './shape-primary-trial-policy.mjs';
import {shapePdfViews} from './shape-pdf-trial-policy.mjs';
import {validateLabelledCachedTrial,finishLabelledCachedGates} from './labelled-border-cached-coverage.mjs';

export const labelledProfileFile='tools/TikzVisual/labelled-border-profile.json';
export const labelledPolicyId='chromium-153-native-pgf-labelled-borders-v1';
export const labelledPolicyScope='Only lines, paths and transforms in the fixed LabelledBorders corpus: 12 nodes, 26 paths, 40 glyphs and 192 anchors. Independent primary and ordinary-PDF limits with exact native-page comparison; no inherited allowance.';
export const labelledRequiredGates=['numeric','inkRoot','primary','originalPdf','candidatePdf','nativePage','freshPrimary','freshPdfNative'];
export const labelledAdmissionQualification={
  cache:{file:'artifacts/labelled-border-cache-controls/run-32ca0bda-c720-4316-805a-4b499c78c315/report.json',
    sha256:'3ca33e831222e3f91b517bf343629e98387c389d26666d1e925a9abb46b77ffb'},
  trial:{file:'artifacts/labelled-border-cached-trial/run-36533566-aa5e-4949-a033-a7795031ea4c/report.json',
    sha256:'1dcdb3ff44995b7346e803cec4aa6ea13601f9e1d0818c3c8d034aa0a979a9fd'},
  checker:{file:'artifacts/labelled-border-cached-controls/run-f286bce3-7157-452a-8f1e-396ee085c2a3/report.json',
    sha256:'9a8d3147e6512aa350daed9d396c243c36674e9c982dbe2544017368a827cf48'}
};
export const labelledExtraGuardTools=[
  'labelled-border-admission-policy.mjs','promote-labelled-borders.mjs','compare-labelled-border-conformance.mjs',
  'labelled-border-admission-self-test.mjs','labelled-border-owned-child.mjs','trial-labelled-border-cached.mjs',
  'labelled-border-cached-self-test.mjs','labelled-border-cached-coverage.mjs','labelled-border-combined-common.mjs',
  'labelled-border-combined-coverage.mjs','labelled-border-cache.mjs','labelled-border-cache-images.mjs',
  'labelled-border-cache-self-test.mjs','labelled-border-public-pdf-coverage.mjs'
].map(p=>'tools/TikzVisual/'+p).concat([
  'tools/TikzLabelledBorderComparison/Program.cs','tools/TikzLabelledBorderComparison/NativeComparison.cs',
  'tools/TikzLabelledBorderComparison/TikzLabelledBorderComparison.csproj','tools/TikzLabelledBorderComparison/packages.lock.json',
  'tools/TikzShapeComparison/NativeGlyphTrace.cs'
]);
export function labelledGuardFiles(e){return [...new Set([...Object.keys(e.calibration.toolHashes),...labelledExtraGuardTools])].sort();}
export function makeLabelledProfile(e,guardToolHashes){
  return {schemaVersion:1,id:labelledPolicyId,scope:labelledPolicyScope,approvedImagePolicy:true,
    calibration:{file:labelledCacheFile,sha256:labelledCacheSha256,decodedSha256:labelledCacheDecodedSha256},
    qualification:Object.fromEntries(Object.entries(labelledAdmissionQualification).map(([k,v])=>[k,v.sha256])),
    requiredGates:labelledRequiredGates,requiredViews:{primary:shapeViews,pdf:shapePdfViews},
    counts:{cases:3,nodes:12,paths:26,glyphs:40,anchors:192,numeric:1624,inkRoot:276,primary:1980,
      pdfPerRoute:696,nativePage:672,primaryControls:26,primaryControlViews:102,pdfControls:32,pdfControlViews:126,
      visiblePdfRejections:114,exactPdfVisibilityControls:12,pdfOnlyBlindSpotViews:4},
    nativePageRawLimit:0,claims:{primary:'calibrated-original-driver',pdf:'separate-calibrated-original-and-native',nativePage:'exact-independent-native-SVG-page'},
    cases:e.reports.primary.cases.map((p,i)=>({caseId:p.caseId,primaryFrameSha256:sha256(JSON.stringify(p.frame)),
      primaryPolicySha256:sha256(JSON.stringify(p.policy)),pdfCameraSha256:sha256(JSON.stringify(e.reports.pdf.cases[i].camera)),
      pdfRegionsSha256:sha256(JSON.stringify(e.reports.pdf.cases[i].regions)),pdfPoliciesSha256:sha256(JSON.stringify(e.reports.pdf.cases[i].policies))})),
    guardToolHashes};
}
export function validateLabelledProfile(p,e){
  assert.deepEqual(Object.keys(p.guardToolHashes).sort(),labelledGuardFiles(e));
  for(const h of Object.values(p.guardToolHashes))assert.match(h,/^[a-f0-9]{64}$/);
  labelledSame(p,makeLabelledProfile(e,p.guardToolHashes),'Changed reviewed labeled-border profile.');
}
export async function verifyLabelledGuards(profile,read=readFile){
  for(const[p,h]of Object.entries(profile.guardToolHashes))assert.equal(sha256(canonical(await read(path.join(root,p)))),h,p);
}
export async function loadLabelledPolicy(read=readFile){
  const e=await loadLabelledCache(read),profileBytes=canonical(await read(path.join(root,labelledProfileFile))),profile=JSON.parse(profileBytes);
  validateLabelledProfile(profile,e);await verifyLabelledGuards(profile,read);
  return {...e,profile,profileBytes,profileSha256:sha256(profileBytes)};
}
export function finishLabelledAdmission(e,trial,checker){
  const combined=trial.completed===true?finishLabelledCachedGates(trial.cases,trial.primaryControls,trial.pdfControls):null;
  const passed=combined?.passed===true&&checker.completed===true&&checker.passed===true;
  assert.equal(e.profile.approvedImagePolicy,true);
  return {passed,verdict:passed?'pass':'fail',approvedImagePolicy:true,imageConformanceClaim:passed,
    overallVerdict:passed?'pass':'fail',firstFailedGate:combined?.firstFailedGate??(passed?null:'evidence'),gates:combined?.gates??{}};
}
export function validateLabelledCheckedPair(trial,checker,e,numeric,trialSha256){
  validateLabelledCachedTrial(trial,e,numeric);assert.equal(trial.combined.passed,true);
  assert.deepEqual([checker.schemaVersion,checker.completed,checker.passed,checker.converterInvoked,checker.approvedImagePolicy,checker.imageConformanceClaim,checker.overallVerdict],
    [1,true,true,false,false,false,'pending']);assert.equal(checker.controls.length,50);
  assert.equal(new Set(checker.controls.map(c=>c.name)).size,50);assert.ok(checker.controls.every(c=>c.passed));
  assert.deepEqual([checker.numericAssertions,checker.metricsRecomputed,checker.pagesRecomputed],[1624,22908,138]);
  assert.equal(checker.cacheSha256,labelledCacheSha256);assert.equal(checker.inputReportSha256,trialSha256);
  assert.equal(checker.artifacts['input-report.json'],trialSha256);
  for(const[p,h]of Object.entries(trial.toolHashes))assert.equal(checker.toolHashes[p],h);
  for(const[p,h]of Object.entries(checker.toolHashes))assert.equal(checker.artifacts['tool-sources/'+p],h);
}
export function validateLabelledViewer(html,artifacts,cases){
  const links=[...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m=>m[1]);assert.ok(links.length>0);
  for(const p of links){
    assert.ok(/^[\w./-]+$/.test(p)&&!p.startsWith('/')&&!p.split('/').some(s=>['..','.',''].includes(s)));
    if(p!=='report.json')assert.match(artifacts[p]??'',/^[a-f0-9]{64}$/,'Unlinked viewer artifact: '+p);
  }
  for(const c of cases)for(const p of [c.source,c.scene])assert.ok(links.includes(p),'Missing viewer source/scene link: '+p);
}
export function validateLabelledAdmissionReport(r,e,trial,checker,numeric){
  assert.deepEqual([r.schemaVersion,r.comparisonKind,r.completed,r.converterInvoked],[1,'cached-public-labelled-border-conformance',true,true]);
  assert.equal(r.policyId,labelledPolicyId);assert.equal(r.policyScope,labelledPolicyScope);assert.equal(r.profileSha256,e.profileSha256);
  assert.equal(r.cacheSha256,labelledCacheSha256);validateLabelledCheckedPair(trial,checker,e,numeric,r.inputs.trial.sha256);
  assert.equal(r.inputs.trial.report,'trial/report.json');assert.equal(r.inputs.checker.report,'checker/report.json');
  for(const key of ['trial','checker']){assert.equal(r.inputs[key].completed,true);assert.equal(r.inputs[key].passed,true);
    assert.match(r.inputs[key].sourceFile,new RegExp('^artifacts/labelled-border-cached-'+(key==='trial'?'trial':'controls')+'/run-[a-f0-9-]+/report\\.json$'));
    assert.equal(r.artifacts[r.inputs[key].report],r.inputs[key].sha256);}
  assert.equal(checker.inputReportSha256,r.inputs.trial.sha256);assert.equal(r.artifacts['profile.json'],e.profileSha256);
  for(const[p,h]of Object.entries(trial.artifacts))assert.equal(r.artifacts['trial/'+p],h);
  for(const[p,h]of Object.entries(checker.artifacts))assert.equal(r.artifacts['checker/'+p],h);
  labelledSame(r.combined,finishLabelledAdmission(e,trial,checker));assert.equal(r.combined.passed,true);
  assert.deepEqual([r.approvedImagePolicy,r.imageConformanceClaim,r.overallVerdict],[true,true,'pass']);
  assert.equal(r.agent.viewer,'index.html');assert.equal(r.agent.trialViewer,'trial/index.html');assert.equal(r.agent.firstFailedGate,null);
  labelledSame(r.agent.cases,trial.cases.map(c=>({caseId:c.caseId,source:'trial/'+c.source,scene:'trial/'+c.scene})));
  assert.match(r.artifacts[r.agent.viewer],/^[a-f0-9]{64}$/);
  for(const[p,h]of Object.entries(e.profile.guardToolHashes)){assert.equal(r.toolHashes[p],h);assert.equal(r.artifacts['tool-sources/'+p],h);}
}
