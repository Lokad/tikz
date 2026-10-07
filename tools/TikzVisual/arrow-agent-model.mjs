// Compact presentation projections. They never alter measurements or admission.
import assert from 'node:assert/strict';
import {arrowAgentPath} from './arrow-agent-evidence.mjs';
export function arrowAgentSpan(text,span){
 if(span===null)return null;assert.ok(span&&['offset','length','line','column'].every(k=>Number.isSafeInteger(span[k])));
 assert.ok(span.offset>=0&&span.length>0&&span.offset+span.length<=text.length&&span.line>0&&span.column>0);
 const prefix=text.slice(0,span.offset),lines=prefix.split('\n');assert.equal(span.line,lines.length);assert.equal(span.column,lines.at(-1).length+1);
 return{...span,text:text.slice(span.offset,span.offset+span.length)};
}
export function arrowAgentPngSize(bytes){assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.toString('ascii',12,16),'IHDR');return{width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};}
const text=(input,file)=>{assert.ok(input.files.has(file),file);return input.files.get(file).toString();};
const json=(input,file)=>JSON.parse(text(input,file));
export function buildArrowAgentCases(bundle){
 const primary=bundle.loaded[0],pdf=bundle.loaded[2],prototype=bundle.loaded[4],link=(input,file)=>{arrowAgentPath(file);assert.ok(input.files.has(file),input.kind+'/'+file);return'inputs/'+input.kind+'/'+file;};
 return bundle.evidence.cases.map(c=>{
  const pf=primary.report.frames.find(f=>f.caseId===c.id),paper=pdf.report.frames.find(f=>f.caseId===c.id).paper,uf=json(prototype,c.id+'/frame-regions.json'),sourceFile='numeric/input-captures/tests/Reference/Arrows/'+c.id+'/source.tikz',source=text(prototype,sourceFile),sceneFile='numeric/'+c.id+'/scene.json',scene=json(prototype,sceneFile);
  const regions={primary:[{id:'whole-picture',rectangle:{x:0,y:0,width:pf.camera.width,height:pf.camera.height},sourceSpan:null},...pf.regions.map(r=>({...r,sourceSpan:null}))],
   pdf:paper.regions.map(r=>{const native=pf.regions.find(p=>p.id===r.id);return{...r,...Object.fromEntries(['nativePaintOrdinal','nativePlacementId','nativePathId','inputId'].filter(k=>native&&Object.hasOwn(native,k)).map(k=>[k,native[k]])),sourceSpan:null};}),prototype:uf.regions.map(r=>({...r,sourceSpan:r.attribution?arrowAgentSpan(source,r.attribution.source):null,
    shaftSourceSpan:r.attribution?arrowAgentSpan(source,r.attribution.shaftSource):null}))};
  for(const r of regions.prototype.filter(r=>r.attribution)){const path=scene.paths[r.attribution.publicPaintOrdinal-1];assert.equal(path.role,'tip');assert.deepEqual(path.source,r.attribution.source);assert.deepEqual(path.arrow.shaftSource,r.attribution.shaftSource);}
  const rows=[];
  for(const [family,input]of [['prototype',prototype],['primary',primary],['pdf',pdf]])for(const o of input.report.observations.filter(o=>(o.view?.caseId??o.caseId)===c.id)){
   const v=o.view??o,n=family==='prototype'?o:json(input,o.numbers),size=family==='pdf'?n.pageSize:{width:(family==='primary'?pf.camera:uf.camera).width*v.scale,height:(family==='primary'?pf.camera:uf.camera).height*v.scale};
   const images=family==='pdf'?{reference:link(input,o.pdfPage),actual:link(input,o.images['svg-page'])}:{reference:link(input,o.images.reference),actual:link(input,o.images.actual)};
   for(const file of Object.values(images)){const bytes=input.files.get(file.slice(('inputs/'+input.kind+'/').length));assert.deepEqual(arrowAgentPngSize(bytes),size);}
   const metrics=family==='pdf'?n.whole:n.metrics,crops=o.crops.map(crop=>({id:crop.id,presentation:crop.presentation,images:Object.fromEntries(Object.entries(crop.images).map(([k,f])=>[k,link(input,f)]))}));
   rows.push({id:family+'/'+(v.id??o.id),family,kind:family==='prototype'?'prototype-raw':v.kind,name:v.name??'public prototype',route:v.route??'intrinsic-image',raster:v.raster??'intrinsic-image',
    view:{frame:v.frame,scale:v.scale,background:v.background},labels:family==='prototype'?{reference:'Native TikZ SVG',actual:'Lokad.TikZ prototype'}:
     family==='pdf'?{reference:'Ordinary PDF',actual:n.rightLabel}:{reference:n.referenceLabel,actual:n.rightLabel},images,size,crops,
    metrics:{rawChangedPixels:metrics.rawChangedPixels,maxRawChannelError:metrics.maxRawChannelError,meanForegroundChannelError:metrics.meanForegroundChannelError},
    measurement:link(input,family==='prototype'?'report.json':o.numbers),inputSvg:link(input,family==='prototype'?'numeric/'+c.id+'/candidate.svg':family==='pdf'?o.svg:o.actual),
    nativeOnly:family!=='prototype',imageAdmission:'pending',evaluation:n.evaluation?{passed:n.evaluation.passed,failedRegionIds:n.evaluation.failed?.map(r=>r.id)??n.evaluation.checks.filter(r=>!r.passed).map(r=>r.id)}:null,
    sensitivity:n.sensitivity??null,svgDelta:family==='pdf'?n.svgDelta??null:null});
  }
  const strict=pdf.report.policies.strict.filter(p=>p.caseId===c.id).map(p=>({route:p.route,state:p.state,lostEdges:p.lostEdges??[]}));
  return{schemaVersion:1,caseId:c.id,imageAdmission:'pending',source:{file:link(prototype,sourceFile),text:source,scene:link(prototype,sceneFile)},
   cameras:{primary:pf.camera,pdf:paper.camera,prototype:uf.camera},regions,strictPdfEligibility:strict,rows};
 });
}
export function arrowAgentRectangle(caseData,row,id){
 const r=caseData.regions[row.family].find(r=>r.id===id);assert.ok(r,'Missing selected native region');const q=row.family==='pdf'?r.rasterRectangles[row.view.scale+'x']:
  Object.fromEntries(Object.entries(r.rectangle).map(([k,n])=>[k,n*row.view.scale]));
 assert.ok(['x','y','width','height'].every(k=>Number.isSafeInteger(q[k]))&&q.x>=0&&q.y>=0&&q.width>0&&q.height>0&&q.x+q.width<=row.size.width&&q.y+q.height<=row.size.height);
 return q;
}
export function arrowAgentEntry(bundle,cases,sourceHashes){
 const counts={cases:cases.length,views:cases.reduce((n,c)=>n+c.rows.length,0),prototypeViews:cases.flatMap(c=>c.rows).filter(r=>r.family==='prototype').length,primaryViews:cases.flatMap(c=>c.rows).filter(r=>r.family==='primary').length,pdfViews:cases.flatMap(c=>c.rows).filter(r=>r.family==='pdf').length,nativeRegions:cases.reduce((n,c)=>n+c.regions.primary.length-1,0),prototypeTipCrops:cases.flatMap(c=>c.rows).filter(r=>r.family==='prototype').reduce((n,r)=>n+r.crops.filter(c=>c.id!=='whole-picture').length,0)};
 assert.deepEqual(counts,{cases:6,views:746,prototypeViews:72,primaryViews:378,pdfViews:296,nativeRegions:741,prototypeTipCrops:118});
 return{schemaVersion:1,completed:true,comparisonKind:'unapproved-arrow-agent-inspection',converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',
  snapshotSha256:bundle.evidence.snapshotSha256,renderer:bundle.loaded[0].report.renderer,sourceHashes,coverage:counts,
  inputs:bundle.loaded.map(i=>({kind:i.kind,origin:i.origin,report:'inputs/'+i.kind+'/report.json',sha256:i.sha256,
   interpretation:i.kind==='prototype'?'Hash-bound public numeric prototype and raw images; independent image admission pending.':i.kind.endsWith('-check')?'Completed saved-image checks; policy approval pending.':'Native-only unapproved observations.'})),
  cases:cases.map(c=>({caseId:c.caseId,report:'cases/'+c.caseId+'.json',viewer:'cases/'+c.caseId+'.html',views:c.rows.length,source:c.source.file,
   sourceScene:c.source.scene,strictPdfEligibility:c.strictPdfEligibility.map(({route,state})=>({route,state}))})),
  agent:{viewer:'index.html',pendingGates:['strict-PDF-eligibility','immutable-primary-and-PDF-qualification','owned-public-combined-admission'],
   interpretation:'Inspection only. Native controls and the public prototype are separate. Source spans belong to the public trace; native-only regions have null candidate spans.',
   commands:[{executable:'node',arguments:['tools/TikzVisual/inspect-arrow-agent.mjs','--replay','<owned-agent-report>']},{executable:'node',arguments:['tools/TikzVisual/check-arrow-agent.mjs','<owned-agent-report>']}]}};
}
export function validateArrowAgent(entry,cases,expected,artifacts){
 assert.deepEqual(entry,expected);assert.equal(cases.length,6);for(const c of cases){assert.equal(c.imageAdmission,'pending');assert.ok(c.rows.length>0);
  for(const row of c.rows){assert.equal(row.imageAdmission,'pending');for(const r of c.regions[row.family])arrowAgentRectangle(c,row,r.id);
   for(const file of [row.measurement,row.inputSvg,...Object.values(row.images),...row.crops.flatMap(r=>Object.values(r.images))])assert.match(artifacts[file]??'',/^[a-f0-9]{64}$/);}
 }
 assert.ok(Buffer.byteLength(JSON.stringify(entry,null,2))<32000,'Agent entry must stay small');
 return{...entry.coverage,compactEntry:true};
}
