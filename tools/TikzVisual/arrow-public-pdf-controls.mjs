import assert from 'node:assert/strict';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {arrowSourcePdfPlan,arrowSourcePdfControl,arrowSourcePdfBaseline,evaluateArrowSourcePdf} from './arrow-source-pdf-model.mjs';
import {arrowPrimaryDefects,arrowPrimaryVisibility} from './arrow-primary-defects.mjs';
import {arrowPublicControlCase,arrowPublicControlAttribution,arrowPublicControlSvg} from './arrow-public-control-svg.mjs';
import {arrowViewportRegions,arrowViewportExtra,arrowViewportFrameCheck} from './arrow-viewport-model.mjs';
import {normalizeArrowViewport,addArrowViewportExtra} from './arrow-viewport-normalize.mjs';
import {arrowSourceCamera} from './arrow-source-envelope.mjs';
import {arrowPdfViewKey} from './arrow-pdf-policy.mjs';
import {measureShapePdfPair} from './shape-pdf-image-pair.mjs';
import {measureEdgePdfPair} from './edge-pdf-image-pair.mjs';
import {measureArrowPdfInk,attachArrowPdfInk} from './arrow-pdf-ink.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {arrowSourcePdfFocus} from './arrow-source-pdf-panels.mjs';

export const arrowPublicPdfControlPlan=arrowSourcePdfPlan;
export const arrowPublicPdfBaseline=arrowSourcePdfBaseline;
export async function arrowPublicPdfExpected(renderer,e,input,view){
  const frame=e.frames.find(f=>f.caseId===view.caseId),publicSource=view.route==='native-source';assert.ok(frame);
  const c=arrowPublicControlCase(input,view.caseId),control=arrowSourcePdfControl(view)??(view.kind==='visibility-calibration'?arrowPrimaryVisibility.find(c=>c.name===view.name):null);
  const calibration=input.bundle.pdf.find(r=>r.view.caseId===view.caseId&&r.view.route===(publicSource?'public-source':'original-source')&&r.view.raster===view.raster&&arrowPdfViewKey(r.view)===arrowPdfViewKey(view));assert.ok(calibration);
  const units=publicSource?'cssPixels':'bp',svgOriginBp=publicSource?{x:0,y:0}:frame.origin;
  let svg=publicSource?c.svg:input.bundle.read(calibration.source.files.svg).toString(),extra=null;
  if(publicSource&&['defect','visibility-calibration','visibility-missing'].includes(view.kind))svg=arrowPublicControlSvg(c,control,view.kind);
  if(view.kind==='extra-ink'){extra=arrowViewportExtra(frame,units,svgOriginBp);svg=addArrowViewportExtra(svg,extra);}
  if(view.kind==='padded-expanded'){
    const r=frame.sourceEnvelope.root,envelope={root:{x:r.x-8,y:r.y-8,width:r.width+16,height:r.height+16}};
    svg=(await normalizeArrowViewport(renderer,svg,units,svgOriginBp,arrowSourceCamera(envelope))).svg;
  }
  const normalized=await normalizeArrowViewport(renderer,svg,units,svgOriginBp,frame.paper.camera);
  const attribution=publicSource&&control?.target.startsWith('paint-')?arrowPublicControlAttribution(c,control):null;
  const rightLabel=view.kind==='extra-ink'?(publicSource?'Public extra ink':'PGF extra ink'):view.kind==='defect'||view.kind==='visibility-missing'?'Public SVG fault':view.kind==='visibility-calibration'?'Public faint control':publicSource?'Public SVG':'PGF SVG';
  return{frame,svg,scene:normalized.svg,normalization:normalized.proof,sourceFrame:arrowViewportFrameCheck(normalized.proof.sourceFrame,frame.sourceEnvelope.root),
    publicSource,units,svgOriginBp,extra,attribution,rightLabel};
}
export async function captureArrowPublicPdfControl(renderer,e,input,view){
  const physical=await arrowPublicPdfExpected(renderer,e,input,view),{frame}=physical,folder='views/'+view.id;
  const native=e.pdfRecords.find(r=>r.view.id===view.id);assert.ok(native);
  const pdf=e.getRole('pdf',native.files.pdf),record={view,publicSource:physical.publicSource,sourceFrame:physical.sourceFrame,normalization:physical.normalization,
    extra:physical.extra,attribution:physical.attribution,files:{pdf:native.files.pdf},sourceDelta:null,sceneDelta:null},captures={};
  for(const type of ['source','scene']){
    const svg=type==='source'?physical.svg:physical.scene,regions=type==='source'?frame.paper.regions:arrowViewportRegions(frame),measure=view.raster==='relative-viewport'?measureShapePdfPair:measureEdgePdfPair;
    const raw=await measure(renderer,{...physical,svg,camera:frame.paper.camera,regions,...view,pdfPage:'data:image/png;base64,'+pdf.toString('base64'),cropLimit:0,rightLabel:physical.rightLabel+' '+type});
    const{images,crops,...values}=raw;assert.equal(crops.length,0);
    for(const repeat of Object.values(values.repeat))assertNativeEqual(repeat,{exactRgbaMatch:true,rawChangedPixels:0,maxRawChannelError:0});
    const numbers=attachArrowPdfInk({...values,view,mode:view.caseId+'/'+view.route,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
      ...(type==='scene'?{outsideDiagramChangedPixels:raw.fullPage.rawChangedPixels-raw.regions[0].rawChangedPixels}:{}),rightLabel:physical.rightLabel+' '+type},
      await measureArrowPdfInk(renderer,[pdf,Buffer.from(images['svg-page'],'base64')],raw.pageSize,regions,view.scale));
    record.files[type]={svg:folder+'/'+type+'.svg',numbers:folder+'/'+type+'-numbers.json',images:Object.fromEntries(Object.keys(images).map(name=>[name,folder+'/'+type+'-'+name+'.png']))};
    captures[type]={svg,numbers,images};
  }
  return{record,captures,pdf,frame};
}
export async function arrowPublicPdfDelta(renderer,view,size,baseline,actual){
  return(await decodeEdgeOraclePngPair(renderer,[baseline,actual],size,[{x:0,y:0,...size}],view.scale,'white')).metrics[0];
}
export function arrowPublicPdfFocus(e,input,records){
  return arrowSourcePdfFocus(e.pdf,records,e.frames).map(p=>{
    const record=records.find(r=>r.view.id===p.viewId),target=/^(paint-\d+)(?:\..*)?$/.exec(p.regionId);
    const attribution=record.publicSource&&target?{...arrowPublicControlAttribution(arrowPublicControlCase(input,record.view.caseId),{target:target[1]}),nativeRegion:p.regionId}:null;
    return{...p,publicSource:record.publicSource,attribution,presentation:{integerEnlargement:8,rawDifferenceAmplification:16,
      order:['Ordinary PDF',record.publicSource?'Public SVG':'PGF SVG','Amplified raw difference']}};
  });
}
export function arrowPublicPdfIndex(summary,records,focus){
  return'<!doctype html><meta charset="utf-8"><title>Public arrow PDF controls</title><style>body{font:16px sans-serif;margin:24px;max-width:1300px}img{max-width:100%;image-rendering:pixelated}pre{white-space:pre-wrap}</style><h1>Public arrow source and scene PDF controls; admission pending</h1><p>Original PDF pages and native policies remain fixed. Numeric defect gates are bypassed. Source framing remains mandatory before physical-page normalization. A sheet uses integer enlargement x8; its red raw difference is amplified x16.</p><a href="report.json">Report</a> · <a href="summary.json">All outcomes</a><pre>'+JSON.stringify(summary,null,2)+'</pre>'+focus.filter(p=>p.viewId.includes('/1x-white')).map(p=>'<article><h2>'+p.viewId+' · '+p.type+' · '+p.regionId+'</h2><p>Ordinary PDF | '+(p.publicSource?'Public SVG':'PGF SVG')+' | amplified raw difference. <a href="views/'+p.viewId+'/record.json">Source attribution and gates</a></p><img src="'+p.images.sheet+'" alt="Paired fixed PDF and SVG crop"><a href="'+p.actual+'">Full saved SVG page</a></article>').join('')+'<h2>Every view</h2><ul>'+records.map(r=>'<li><a href="views/'+r.view.id+'/record.json">'+r.view.id+'</a></li>').join('')+'</ul>';
}
export function summarizeArrowPublicPdfControls(e,records){
  assertNativeEqual(records.map(r=>r.view),arrowPublicPdfControlPlan());
  const evaluations=records.map(r=>evaluateArrowSourcePdf(e.pdf,r)),byKind=kind=>evaluations.filter(r=>r.view.kind===kind),faults=byKind('defect'),extra=byKind('extra-ink'),padding=byKind('padded-expanded');
  const outcomes=rows=>Object.fromEntries(['target-rejected','no-raster-change','source-frame-rejected','visible-fault-accepted','rejected-outside-target'].map(k=>[k,rows.filter(r=>r.sensitivity.outcome===k).length]));
  const summary={views:396,sourceSceneCaptures:792,calibrationViews:96,defectViews:124,visibilityViews:32,extraInkViews:96,paddedExpandedViews:48,
    baselinePasses:byKind('calibration').filter(r=>r.passed).length,visibilityBaselinePasses:byKind('visibility-calibration').filter(r=>r.passed).length,
    faults:outcomes(faults),faultFamilies:arrowPrimaryDefects.map(c=>({name:c.name,views:faults.filter(r=>r.view.name===c.name).length,
      targetRejections:faults.filter(r=>r.view.name===c.name&&r.sensitivity.targetRejected).length,sourceFrameRejections:faults.filter(r=>r.view.name===c.name&&!r.sourceFrame.passed).length})),
    visibilityOutcomes:outcomes(byKind('visibility-missing')),visibility:byKind('visibility-missing').map(r=>({name:r.view.name,raster:r.view.raster,view:arrowPdfViewKey(r.view),...r.sensitivity})),
    extraInkTargetRejections:extra.filter(r=>r.sensitivity.targetRejected).length,extraInkSourceHidden:extra.filter(r=>!r.sensitivity.sourceChanged&&r.sourceFrame.passed&&r.source.passed).length,
    paddingUnchanged:records.filter(r=>r.view.kind==='padded-expanded'&&r.sourceDelta.rawChangedPixels===0&&r.sceneDelta.rawChangedPixels===0).length,
    paddingSourceFrameRejections:padding.filter(r=>!r.sourceFrame.passed).length,rootCrop:byKind('defect').filter(r=>r.view.name==='cropped-picture-root').map(r=>({view:r.view,sourceFramePassed:r.sourceFrame.passed,...r.sensitivity})),
    imageOnly:true,nativePoliciesUnchanged:true,publicImageAdmission:'pending'};
  assert.equal(summary.baselinePasses,96);assert.equal(summary.visibilityBaselinePasses,16);
  assert.equal(summary.faults['visible-fault-accepted'],0);assert.equal(summary.faults['rejected-outside-target'],0);
  assert.equal(summary.visibilityOutcomes['visible-fault-accepted'],0);assert.equal(summary.visibilityOutcomes['rejected-outside-target'],0);
  assert.ok(summary.faultFamilies.every(c=>c.targetRejections>0||c.sourceFrameRejections>0));
  assert.equal(summary.extraInkTargetRejections,96);assert.equal(summary.extraInkSourceHidden,96);assert.equal(summary.paddingUnchanged,48);assert.equal(summary.paddingSourceFrameRejections,48);
  return{summary,evaluations};
}
