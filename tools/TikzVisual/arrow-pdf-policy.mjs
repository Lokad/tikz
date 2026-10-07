import assert from 'node:assert/strict';
import {shapePdfViews} from './shape-pdf-trial-policy.mjs';
import {deriveEdgePdfPolicy} from './edge-pdf-policy.mjs';
export const arrowPdfViews=shapePdfViews;
export const arrowPdfViewKey=v=>v.frame+'/'+v.scale+'x-white';
export const arrowPdfContract={id:'native-arrow-paper-observations-v1',
 reference:'Unchanged ordinary PDF pages and fixed native scaled-point page origin; no pixel registration fit.',
 representations:'Original driver, native short-point picture root and native short-point ink root. Physical paints are unchanged.',
 raster:'Established relative-vertex PDF viewport route remains required. Absolute-vertex route is a separate diagnostic.',
 strict:'Existing PDF regional metric/ink contract attempted without relaxing a lost-edge failure.',
 fingerprint:'Prospective exact integer SVG ink mass and first x/y moments in each native-page region. This is not a cross-renderer pixel identity claim.',
 scope:'Six frozen glyph-free arrow fixtures only. Unapproved observations, not public admission.'};
export function arrowPdfStrictAttempt(rows,camera,regions,mode){
 try{return{state:'derived-unapproved',policy:deriveEdgePdfPolicy(rows,camera,regions,mode)};}
 catch(error){assert.equal(error.message,'Independent representation lost an entire edge set.','Unexpected PDF calibration failure');
  return{state:'ineligible',reason:error.message,lostEdges:rows.flatMap(row=>[row.whole,...row.regions]
   .filter(r=>!['measured','both-empty'].includes(r.topology.edgeState)).map(r=>({view:arrowPdfViewKey(row),region:r.id,topology:r.topology})))};}
}
export function deriveArrowInkPolicy(rows){
 assert.deepEqual(rows.map(arrowPdfViewKey),arrowPdfViews.map(arrowPdfViewKey));assert.ok(rows.every(r=>r.converterInvoked===false));
 const ids=[rows[0].whole.id,...rows[0].regions.map(r=>r.id)];
 return{kind:'unapproved-native-arrow-SVG-ink-fingerprint',converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
  rows:rows.map(row=>{const regions=[row.whole,...row.regions];assert.deepEqual(regions.map(r=>r.id),ids);
   for(const r of regions){const q=r.rasterRectangles[row.scale+'x'],area=q.width*q.height;
    for(const side of['reference','actual']){const m=r.inkMoments[side];assert.equal(m.length,3);
     for(const c of m){assert.deepEqual(Object.keys(c),['mass','x','y']);assert.ok(Object.values(c).every(n=>Number.isSafeInteger(n)&&n>=0));
      assert.ok(c.mass<=area*255&&c.x<=c.mass*(row.pageSize.width-1)&&c.y<=c.mass*(row.pageSize.height-1));}}
   }
   return{frame:row.frame,scale:row.scale,background:'white',regions:regions.map(r=>({id:r.id,inkMoments:r.inkMoments}))};})};
}
export function evaluateArrowInk(policy,row){
 assert.deepEqual([policy.kind,policy.converterInvoked,policy.approvedImagePolicy,policy.imageConformanceClaim],['unapproved-native-arrow-SVG-ink-fingerprint',false,false,false]);
 const matches=policy.rows.filter(r=>arrowPdfViewKey(r)===arrowPdfViewKey(row));assert.equal(matches.length,1);const expected=matches[0].regions,regions=[row.whole,...row.regions];
 assert.deepEqual(regions.map(r=>r.id),expected.map(r=>r.id));const checks=regions.map((r,i)=>{
  assert.deepEqual(r.inkMoments.reference,expected[i].inkMoments.reference,'PDF reference moments changed');
  return{id:r.id,passed:JSON.stringify(r.inkMoments.actual)===JSON.stringify(expected[i].inkMoments.actual)};});
 return{passed:checks.every(c=>c.passed),checks};
}
