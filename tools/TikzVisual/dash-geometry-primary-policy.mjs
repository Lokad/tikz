import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { root, sha256 } from './shape-oracle-bundle.mjs';
import { shapeViews, evaluateShapeTrial, combineShapeTrial } from './shape-primary-trial-policy.mjs';
import { reconstructDashGeometryPrimary } from './dash-geometry-primary-reconstruction.mjs';
import { mutateDashGeometrySvg, dashGeometryImageDefects } from './dash-geometry-image-defects.mjs';
import { readDashGeometryNative, dashPrimaryScope, dashPrimaryCalibrationTools, dashPrimaryNames,
  dashViewKey, deriveDashPrimary } from './dash-geometry-primary-common.mjs';

export const dashPrimaryPolicyId = 'chromium-153-dash-geometry-primary-v1';
export const dashPrimaryProfileFile = 'tools/TikzVisual/dash-geometry-primary-profile.json';
export const dashPrimaryCalibrationFile = 'tests/Reference/DashGeometry/primary/calibration.json';
// Both digests change only during an explicit reviewed reference revision.
export const dashPrimaryCalibrationSha256 = 'a4247ca293673cb32df6aba2130da0362481fb9d7592638db0177b5bf63e17cb';
export const dashPrimaryNativeSha256 = '443a23351d67de1f21558d3694540a9e1763af169b30d15daef08cae6d86f047';
export const dashPrimaryGuardTools = ['dash-geometry-primary-policy.mjs', 'compare-dash-geometry-primary.mjs',
  'dash-geometry-primary-self-test.mjs', 'promote-dash-geometry-primary.mjs'].map(p => 'tools/TikzVisual/' + p);
const hashPattern = /^[a-f0-9]{64}$/;
const whiteViews = shapeViews.filter(v => v.background === 'white');

export function requireDashPrimaryRenderer(actual, expected) {
  // OS release is retained as provenance; the admitted renderer contract pins
  // the platform/architecture and exact browser binary, Node and launch state.
  for (const key of ['profile', 'playwright', 'browser', 'browserSha256', 'profileSha256', 'os', 'architecture', 'node',
    'headless', 'deviceScaleFactor', 'viewport', 'launchArguments'])
    assert.deepEqual(actual[key], expected[key], 'Dash renderer differs: ' + key);
}

export function requireDashPrimaryViews(rows, expected = shapeViews) {
  assert.equal(rows.length, expected.length, 'Incomplete primary views.');
  assert.equal(new Set(rows.map(dashViewKey)).size, expected.length, 'Duplicate primary view.');
  assert.deepEqual(rows.map(dashViewKey).sort(), expected.map(dashViewKey).sort(), 'Different primary views.');
}

function validateRow(row) {
  assert.equal(row.converterInvoked, false, 'Candidate contributed to calibration.');
  assert.equal(row.repeat.exactRgbaMatch, true); assert.equal(row.repeat.rawChangedPixels, 0);
  for (const m of [row.metrics, ...row.regions]) {
    for (const key of ['rawChangedPixels', 'premultipliedChangedPixels', 'foregroundPixels', 'referenceForegroundPixels', 'actualForegroundPixels'])
      assert.ok(Number.isSafeInteger(m[key]) && m[key] >= 0, 'Invalid pixel count.');
    for (const key of ['maxRawChannelError', 'maxPremultipliedChannelError', 'meanForegroundChannelError'])
      assert.ok(Number.isFinite(m[key]) && m[key] >= 0 && m[key] <= 255, 'Invalid image error.');
    assert.equal(m.exactRgbaMatch, m.rawChangedPixels === 0, 'Contradictory exact-image summary.');
    assert.deepEqual([m.topology.threshold, m.topology.connectivity, m.topology.edgeNeighborhood], [16, 8, 4]);
    for (const key of ['referenceComponents', 'actualComponents', 'componentDifference']) assert.ok(Number.isSafeInteger(m.topology[key]) && m.topology[key] >= 0);
    assert.equal(m.topology.componentDifference, Math.abs(m.topology.referenceComponents - m.topology.actualComponents));
  }
  for (const key of ['reference', 'actual']) assert.match(row.imageHashes[key], hashPattern);
}

export async function validateDashPrimaryCalibration(calibration, reconstruction, renderer) {
  assert.equal(calibration.schemaVersion, 1); assert.equal(calibration.comparisonKind, 'oracle-only-dash-geometry-primary');
  assert.equal(calibration.completed, true); assert.equal(calibration.scope, dashPrimaryScope);
  assert.equal(calibration.converterInvoked, false); assert.equal(calibration.approvedImagePolicy, false); assert.equal(calibration.conformanceClaim, false);
  assert.deepEqual(Object.keys(calibration.toolHashes).sort(), [...dashPrimaryCalibrationTools].sort(), 'Missing oracle tool provenance.');
  const { representations, ...geometry } = reconstruction;
  assert.deepEqual(calibration.geometry, geometry, 'Changed independent camera, regions or geometry.');
  assert.deepEqual(calibration.representations, representations.map(r => ({ ...r, sha256: sha256(r.svg) })), 'Changed independent representations.');
  const derived = deriveDashPrimary(calibration.measurements, reconstruction.regions);
  assert.deepEqual(calibration.derived, derived, 'Limits differ from oracle observations.');
  for (const row of calibration.measurements) validateRow(row);
  assert.deepEqual(calibration.replays.map(r => r.name), dashPrimaryNames, 'Missing oracle replay.');
  for (const replay of calibration.replays) {
    requireDashPrimaryViews(replay.comparisons);
    for (const row of replay.comparisons) {
      validateRow(row); assert.equal(row.name, replay.name + '-replay');
      const original = calibration.measurements.find(r => r.name === replay.name && dashViewKey(r) === dashViewKey(row));
      assert.deepEqual(row.metrics, original.metrics); assert.deepEqual(row.regions, original.regions);
      assert.deepEqual(row.naturalFrames, original.naturalFrames);
      for (const key of ['reference', 'actual', 'difference', 'alpha-difference', 'amplified', 'overlay']) assert.equal(row.imageHashes[key], original.imageHashes[key]);
      assert.equal(evaluateShapeTrial(derived.policy, row, row).passed, true, 'Oracle replay fails its limits.');
    }
  }
  const source = reconstruction.representations.find(r => r.name === 'printed-pen-hull-driver-width-elements');
  assert.deepEqual(calibration.defects.map(({ name, pathIndex }) => ({ name, pathIndex })), dashGeometryImageDefects, 'Missing visible defect controls.');
  for (const defect of calibration.defects) {
    assert.equal(defect.converterInvoked, false); assert.equal(defect.numericGatesBypassed, true);
    assert.equal(defect.targetRegion, 'path-' + defect.pathIndex);
    const expectedSvg = await renderer.page.evaluate(mutateDashGeometrySvg, { actual: source.svg, defect, pathPrefix: 'native-p', clipPrefix: 'native-clip' });
    assert.equal(defect.inputSvg, expectedSvg, 'Different controlled defect.'); assert.equal(defect.inputSha256, sha256(expectedSvg));
    requireDashPrimaryViews(defect.comparisons, whiteViews.filter(v => defect.name !== 'root-crop' || v.frame === 'natural'));
    for (const row of defect.comparisons) {
      validateRow(row); const verdict = evaluateShapeTrial(derived.policy, row, row);
      assert.equal(verdict.passed, false, 'Accepted visible calibration defect.');
      assert.ok(verdict.checks.some(c => c.id === defect.targetRegion && !c.passed), 'Defect rejected outside target region.');
    }
  }
  const expectedVisibility = [{ name: 'unpainted-join', pathIndex: 6, scales: [1, 4], expectedPassed: true },
    { name: 'subpixel-faint-content', pathIndex: 0, scales: [1], expectedPassed: true },
    { name: 'subpixel-faint-content', pathIndex: 0, scales: [4], expectedPassed: false }];
  assert.deepEqual(calibration.visibility.map(({ name, pathIndex, scales, expectedPassed }) => ({ name, pathIndex, scales, expectedPassed })), expectedVisibility);
  for (const control of calibration.visibility) {
    assert.equal(control.converterInvoked, false); assert.equal(control.numericGatesBypassed, true);
    const expectedSvg = await renderer.page.evaluate(mutateDashGeometrySvg, { actual: source.svg, defect: control, pathPrefix: 'native-p', clipPrefix: 'native-clip' });
    assert.equal(control.inputSvg, expectedSvg); assert.equal(control.inputSha256, sha256(expectedSvg));
    requireDashPrimaryViews(control.comparisons, whiteViews.filter(v => control.scales.includes(v.scale)));
    for (const row of control.comparisons) {
      validateRow(row); const original = calibration.measurements.find(r => r.name === source.name && dashViewKey(r) === dashViewKey(row));
      assert.equal(row.imageHashes.actual === original.imageHashes.actual, control.expectedPassed, 'Wrong raster visibility.');
      assert.equal(evaluateShapeTrial(derived.policy, row, row).passed, control.expectedPassed);
    }
  }
  return derived.policy;
}

export async function loadDashPrimaryPolicy(renderer, read = readFile) {
  const profileBytes = await read(path.join(root, dashPrimaryProfileFile)), profile = JSON.parse(profileBytes);
  assert.equal(profile.schemaVersion, 1); assert.equal(profile.id, dashPrimaryPolicyId); assert.equal(profile.scope, dashPrimaryScope);
  assert.equal(profile.approvedPrimaryPolicy, true); assert.equal(profile.approvedPdfPolicy, false); assert.equal(profile.overallVerdict, 'pending');
  assert.deepEqual(profile.requiredViews, shapeViews); assert.equal(profile.nativeChecks, 1090); assert.equal(profile.frameChecks, 6);
  assert.equal(profile.calibration.file, dashPrimaryCalibrationFile); assert.equal(profile.calibration.sha256, dashPrimaryCalibrationSha256, 'Different reviewed calibration.');
  const calibrationBytes = await read(path.join(root, dashPrimaryCalibrationFile));
  assert.equal(sha256(calibrationBytes), dashPrimaryCalibrationSha256, 'Changed immutable primary calibration.');
  const calibration = JSON.parse(calibrationBytes);
  assert.deepEqual(Object.keys(profile.guardToolHashes).sort(), [...dashPrimaryGuardTools].sort(), 'Missing policy guard provenance.');
  for (const [p, h] of Object.entries({ ...calibration.toolHashes, ...profile.guardToolHashes }))
    assert.equal(sha256(await read(path.join(root, p))), h, 'Changed primary tool: ' + p);
  const native = await readDashGeometryNative(read);
  assert.equal(native.snapshotSha256, dashPrimaryNativeSha256, 'Different reviewed native snapshot.');
  assert.deepEqual(calibration.native, { snapshotSha256: native.snapshotSha256, metricsSha256: native.metricsSha256, referenceSha256: native.referenceSha256 });
  requireDashPrimaryRenderer(renderer.identity, calibration.renderer);
  const reconstruction = await reconstructDashGeometryPrimary(renderer, native);
  const policy = await validateDashPrimaryCalibration(calibration, reconstruction, renderer);
  assert.deepEqual(profile.limits, policy, 'Declared limits differ from independent observations.');
  assert.deepEqual(profile.camera, reconstruction.camera); assert.deepEqual(profile.regions, reconstruction.regions);
  return { profile, profileBytes, profileSha256: sha256(profileBytes), calibration, calibrationBytes, native, reconstruction, policy };
}

export function combineDashPrimary(evidence, numeric, frame, comparisons) {
  assert.equal(numeric.executedChecks, evidence.profile.nativeChecks, 'Incomplete native evidence.');
  assert.equal(frame.executedChecks, evidence.profile.frameChecks, 'Incomplete frame evidence.');
  requireDashPrimaryViews(comparisons);
  const evaluated = comparisons.map(row => ({ ...row, evaluation: evaluateShapeTrial(evidence.policy, row, row) }));
  const combined = combineShapeTrial(numeric, frame, evaluated);
  return { ...combined, verdict: combined.passed ? 'primary-pass' : 'mismatch', approvedImagePolicy: true,
    approvedPrimaryPolicy: true, approvedPdfPolicy: false, primaryConformanceClaim: combined.passed, imageConformanceClaim: false,
    primaryLabel: combined.passed ? (comparisons.every(r => r.metrics.rawChangedPixels === 0)
      ? 'exact-primary-pixels' : 'calibrated-primary-match') : null, overallVerdict: 'pending', pdf: { state: 'pending' } };
}
