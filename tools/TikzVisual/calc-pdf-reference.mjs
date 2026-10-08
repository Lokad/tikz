import assert from 'node:assert/strict';
import {buildCalcPrimaryReference} from './calc-primary-reference.mjs';
import {readCalcLayoutEvidence} from './calc-layout-evidence.mjs';
export async function buildCalcPdfReference(renderer,files,cache){
  const evidence=readCalcLayoutEvidence(Object.fromEntries(files),cache);
  const reference=files.get('svg-plain/reference.svg').toString(),frame=await buildCalcPrimaryReference(renderer,reference,cache);
  const {originPixels:origin,pageWidthSp,pageHeightSp}=evidence.registration,factor=96/(72.27*65536);
  const [minX,minY,maxX,maxY]=cache.pictureBoundsSp;
  const definitions=[{id:'whole-picture',rectangle:{x:-origin.x,y:-origin.y,width:pageWidthSp*factor,height:pageHeightSp*factor}},
    {id:'diagram',rectangle:{x:Math.floor(minX*factor)-8,y:Math.floor(-maxY*factor)-8,
      width:Math.ceil(maxX*factor)+8-(Math.floor(minX*factor)-8),height:Math.ceil(-minY*factor)+8-(Math.floor(-maxY*factor)-8)}},
    ...frame.regions.map(r=>({id:r.id,rectangle:{...r.rectangle,x:r.rectangle.x+frame.camera.x,y:r.rectangle.y+frame.camera.y}})),
    {id:'page-corner',rectangle:{x:16-origin.x,y:16-origin.y,width:8,height:8}}];
  const camera={origin,rasterSizes:evidence.rasterSizes};
  const regions=definitions.map(r=>({...r,rasterRectangles:Object.fromEntries([1,4].map(scale=>{
    const x=Math.floor((origin.x+r.rectangle.x)*scale),y=Math.floor((origin.y+r.rectangle.y)*scale);
    const q={x,y,width:Math.ceil((origin.x+r.rectangle.x+r.rectangle.width)*scale)-x,height:Math.ceil((origin.y+r.rectangle.y+r.rectangle.height)*scale)-y};
    const size=evidence.rasterSizes[scale+'x'];assert.ok(x>=0&&y>=0&&q.width>0&&q.height>0&&x+q.width<=size.width&&y+q.height<=size.height);
    return[scale+'x',q];}))}));
  return{evidence,frame,camera,regions,representations:[{id:'original-driver',svg:reference,units:'bp',svgOriginBp:frame.raw.origin},
    ...frame.representations.map(r=>({...r,units:'cssPixels',svgOriginBp:{x:0,y:0}}))]};
}
