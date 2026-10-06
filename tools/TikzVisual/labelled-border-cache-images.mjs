// Re-decode independent PNGs and reproduce controls from frozen independent SVGs.
import assert from 'node:assert/strict';
import {sha256} from './shape-oracle-bundle.mjs';
import {labelledSame,requireLabelledRenderer} from './labelled-border-cache.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';
import {shapePdfMetricRecord} from './shape-pdf-trial-policy.mjs';
import {labelledPdfView,labelledPdfViewKey} from './labelled-border-pdf-calibration-common.mjs';
import {measureShapePdfPair} from './shape-pdf-image-pair.mjs';

// This full-page channel loop is separate from the native-page comparator.
export async function decodeLabelledPngPair(renderer,images,size,rectangles,scale,background,scanPage=false){
  return renderer.page.evaluate(async({images,size,rectangles,scale,background,scanPage})=>{
    const buffers=[];
    for(const src of images){
      const im=new Image();im.src=src;await im.decode();
      if(im.width!==size.width||im.height!==size.height)throw Error('Independent PNG dimensions changed.');
      const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
      const ctx=canvas.getContext('2d',{colorSpace:'srgb',willReadFrequently:true});ctx.drawImage(im,0,0);
      buffers.push(ctx.getImageData(0,0,size.width,size.height).data);
    }
    const metrics=rectangles.map(rectangle=>globalThis.shapeRasterMetrics.compare(...buffers,
      {...size,scale,background,maskThreshold:16,rectangle}));let fullPage=null;
    if(scanPage){
      let rawChangedPixels=0,maxRawChannelError=0;
      for(let i=0;i<buffers[0].length;i+=4){let maximum=0;
        for(let channel=0;channel<4;channel++)maximum=Math.max(maximum,Math.abs(buffers[0][i+channel]-buffers[1][i+channel]));
        rawChangedPixels+=maximum!==0;maxRawChannelError=Math.max(maxRawChannelError,maximum);
      }
      fullPage={exactRgbaMatch:rawChangedPixels===0,rawChangedPixels,maxRawChannelError};
    }
    return {metrics,fullPage};
  },{images:images.map(b=>'data:image/png;base64,'+b.toString('base64')),size,rectangles,scale,background,scanPage});
}
export async function remeasureLabelledCache(e,renderer,save=async()=>{}){
  requireLabelledRenderer(renderer.identity,e.calibration.renderer);await installShapeMetrics(renderer);
  const {reports:r,get}=e;let metricsRecomputed=0,pagesRecomputed=0,controlPngsReproduced=0;
  async function pdfPair(o,images){
    const whole=o.whole.rasterRectangles[o.scale+'x'],size={width:whole.width,height:whole.height};
    const rectangles=[undefined,...o.regions.map(q=>{const b=q.rasterRectangles[o.scale+'x'];
      return {x:b.x-whole.x,y:b.y-whole.y,width:b.width,height:b.height};})];
    const m=await decodeLabelledPngPair(renderer,images,size,rectangles,o.scale,'white');
    const rows=[o.whole,...o.regions];
    for(let i=0;i<rows.length;i++)labelledSame(m.metrics[i],shapePdfMetricRecord(rows[i]),'Changed independent PDF PNG metric.');
    metricsRecomputed+=rows.length;
  }
  async function nativePair(c,o,actual,expected){
    const ref=c.observations.find(v=>v.mode==='native-ink'&&labelledPdfViewKey(v)===labelledPdfViewKey(o));
    const m=await decodeLabelledPngPair(renderer,[get('pdf',ref.artifacts['svg-page']),actual],c.camera.rasterSizes[o.scale+'x'],
      c.regions.map(q=>q.rasterRectangles[o.scale+'x']),o.scale,'white',true);
    if(expected){labelledSame(m.fullPage,expected.fullPage,'Changed independent native full page.');
      const rows=[expected.whole,...expected.regions];
      for(let i=0;i<rows.length;i++)labelledSame(m.metrics[i],shapePdfMetricRecord(rows[i]),'Changed independent native crop.');
      assert.equal(m.fullPage.rawChangedPixels-m.metrics[0].rawChangedPixels,expected.outsideWholeChangedPixels);
    }else{
      assert.equal(m.fullPage.exactRgbaMatch,true);
      assert.ok(m.metrics.every(q=>q.exactRgbaMatch&&q.rawChangedPixels===0&&q.maxRawChannelError===0));
    }
    metricsRecomputed+=m.metrics.length;pagesRecomputed++;
  }
  for(const c of r.primary.cases)for(const o of c.observations){
    const size={width:c.frame.camera.width*o.scale,height:c.frame.camera.height*o.scale};
    const rects=[undefined,...c.frame.regions.map(q=>Object.fromEntries(Object.entries(q.rectangle).map(([k,v])=>[k,v*o.scale])))];
    const m=await decodeLabelledPngPair(renderer,['reference','actual'].map(k=>get('primary',o.images[k])),size,rects,o.scale,o.background);
    labelledSame(m.metrics[0],o.metrics,'Changed independent primary whole metric.');
    for(let i=0;i<o.regions.length;i++)labelledSame(m.metrics[i+1],shapePdfMetricRecord(o.regions[i]),'Changed independent primary region metric.');
    metricsRecomputed+=m.metrics.length;
  }
  for(const c of r.pdf.cases){
    for(const o of c.observations)await pdfPair(o,['pdf','svg'].map(k=>get('pdf',o.artifacts[k])));
    for(const o of r.pdfOnly.baselines.find(q=>q.caseId===c.caseId).views)
      await nativePair(c,o,get('pdfOnly',o.artifacts['svg-page']));
  }
  for(let i=0;i<r.pdfOnly.controls.length;i++){
    const control=r.pdfOnly.controls[i],c=r.pdf.cases.find(q=>q.caseId===control.caseId);
    const svg=get('pdfOnly',control.caseId+'/'+control.name+'.svg').toString('utf8');
    for(let j=0;j<control.views.length;j++){
      const o=control.views[j],m=await measureShapePdfPair(renderer,{svg,units:'cssPixels',svgOriginBp:{x:0,y:0},
        camera:c.camera,regions:c.regions,...labelledPdfView(o),
        pdfPage:'data:image/png;base64,'+get('pdf',c.pdfPages[o.scale]).toString('base64'),cropLimit:0});
      for(const k of ['pdf','svg','svg-page']){
        const b=Buffer.from(m.images[k],'base64');assert.equal(sha256(b),r.pdfOnly.artifacts[o.artifacts[k]],'Independent control PNG changed: '+k);
        if(k==='svg-page'){controlPngsReproduced++;await save('controls/'+control.caseId+'/'+control.name+'/'+labelledPdfViewKey(o)+'.png',b);}
      }
      for(const k of ['sourceFrame','clipFrame','pageSize','fullPage','outsideWholeChangedPixels','repeat'])labelledSame(m[k],o[k]);
      await pdfPair(o,['pdf','svg'].map(k=>Buffer.from(m.images[k],'base64')));
      await nativePair(c,o,Buffer.from(m.images['svg-page'],'base64'),r.guard.controls[i].views[j].measurement);
    }
    console.log('Independent cached '+control.caseId+'/'+control.name+': original PNGs and metrics reproduced.');
  }
  assert.deepEqual([metricsRecomputed,pagesRecomputed,controlPngsReproduced],[17424,138,126]);
  return {metricsRecomputed,pagesRecomputed,controlPngsReproduced};
}
