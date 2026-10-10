// Independent native geometry/pen envelopes, original glyph outlines and clips.
import assert from 'node:assert/strict';
import {parsePath,pathData,pathBounds,transformSegments,unionBounds,containment} from './shape-frame-math.mjs';
import {nativeEdgeSegments,edgeNativeFrame,edgeGlyphMatrix,edgeSpToCss} from './edge-oracle.mjs';

const pointBox=p=>({minX:p.x,minY:p.y,maxX:p.x,maxY:p.y});
const inflate=(b,r)=>({minX:b.minX-r,minY:b.minY-r,maxX:b.maxX+r,maxY:b.maxY+r});
const equal=(a,b)=>a.x===b.x&&a.y===b.y;
function unit(from,to){const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy);return length?{x:dx/length,y:dy/length}:null;}
function tangent(s,end){const origin=end?s.to:s.from,points=s.kind==='cubic'?(end?[s.c2,s.c1,s.from]:[s.c1,s.c2,s.to]):[end?s.from:s.to];
  const p=points.find(p=>!equal(p,origin));return p?end?unit(p,origin):unit(origin,p):null;}
export function edgeCssSegments(path){return nativeEdgeSegments(path).map(s=>{const p=q=>({x:q.x*edgeSpToCss,y:-q.y*edgeSpToCss});
  return{...s,from:s.from?p(s.from):null,to:p(s.to),...(s.c1?{c1:p(s.c1),c2:p(s.c2)}:{})};});}
export function edgeStrokeEnvelope(segments,width,cap,join,miter){
  assert.ok(Number.isFinite(width)&&width>0&&[0,1,2].includes(cap)&&[0,1,2].includes(join)&&Number.isFinite(miter)&&miter>=1);
  const r=width/2,boxes=[],joins=[],caps=[],degenerate=[],groups=[];let group=null;
  for(const s of segments){if(s.kind==='move'){group={start:s.to,edges:[],closed:false};groups.push(group);continue;}
    assert.ok(group,'Drawing requires a native move.');
    if(group.closed){
      // A drawing command after close starts a new subpath at the closed
      // contour's initial point: https://www.w3.org/TR/SVG2/paths.html#PathDataClosePathCommand
      assert.ok(equal(s.from,group.start),'Post-close drawing must start at the closed contour origin.');
      group={start:group.start,edges:[],closed:false};groups.push(group);
    }
    group.edges.push(s);if(s.kind==='close')group.closed=true;
    const u=tangent(s,false);if(!u)continue;
    if(s.kind==='cubic')boxes.push(inflate(pathBounds([s]),r));
    else for(const p of[s.from,s.to])for(const sign of[-1,1])boxes.push(pointBox({x:p.x-sign*u.y*r,y:p.y+sign*u.x*r}));
  }
  for(const g of groups){
    const edges=g.edges.filter(s=>tangent(s,false)&&tangent(s,true));
    if(!edges.length){if(g.edges.length){assert.ok(cap!==2,'Square zero-length paths are outside this fixed native profile.');
      const dot=!g.closed&&cap===1;degenerate.push({point:g.start,roundDot:dot});if(dot)boxes.push(inflate(pointBox(g.start),r));}continue;}
    const pairs=edges.slice(1).map((s,i)=>[edges[i],s]);if(g.closed)pairs.push([edges.at(-1),edges[0]]);
    for(const[left,right]of pairs){assert.ok(equal(left.to,right.from));const p=left.to,u=tangent(left,true),v=tangent(right,false),det=u.x*v.y-u.y*v.x,tips=[];
      if(join===1)boxes.push(inflate(pointBox(p),r));
      // Only the outside offset intersection is a miter tip. The inside
      // intersection can lie far behind a sharp turn and invent extra ink.
      if(join===0&&Math.abs(det)>1e-14)for(const sign of[-Math.sign(det)]){
        const a={x:p.x-sign*u.y*r,y:p.y+sign*u.x*r},b={x:p.x-sign*v.y*r,y:p.y+sign*v.x*r};
        const t=((b.x-a.x)*v.y-(b.y-a.y)*v.x)/det,tip={x:a.x+t*u.x,y:a.y+t*u.y},ratio=Math.hypot(tip.x-p.x,tip.y-p.y)/r;
        if(ratio<=miter){boxes.push(pointBox(tip));tips.push({point:tip,ratio});}
      }
      joins.push({point:p,kind:join,incoming:u,outgoing:v,determinant:det,tips});
    }
    if(!g.closed)for(const[end,s]of[[false,edges[0]],[true,edges.at(-1)]]){
      const p=end?s.to:s.from,u=tangent(s,end);caps.push({point:p,kind:cap,tangent:u});
      if(cap===1)boxes.push(inflate(pointBox(p),r));
      if(cap===2)for(const sign of[-1,1]){const direction=end?1:-1;boxes.push(pointBox({x:p.x+direction*u.x*r-sign*u.y*r,y:p.y+direction*u.y*r+sign*u.x*r}));}
    }
  }
  return{stroke:boxes.length?unionBounds(boxes):null,radius:r,joins,caps,degenerate,
    contract:'Native line offset corners, explicit caps and offset-line miter intersections; cubic pen and round-join envelopes are conservative; no dash-gap reduction.'};
}
function intersect(a,b){if(!a)return null;const result={minX:Math.max(a.minX,b.minX),minY:Math.max(a.minY,b.minY),maxX:Math.min(a.maxX,b.maxX),maxY:Math.min(a.maxY,b.maxY)};
  return result.minX>result.maxX||result.minY>result.maxY?null:result;}
function clipBounds(path){const segments=edgeCssSegments(path),edges=segments.filter(s=>s.kind!=='move');
  assert.equal(edges.length,4);assert.equal(edges.at(-1).kind,'close');assert.ok(edges.every(s=>s.from.x===s.to.x||s.from.y===s.to.y),'Fixed native clips must be axis aligned rectangles.');
  const box=pathBounds(edges),points=new Set(edges.map(s=>s.to.x+','+s.to.y));assert.equal(points.size,4);
  assert.ok(edges.every(s=>(s.to.x===box.minX||s.to.x===box.maxX)&&(s.to.y===box.minY||s.to.y===box.maxY)));return box;
}
export async function buildEdgeOracleFrame(renderer,reference,metrics,glyphs,original){
  const originMatch=/transform='translate\(([-\d.]+),([-\d.]+)\)scale\(0\.996264,-0\.996264\)'/.exec(reference);
  const view=/viewBox='([^']+)'/.exec(reference)?.[1].split(' ').map(Number);assert.ok(originMatch&&view?.length===4&&view.every(Number.isFinite));
  const origin={x:Number(originMatch[1]),y:Number(originMatch[2])},b=metrics.pictureBounds;
  const picture={minX:b.minXSp*edgeSpToCss,minY:-b.maxYSp*edgeSpToCss,maxX:b.maxXSp*edgeSpToCss,maxY:-b.minYSp*edgeSpToCss};
  const driverRoot={minX:(view[0]-origin.x)*4/3,minY:(view[1]-origin.y)*4/3,maxX:(view[0]+view[2]-origin.x)*4/3,maxY:(view[1]+view[3]-origin.y)*4/3};
  const paths=new Map(metrics.paths.map(p=>[p.index,p])),clips=original.clipCalls.map(id=>({nativePathId:id,bound:clipBounds(paths.get(id))})),records=[],contributions=[],browserInputs=[];
  for(const paint of metrics.driverState.paints){
    const path=paths.get(paint.pathId),segments=edgeCssSegments(path),geometry=pathBounds(segments),stroke=paint.operation!=='fill'&&paint.strokeOpacity>0
      ?edgeStrokeEnvelope(segments,paint.widthSp*edgeSpToCss,paint.cap,paint.join,paint.miter):null;
    const fill=paint.operation!=='stroke'&&paint.fillOpacity>0?geometry:null,paintBounds=[stroke?.stroke,fill].filter(Boolean);
    let bound=paintBounds.length?unionBounds(paintBounds):null;const unclipped=bound;
    for(const id of paint.clips){assert.ok(clips[id]);bound=intersect(bound,clips[id].bound);}
    records.push({id:'path-'+paint.pathId,kind:path.owner.startsWith('node-')?'background':'connection',nativePathId:paint.pathId,geometry,stroke,unclipped,bound,clips:paint.clips});
    const region=inflate(bound??geometry,3);contributions.push({id:'path-'+paint.pathId,kind:'path',nativePathId:paint.pathId,bound:region});
    const endpoints=new Map(segments.filter(s=>s.kind!=='move').flatMap(s=>[s.from,s.to]).map(p=>[p.x+','+p.y,p]));
    for(const[p,i]of [...endpoints.values()].map((p,i)=>[p,i]))contributions.push({id:'path-'+paint.pathId+'.endpoint-'+i,kind:'endpoint',nativePathId:paint.pathId,bound:inflate(pointBox(p),3)});
    browserInputs.push({id:'path-'+paint.pathId,d:pathData(segments),expected:geometry});
  }
  const definitions=new Map(original.definitions.map(p=>[p.id,parsePath(p.d)]));let index=0;
  for(let i=0;i<metrics.nodes.length;i++)for(const g of glyphs.nodes[i].glyphs){
    const originalUse=original.uses[index],outline=definitions.get(originalUse.href.slice(1));assert.ok(outline);
    const matrix=edgeGlyphMatrix(edgeNativeFrame(metrics.nodes[i]),g),segments=transformSegments(outline,matrix),geometry=pathBounds(segments);let bound=geometry;
    const glyphClips=originalUse.clips.map(id=>original.clipMap[id]);for(const id of glyphClips)bound=intersect(bound,clips[id].bound);
    records.push({id:'glyph-'+index,kind:'glyph',nodeId:metrics.nodes[i].id,font:g.font,slot:g.slot,geometry,bound,clips:glyphClips,matrix});
    contributions.push({id:'glyph-'+index,kind:'glyph',nodeId:metrics.nodes[i].id,glyphIndex:index,bound:inflate(bound??geometry,2)});
    browserInputs.push({id:'glyph-'+index,d:pathData(segments),expected:geometry});index++;
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
      return{id:i.id,expected:i.expected,actual,limit:.00004,passed:Object.keys(actual).every(k=>Math.abs(actual[k]-i.expected[k])<=.00004)};});}finally{s.remove();}},browserInputs);
  assert.ok(browserChecks.every(c=>c.passed),'Native analytic edge geometry disagrees with browser boxes.');
  return JSON.parse(JSON.stringify({caseId:metrics.caseId,origin,picture,driverRoot,ink,root,camera,regions,clips,records,containmentChecks,browserChecks,
    counts:{paints:metrics.driverState.paints.length,clips:clips.length,glyphs:index,regions:regions.length},converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false}));
}
