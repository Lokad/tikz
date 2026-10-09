// Limits are exclusively the native-only observations in each exact view/region.
import assert from 'node:assert/strict';
import {deriveShapeTrialPolicy,evaluateShapeTrial,shapeViews,nativeMetricEnvelope as envelope} from './shape-primary-trial-policy.mjs';
import {calcPrimaryContract} from './calc-primary-reference.mjs';

export const calcPrimaryCaptures=['intrinsic-image','explicit-viewport'];
export const calcPrimaryViews=calcPrimaryCaptures.flatMap(capture=>shapeViews.map(v=>({capture,...v})));
export const calcPrimaryKey=v=>v.capture+'/'+v.frame+'/'+v.scale+'x-'+v.background;
export function deriveCalcPrimaryPolicy(records){
  const expected=calcPrimaryContract.representations.flatMap(encoding=>calcPrimaryViews.map(view=>encoding+'/'+calcPrimaryKey(view)));
  assert.deepEqual(records.map(r=>r.encoding+'/'+calcPrimaryKey(r)).sort(),expected.sort(),'Incomplete or duplicate native calibration views');
  for(const r of records){assert.equal(r.converterInvoked,false);assert.equal(r.repeat.rawChangedPixels,0);assert.equal(r.actualRepeat.rawChangedPixels,0);}
  const policies=calcPrimaryCaptures.map(capture=>{
    const aggregate=shapeViews.map(view=>{
      const rows=records.filter(r=>r.capture===capture&&r.frame===view.frame&&r.scale===view.scale&&r.background===view.background);
      assert.equal(rows.length,3);const regions=rows[0].regions.map((r,i)=>{
        for(const row of rows)assert.deepEqual({id:row.regions[i].id,rectangle:row.regions[i].rectangle},{id:r.id,rectangle:r.rectangle});
        return{...r,nodeId:null,kind:'path',...envelope(rows.map(row=>row.regions[i]))};
      });
      return{...view,...envelope(rows.map(r=>r.metrics)),regions};
    });
    return{capture,policy:deriveShapeTrialPolicy(aggregate,'Fixed calc native encodings; '+capture,shapeViews)};
  });
  return{schemaVersion:1,role:'unapproved-native-calc-primary-policy',converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
    contract:calcPrimaryContract,requiredViews:calcPrimaryViews,policies,
    derivation:'Per quantity maximum across the three declared native encodings in each view/region; only foreground means round upward to 1e-9.'};
}
export function evaluateCalcPrimary(policy,row){
  assert.equal(policy.role,'unapproved-native-calc-primary-policy');assert.equal(policy.converterInvoked,false);
  assert.equal(policy.approvedImagePolicy,false);assert.equal(policy.imageConformanceClaim,false);assert.deepEqual(policy.contract,calcPrimaryContract);
  const matched=policy.policies.filter(p=>p.capture===row.capture);assert.equal(matched.length,1);
  return evaluateShapeTrial(matched[0].policy,{frame:row.frame,scale:row.scale,background:row.background},
    {...row,regions:row.regions.map(r=>({...r,nodeId:null,kind:'path'}))});
}
