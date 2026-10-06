// Prospective forty-line limits from independent observations only.
import assert from 'node:assert/strict';
import { dashLinesPrimaryNames } from './dash-lines-primary-common.mjs';
import { deriveShapePdfTrialPolicy, evaluateShapePdfTrial, shapePdfViews } from './shape-pdf-trial-policy.mjs';
export const dashLinesPdfViewKey = v => v.frame + '-' + v.scale + 'x-' + v.background;
const quantities = ['rawChangedPixels', 'maxRawChannelError', 'premultipliedChangedPixels', 'maxPremultipliedChannelError',
  'meanForegroundChannelError', 'componentDifference', 'maxEdgeDisplacementRasterPixels', 'foregroundCountDifference'];
function coverageOf(row, region, camera) {
  const coverage = region.inkCoverage, q = region.rasterRectangles[row.scale + 'x'];
  assert.equal(coverage.id, region.id);
  assert.deepEqual(row.pageSize, camera.rasterSizes[row.scale + 'x']);
  for (const side of ['reference', 'actual']) assert.ok(Array.isArray(coverage[side]) && coverage[side].length === 3
    && coverage[side].every(n => Number.isSafeInteger(n) && n >= 0 && n <= q.width * q.height * 255), 'Invalid ink coverage.');
  return coverage;
}
function addCoverage(policy, rows) {
  policy.inkCoverageRows = policy.rows.map(view => {
    const matching = rows.filter(r => dashLinesPdfViewKey(r) === dashLinesPdfViewKey(view)); assert.ok(matching.length);
    return { ...Object.fromEntries(['frame', 'scale', 'background'].map(k => [k, view[k]])), regions: policy.regions.map((region, i) => {
      const items = matching.map(r => coverageOf(r, [r.whole, ...r.regions][i], policy.camera));
      for (const item of items) assert.deepEqual(item.reference, items[0].reference, 'Different reference ink.');
      return { id: region.id, reference: items[0].reference,
        actualRanges: [0, 1, 2].map(c => ({ min: Math.min(...items.map(v => v.actual[c])), max: Math.max(...items.map(v => v.actual[c])) })) };
    }) };
  });
  policy.inkCoverageRule = 'Exact integer per-channel sums of 255 minus each opaque white-backed sample, on fixed native page crops; actual ranges come only from independent SVGs, with no margin.';
  return policy;
}
export function evaluateDashLinesPdfTrial(policy, view, result) {
  const evaluation = evaluateShapePdfTrial(policy, view, result), rows = policy.inkCoverageRows.filter(r => dashLinesPdfViewKey(r) === dashLinesPdfViewKey(view));
  assert.equal(rows.length, 1, 'Missing/duplicate native ink view.'); assert.equal(rows[0].regions.length, policy.regions.length);
  assert.equal(evaluation.checks.length, policy.regions.length + 3, 'Missing page/repeat controls.');
  const measured = [result.whole, ...result.regions];
  for (const [i, check] of evaluation.checks.slice(0, measured.length).entries()) {
    const limits = rows[0].regions[i], coverage = coverageOf(result, measured[i], policy.camera); assert.equal(limits.id, check.id);
    assert.deepEqual(coverage.reference, limits.reference, 'PDF reference ink changed.'); assert.equal(limits.actualRanges.length, 3);
    for (const [channel, range] of limits.actualRanges.entries()) {
      assert.ok(Number.isSafeInteger(range.min) && Number.isSafeInteger(range.max) && range.min >= 0 && range.max >= range.min);
      check.metrics.push({ quantity: 'nativeInkCoverage-' + ['red', 'green', 'blue'][channel], observed: coverage.actual[channel], min: range.min, limit: range.max,
        passed: coverage.actual[channel] >= range.min && coverage.actual[channel] <= range.max });
    }
    check.passed = check.metrics.every(m => m.passed);
  }
  return { ...evaluation, passed: evaluation.checks.every(c => c.passed), globalPassed: evaluation.checks[0].passed,
    regionalPassed: evaluation.checks.slice(1, measured.length).every(c => c.passed) };
}
export function deriveDashLinesPdfTrial(observations, camera, regions) {
  assert.equal(regions.length, 41); assert.equal(observations.length, 40, 'Incomplete independent PDF representation coverage.');
  assert.equal(new Set(observations.map(o => o.mode + '/' + dashLinesPdfViewKey(o))).size, 40, 'Duplicate representation/view.');
  const names = ['original-svg', ...dashLinesPrimaryNames, 'pdf-instructions'];
  assert.ok(observations.every(o => o.converterInvoked === false), 'Candidate input in PDF calibration.');
  assert.deepEqual([...new Set(observations.map(o => o.mode))].sort(), [...names].sort());
  const individual = names.map(name => {
    const rows = observations.filter(o => o.mode === name); return addCoverage(deriveShapePdfTrialPolicy(rows, camera, regions, name), rows);
  });
  const native = individual.filter(p => dashLinesPrimaryNames.includes(p.mode)); assert.equal(native.length, 8);
  const envelope = structuredClone(native[0]); envelope.mode = 'native-line-svg';
  for (const [vi, row] of envelope.rows.entries()) for (const [ri, region] of row.regions.entries()) {
    const inputs = native.map(p => { assert.equal(dashLinesPdfViewKey(p.rows[vi]), dashLinesPdfViewKey(row));
      const r = p.rows[vi].regions[ri]; assert.equal(r.id, region.id); return r.limits; });
    for (const l of inputs) { assert.deepEqual(l.reference, inputs[0].reference, 'Different PDF reference samples.'); assert.equal(l.edgeState, inputs[0].edgeState); }
    for (const quantity of quantities) region.limits[quantity] = Math.max(...inputs.map(l => l[quantity]));
  }
  envelope.scope = 'Only forty fixed horizontal lines against their qualified unchanged ordinary PDF/Cairo.';
  envelope.rounding = 'Per-view/per-region maxima of exactly eight oracle-only native representations; foreground means rounded upward to 1e-9. No extra margin.';
  addCoverage(envelope, observations.filter(o => dashLinesPrimaryNames.includes(o.mode)));
  const policies = { original: individual[0], native: envelope, instructions: individual.at(-1) };
  for (const o of observations) {
    const p = o.mode === 'original-svg' ? policies.original : o.mode === 'pdf-instructions' ? policies.instructions : policies.native;
    assert.equal(evaluateDashLinesPdfTrial(p, o, o).passed, true, 'Independent observation does not replay.');
  }
  assert.deepEqual(envelope.rows.map(dashLinesPdfViewKey), shapePdfViews.map(dashLinesPdfViewKey));
  return { schemaVersion: 1, comparisonKind: 'unapproved-dash-lines-PDF-trial', approvedImagePolicy: false, conformanceClaim: false,
    nativeRepresentationNames: dashLinesPrimaryNames, individual, policies };
}
export function classifyDashLinesPdfDefect(defect, rows) {
  const targetRegion = 'path-' + defect.pathIndex, required = shapePdfViews.filter(v => defect.name !== 'root-crop' || v.frame === 'natural');
  assert.equal(rows.length, required.length); assert.deepEqual(rows.map(dashLinesPdfViewKey).sort(), required.map(dashLinesPdfViewKey).sort());
  const views = rows.map(row => {
    const target = row.evaluation.checks.find(c => c.id === targetRegion); assert.ok(target);
    return { ...Object.fromEntries(['frame', 'scale', 'background'].map(k => [k, row[k]])), targetRegion,
      globallyRejected: !row.evaluation.passed, targetRejected: !target.passed, failingTargetQuantities: target.metrics.filter(m => !m.passed).map(m => m.quantity) };
  });
  return { ...defect, numericGatesBypassed: true, converterInvoked: false, targetRegion,
    allRequiredViewsRejected: views.every(v => v.globallyRejected && v.targetRejected), views };
}
