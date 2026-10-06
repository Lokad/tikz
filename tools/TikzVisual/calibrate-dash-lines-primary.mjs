// Independent primary precision/defect experiment. No converter or production input.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { root, sha256, writeArtifact } from './shape-oracle-bundle.mjs';
import { createRenderer } from './compare.mjs';
import { installShapeMetrics } from './dash-geometry-image-pair.mjs';
import { shapeViews } from './shape-primary-trial-policy.mjs';
import { readDashLinesNative, reconstructDashLines } from './dash-lines-oracle.mjs';
import { dashLinesImageDefects, dashLinesVisibilityControls, mutateDashLinesSvg } from './dash-lines-image-defects.mjs';
import { dashLinesPrimaryScope, dashLinesPrimaryTools, dashLinesViewKey, captureDashLinesPrimary,
  deriveDashLinesPrimary, compactDashLinesRows, verifyDashLinesAssets } from './dash-lines-primary-common.mjs';

const base = path.join(root, 'artifacts/dash-lines-primary-calibration'), output = path.join(base, 'run-' + randomUUID()), artifacts = {}, toolHashes = {};
const save = (p, b) => writeArtifact(output, p, b, artifacts);
let phase = 'inputs';
async function publish(report) {
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n'); await writeArtifact(output, 'report.json', bytes);
  await writeArtifact(base, 'latest.json', JSON.stringify({ completed: report.completed,
    report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'), sha256: sha256(bytes) }, null, 2) + '\n');
}
async function main() {
  assert.equal(process.argv.length, 2);
  for (const p of dashLinesPrimaryTools) { const b = await readFile(path.join(root, p)); toolHashes[p] = sha256(b); await save('tool-sources/' + p, b); }
  const native = await readDashLinesNative();
  for (const p of Object.keys(native.snapshot.sourceHashes)) { const b = await readFile(path.join(root, p)); toolHashes[p] = sha256(b); await save('tool-sources/' + p, b); }
  await save('reference.svg', native.referenceBytes); await save('native-metrics.json', native.metricsBytes); await save('native-snapshot.json', native.snapshotBytes);
  await publish({ completed: false, phase, converterInvoked: false, approvedImagePolicy: false, toolHashes, artifacts });
  console.log('Independent line primary calibration: ' + path.relative(root, output));
  const renderer = await createRenderer();
  try {
    await installShapeMetrics(renderer);
    const reconstruction = await reconstructDashLines(renderer, native), variants = reconstruction.representations.map(({ mode, ...r }) => ({ name: mode, ...r }));
    for (const v of variants) await save('representations/' + v.name + '.svg', v.svg);
    const allRows = [], capture = async (variant, options = {}) => {
      const rows = await captureDashLinesPrimary(renderer, { native, reconstruction, variant, output, artifacts, ...options }); allRows.push(...rows); return rows;
    };
    phase = 'observations'; const observations = [];
    for (const v of variants) { observations.push(...await capture(v)); console.log('Measured ' + v.name); }
    const derived = deriveDashLinesPrimary(observations, reconstruction.regions), policy = derived.policy;
    phase = 'replays'; const replays = [];
    for (const v of variants) {
      const rows = await capture({ ...v, name: v.name + '-replay' }, { policy });
      for (const row of rows) {
        const before = observations.find(o => o.name === v.name && dashLinesViewKey(o) === dashLinesViewKey(row));
        assert.equal(row.evaluation.passed, true); assert.deepEqual(row.metrics, before.metrics);
        assert.deepEqual(row.naturalFrames, before.naturalFrames); assert.equal(row.imageHashes.actual, before.imageHashes.actual);
        assert.deepEqual(row.regions.map(({ crops, ...r }) => r), before.regions.map(({ crops, ...r }) => r));
      }
      replays.push({ name: v.name, comparisons: compactDashLinesRows(rows) });
    }
    const source = variants.find(v => v.name === 'printed-pen-hull-driver-width-elements');
    phase = 'independent-visible-defects'; const defects = [];
    for (const defect of dashLinesImageDefects) {
      const svg = await renderer.page.evaluate(mutateDashLinesSvg, { actual: source.svg, defect, pathPrefix: 'native-p' });
      await save('defects/' + defect.name + '.svg', svg);
      const rows = await capture({ name: 'defect-' + defect.name, svg }, { policy, cropIds: ['path-' + defect.pathIndex],
        views: shapeViews.filter(v => v.background === 'white' && (defect.name !== 'root-crop' || v.frame === 'natural')) });
      const targetRegion = 'path-' + defect.pathIndex, rejected = rows.every(r => !r.evaluation.passed && r.evaluation.checks.some(c => c.id === targetRegion && !c.passed));
      defects.push({ ...defect, converterInvoked: false, numericGatesBypassed: true, inputSvg: svg, inputSha256: sha256(svg), targetRegion,
        allRequiredViewsRejected: rejected, comparisons: compactDashLinesRows(rows), evaluations: rows.map(r => ({ ...Object.fromEntries(['frame', 'scale', 'background'].map(k => [k, r[k]])), ...r.evaluation })) });
      console.log(defect.name + ': ' + (rejected ? 'rejected in all target views' : 'sensitivity failure retained'));
    }
    phase = 'independent-visibility'; const visibility = [];
    for (const control of dashLinesVisibilityControls) {
      const svg = await renderer.page.evaluate(mutateDashLinesSvg, { actual: source.svg, defect: control, pathPrefix: 'native-p' });
      await save('visibility/' + control.name + '.svg', svg);
      const rows = await capture({ name: 'visibility-' + control.name, svg }, { policy, cropIds: ['path-' + control.pathIndex], views: shapeViews.filter(v => v.background === 'white') });
      for (const row of rows) {
        const before = observations.find(o => o.name === source.name && dashLinesViewKey(o) === dashLinesViewKey(row));
        assert.equal(row.evaluation.passed, true); assert.equal(row.imageHashes.actual, before.imageHashes.actual);
      }
      visibility.push({ ...control, converterInvoked: false, numericGatesBypassed: true, exactPixelsPreserved: true, inputSvg: svg, inputSha256: sha256(svg), comparisons: compactDashLinesRows(rows) });
    }
    const coverageControls = [];
    for (const change of ['missing-observation', 'duplicate-observation', 'wrong-mode', 'chosen-region', 'nonfinite-metric', 'candidate-in-calibration']) {
      const rows = structuredClone(observations), regions = structuredClone(reconstruction.regions);
      if (change === 'missing-observation') rows.pop(); if (change === 'duplicate-observation') rows[0] = rows[1];
      if (change === 'wrong-mode') rows[0].name = 'candidate'; if (change === 'chosen-region') regions.pop();
      if (change === 'nonfinite-metric') rows[0].metrics.meanForegroundChannelError = NaN;
      if (change === 'candidate-in-calibration') rows[0].converterInvoked = true;
      assert.throws(() => deriveDashLinesPrimary(rows, regions)); coverageControls.push({ name: change, rejected: true });
    }
    const sensitivityPassed = defects.every(d => d.allRequiredViewsRejected), { representations, ...geometry } = reconstruction;
    const calibration = { schemaVersion: 1, comparisonKind: 'oracle-only-dash-lines-primary', completed: true, scope: dashLinesPrimaryScope,
      converterInvoked: false, approvedImagePolicy: false, conformanceClaim: false, sensitivityPassed, toolHashes, renderer: renderer.identity,
      native: { snapshotSha256: native.snapshotSha256, metricsSha256: sha256(native.metricsBytes), referenceSha256: sha256(native.referenceBytes) }, geometry,
      representations: variants, measurements: compactDashLinesRows(observations), derived, replays, defects, visibility, coverageControls };
    await save('calibration.json', JSON.stringify(calibration, null, 2) + '\n');
    await save('index.html', '<!doctype html><meta charset="utf-8"><h1>Independent forty-line primary trial</h1><p>No converter. Unapproved policy.</p><a href="calibration.json">Calibration</a>'
      + allRows.filter(r => r.artifacts.comparison).map(r => '<h2>' + r.name + ' / ' + dashLinesViewKey(r) + '</h2><img style="max-width:100%" loading="lazy" src="' + r.artifacts.comparison + '">'
        + r.regions.filter(r => r.crops).map(r => '<p>' + r.id + '</p><img style="max-width:100%" loading="lazy" src="' + r.crops.sheet + '">').join('')).join(''));
    for (const [p, h] of Object.entries(toolHashes)) assert.equal(sha256(await readFile(path.join(root, p))), h, 'Tool changed during calibration.');
    assert.equal((await readDashLinesNative()).snapshotSha256, native.snapshotSha256); await verifyDashLinesAssets(output, artifacts);
    await publish({ completed: true, verdict: sensitivityPassed ? 'unapproved-calibration-pass' : 'unapproved-sensitivity-failure', sensitivityPassed,
      converterInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false, overallVerdict: 'pending', toolHashes, renderer: renderer.identity,
      calibration: 'calibration.json', calibrationSha256: artifacts['calibration.json'], views: allRows.length, regions: 40, defects: defects.length, artifacts });
    process.exitCode = sensitivityPassed ? 0 : 1; console.log('Report: ' + path.relative(root, path.join(output, 'report.json')));
  } finally { await renderer.browser.close(); }
}
await main().catch(async error => { process.exitCode = 2; console.error(error.stack);
  await publish({ completed: false, verdict: 'infrastructure-error', phase, converterInvoked: false, approvedImagePolicy: false, error: error.message, toolHashes, artifacts }); });
