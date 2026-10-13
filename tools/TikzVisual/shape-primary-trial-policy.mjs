import assert from 'node:assert/strict';

// Match the existing curved-node/dash contract: the host release is provenance.
// Keep the exact platform, binary, runtime, launch state and profile mandatory.
// This check grants no pixel allowance; native replay and fresh output still run.
export function requireRenderer(actual, expected, message = 'Incompatible renderer.') {
  const fields = ['profile', 'playwright', 'browser', 'browserSha256', 'os', 'architecture', 'node', 'headless',
    'deviceScaleFactor', 'viewport', 'launchArguments', 'profileSha256', 'osRelease'].sort();
  assert.deepEqual(Object.keys(actual).sort(), fields, message);
  assert.deepEqual(Object.keys(expected).sort(), fields, message);
  const { osRelease: actualRelease, ...actualContract } = actual;
  const { osRelease: expectedRelease, ...expectedContract } = expected;
  assert.equal(typeof actualRelease, 'string');
  assert.equal(typeof expectedRelease, 'string');
  assert.deepEqual(actualContract, expectedContract, message);
}

export const shapeViews = ['natural', 'expanded'].flatMap(frame => [1, 4].flatMap(scale => ['transparent', 'white', 'black'].map(background => ({ frame, scale, background }))));
const key = v => `${v.frame}-${v.scale}x-${v.background}`;
const metricKeys = ['rawChangedPixels', 'maxRawChannelError', 'premultipliedChangedPixels', 'maxPremultipliedChannelError', 'meanForegroundChannelError'];

// Per-view/per-region maxima across declared native encodings only.
// Shared with calc; reference scope and coverage remain the caller's policy.
export function nativeMetricEnvelope(rows) {
  assert.ok(rows.length > 0); const result = structuredClone(rows[0]);
  for (const row of rows) {
    for (const k of metricKeys) result[k] = Math.max(result[k], row[k]);
    assert.equal(row.topology.componentDifference, 0);
    assert.ok(['both-empty', 'measured'].includes(row.topology.edgeState));
    result.topology.maxEdgeDisplacementRasterPixels = Math.max(result.topology.maxEdgeDisplacementRasterPixels, row.topology.maxEdgeDisplacementRasterPixels);
  }
  return result;
}

function metricLimits(m, componentLimit = 0) {
  for (const k of metricKeys) assert.ok(Number.isFinite(m[k]) && m[k] >= 0, 'Invalid oracle metric: ' + k);
  assert.ok(m.maxRawChannelError <= 255 && m.maxPremultipliedChannelError <= 255);
  assert.ok(Number.isInteger(m.rawChangedPixels) && Number.isInteger(m.premultipliedChangedPixels));
  const t = m.topology;
  assert.deepEqual([t.threshold, t.connectivity, t.edgeNeighborhood], [16, 8, 4]);
  assert.ok(['both-empty', 'measured'].includes(t.edgeState), 'Oracle reconstruction lost an entire edge set.');
  assert.ok(Number.isFinite(t.maxEdgeDisplacementRasterPixels) && t.maxEdgeDisplacementRasterPixels >= 0);
  assert.ok(Number.isInteger(componentLimit) && componentLimit >= 0);
  assert.ok(Number.isInteger(t.componentDifference) && t.componentDifference >= 0 && t.componentDifference <= componentLimit,
    'Oracle representation changed component counts outside its declared native scope.');
  // Only explicit upward rounding of a measured foreground mean. No margin is
  // chosen from candidate errors or from another region/view/background.
  return { ...Object.fromEntries(metricKeys.map(k => [k, k === 'meanForegroundChannelError' ? Math.ceil(m[k] * 1e9) / 1e9 : m[k]])),
    maxEdgeDisplacementRasterPixels: t.maxEdgeDisplacementRasterPixels, componentDifference: t.componentDifference };
}

export function deriveShapeTrialPolicy(measurements, scope = '28-node original-primary fixture', requiredViews = shapeViews, componentLimit = () => 0) {
  assert.equal(measurements.length, requiredViews.length, 'Incomplete oracle measurement coverage.');
  assert.equal(new Set(measurements.map(key)).size, requiredViews.length, 'Duplicate oracle measurement.');
  assert.deepEqual(measurements.map(key).sort(), requiredViews.map(key).sort());
  const regions = measurements[0].regions.map(r => ({ id: r.id, nodeId: r.nodeId, kind: r.kind, rectangle: r.rectangle }));
  assert.ok(regions.length > 0 && new Set(regions.map(r => r.id)).size === regions.length, 'Invalid oracle regions.');
  for (const r of regions) assert.ok(['x', 'y', 'width', 'height'].every(k => Number.isInteger(r.rectangle[k]))
    && r.rectangle.x >= 0 && r.rectangle.y >= 0 && r.rectangle.width > 0 && r.rectangle.height > 0, 'Invalid independent region rectangle.');
  const rows = measurements.map(m => {
    assert.deepEqual(m.regions.map(r => ({ id: r.id, nodeId: r.nodeId, kind: r.kind, rectangle: r.rectangle })), regions, 'Regions changed between oracle views.');
    return { frame: m.frame, scale: m.scale, background: m.background, whole: metricLimits(m, componentLimit(m, 'whole-picture')),
      regions: m.regions.map(r => ({ id: r.id, limits: metricLimits(r, componentLimit(m, r.id)) })) };
  });
  return { schemaVersion: 1, comparisonKind: 'unapproved-shape-primary-trial-policy', approvedImagePolicy: false, conformanceClaim: false,
    scope, rounding: 'Foreground mean rounded upward to 1e-9 channel units; every other limit is the independent observation in that exact region/view/background.', regions, rows };
}

export function evaluateShapeTrial(policy, view, result) {
  assert.equal(policy.comparisonKind, 'unapproved-shape-primary-trial-policy'); assert.equal(policy.approvedImagePolicy, false); assert.equal(policy.conformanceClaim, false);
  const matches = policy.rows.filter(r => key(r) === key(view)); assert.equal(matches.length, 1, 'Missing or duplicate trial limit row.');
  const row = matches[0]; assert.equal(result.regions.length, policy.regions.length, 'Incomplete candidate regions.');
  assert.deepEqual(result.regions.map(r => ({ id: r.id, nodeId: r.nodeId, kind: r.kind, rectangle: r.rectangle })), policy.regions, 'Candidate supplied different regions.');
  const checks = [];
  function check(id, measurement, limits) {
    const metrics = metricKeys.map(k => ({ quantity: k, observed: measurement[k], limit: limits[k],
      passed: Number.isFinite(measurement[k]) && measurement[k] >= 0 && measurement[k] <= limits[k] }));
    const t = measurement.topology;
    assert.deepEqual([t.threshold, t.connectivity, t.edgeNeighborhood], [16, 8, 4]);
    metrics.push({ quantity: 'componentDifference', observed: t.componentDifference, limit: limits.componentDifference,
      passed: Number.isInteger(t.componentDifference) && t.componentDifference >= 0 && t.componentDifference <= limits.componentDifference });
    metrics.push({ quantity: 'edgeDisplacementRasterPixels', observed: t.maxEdgeDisplacementRasterPixels, limit: limits.maxEdgeDisplacementRasterPixels,
      edgeState: t.edgeState, passed: ['both-empty', 'measured'].includes(t.edgeState) && Number.isFinite(t.maxEdgeDisplacementRasterPixels)
        && t.maxEdgeDisplacementRasterPixels >= 0 && t.maxEdgeDisplacementRasterPixels <= limits.maxEdgeDisplacementRasterPixels });
    checks.push({ id, ...view, passed: metrics.every(c => c.passed), metrics });
  }
  check('whole-picture', result.metrics, row.whole);
  for (let i = 0; i < result.regions.length; i++) { assert.equal(row.regions[i].id, result.regions[i].id); check(result.regions[i].id, result.regions[i], row.regions[i].limits); }
  return { passed: checks.every(c => c.passed), globalPassed: checks[0].passed, regionalPassed: checks.slice(1).every(c => c.passed), checks };
}

export function combineShapeTrial(numeric, frame, comparisons, requiredViews = shapeViews) {
  for (const gate of [numeric, frame]) {
    assert.ok(['passed', 'failed'].includes(gate.state), 'Missing required numeric/frame state.');
    assert.ok(Number.isInteger(gate.executedChecks) && gate.executedChecks > 0, 'Empty required numeric/frame evidence.');
  }
  assert.equal(comparisons.length, requiredViews.length, 'Incomplete required image comparisons.');
  assert.equal(new Set(comparisons.map(key)).size, requiredViews.length, 'Duplicate required image comparison.');
  assert.deepEqual(comparisons.map(key).sort(), requiredViews.map(key).sort());
  for (const c of comparisons) {
    const evaluation = c.evaluation;
    assert.equal(typeof evaluation.passed, 'boolean', 'Invalid image gate summary.');
    assert.ok(Array.isArray(evaluation.checks) && evaluation.checks.length > 0, 'Empty required image evidence.');
    for (const check of evaluation.checks) {
      assert.equal(typeof check.passed, 'boolean');
      assert.ok(Array.isArray(check.metrics) && check.metrics.length === 7, 'Incomplete image metric evidence.');
      assert.ok(check.metrics.every(m => typeof m.passed === 'boolean'));
      assert.equal(check.passed, check.metrics.every(m => m.passed), 'Image region summary contradicts its metrics.');
    }
    assert.equal(evaluation.passed, evaluation.checks.every(check => check.passed), 'Image gate summary contradicts its regions.');
  }
  const primaryPassed = comparisons.every(c => c.evaluation.passed);
  const firstFailedGate = numeric.state !== 'passed' ? 'numeric' : frame.state !== 'passed' ? 'frame' : !primaryPassed ? 'primary' : null;
  return { verdict: firstFailedGate ? 'trial-failed' : 'trial-pass', passed: !firstFailedGate, firstFailedGate,
    numeric, frame, primary: { state: primaryPassed ? 'passed' : 'failed', executedViews: comparisons.length },
    overallVerdict: 'pending', imageConformanceClaim: false, approvedImagePolicy: false, pdf: { state: 'pending' } };
}
