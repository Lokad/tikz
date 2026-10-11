// Current output covers independent mechanisms and selected interactions.
// Frozen native calibration keeps its full product and per-view pixel policies.
import assert from 'node:assert/strict';
import {shapeViews} from './shape-primary-trial-policy.mjs';

export const iterationPrimaryViews=Object.freeze([
 {capture:'intrinsic-image',frame:'natural',scale:1,background:'white'},
 {capture:'intrinsic-image',frame:'natural',scale:4,background:'white'},
 {capture:'intrinsic-image',frame:'expanded',scale:1,background:'transparent'},
 {capture:'intrinsic-image',frame:'expanded',scale:4,background:'black'},
 {capture:'explicit-viewport',frame:'natural',scale:1,background:'white'},
 {capture:'explicit-viewport',frame:'natural',scale:4,background:'black'},
 {capture:'explicit-viewport',frame:'expanded',scale:1,background:'transparent'},
 {capture:'explicit-viewport',frame:'expanded',scale:4,background:'white'}
].map(Object.freeze));

export function verificationMode(flag){
 assert.ok(flag===undefined||flag==='--iteration'||flag==='--qualification','Unknown view selector.');
 return flag==='--iteration'?'iteration':'qualification';
}
export const qualificationViewPolicy='mechanisms-v1';
export const verificationViewPolicy=flag=>flag==='--qualification'?qualificationViewPolicy:undefined;
export const reusesOriginalReference=(mode,policy)=>mode==='iteration'||policy===qualificationViewPolicy;
export function currentPrimaryViews(mode,fixture,policy){
 assert.ok(['iteration','qualification'].includes(mode),'Unknown verification mode.');
 assert.ok(policy===undefined||policy===qualificationViewPolicy,'Unknown view policy.');
 if(policy!==undefined)assert.equal(mode,'qualification','Qualification policy on iteration.');
 const focused=mode==='iteration'||policy===qualificationViewPolicy;
 if(focused&&fixture==='smooth-plot-contract')return[...iterationPrimaryViews,
  {capture:'intrinsic-image',frame:'natural',scale:1,background:'transparent'}];
 return focused?iterationPrimaryViews:
  ['intrinsic-image','explicit-viewport'].flatMap(capture=>shapeViews.map(view=>({capture,...view})));
}
export function reportVerificationMode(primary,pdf){
 const mode=primary.report.verificationMode??'qualification';
 assert.equal(pdf.report.verificationMode??'qualification',mode,'Split verification modes.');
 assert.equal(primary.report.viewPolicy,pdf.report.viewPolicy,'Split view policies.');
 currentPrimaryViews(mode,undefined,primary.report.viewPolicy);return mode;
}
