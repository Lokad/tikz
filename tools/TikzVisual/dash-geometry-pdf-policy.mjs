import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { root, sha256 } from './shape-oracle-bundle.mjs';
import { loadDashPrimaryPolicy, requireDashPrimaryRenderer, combineDashPrimary } from './dash-geometry-primary-policy.mjs';
import { dashPrimaryNames } from './dash-geometry-primary-common.mjs';
import { shapePdfRasterRectangle } from './shape-pdf-camera.mjs';
import { parseDashGeometryPdf, verifyDashGeometryPdf, reconstructDashGeometryPdf } from './dash-geometry-pdf-vector.mjs';
import { deriveDashGeometryPdfTrial, classifyDashPdfDefect, dashPdfViewKey } from './dash-geometry-pdf-trial-policy.mjs';
import { shapePdfViews, evaluateShapePdfTrial, combineShapePdfTrial } from './shape-pdf-trial-policy.mjs';
import { dashGeometryImageDefects, mutateDashGeometrySvg } from './dash-geometry-image-defects.mjs';

export const dashPdfId = 'cairo-24.04-dash-geometry-pdf-v1';
export const dashPdfScope = 'Only the fixed sixteen geometry paints and three clips; independent numeric/frame/primary and both white PDF views are required.';
export const dashPdfProfileFile = 'tools/TikzVisual/dash-geometry-pdf-profile.json';
export const dashPdfCalibrationFile = 'tests/Reference/DashGeometry/pdf-cairo/calibration.json';
export const dashPdfCalibrationSha256 = '36cfa5c12a6434813e681df8c4791017a689b2e9d2a4972e8fa8f13d8794001e';
export const dashPdfQualificationSha256 = '420fd2c70509042811a3076a7242fdda29e15a64bd3609c9f0cece2b6e0b4d61';
export const dashPdfCalibrationTools = ['inspect-dash-geometry-pdf.mjs', 'dash-geometry-pdf-vector.mjs', 'dash-geometry-pdf-viewport.mjs',
  'dash-pdf-vector.mjs', 'dash-geometry-primary-common.mjs', 'dash-geometry-primary-reconstruction.mjs', 'dash-geometry-image-pair.mjs',
  'shape-oracle-bundle.mjs', 'shape-primary-trial-policy.mjs', 'shape-raster-metrics.mjs', 'shape-pdf-camera.mjs', 'shape-pdf-image-pair.mjs',
  'compare.mjs', 'browser-profile.json', 'package.json', 'package-lock.json', 'inspect-dash-geometry-pdf-rasterizers.mjs',
  'calibrate-dash-geometry-pdf-cairo.mjs', 'dash-geometry-pdf-trial-policy.mjs', 'shape-pdf-trial-policy.mjs',
  'dash-geometry-image-defects.mjs', 'prepare-dash-geometry-pdf-admission.mjs'].map(p => 'tools/TikzVisual/' + p);
export const dashPdfGuardTools = ['dash-geometry-pdf-policy.mjs', 'compare-dash-geometry-conformance.mjs',
  'dash-geometry-pdf-policy-self-test.mjs', 'promote-dash-geometry-pdf.mjs'].map(p => 'tools/TikzVisual/' + p);

const modes = ['original-svg', ...dashPrimaryNames, 'pdf-instructions'];
function requireViews(rows, expected = shapePdfViews) {
  assert.equal(rows.length, expected.length); assert.equal(new Set(rows.map(dashPdfViewKey)).size, expected.length);
  assert.deepEqual(rows.map(dashPdfViewKey).sort(), expected.map(dashPdfViewKey).sort());
}
export function reconstructDashPdfGeometry(native, reconstruction, parsed) {
  const spToCss = 96 / (72.27 * 65536), { page, bounds: b, box } = native.metrics.pdf;
  assert.equal(box.depth, 0); assert.equal(box.width, b.maxX - b.minX); assert.equal(box.height, b.maxY - b.minY);
  const origin = { x: (page.x - b.minX) * spToCss, y: (page.height - page.baselineY + b.minY + box.depth) * spToCss };
  assert.deepEqual(origin, native.metrics.pdfOriginCss);
  const picture = { minX: b.minX * spToCss, minY: -b.maxY * spToCss, maxX: b.maxX * spToCss, maxY: -b.minY * spToCss };
  const camera = { origin, picture, physicalPage: { width: page.width * spToCss, height: page.height * spToCss },
    rasterSizes: Object.fromEntries([1, 4].map(s => [s + 'x', { width: Math.ceil(page.width * spToCss * s), height: Math.ceil(page.height * spToCss * s) }])) };
  const regions = [{ id: 'whole-picture', nodeId: null, kind: 'picture', rectangle: reconstruction.camera }, ...reconstruction.regions.map(r => ({ ...r,
    rectangle: { ...r.rectangle, x: r.rectangle.x + reconstruction.camera.x, y: r.rectangle.y + reconstruction.camera.y } }))]
    .map(r => ({ ...r, rasterRectangles: Object.fromEntries([1, 4].map(s => [s + 'x', shapePdfRasterRectangle(r.rectangle, camera, s)])) }));
  const instructions = reconstructDashGeometryPdf(parsed, picture, origin);
  const representations = [{ mode: 'original-svg', svg: native.reference }, ...reconstruction.representations.map(r => ({ mode: r.name, svg: r.svg })),
    { mode: 'pdf-instructions', svg: instructions.svg }].map(r => ({ ...r, sha256: sha256(r.svg) }));
  return { camera, regions, representations };
}
export async function validateDashPdfCalibration(c, geometry, numeric, renderer) {
  assert.equal(c.schemaVersion, 1); assert.equal(c.comparisonKind, 'oracle-only-dash-geometry-Cairo-PDF-calibration');
  assert.equal(c.completed, true); assert.equal(c.converterInvoked, false); assert.equal(c.approvedImagePolicy, false); assert.equal(c.conformanceClaim, false);
  assert.equal(c.scope, 'Only sixteen fixed geometry paints and three clips, white native-page PDF views at 1x/4x, with separate original/native SVG limits.');
  assert.equal(c.sourceReportSha256, '92204f5303c77a3fc3e4feb8518b32113e77f2bdfdf5cf7f562cdee539fe103c');
  assert.equal(c.qualificationReportSha256, dashPdfQualificationSha256);
  assert.deepEqual(Object.keys(c.toolHashes).sort(), [...dashPdfCalibrationTools].sort());
  requireDashPrimaryRenderer(renderer.identity, c.renderer);
  assert.deepEqual(c.camera, geometry.camera); assert.deepEqual(c.regions, geometry.regions); assert.deepEqual(c.representations, geometry.representations);
  assert.deepEqual(c.numeric, numeric); assert.equal(numeric.passed, true); assert.equal(numeric.checks.length, 446);
  const q = c.qualification;
  assert.equal(q.completed, true); assert.equal(q.converterInvoked, false); assert.equal(q.approvedImagePolicy, false);
  assert.equal(q.nativeSnapshotSha256, c.native.snapshotSha256); assert.equal(q.upstream.sha256, '1e804ec565acf7126eb2e9bb3b56422ab2039f7e05863a5dfabdd1ffd1bb77a7');
  assert.equal(q.tools.pdftocairo.sha256, '35e9a069589d52ad9e2b2ce3eb28b00dee2555c4ee72c1335242a4842f9b10e5');
  assert.deepEqual(q.tools.pdftocairo, c.pdfRenderer); assert.ok(c.pdfRenderer.version.startsWith('pdftocairo version 24.04.0'));
  assert.deepEqual(Object.keys(c.pdfRenderer).sort(), ['sha256', 'version']);
  const docs = ['original', 'original-instructions', 'explicit-even-negative', 'explicit-even-positive', 'odd-full-period-positive'];
  assert.equal(q.commands.length, 20); assert.equal(new Set(q.commands.map(x => x.name + '/' + x.document + '/' + x.scale)).size, 20);
  for (const name of ['pdftoppm', 'pdftocairo']) for (const document of docs) for (const scale of [1, 4]) {
    const command = q.commands.find(x => x.name === name && x.document === document && x.scale === scale); assert.ok(command);
    assert.equal(command.exactRepeat, true); assert.deepEqual(command.args, ['-png', '-r', String(96 * scale), '-f', '1', '-singlefile', document + '.pdf', name + '/' + document + '-' + scale + 'x']);
  }
  const expectedControls = [1, 4].flatMap(scale => [
    ...docs.slice(1).map(right => ({ name: 'pdftocairo', scale, left: 'original', right, expectedIdentical: true, observedIdentical: true, passed: true })),
    ...[['original', 'original-instructions', true], ['original', 'odd-full-period-positive', true], ['explicit-even-negative', 'explicit-even-positive', true], ['original', 'explicit-even-negative', false]]
      .map(([left, right, identical]) => ({ name: 'pdftoppm', scale, left, right, expectedIdentical: identical, observedIdentical: identical, passed: true }))]);
  assert.deepEqual(q.equivalenceControls, expectedControls);
  assert.equal(c.viewport.passed, true); assert.equal(c.viewport.drawingInstructionsUnchanged, true);
  assert.equal(c.viewport.paddingCssPixels, 8); assert.equal(c.viewport.boundaryDeltaSp, 4);
  assert.equal(c.viewport.boundaryDeltaCssPixels, 4 * 96 / (72.27 * 65536));
  const viewportKeys = ['original-svg', 'printed-pen-hull-driver-width-elements', 'pdf-instructions'].flatMap(mode =>
    ['padded', ...['left', 'right', 'top', 'bottom'].flatMap(side => [side + '-minus', side + '-plus'])].flatMap(name => [1, 4].map(scale => mode + '/' + name + '/' + scale)));
  assert.equal(c.viewport.controls.length, 54); assert.deepEqual(c.viewport.controls.map(x => x.mode + '/' + x.name + '/' + x.scale), viewportKeys);
  assert.ok(c.viewport.controls.every(x => x.exactRgbaMatch && x.regionsExact && /^[a-f0-9]{64}$/.test(x.svgSha256)));
  const derived = deriveDashGeometryPdfTrial(c.observations, geometry.camera, geometry.regions); assert.deepEqual(c.derived, derived);
  const policyFor = mode => mode === 'original-svg' ? derived.policies.original : mode === 'pdf-instructions' ? derived.policies.instructions : derived.policies.native;
  assert.equal(c.replays.length, 40);
  for (const mode of modes) {
    const replay = c.replays.filter(r => r.mode === mode); requireViews(replay);
    for (const row of replay) {
      const original = c.observations.find(r => r.mode === mode && dashPdfViewKey(r) === dashPdfViewKey(row));
      assert.deepEqual(row, original, 'Replay differs from original samples.');
      assert.equal(evaluateShapePdfTrial(policyFor(mode), row, row).passed, true);
      assert.match(row.imageHashes['svg-page'], /^[a-f0-9]{64}$/);
    }
  }
  assert.deepEqual(c.defects.map(({ name, pathIndex }) => ({ name, pathIndex })), dashGeometryImageDefects);
  const source = geometry.representations.find(r => r.mode === 'printed-pen-hull-driver-width-elements');
  for (const d of c.defects) {
    assert.equal(d.converterInvoked, false); assert.equal(d.numericGatesBypassed, true); assert.equal(d.allRequiredViewsRejected, true);
    const svg = await renderer.page.evaluate(mutateDashGeometrySvg, { actual: source.svg, defect: d, pathPrefix: 'native-p', clipPrefix: 'native-clip' });
    assert.equal(d.inputSvg, svg); assert.equal(d.inputSha256, sha256(svg));
    const rows = d.comparisons.map(row => ({ ...row, evaluation: evaluateShapePdfTrial(derived.policies.native, row, row) }));
    const classified = classifyDashPdfDefect(d, rows); assert.equal(classified.allRequiredViewsRejected, true); assert.deepEqual(classified.views, d.views);
  }
  assert.deepEqual(c.controls.map(c => c.name), ['missing-observation', 'duplicate-observation', 'wrong-mode', 'chosen-region', 'fitted-camera', 'nonfinite-metric']);
  assert.ok(c.controls.every(c => c.rejected === true)); return derived;
}
export async function loadDashPdfPolicy(renderer, read = readFile) {
  const profileBytes = await read(path.join(root, dashPdfProfileFile)), profile = JSON.parse(profileBytes);
  assert.equal(profile.schemaVersion, 1); assert.equal(profile.id, dashPdfId); assert.equal(profile.scope, dashPdfScope);
  assert.equal(profile.approvedPdfPolicy, true); assert.equal(profile.nativeChecks, 1090); assert.equal(profile.frameChecks, 6); assert.equal(profile.pdfInstructionChecks, 446);
  assert.deepEqual(profile.requiredViews, shapePdfViews); assert.deepEqual(profile.calibration, { file: dashPdfCalibrationFile, sha256: dashPdfCalibrationSha256 });
  const calibrationBytes = await read(path.join(root, dashPdfCalibrationFile)); assert.equal(sha256(calibrationBytes), dashPdfCalibrationSha256);
  const calibration = JSON.parse(calibrationBytes);
  assert.deepEqual(Object.keys(profile.guardToolHashes).sort(), [...dashPdfGuardTools].sort());
  for (const [p, h] of Object.entries({ ...calibration.toolHashes, ...profile.guardToolHashes })) assert.equal(sha256(await read(path.join(root, p))), h, 'Changed PDF tool: ' + p);
  const primary = await loadDashPrimaryPolicy(renderer, read), native = primary.native;
  assert.equal(profile.primaryPolicyId, primary.profile.id); assert.equal(profile.primaryPolicySha256, primary.profileSha256);
  assert.deepEqual(calibration.native, { snapshotSha256: native.snapshotSha256, metricsSha256: native.metricsSha256, referenceSha256: native.referenceSha256, pdfSha256: native.snapshot.artifacts['reference.pdf'] });
  assert.equal(calibration.qualification.tools.pdftoppm.sha256, native.snapshot.tools.find(t => t.name === 'pdftoppm').sha256);
  const pdf = await read(path.join(root, 'tests/Reference/DashGeometry/native/reference.pdf'));
  assert.equal(sha256(pdf), calibration.native.pdfSha256);
  const parsed = parseDashGeometryPdf(pdf), numeric = verifyDashGeometryPdf(parsed, native, primary.reconstruction.styles);
  const geometry = reconstructDashPdfGeometry(native, primary.reconstruction, parsed);
  const derived = await validateDashPdfCalibration(calibration, geometry, numeric, renderer);
  assert.deepEqual(profile.camera, geometry.camera); assert.deepEqual(profile.regions, geometry.regions); assert.deepEqual(profile.limits, derived.policies);
  const pdfPages = {};
  assert.deepEqual(Object.keys(calibration.pages).sort(), ['1x', '4x']);
  for (const scale of [1, 4]) {
    const p = calibration.pages[scale + 'x']; assert.equal(p.file, 'tests/Reference/DashGeometry/pdf-cairo/pdf-page-' + scale + 'x.png');
    const b = await read(path.join(root, p.file)); assert.equal(sha256(b), p.sha256); assert.ok(b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
    const size = geometry.camera.rasterSizes[scale + 'x']; assert.equal(b.readUInt32BE(16), size.width); assert.equal(b.readUInt32BE(20), size.height);
    pdfPages[scale] = 'data:image/png;base64,' + b.toString('base64');
  }
  return { profile, profileBytes, profileSha256: sha256(profileBytes), calibration, calibrationBytes, primary, native, numeric, geometry, policies: derived.policies, pdfPages };
}
export function combineDashPdf(evidence, primaryReport, originalRows, candidateRows) {
  assert.equal(primaryReport.policySha256, evidence.primary.profileSha256); assert.equal(primaryReport.numeric.executedChecks, 1090); assert.equal(primaryReport.frame.executedChecks, 6);
  const primary = combineDashPrimary(evidence.primary, primaryReport.numeric, primaryReport.frame, primaryReport.comparisons);
  const original = originalRows.map(row => ({ ...row, evaluation: evaluateShapePdfTrial(evidence.policies.original, row, row) }));
  const candidate = candidateRows.map(row => ({ ...row, evaluation: evaluateShapePdfTrial(evidence.policies.native, row, row) }));
  const combined = combineShapePdfTrial(primaryReport.numeric, primaryReport.frame, { state: primary.passed ? 'passed' : 'failed', executedChecks: 204 }, original, candidate,
    { original: evidence.policies.original, candidate: evidence.policies.native });
  return { ...combined, verdict: combined.passed ? 'combined-conformance-pass' : 'mismatch', overallVerdict: combined.passed ? 'pass' : 'failed',
    approvedImagePolicy: true, approvedPdfPolicy: true, imageConformanceClaim: combined.passed, primaryLabel: primary.primaryLabel,
    pdfLabel: combined.passed ? 'calibrated-PDF-cross-check' : null, scope: dashPdfScope };
}
