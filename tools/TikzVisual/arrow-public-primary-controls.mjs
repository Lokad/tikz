import assert from 'node:assert/strict';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {arrowSourcePrimaryPlan,evaluateArrowSourcePrimary} from './arrow-source-primary-contract.mjs';
import {arrowSourcePrimaryFrame} from './arrow-source-primary-reference.mjs';
import {arrowPrimaryDefects,arrowPrimaryVisibility} from './arrow-primary-defects.mjs';
import {arrowPrimaryViewKey} from './arrow-primary-policy.mjs';
import {arrowPrimaryRegions} from './arrow-primary-contract.mjs';
import {arrowMeetFiles} from './arrow-meet-source-contract.mjs';
import {arrowPublicControlCase,arrowPublicControlAttribution,arrowPublicControlSvg} from './arrow-public-control-svg.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';

export const arrowPublicPrimaryControlPlan=arrowSourcePrimaryPlan;
export function arrowPublicPrimaryControl(view) {
  return (view.kind==='defect'?arrowPrimaryDefects:arrowPrimaryVisibility).find(c=>c.name===view.name);
}
export function arrowPublicPrimaryLabels(view) {
  return {referenceLabel:view.kind.startsWith('visibility-')?'Native faint\ncontrol':'PGF SVG',
    rightLabel:view.kind==='defect'||view.kind==='visibility-missing'?'Public SVG\nfault':view.kind==='visibility-calibration'?'Public faint\ncontrol':'Public SVG'};
}
export function arrowPublicPrimaryExpected(e,input,view) {
  const frame=e.frames.find(f=>f.caseId===view.caseId);assert.ok(frame);
  const c=arrowPublicControlCase(input,view.caseId),control=arrowPublicPrimaryControl(view);
  const native=e.primaryRecords.find(r=>r.view.id===view.id);assert.ok(native);
  return {frame,control,attribution:arrowPublicControlAttribution(c,control),
    reference:e.getRole('primary',native.files.reference).toString(),actual:arrowPublicControlSvg(c,control,view.kind)};
}
export async function captureArrowPublicPrimaryControl(renderer,e,input,view) {
  const expected=arrowPublicPrimaryExpected(e,input,view),{frame,control,reference,actual}=expected;
  const regions=arrowPrimaryRegions(frame),files=arrowMeetFiles(view,regions),synthetic=view.kind.startsWith('visibility-');
  const raw=await measureEdgeTrialPrimary(renderer,{reference,actual,leftIsDriver:!synthetic,origin:synthetic?{x:0,y:0}:frame.origin,camera:frame.camera,
    regions,...view,cropLimit:control?1:0,cropRegionIds:control?[control.target]:[],...arrowPublicPrimaryLabels(view)});
  const {images,crops,...numbers}=raw;
  assert.equal(numbers.repeat.rawChangedPixels,0);assert.equal(numbers.actualRepeat.rawChangedPixels,0);
  assertNativeEqual(Object.keys(images),Object.keys(files.images));
  assertNativeEqual(crops.map(c=>({id:c.id,presentation:c.presentation})),files.crops.map(c=>({id:c.id,presentation:c.presentation})));
  const sourceFrame=await arrowSourcePrimaryFrame(renderer,actual,frame.sourceEnvelope);
  return {record:{view,files,sourceFrame,attribution:expected.attribution,delta:null},numbers,images,crops,reference,actual,frame};
}
export function arrowPublicPrimaryBaseline(records,view) {
  const kind=view.kind==='visibility-missing'?'visibility-calibration':'calibration';
  const rows=records.filter(r=>r.view.caseId===view.caseId&&r.view.kind===kind&&arrowPrimaryViewKey(r.view)===arrowPrimaryViewKey(view)&&
    (kind==='calibration'||r.view.name===view.name));assert.equal(rows.length,1);return rows[0];
}
export async function arrowPublicPrimaryDelta(renderer,frame,view,baseline,actual) {
  const size={width:frame.camera.width*view.scale,height:frame.camera.height*view.scale};
  return (await decodeEdgeOraclePngPair(renderer,[baseline,actual],size,[{x:0,y:0,...size}],view.scale,view.background)).metrics[0];
}
export function summarizeArrowPublicPrimaryControls(e,records) {
  assertNativeEqual(records.map(r=>r.view),arrowPublicPrimaryControlPlan());
  const evaluations=records.map(r=>evaluateArrowSourcePrimary(e.primary,r));
  const faults=evaluations.filter(r=>r.view.kind==='defect'),visibility=evaluations.filter(r=>r.view.kind==='visibility-missing');
  const outcomes=['target-rejected','declared-invisible','no-raster-change','source-frame-rejected','visible-fault-accepted','rejected-outside-target'];
  const count=rows=>Object.fromEntries(outcomes.map(k=>[k,rows.filter(r=>r.sensitivity.outcome===k).length]));
  const summary={views:306,calibrationViews:72,defectViews:186,visibilityViews:48,
    baselinePasses:evaluations.filter(r=>r.view.kind==='calibration'&&r.passed).length,
    visibilityBaselinePasses:evaluations.filter(r=>r.view.kind==='visibility-calibration'&&r.passed).length,
    faults:count(faults),visibilityOutcomes:count(visibility),
    faultFamilies:arrowPrimaryDefects.map(c=>({name:c.name,views:faults.filter(r=>r.view.name===c.name).length,
      targetRejections:faults.filter(r=>r.view.name===c.name&&r.sensitivity.targetRejected).length,
      sourceFrameRejections:faults.filter(r=>r.view.name===c.name&&r.sensitivity.sourceFrameRejected).length})),
    visibility:visibility.map(r=>({name:r.view.name,view:arrowPrimaryViewKey(r.view),...r.sensitivity})),
    imageOnly:true,nativePoliciesUnchanged:true,publicImageAdmission:'pending'};
  assert.equal(summary.baselinePasses,72);assert.equal(summary.visibilityBaselinePasses,24);
  assert.equal(summary.faults['visible-fault-accepted'],0);assert.equal(summary.faults['rejected-outside-target'],0);
  assert.ok(summary.faultFamilies.every(c=>c.targetRejections>0||c.sourceFrameRejections>0));
  return {summary,evaluations};
}
