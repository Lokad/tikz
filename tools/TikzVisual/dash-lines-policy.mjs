import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { root, sha256 } from './shape-oracle-bundle.mjs';
import { readDashLinesNative, reconstructDashLines, dashLinesPdfCamera, verifyDashLinesPdf } from './dash-lines-oracle.mjs';
import { parseDashPdf } from './dash-pdf-vector.mjs';
import { dashLinesPdfInstructionSvg } from './dash-lines-pdf-evidence.mjs';
import { dashLinesPrimaryTools, dashLinesPrimaryNames, dashLinesViewKey, deriveDashLinesPrimary } from './dash-lines-primary-common.mjs';
import { deriveDashLinesPdfTrial, evaluateDashLinesPdfTrial, classifyDashLinesPdfDefect, dashLinesPdfViewKey } from './dash-lines-pdf-trial-policy.mjs';
import { shapeViews, evaluateShapeTrial } from './shape-primary-trial-policy.mjs';
import { shapePdfViews } from './shape-pdf-trial-policy.mjs';
import { dashLinesImageDefects, dashLinesVisibilityControls, mutateDashLinesSvg } from './dash-lines-image-defects.mjs';

export const dashLinesPolicyId = 'chromium-153-cairo-24.04-dash-lines-v1';
export const dashLinesScope = 'Only forty fixed horizontal dash cases; native/frame/primary and both white PDF routes, with native-page ink coverage, are required.';
export const dashLinesProfileFile = 'tools/TikzVisual/dash-lines-profile.json';
export const dashLinesCalibrationFile = 'tests/Reference/Dashes/conformance/calibration.json.gz';
export const dashLinesCalibrationSha256 = '2e8fd9c5498377e62e46e4b2443633ff480f1559ae389b2df9cd5482590d0320';
export const dashLinesDecodedSha256 = '65bb93ef9e336d09e7c4864dc38d5630da6a1def1d60b1cac0515336738953a5';
export const dashLinesNativeSha256 = '1990bc5b72914cb50437e189dfdcc0e6c8185279595f8863d22c23baae36d85c';
export const dashLinesQualificationSha256 = 'e8232f106c8fce33089602448937f7f633344889353a30dd2680573452068aae';
export const dashLinesGuardTools = ['dash-lines-policy.mjs', 'compare-dash-lines-conformance.mjs', 'dash-lines-policy-self-test.mjs',
  'promote-dash-lines.mjs'].map(p => 'tools/TikzVisual/' + p);
const extraTools = ['calibrate-dash-lines-pdf-cairo.mjs', 'dash-lines-pdf-trial-policy.mjs', 'dash-lines-pdf-evidence.mjs',
  'fixed-pdf-diagnostics.mjs', 'dash-lines-pdf-image-pair.mjs', 'shape-pdf-image-pair.mjs', 'shape-pdf-trial-policy.mjs',
  'inspect-dash-lines-pdf-rasterizers.mjs', 'dash-lines-pdf-viewport.mjs', 'prepare-dash-lines-admission.mjs'].map(p => 'tools/TikzVisual/' + p);
const hashPattern = /^[a-f0-9]{64}$/;
export function requireDashLinesRenderer(actual, expected) {
  for (const k of ['profile', 'playwright', 'browser', 'browserSha256', 'profileSha256', 'os', 'architecture', 'node',
    'headless', 'deviceScaleFactor', 'viewport', 'launchArguments']) assert.deepEqual(actual[k], expected[k], 'Different renderer: ' + k);
}
export function requireDashLinesViews(rows, views, key) {
  assert.equal(rows.length, views.length); assert.equal(new Set(rows.map(key)).size, views.length);
  assert.deepEqual(rows.map(key).sort(), views.map(key).sort());
}
function primaryRow(row, reconstruction) {
  assert.equal(row.converterInvoked, false); assert.equal(row.repeat.exactRgbaMatch, true); assert.equal(row.repeat.rawChangedPixels, 0);
  assert.equal(row.repeat.premultipliedChangedPixels, 0); assert.equal(row.regions.length, 40);
  for (const m of [row.metrics, ...row.regions]) {
    const rect = m.rectangle ?? reconstruction.camera, area = rect.width * rect.height * row.scale ** 2;
    for (const k of ['rawChangedPixels', 'premultipliedChangedPixels', 'foregroundPixels', 'referenceForegroundPixels', 'actualForegroundPixels'])
      assert.ok(Number.isSafeInteger(m[k]) && m[k] >= 0 && m[k] <= area, 'Invalid primary pixels.');
    for (const k of ['maxRawChannelError', 'maxPremultipliedChannelError', 'meanForegroundChannelError']) assert.ok(Number.isFinite(m[k]) && m[k] >= 0 && m[k] <= 255);
    assert.equal(m.exactRgbaMatch, m.rawChangedPixels === 0);
    assert.deepEqual([m.topology.threshold, m.topology.connectivity, m.topology.edgeNeighborhood], [16, 8, 4]);
    for (const k of ['referenceComponents', 'actualComponents', 'componentDifference']) assert.ok(Number.isSafeInteger(m.topology[k]) && m.topology[k] >= 0);
    assert.equal(m.topology.componentDifference, Math.abs(m.topology.referenceComponents - m.topology.actualComponents));
  }
  for (const k of ['reference', 'actual', 'difference', 'alpha-difference', 'amplified', 'overlay']) assert.match(row.imageHashes[k], hashPattern);
}
export async function validateDashLinesCalibration(c, native, reconstruction, renderer) {
  assert.equal(c.schemaVersion, 1); assert.equal(c.comparisonKind, 'oracle-only-dash-lines-combined-calibration');
  for (const [k, v] of Object.entries({ completed: true, converterInvoked: false, approvedImagePolicy: false, conformanceClaim: false })) assert.equal(c[k], v);
  assert.deepEqual(c.sourceReports, { primary: '03938fc9f918f62c6ef3525c634b91aadd2ecc1c90366bab95bf70e087890a78', pdf: '9e9d8a72c40b5e6900d7faf08d306bb0ddcc72574f91080ac4f5888b1b9da673' });
  assert.equal(c.qualificationReportSha256, dashLinesQualificationSha256);
  assert.deepEqual(c.native, { snapshotSha256: native.snapshotSha256, metricsSha256: sha256(native.metricsBytes), referenceSha256: sha256(native.referenceBytes), pdfSha256: native.snapshot.artifacts['reference.pdf'] });
  assert.equal(native.snapshotSha256, dashLinesNativeSha256);
  const expectedTools = [...new Set([...dashLinesPrimaryTools, ...extraTools, ...Object.keys(native.snapshot.sourceHashes)])].sort();
  assert.deepEqual(Object.keys(c.toolHashes).sort(), expectedTools);
  const p = c.primary, { representations, ...geometry } = reconstruction;
  assert.equal(p.comparisonKind, 'oracle-only-dash-lines-primary'); assert.equal(p.schemaVersion, 1);
  for (const [k, v] of Object.entries({ completed: true, sensitivityPassed: true, converterInvoked: false, approvedImagePolicy: false, conformanceClaim: false })) assert.equal(p[k], v);
  assert.deepEqual(p.native, { snapshotSha256: native.snapshotSha256, metricsSha256: sha256(native.metricsBytes), referenceSha256: sha256(native.referenceBytes) });
  assert.deepEqual(Object.keys(p.toolHashes).sort(), [...dashLinesPrimaryTools, ...Object.keys(native.snapshot.sourceHashes)].sort());
  for (const [k, v] of Object.entries(p.toolHashes)) assert.equal(v, c.toolHashes[k]);
  requireDashLinesRenderer(renderer.identity, p.renderer); assert.deepEqual(p.geometry, geometry);
  assert.deepEqual(p.representations, representations.map(({ mode, ...r }) => ({ name: mode, ...r })));
  const primary = deriveDashLinesPrimary(p.measurements, reconstruction.regions); assert.deepEqual(p.derived, primary); assert.equal(p.scope, primary.policy.scope);
  for (const row of p.measurements) primaryRow(row, reconstruction);
  assert.deepEqual(p.replays.map(r => r.name), dashLinesPrimaryNames);
  for (const replay of p.replays) {
    requireDashLinesViews(replay.comparisons, shapeViews, dashLinesViewKey);
    for (const row of replay.comparisons) {
      primaryRow(row, reconstruction); assert.equal(row.name, replay.name + '-replay');
      const old = p.measurements.find(r => r.name === replay.name && dashLinesViewKey(r) === dashLinesViewKey(row));
      assert.deepEqual(row.metrics, old.metrics); assert.deepEqual(row.regions, old.regions); assert.deepEqual(row.naturalFrames, old.naturalFrames);
      for (const k of ['reference', 'actual', 'difference', 'alpha-difference', 'amplified', 'overlay']) assert.equal(row.imageHashes[k], old.imageHashes[k]);
      assert.equal(evaluateShapeTrial(primary.policy, row, row).passed, true);
    }
  }
  const source = representations.find(r => r.mode === 'printed-pen-hull-driver-width-elements'), whiteViews = shapeViews.filter(v => v.background === 'white');
  assert.deepEqual(p.defects.map(({ name, pathIndex }) => ({ name, pathIndex })), dashLinesImageDefects);
  for (const d of p.defects) {
    assert.equal(d.converterInvoked, false); assert.equal(d.numericGatesBypassed, true); assert.equal(d.allRequiredViewsRejected, true); assert.equal(d.targetRegion, 'path-' + d.pathIndex);
    const svg = await renderer.page.evaluate(mutateDashLinesSvg, { actual: source.svg, defect: d, pathPrefix: 'native-p' }); assert.equal(d.inputSvg, svg); assert.equal(d.inputSha256, sha256(svg));
    requireDashLinesViews(d.comparisons, whiteViews.filter(v => d.name !== 'root-crop' || v.frame === 'natural'), dashLinesViewKey);
    for (const row of d.comparisons) {
      primaryRow(row, reconstruction); const verdict = evaluateShapeTrial(primary.policy, row, row);
      assert.equal(verdict.passed, false); assert.ok(verdict.checks.some(r => r.id === d.targetRegion && !r.passed));
    }
  }
  assert.deepEqual(p.visibility.map(({ name, pathIndex }) => ({ name, pathIndex })), dashLinesVisibilityControls);
  for (const v of p.visibility) {
    assert.equal(v.exactPixelsPreserved, true); assert.equal(v.converterInvoked, false); assert.equal(v.numericGatesBypassed, true);
    const svg = await renderer.page.evaluate(mutateDashLinesSvg, { actual: source.svg, defect: v, pathPrefix: 'native-p' }); assert.equal(v.inputSvg, svg); assert.equal(v.inputSha256, sha256(svg));
    requireDashLinesViews(v.comparisons, whiteViews, dashLinesViewKey);
    for (const row of v.comparisons) { primaryRow(row, reconstruction); const old = p.measurements.find(r => r.name === source.mode && dashLinesViewKey(r) === dashLinesViewKey(row));
      assert.equal(row.imageHashes.actual, old.imageHashes.actual); assert.equal(evaluateShapeTrial(primary.policy, row, row).passed, true); }
  }
  assert.deepEqual(p.coverageControls.map(c => c.name), ['missing-observation', 'duplicate-observation', 'wrong-mode', 'chosen-region', 'nonfinite-metric', 'candidate-in-calibration']);
  assert.ok(p.coverageControls.every(c => c.rejected === true));
  const f = c.pdf, registered = dashLinesPdfCamera(native, reconstruction); requireDashLinesRenderer(renderer.identity, f.renderer);
  assert.deepEqual(f.camera, registered.camera); assert.deepEqual(f.regions, registered.regions);
  const pdfBytes = await readFile(path.join(root, 'tests/Reference/Dashes/native/reference.pdf')), parsed = parseDashPdf(pdfBytes);
  const numeric = verifyDashLinesPdf(parsed, native, reconstruction.lines); assert.deepEqual(f.numeric, numeric); assert.equal(numeric.passed, true); assert.equal(numeric.checks.length, 444);
  const expectedRepresentations = [{ mode: 'original-svg', svg: native.reference }, ...representations.map(r => ({ mode: r.mode, svg: r.svg })),
    { mode: 'pdf-instructions', svg: dashLinesPdfInstructionSvg(parsed, registered.camera).svg }].map(r => ({ ...r, sha256: sha256(r.svg) }));
  assert.deepEqual(f.representations, expectedRepresentations);
  const q = c.qualification; assert.equal(q.completed, true); assert.equal(q.converterInvoked, false); assert.equal(q.approvedImagePolicy, false);
  assert.equal(q.nativeSnapshotSha256, native.snapshotSha256); assert.equal(q.qualification.renderer, 'pdftocairo'); assert.equal(q.qualification.passed, true);
  assert.equal(q.tools.pdftoppm.sha256, native.snapshot.tools.find(t => t.name === 'pdftoppm').sha256);
  assert.equal(q.tools.pdftocairo.sha256, '35e9a069589d52ad9e2b2ce3eb28b00dee2555c4ee72c1335242a4842f9b10e5'); assert.deepEqual(f.pdfRenderer, q.tools.pdftocairo);
  for (const [name, t] of Object.entries(q.tools)) { assert.deepEqual(Object.keys(t).sort(), ['sha256', 'version']); assert.ok(t.version.startsWith(name + ' version 24.04.0')); }
  const docs = ['original', 'original-instructions', 'odd-explicit-even', 'single-explicit-even', 'negative-positive-phase', 'all-equivalent-spellings'];
  assert.equal(q.commands.length, 24); assert.equal(new Set(q.commands.map(c => c.name + '/' + c.document + '/' + c.scale)).size, 24);
  for (const name of ['pdftoppm', 'pdftocairo']) for (const doc of docs) for (const scale of [1, 4]) {
    const command = q.commands.find(c => c.name === name && c.document === doc && c.scale === scale); assert.ok(command); assert.equal(command.exactRepeat, true);
    const stem = name + '/' + doc + '-' + scale + 'x', args = ['-png', '-r', String(96 * scale), '-f', '1', '-singlefile', doc + '.pdf', stem];
    assert.deepEqual(command.args, args); assert.deepEqual(command.repeatArgs, [...args.slice(0, -1), stem + '-repeat']); assert.deepEqual(command.size, f.camera.rasterSizes[scale + 'x']);
    assert.match(q.pageHashes[stem + '.png'], hashPattern); assert.equal(q.pageHashes[stem + '.png'], q.pageHashes[stem + '-repeat.png']);
  }
  assert.equal(Object.keys(q.pageHashes).length, 48);
  const expectedEquivalence = ['pdftoppm', 'pdftocairo'].flatMap(name => docs.slice(1).flatMap(document => [1, 4].map(scale =>
    ({ name, document, scale, exactPngMatch: true, requiredForCairoQualification: name === 'pdftocairo' }))));
  assert.deepEqual(q.equivalenceControls, expectedEquivalence);
  for (const control of q.equivalenceControls) assert.equal(q.pageHashes[control.name + '/original-' + control.scale + 'x.png'], q.pageHashes[control.name + '/' + control.document + '-' + control.scale + 'x.png']);
  assert.deepEqual(q.wrapperControls, ['pdftoppm', 'pdftocairo'].flatMap(name => [1, 4].map(scale => ({ name, scale, passed: true }))));
  assert.deepEqual(f.viewport, { ...q.viewport, reusedFromQualificationSha256: dashLinesQualificationSha256 });
  assert.equal(q.viewport.passed, true); assert.equal(q.viewport.paddingCssPixels, 8); assert.equal(q.viewport.boundaryDeltaSp, 4);
  assert.equal(q.viewport.boundaryDeltaCssPixels, 4 * 96 / (72.27 * 65536)); assert.equal(q.viewport.drawingInstructionsUnchanged, true);
  const viewportKeys = ['original-svg', 'native-svg', 'pdf-instructions'].flatMap(mode =>
    ['padded', ...['left', 'right', 'top', 'bottom'].flatMap(side => [side + '-minus', side + '-plus'])].flatMap(name => [1, 4].map(scale => mode + '/' + name + '/' + scale)));
  assert.deepEqual(q.viewport.controls.map(v => v.mode + '/' + v.name + '/' + v.scale), viewportKeys);
  assert.ok(q.viewport.controls.every(v => v.exactRgbaMatch && v.regionsExact && hashPattern.test(v.svgSha256)));
  const derived = deriveDashLinesPdfTrial(f.observations, registered.camera, registered.regions); assert.deepEqual(f.derived, derived);
  assert.equal(f.replays.length, 40);
  const policyFor = mode => mode === 'original-svg' ? derived.policies.original : mode === 'pdf-instructions' ? derived.policies.instructions : derived.policies.native;
  for (const r of expectedRepresentations) {
    const rows = f.replays.filter(v => v.mode === r.mode); requireDashLinesViews(rows, shapePdfViews, dashLinesPdfViewKey);
    for (const row of rows) { const old = f.observations.find(v => v.mode === r.mode && dashLinesPdfViewKey(v) === dashLinesPdfViewKey(row));
      assert.deepEqual(row, old); assert.match(row.imageHashes['svg-page'], hashPattern); assert.equal(evaluateDashLinesPdfTrial(policyFor(r.mode), row, row).passed, true); }
  }
  assert.deepEqual(f.defects.map(({ name, pathIndex }) => ({ name, pathIndex })), dashLinesImageDefects);
  for (const d of f.defects) {
    assert.equal(d.converterInvoked, false); assert.equal(d.numericGatesBypassed, true); assert.equal(d.allRequiredViewsRejected, true);
    const svg = await renderer.page.evaluate(mutateDashLinesSvg, { actual: source.svg, defect: d, pathPrefix: 'native-p' }); assert.equal(d.inputSvg, svg); assert.equal(d.inputSha256, sha256(svg));
    const rows = d.comparisons.map(r => ({ ...r, evaluation: evaluateDashLinesPdfTrial(derived.policies.native, r, r) })), classified = classifyDashLinesPdfDefect(d, rows);
    assert.equal(classified.allRequiredViewsRejected, true); assert.deepEqual(classified.views, d.views);
  }
  assert.deepEqual(f.visibility.map(({ name, pathIndex }) => ({ name, pathIndex })), dashLinesVisibilityControls);
  for (const v of f.visibility) {
    assert.equal(v.exactPixelsPreserved, true); assert.equal(v.converterInvoked, false); assert.equal(v.numericGatesBypassed, true);
    const svg = await renderer.page.evaluate(mutateDashLinesSvg, { actual: source.svg, defect: v, pathPrefix: 'native-p' }); assert.equal(v.inputSvg, svg); assert.equal(v.inputSha256, sha256(svg));
    requireDashLinesViews(v.comparisons, shapePdfViews, dashLinesPdfViewKey);
    for (const row of v.comparisons) { const old = f.observations.find(r => r.mode === source.mode && dashLinesPdfViewKey(r) === dashLinesPdfViewKey(row));
      assert.equal(row.imageHashes['svg-page'], old.imageHashes['svg-page']); assert.equal(evaluateDashLinesPdfTrial(derived.policies.native, row, row).passed, true); }
  }
  assert.deepEqual(f.controls.map(c => c.name), ['missing-observation', 'duplicate-observation', 'wrong-mode', 'chosen-region', 'fitted-camera', 'nonfinite-metric']); assert.ok(f.controls.every(c => c.rejected === true));
  return { primary: primary.policy, pdf: derived.policies, numeric, registered };
}
export async function loadDashLinesPolicy(renderer, read = readFile) {
  const profileBytes = await read(path.join(root, dashLinesProfileFile)), profile = JSON.parse(profileBytes);
  assert.equal(profile.schemaVersion, 1); assert.equal(profile.id, dashLinesPolicyId); assert.equal(profile.scope, dashLinesScope); assert.equal(profile.approvedImagePolicy, true);
  assert.deepEqual(profile.counts, { native: 927, frame: 6, primary: 492, pdfPerRoute: 176, pdfInstructions: 444 });
  assert.deepEqual(profile.requiredViews, { primary: shapeViews, pdf: shapePdfViews });
  assert.deepEqual(profile.calibration, { file: dashLinesCalibrationFile, sha256: dashLinesCalibrationSha256, decodedSha256: dashLinesDecodedSha256 });
  const compressed = await read(path.join(root, dashLinesCalibrationFile)); assert.ok(compressed.length <= 8000000); assert.equal(sha256(compressed), dashLinesCalibrationSha256);
  const bytes = gunzipSync(compressed, { maxOutputLength: 64000000 }); assert.equal(sha256(bytes), dashLinesDecodedSha256); const c = JSON.parse(bytes);
  assert.deepEqual(Object.keys(profile.guardToolHashes).sort(), [...dashLinesGuardTools].sort());
  for (const [p, h] of Object.entries({ ...c.toolHashes, ...profile.guardToolHashes })) assert.equal(sha256(await read(path.join(root, p))), h, 'Changed line tool: ' + p);
  const native = await readDashLinesNative(read); assert.equal(native.snapshotSha256, dashLinesNativeSha256);
  const pdf = await read(path.join(root, 'tests/Reference/Dashes/native/reference.pdf')); assert.equal(sha256(pdf), c.native.pdfSha256);
  const reconstruction = await reconstructDashLines(renderer, native), validated = await validateDashLinesCalibration(c, native, reconstruction, renderer);
  assert.deepEqual(profile.camera, { primary: reconstruction.camera, pdf: validated.registered.camera });
  assert.deepEqual(profile.regions, { primary: reconstruction.regions, pdf: validated.registered.regions });
  assert.deepEqual(profile.limits, { primary: validated.primary, pdf: validated.pdf });
  assert.deepEqual(Object.keys(c.pages).sort(), ['1x', '4x']); const pdfPages = {};
  for (const scale of [1, 4]) {
    const p = c.pages[scale + 'x']; assert.equal(p.file, 'tests/Reference/Dashes/conformance/pdf-page-' + scale + 'x.png');
    const b = await read(path.join(root, p.file)); assert.equal(sha256(b), p.sha256); assert.equal(p.sha256, c.qualification.pageHashes['pdftocairo/original-' + scale + 'x.png']);
    assert.equal(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a'); assert.equal(b.subarray(12, 16).toString(), 'IHDR');
    const size = validated.registered.camera.rasterSizes[scale + 'x']; assert.equal(b.readUInt32BE(16), size.width); assert.equal(b.readUInt32BE(20), size.height);
    pdfPages[scale] = 'data:image/png;base64,' + b.toString('base64');
  }
  return { profile, profileBytes, profileSha256: sha256(profileBytes), calibration: c, calibrationBytes: bytes, compressed, native, reconstruction, ...validated, pdfPages };
}
export function combineDashLines(e, numeric, frames, primaryRows, originalRows, candidateRows) {
  assert.equal(numeric.executedChecks, 927); assert.equal(frames.executedChecks, 6);
  for (const g of [numeric, frames]) assert.ok(['passed', 'failed'].includes(g.state));
  requireDashLinesViews(primaryRows, shapeViews, dashLinesViewKey); requireDashLinesViews(originalRows, shapePdfViews, dashLinesPdfViewKey); requireDashLinesViews(candidateRows, shapePdfViews, dashLinesPdfViewKey);
  const primary = primaryRows.map(r => evaluateShapeTrial(e.primary, r, r)), original = originalRows.map(r => evaluateDashLinesPdfTrial(e.pdf.original, r, r)), candidate = candidateRows.map(r => evaluateDashLinesPdfTrial(e.pdf.native, r, r));
  const gate = values => ({ state: values.every(v => v.passed) ? 'passed' : 'failed', executedChecks: values.reduce((n, v) => n + v.checks.length, 0) });
  const gates = { numeric, frame: frames, primary: gate(primary), originalPdf: gate(original), candidatePdf: gate(candidate) };
  for (const k of ['primary', 'originalPdf', 'candidatePdf']) assert.equal(gates[k].executedChecks, k === 'primary' ? 492 : 176);
  const firstFailedGate = Object.keys(gates).find(k => gates[k].state !== 'passed') ?? null;
  return { verdict: firstFailedGate ? 'mismatch' : 'combined-conformance-pass', passed: !firstFailedGate, firstFailedGate, gates,
    overallVerdict: firstFailedGate ? 'failed' : 'pass', approvedImagePolicy: true, imageConformanceClaim: !firstFailedGate, scope: dashLinesScope,
    primaryLabel: firstFailedGate ? null : primaryRows.every(r => r.metrics.rawChangedPixels === 0) ? 'exact-primary-pixels' : 'calibrated-primary-match',
    pdfLabel: firstFailedGate ? null : 'calibrated-PDF-cross-check' };
}
