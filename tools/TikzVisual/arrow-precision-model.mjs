// Orthogonal native-only serialization experiments; never candidate-derived.
import assert from 'node:assert/strict';
import {makeArrowNativeSvg,arrowNativeRepresentations} from './arrow-native-svg.mjs';
export const arrowPrecisionMasks=Array.from({length:8},(_,mask)=>({mask,
 shortGeometry:!!(mask&1),shortPen:!!(mask&2),shortPlacement:!!(mask&4)}));
export const arrowPenProbeWidths=['0.39998','0.39999','0.399993896484','0.399998','0.399999','0.4','0.400001','0.400002','0.40001'];
const attrs=a=>Object.entries(a).map(([k,v])=>' '+k+'="'+v+'"').join('');
const element=p=>'<path'+attrs({...p.attributes,d:p.d,...(p.transform?{transform:p.transform}:{})})+'/>';
const penKeys=['stroke-width','stroke-dasharray','stroke-dashoffset'];
export function arrowPrecisionHybrid(metrics,frame,mask){
 assert.ok(Number.isInteger(mask)&&mask>=0&&mask<8);
 const short=makeArrowNativeSvg(metrics,frame,arrowNativeRepresentations[0],'ink'),exact=makeArrowNativeSvg(metrics,frame,arrowNativeRepresentations[1],'ink');
 const paints=exact.instructions.paints.map((p,i)=>{const s=short.instructions.paints[i];
  assert.deepEqual({...p.attributes,...Object.fromEntries(penKeys.map(k=>[k,'controlled']))},{...s.attributes,...Object.fromEntries(penKeys.map(k=>[k,'controlled']))});
  assert.deepEqual([p.id,p.pathId,p.eventId,p.placementId,p.clips],[s.id,s.pathId,s.eventId,s.placementId,s.clips]);
  const attributes={...p.attributes};for(const key of penKeys)attributes[key]=(mask&2?s:p).attributes[key];
  return{...p,d:mask&1?s.d:p.d,transform:mask&4?s.transform:p.transform,attributes};
 });
 const clips=exact.instructions.clips.map((p,i)=>({...p,d:mask&1?short.instructions.clips[i].d:p.d}));
 const body='<defs>'+clips.map(c=>'<clipPath id="'+c.id+'" clipPathUnits="userSpaceOnUse">'+element({...c,attributes:{}})+'</clipPath>').join('')+'</defs>'+
  paints.map(p=>p.clips.reduceRight((s,id)=>'<g clip-path="url(#native-clip-'+id+')">'+s+'</g>',element(p))).join('');
 const svg=exact.svg.slice(0,exact.svg.indexOf('<defs>'))+body+'</svg>\n';
 if(mask===0)assert.equal(svg,exact.svg);if(mask===7)assert.equal(svg,short.svg);
 return{svg,paints,clips,factors:arrowPrecisionMasks[mask],basis:'Finite native dimensions; vary path/clip coordinates, pen/dash and placement translations independently between the declared short/twelve-digit TeX-point contracts.'};
}
export function arrowIsolatedPenProbe(metrics,frame,width){
 assert.ok(arrowPenProbeWidths.includes(width));const base=arrowPrecisionHybrid(metrics,frame,7),paint=base.paints[0];
 assert.equal(paint.placementId,null);assert.equal(paint.clips.length,0);assert.equal(paint.attributes.fill,'none');assert.equal(paint.attributes.stroke,'#000000');
 assert.equal(paint.attributes['stroke-dasharray'],'none');assert.match(paint.d,/^M[-\d.]+ [-\d.]+ L[-\d.]+ [-\d.]+$/);
 const actual={...paint,attributes:{...paint.attributes,'stroke-width':width}};
 const svg=base.svg.slice(0,base.svg.indexOf('<defs>'))+'<defs></defs>'+element(actual)+'</svg>\n';
 const native=metrics.driverState.paints[0];assert.equal(native.widthSp,26214);
 return{svg,record:{widthPt:width,widthSp:Number(width)*65536,recoveredSp:Math.round(Number(width)*65536),nativeWidthSp:native.widthSp,
  nativePaintOrdinal:1,nativePathId:native.pathId,baselinePrintedWidthPt:'0.4',physicalDeltaPt:Number(width)-.4,
  scope:'One native diagonal shaft; geometry, transform, paint, root and camera fixed. Only the serialized pen changes.'}};
}
