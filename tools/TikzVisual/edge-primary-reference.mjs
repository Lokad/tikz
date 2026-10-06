// Reference evidence only. The original driver SVG remains immutable.
import assert from 'node:assert/strict';
import {edgeOracleVariants,edgeOracleInstructions,makeEdgeOracleSvg,nativeEdgeSegments,edgePtToCss} from './edge-oracle.mjs';

export const edgePrimaryContract={id:'native-edge-pt-short-glyph-six-v1',
  paths:'Shortest zero-to-five-decimal TeX-point dimensions recovering original integer sp; half-away-from-zero rounding.',
  pathTransform:'scale(1.32835201328352 -1.32835201328352)',glyphMatrices:6,paintDecimals:6,root:'native-ink-six',
  reference:'Original driver with only the independently verified omitted zero-length line restored. Original comparisons remain diagnostic.',
  source:'Frozen native PGF paths and shipped state, DVI positions and original glyph outlines. No converter input.'};

export async function restoreEdgeDriverDot(renderer,reference,metrics,original){
  if(metrics.caseId!=='clipping')return{svg:reference,corrections:[]};
  const index=metrics.driverState.paints.findIndex(p=>p.pathId===15),paint=metrics.driverState.paints[index],native=metrics.paths.find(p=>p.index===15),segments=nativeEdgeSegments(native);
  assert.equal(index,9);assert.equal(paint.operation,'stroke');assert.equal(paint.cap,1);assert.equal(paint.widthSp,3*65536);assert.equal(paint.strokeOpacity,1);assert.deepEqual(paint.strokeRgb,[0,0,1]);assert.deepEqual(paint.clips,[]);
  assert.equal(segments.length,2);assert.equal(segments[0].kind,'move');assert.equal(segments[1].kind,'line');assert.deepEqual(segments[0].to,segments[1].to);
  const point=segments[0].to,move=/^M(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)$/.exec(original.paths[index].d);assert.ok(move,'Unexpected omitted-line serialization.');
  assert.equal(Number(move[1])*65536,point.x);assert.equal(Number(move[2])*65536,point.y);
  assert.equal(original.paths[index].paint.stroke,'#00f');assert.equal(original.paths[index].paint['stroke-linecap'],'round');assert.equal(Number(original.paths[index].paint['stroke-width'])*65536,paint.widthSp);
  const replacement=original.paths[index].d+'L'+move[1]+' '+move[2];
  const svg=await renderer.page.evaluate(({reference,index,replacement,expected,count})=>{
    const doc=new DOMParser().parseFromString(reference,'image/svg+xml');if(doc.querySelector('parsererror')||doc.doctype)throw Error('Invalid original driver SVG.');
    const paths=[...doc.querySelectorAll('path')].filter(e=>!e.closest('defs')&&!e.closest('clipPath')),target=paths[index],before=new XMLSerializer().serializeToString(doc.documentElement),previous=target.getAttribute('d');
    if(paths.length!==count||previous!==expected)throw Error('Original driver metadata does not describe this SVG.');
    target.setAttribute('d',replacement);const result=new XMLSerializer().serializeToString(doc.documentElement);target.setAttribute('d',previous);
    if(before!==new XMLSerializer().serializeToString(doc.documentElement))throw Error('Derived correction changed more than its path data.');return result;
  },{reference,index,replacement,expected:original.paths[index].d,count:original.paths.length});
  return{svg,corrections:[{nativePathId:15,physicalPaintIndex:index,original:original.paths[index].d,restored:replacement,pointSp:point,widthSp:paint.widthSp,
    constructionCap:native.paint.cap,shippedCap:paint.cap,basis:'Both native backends retain the identical move and line; effective shipped state is an opaque blue round cap. Ordinary PDF retains the dot.'}]};
}

export async function buildEdgePrimaryReference(renderer,reference,metrics,glyphs,original,frame){
  const variant=edgeOracleVariants.find(v=>v.name==='native-pt-short-glyph-six'),instructions=edgeOracleInstructions(metrics,glyphs,original,variant);
  assert.ok(Math.abs(Number(edgePrimaryContract.pathTransform.match(/[\d.]+/)[0])-edgePtToCss)<2e-15);
  const transform=()=>edgePrimaryContract.pathTransform;
  for(const p of[...instructions.paths,...instructions.clips])p.transform=transform();
  const paintChecks=[];for(const p of instructions.paths)for(const k of['stroke-opacity','fill-opacity','stroke-miterlimit']){
    const previous=Number(p.paint[k]),text=previous.toFixed(6).replace(/0+$/,'').replace(/\.$/,'');assert.ok(Math.abs(Number(text)-previous)<=.000000500001);
    p.paint[k]=text;paintChecks.push({id:p.nativePathId,quantity:k,expected:previous,serialized:text,delta:Math.abs(Number(text)-previous),limit:.000000500001});
  }
  const native=await makeEdgeOracleSvg(renderer,reference,original,instructions,frame,edgePrimaryContract.root),driver=await restoreEdgeDriverDot(renderer,reference,metrics,original);
  return{nativeSvg:native.svg,referenceSvg:driver.svg,corrections:driver.corrections,serializationChecks:instructions.checks,paintChecks,rootChecks:native.rootChecks,root:native.root};
}
