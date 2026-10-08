// Fresh baseline capture using unchanged frozen native limits.
import assert from 'node:assert/strict';
import {arrowPublicPrimaryPlan, arrowPublicPdfPlan, evaluateArrowPublicPrimary, evaluateArrowPublicPdf, arrowPublicExactPage, finishArrowPublicBaselines} from './arrow-public-source-policy.mjs';
import {arrowPrimaryRegions} from './arrow-primary-contract.mjs';
import {arrowPrimaryViewKey} from './arrow-primary-policy.mjs';
import {arrowPdfViewKey} from './arrow-pdf-policy.mjs';
import {normalizeArrowViewport} from './arrow-viewport-normalize.mjs';
import {arrowViewportFrameCheck, arrowViewportRegions} from './arrow-viewport-model.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {measureShapePdfPair} from './shape-pdf-image-pair.mjs';
import {measureEdgePdfPair} from './edge-pdf-image-pair.mjs';
import {measureArrowPdfInk, attachArrowPdfInk} from './arrow-pdf-ink.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';


export async function captureArrowCurrentBaselines(renderer,e,numeric,read,save,json){
  const primary=[],pdf=[],frames=[];let combined;
  const candidates=new Map();
  for(const f of e.frames){
    const svg=(await read('numeric/'+f.caseId+'/candidate.svg')).toString(),normalized=await normalizeArrowViewport(renderer,svg,'cssPixels',{x:0,y:0},f.paper.camera);
    candidates.set(f.caseId,{svg,scene:normalized.svg,normalization:normalized.proof});
    frames.push({caseId:f.caseId,sourceFrame:arrowViewportFrameCheck(normalized.proof.sourceFrame,f.sourceEnvelope.root),normalization:normalized.proof});
  }
  await json('frames.json',frames);
  for(const v of arrowPublicPrimaryPlan()){
    const f=e.frames.find(f=>f.caseId===v.caseId),native=v.route==='native-source',folder='views/'+v.id;
    const reference=e.getRole('primary','views/'+v.caseId+'/calibration/source/'+arrowPrimaryViewKey(v)+'/'+(native?'actual':'reference')+'.svg').toString();
    const actual=candidates.get(v.caseId).svg;
    const raw=await measureEdgeTrialPrimary(renderer,{reference,actual,leftIsDriver:!native,origin:native?{x:0,y:0}:f.origin,camera:f.camera,...v,regions:arrowPrimaryRegions(f),cropLimit:v.scale===1&&v.background==='white'?4:0,
      referenceLabel:native?'Native SVG':'PGF SVG',rightLabel:'Public SVG'});
    const {images,crops,...numbers}=raw,files={reference:folder+'/reference.svg',actual:folder+'/actual.svg',numbers:folder+'/numbers.json',images:{},crops:[]};
    await save(files.reference,reference);await save(files.actual,actual);
    for(const [k,b64] of Object.entries(images)){files.images[k]=folder+'/'+k+'.png';await save(files.images[k],Buffer.from(b64,'base64'));}
    for(const c of crops){const q={id:c.id,presentation:c.presentation,images:{}};for(const [k,b64]of Object.entries({...c.paired,sheet:c.sheet})){q.images[k]=folder+'/crop-'+c.id+'-'+k+'.png';await save(q.images[k],Buffer.from(b64,'base64'));}files.crops.push(q);}
    const row={view:v,numbers,files};row.evaluation=evaluateArrowPublicPrimary(e,row);await json(files.numbers,numbers);await json(folder+'/record.json',row);primary.push(row);
    if(v.scale===4&&v.background==='black'&&v.frame==='expanded')console.log('Public primary measured: '+v.caseId+'/'+v.route);
  }
  await json('primary.json',primary);
  for(const v of arrowPublicPdfPlan()){
    const f=e.frames.find(f=>f.caseId===v.caseId),publicSource=v.route==='public-source',policyRoute=publicSource?'native-source':'original-source';
    const calibrationId=v.caseId+'/calibration/'+policyRoute+'/'+v.raster+'/baseline/'+arrowPdfViewKey(v),baseline=JSON.parse(e.get('views/'+calibrationId+'/record.json'));
    const folder='views/'+v.id,pdfBytes=e.get('reference/'+v.caseId+'/pdf-page-'+v.scale+'x.png'),pdfFile='reference/'+v.caseId+'/pdf-page-'+v.scale+'x.png';await save(pdfFile,pdfBytes);
    const row={view:v,sourceFrame:publicSource?frames.find(q=>q.caseId===v.caseId).sourceFrame:baseline.sourceFrame,pdf:pdfFile};
    for(const type of ['source','scene']){
      const svg=publicSource?(type==='source'?candidates.get(v.caseId).svg:candidates.get(v.caseId).scene):e.get(baseline.files[type].svg).toString();
      const regions=type==='source'?f.paper.regions:arrowViewportRegions(f),measure=v.raster==='relative-viewport'?measureShapePdfPair:measureEdgePdfPair;
      const raw=await measure(renderer,{svg,units:publicSource?'cssPixels':'bp',svgOriginBp:publicSource?{x:0,y:0}:f.origin,camera:f.paper.camera,regions,...v,
        pdfPage:'data:image/png;base64,'+pdfBytes.toString('base64'),cropLimit:0,rightLabel:(publicSource?'Public SVG':'PGF SVG')+' '+type});
      const {images,crops,...values}=raw;assert.equal(crops.length,0);const png=Buffer.from(images['svg-page'],'base64');
      const numbers=attachArrowPdfInk({...values,mode:v.caseId+'/'+policyRoute,converterInvoked:publicSource,approvedImagePolicy:false,imageConformanceClaim:false,
        ...(type==='scene'?{outsideDiagramChangedPixels:raw.fullPage.rawChangedPixels-raw.regions[0].rawChangedPixels}:{})},await measureArrowPdfInk(renderer,[pdfBytes,png],raw.pageSize,regions,v.scale));
      const files={svg:folder+'/'+type+'.svg',numbers:folder+'/'+type+'-numbers.json',images:{}};await save(files.svg,svg);await json(files.numbers,numbers);
      for(const [k,b64]of Object.entries(images)){files.images[k]=folder+'/'+type+'-'+k+'.png';await save(files.images[k],Buffer.from(b64,'base64'));}
      const exact=arrowPublicExactPage(await decodeEdgeOraclePngPair(renderer,[e.get(baseline.files[type].images['svg-page']),png],raw.pageSize,regions.map(r=>r.rasterRectangles[v.scale+'x']),v.scale,'white',true));
      row[type]={numbers,files,evaluation:evaluateArrowPublicPdf(e,v,type,numbers),exact,qualifiedRaster:baseline.files[type].images['svg-page']};
    }
    await json(folder+'/record.json',row);pdf.push(row);
    if(v.frame==='expanded'&&v.scale===4)console.log('Public PDF measured: '+v.caseId+'/'+v.route+'/'+v.raster);
  }
  await json('pdf.json',pdf);combined=finishArrowPublicBaselines(numeric,frames,primary,pdf);await json('combined.json',combined);
  return{numeric,frames,primary,pdf,combined};
}
