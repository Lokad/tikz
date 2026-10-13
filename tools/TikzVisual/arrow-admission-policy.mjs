import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Admission binds independently frozen native limits and complete fresh evidence.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root,sha256} from './shape-oracle-bundle.mjs';
import {arrowCanonical} from './arrow-native-contract.mjs';
import {arrowCachePath} from './arrow-image-cache-codec.mjs';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {loadArrowCurrentImageCache,arrowCurrentImageCacheFile,arrowCurrentImageCacheSha256,arrowCurrentImageCacheDecodedSha256,arrowCurrentImageProofs} from './arrow-current-image-cache.mjs';
import {arrowPublicMeetBindings} from './arrow-public-meet-contract.mjs';
import {arrowPublicPrimaryPlan,arrowPublicPdfPlan} from './arrow-public-source-policy.mjs';
import {arrowPublicPrimaryControlPlan} from './arrow-public-primary-controls.mjs';
import {arrowPublicPdfControlPlan} from './arrow-public-pdf-controls.mjs';
import {arrowCurrentNumericParity} from './arrow-current-trial-contract.mjs';
import {validateArrowPublicNumeric} from './arrow-public-source-contract.mjs';
import {verifyArrowPublicHistoricalNumeric} from './arrow-public-image-cache.mjs';
import {arrowProfileSha256} from './arrow-profile-pin.mjs';

export const arrowProfileFile='tools/TikzVisual/arrow-profile.json';
export const arrowProfilePinFile='tools/TikzVisual/arrow-profile-pin.mjs';
export const arrowPolicyId='chromium-153-native-pgf-arrows-v1';
export const arrowPolicyScope='Only the six fixed glyph-free arrow fixtures: legacy-defaults, meta-defaults, dimensions, transforms, curves-nodes and paint-boundaries. Original-driver SVG and ordinary-PDF agreement use independently calibrated native limits; exact pixels refer to the independently reconstructed native SVG presentation. Hosted execution remains unverified.';
const baselineCounts={numeric:[6,6],publicTraceParity:[6,6],sourceFrame:[6,6],primary:[72,9036],nativePrimary:[72,9036],
  'original-source/source/PDF':[48,6120],'original-source/source/exact-qualified-raster':[48,6024],
  'original-source/scene/PDF':[48,6216],'original-source/scene/exact-qualified-raster':[48,6072],
  'public-source/source/PDF':[48,6120],'public-source/source/exact-qualified-raster':[48,6024],
  'public-source/scene/PDF':[48,6216],'public-source/scene/exact-qualified-raster':[48,6072]};
export const arrowGateCounts={...baselineCounts,primaryControls:[306,306],pdfControls:[396,792],independentCurrentEvidence:[1,40]};
const baselineFields=['primaryRegions','pdfRegions','momentRegions','exactRegions','fullPages','panels','recapturedPrimaryImages','recapturedPdfImages'];
const pdfFields=['views','measurements','moments','fullPages','images','deltas','panels','focusPanels'];
const entries=['arrow-admission-policy.mjs','prepare-arrow-admission.mjs','compare-arrow-conformance.mjs','check-arrow-conformance.mjs',
  'arrow-admission-reader.mjs','arrow-admission-owned-child.mjs','arrow-admission-agent.mjs','arrow-admission-self-test.mjs',
  'arrow-current-image-cache-self-test.mjs','prepare-arrow-current-image-cache.mjs'];
const digest=value=>sha256(JSON.stringify(value));

export async function arrowAdmissionSources(e){
  const sources=new Map();
  for(const file of e.sourcePolicy.currentGuards){const bytes=arrowCanonical(await readFile(path.join(root,file)));sources.set(file,{bytes,sha256:sha256(bytes)});}
  const queue=[...e.model.sources.keys(),...entries.map(file=>'tools/TikzVisual/'+file)];
  for(let i=0;i<queue.length;i++){
    const file=queue[i];if(file===arrowProfilePinFile||sources.has(file))continue;
    arrowCachePath(file);assert.ok(e.model.sources.has(file)||/^tools\/TikzVisual\/[a-z0-9.-]+\.mjs$/.test(file));
    const bytes=arrowCanonical(await readFile(path.join(root,file)));sources.set(file,{bytes,sha256:sha256(bytes)});
    if(file.endsWith('.mjs'))for(const m of bytes.toString().matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g))queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(file),m[1])));
  }
  return new Map([...sources].sort(([a],[b])=>a<b?-1:a>b?1:0));
}
export function makeArrowProfile(e,guardToolHashes){
  const native=e.publicCache.native;
  const inputHashes=Object.fromEntries(Object.entries(e.model.baseline.numeric.inputs).filter(([file])=>{
    if(!file.startsWith('tools/TikzVisual/'))return true;
    assert.ok(Object.hasOwn(guardToolHashes,file),'Missing current input tool guard: '+file);return false;
  }));
  return{schemaVersion:1,id:arrowPolicyId,scope:arrowPolicyScope,approvedImagePolicy:true,
    qualification:{file:arrowCurrentImageCacheFile,sha256:arrowCurrentImageCacheSha256,decodedSha256:arrowCurrentImageCacheDecodedSha256,
      commit:e.header.qualification.commit,tree:e.header.qualification.tree,proofHashes:Object.fromEntries(Object.entries(arrowCurrentImageProofs).map(([k,p])=>[k,p.sha256]))},
    renderer:e.model.report.renderer,nativeBindingsSha256:digest(arrowPublicMeetBindings(native)),
    requiredGates:Object.keys(arrowGateCounts),gateCounts:arrowGateCounts,numericCounts:[1084,2350,2060,1998,2304,2266],numericChecks:12062,
    requiredViews:{primary:arrowPublicPrimaryPlan(),pdf:arrowPublicPdfPlan(),primaryControls:arrowPublicPrimaryControlPlan(),pdfControls:arrowPublicPdfControlPlan()},
    nativePageRawLimit:0,counts:{cases:6,primaryBaselines:144,pdfBaselines:96,qualifiedNativePageChecks:192,primaryControls:306,pdfControls:396,pdfControlCaptures:792,focusSelections:520},
    nativeCases:native.frames.map(f=>({caseId:f.caseId,sourceEnvelopeSha256:digest(f.sourceEnvelope),primaryCameraSha256:digest(f.camera),
      pdfCameraSha256:digest(f.paper.camera),pdfRegionsSha256:digest(f.paper.regions)})),
    claims:{primary:'calibrated-unchanged-original-driver',pdf:'separate-calibrated-original-driver-and-native',nativePage:'exact-independent-native-SVG-presentation',hostedExecution:'unverified'},
    sensitivity:{primarySha256:digest(e.model.report.primarySummary),pdfSha256:digest(e.model.report.pdfSummary),focusSha256:digest(e.model.pdf.focus)},
    independent:{baseline:[17928,24000,24000,24192,384,2136,1368,1248],primary:{views:306,measurements:39528,images:3057,deltas:210},
      pdf:[396,100908,100908,792,7228,568,4356,2080],controlNames:e.reports.reader.controls.map(c=>c.name)},
    inputHashes,guardToolHashes};
}
export async function validateArrowProfile(profile,e){
  const sources=await arrowAdmissionSources(e);assertNativeEqual(Object.keys(profile.guardToolHashes),[...sources.keys()]);
  assert.ok(!Object.keys(profile.guardToolHashes).some(file=>file.startsWith('src/Lokad.TikZ/')));
  for(const h of Object.values(profile.guardToolHashes))assert.match(h,/^[a-f0-9]{64}$/);
  assertNativeEqual(profile,makeArrowProfile(e,profile.guardToolHashes),'Changed fixed arrow profile.');
}
export async function verifyArrowGuards(e,read=readFile){
  for(const[file,hash]of Object.entries(e.profile.guardToolHashes))assert.equal(sha256(arrowCanonical(await read(path.join(root,file)))),hash,'Changed arrow admission source: '+file);
  for(const[file,hash]of Object.entries(e.profile.inputHashes)){
    const current=await read(path.join(root,file)),captured=e.model.baseline.read('numeric/input-captures/'+file);
    assert.equal(sha256(captured),hash);assert.ok(current.equals(captured)||captured.equals(arrowCanonical(captured))&&arrowCanonical(current).equals(captured),'Changed arrow admission fixture: '+file);
  }
}
export function decodeArrowProfile(bytes){
  assert.ok(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=1000000);assert.equal(sha256(bytes),arrowProfileSha256,'Unreviewed arrow profile.');return JSON.parse(bytes);
}
export async function loadArrowPolicy(read=readFile){
  const e=await loadArrowCurrentImageCache(read),profileBytes=arrowCanonical(await read(path.join(root,arrowProfileFile))),profile=decodeArrowProfile(profileBytes);
  await validateArrowProfile(profile,e);Object.assign(e,{profile,profileBytes,profileSha256:sha256(profileBytes)});await verifyArrowGuards(e,read);
  const acceptancePinBytes=arrowCanonical(await read(path.join(root,arrowProfilePinFile)));
  assert.ok(acceptancePinBytes.toString().includes("export const arrowProfileSha256='"+arrowProfileSha256+"';"));
  return{...e,acceptancePinBytes,acceptancePinSha256:sha256(acceptancePinBytes)};
}
export async function validateArrowCheckedTrial(e,b,checker,readChecker,trialSha256,mode='current-candidate'){
  assert.ok(['current-candidate','historical-qualification'].includes(mode));
  if(mode==='historical-qualification'){
    assert.equal(trialSha256,arrowCurrentImageProofs.producer.sha256);assertNativeEqual(b.report,e.model.report);assertNativeEqual(checker,e.reports.reader);
  }
  const p=e.profile,c=checker;assert.match(trialSha256,/^[a-f0-9]{64}$/);
  assertNativeEqual(Object.keys(c).sort(),['schemaVersion','comparisonKind','completed','phase','inputReport','inputReportSha256','converterInvoked','nativeToolInvoked','approvedImagePolicy','imageConformanceClaim','imageAdmission','renderer','sourceHashes','numericBuildIdentity','baseline','primary','pdf','controls','artifacts'].sort());
  assertNativeEqual([c.schemaVersion,c.comparisonKind,c.completed,c.phase,c.converterInvoked,c.nativeToolInvoked,c.approvedImagePolicy,c.imageConformanceClaim,c.imageAdmission],
    [1,'independent-current-public-arrow-combined-check',true,'complete',true,false,false,false,'pending']);
  assert.equal(c.inputReportSha256,trialSha256);assert.match(c.inputReport,/^artifacts\/arrow-current-trials\/run-[a-f0-9-]+\/report\.json$/);
  requireRenderer(c.renderer, p.renderer);requireRenderer(b.report.renderer, p.renderer);assertNativeEqual(c.sourceHashes,b.report.sourceHashes);
  if(mode!=='historical-qualification')for(const[file,hash]of Object.entries(c.sourceHashes))assert.equal(hash,p.guardToolHashes[file]);
  assertNativeEqual(baselineFields.map(k=>c.baseline[k]),p.independent.baseline);assertNativeEqual(c.baseline.combined,b.baseline.combined);
  assertNativeEqual(c.primary,p.independent.primary);assertNativeEqual(pdfFields.map(k=>c.pdf[k]),p.independent.pdf);
  assertNativeEqual(c.pdf.summary,b.report.pdfSummary);
  assert.equal(digest(b.report.primarySummary),p.sensitivity.primarySha256);assert.equal(digest(b.report.pdfSummary),p.sensitivity.pdfSha256);assert.equal(digest(b.pdf.focus),p.sensitivity.focusSha256);
  assertNativeEqual(c.controls.map(r=>r.name),p.independent.controlNames);assert.ok(c.controls.every(r=>r.passed===true));
  for(const r of c.controls)if(r.name!=='different assembly provenance with identical current evidence')assert.ok(typeof r.rejection==='string'&&r.rejection.length<=500);
  const moments=c.controls.filter(r=>Object.hasOwn(r,'axis'));assertNativeEqual(moments.map(r=>[r.axis,r.structurallyAccepted,r.unchangedMassAndCoverage,r.rejection]),
    [['mass',true,false,'Changed decoded PDF RGB mass.'],['x',true,true,'Changed decoded PDF RGB moments.'],['y',true,true,'Changed decoded PDF RGB moments.']]);
  const expected={'numeric-command.log':c.artifacts['numeric-command.log']};assert.match(expected['numeric-command.log'],/^[a-f0-9]{64}$/);
  for(const[file,hash]of Object.entries(c.sourceHashes))expected['source-captures/'+file]=hash;
  const n=JSON.parse(await readChecker('numeric/report.json'));
  if(mode==='historical-qualification')await verifyArrowPublicHistoricalNumeric(n,file=>readChecker('numeric/'+file));
  else await validateArrowPublicNumeric(n,file=>readChecker('numeric/'+file));
  assertNativeEqual([n.completed,n.passed,n.phase,n.converterInvoked,n.numericConformanceClaim,n.checks],[true,true,'complete',true,true,12062]);
  assertNativeEqual(n.cases.map(r=>r.checks),p.numericCounts);assert.ok(n.cases.every(r=>r.passed&&r.publicTraceParity));
  assertNativeEqual(arrowCurrentNumericParity(b.baseline.numeric,n),c.numericBuildIdentity);
  expected['numeric/report.json']=sha256(await readChecker('numeric/report.json'));
  for(const[file,hash]of Object.entries(n.artifacts))expected['numeric/'+file]=hash;
  assertNativeEqual(c.artifacts,expected,'Missing or extra independent arrow artifact.');
  for(const[file,hash]of Object.entries(expected)){arrowCachePath(file);assert.equal(sha256(await readChecker(file)),hash,'Changed independent arrow artifact: '+file);}
  const gates=structuredClone(b.baseline.combined.gates);
  for(const key of Object.keys(baselineCounts))assertNativeEqual([gates[key].observations,gates[key].executedChecks],baselineCounts[key]);
  assertNativeEqual(Object.keys(gates),Object.keys(baselineCounts));
  for(const key of ['primaryControls','pdfControls','independentCurrentEvidence']){
    const counts=arrowGateCounts[key];gates[key]={state:'passed',observations:counts[0],executedChecks:counts[1]};
  }
  return{passed:Object.values(gates).every(g=>g.state==='passed'),gates};
}
export function finishArrowAdmission(e,combined){
  assert.equal(e.profile.approvedImagePolicy,true);assertNativeEqual(Object.keys(combined.gates),e.profile.requiredGates);
  for(const[key,counts]of Object.entries(e.profile.gateCounts)){
    const gate=combined.gates[key];assertNativeEqual(Object.keys(gate).sort(),['state','observations','executedChecks'].sort());
    assertNativeEqual([gate.observations,gate.executedChecks],counts);assert.ok(['passed','failed'].includes(gate.state));
  }
  const firstFailedGate=e.profile.requiredGates.find(k=>combined.gates[k].state!=='passed')??null,passed=firstFailedGate===null;assert.equal(combined.passed,passed);
  return{passed,verdict:passed?'pass':'fail',firstFailedGate,gates:combined.gates,approvedImagePolicy:true,imageConformanceClaim:passed,overallVerdict:passed?'pass':'fail'};
}
