// Native-only conservative frames, including cubic clip contours and bend regions.
import assert from 'node:assert/strict';
import {parsePath,pathData,pathBounds,transformSegments,unionBounds,containment} from './shape-frame-math.mjs';
import {edgeNativeFrame,edgeGlyphMatrix,edgeSpToCss} from './edge-oracle.mjs';
import {edgeCssSegments,edgeStrokeEnvelope} from './edge-oracle-frame.mjs';

const pointBox=p=>({minX:p.x,minY:p.y,maxX:p.x,maxY:p.y});
const inflate=(b,r)=>({minX:b.minX-r,minY:b.minY-r,maxX:b.maxX+r,maxY:b.maxY+r});
export function intersect(a,b){
  if(!a)return null;
  const result={minX:Math.max(a.minX,b.minX),minY:Math.max(a.minY,b.minY),maxX:Math.min(a.maxX,b.maxX),maxY:Math.min(a.maxY,b.maxY)};
  return result.minX>result.maxX||result.minY>result.maxY?null:result;
}
export function curvedClipBounds(path){
  const segments=edgeCssSegments(path);let open=false,drawn=false,contours=0;
  for(const s of segments){
    if(s.kind==='move'){assert.ok(!open||!drawn,'Native clipping contour is unclosed.');open=true;drawn=false;}
    else{assert.ok(open,'Native clipping requires an open contour.');drawn=true;if(s.kind==='close'){open=false;contours++;}}
  }
  assert.ok(contours>0&&(!open||!drawn),'Native clipping contours must close.');
  // Intersecting an ink envelope with this box is conservative. This does not
  // assert an exact intersection with the curved filled contour.
  return pathBounds(segments);
}
export function curvedBezierPoint(segment,t){
  assert.equal(segment.kind,'cubic');assert.ok(Number.isFinite(t)&&t>=0&&t<=1);
  let points=[segment.from,segment.c1,segment.c2,segment.to];
  assert.ok(points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)));
  while(points.length>1)points=points.slice(1).map((p,i)=>({x:(1-t)*points[i].x+t*p.x,y:(1-t)*points[i].y+t*p.y}));
  return points[0];
}
export function curvedPathBounds(segments){
  assert.ok(Array.isArray(segments)&&segments.length>0);
  return segments.some(s=>s.kind!=='move')?pathBounds(segments):unionBounds(segments.map(s=>pointBox(s.to)));
}
export function browserBoxLimit(segments){
  const coordinates=segments.flatMap(s=>[s.from,s.to,s.c1,s.c2,s.control].filter(Boolean)).flatMap(p=>[p.x,p.y]);
  assert.ok(coordinates.length>0&&coordinates.every(Number.isFinite));
  const largest=Math.max(1,...coordinates.map(Math.abs));
  // This checks the browser's float32 box representation, not native path
  // accuracy or an image allowance. Include parsing, stored bounds, extent
  // subtraction and the reported min+extent reconstruction.
  return Math.max(.00004,4*2**(Math.floor(Math.log2(largest))-23));
}

export async function buildCurvedEdgeFrame(renderer,reference,metrics,glyphs,original){
  const originMatch=/transform='translate\(([-\d.]+),([-\d.]+)\)scale\(0\.996264,-0\.996264\)'/.exec(reference);
  const view=/viewBox='([^']+)'/.exec(reference)?.[1].split(' ').map(Number);assert.ok(originMatch&&view?.length===4&&view.every(Number.isFinite));
  const origin={x:Number(originMatch[1]),y:Number(originMatch[2])},b=metrics.pictureBounds;
  const picture={minX:b.minXSp*edgeSpToCss,minY:-b.maxYSp*edgeSpToCss,maxX:b.maxXSp*edgeSpToCss,maxY:-b.minYSp*edgeSpToCss};
  const driverRoot={minX:(view[0]-origin.x)*4/3,minY:(view[1]-origin.y)*4/3,maxX:(view[0]+view[2]-origin.x)*4/3,maxY:(view[1]+view[3]-origin.y)*4/3};
  const paths=new Map(metrics.paths.map(p=>[p.index,p])),clips=original.clipCalls.map(id=>({nativePathId:id,bound:curvedClipBounds(paths.get(id))})),records=[],contributions=[],browserInputs=[];
  function samples(prefix,segments,radius,extra){
    for(const [segmentIndex,s]of segments.entries())if(s.kind==='cubic')for(const t of[.25,.5,.75]){
      const p=curvedBezierPoint(s,t);contributions.push({id:prefix+'.curve-'+segmentIndex+'.t-'+t,kind:'curve-sample',
        ...extra,segmentIndex,t,bound:inflate(pointBox(p),3+radius)});
    }
  }
  for(const [i,clip]of clips.entries()){
    const segments=edgeCssSegments(paths.get(clip.nativePathId));
    contributions.push({id:'clip-'+i,kind:'clip',nativePathId:clip.nativePathId,bound:inflate(clip.bound,3)});
    samples('clip-'+i,segments,0,{nativePathId:clip.nativePathId,clipId:i});
    browserInputs.push({id:'clip-'+i,d:pathData(segments),expected:clip.bound,limit:browserBoxLimit(segments)});
  }
  for(const paint of metrics.driverState.paints){
    const path=paths.get(paint.pathId),segments=edgeCssSegments(path),hasDrawing=segments.some(s=>s.kind!=='move'),geometry=curvedPathBounds(segments),stroke=paint.operation!=='fill'&&paint.strokeOpacity>0
      ?edgeStrokeEnvelope(segments,paint.widthSp*edgeSpToCss,paint.cap,paint.join,paint.miter):null;
    const fill=hasDrawing&&paint.operation!=='stroke'&&paint.fillOpacity>0?geometry:null,paintBounds=[stroke?.stroke,fill].filter(Boolean);
    let bound=paintBounds.length?unionBounds(paintBounds):null;const unclipped=bound;
    for(const id of paint.clips){assert.ok(clips[id]);bound=intersect(bound,clips[id].bound);}
    records.push({id:'path-'+paint.pathId,kind:path.owner.startsWith('node-')?'background':'connection',nativePathId:paint.pathId,hasDrawing,geometry,stroke,unclipped,bound,clips:paint.clips});
    const region=inflate(bound??geometry,3);contributions.push({id:'path-'+paint.pathId,kind:'path',nativePathId:paint.pathId,bound:region});
    const endpoints=new Map(segments.filter(s=>s.kind!=='move').flatMap(s=>[s.from,s.to]).map(p=>[p.x+','+p.y,p]));
    for(const[p,i]of [...endpoints.values()].map((p,i)=>[p,i]))contributions.push({id:'path-'+paint.pathId+'.endpoint-'+i,kind:'endpoint',nativePathId:paint.pathId,bound:inflate(pointBox(p),3)});
    samples('path-'+paint.pathId,segments,stroke?.radius??0,{nativePathId:paint.pathId});
    browserInputs.push({id:'path-'+paint.pathId,d:pathData(segments),expected:geometry,limit:browserBoxLimit(segments),emptyGeometry:!hasDrawing});
  }
  const definitions=new Map(original.definitions.map(p=>[p.id,parsePath(p.d)]));let index=0;
  for(let i=0;i<metrics.nodes.length;i++)for(const g of glyphs.nodes[i].glyphs){
    const originalUse=original.uses[index],outline=definitions.get(originalUse.href.slice(1));assert.ok(outline);
    const matrix=edgeGlyphMatrix(edgeNativeFrame(metrics.nodes[i]),g),segments=transformSegments(outline,matrix),geometry=pathBounds(segments);let bound=geometry;
    const glyphClips=originalUse.clips.map(id=>original.clipMap[id]);for(const id of glyphClips)bound=intersect(bound,clips[id].bound);
    records.push({id:'glyph-'+index,kind:'glyph',nodeId:metrics.nodes[i].id,font:g.font,slot:g.slot,geometry,bound,clips:glyphClips,matrix});
    contributions.push({id:'glyph-'+index,kind:'glyph',nodeId:metrics.nodes[i].id,glyphIndex:index,bound:inflate(bound??geometry,2)});
    browserInputs.push({id:'glyph-'+index,d:pathData(segments),expected:geometry,limit:browserBoxLimit(segments)});index++;
  }
  const ink=unionBounds(records.map(r=>r.bound).filter(Boolean)),root=unionBounds([picture,ink]);
  const all=unionBounds([picture,driverRoot,root,...contributions.map(c=>c.bound)]),x=Math.floor(all.minX)-8,y=Math.floor(all.minY)-8;
  const camera={x,y,width:Math.ceil(all.maxX)-x+8,height:Math.ceil(all.maxY)-y+8};assert.ok(camera.width*camera.height*16<=20000000);
  const regions=contributions.map(c=>{const r=c.bound,x=Math.max(0,Math.floor(r.minX-camera.x-2)),y=Math.max(0,Math.floor(r.minY-camera.y-2));
    return{...c,rectangle:{x,y,width:Math.min(camera.width,Math.ceil(r.maxX-camera.x+2))-x,height:Math.min(camera.height,Math.ceil(r.maxY-camera.y+2))-y}};});
  assert.equal(new Set(regions.map(r=>r.id)).size,regions.length);assert.ok(regions.every(r=>r.rectangle.width>0&&r.rectangle.height>0));
  const containmentChecks=records.filter(r=>r.bound).map(r=>({id:r.id,...containment(r.bound,root,1e-10)}));assert.ok(containmentChecks.every(c=>c.passed));
  const browserChecks=await renderer.page.evaluate(inputs=>{const ns='http://www.w3.org/2000/svg',s=document.createElementNS(ns,'svg');document.body.append(s);
    try{return inputs.map(i=>{const p=document.createElementNS(ns,'path');p.setAttribute('d',i.d);s.append(p);const b=p.getBBox(),actual={minX:b.x,minY:b.y,maxX:b.x+b.width,maxY:b.y+b.height};
      return{id:i.id,expected:i.expected,actual,limit:i.limit,precisionBasis:'Four float32 ulps at the largest native operand; geometry representation check only.',passed:Object.keys(actual).every(k=>Math.abs(actual[k]-i.expected[k])<=i.limit)};});}finally{s.remove();}},browserInputs);
  assert.ok(browserChecks.every(c=>c.passed),'Native analytic edge geometry disagrees with browser boxes: '+JSON.stringify(browserChecks.filter(c=>!c.passed)));
  return JSON.parse(JSON.stringify({caseId:metrics.caseId,origin,picture,driverRoot,ink,root,camera,regions,clips,records,containmentChecks,browserChecks,
    counts:{paints:metrics.driverState.paints.length,clips:clips.length,glyphs:index,regions:regions.length,curveSamples:regions.filter(r=>r.kind==='curve-sample').length},clipEnvelopeContract:'Intersect native paint envelopes with analytic contour boxes; conservative curved-clip bounds, not exact filled-contour intersections.',converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false}));
}
