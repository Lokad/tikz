// No converter invocation, production resource or candidate evidence is used.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { root, sha256, writeArtifact } from './shape-oracle-bundle.mjs';
import { createRenderer } from './compare.mjs';
import { installShapeMetrics } from './dash-geometry-image-pair.mjs';
import { shapeViews } from './shape-primary-trial-policy.mjs';
import { reconstructDashGeometryPrimary } from './dash-geometry-primary-reconstruction.mjs';
import { dashGeometryImageDefects, mutateDashGeometrySvg } from './dash-geometry-image-defects.mjs';
import { readDashGeometryNative, dashPrimaryScope, dashPrimaryCalibrationTools, dashViewKey,
  captureDashPrimary, deriveDashPrimary, compactDashRows, verifyDashAssets } from './dash-geometry-primary-common.mjs';

const base = path.join(root, 'artifacts/dash-geometry-primary-calibration'), output = path.join(base, 'run-' + randomUUID()), artifacts = {};
const save = (p, bytes) => writeArtifact(output, p, bytes, artifacts);
let phase = 'inputs', toolHashes = {};
async function publish(value) {
  await writeArtifact(output, 'report.json', JSON.stringify(value, null, 2) + '\n');
  await writeArtifact(base, 'latest.json', JSON.stringify({ completed: value.completed, report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'),
    sha256: sha256(await readFile(path.join(output, 'report.json'))), converterInvoked: false }, null, 2) + '\n');
}
async function main() {
  assert.equal(process.argv.length, 2);
  for (const p of dashPrimaryCalibrationTools) {
    const bytes = await readFile(path.join(root, p)); toolHashes[p] = sha256(bytes); await save('tool-sources/' + p, bytes);
  }
  await publish({ completed: false, phase, converterInvoked: false, toolHashes, approvedImagePolicy: false });
  console.log('Independent dash primary calibration: ' + path.relative(root, output));
  const native = await readDashGeometryNative();
  await save('original-reference.svg', native.referenceBytes); await save('native-metrics.json', native.metricsBytes); await save('native-snapshot.json', native.snapshotBytes);
  const renderer = await createRenderer();
  try {
    await installShapeMetrics(renderer);
    const reconstruction = await reconstructDashGeometryPrimary(renderer, native);
    for (const r of reconstruction.representations) await save('representations/' + r.name + '.svg', r.svg);
    phase = 'measurements'; const observations = [], allRows = [];
    const capture = async (variant, options = {}) => {
      const rows = await captureDashPrimary(renderer, { native, reconstruction, variant, output, artifacts, ...options }); allRows.push(...rows); return rows;
    };
    for (const variant of reconstruction.representations) observations.push(...await capture(variant));
    const derived = deriveDashPrimary(observations, reconstruction.regions), policy = derived.policy;
    const replays = [];
    for (const variant of reconstruction.representations) {
      const rows = await capture({ ...variant, name: variant.name + '-replay' }, { policy });
      for (const row of rows) {
        const initial = observations.find(o => o.name === variant.name && dashViewKey(o) === dashViewKey(row));
        assert.equal(row.evaluation.passed, true); assert.deepEqual(row.metrics, initial.metrics);
        assert.deepEqual(row.naturalFrames, initial.naturalFrames); assert.equal(row.imageHashes.actual, initial.imageHashes.actual);
      }
      replays.push({ name: variant.name, comparisons: compactDashRows(rows) });
    }
    const source = reconstruction.representations.find(r => r.name === 'printed-pen-hull-driver-width-elements');
    phase = 'independent-defects'; const defects = [];
    for (const defect of dashGeometryImageDefects) {
      const svg = await renderer.page.evaluate(mutateDashGeometrySvg, { actual: source.svg, defect, pathPrefix: 'native-p', clipPrefix: 'native-clip' });
      const file = 'defects/' + defect.name + '.svg'; await save(file, svg);
      const rows = await capture({ name: 'defect-' + defect.name, svg }, { policy, cropIds: ['path-' + defect.pathIndex],
        views: shapeViews.filter(v => v.background === 'white' && (defect.name !== 'root-crop' || v.frame === 'natural')) });
      assert.ok(rows.every(r => !r.evaluation.passed && r.evaluation.checks.some(c => c.id === 'path-' + defect.pathIndex && !c.passed)), 'Accepted visible defect: ' + defect.name);
      defects.push({ ...defect, converterInvoked: false, numericGatesBypassed: true, inputSvg: svg, inputSha256: sha256(svg), targetRegion: 'path-' + defect.pathIndex,
        comparisons: compactDashRows(rows) });
    }
    phase = 'independent-visibility'; const visibility = [];
    for (const control of [{ name: 'unpainted-join', pathIndex: 6, scales: [1, 4], expectedPassed: true },
      { name: 'subpixel-faint-content', pathIndex: 0, scales: [1], expectedPassed: true },
      { name: 'subpixel-faint-content', pathIndex: 0, scales: [4], expectedPassed: false }]) {
      const svg = await renderer.page.evaluate(mutateDashGeometrySvg, { actual: source.svg, defect: control, pathPrefix: 'native-p', clipPrefix: 'native-clip' });
      const name = 'visibility-' + control.name + '-' + control.scales.join('-') + 'x'; await save(name + '.svg', svg);
      const rows = await capture({ name, svg }, { policy, cropIds: ['path-' + control.pathIndex],
        views: shapeViews.filter(v => v.background === 'white' && control.scales.includes(v.scale)) });
      for (const row of rows) {
        const original = observations.find(o => o.name === source.name && dashViewKey(o) === dashViewKey(row));
        assert.equal(row.evaluation.passed, control.expectedPassed);
        assert.equal(row.imageHashes.actual === original.imageHashes.actual, control.expectedPassed);
      }
      visibility.push({ ...control, converterInvoked: false, numericGatesBypassed: true, inputSvg: svg, inputSha256: sha256(svg), comparisons: compactDashRows(rows) });
    }
    const current = await readDashGeometryNative(); assert.equal(current.snapshotSha256, native.snapshotSha256);
    for (const [p, h] of Object.entries(toolHashes)) assert.equal(sha256(await readFile(path.join(root, p))), h, 'Calibration tool changed.');
    const { representations, ...geometry } = reconstruction;
    const calibration = { schemaVersion: 1, comparisonKind: 'oracle-only-dash-geometry-primary', completed: true, scope: dashPrimaryScope,
      converterInvoked: false, approvedImagePolicy: false, conformanceClaim: false, toolHashes, renderer: renderer.identity,
      native: { snapshotSha256: native.snapshotSha256, metricsSha256: native.metricsSha256, referenceSha256: native.referenceSha256 }, geometry,
      representations: representations.map(r => ({ ...r, sha256: sha256(r.svg) })), measurements: compactDashRows(observations),
      derived, replays, defects, visibility };
    await save('calibration.json', JSON.stringify(calibration, null, 2) + '\n');
    await save('index.html', '<!doctype html><meta charset="utf-8"><h1>Independent dash primary calibration; no converter</h1><p><a href="calibration.json">Calibration</a></p>'
      + allRows.filter(r => r.artifacts.comparison).map(r => '<h2>' + r.name + ' / ' + dashViewKey(r) + '</h2><img style="max-width:100%" src="' + r.artifacts.comparison + '">'
        + r.regions.filter(r => r.crops).map(r => '<p>' + r.id + '</p><img style="max-width:100%" src="' + r.crops.sheet + '">').join('')).join(''));
    await verifyDashAssets(output, artifacts);
    await publish({ completed: true, verdict: 'oracle-calibration-pass', converterInvoked: false, approvedImagePolicy: false, phase: 'complete', toolHashes,
      calibration: 'calibration.json', calibrationSha256: artifacts['calibration.json'], renderer: renderer.identity,
      views: allRows.length, regions: reconstruction.regions.length, defects: defects.length, artifacts });
    console.log('Independent calibration passes: 96 observations, 96 replays, 19 defects, 8 visibility views; converter not invoked.');
  } finally { await renderer.browser.close(); }
}
await main().catch(async error => { process.exitCode = 2; console.error(error.stack);
  await publish({ completed: false, verdict: 'infrastructure-error', phase, converterInvoked: false, approvedImagePolicy: false, error: error.message, toolHashes, artifacts }); });
