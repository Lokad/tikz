import assert from 'node:assert/strict';
import {deriveShapeTrialPolicy,evaluateShapeTrial,shapeViews} from './shape-primary-trial-policy.mjs';
import {edgePrimaryContract} from './curved-edge-primary-reference.mjs';
export const edgePrimaryViews=shapeViews;
export const edgePrimaryViewKey=v=>v.frame+'/'+v.scale+'x-'+v.background;
export function deriveEdgePrimaryPolicy(cases){
  assert.deepEqual(cases.map(c=>c.id),['continuation','styles','coordinates','nodes','clipping']);
  return{schemaVersion:1,comparisonKind:'unapproved-native-curved-edge-primary-policy',approvedImagePolicy:false,imageConformanceClaim:false,converterInvoked:false,
    contract:edgePrimaryContract,scope:'Five fixed curved to/edge fixtures only; original immutable PGF SVG reference, independently measured frames and regions.',
    cases:cases.map(c=>{
      assert.deepEqual(c.measurements.map(edgePrimaryViewKey),edgePrimaryViews.map(edgePrimaryViewKey));
      for(const o of c.measurements){assert.equal(o.converterInvoked,false);assert.equal(o.repeat.rawChangedPixels,0);assert.equal(o.actualRepeat.rawChangedPixels,0);}
      return{id:c.id,policy:deriveShapeTrialPolicy(c.measurements.map(o=>({...o,...o.metrics})),c.id+'; '+edgePrimaryContract.id,edgePrimaryViews)};
    })};
}
export function evaluateEdgePrimary(policy,id,row){
  assert.equal(policy.comparisonKind,'unapproved-native-curved-edge-primary-policy');
  assert.equal(policy.approvedImagePolicy,false);assert.equal(policy.imageConformanceClaim,false);assert.equal(policy.converterInvoked,false);
  assert.deepEqual(policy.contract,edgePrimaryContract);const c=policy.cases.filter(c=>c.id===id);assert.equal(c.length,1);
  return evaluateShapeTrial(c[0].policy,{frame:row.frame,scale:row.scale,background:row.background},row);
}
