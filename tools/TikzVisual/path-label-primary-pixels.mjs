// Shared by complete-text sensitivity and fresh-output checking. Independent PNG decoding.
import assert from 'node:assert/strict';
import {decodeCalcPng} from './calc-png.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {calcEqual} from './calc-saved-images.mjs';

export function pathLabelPrimaryPixelReader(bundle,frame){
 const compare=createShapeRasterMetrics().compare,references=new Map();
 return file=>{
  const row=bundle.json(file),ref=row.images.reference;
  if(!references.has(ref))references.set(ref,decodeCalcPng(bundle.files.get(ref)));
  const a=references.get(ref),b=decodeCalcPng(bundle.files.get(row.images.actual));
  calcEqual([a.width,a.height],[frame.camera.width*row.scale,frame.camera.height*row.scale],'Changed camera raster.');
  calcEqual([a.width,a.height],[b.width,b.height],'Changed paired raster.');
  const options={width:a.width,height:a.height,scale:row.scale,background:row.background,maskThreshold:16};
  calcEqual(compare(a.rgba,b.rgba,options),row.metrics,'Decoded whole metrics differ: '+file);
  calcEqual(row.regions.map(({id,rectangle})=>({id,rectangle})),frame.regions.map(({id,rectangle})=>({id,rectangle})),'Changed local regions.');
  for(const region of row.regions){
   const rectangle=Object.fromEntries(Object.entries(region.rectangle).map(([k,v])=>[k,v*row.scale]));
   const actual=compare(a.rgba,b.rgba,{...options,rectangle});
   calcEqual(actual,Object.fromEntries(Object.keys(actual).map(k=>[k,region[k]])),'Decoded local metrics differ: '+file+'/'+region.id);
  }
  assert.equal(row.repeat.rawChangedPixels,0);assert.equal(row.actualRepeat.rawChangedPixels,0);return row;
 };
}
