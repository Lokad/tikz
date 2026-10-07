// Native-only fixed curved representation; no candidate calibration/admission.
import assert from 'node:assert/strict';
import {edgePdfViews, edgePdfViewKey, deriveEdgePdfPolicy as deriveFixed, evaluateEdgePdfPolicy as evaluateFixed} from './edge-pdf-policy.mjs';
import {edgePrimaryContract} from './curved-edge-primary-reference.mjs';
export {edgePdfViews, edgePdfViewKey};
export const edgePdfRoutes = ['original-driver', 'native-semantic'];
export const edgePdfCalibratedRoutes = edgePdfRoutes;
export function deriveEdgePdfPolicy(rows, camera, regions, mode) {
  return {...deriveFixed(rows, camera, regions, mode), calibrationFamily: 'native-curved-edge-pdf-v1', contract: edgePrimaryContract,
    inkRule: 'Exact integer RGB sums on opaque white native-page crops for one preselected curved representation; independent PDF reference sums fixed. No candidate input or fitted margin.'};
}
export function evaluateEdgePdfPolicy(policy, row) {
  assert.equal(policy.calibrationFamily, 'native-curved-edge-pdf-v1');
  assert.deepEqual(policy.contract, edgePrimaryContract);
  return evaluateFixed(policy, row);
}
