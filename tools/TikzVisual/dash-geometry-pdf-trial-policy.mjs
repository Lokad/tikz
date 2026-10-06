// Prospective limits for this fixture only; no candidate or baseline writes.
import assert from 'node:assert/strict';
import { dashPrimaryNames } from './dash-geometry-primary-common.mjs';
import { deriveShapePdfTrialPolicy, evaluateShapePdfTrial, shapePdfViews } from './shape-pdf-trial-policy.mjs';

export const dashPdfViewKey = v => v.frame + '-' + v.scale + 'x-' + v.background;
const quantities = ['rawChangedPixels', 'maxRawChannelError', 'premultipliedChangedPixels', 'maxPremultipliedChannelError',
  'meanForegroundChannelError', 'componentDifference', 'maxEdgeDisplacementRasterPixels', 'foregroundCountDifference'];

export function deriveDashGeometryPdfTrial(observations, camera, regions) {
  assert.equal(observations.length, 40, 'Incomplete independent PDF representation coverage.');
  assert.equal(new Set(observations.map(o => o.mode + '/' + dashPdfViewKey(o))).size, 40, 'Duplicate representation/view.');
  const names = ['original-svg', ...dashPrimaryNames, 'pdf-instructions'];
  assert.deepEqual([...new Set(observations.map(o => o.mode))].sort(), [...names].sort());
  const individual = names.map(name => deriveShapePdfTrialPolicy(observations.filter(o => o.mode === name), camera, regions, name));
  const native = individual.filter(p => dashPrimaryNames.includes(p.mode)); assert.equal(native.length, 8);
  const envelope = structuredClone(native[0]); envelope.mode = 'native-geometric-svg';
  for (const [viewIndex, row] of envelope.rows.entries()) for (const [regionIndex, region] of row.regions.entries()) {
    const inputs = native.map(p => { assert.equal(dashPdfViewKey(p.rows[viewIndex]), dashPdfViewKey(row));
      const r = p.rows[viewIndex].regions[regionIndex]; assert.equal(r.id, region.id); return r.limits; });
    for (const l of inputs) {
      assert.deepEqual(l.reference, inputs[0].reference, 'Different PDF reference samples.');
      assert.equal(l.edgeState, inputs[0].edgeState);
    }
    for (const quantity of quantities) region.limits[quantity] = Math.max(...inputs.map(l => l[quantity]));
  }
  envelope.scope = 'Only the fixed sixteen-paint/three-clip native geometric SVG representations against qualified ordinary PDF/Cairo.';
  envelope.rounding = 'Per-view/per-region maxima across exactly eight oracle-only representations; foreground means rounded upward to 1e-9. No additional margin.';
  const policies = { original: individual[0], native: envelope, instructions: individual.at(-1) };
  for (const o of observations) {
    const policy = o.mode === 'original-svg' ? policies.original : o.mode === 'pdf-instructions' ? policies.instructions : policies.native;
    assert.equal(evaluateShapePdfTrial(policy, o, o).passed, true, 'Independent observation does not replay.');
  }
  assert.deepEqual(policies.native.rows.map(dashPdfViewKey), shapePdfViews.map(dashPdfViewKey));
  return { schemaVersion: 1, comparisonKind: 'unapproved-dash-geometry-PDF-trial', approvedImagePolicy: false, conformanceClaim: false,
    nativeRepresentationNames: dashPrimaryNames, policies, individual };
}

export function classifyDashPdfDefect(defect, rows) {
  const targetRegion = 'path-' + defect.pathIndex, required = shapePdfViews.filter(v => defect.name !== 'root-crop' || v.frame === 'natural');
  assert.equal(rows.length, required.length); assert.deepEqual(rows.map(dashPdfViewKey).sort(), required.map(dashPdfViewKey).sort());
  const views = rows.map(row => {
    const target = row.evaluation.checks.find(c => c.id === targetRegion); assert.ok(target, 'Missing defect target region.');
    return { ...Object.fromEntries(['frame', 'scale', 'background'].map(k => [k, row[k]])), targetRegion,
      globallyRejected: !row.evaluation.passed, targetRejected: !target.passed,
      failingTargetQuantities: target.metrics.filter(m => !m.passed).map(m => m.quantity) };
  });
  return { ...defect, numericGatesBypassed: true, converterInvoked: false, targetRegion,
    allRequiredViewsRejected: views.every(v => v.globallyRejected && v.targetRejected), views };
}
