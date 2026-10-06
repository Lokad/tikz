// A separate policy for a preselected, independently measured native-unit
// representation. The earlier CSS policies and their evidence stay intact.
import assert from 'node:assert/strict';
import {deriveShapeTrialPolicy} from './shape-primary-trial-policy.mjs';
import {deriveCurvedNodeInkPolicy} from './curved-node-ink-policy.mjs';
export const nativeCurvedMode='native-pgf-pt-short';
export function deriveNativeCurvedPolicies(primaryRows,pdfRows,camera,regions){
  assert.ok([...primaryRows,...pdfRows].every(r=>r.converterInvoked===false),'Candidate contributes to native-unit calibration.');
  const primary=deriveShapeTrialPolicy(primaryRows.map(r=>({...r,...r.metrics})),
    'Only the fixed 28 curved nodes; preselected global integer-sp PGF paths in shortest zero-to-five-decimal TeX points that recover each original sp; fixed six-decimal glyph matrices and semantic CSS root. Exact original-primary observations, no extra margin.');
  const nativePdf=deriveCurvedNodeInkPolicy(pdfRows,camera,regions,nativeCurvedMode);
  nativePdf.inkRule='Exact integer RGB sums of 255 minus every white-backed sample in the fixed native-page crops; one preselected independent short-TeX-point PGF representation per view, no margin, other representation extrema or candidate input.';
  nativePdf.nativeUnitContract={mode:nativeCurvedMode,coordinates:'Global integer scaled-point PGF soft path',decimals:'First zero-to-five-place TeX-point decimal recovering the original integer sp; half-away-from-zero rounding',glyphs:'Original outlined glyphs with native six-decimal CSS matrices',root:'Native picture and ink union, semantic six-decimal CSS root'};
  return{primary,nativePdf};
}
