// Prospective fixed-fixture gates. No candidate calibration or admission.
import assert from 'node:assert/strict';
import {shapePdfViews, deriveShapePdfTrialPolicy, evaluateShapePdfTrial} from './shape-pdf-trial-policy.mjs';

export const edgePdfViews = shapePdfViews;
export const edgePdfViewKey = v => v.frame + '-' + v.scale + 'x-' + v.background;
export const edgePdfRoutes = ['original-driver', 'derived-driver', 'native-semantic'];
export const edgePdfCalibratedRoutes = ['derived-driver', 'native-semantic'];
const tuple = v => ({frame: v.frame, scale: v.scale, background: v.background});

function coverage(row, region, camera) {
  assert.deepEqual(row.pageSize, camera.rasterSizes[row.scale + 'x']);
  const c = region.inkCoverage, q = region.rasterRectangles[row.scale + 'x'];
  assert.equal(c.id, region.id);
  for (const side of ['reference', 'actual']) assert.ok(Array.isArray(c[side]) && c[side].length === 3
    && c[side].every(n => Number.isSafeInteger(n) && n >= 0 && n <= q.width * q.height * 255), 'Invalid PDF ink sum.');
  return c;
}

export function deriveEdgePdfPolicy(rows, camera, regions, mode) {
  assert.ok(rows.every(r => r.converterInvoked === false), 'Candidate contributes to PDF calibration.');
  const policy = deriveShapePdfTrialPolicy(rows, camera, regions, mode);
  policy.inkRows = edgePdfViews.map(view => {
    const same = rows.filter(r => edgePdfViewKey(r) === edgePdfViewKey(view)); assert.equal(same.length, 1);
    return {...view, regions: [same[0].whole, ...same[0].regions].map(r => structuredClone(coverage(same[0], r, camera)))};
  });
  policy.inkRule = 'Exact integer RGB sums of 255 minus opaque white-backed samples in fixed native-page crops. '
    + 'One preselected native or derived-driver representation per view; no margin, alignment fit or candidate input. '
    + 'This is a strict prospective representation check, not a general cross-renderer pixel-identity claim.';
  return policy;
}

export function evaluateEdgePdfPolicy(policy, row) {
  const view = tuple(row), evaluation = evaluateShapePdfTrial(policy, view, row);
  const same = policy.inkRows.filter(r => edgePdfViewKey(r) === edgePdfViewKey(view)); assert.equal(same.length, 1);
  const measured = [row.whole, ...row.regions]; assert.equal(same[0].regions.length, measured.length);
  for (const [i, region] of measured.entries()) {
    const actual = coverage(row, region, policy.camera), expected = same[0].regions[i], check = evaluation.checks[i];
    assert.equal(expected.id, region.id); assert.deepEqual(actual.reference, expected.reference, 'PDF reference ink changed.');
    for (let c = 0; c < 3; c++) check.metrics.push({quantity: 'nativeInkCoverage-' + ['red', 'green', 'blue'][c],
      observed: actual.actual[c], expected: expected.actual[c], passed: actual.actual[c] === expected.actual[c]});
    check.passed = check.metrics.every(m => m.passed);
  }
  return {...evaluation, passed: evaluation.checks.every(c => c.passed), globalPassed: evaluation.checks[0].passed,
    regionalPassed: evaluation.checks.slice(1, measured.length).every(c => c.passed)};
}
