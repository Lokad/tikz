// Register both native reference representations on the unchanged ordinary PDF page.
import assert from 'node:assert/strict';
import {edgeSpToCss} from './edge-oracle.mjs';
import {shapePdfRasterRectangle} from './shape-pdf-camera.mjs';
import {measureShapePdfPair} from './shape-pdf-image-pair.mjs';

export function edgeOraclePdfRegions(metrics,frame){
  const camera={...metrics.pdfCamera,physicalPage:{width:metrics.pdfCamera.page.widthSp*edgeSpToCss,height:metrics.pdfCamera.page.heightSp*edgeSpToCss}};
  // Diagnostic padding may extend beyond paper. Its intersection is declared;
  // actual native ink must fit the page and every local region remains measured.
  for(const r of frame.records.filter(r=>r.bound))assert.ok(camera.origin.x+r.bound.minX>=0&&camera.origin.y+r.bound.minY>=0
    &&camera.origin.x+r.bound.maxX<=camera.physicalPage.width&&camera.origin.y+r.bound.maxY<=camera.physicalPage.height,'Native ink escapes PDF paper.');
  const onPaper=r=>{
    const x=Math.max(r.x,-camera.origin.x),y=Math.max(r.y,-camera.origin.y),right=Math.min(r.x+r.width,camera.physicalPage.width-camera.origin.x),bottom=Math.min(r.y+r.height,camera.physicalPage.height-camera.origin.y);
    assert.ok(right>x&&bottom>y,'Required native region misses PDF paper.');return{x,y,width:right-x,height:bottom-y};
  };
  const rows=[{id:'whole-picture',kind:'picture',rectangle:onPaper(frame.camera)},...frame.regions.map(r=>({id:r.id,kind:r.kind,nativePathId:r.nativePathId??null,nodeId:r.nodeId??null,
    rectangle:onPaper({x:frame.camera.x+r.rectangle.x,y:frame.camera.y+r.rectangle.y,width:r.rectangle.width,height:r.rectangle.height})}))];
  return{camera,regions:rows.map(r=>({...r,rasterRectangles:Object.fromEntries([1,4].map(scale=>[scale+'x',shapePdfRasterRectangle(r.rectangle,camera,scale)])),
    basis:'Native saved page origin and fixed native regions; only diagnostic padding is intersected with physical paper.'}))};
}

export async function observeEdgeOraclePdf(renderer,{metrics,frame,reference,semantic,pdfPage,scale}){
  const {camera,regions}=edgeOraclePdfRegions(metrics,frame),result=[];
  for(const route of['original-driver','native-semantic']){
    const observation=await measureShapePdfPair(renderer,{svg:route==='original-driver'?reference:semantic,pdfPage,scale,camera,regions,
      frame:'expanded',units:route==='original-driver'?'bp':'cssPixels',svgOriginBp:route==='original-driver'?frame.origin:{x:0,y:0},
      cropLimit:2,cropRegionIds:metrics.caseId==='clipping'?['path-15','path-15.endpoint-0']:['glyph-0'],rightLabel:route});
    assert.equal(observation.repeat.pdf.rawChangedPixels,0);assert.equal(observation.repeat.svg.rawChangedPixels,0);
    result.push({route,...observation});
  }
  return{camera,regions,observations:result};
}
