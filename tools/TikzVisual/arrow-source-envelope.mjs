// Stand-alone SVG framing is prescribed from native geometry, never pixels.
import assert from 'node:assert/strict';
import {nativeEdgeSegments,edgeSpToCss} from './edge-oracle.mjs';
import {edgeStrokeEnvelope} from './edge-oracle-frame.mjs';
import {transformSegments,unionBounds,containment} from './shape-frame-math.mjs';

export const arrowSourceEnvelopeContract={
 id:'native-arrow-conservative-source-envelope-v1',
 basis:'Native picture bounds plus independently reconstructed painted paths. Circular pen envelopes include finite miter extensions and contour-box clipping.',
 stroke:'Geometric extrema inflated by the pen radius; square caps use the diagonal circular envelope. Both finite miter intersections remain conservative.',
 root:'Six CSS decimals for x, y, width and height, matching the declared stand-alone serialization convention. Each field rounds by at most half a millionth of a CSS pixel.',
 reference:'Original immutable SVG drawing remains unchanged. Only its outer presentation is prescribed from this native envelope.',
 scope:'Six frozen glyph-free arrow fixtures; no candidate geometry or pixels supply expectations.'
};

const inflate=(b,r)=>({minX:b.minX-r,minY:b.minY-r,maxX:b.maxX+r,maxY:b.maxY+r});
const point=p=>({minX:p.x,minY:p.y,maxX:p.x,maxY:p.y});
function intersect(a,b){
 const result={minX:Math.max(a.minX,b.minX),minY:Math.max(a.minY,b.minY),maxX:Math.min(a.maxX,b.maxX),maxY:Math.min(a.maxY,b.maxY)};
 return result.minX>result.maxX||result.minY>result.maxY?null:result;
}

export function arrowSourceEnvelope(native,frame){
 const paths=new Map(native.paths.map(p=>[p.id,p]));
 const records=frame.records.map(record=>{
  const paint=native.driverState.paints.find(p=>p.ordinal===record.nativePaintOrdinal);
  assert.ok(paint);assert.equal(paint.pathId,record.nativePathId);
  let bounds={...record.geometry},pen=null;
  if(paint.operation!=='fill'){
   const width=paint.widthSp*edgeSpToCss*record.penScale;
   const segments=transformSegments(nativeEdgeSegments(paths.get(paint.pathId)),record.matrix);
   pen=edgeStrokeEnvelope(segments,width,paint.cap,paint.join,paint.miter);
   bounds=inflate(bounds,pen.radius*(paint.cap===2?Math.SQRT2:1));
   for(const join of pen.joins)for(const tip of join.tips){
    bounds=unionBounds([bounds,point(tip.point),point({x:2*join.point.x-tip.point.x,y:2*join.point.y-tip.point.y})]);
   }
  }
  const unclipped=bounds;
  for(const id of paint.clips){if(bounds)bounds=intersect(bounds,frame.clips[id].bound);}
  if(record.bound){assert.ok(bounds);assert.equal(containment(record.bound,bounds,1e-8).passed,true,'Source envelope excludes native ink: '+record.id);}
  return{id:record.id,nativePaintOrdinal:paint.ordinal,unclipped,bounds};
 });
 const bounds=unionBounds([frame.picture,...records.map(r=>r.bounds).filter(Boolean)]);
 assert.ok(Object.values(bounds).every(Number.isFinite));
 assert.equal(containment(frame.inkRoot,bounds,1e-8).passed,true);
 const round=v=>Number(v.toFixed(6))||0;
 const root={x:round(bounds.minX),y:round(bounds.minY),width:round(bounds.maxX-bounds.minX),height:round(bounds.maxY-bounds.minY)};
 assert.ok(root.width>0&&root.height>0);
 return{contract:arrowSourceEnvelopeContract,bounds,root,records};
}

export function arrowSourceCamera(envelope){
 const r=envelope.root;
 return{origin:{x:-r.x,y:-r.y},physicalPage:{width:r.width,height:r.height}};
}
