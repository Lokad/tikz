// Coverage and source ownership for the native-only research harness.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root,sha256} from './shape-oracle-bundle.mjs';
import {arrowNativeRepresentations,arrowNativeRoots,makeArrowNativeSvg} from './arrow-native-svg.mjs';
import {edgeOraclePdfRegions} from './edge-oracle-pdf.mjs';

export const arrowPrimaryFrames=['natural','expanded'],arrowScales=[1,4],arrowBackgrounds=['transparent','white','black'];
export const arrowPdfRoutes=['original-driver',...arrowNativeRepresentations.map(v=>v.name)];
export const arrowMetricFields=['exactRgbaMatch','rawChangedPixels','maxRawChannelError','premultipliedChangedPixels',
 'maxPremultipliedChannelError','foregroundPixels','referenceForegroundPixels','actualForegroundPixels','meanForegroundChannelError','topology'];
export const arrowMetrics=r=>Object.fromEntries(arrowMetricFields.map(k=>{assert.ok(Object.hasOwn(r,k),'Missing saved metric: '+k);return[k,r[k]];}));
export const arrowCanonical=b=>Buffer.from(b.toString('utf8').replace(/\r\n/g,'\n'));

export function arrowPrimaryPlan(ids){
 return ids.flatMap(caseId=>arrowNativeRepresentations.flatMap(v=>arrowNativeRoots.flatMap(rootMode=>arrowPrimaryFrames.flatMap(frame=>arrowScales.flatMap(scale=>arrowBackgrounds.map(background=>
  ({id:caseId+'/'+v.name+'/'+rootMode+'/'+frame+'/'+scale+'x-'+background,caseId,variant:v.name,rootMode,frame,scale,background})))))));
}
export function arrowPdfPlan(ids){return ids.flatMap(caseId=>arrowPdfRoutes.flatMap(route=>arrowPrimaryFrames.flatMap(frame=>arrowScales.map(scale=>
 ({id:caseId+'/pdf/'+route+'/'+frame+'/'+scale+'x',caseId,route,frame,scale,background:'white',rootMode:route==='original-driver'?'original':'ink'})))));}
export function arrowPdfRegions(metrics,frame){
 const rasterSizes=Object.fromEntries(arrowScales.map(s=>[s+'x',metrics.pdfCamera.rasterSizes[s].size]));
 return edgeOraclePdfRegions({...metrics,pdfCamera:{...metrics.pdfCamera,rasterSizes}},frame);
}
const coordinateKeys=['x','y','width','height'];
export function makeArrowNativeAgent(observations,frames){
 const rankedRegions=observations.flatMap(o=>o.crops.map(c=>{
  const frame=frames.find(f=>f.caseId===o.caseId),record=frame.records.find(r=>r.id===c.id),region=o.regions.find(r=>r.id===c.id);assert.ok(record&&region);
  const matching=observations.find(p=>p.caseId===o.caseId&&p.variant===o.variant&&p.rootMode===o.rootMode&&p.frame===o.frame&&p.background===o.background&&p.scale!==o.scale);
  const matchingCrop=matching?.crops.find(p=>p.id===c.id);assert.ok(matchingCrop);
  return{caseId:o.caseId,regionId:c.id,scale:o.scale,frame:o.frame,referenceRoute:'original-native-SVG',actualRoute:'reconstructed-native-'+o.variant,
   metrics:arrowMetrics(region),images:c.images,presentation:c.presentation,matchingScale:{scale:matching.scale,images:matchingCrop.images,presentation:matchingCrop.presentation},
   attribution:{confidence:'native-physical-paint-and-placement',inputId:record.inputId,nativePaintOrdinal:record.nativePaintOrdinal,nativePathId:record.nativePathId,
    nativeEventId:record.nativeEventId,nativePlacementId:record.nativePlacementId,source:'source-captures/tests/Reference/Arrows/'+o.caseId+'/source.tikz',
    nativeTrace:'reference/'+o.caseId+'/metrics.json',frame: o.caseId+'/frame.json',candidateSourceSpan:null}};
 })).sort((a,b)=>b.metrics.rawChangedPixels-a.metrics.rawChangedPixels||b.metrics.maxRawChannelError-a.metrics.maxRawChannelError||a.caseId.localeCompare(b.caseId)||a.regionId.localeCompare(b.regionId)||a.scale-b.scale);
 return{viewer:'index.html',firstRequiredFailure:null,pendingGates:['independent-primary-calibration','independent-PDF-calibration','image-only-defect-sensitivity','owned-combined-public-admission'],
  rerun:['node tools/TikzVisual/arrow-native-self-test.mjs','node tools/TikzVisual/inspect-arrow-native.mjs'],
  rankedRegions,interpretation:'Native reconstruction evidence only. Every tip has paired 1x/4x crops. No converter, pixel limit or image-conformance admission.'};
}
const checkMetrics=r=>{
 const m=arrowMetrics(r);for(const[k,v]of Object.entries(m))if(!['topology','exactRgbaMatch'].includes(k))assert.ok(Number.isFinite(v)&&v>=0,'Invalid metric: '+k);
 assert.equal(typeof m.exactRgbaMatch,'boolean');assert.equal(m.exactRgbaMatch,m.rawChangedPixels===0);
 assert.ok(m.maxRawChannelError<=255&&m.maxPremultipliedChannelError<=255&&m.meanForegroundChannelError<=255);
 assert.equal(m.topology.threshold,16);assert.equal(m.topology.connectivity,8);assert.equal(m.topology.edgeNeighborhood,4);
};
const closeFrame=(actual,expected)=>{assert.deepEqual(Object.keys(actual),coordinateKeys);for(const k of coordinateKeys)assert.ok(Math.abs(actual[k]-expected[k])<=2e-10,'Changed declared native frame: '+k);};
export function validateArrowNativeCoverage(report,evidence,frames){
 assert.deepEqual([report.schemaVersion,report.completed,report.comparisonKind,report.converterInvoked,report.approvedImagePolicy,report.imageConformanceClaim,report.overallVerdict],
  [1,true,'native-only-arrow-framing-and-reconstruction',false,false,false,'pending-image-calibration']);
 assert.equal(report.snapshotSha256,evidence.snapshotSha256);const ids=evidence.cases.map(c=>c.id);
 assert.deepEqual(report.frames.map(f=>f.caseId),ids);assert.deepEqual(report.frames,frames);
 const primaryPlan=arrowPrimaryPlan(ids),pdfPlan=arrowPdfPlan(ids);
 assert.deepEqual(report.observations.map(o=>Object.fromEntries(Object.keys(primaryPlan[0]).map(k=>[k,o[k]]))),primaryPlan,'Primary view coverage changed.');
 assert.deepEqual(report.pdfObservations.map(o=>Object.fromEntries(Object.keys(pdfPlan[0]).map(k=>[k,o[k]]))),pdfPlan,'PDF view coverage changed.');
 const expectedDerivations=ids.flatMap(caseId=>arrowNativeRepresentations.flatMap(v=>arrowNativeRoots.map(rootMode=>({id:caseId+'/'+v.name+'/'+rootMode,caseId,variant:v.name,rootMode}))));
 assert.deepEqual(report.derivations.map(d=>Object.fromEntries(Object.keys(expectedDerivations[0]).map(k=>[k,d[k]]))),expectedDerivations);
 const requiredArtifacts=new Set(['index.html','reference/snapshot.json',...Object.keys(report.sourceHashes).map(p=>'source-captures/'+p),
  ...[...evidence.artifacts.keys()].map(p=>'reference/'+p),...ids.flatMap(id=>[id+'/frame.json',id+'/browser-boxes.json']),
  ...expectedDerivations.flatMap(d=>[d.id+'/native.svg',d.id+'/instructions.json'])]);
 assert.deepEqual(report.agent,makeArrowNativeAgent(report.observations,frames),'Agent projection changed.');
 assert.deepEqual(report.browserChecks.map(b=>b.caseId),ids);
 for(const row of report.browserChecks){const frame=frames.find(f=>f.caseId===row.caseId);assert.equal(row.checks.length,frame.browserInputs.length);
  for(const [i,c]of row.checks.entries()){const wanted=frame.browserInputs[i];assert.equal(c.id,wanted.id);assert.deepEqual(c.expected,wanted.expected);assert.equal(c.limit,wanted.limit);assert.equal(c.emptyGeometry,wanted.emptyGeometry??false);
   assert.equal(c.passed,true);assert.ok(Object.keys(c.actual).every(k=>Math.abs(c.actual[k]-wanted.expected[k])<=wanted.limit));}}
 for(const observation of report.observations){
  const f=frames.find(f=>f.caseId===observation.caseId),regions=[{id:'whole-picture',rectangle:{x:0,y:0,width:f.camera.width,height:f.camera.height}},...f.regions];
  const native=evidence.cases.find(c=>c.id===observation.caseId),variant=arrowNativeRepresentations.find(v=>v.name===observation.variant),view=makeArrowNativeSvg(native.metrics,f,variant,observation.rootMode).instructions.viewBox;
  closeFrame(observation.naturalFrames.reference,{x:f.driverRoot.minX,y:f.driverRoot.minY,width:f.driverRoot.maxX-f.driverRoot.minX,height:f.driverRoot.maxY-f.driverRoot.minY});
  closeFrame(observation.naturalFrames.actual,{x:view[0],y:view[1],width:view[2],height:view[3]});
  assert.deepEqual(observation.regions.map(r=>({id:r.id,rectangle:r.rectangle})),regions.map(r=>({id:r.id,rectangle:r.rectangle})), 'Primary region coverage changed.');
  assert.equal(observation.repeat.rawChangedPixels,0);assert.equal(observation.actualRepeat.rawChangedPixels,0);checkMetrics(observation.metrics);
  for(const r of observation.regions)checkMetrics(r);
  for(const key of['reference','actual','difference','alpha-difference','amplified','overlay'])assert.equal(observation.images[key],observation.id+'-'+key+'.png');
  if(observation.background==='white'&&observation.scale===1)assert.equal(observation.images.comparison,observation.id+'-comparison.png');
  assert.deepEqual(Object.keys(observation.images),['reference','actual','difference','alpha-difference','amplified','overlay',...(observation.background==='white'&&observation.scale===1?['comparison']:[])]);
  for(const file of Object.values(observation.images))requiredArtifacts.add(file);
  const eligible=observation.frame==='expanded'&&observation.rootMode==='ink'&&observation.variant==='pt-short'&&observation.background==='white';
  assert.equal(observation.crops.length,eligible?f.counts.placements:0,'All native tip placements must have paired crops.');
  if(eligible)assert.deepEqual(new Set(observation.crops.map(c=>c.id)),new Set(f.records.filter(r=>r.role==='tip').map(r=>r.id)));
  for(const crop of observation.crops){
   const r=regions.find(r=>r.id===crop.id);assert.ok(r);
   assert.deepEqual(crop.presentation,{background:'white',integerEnlargement:observation.scale===1?4:1,rawDifferenceAmplification:16,
    rasterRectangle:Object.fromEntries(coordinateKeys.map(k=>[k,r.rectangle[k]*observation.scale]))});
   for(const key of['reference','actual','difference','amplified','sheet'])assert.equal(crop.images[key],observation.id+'/crops/'+crop.id+'-'+key+'.png');
   assert.deepEqual(Object.keys(crop.images),['reference','actual','difference','amplified','sheet']);for(const file of Object.values(crop.images))requiredArtifacts.add(file);
  }
 }
 for(const observation of report.pdfObservations){
  const native=evidence.cases.find(c=>c.id===observation.caseId),f=frames.find(f=>f.caseId===observation.caseId),expected=arrowPdfRegions(native.metrics,f);
  const sourceFrame=observation.route==='original-driver'?{x:f.driverRoot.minX,y:f.driverRoot.minY,width:f.driverRoot.maxX-f.driverRoot.minX,height:f.driverRoot.maxY-f.driverRoot.minY}:
   (()=>{const view=makeArrowNativeSvg(native.metrics,f,arrowNativeRepresentations.find(v=>v.name===observation.route),'ink').instructions.viewBox;return{x:view[0],y:view[1],width:view[2],height:view[3]};})();
  closeFrame(observation.sourceFrame,sourceFrame);closeFrame(observation.clipFrame,observation.frame==='natural'?sourceFrame:expected.regions[0].rectangle);
  assert.equal(observation.whole.id,'whole-picture');assert.deepEqual(observation.pageSize,native.metrics.pdfCamera.rasterSizes[observation.scale].size);
  assert.equal(observation.pdfPage,'reference/'+observation.caseId+'/plain-pdf-page-'+observation.scale+'x.png');
  assert.deepEqual(observation.camera,expected.camera);assert.deepEqual(observation.regions.map(r=>({id:r.id,rectangle:r.rectangle,rasterRectangles:r.rasterRectangles})),
   expected.regions.slice(1).map(r=>({id:r.id,rectangle:r.rectangle,rasterRectangles:r.rasterRectangles})));assert.deepEqual(observation.whole.rectangle,expected.regions[0].rectangle);
  assert.deepEqual(observation.whole.rasterRectangles,expected.regions[0].rasterRectangles);assert.equal(observation.outsideWholeChangedPixels,0);
  assert.equal(observation.repeat.pdf.rawChangedPixels,0);assert.equal(observation.repeat.svg.rawChangedPixels,0);checkMetrics(observation.whole);
  for(const r of observation.regions)checkMetrics(r);
  for(const key of['svg-page','pdf','svg','difference','amplified','overlay'])assert.equal(observation.images[key],observation.id+'-'+key+'.png');
  assert.deepEqual(Object.keys(observation.images),['svg-page','pdf','svg','difference','amplified','overlay',...(observation.scale===1?['sheet']:[])]);
  if(observation.scale===1)assert.equal(observation.images.sheet,observation.id+'-sheet.png');for(const file of Object.values(observation.images))requiredArtifacts.add(file);
  assert.equal(observation.crops.length,0);assert.equal(observation.background,'white');
 }
 assert.deepEqual(new Set(Object.keys(report.artifacts)),requiredArtifacts,'Artifact manifest coverage changed.');
 for(const hash of Object.values(report.artifacts))assert.match(hash,/^[a-f0-9]{64}$/);
 return{primaryViews:primaryPlan.length,pdfViews:pdfPlan.length,derivations:expectedDerivations.length,regions:frames.reduce((n,f)=>n+f.regions.length,0),
  paints:frames.reduce((n,f)=>n+f.records.length,0),placements:frames.reduce((n,f)=>n+f.counts.placements,0),
  pairedTipCrops:report.observations.reduce((n,o)=>n+o.crops.length,0)};
}

// Discover transitive relative JS imports without executing producer/checker entry points.
// Extra files are runtime-loaded profiles and the exact development dependency lock.
export async function arrowNativeSourceClosure(){
 const queue=['arrow-native-frame.mjs','arrow-native-svg.mjs','arrow-native-contract.mjs','arrow-native-self-test.mjs',
  'inspect-arrow-native.mjs','check-arrow-native.mjs','arrow-native-panels.mjs'].map(p=>'tools/TikzVisual/'+p),seen=new Map();
 for(let index=0;index<queue.length;index++){
  const file=queue[index];if(seen.has(file))continue;assert.match(file,/^tools\/TikzVisual\/[a-z0-9.-]+\.mjs$/);
  const bytes=arrowCanonical(await readFile(path.join(root,file)));seen.set(file,{bytes,sha256:sha256(bytes)});
  for(const m of bytes.toString().matchAll(/\bfrom\s+['"]([^'"]+)['"]/g))if(m[1].startsWith('.')){
   const dependency=path.posix.normalize(path.posix.join(path.posix.dirname(file),m[1]));assert.match(dependency,/^tools\/TikzVisual\/[a-z0-9.-]+\.mjs$/);queue.push(dependency);
  }
 }
 for(const file of['browser-profile.json','text-profile.json','node-profile.json','package.json','package-lock.json'].map(p=>'tools/TikzVisual/'+p)){
  const bytes=arrowCanonical(await readFile(path.join(root,file)));seen.set(file,{bytes,sha256:sha256(bytes)});
 }
 return new Map([...seen].sort(([a],[b])=>a.localeCompare(b)));
}
