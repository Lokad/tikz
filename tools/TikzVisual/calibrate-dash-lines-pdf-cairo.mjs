// Independent PDF precision/defect experiment. No converter or production input.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { root, sha256, writeArtifact } from './shape-oracle-bundle.mjs';
import { createRenderer } from './compare.mjs';
import { installShapeMetrics } from './dash-geometry-image-pair.mjs';
import { readDashLinesNative, reconstructDashLines, verifyDashLinesPdf, dashLinesPdfCamera } from './dash-lines-oracle.mjs';
import { parseDashPdf } from './dash-pdf-vector.mjs';
import { dashLinesPdfInstructionSvg } from './dash-lines-pdf-evidence.mjs';
import { measureDashLinesPdfPair } from './dash-lines-pdf-image-pair.mjs';
import { shapePdfViews } from './shape-pdf-trial-policy.mjs';
import { dashLinesImageDefects, dashLinesVisibilityControls, mutateDashLinesSvg } from './dash-lines-image-defects.mjs';
import { verifyDashLinesAssets } from './dash-lines-primary-common.mjs';
import { deriveDashLinesPdfTrial, evaluateDashLinesPdfTrial, classifyDashLinesPdfDefect, dashLinesPdfViewKey } from './dash-lines-pdf-trial-policy.mjs';

// Explicit reviewed qualification; normal comparisons do not choose a latest
// report or silently refresh their reference. Updating this requires review.
const qualificationFile = 'artifacts/dash-lines-pdf-rasterizers/run-c254fd69-7abc-476b-adee-321bd67cf747/report.json';
const qualificationSha256 = 'e8232f106c8fce33089602448937f7f633344889353a30dd2680573452068aae';
const base = path.join(root, 'artifacts/dash-lines-pdf-cairo'), output = path.join(base, 'run-' + randomUUID()), artifacts = {}, toolHashes = {};
const save = (p, b) => writeArtifact(output, p, b, artifacts);
let phase = 'qualification';
async function publish(report) {
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n'); await writeArtifact(output, 'report.json', bytes);
  await writeArtifact(base, 'latest.json', JSON.stringify({ completed: report.completed,
    report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'), sha256: sha256(bytes) }, null, 2) + '\n');
}
async function main() {
  assert.equal(process.argv.length, 2);
  const names = ['calibrate-dash-lines-pdf-cairo.mjs', 'dash-lines-pdf-trial-policy.mjs', 'dash-lines-primary-common.mjs',
    'dash-lines-oracle.mjs', 'dash-lines-image-defects.mjs', 'dash-lines-pdf-evidence.mjs', 'fixed-pdf-diagnostics.mjs',
    'dash-pdf-vector.mjs', 'dash-lines-pdf-image-pair.mjs', 'shape-pdf-image-pair.mjs', 'shape-pdf-trial-policy.mjs', 'shape-pdf-camera.mjs', 'shape-frame-math.mjs',
    'shape-primary-trial-policy.mjs', 'dash-geometry-image-pair.mjs', 'shape-raster-metrics.mjs', 'shape-oracle-bundle.mjs',
    'compare.mjs', 'browser-profile.json', 'text-profile.json', 'node-profile.json', 'package.json', 'package-lock.json'];
  for (const p of names.map(p => 'tools/TikzVisual/' + p)) { const b = await readFile(path.join(root, p)); toolHashes[p] = sha256(b); await save('tool-sources/' + p, b); }
  const bytes = await readFile(path.join(root, qualificationFile)); assert.equal(sha256(bytes), qualificationSha256);
  const qualification = JSON.parse(bytes), folder = path.dirname(path.join(root, qualificationFile));
  assert.equal(qualification.completed, true); assert.equal(qualification.converterInvoked, false); assert.equal(qualification.approvedImagePolicy, false);
  assert.equal(qualification.qualification.passed, true); assert.equal(qualification.numeric.passed, true); assert.equal(qualification.numeric.checks.length, 444);
  assert.equal(qualification.commands.length, 24); assert.ok(qualification.commands.every(c => c.exactRepeat));
  assert.equal(qualification.equivalenceControls.length, 20); assert.ok(qualification.equivalenceControls.every(c => c.exactPngMatch));
  assert.equal(qualification.viewport.controls.length, 54); assert.ok(qualification.viewport.passed);
  assert.equal(qualification.tools.pdftocairo.sha256, '35e9a069589d52ad9e2b2ce3eb28b00dee2555c4ee72c1335242a4842f9b10e5');
  await verifyDashLinesAssets(folder, qualification.artifacts);
  for (const [p, h] of Object.entries(qualification.toolHashes)) { const b = await readFile(path.join(root, p)); assert.equal(sha256(b), h); toolHashes[p] = h; await save('tool-sources/' + p, b); }
  const native = await readDashLinesNative(); assert.equal(native.snapshotSha256, qualification.nativeSnapshotSha256);
  await save('qualification-report.json', bytes); await save('source.tikz', await readFile(path.join(root, 'tests/Fixtures/Dashes/dashes.tikz')));
  await save('native-snapshot.json', native.snapshotBytes); await save('native-metrics.json', native.metricsBytes); await save('reference.svg', native.referenceBytes);
  const pdf = await readFile(path.join(folder, 'original.pdf')); assert.equal(sha256(pdf), native.snapshot.artifacts['reference.pdf']); await save('reference.pdf', pdf);
  const pdfPages = {};
  for (const scale of [1, 4]) { const p = 'pdftocairo/original-' + scale + 'x.png', b = await readFile(path.join(folder, p));
    assert.equal(sha256(b), qualification.artifacts[p]); await save('pdf-page-' + scale + 'x.png', b); pdfPages[scale] = 'data:image/png;base64,' + b.toString('base64'); }
  await publish({ completed: false, phase, converterInvoked: false, approvedImagePolicy: false, toolHashes, artifacts });
  console.log('Independent line Cairo calibration: ' + path.relative(root, output));
  const renderer = await createRenderer(), allRows = [];
  try {
    await installShapeMetrics(renderer); assert.deepEqual(renderer.identity, qualification.renderer);
    const reconstruction = await reconstructDashLines(renderer, native), { camera, regions } = dashLinesPdfCamera(native, reconstruction), parsed = parseDashPdf(pdf);
    assert.deepEqual(camera, qualification.camera); assert.deepEqual(regions, qualification.regions);
    assert.deepEqual(reconstruction.representations.map(({ svg, ...r }) => r), qualification.independentRepresentations);
    const numeric = verifyDashLinesPdf(parsed, native, reconstruction.lines); assert.equal(numeric.passed, true); await save('pdf-numeric.json', JSON.stringify(numeric, null, 2) + '\n');
    const instructions = dashLinesPdfInstructionSvg(parsed, camera), variants = [
      { mode: 'original-svg', svg: native.reference, units: 'bp', origin: native.metrics.driverOriginBp },
      ...reconstruction.representations.map(r => ({ mode: r.mode, svg: r.svg, units: 'cssPixels', origin: { x: 0, y: 0 } })),
      { mode: 'pdf-instructions', svg: instructions.svg, units: 'cssPixels', origin: { x: 0, y: 0 } }];
    for (const v of variants) await save('representations/' + v.mode + '.svg', v.svg);
    const capture = async (variant, prefix, { views = shapePdfViews, policy = null, cropIds = [], cropLimit = 1 } = {}) => {
      const rows = [];
      for (const view of views) {
        const result = await measureDashLinesPdfPair(renderer, { svg: variant.svg, units: variant.units, svgOriginBp: variant.origin,
          camera, regions, ...view, pdfPage: pdfPages[view.scale], rightLabel: variant.mode, cropRegionIds: cropIds, cropLimit });
        assert.ok(result.repeat.pdf.exactRgbaMatch && result.repeat.svg.exactRgbaMatch); assert.equal(result.outsideWholeChangedPixels, 0);
        const links = {}, imageHashes = {}, crops = new Map(), stem = prefix + '/' + dashLinesPdfViewKey(view);
        for (const [k, png] of Object.entries(result.images)) { const b = Buffer.from(png, 'base64'); links[k] = stem + '-' + k + '.png'; imageHashes[k] = sha256(b); await save(links[k], b); }
        for (const crop of result.crops) { const links = {}; for (const [k, png] of Object.entries(crop.images)) { links[k] = stem + '-' + crop.id + '-' + k + '.png'; await save(links[k], Buffer.from(png, 'base64')); } crops.set(crop.id, links); }
        const row = { mode: variant.mode, converterInvoked: false, ...result, images: undefined, crops: undefined, artifacts: links, imageHashes,
          evaluation: policy ? evaluateDashLinesPdfTrial(policy, view, result) : null, regions: result.regions.map(r => ({ ...r, crops: crops.get(r.id) ?? null })) };
        rows.push(row); allRows.push(row);
      }
      return rows;
    };
    phase = 'observations'; const observations = [];
    for (const v of variants) { observations.push(...await capture(v, 'observations/' + v.mode)); console.log('Measured ' + v.mode); }
    await save('observations.json', JSON.stringify(observations, null, 2) + '\n');
    const derived = deriveDashLinesPdfTrial(observations, camera, regions); await save('trial-policies.json', JSON.stringify(derived, null, 2) + '\n');
    phase = 'replays'; const replays = [];
    for (const v of variants) {
      const policy = v.mode === 'original-svg' ? derived.policies.original : v.mode === 'pdf-instructions' ? derived.policies.instructions : derived.policies.native;
      const rows = await capture(v, 'replays/' + v.mode, { policy });
      for (const row of rows) { const before = observations.find(o => o.mode === v.mode && dashLinesPdfViewKey(o) === dashLinesPdfViewKey(row));
        assert.equal(row.evaluation.passed, true); assert.deepEqual(row.whole, before.whole); assert.equal(row.imageHashes['svg-page'], before.imageHashes['svg-page']);
        assert.deepEqual(row.regions.map(({ crops, ...r }) => r), before.regions.map(({ crops, ...r }) => r)); }
      replays.push(...rows);
    }
    phase = 'independent-visible-defects'; const defects = [], source = variants.find(v => v.mode === 'printed-pen-hull-driver-width-elements');
    for (const defect of dashLinesImageDefects) {
      const svg = await renderer.page.evaluate(mutateDashLinesSvg, { actual: source.svg, defect, pathPrefix: 'native-p' }); await save('defects/' + defect.name + '.svg', svg);
      const rows = await capture({ ...source, mode: 'defect-' + defect.name, svg }, 'defects/' + defect.name,
        { policy: derived.policies.native, cropIds: ['path-' + defect.pathIndex], views: shapePdfViews.filter(v => defect.name !== 'root-crop' || v.frame === 'natural') });
      const classified = classifyDashLinesPdfDefect(defect, rows); defects.push({ ...classified, inputSvg: svg, inputSha256: sha256(svg), comparisons: rows });
      console.log(defect.name + ': ' + (classified.allRequiredViewsRejected ? 'rejected in all target views' : 'sensitivity failure retained'));
    }
    phase = 'independent-visibility'; const visibility = [];
    for (const control of dashLinesVisibilityControls) {
      const svg = await renderer.page.evaluate(mutateDashLinesSvg, { actual: source.svg, defect: control, pathPrefix: 'native-p' }); await save('visibility/' + control.name + '.svg', svg);
      const rows = await capture({ ...source, mode: 'visibility-' + control.name, svg }, 'visibility/' + control.name, { policy: derived.policies.native, cropIds: ['path-' + control.pathIndex] });
      for (const row of rows) { const before = observations.find(o => o.mode === source.mode && dashLinesPdfViewKey(o) === dashLinesPdfViewKey(row));
        assert.equal(row.evaluation.passed, true); assert.equal(row.imageHashes['svg-page'], before.imageHashes['svg-page']); }
      visibility.push({ ...control, exactPixelsPreserved: true, converterInvoked: false, numericGatesBypassed: true, inputSvg: svg, inputSha256: sha256(svg), comparisons: rows });
    }
    const controls = [];
    for (const change of ['missing-observation', 'duplicate-observation', 'wrong-mode', 'chosen-region', 'fitted-camera', 'nonfinite-metric']) {
      const rows = structuredClone(observations), changedCamera = structuredClone(camera), changedRegions = structuredClone(regions);
      if (change === 'missing-observation') rows.pop(); if (change === 'duplicate-observation') rows[0] = rows[1]; if (change === 'wrong-mode') rows[0].mode = 'candidate';
      if (change === 'chosen-region') changedRegions.pop(); if (change === 'fitted-camera') changedCamera.origin.x += 1; if (change === 'nonfinite-metric') rows[0].whole.meanForegroundChannelError = NaN;
      assert.throws(() => deriveDashLinesPdfTrial(rows, changedCamera, changedRegions)); controls.push({ name: change, rejected: true });
    }
    const sensitivityPassed = defects.every(d => d.allRequiredViewsRejected);
    await save('index.html', '<!doctype html><meta charset="utf-8"><h1>Independent forty-line Cairo trial</h1><p>Unapproved policy. No converter.</p><a href="report.json">Report</a>'
      + allRows.filter(r => r.artifacts.sheet).map(r => '<h2>' + r.mode + ' / ' + dashLinesPdfViewKey(r) + '</h2><img loading="lazy" src="' + r.artifacts.sheet + '">'
        + r.regions.filter(r => r.crops).map(r => '<p>' + r.id + '</p><img loading="lazy" src="' + r.crops.sheet + '">').join('')).join(''));
    for (const [p, h] of Object.entries(toolHashes)) assert.equal(sha256(await readFile(path.join(root, p))), h, 'Tool changed during calibration.');
    assert.equal((await readDashLinesNative()).snapshotSha256, native.snapshotSha256); await verifyDashLinesAssets(output, artifacts);
    await publish({ schemaVersion: 1, comparisonKind: 'oracle-only-dash-lines-Cairo-PDF-trial', completed: true,
      verdict: sensitivityPassed ? 'unapproved-calibration-pass' : 'unapproved-sensitivity-failure', sensitivityPassed, converterInvoked: false,
      approvedImagePolicy: false, imageConformanceClaim: false, overallVerdict: 'pending', qualificationSha256, nativeSnapshotSha256: native.snapshotSha256,
      toolHashes, renderer: renderer.identity, pdfRenderer: qualification.tools.pdftocairo, numeric: { passed: true, executedChecks: numeric.checks.length },
      camera, regions, viewport: { ...qualification.viewport, reusedFromQualificationSha256: qualificationSha256 }, observations, derived, replays, defects, visibility, controls, artifacts });
    process.exitCode = sensitivityPassed ? 0 : 1; console.log('Report: ' + path.relative(root, path.join(output, 'report.json')));
  } finally { await renderer.browser.close(); }
}
await main().catch(async error => { process.exitCode = 2; console.error(error.stack);
  await publish({ completed: false, phase, verdict: 'infrastructure-error', converterInvoked: false, approvedImagePolicy: false, error: error.message, toolHashes, artifacts }); });
