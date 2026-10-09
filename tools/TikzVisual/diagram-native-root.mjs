// Natural roots differ from conservative inspection cameras. Native paths,
// pen state and original glyph contours are the only inputs to this derivation.
import assert from 'node:assert/strict';
import {nativeEdgeSegments,edgeSpToCss} from './edge-oracle.mjs';
import {arrowWorldMatrix} from './arrow-native-frame.mjs';
import {edgeCssSegments,edgeStrokeEnvelope} from './edge-oracle-frame.mjs';
import {transformSegments,pathBounds,unionBounds} from './shape-frame-math.mjs';

export function diagramNativeNaturalRoot(metrics,picture,glyphs){
 assert.equal(metrics.driverState.passed,true);
 const paths=new Map(metrics.paths.map(p=>[p.id,p])),placements=new Map(metrics.placements.map(p=>[p.id,p])),contributions=[];
 for(const paint of metrics.driverState.paints){
  assert.equal(paint.clips.length,0,'These fixed diagrams contain no clipped paint.');
  const placement=paint.placementId===null?null:placements.get(paint.placementId);
  const path=paths.get(paint.pathId);assert.ok(path);assert.ok(paint.placementId===null||placement);
  if(placement){const[a,b,c,d]=placement.matrix;assert.ok(c===-b&&d===a,'Native tip pen requires a similarity transform.');}
  const segments=transformSegments(nativeEdgeSegments(path),arrowWorldMatrix(placement)),geometry=pathBounds(segments),scale=placement?Math.hypot(...placement.matrix.slice(0,2)):1;
  const stroke=paint.operation!=='fill'&&paint.strokeOpacity>0?edgeStrokeEnvelope(segments,paint.widthSp*edgeSpToCss*scale,paint.cap,paint.join,paint.miter):null;
  const fill=paint.operation!=='stroke'&&paint.fillOpacity>0?geometry:null,bounds=[stroke?.stroke,fill].filter(Boolean);
  if(bounds.length)contributions.push({id:'native-paint-'+paint.ordinal,role:paint.role,bound:unionBounds(bounds)});
 }
 contributions.push(...glyphs.map(g=>({id:g.id,nodeId:g.nodeId,bound:g.bound})));
 const ink=unionBounds(contributions.map(c=>c.bound)),root=unionBounds([picture,ink]);
 return{ink,root,contributions,converterInvoked:false,
  contract:'Observed PGF picture bounds union shipped native path/glyph ink; existing line caps/miter intersections, cubic pen envelopes and similarity tip pens. Conservative inspection padding is excluded.'};
}

// The style contract has measured global rectangle paths, not arrow templates.
export function rectangleNativeNaturalRoot(metrics,picture,glyphs){
 assert.equal(metrics.driverState.passed,true);
 assert.equal(metrics.nodes.length,7);assert.equal(metrics.constructionPaths.length,7);
 assert.ok(metrics.nodes.every(n=>n.shape==='rectangle'&&n.frame.slice(0,4).join(',')==='1.0,0.0,0.0,1.0'));
 const paths=new Map(metrics.constructionPaths.map(p=>[p.index,p])),contributions=[];
 for(const [i,paint]of metrics.driverState.paints.entries()){
  const path=paths.get(paint.pathId);assert.ok(path.owner.startsWith('node-'));
  assert.deepEqual(path.segments.map(s=>s.kind),['rectcorner','rectsize']);
  assert.equal(paint.operation,'stroke');assert.equal(paint.clips.length,0);
  const segments=edgeCssSegments(path),bounds=edgeStrokeEnvelope(segments,paint.widthSp*edgeSpToCss,paint.cap,paint.join,paint.miter).stroke;
  contributions.push({id:'native-paint-'+i,role:'node-background',bound:bounds});
 }
 contributions.push(...glyphs.map(g=>({id:g.id,nodeId:g.nodeId,bound:g.bound})));
 const ink=unionBounds(contributions.map(c=>c.bound)),root=unionBounds([picture,ink]);
 return{ink,root,contributions,converterInvoked:false,
  contract:'Measured global integer rectangle paths and driver pen state union original glyph ink and PGF picture bounds; existing cap/join envelopes; no arrow templates or inspection padding.'};
}
