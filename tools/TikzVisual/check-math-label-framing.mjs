// Saved-image checking reuses owned artifacts, PNG decoding and metric math.
// Exact residuals are diagnostic; this module does not admit a math policy.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {loadCalcSavedReport,calcEqual,calcHash} from './calc-saved-images.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {unionBounds,containment} from './shape-frame-math.mjs';
import {mathFramingFamily} from './math-label-framing.mjs';
import {bindMathNativePaths} from './math-label-native-paths.mjs';
import {diagramNativeNaturalRoot} from './diagram-native-root.mjs';
import {nativeEdgeSegments} from './edge-oracle.mjs';
import {arrowWorldMatrix} from './arrow-native-frame.mjs';
import {transformSegments,pathBounds} from './shape-frame-math.mjs';

const keys=['minX','minY','maxX','maxY'],compare=createShapeRasterMetrics().compare;
export function mathPathBoundContract(frame,scene){
 assert.ok(frame.nativePaths,'Conservative bounds require observed integer paths.');
 const checks=[],paths=scene.paths.filter(p=>p.semanticId.startsWith('path-')),upper=[];
 const number=(name,expected,actual,limit,source)=>checks.push({name,expected,actual,limit,source,passed:Number.isFinite(actual)&&Math.abs(actual-expected)<=limit});
 const within=(name,inner,outer,limit,source)=>{
  for(const k of keys){const slack=k.startsWith('min')?inner?.[k]-outer?.[k]:outer?.[k]-inner?.[k];
   checks.push({name:name+'.'+k,slack,limit,source,passed:Number.isFinite(slack)&&slack>=-limit});}
 };
 number('path-bound-count',frame.nativePaths.records.length,paths.length,0,null);
 for(const [i,record]of frame.nativePaths.records.entries()){
  const paint=frame.nativePaths.metrics.driverState.paints[i],actual=paths[i],source=actual?.source??null;
  const placement=paint.placementId===null?null:frame.nativePaths.metrics.placements[paint.placementId-1];
  const scale=placement?Math.hypot(...placement.matrix.slice(0,2)):1;
  const radius=paint.operation==='fill'?0:paint.widthSp*96/(72.27*65536)*scale/2;
  // A pen point cannot exceed the cap reach or the declared miter limit.
  // A single straight edge has no joins; retain its tighter circular envelope.
  const joined=record.segments.filter(s=>s.kind!=='move').length>1;
  const reach=radius*Math.max(paint.cap===2?Math.SQRT2:1,joined&&paint.join===0?paint.miter:1);
  const bound={minX:record.geometry.minX-reach,minY:record.geometry.minY-reach,maxX:record.geometry.maxX+reach,maxY:record.geometry.maxY+reach};
  const limit=64*Number.EPSILON*Math.max(1,...Object.values(bound).map(Math.abs));
  const nativePath=frame.nativePaths.metrics.paths[record.pathId-1];
  const local=pathBounds(transformSegments(nativeEdgeSegments(nativePath),arrowWorldMatrix(null)));
  keys.forEach(k=>number(record.id+'.local-geometry.'+k,local[k],actual?.geometryBounds?.[k]??NaN,limit,source));
  // The trace stores affine coefficients in native bp/y-up coordinates;
  // geometryBounds/inkBounds alone are converted to CSS/y-down.
  const transform=scene.pathTransforms?.[i],expected=placement?[...placement.matrix,
   placement.xSp*96/(72.27*65536),placement.ySp*96/(72.27*65536)]:[1,0,0,1,0,0];
  ['a','b','c','d','e','f'].forEach((k,j)=>number(record.id+'.transform.'+k,expected[j],transform?.[k]*(j<4?1:4/3),limit,source));
  number(record.id+'.pen',paint.widthSp*72/(72.27*65536),actual?.paint?.width??NaN,limit,source);
  within(record.id+'.native-ink-contained',record.ink,actual?.inkBounds,limit,source);
  within(record.id+'.bounded-metadata',actual?.inkBounds,bound,limit,source);
  upper.push(bound);
 }
 const globalUpper=unionBounds([...upper,...frame.records.filter(r=>r.kind!=='path').map(r=>r.ink)]);
 const limit=64*Number.EPSILON*Math.max(1,...Object.values(globalUpper).map(Math.abs));
 within('global.native-ink-contained',frame.ink,scene.inkBounds,limit,null);
 within('global.bounded-metadata',scene.inkBounds,globalUpper,limit,null);
 return JSON.parse(JSON.stringify({passed:checks.every(c=>c.passed),checks,
  contract:'Conservative metadata must contain native painted ink and remain inside the native geometric box plus cap/miter-limited pen reach. Integer geometry and pens remain independently checked. A 64-operation binary64 allowance is derived from native magnitude; no converter-fitted padding.'}));
}
export function mathFramingNumeric(frame,scene,svg,measurements){
 const checks=[],regions=[];
 const number=(name,expected,actual,source=null,limit=0)=>checks.push({name,expected,actual,source,delta:actual-expected,limit,passed:Number.isFinite(actual)&&Math.abs(actual-expected)<=limit});
 const bounds=(name,e,a,source=null)=>keys.forEach(k=>number(name+'.'+k,e[k],a?.[k]??NaN,source));
 bounds('picture',frame.picture,scene.pictureBounds);bounds('ink',frame.ink,scene.inkBounds);
 const sp=96/(72.27*65536);
 for(const k of keys)number('picture-integer-sp.'+k,Math.round(frame.picture[k]/sp),Math.round(scene.pictureBounds[k]/sp));
 const view=/\bviewBox="([^"]+)"/.exec(svg)?.[1].split(/[ ,]+/).map(Number);assert.equal(view?.length,4);
 const expectedView=[frame.root.minX,frame.root.minY,frame.root.maxX-frame.root.minX,frame.root.maxY-frame.root.minY];
 ['x','y','width','height'].forEach((k,i)=>number('root.'+k,expectedView[i],view[i],null,.0000005));
 number('node-count',frame.labels.length,scene.nodes.length);
 const paths=scene.paths.filter(p=>p.semanticId.startsWith('path-')),nativePaths=frame.records.filter(r=>r.kind==='path');
 number('path-count',nativePaths.length,paths.length);
 for(const [i,record] of nativePaths.entries()){
  const actual=paths[i];bounds(record.id+'.ink',record.ink,actual?.inkBounds,actual?.source);
  regions.push({id:record.id,source:actual?.source,svgElementId:actual?.svgElementId??null});
 }
 for(const [nodeId,label] of frame.labels.entries()){
  const node=scene.nodes[nodeId],native=measurements.nodes[nodeId];
  assert.equal(label.nodeId,native.name);
  if(!label.nodeId.startsWith('diagram-label-'))checks.push({name:label.id+'.identity',expected:label.nodeId,actual:node?.name,source:node?.source,passed:node?.name===label.nodeId});
  for(const k of ['widthSp','heightSp','depthSp'])number(label.id+'.'+k,native[k],node?.text[k]??NaN,node?.source);
  const glyphs=scene.glyphs.filter(g=>g.nodeId===nodeId),rules=scene.rules.filter(r=>r.nodeId===nodeId);
  const expected=frame.records.filter(r=>r.nodeId===label.nodeId);
  number(label.id+'.glyph-count',expected.filter(r=>r.kind==='glyph').length,glyphs.length,node?.source);
  number(label.id+'.rule-count',expected.filter(r=>r.kind==='rule').length,rules.length,node?.source);
  regions.push({id:label.id,nodeId:label.nodeId,source:node?.source,svgElementId:'candidate-n'+nodeId});
  for(const record of expected){
   const a=record.kind==='glyph'?glyphs[record.index]:rules[record.index];
   bounds(record.id+'.ink',record.ink,a?.inkBounds,a?.source??node?.source);
   regions.push({id:record.id,nodeId:label.nodeId,source:a?.source??node?.source,svgElementId:a?.svgElementId??null});
  }
 }
 const boundsContract=frame.nativePaths?mathPathBoundContract(frame,scene):null;
 return{schemaVersion:1,passed:checks.every(c=>c.passed),checks,regions,...(boundsContract?{boundsContract}:{}),
  contract:'Raw framing/mark-box differences retained. Zero numeric allowance except six-decimal public root serialization. No image admission.'};
}

function attribution(reference,native,candidate,width,rectangle){
 const r=rectangle??{x:0,y:0,width,height:reference.length/(4*width)};
 let shared=0,nativeOnly=0,candidateOnly=0,same=0;
 for(let y=r.y;y<r.y+r.height;y++)for(let x=r.x;x<r.x+r.width;x++){
  const i=(y*width+x)*4;let n=false,c=false,equal=true;
  for(let k=0;k<4;k++){n||=reference[i+k]!==native[i+k];c||=reference[i+k]!==candidate[i+k];equal&&=native[i+k]===candidate[i+k];}
  if(n&&c){shared++;same+=equal;}else if(n)nativeOnly++;else if(c)candidateOnly++;
 }
 return{sharedChangedPixels:shared,nativeOnlyChangedPixels:nativeOnly,candidateOnlyChangedPixels:candidateOnly,identicalChangedPixels:same};
}
export function validateMathInspectionFrame(frame,c,measurements,supplement,pathSupplement=null){
 assert.equal(frame.caseId,c.id);assert.equal(frame.converterInvoked,false);
 const sp=96/(72.27*65536),b=supplement.pictureBounds;
 calcEqual(frame.picture,{minX:b.minXSp*sp,minY:-b.maxYSp*sp,maxX:b.maxXSp*sp,maxY:-b.minYSp*sp},'Picture frame has different native ownership.');
 calcEqual(frame.labels.map(l=>l.nodeId),measurements.nodes.map(n=>n.name),'Math label coverage differs.');
 calcEqual(frame.counts,{nodes:c.nodes,glyphs:c.glyphs,rules:c.rules,paths:c.paths,regions:c.nodes+c.glyphs+c.rules+c.paths},'Fixed math region counts differ.');
 assert.equal(frame.regions.length,frame.counts.regions);assert.equal(new Set(frame.regions.map(r=>r.id)).size,frame.regions.length);
 calcEqual(frame.records.map(r=>r.ordinal),frame.records.map((_,i)=>i),'Native paint order differs.');
 calcEqual(frame.ink,unionBounds(frame.records.map(r=>r.ink)),'Native ink union differs.');
 calcEqual(frame.root,unionBounds([frame.picture,frame.ink]),'Natural framing differs.');
 assert.equal(frame.pathPaintSha256,supplement.pathPaintSha256);
 assert.equal(calcHash(Buffer.from(JSON.stringify(frame.paintRecords.map(({geometry,stroke,...r})=>r)))),supplement.pathPaintSha256,'Native pen records differ.');
 if(frame.nativePaths){
  assert.ok(pathSupplement,'Native integer paths lack their owned supplement.');
  const rebuilt=bindMathNativePaths(pathSupplement,frame.paintRecords.map(p=>({...p,kind:'path'})),supplement);
  calcEqual(frame.nativePaths,rebuilt,'Native integer path binding differs.');
  for(const p of rebuilt.records){const record=frame.records.find(r=>r.id===p.id);assert.ok(record);
   calcEqual(record.geometry,p.geometry,'Native integer path geometry differs.');calcEqual(record.ink,p.ink,'Native integer path ink differs.');}
  calcEqual(frame.nativeRoot,diagramNativeNaturalRoot(rebuilt.metrics,frame.picture,frame.records.filter(r=>r.kind!=='path').map(r=>({id:r.id,nodeId:r.nodeId,bound:r.ink}))),'Native natural root derivation differs.');
 }
 const regionMap=new Map(frame.regions.map(r=>[r.id,r]));
 for(const record of frame.records){
  const region=regionMap.get(record.id);assert.ok(region);calcEqual(region.bound,record.ink,'Mark inspection region differs.');
  assert.equal(region.kind,record.kind);assert.equal(region.nodeId,record.nodeId??null);
  assert.equal(containment(record.ink,frame.root,1e-10).passed,true);
 }
 for(const label of frame.labels){
  const marks=frame.records.filter(r=>r.nodeId===label.nodeId);
  calcEqual(label.marks,marks.map(r=>r.id),'Math label owns different marks.');
  const anchors=measurements.anchors.filter(a=>a.name===label.nodeId);
  const bound=marks.length?unionBounds(marks.map(r=>r.ink)):unionBounds(anchors.map(a=>({minX:a.xSp*sp,minY:-a.ySp*sp,maxX:a.xSp*sp,maxY:-a.ySp*sp})));
  calcEqual(label.bound,bound,'Math label region has different native ownership.');
  const region=regionMap.get(label.id);assert.ok(region);assert.equal(region.nodeId,label.nodeId);
  calcEqual(region.bound,label.bound,'Label inspection region differs.');
 }
 for(const r of frame.regions){
  const expected={x:Math.floor(r.bound.minX-frame.camera.x-2),y:Math.floor(r.bound.minY-frame.camera.y-2)};
  expected.width=Math.ceil(r.bound.maxX-frame.camera.x+2)-expected.x;expected.height=Math.ceil(r.bound.maxY-frame.camera.y+2)-expected.y;
  calcEqual(r.rectangle,expected,'Fixed region camera registration differs.');
 }
 assert.equal(frame.browserChecks.length,frame.records.length);
 assert.ok(frame.browserChecks.every(r=>r.passed&&Object.keys(r.actual).every(k=>Math.abs(r.actual[k]-r.expected[k])<=r.limit)));
 return regionMap;
}
export async function checkMathFramingImages(file){
 const owned=await loadCalcSavedReport(file,'math-label-framing-image-iteration'),report=owned.report;
 assert.equal(report.nativeToolInvoked,false);assert.equal(report.converterInvoked,true);
 assert.equal(calcHash(owned.files.get('inputs/native-report.json')),report.nativeInputReportSha256);
 assert.equal(calcHash(owned.files.get('inputs/public-report.json')),report.publicInputReportSha256);
 const declaredCases=mathFramingFamily(report.cases.map(c=>c.id));
 let pairs=0,regionChecks=0,markBoxes=0,labels=0,nativeBoundsChecks=0,nativeRootChecks=0;const residuals=[];
 for(const [i,row] of report.cases.entries()){
  const c=declaredCases[i],frame=owned.json(c.id+'/frame.json');
  const regionMap=validateMathInspectionFrame(frame,c,owned.json('events/'+c.id+'/measurements.json'),owned.json(c.id+'/supplement.json'),owned.files.has(c.id+'/path-supplement.json')?owned.json(c.id+'/path-supplement.json'):null);
  calcEqual(row.counts,frame.counts,'Reported math region count differs.');
  assert.equal(frame.labels.length,c.nodes);labels+=c.nodes;markBoxes+=c.glyphs+c.rules;
  const numeric=mathFramingNumeric(frame,owned.json('public/'+c.id+'/actual-scene.json'),owned.files.get('public/'+c.id+'/actual.svg').toString(),owned.json('events/'+c.id+'/measurements.json'));
  calcEqual(numeric,owned.json(c.id+'/numeric.json'),'Saved public framing diagnostics differ.');assert.equal(numeric.passed,row.numericPassed);
  if(frame.nativePaths){
   assert.equal(numeric.boundsContract.passed,true,'Conservative math path bounds failed.');
   const roots=numeric.checks.filter(c=>c.name.startsWith('root.'));assert.equal(roots.length,4);assert.ok(roots.every(c=>c.passed),'Native natural root failed.');
   nativeBoundsChecks+=numeric.boundsContract.checks.length;nativeRootChecks+=roots.length;
  }
  assert.equal(row.views.length,8);
  const groups=new Map();
  for(const summary of row.views){
   const record=owned.json(summary.file),key=record.frame+'/'+record.scale+'/'+record.background;
   assert.ok(['native','candidate'].includes(record.kind));
   assert.ok([1,4].includes(record.scale)&&['natural','expanded'].includes(record.frame));
   assert.equal(record.background,record.scale===1?'white':'transparent');
   const images=record.images,a=owned.png(images.reference),b=owned.png(images.actual);
   assert.equal(a.width,frame.camera.width*record.scale);assert.equal(a.height,frame.camera.height*record.scale);
   assert.equal(a.width,b.width);assert.equal(a.height,b.height);
   const options={width:a.width,height:a.height,scale:record.scale,background:record.background,maskThreshold:16};
   const actual=compare(a.rgba,b.rgba,options);calcEqual(actual,record.metrics,'Decoded math metrics differ.');
   assert.equal(actual.rawChangedPixels,summary.rawChangedPixels);
   assert.equal(record.repeat.rawChangedPixels,0);assert.equal(record.actualRepeat.rawChangedPixels,0);
   calcEqual(record.regions.map(r=>r.id),frame.regions.map(r=>r.id),'Image region ownership differs.');
   for(const region of record.regions){
    calcEqual(Object.fromEntries(Object.keys(regionMap.get(region.id)).map(k=>[k,region[k]])),regionMap.get(region.id),'Image region geometry differs.');
    const rectangle=Object.fromEntries(Object.entries(region.rectangle).map(([k,v])=>[k,v*record.scale]));
    const measured=compare(a.rgba,b.rgba,{...options,rectangle});
    calcEqual(Object.fromEntries(Object.keys(measured).map(k=>[k,region[k]])),measured,'Decoded math region differs.');
    regionChecks++;
   }
   const group=groups.get(key)??{};assert.ok(!group[record.kind]);group[record.kind]={a,b,record};groups.set(key,group);pairs++;
  }
  assert.equal(groups.size,4);
  for(const [view,group] of groups){
   assert.ok(group.native&&group.candidate);assert.equal(calcHash(group.native.a.rgba),calcHash(group.candidate.a.rgba),'Paired math references differ.');
   const {a,b,record}=group.native,candidate=group.candidate.b.rgba;
   residuals.push({caseId:c.id,view,whole:attribution(a.rgba,b.rgba,candidate,a.width),regions:frame.regions.map(r=>({
    id:r.id,...attribution(a.rgba,b.rgba,candidate,a.width,Object.fromEntries(Object.entries(r.rectangle).map(([k,v])=>[k,v*record.scale])))}))});
  }
 }
 assert.equal(pairs,declaredCases.length*8);
 assert.equal(markBoxes,declaredCases.reduce((n,c)=>n+c.glyphs+c.rules,0));
 assert.equal(labels,declaredCases.reduce((n,c)=>n+c.nodes,0));
 assert.equal(regionChecks,declaredCases.reduce((n,c)=>n+c.nodes+c.glyphs+c.rules+c.paths,0)*8);
 return{schemaVersion:1,role:'independent-math-framing-image-check',completed:true,reportSha256:owned.sha256,
  pairs,regionChecks,markBoxes,labels,nativeBoundsChecks,nativeRootChecks,residuals,approvedImagePolicy:false,imageConformanceClaim:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,3);const result=await checkMathFramingImages(process.argv[2]);
 console.log(JSON.stringify({completed:result.completed,reportSha256:result.reportSha256,pairs:result.pairs,regionChecks:result.regionChecks,markBoxes:result.markBoxes,labels:result.labels}));
}
