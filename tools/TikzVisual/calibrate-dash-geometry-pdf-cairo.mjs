// Independent fixture calibration and sensitivity research. No converter.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { root, sha256, writeArtifact } from './shape-oracle-bundle.mjs';
import { createRenderer } from './compare.mjs';
import { readDashGeometryNative, verifyDashAssets } from './dash-geometry-primary-common.mjs';
import { reconstructDashGeometryPrimary } from './dash-geometry-primary-reconstruction.mjs';
import { installShapeMetrics } from './dash-geometry-image-pair.mjs';
import { shapePdfRasterRectangle } from './shape-pdf-camera.mjs';
import { measureShapePdfPair } from './shape-pdf-image-pair.mjs';
import { shapePdfViews, evaluateShapePdfTrial } from './shape-pdf-trial-policy.mjs';
import { parseDashGeometryPdf, verifyDashGeometryPdf, reconstructDashGeometryPdf } from './dash-geometry-pdf-vector.mjs';
import { verifyDashGeometryPdfViewports } from './dash-geometry-pdf-viewport.mjs';
import { dashGeometryImageDefects, mutateDashGeometrySvg } from './dash-geometry-image-defects.mjs';
import { deriveDashGeometryPdfTrial, classifyDashPdfDefect, dashPdfViewKey } from './dash-geometry-pdf-trial-policy.mjs';

const qualificationFile = 'artifacts/dash-geometry-pdf-rasterizers/run-3c92381a-5c9a-4700-a510-1db17034485f/report.json';
const qualificationSha256 = '420fd2c70509042811a3076a7242fdda29e15a64bd3609c9f0cece2b6e0b4d61';
const base = path.join(root, 'artifacts/dash-geometry-pdf-cairo'), output = path.join(base, 'run-' + randomUUID()), artifacts = {}, toolHashes = {};
const save = (p, b) => writeArtifact(output, p, b, artifacts);
let phase = 'qualified-reference';
async function publish(report) {
  await writeArtifact(output, 'report.json', JSON.stringify(report, null, 2) + '\n');
  await writeArtifact(base, 'latest.json', JSON.stringify({ completed: report.completed, report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'),
    sha256: sha256(await readFile(path.join(output, 'report.json'))) }, null, 2) + '\n');
}
async function main() {
  assert.equal(process.argv.length, 2);
  const qualificationBytes = await readFile(path.join(root, qualificationFile)); assert.equal(sha256(qualificationBytes), qualificationSha256);
  const qualification = JSON.parse(qualificationBytes), qualificationFolder = path.dirname(path.join(root, qualificationFile));
  assert.equal(qualification.completed, true); assert.equal(qualification.converterInvoked, false); assert.equal(qualification.approvedImagePolicy, false);
  assert.equal(qualification.equivalenceControls.length, 16); assert.ok(qualification.equivalenceControls.every(c => c.passed));
  assert.equal(qualification.tools.pdftocairo.sha256, '35e9a069589d52ad9e2b2ce3eb28b00dee2555c4ee72c1335242a4842f9b10e5');
  await verifyDashAssets(qualificationFolder, qualification.artifacts);
  const native = await readDashGeometryNative(); assert.equal(native.snapshotSha256, qualification.nativeSnapshotSha256);
  const names = ['calibrate-dash-geometry-pdf-cairo.mjs', 'dash-geometry-pdf-trial-policy.mjs', 'shape-pdf-trial-policy.mjs',
    'dash-geometry-pdf-vector.mjs', 'dash-geometry-pdf-viewport.mjs', 'shape-pdf-camera.mjs', 'shape-pdf-image-pair.mjs',
    'dash-geometry-primary-reconstruction.mjs', 'dash-geometry-primary-common.mjs', 'dash-geometry-image-pair.mjs',
    'dash-geometry-image-defects.mjs', 'shape-raster-metrics.mjs', 'shape-oracle-bundle.mjs', 'compare.mjs',
    'browser-profile.json', 'package.json', 'package-lock.json'];
  for (const p of names.map(p => 'tools/TikzVisual/' + p)) {
    const b = await readFile(path.join(root, p)); toolHashes[p] = sha256(b); await save('tool-sources/' + p, b);
  }
  for (const [p, h] of Object.entries(qualification.sources)) assert.equal(sha256(await readFile(path.join(root, p))), h);
  await save('qualification-report.json', qualificationBytes); await save('source.tikz', await readFile(path.join(root, 'tests/Fixtures/Dashes/geometry.tikz')));
  await save('native-snapshot.json', native.snapshotBytes); await save('native-metrics.json', native.metricsBytes); await save('original-reference.svg', native.referenceBytes);
  const pdf = await readFile(path.join(qualificationFolder, 'original.pdf')); await save('original-reference.pdf', pdf);
  assert.equal(sha256(pdf), native.snapshot.artifacts['reference.pdf']);
  const pdfPages = {};
  for (const scale of [1, 4]) {
    const p = 'pdftocairo/original-' + scale + 'x.png', b = await readFile(path.join(qualificationFolder, p));
    assert.equal(sha256(b), qualification.artifacts[p]); await save('pdf-page-' + scale + 'x.png', b); pdfPages[scale] = 'data:image/png;base64,' + b.toString('base64');
  }
  await publish({ completed: false, phase, converterInvoked: false, approvedImagePolicy: false, toolHashes, artifacts });
  console.log('Independent Cairo calibration: ' + path.relative(root, output));
  const renderer = await createRenderer(), allRows = [];
  try {
    await installShapeMetrics(renderer); assert.deepEqual(renderer.identity, qualification.renderer);
    const reconstruction = await reconstructDashGeometryPrimary(renderer, native), parsed = parseDashGeometryPdf(pdf);
    const numeric = verifyDashGeometryPdf(parsed, native, reconstruction.styles); assert.equal(numeric.passed, true);
    await save('pdf-numeric.json', JSON.stringify(numeric, null, 2) + '\n');
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
    const variants = [{ mode: 'original-svg', svg: native.reference, units: 'bp', origin: native.metrics.driverOriginBp },
      ...reconstruction.representations.map(r => ({ mode: r.name, svg: r.svg, units: 'cssPixels', origin: { x: 0, y: 0 } })),
      { mode: 'pdf-instructions', svg: instructions.svg, units: 'cssPixels', origin: { x: 0, y: 0 } }];
    for (const v of variants) await save('representations/' + v.mode + '.svg', v.svg);
    const capture = async (variant, prefix, { views = shapePdfViews, policy = null, cropIds = [], cropLimit = 1 } = {}) => {
      const rows = [];
      for (const view of views) {
        const result = await measureShapePdfPair(renderer, { svg: variant.svg, units: variant.units, svgOriginBp: variant.origin,
          camera, regions, ...view, pdfPage: pdfPages[view.scale], rightLabel: variant.mode, cropRegionIds: cropIds, cropLimit });
        assert.ok(result.repeat.pdf.exactRgbaMatch && result.repeat.svg.exactRgbaMatch);
        const links = {}, imageHashes = {}, crops = new Map(), stem = prefix + '/' + dashPdfViewKey(view);
        for (const [k, png] of Object.entries(result.images)) {
          const b = Buffer.from(png, 'base64'); links[k] = stem + '-' + k + '.png'; imageHashes[k] = sha256(b); await save(links[k], b);
        }
        for (const crop of result.crops) {
          const links = {}; for (const [k, png] of Object.entries(crop.images)) { links[k] = stem + '-' + crop.id + '-' + k + '.png'; await save(links[k], Buffer.from(png, 'base64')); }
          crops.set(crop.id, links);
        }
        const evaluation = policy ? evaluateShapePdfTrial(policy, view, result) : null;
        const row = { mode: variant.mode, ...result, images: undefined, crops: undefined, artifacts: links, imageHashes, evaluation,
          regions: result.regions.map(r => ({ ...r, crops: crops.get(r.id) ?? null })) };
        rows.push(row); allRows.push(row);
      }
      return rows;
    };
    phase = 'native-page-viewport-controls'; const viewport = await verifyDashGeometryPdfViewports(renderer, { variants, camera, regions, pdfPages }, save);
    assert.equal(viewport.passed, true); await save('viewport-controls.json', JSON.stringify(viewport, null, 2) + '\n');
    phase = 'independent-observations'; const observations = [];
    for (const v of variants) {
      observations.push(...await capture(v, 'observations/' + v.mode)); console.log('Measured ' + v.mode);
    }
    const derived = deriveDashGeometryPdfTrial(observations, camera, regions); await save('trial-policies.json', JSON.stringify(derived, null, 2) + '\n');
    phase = 'replay'; const replays = [];
    for (const v of variants) {
      const policy = v.mode === 'original-svg' ? derived.policies.original : v.mode === 'pdf-instructions' ? derived.policies.instructions : derived.policies.native;
      const rows = await capture(v, 'replays/' + v.mode, { policy });
      for (const row of rows) {
        const old = observations.find(o => o.mode === v.mode && dashPdfViewKey(o) === dashPdfViewKey(row));
        assert.equal(row.evaluation.passed, true); assert.deepEqual(row.whole, old.whole);
        assert.equal(row.imageHashes['svg-page'], old.imageHashes['svg-page']);
        assert.deepEqual(row.regions.map(({ crops, ...r }) => r), old.regions.map(({ crops, ...r }) => r));
      }
      replays.push(...rows); console.log('Replayed ' + v.mode);
    }
    phase = 'independent-visible-defects'; const defects = [], source = variants.find(v => v.mode === 'printed-pen-hull-driver-width-elements');
    for (const defect of dashGeometryImageDefects) {
      const svg = await renderer.page.evaluate(mutateDashGeometrySvg, { actual: source.svg, defect, pathPrefix: 'native-p', clipPrefix: 'native-clip' });
      await save('defects/' + defect.name + '.svg', svg);
      const rows = await capture({ ...source, mode: 'defect-' + defect.name, svg }, 'defects/' + defect.name,
        { policy: derived.policies.native, cropIds: ['path-' + defect.pathIndex], views: shapePdfViews.filter(v => defect.name !== 'root-crop' || v.frame === 'natural') });
      const classified = classifyDashPdfDefect(defect, rows); defects.push({ ...classified, inputSha256: sha256(svg), comparisons: rows });
      console.log(defect.name + ': ' + (classified.allRequiredViewsRejected ? 'rejected in all target views' : 'sensitivity failure retained'));
    }
    const sensitivityPassed = defects.every(d => d.allRequiredViewsRejected);
    const controls = [];
    for (const change of ['missing-observation', 'duplicate-observation', 'wrong-mode', 'chosen-region', 'fitted-camera', 'nonfinite-metric']) {
      const rows = structuredClone(observations), changedCamera = structuredClone(camera), changedRegions = structuredClone(regions);
      if (change === 'missing-observation') rows.pop();
      if (change === 'duplicate-observation') rows[0] = rows[1];
      if (change === 'wrong-mode') rows[0].mode = 'candidate';
      if (change === 'chosen-region') changedRegions.pop();
      if (change === 'fitted-camera') changedCamera.origin.x += 1;
      if (change === 'nonfinite-metric') rows[0].whole.meanForegroundChannelError = NaN;
      assert.throws(() => deriveDashGeometryPdfTrial(rows, changedCamera, changedRegions)); controls.push({ name: change, rejected: true });
    }
    await save('index.html', '<!doctype html><meta charset="utf-8"><h1>Independent Cairo PDF trial; ' + (sensitivityPassed ? 'defects rejected' : 'sensitivity failures')
      + '</h1><p>Unapproved policy. No converter.</p><a href="report.json">Report</a> · <a href="source.tikz">Source</a>'
      + allRows.filter(r => r.artifacts.sheet).map(r => '<h2>' + r.mode + ' / ' + dashPdfViewKey(r) + '</h2><img src="' + r.artifacts.sheet + '">'
        + r.regions.filter(r => r.crops).map(r => '<p>' + r.id + ' / ' + r.caseId + '</p><img src="' + r.crops.sheet + '">').join('')).join(''));
    for (const [p, h] of Object.entries(toolHashes)) assert.equal(sha256(await readFile(path.join(root, p))), h);
    assert.equal((await readDashGeometryNative()).snapshotSha256, native.snapshotSha256); await verifyDashAssets(output, artifacts);
    await publish({ schemaVersion: 1, comparisonKind: 'oracle-only-dash-geometry-Cairo-PDF-trial', completed: true,
      verdict: sensitivityPassed ? 'unapproved-trial-pass' : 'unapproved-sensitivity-failure', sensitivityPassed, converterInvoked: false, approvedImagePolicy: false,
      imageConformanceClaim: false, overallVerdict: 'pending', qualificationSha256, nativeSnapshotSha256: native.snapshotSha256, toolHashes,
      renderer: renderer.identity, pdfRenderer: qualification.tools.pdftocairo, numeric: { passed: true, executedChecks: numeric.checks.length },
      camera, regions, viewport, observations, derived, replays, defects, controls, artifacts,
      agent: { viewer: 'index.html', focusedRerun: 'node tools/TikzVisual/calibrate-dash-geometry-pdf-cairo.mjs' } });
    process.exitCode = sensitivityPassed ? 0 : 1;
  } finally { await renderer.browser.close(); }
}
await main().catch(async error => { process.exitCode = 2; console.error(error.stack);
  await publish({ completed: false, phase, verdict: 'infrastructure-error', converterInvoked: false, approvedImagePolicy: false, error: error.message, toolHashes, artifacts }); });
