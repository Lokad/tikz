// Re-render expected SVGs; consistent saved-image hashes are insufficient.
import assert from 'node:assert/strict';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {arrowPrimaryRegions} from './arrow-primary-contract.mjs';
import {arrowPrimaryViewKey} from './arrow-primary-policy.mjs';
import {arrowPdfViewKey} from './arrow-pdf-policy.mjs';
import {arrowViewportRegions} from './arrow-viewport-model.mjs';
import {normalizeArrowViewport} from './arrow-viewport-normalize.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {measureShapePdfPair} from './shape-pdf-image-pair.mjs';
import {measureEdgePdfPair} from './edge-pdf-image-pair.mjs';
import {measureArrowPdfInk, attachArrowPdfInk} from './arrow-pdf-ink.mjs';

function matchImages(files, images, read, context) {
  assertNativeEqual(Object.keys(images), Object.keys(files));
  for (const [name, image] of Object.entries(images))
    assert.ok(Buffer.from(image, 'base64').equals(read(files[name])), 'SVG/image binding changed: ' + context + '/' + name);
  return Object.keys(images).length;
}

export async function verifyArrowPublicMeetPrimaryCapture(renderer, e, row, read) {
  const v=row.view, f=e.frames.find(f=>f.caseId===v.caseId), native=v.route==='native-source';
  const reference=e.getRole('primary','views/'+v.caseId+'/calibration/source/'+arrowPrimaryViewKey(v)+'/'+(native?'actual':'reference')+'.svg').toString();
  const actual=read('numeric/'+v.caseId+'/candidate.svg').toString();
  assert.equal(read(row.files.reference).toString(),reference);assert.equal(read(row.files.actual).toString(),actual);
  const raw=await measureEdgeTrialPrimary(renderer,{reference,actual,leftIsDriver:!native,origin:native?{x:0,y:0}:f.origin,camera:f.camera,...v,
    regions:arrowPrimaryRegions(f),cropLimit:v.scale===1&&v.background==='white'?4:0,referenceLabel:native?'Native SVG':'PGF SVG',rightLabel:'Public SVG'});
  const {images,crops,...numbers}=raw;
  let count=matchImages(row.files.images,images,read,v.id);
  assertNativeEqual(crops.map(c=>({id:c.id,presentation:c.presentation})),row.files.crops.map(c=>({id:c.id,presentation:c.presentation})));
  for(const [i,crop] of crops.entries())count+=matchImages(row.files.crops[i].images,{...crop.paired,sheet:crop.sheet},read,v.id+'/crop-'+crop.id);
  assertNativeEqual(numbers,row.numbers,'Primary capture quantities changed: '+v.id);return count;
}

export async function verifyArrowPublicMeetPdfCapture(renderer,e,row,type,read) {
  assert.ok(['source','scene'].includes(type));
  const v=row.view,f=e.frames.find(f=>f.caseId===v.caseId),publicSource=v.route==='public-source',route=publicSource?'native-source':'original-source';
  const baseline=JSON.parse(e.get('views/'+v.caseId+'/calibration/'+route+'/'+v.raster+'/baseline/'+arrowPdfViewKey(v)+'/record.json'));
  const candidate=publicSource?read('numeric/'+v.caseId+'/candidate.svg').toString():null;
  const normalized=publicSource&&type==='scene'?await normalizeArrowViewport(renderer,candidate,'cssPixels',{x:0,y:0},f.paper.camera):null;
  const svg=publicSource?(type==='source'?candidate:normalized.svg):e.get(baseline.files[type].svg).toString();
  assert.equal(read(row[type].files.svg).toString(),svg);
  const pdfBytes=e.get('reference/'+v.caseId+'/pdf-page-'+v.scale+'x.png'),regions=type==='source'?f.paper.regions:arrowViewportRegions(f);
  assert.ok(read(row.pdf).equals(pdfBytes));
  const measure=v.raster==='relative-viewport'?measureShapePdfPair:measureEdgePdfPair;
  const raw=await measure(renderer,{svg,units:publicSource?'cssPixels':'bp',svgOriginBp:publicSource?{x:0,y:0}:f.origin,camera:f.paper.camera,regions,...v,
    pdfPage:'data:image/png;base64,'+pdfBytes.toString('base64'),cropLimit:0,rightLabel:(publicSource?'Public SVG':'PGF SVG')+' '+type});
  const {images,crops,...values}=raw;assert.equal(crops.length,0);
  const count=matchImages(row[type].files.images,images,read,v.id+'/'+type),png=Buffer.from(images['svg-page'],'base64');
  const numbers=attachArrowPdfInk({...values,mode:v.caseId+'/'+route,converterInvoked:publicSource,approvedImagePolicy:false,imageConformanceClaim:false,
    ...(type==='scene'?{outsideDiagramChangedPixels:raw.fullPage.rawChangedPixels-raw.regions[0].rawChangedPixels}:{})},
    await measureArrowPdfInk(renderer,[pdfBytes,png],raw.pageSize,regions,v.scale));
  assertNativeEqual(numbers,row[type].numbers,'Physical-page capture quantities changed: '+v.id+'/'+type);return count;
}
