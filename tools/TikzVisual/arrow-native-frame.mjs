// Native-only picture arithmetic, conservative ink envelopes and fixed regions.
// Expectations never come from the converter or from rasterized candidate ink.
import assert from 'node:assert/strict';
import {nativeEdgeSegments,edgeSpToCss} from './edge-oracle.mjs';
import {edgeStrokeEnvelope} from './edge-oracle-frame.mjs';
import {transformSegments,pathData,unionBounds,containment} from './shape-frame-math.mjs';
import {curvedPathBounds,curvedBezierPoint,browserBoxLimit,curvedClipBounds} from './curved-edge-frame.mjs';

const pointBox=p=>({minX:p.x,minY:p.y,maxX:p.x,maxY:p.y});
const inflate=(b,r)=>({minX:b.minX-r,minY:b.minY-r,maxX:b.maxX+r,maxY:b.maxY+r});
const intersect=(a,b)=>{if(!a)return null;const r={minX:Math.max(a.minX,b.minX),minY:Math.max(a.minY,b.minY),maxX:Math.min(a.maxX,b.maxX),maxY:Math.min(a.maxY,b.maxY)};
 return r.minX>r.maxX||r.minY>r.maxY?null:r;};
const away=x=>Math.sign(x)*Math.round(Math.abs(x));
const truncProduct=(coefficient,sp)=>Math.trunc(away(coefficient*65536)*sp/65536);
export function arrowFiniteHullPoint(placement,p){
 const [a,b,c,d]=placement.matrix;
 return{x:truncProduct(a,p.xSp)+truncProduct(c,p.ySp)+placement.xSp,
  y:truncProduct(b,p.xSp)+truncProduct(d,p.ySp)+placement.ySp};
}
export function arrowWorldMatrix(placement){
 const f=edgeSpToCss;if(!placement)return[f,0,0,-f,0,0];
 const [a,b,c,d]=placement.matrix;return[a*f,-b*f,c*f,-d*f,placement.xSp*f,-placement.ySp*f];
}

export function reconstructArrowPicture(metrics){
 const contributions=[],excluded=[],paths=new Map(metrics.paths.map(p=>[p.id,p])),tips=new Map(metrics.templates.map(t=>[t.id,t]));
 for(const input of metrics.inputs){
  const shipped=metrics.driverState.paints.filter(p=>p.role==='shaft'&&paths.get(p.pathId)?.inputId===input.id);
  assert.ok(shipped.length<=1,'This fixed native corpus has at most one shaft paint per input.');
  const isClip=input.modes==='clip';
  if(input.segments.length===0){assert.equal(input.modes,'');assert.equal(shipped.length,0);excluded.push({inputId:input.id,reason:'Empty, unpainted native node path.'});continue;}
  if(!isClip){assert.ok(shipped.length===1,'Unaccounted native picture input.');if(shipped[0].clips.length){excluded.push({inputId:input.id,reason:'Native picture-size relevance disabled under clip.'});continue;}}
  const points=nativeEdgeSegments(input).flatMap(s=>[s.to,s.c1,s.c2].filter(Boolean));
  assert.ok(points.length>0);const raw=unionBounds(points.map(pointBox));
  const half=input.modes.split(',').includes('draw')?Math.floor(input.lineWidthSp/2):0;
  contributions.push({id:'input-'+input.id,kind:isClip?'clip-control-box':'original-input-control-box',inputId:input.id,boundSp:inflate(raw,half)});
 }
 for(const placement of metrics.placements){
  const paints=metrics.driverState.paints.filter(p=>p.placementId===placement.id);assert.ok(paints.length>0);
  assert.ok(paints.every(p=>JSON.stringify(p.clips)===JSON.stringify(paints[0].clips)));
  if(paints[0].clips.length){excluded.push({placementId:placement.id,reason:'Native picture-size relevance disabled under clip.'});continue;}
  const tip=tips.get(placement.templateId);assert.ok(tip);
  if(tip.hull.length)contributions.push({id:'hull-'+placement.id,kind:'finite-transformed-hull',placementId:placement.id,
   boundSp:unionBounds(tip.hull.map(p=>pointBox(arrowFiniteHullPoint(placement,p))))});
 }
 const b=unionBounds(contributions.map(c=>c.boundSp)),pictureBounds={minXSp:b.minX,minYSp:b.minY,maxXSp:b.maxX,maxYSp:b.maxY};
 assert.deepEqual(pictureBounds,metrics.pictureBounds,'Native picture bounds do not follow original controls, pen and finite tip hulls.');
 return{pictureBounds,contributions,excluded,contract:'Original pre-shortening path control boxes; half-pen for draw; clip paths without pen; clipped paints excluded; each hull product truncates in scaled points before native translation.'};
}

export function buildArrowNativeFrame(caseId,reference,metrics){
 assert.equal(metrics.driverState.passed,true);const pictureProof=reconstructArrowPicture(metrics);
 const root=/viewBox='([^']+)'/.exec(reference)?.[1].split(' ').map(Number);assert.ok(root?.length===4&&root.every(Number.isFinite));
 const matrix=metrics.driverState.svgRootMatrix;assert.deepEqual(matrix.slice(0,4),[.996264,0,0,-.996264]);
 const origin={x:matrix[4],y:matrix[5]},f=edgeSpToCss,b=metrics.pictureBounds;
 const picture={minX:b.minXSp*f,minY:-b.maxYSp*f,maxX:b.maxXSp*f,maxY:-b.minYSp*f};
 const driverRoot={minX:(root[0]-origin.x)*4/3,minY:(root[1]-origin.y)*4/3,maxX:(root[0]+root[2]-origin.x)*4/3,maxY:(root[1]+root[3]-origin.y)*4/3};
 const paths=new Map(metrics.paths.map(p=>[p.id,p])),placements=new Map(metrics.placements.map(p=>[p.id,p])),records=[],contributions=[],browserInputs=[];
 const clips=metrics.clips.map((id,i)=>{const path=paths.get(id);assert.ok(path);return{id:i,nativePathId:id,bound:curvedClipBounds(path)};});
 const add=(id,kind,bound,extra={})=>contributions.push({id,kind,bound,...extra});
 const samples=(id,segments,radius,extra)=>{
  for(const [segmentIndex,s]of segments.entries())if(s.kind==='cubic')for(const t of[.25,.5,.75])
   add(id+'.curve-'+segmentIndex+'.t-'+t,'curve-sample',inflate(pointBox(curvedBezierPoint(s,t)),3+radius),{...extra,segmentIndex,t});
 };
 for(const clip of clips){
  const segments=transformSegments(nativeEdgeSegments(paths.get(clip.nativePathId)),arrowWorldMatrix(null));
  add('clip-'+clip.id,'clip',inflate(clip.bound,3),{nativePathId:clip.nativePathId,clipId:clip.id});
  samples('clip-'+clip.id,segments,0,{nativePathId:clip.nativePathId,clipId:clip.id});
  browserInputs.push({id:'clip-'+clip.id,d:pathData(segments),expected:clip.bound,limit:browserBoxLimit(segments)});
 }
 for(const paint of metrics.driverState.paints){
  const path=paths.get(paint.pathId);assert.ok(path);
  const placement=paint.placementId===null?null:placements.get(paint.placementId);assert.ok(paint.placementId===null||placement);
  let penScale=1;
  if(placement){const [a,b,c,d]=placement.matrix;assert.ok(c===-b&&d===a);penScale=Math.hypot(a,b);assert.ok(penScale>0);}
  const segments=transformSegments(nativeEdgeSegments(path),arrowWorldMatrix(placement)),hasDrawing=segments.some(s=>s.kind!=='move'),geometry=curvedPathBounds(segments);
  const stroke=paint.operation!=='fill'&&paint.strokeOpacity>0?edgeStrokeEnvelope(segments,paint.widthSp*f*penScale,paint.cap,paint.join,paint.miter):null;
  const fill=hasDrawing&&paint.operation!=='stroke'&&paint.fillOpacity>0?geometry:null;
  const paintBounds=[stroke?.stroke,fill].filter(Boolean);let bound=paintBounds.length?unionBounds(paintBounds):null;const unclipped=bound;
  for(const id of paint.clips){assert.ok(clips[id]);bound=intersect(bound,clips[id].bound);}
  const id='paint-'+paint.ordinal,extra={nativePaintOrdinal:paint.ordinal,nativeEventId:paint.eventId,nativePathId:paint.pathId,nativePlacementId:paint.placementId,inputId:placement?.inputId??path.inputId,role:paint.role};
  records.push({id,...extra,matrix:arrowWorldMatrix(placement),penScale,hasDrawing,geometry,stroke,unclipped,bound,clips:paint.clips});
  add(id,paint.role==='shaft'?'shaft':'tip',inflate(bound??geometry,3),extra);
  const endpoints=new Map(segments.filter(s=>s.kind!=='move').flatMap(s=>[s.from,s.to]).map(p=>[p.x+','+p.y,p]));
  for(const [index,p]of [...endpoints.values()].entries())add(id+'.endpoint-'+index,'endpoint',inflate(pointBox(p),3),extra);
  samples(id,segments,stroke?.radius??0,extra);
  if(placement){const endpoint={x:placement.xSp*f,y:-placement.ySp*f};add(id+'.placement','placement',inflate(pointBox(endpoint),3),extra);}
  browserInputs.push({id,d:pathData(segments),expected:geometry,
   limit:browserBoxLimit(segments),emptyGeometry:!hasDrawing});
 }
 const ink=unionBounds(records.map(r=>r.bound).filter(Boolean)),inkRoot=unionBounds([picture,ink]);
 const all=unionBounds([picture,driverRoot,inkRoot,...contributions.map(c=>c.bound)]),x=Math.floor(all.minX)-8,y=Math.floor(all.minY)-8;
 const camera={x,y,width:Math.ceil(all.maxX)-x+8,height:Math.ceil(all.maxY)-y+8};assert.ok(camera.width*camera.height*16<=20000000);
 const regions=contributions.map(c=>{const b=c.bound,x=Math.floor(b.minX-camera.x-2),y=Math.floor(b.minY-camera.y-2),right=Math.ceil(b.maxX-camera.x+2),bottom=Math.ceil(b.maxY-camera.y+2);
  assert.ok(x>=0&&y>=0&&right<=camera.width&&bottom<=camera.height);return{...c,rectangle:{x,y,width:right-x,height:bottom-y}};});
 assert.ok(regions.length<=1024&&new Set(regions.map(r=>r.id)).size===regions.length);
 const containmentChecks=records.filter(r=>r.bound).map(r=>({id:r.id,...containment(r.bound,inkRoot,1e-10)}));assert.ok(containmentChecks.every(c=>c.passed));
 return JSON.parse(JSON.stringify({schemaVersion:1,caseId,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
  pictureProof,origin,picture,driverRoot,ink,inkRoot,camera,clips,records,regions,browserInputs,containmentChecks,
  counts:{paints:records.length,tips:records.filter(r=>r.role==='tip').length,placements:placements.size,clips:clips.length,regions:regions.length,
   curveSamples:regions.filter(r=>r.kind==='curve-sample').length},
  inkContract:'Continuous native tip matrices; finite similarity pen scale; conservative cubic pen and round joins, with explicit line caps/miter tips; no dash-gap reduction; clipped envelopes intersect contour boxes. Picture bounds and ink are distinct.'}));
}

export async function checkArrowBrowserBoxes(renderer,frame){
 const checks=await renderer.page.evaluate(inputs=>{const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');document.body.append(svg);
  try{return inputs.map(i=>{const path=document.createElementNS(ns,'path');path.setAttribute('d',i.d);svg.append(path);const b=path.getBBox(),actual={minX:b.x,minY:b.y,maxX:b.x+b.width,maxY:b.y+b.height};
   return{id:i.id,actual,expected:i.expected,limit:i.limit,emptyGeometry:i.emptyGeometry??false,passed:Object.keys(actual).every(k=>Math.abs(actual[k]-i.expected[k])<=i.limit)};});}finally{svg.remove();}},frame.browserInputs);
 assert.ok(checks.every(c=>c.passed),'Native geometry disagrees with browser: '+JSON.stringify(checks.filter(c=>!c.passed)));
 return checks;
}
