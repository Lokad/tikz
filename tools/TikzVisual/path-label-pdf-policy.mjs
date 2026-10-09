// Independent original-driver and native-encoding PDF policies. No converter observations.
import assert from 'node:assert/strict';
import {calcEqual} from './calc-saved-images.mjs';
import {shapePdfViews,deriveShapePdfTrialPolicy} from './shape-pdf-trial-policy.mjs';
import {pathLabelImageEncodings,pathLabelDiagramImageEncodings} from './path-label-image-reference.mjs';

export function pathLabelPdfPolicies(records,pdf,encodingIds=pathLabelImageEncodings){
 calcEqual(encodingIds,encodingIds.includes('native-paths-pt-short')?pathLabelDiagramImageEncodings:pathLabelImageEncodings,'Changed native encoding set.');
 return nativePdfPolicies(records,pdf,encodingIds);
}
// Coverage is family-owned; native envelopes and unchanged PDF reference semantics are shared.
export function nativePdfPolicies(records,pdf,encodingIds){
 assert.ok(encodingIds.length>0&&new Set(encodingIds).size===encodingIds.length&&!encodingIds.includes('original'));
 const expected=['original',...encodingIds].flatMap(e=>shapePdfViews.map(v=>e+'/'+v.frame+'/'+v.scale));
 calcEqual(records.map(r=>r.encoding+'/'+r.frame+'/'+r.scale).sort(),expected.sort(),'Changed native PDF coverage.');
 const derive=(encoding,mode)=>deriveShapePdfTrialPolicy(records.filter(r=>r.encoding===encoding).map(r=>({...r,mode})),pdf.camera,pdf.regions,mode);
 const original=derive('original','original'),candidates=encodingIds.map(e=>derive(e,'candidate')),candidate=structuredClone(candidates[0]);
 for(const policy of candidates.slice(1)){
  calcEqual(policy.camera,candidate.camera);calcEqual(policy.regions,candidate.regions);
  for(let i=0;i<policy.rows.length;i++)for(let j=0;j<policy.rows[i].regions.length;j++){
   const a=candidate.rows[i].regions[j].limits,b=policy.rows[i].regions[j].limits;
   calcEqual(a.reference,b.reference,'Changed native PDF reference.');assert.equal(a.edgeState,b.edgeState);
   for(const key of Object.keys(a).filter(k=>typeof a[k]==='number'))a[key]=Math.max(a[key],b[key]);
  }
 }return{original,candidate};
}
