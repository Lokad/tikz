// Fixture-specific, prospective PDF limits. No candidate input or admission.
import assert from 'node:assert/strict';
import { shapePdfRasterRectangle } from './shape-pdf-camera.mjs';

export const shapePdfViews = ['natural', 'expanded'].flatMap(frame => [1, 4].map(scale => ({ frame, scale, background: 'white' })));
const viewKey = v => v.frame + '-' + v.scale + 'x-' + v.background;
const channels = ['rawChangedPixels', 'maxRawChannelError', 'premultipliedChangedPixels', 'maxPremultipliedChannelError', 'meanForegroundChannelError'];
const regionIdentity = r => ({ id: r.id, nodeId: r.nodeId ?? null, kind: r.kind ?? null, font: r.font ?? null, slot: r.slot ?? null,
  rectangle: r.rectangle, rasterRectangles: r.rasterRectangles });
export const shapePdfMetricRecord = m => Object.fromEntries([...channels, 'exactRgbaMatch', 'foregroundPixels', 'referenceForegroundPixels', 'actualForegroundPixels', 'topology'].map(k => [k, m[k]]));

function validMetric(m, area) {
  for (const k of channels) assert.ok(Number.isFinite(m[k]) && m[k] >= 0, 'Invalid metric: ' + k);
  for (const k of ['rawChangedPixels', 'premultipliedChangedPixels', 'foregroundPixels', 'referenceForegroundPixels', 'actualForegroundPixels'])
    assert.ok(Number.isSafeInteger(m[k]) && m[k] >= 0 && m[k] <= area, 'Invalid pixel count: ' + k);
  assert.ok(m.maxRawChannelError <= 255 && m.maxPremultipliedChannelError <= 255 && m.meanForegroundChannelError <= 255);
  assert.equal(typeof m.exactRgbaMatch, 'boolean'); assert.equal(m.exactRgbaMatch, m.rawChangedPixels === 0);
  const t = m.topology;
  assert.deepEqual([t.threshold, t.connectivity, t.edgeNeighborhood], [16, 8, 4]);
  for (const k of ['referenceComponents', 'actualComponents', 'componentDifference', 'referenceEdgePixels', 'actualEdgePixels'])
    assert.ok(Number.isSafeInteger(t[k]) && t[k] >= 0 && t[k] <= area, 'Invalid topology count: ' + k);
  assert.equal(t.componentDifference, Math.abs(t.referenceComponents - t.actualComponents));
  const state = t.referenceEdgePixels ? t.actualEdgePixels ? 'measured' : 'actual-empty' : t.actualEdgePixels ? 'reference-empty' : 'both-empty';
  assert.equal(t.edgeState, state, 'Edge state contradicts measured edge counts.');
  if (['measured', 'both-empty'].includes(state)) {
    assert.ok(Number.isFinite(t.maxEdgeDisplacementRasterPixels) && t.maxEdgeDisplacementRasterPixels >= 0);
    if (state === 'both-empty') assert.equal(t.maxEdgeDisplacementRasterPixels, 0);
  } else assert.equal(t.maxEdgeDisplacementRasterPixels, null, 'Absent edges require a null distance.');
}

function limits(m, area) {
  validMetric(m, area);
  assert.ok(['measured', 'both-empty'].includes(m.topology.edgeState), 'Independent representation lost an entire edge set.');
  return { ...Object.fromEntries(channels.map(k => [k, k === 'meanForegroundChannelError' ? Math.ceil(m[k] * 1e9) / 1e9 : m[k]])),
    componentDifference: m.topology.componentDifference, maxEdgeDisplacementRasterPixels: m.topology.maxEdgeDisplacementRasterPixels,
    foregroundCountDifference: Math.abs(m.referenceForegroundPixels - m.actualForegroundPixels),
    reference: { foregroundPixels: m.referenceForegroundPixels, components: m.topology.referenceComponents, edgePixels: m.topology.referenceEdgePixels },
    edgeState: m.topology.edgeState };
}

export function deriveShapePdfTrialPolicy(measurements, camera, regions, mode, requiredViews = shapePdfViews) {
  assert.ok(typeof mode === 'string' && mode.length > 0);
  assert.equal(measurements.length, requiredViews.length); assert.equal(new Set(measurements.map(viewKey)).size, requiredViews.length);
  assert.deepEqual(measurements.map(viewKey).sort(), requiredViews.map(viewKey).sort());
  assert.ok(regions.length > 1 && regions[0].id === 'whole-picture'); assert.equal(new Set(regions.map(r => r.id)).size, regions.length);
  for (const r of regions) for (const scale of [1, 4])
    assert.deepEqual(r.rasterRectangles[scale + 'x'], shapePdfRasterRectangle(r.rectangle, camera, scale), 'Invalid independent region crop.');
  const rows = measurements.map(m => {
    assert.equal(m.mode, mode); assert.equal(m.background, 'white'); assert.equal(m.outsideWholeChangedPixels, 0);
    assert.deepEqual(m.pageSize, camera.rasterSizes[m.scale + 'x']);
    assert.deepEqual([regionIdentity(m.whole), ...m.regions.map(regionIdentity)], regions.map(regionIdentity));
    assert.deepEqual(Object.keys(m.repeat).sort(), ['pdf', 'svg']);
    for (const repeated of Object.values(m.repeat)) assert.deepEqual(repeated, { exactRgbaMatch: true, rawChangedPixels: 0, maxRawChannelError: 0 });
    return { frame: m.frame, scale: m.scale, background: 'white', regions: [m.whole, ...m.regions].map(r => {
      const q = r.rasterRectangles[m.scale + 'x']; return { id: r.id, limits: limits(r, q.width * q.height) };
    }) };
  });
  return structuredClone({ schemaVersion: 1, comparisonKind: 'unapproved-shape-pdf-trial-policy', approvedImagePolicy: false, conformanceClaim: false,
    mode, camera, regions: regions.map(regionIdentity), rows,
    scope: 'Only this independently registered fixture, representation, white background, region and view. No inherited or candidate-derived allowance.',
    rounding: 'Foreground mean rounded upward to 1e-9; other maxima are the exact independent observation. Absent edges are never allowed for measured-edge regions.' });
}

export function evaluateShapePdfTrial(policy, view, result) {
  assert.equal(policy.comparisonKind, 'unapproved-shape-pdf-trial-policy'); assert.equal(policy.approvedImagePolicy, false); assert.equal(policy.conformanceClaim, false);
  const rows = policy.rows.filter(r => viewKey(r) === viewKey(view)); assert.equal(rows.length, 1, 'Uncalibrated or duplicate view.');
  assert.equal(viewKey(result), viewKey(view)); assert.deepEqual(result.pageSize, policy.camera.rasterSizes[view.scale + 'x']);
  const measurements = [result.whole, ...result.regions]; assert.deepEqual(measurements.map(regionIdentity), policy.regions, 'Changed required region coverage or crop.');
  const checks = measurements.map((m, i) => {
    const row = rows[0].regions[i]; assert.equal(row.id, m.id); const l = row.limits, q = m.rasterRectangles[view.scale + 'x'];
    validMetric(m, q.width * q.height);
    assert.deepEqual([m.referenceForegroundPixels, m.topology.referenceComponents, m.topology.referenceEdgePixels],
      [l.reference.foregroundPixels, l.reference.components, l.reference.edgePixels], 'Reference raster changed.');
    const t = m.topology, metrics = channels.map(k => ({ quantity: k, observed: m[k], limit: l[k], passed: m[k] <= l[k] }));
    metrics.push({ quantity: 'componentDifference', observed: t.componentDifference, limit: l.componentDifference, passed: t.componentDifference <= l.componentDifference });
    metrics.push({ quantity: 'edgeDisplacementRasterPixels', observed: t.maxEdgeDisplacementRasterPixels, limit: l.maxEdgeDisplacementRasterPixels, edgeState: t.edgeState,
      passed: t.edgeState === l.edgeState && Number.isFinite(t.maxEdgeDisplacementRasterPixels) && t.maxEdgeDisplacementRasterPixels <= l.maxEdgeDisplacementRasterPixels });
    const count = Math.abs(m.referenceForegroundPixels - m.actualForegroundPixels);
    metrics.push({ quantity: 'foregroundCountDifference', observed: count, limit: l.foregroundCountDifference, passed: count <= l.foregroundCountDifference });
    return { id: m.id, ...view, passed: metrics.every(c => c.passed), metrics };
  });
  checks.push({ id: 'outside-whole-picture', ...view, passed: result.outsideWholeChangedPixels === 0,
    metrics: [{ quantity: 'rawChangedPixels', observed: result.outsideWholeChangedPixels, limit: 0, passed: result.outsideWholeChangedPixels === 0 }] });
  for (const name of ['pdf', 'svg']) {
    const r = result.repeat[name], passed = r.exactRgbaMatch === true && r.rawChangedPixels === 0 && r.maxRawChannelError === 0;
    checks.push({ id: 'unchanged-' + name + '-repeat', ...view, passed, metrics: [{ quantity: 'exactRgbaMatch', observed: r.exactRgbaMatch, limit: true, passed }] });
  }
  return { passed: checks.every(c => c.passed), globalPassed: checks[0].passed, regionalPassed: checks.slice(1, measurements.length).every(c => c.passed), checks };
}

export function combineShapePdfTrial(numeric, frame, primary, originalPdf, candidatePdf, policies) {
  for (const g of [numeric, frame, primary]) {
    assert.ok(['passed', 'failed'].includes(g.state)); assert.ok(Number.isSafeInteger(g.executedChecks) && g.executedChecks > 0, 'Empty prerequisite gate.');
  }
  for (const [comparisons, policy] of [[originalPdf, policies.original], [candidatePdf, policies.candidate]]) {
    assert.equal(comparisons.length, shapePdfViews.length); assert.equal(new Set(comparisons.map(viewKey)).size, shapePdfViews.length);
    assert.deepEqual(comparisons.map(viewKey).sort(), shapePdfViews.map(viewKey).sort());
    for (const c of comparisons) {
      const e = c.evaluation; assert.equal(typeof e.passed, 'boolean');
      assert.deepEqual(e.checks.map(c => c.id), [...policy.regions.map(r => r.id), 'outside-whole-picture', 'unchanged-pdf-repeat', 'unchanged-svg-repeat']);
      for (const check of e.checks) {
        assert.equal(typeof check.passed, 'boolean'); assert.equal(check.metrics.length, policy.regions.some(r => r.id === check.id) ? 8 : 1);
        assert.ok(check.metrics.every(m => typeof m.passed === 'boolean')); assert.equal(check.passed, check.metrics.every(m => m.passed));
      }
      assert.equal(e.passed, e.checks.every(c => c.passed), 'Contradictory PDF summary.');
    }
  }
  const gates = { numeric, frame, primary, originalPdf: { state: originalPdf.every(c => c.evaluation.passed) ? 'passed' : 'failed', executedChecks: originalPdf.reduce((n, c) => n + c.evaluation.checks.length, 0) },
    candidatePdf: { state: candidatePdf.every(c => c.evaluation.passed) ? 'passed' : 'failed', executedChecks: candidatePdf.reduce((n, c) => n + c.evaluation.checks.length, 0) } };
  const firstFailedGate = Object.keys(gates).find(k => gates[k].state !== 'passed') ?? null;
  return { verdict: firstFailedGate ? 'trial-failed' : 'trial-pass', passed: firstFailedGate === null, firstFailedGate, gates,
    overallVerdict: 'pending', imageConformanceClaim: false, approvedImagePolicy: false };
}
