// Bind observed PGF integer paths to the frozen driver, independently of text.
import assert from 'node:assert/strict';
import {arrowSvgSegments,matchNativeArrowSvgOrder} from './arrow-driver-state.mjs';
import {identity,multiply,parseTransform,transformSegments,pathBounds,unionBounds} from './shape-frame-math.mjs';
import {nativeEdgeSegments,edgeSpToCss} from './edge-oracle.mjs';
import {arrowWorldMatrix} from './arrow-native-frame.mjs';
import {edgeStrokeEnvelope} from './edge-oracle-frame.mjs';
import {sha256} from './shape-oracle-bundle.mjs';

const caps={butt:0,round:1,square:2},joins={miter:0,round:1,bevel:2};
export function bindMathNativePaths(supplement,operations,framing){
 assert.equal(supplement.schemaVersion,1);assert.equal(supplement.role,'native-math-path-supplement');
 for(const k of ['drawingNoninterference','frozenDrawingUnchanged','frozenLayoutAndFontsUnchanged'])assert.equal(supplement.observation[k],true);
 assert.equal(supplement.sourceSha256,framing.sourceSha256);assert.equal(supplement.originalSvgSha256,framing.originalSvgSha256);
 const metrics=supplement.metrics;assert.equal(metrics.sourceSha256,supplement.sourceSha256);
 assert.deepEqual(metrics.pictureBounds,framing.pictureBounds);
 assert.deepEqual(metrics.pictureBox,Object.fromEntries(['widthSp','heightSp','depthSp'].map((k,i)=>[k,Number(framing.pictureBox[0][i])])));
 assert.equal(metrics.clips.length,0);
 const vectors=[],states=[];
 for(const op of operations){
  assert.equal(op.kind,'path');assert.ok(op.transforms.length>0);
  assert.match(op.transforms[0],/^translate\([-\d.]+,[-\d.]+\)scale\(0\.996264,-0\.996264\)$/);
  vectors.push({segments:arrowSvgSegments(op.d),matrix:op.transforms.slice(1).reduce((m,t)=>multiply(m,parseTransform(t)),identity)});
  const p=op.paint;assert.equal(p['stroke-dasharray'],'none');assert.equal(Number(p['stroke-dashoffset']),0);
  assert.ok([0,1].includes(Number(p['stroke-opacity']))&&[0,1].includes(Number(p['fill-opacity'])));
  assert.ok(p.fill==='none'||p.fill==='#000');assert.ok(p.stroke==='none'||p.stroke==='#000');
  states.push({stroke:p.stroke==='none'?null:p.stroke,fill:p.fill==='none'?null:p.fill});
 }
 const physical=matchNativeArrowSvgOrder(metrics,vectors,states),records=[],paints=[],checks=[];
 for(const [i,e]of physical.entries()){
  const op=operations[i],p=op.paint,placement=e.placementId?metrics.placements[e.placementId-1]:null;
  const matrix=arrowWorldMatrix(placement),segments=transformSegments(nativeEdgeSegments(e.path),matrix),geometry=pathBounds(segments);
  const cap=caps[p['stroke-linecap']],join=joins[p['stroke-linejoin']],miter=Number(p['stroke-miterlimit']);
  const scale=placement?Math.hypot(...placement.matrix.slice(0,2)):1;
  if(placement)assert.ok(placement.matrix[2]===-placement.matrix[1]&&placement.matrix[3]===placement.matrix[0]);
  const strokeOpacity=Number(p['stroke-opacity']),fillOpacity=Number(p['fill-opacity']);
  if(e.path.paint!=='fill'){
   const delta=Math.abs(Number(p['stroke-width'])*65536-e.path.lineWidthSp);
   assert.ok(delta<=.5,'Observed native path pen differs from original SVG.');
   assert.ok(framing.lineWidthsSp.includes(e.path.lineWidthSp));
   checks.push({id:op.id,quantity:'linewidth-sp',expected:e.path.lineWidthSp,actual:Number(p['stroke-width'])*65536,limit:.5,passed:true});
  }
  const stroke=e.path.paint!=='fill'&&strokeOpacity?edgeStrokeEnvelope(segments,e.path.lineWidthSp*edgeSpToCss*scale,cap,join,miter):null;
  const ink=unionBounds([stroke?.stroke,e.path.paint!=='stroke'&&fillOpacity?geometry:null].filter(Boolean));
  records.push({id:op.id,pathId:e.pathId,placementId:e.placementId??null,segments,geometry,ink});
  paints.push({ordinal:i+1,eventId:e.eventId,role:e.role,pathId:e.pathId,placementId:e.placementId??null,operation:e.path.paint,
   widthSp:e.path.lineWidthSp,cap,join,miter,strokeOpacity,fillOpacity,clips:[]});
 }
 const pathPaintSha256=sha256(Buffer.from(JSON.stringify(operations.map((op,i)=>({ordinal:op.ordinal,id:op.id,d:op.d,transforms:op.transforms,paint:op.paint,
  widthSp:states[i].stroke===null?null:Math.round(Number(op.paint['stroke-width'])*65536)})))));
 assert.equal(pathPaintSha256,framing.pathPaintSha256,'Native path supplement has different paint ownership.');
 // Evidence crosses JSON files; canonicalize signed zero at this boundary.
 return JSON.parse(JSON.stringify({metrics:{...metrics,driverState:{passed:true,paints}},records,checks,
  contract:'Unique PGF integer geometry/placement identities matched to original SVG order. Existing one-sp coordinate, half-sp pen and six-decimal matrix serialization limits; no candidate data.'}));
}
