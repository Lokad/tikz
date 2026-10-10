// Natural roots differ from conservative inspection cameras. Native paths,
// pen state and original glyph contours are the only inputs to this derivation.
import assert from 'node:assert/strict';
import {nativeEdgeSegments,edgeSpToCss} from './edge-oracle.mjs';
import {arrowWorldMatrix} from './arrow-native-frame.mjs';
import {edgeCssSegments,edgeStrokeEnvelope} from './edge-oracle-frame.mjs';
import {transformSegments,pathBounds,unionBounds} from './shape-frame-math.mjs';
import {curvedClipBounds,intersect} from './curved-edge-frame.mjs';

export function diagramNativeNaturalRoot(metrics,picture,glyphs){
 assert.equal(metrics.driverState.passed,true);
 const paths=new Map(metrics.paths.map(p=>[p.id,p])),placements=new Map(metrics.placements.map(p=>[p.id,p])),contributions=[];
 const clips=metrics.clips.map(id=>{const path=paths.get(id);assert.ok(path);return curvedClipBounds(path);});
 const clipped=(bound,ids)=>{for(const id of ids){assert.ok(Number.isInteger(id)&&clips[id]);bound=intersect(bound,clips[id]);}return bound;};
 for(const paint of metrics.driverState.paints){
  const placement=paint.placementId===null?null:placements.get(paint.placementId);
  const path=paths.get(paint.pathId);assert.ok(path);assert.ok(paint.placementId===null||placement);
  if(placement){const[a,b,c,d]=placement.matrix;assert.ok(c===-b&&d===a,'Native tip pen requires a similarity transform.');}
  const segments=transformSegments(nativeEdgeSegments(path),arrowWorldMatrix(placement)),geometry=pathBounds(segments),scale=placement?Math.hypot(...placement.matrix.slice(0,2)):1;
  const stroke=paint.operation!=='fill'&&paint.strokeOpacity>0?edgeStrokeEnvelope(segments,paint.widthSp*edgeSpToCss*scale,paint.cap,paint.join,paint.miter):null;
  const fill=paint.operation!=='stroke'&&paint.fillOpacity>0?geometry:null,bounds=[stroke?.stroke,fill].filter(Boolean);
  const bound=clipped(bounds.length?unionBounds(bounds):null,paint.clips);
  if(bound)contributions.push({id:'native-paint-'+paint.ordinal,role:paint.role,bound});
 }
 for(const g of glyphs){const bound=clipped(g.bound,g.clips??[]);if(bound)contributions.push({id:g.id,nodeId:g.nodeId,bound});}
 const ink=unionBounds(contributions.map(c=>c.bound)),root=unionBounds([picture,ink]);
 return{ink,root,contributions,converterInvoked:false,
  contract:'Observed PGF picture bounds union shipped native path/glyph ink; existing line caps/miter intersections, cubic pen envelopes and similarity tip pens.'+
    (clips.length?' Clip contour bounds conservatively intersect native path/glyph ink.':'')+' Conservative inspection padding is excluded.'};
}

// These fixed contracts have measured global rectangle paths, not arrow templates.
export function rectangleNativePrimitives(metrics,expectedNodes){
 assert.equal(metrics.driverState.passed,true);
 assert.ok(Number.isInteger(expectedNodes)&&expectedNodes>0);
 assert.equal(metrics.nodes.length,expectedNodes);assert.equal(metrics.constructionPaths.length,expectedNodes);
 assert.ok(metrics.nodes.every(n=>n.shape==='rectangle'&&n.frame.slice(0,4).join(',')==='1.0,0.0,0.0,1.0'));
 assert.equal(metrics.driverState.clipPaths,0);
 const paths=metrics.constructionPaths,calls=metrics.physicalOrder.allPathCalls;
 assert.deepEqual(calls,paths.map(p=>p.index));
 for(const [i,path]of paths.entries()){
  assert.equal(path.owner,'node-'+metrics.nodes[i].id);
  assert.deepEqual(path.segments.map(s=>s.kind),['rectcorner','rectsize']);
  assert.ok(path.modes.every(m=>['draw','fill'].includes(m)));assert.equal(new Set(path.modes).size,path.modes.length);
 }
 // Driver path IDs are shipped ordinals. Background construction calls also
 // include unpainted nodes, which still emit their labels in physical order.
 const shipped=paths.filter(p=>p.modes.length>0);assert.equal(shipped.length,metrics.driverState.paints.length);
 const paints=metrics.driverState.paints.map((paint,i)=>{
  const path=shipped[i];assert.equal(paint.pathId,i+1);assert.equal(paint.clips.length,0);
  assert.equal(paint.operation,path.modes.includes('draw')?(path.modes.includes('fill')?'fillstroke':'stroke'):'fill');
  assert.equal(paint.widthSp,path.widthSp);return{...paint,pathId:path.index};
 });
 return{...metrics,paths,driverState:{...metrics.driverState,paints},physicalOrder:{...metrics.physicalOrder,nodeBackgroundCalls:calls}};
}

export function rectangleNativeNaturalRoot(metrics,picture,glyphs,expectedNodes){
 const primitive=rectangleNativePrimitives(metrics,expectedNodes),paths=new Map(primitive.paths.map(p=>[p.index,p])),contributions=[];
 for(const [i,paint]of primitive.driverState.paints.entries()){
  const path=paths.get(paint.pathId);
  const segments=edgeCssSegments(path),stroke=paint.operation!=='fill'&&paint.strokeOpacity>0
   ?edgeStrokeEnvelope(segments,paint.widthSp*edgeSpToCss,paint.cap,paint.join,paint.miter).stroke:null;
  const fill=paint.operation!=='stroke'&&paint.fillOpacity>0?pathBounds(segments):null,bounds=[stroke,fill].filter(Boolean);
  if(bounds.length)contributions.push({id:'native-paint-'+i,role:'node-background',bound:unionBounds(bounds)});
 }
 contributions.push(...glyphs.map(g=>({id:g.id,nodeId:g.nodeId,bound:g.bound})));
 const ink=unionBounds(contributions.map(c=>c.bound)),root=unionBounds([picture,ink]);
 return{ink,root,contributions,converterInvoked:false,
  contract:'Measured global integer rectangle paths and driver pen state union original glyph ink and PGF picture bounds; existing cap/join envelopes; no arrow templates or inspection padding.'};
}
