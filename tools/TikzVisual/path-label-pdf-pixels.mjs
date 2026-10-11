// Shared native/current PDF pixel verification, independent of browser summaries.
import assert from 'node:assert/strict';
import {decodeCalcPng} from './calc-png.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {calcEqual} from './calc-saved-images.mjs';

export function pathLabelPdfPixelReader(bundle,pdf,nativePrefix='native'){
 const pagePrefix=bundle.json(nativePrefix+'/report.json').role==='diagram-arrow-native-reference'?nativePrefix+'/original':nativePrefix;
 return pdfPagePixelReader(bundle,pdf,pagePrefix);
}
// Family readers choose owned page paths; decoding and metric checks are identical.
export function pdfPagePixelReader(bundle,pdf,pagePrefix){
 const compare=createShapeRasterMetrics().compare,pages=new Map();
 return file=>{
  const row=bundle.json(file),page=pagePrefix+'/probed-pdf-page-'+row.scale+'x.png';
  if(!pages.has(page))pages.set(page,decodeCalcPng(bundle.files.get(page)));
  const a=pages.get(page),
   b=decodeCalcPng(bundle.files.get(row.images['svg-page']));
  calcEqual([a.width,a.height],[b.width,b.height]);calcEqual(row.pageSize,{width:a.width,height:a.height});calcEqual(row.pageSize,pdf.camera.rasterSizes[row.scale+'x']);
  let changed=0,maximum=0;for(let i=0;i<a.rgba.length;i+=4){let error=0;for(let c=0;c<4;c++)error=Math.max(error,Math.abs(a.rgba[i+c]-b.rgba[i+c]));changed+=error!==0;maximum=Math.max(maximum,error);}
  calcEqual(row.fullPage,{exactRgbaMatch:changed===0,rawChangedPixels:changed,maxRawChannelError:maximum},'Decoded full PDF-page metrics differ.');
  const regions=[row.whole,...row.regions];
  calcEqual(regions.map(({id,rectangle,rasterRectangles})=>({id,rectangle,rasterRectangles})),pdf.regions.map(({id,rectangle,rasterRectangles})=>({id,rectangle,rasterRectangles})),'Changed PDF crop coverage.');
  for(const region of regions){const rectangle=region.rasterRectangles[row.scale+'x'];
   const actual=compare(a.rgba,b.rgba,{width:a.width,height:a.height,scale:row.scale,background:'white',maskThreshold:16,rectangle});
   calcEqual(actual,Object.fromEntries(Object.keys(actual).map(k=>[k,region[k]])),'Decoded PDF region differs: '+file+'/'+region.id);
  }
  assert.equal(row.outsideWholeChangedPixels,changed-row.whole.rawChangedPixels);
  for(const repeat of Object.values(row.repeat))calcEqual(repeat,{exactRgbaMatch:true,rawChangedPixels:0,maxRawChannelError:0});return row;
 };
}
