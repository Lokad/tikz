import assert from 'node:assert/strict';
import {shapeViews,deriveShapeTrialPolicy,evaluateShapeTrial} from './shape-primary-trial-policy.mjs';
import {arrowPrimaryContract} from './arrow-primary-reference.mjs';
export const arrowPrimaryViews=shapeViews;
export const arrowPrimaryCaseIds=['legacy-defaults','meta-defaults','dimensions','transforms','curves-nodes','paint-boundaries'];
export const arrowPrimaryViewKey=v=>v.frame+'/'+v.scale+'x-'+v.background;
export const arrowPrimaryView=v=>({frame:v.frame,scale:v.scale,background:v.background});
export function deriveArrowPrimaryPolicy(cases){
 assert.deepEqual(cases.map(c=>c.id),arrowPrimaryCaseIds);
 return{schemaVersion:1,comparisonKind:'unapproved-native-arrow-primary-policy',converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
  contract:arrowPrimaryContract,cases:cases.map(c=>{
   assert.deepEqual(c.measurements.map(arrowPrimaryViewKey),arrowPrimaryViews.map(arrowPrimaryViewKey));
   for(const o of c.measurements){assert.equal(o.converterInvoked,false);assert.equal(o.repeat.rawChangedPixels,0);assert.equal(o.actualRepeat.rawChangedPixels,0);}
   return{id:c.id,policy:deriveShapeTrialPolicy(c.measurements.map(o=>({...o,...o.metrics})),c.id+'; '+arrowPrimaryContract.id,arrowPrimaryViews)};
  })};
}
export function evaluateArrowPrimary(policy,caseId,observation){
 assert.deepEqual([policy.schemaVersion,policy.comparisonKind,policy.converterInvoked,policy.approvedImagePolicy,policy.imageConformanceClaim],
  [1,'unapproved-native-arrow-primary-policy',false,false,false]);
 assert.deepEqual(policy.contract,arrowPrimaryContract);assert.deepEqual(policy.cases.map(c=>c.id),arrowPrimaryCaseIds);
 return evaluateShapeTrial(policy.cases.find(c=>c.id===caseId).policy,arrowPrimaryView(observation),observation);
}
