// Per-view native-only PDF errors and integer ink/moment envelopes. No admission.
import assert from 'node:assert/strict';
import {deriveShapePdfTrialPolicy,evaluateShapePdfTrial,shapePdfViews} from './shape-pdf-trial-policy.mjs';
import {arrowInkSample} from './arrow-pdf-ink.mjs';
import {calcEqual} from './calc-saved-images.mjs';
export const calcPdfViews=shapePdfViews;
export const calcPdfKey=v=>v.frame+'/'+v.scale+'x';
export const calcPdfRoutes=['original-driver','driver-local-origin','physical-local-origin','physical-paths-native-bounds'];
export const calcPdfContract={id:'pgf-3.1.11a-calc-native-pdf-v1',routes:calcPdfRoutes,
  scope:'Fixed glyph-free calc fixture on its measured native PDF page; white background only. No new native clipping/opacity compatibility.'};
export function calcPdfInk(reference,actual,pageWidth,regions,scale){
  return regions.map(r=>({id:r.id,reference:arrowInkSample(reference,pageWidth,r.rasterRectangles[scale+'x']),
    actual:arrowInkSample(actual,pageWidth,r.rasterRectangles[scale+'x'])}));
}
function envelope(rows){
  const result=structuredClone(rows[0]);
  for(const r of rows){
    for(const k of ['rawChangedPixels','maxRawChannelError','premultipliedChangedPixels','maxPremultipliedChannelError','meanForegroundChannelError','foregroundPixels'])result[k]=Math.max(result[k],r[k]);
    assert.equal(r.referenceForegroundPixels,result.referenceForegroundPixels);assert.equal(r.topology.referenceComponents,result.topology.referenceComponents);
    assert.equal(r.topology.referenceEdgePixels,result.topology.referenceEdgePixels);assert.equal(r.topology.componentDifference,0);
    if(Math.abs(r.referenceForegroundPixels-r.actualForegroundPixels)>Math.abs(result.referenceForegroundPixels-result.actualForegroundPixels))result.actualForegroundPixels=r.actualForegroundPixels;
    result.topology.maxEdgeDisplacementRasterPixels=Math.max(result.topology.maxEdgeDisplacementRasterPixels,r.topology.maxEdgeDisplacementRasterPixels);
  }
  result.exactRgbaMatch=result.rawChangedPixels===0;return result;
}
export function deriveCalcPdfInkPolicy(rows,scope){
  calcEqual(rows.map(calcPdfKey).sort(),calcPdfViews.map(calcPdfKey).sort(),'Incomplete ink calibration views');
  return{schemaVersion:1,role:'unapproved-calc-pdf-ink-envelope',scope,approvedImagePolicy:false,imageConformanceClaim:false,
    rows:rows.map(row=>({frame:row.frame,scale:row.scale,regions:row.ink.map(r=>({id:r.id,reference:r.reference,
      limits:r.actual.map(c=>Object.fromEntries(Object.entries(c).map(([k,v])=>[k,{min:v,max:v}])))}))}))};
}
export function deriveCalcPdfPolicy(records,camera,regions){
  const required=calcPdfRoutes.flatMap(route=>calcPdfViews.map(v=>route+'/'+calcPdfKey(v)));
  calcEqual(records.map(r=>r.route+'/'+calcPdfKey(r)).sort(),required.sort(),'Incomplete native PDF calibration coverage');
  for(const r of records)assert.equal(r.converterInvoked,false,'Candidate-fed PDF calibration');
  const aggregate=calcPdfViews.map(view=>{
    const rows=records.filter(r=>calcPdfKey(r)===calcPdfKey(view)),base=rows[0];
    return{...base,mode:calcPdfContract.id,whole:{...base.whole,...envelope(rows.map(r=>r.whole))},
      regions:base.regions.map((r,i)=>({...r,...envelope(rows.map(row=>row.regions[i]))}))};
  });
  const pixels=deriveShapePdfTrialPolicy(aggregate,camera,regions,calcPdfContract.id);
  const ink=deriveCalcPdfInkPolicy(aggregate,calcPdfContract.scope);
  for(const row of ink.rows){const same=records.filter(r=>calcPdfKey(r)===calcPdfKey(row));
    for(const[regionIndex,r]of row.regions.entries())for(const record of same){const measured=record.ink[regionIndex];
      assert.equal(measured.id,r.id);calcEqual(measured.reference,r.reference,'Native PDF ink changed');
      for(let c=0;c<3;c++)for(const k of ['mass','x','y']){const value=measured.actual[c][k],limit=r.limits[c][k];limit.min=Math.min(limit.min,value);limit.max=Math.max(limit.max,value);}
    }
  }
  return{schemaVersion:1,role:'unapproved-native-calc-pdf-policy',contract:calcPdfContract,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,pixels,ink,
    derivation:'Pixel maxima and integer RGB mass/x/y moment minima/maxima across the four independently selected native routes, separately per view and region. No candidate input or margin.'};
}
export function evaluateCalcPdfInk(policy,row){
  assert.equal(policy.role,'unapproved-calc-pdf-ink-envelope');assert.equal(policy.approvedImagePolicy,false);assert.equal(policy.imageConformanceClaim,false);
  const same=policy.rows.filter(r=>calcPdfKey(r)===calcPdfKey(row));assert.equal(same.length,1);
  calcEqual(row.ink.map(r=>r.id),same[0].regions.map(r=>r.id),'Ink region coverage differs');
  const checks=row.ink.map((r,i)=>{const expected=same[0].regions[i];calcEqual(r.reference,expected.reference,'Reference PDF ink changed');
    const metrics=[];for(let c=0;c<3;c++)for(const k of ['mass','x','y']){
      const observed=r.actual[c][k],limit=expected.limits[c][k];assert.ok(Number.isSafeInteger(observed)&&observed>=0);
      metrics.push({quantity:['red','green','blue'][c]+'-'+k,observed,min:limit.min,max:limit.max,passed:observed>=limit.min&&observed<=limit.max});}
    return{id:r.id,passed:metrics.every(m=>m.passed),metrics};});
  return{passed:checks.every(c=>c.passed),checks};
}
export function evaluateCalcPdf(policy,row){
  assert.equal(policy.role,'unapproved-native-calc-pdf-policy');assert.equal(policy.converterInvoked,false);calcEqual(policy.contract,calcPdfContract,'PDF contract differs');
  const pixels=evaluateShapePdfTrial(policy.pixels,{frame:row.frame,scale:row.scale,background:'white'},row),ink=evaluateCalcPdfInk(policy.ink,row);
  const checks=pixels.checks.map(c=>{const supplement=ink.checks.find(i=>i.id===c.id);const metrics=supplement?[...c.metrics,...supplement.metrics]:c.metrics;
    return{...c,metrics,passed:metrics.every(m=>m.passed)};});
  return{passed:checks.every(c=>c.passed),pixelOnlyPassed:pixels.passed,inkPassed:ink.passed,checks};
}
