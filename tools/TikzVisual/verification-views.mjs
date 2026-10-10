// Affected iteration covers mechanisms and selected interactions. Native
// calibration and final qualification retain every originally required view.
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
 assert.ok(flag===undefined||flag==='--iteration','Only --iteration is an optional view selector.');
 return flag?'iteration':'qualification';
}
export function currentPrimaryViews(mode,fixture){
 assert.ok(['iteration','qualification'].includes(mode),'Unknown verification mode.');
 if(mode==='iteration'&&fixture==='smooth-plot-contract')return[...iterationPrimaryViews,
  {capture:'intrinsic-image',frame:'natural',scale:1,background:'transparent'}];
 return mode==='iteration'?iterationPrimaryViews:
  ['intrinsic-image','explicit-viewport'].flatMap(capture=>shapeViews.map(view=>({capture,...view})));
}
export function reportVerificationMode(primary,pdf){
 const mode=primary.report.verificationMode??'qualification';
 assert.equal(pdf.report.verificationMode??'qualification',mode,'Split verification modes.');
 currentPrimaryViews(mode);return mode;
}
