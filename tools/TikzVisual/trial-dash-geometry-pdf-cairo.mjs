import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Fresh public conversion against independent, still unapproved PDF limits.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { root, sha256, writeArtifact } from './shape-oracle-bundle.mjs';
import { createRenderer } from './compare.mjs';
import { readDashGeometryNative, verifyDashAssets } from './dash-geometry-primary-common.mjs';
import { installShapeMetrics } from './dash-geometry-image-pair.mjs';
import { measureShapePdfPair } from './shape-pdf-image-pair.mjs';
import { shapePdfViews, evaluateShapePdfTrial, combineShapePdfTrial } from './shape-pdf-trial-policy.mjs';
import { deriveDashGeometryPdfTrial, classifyDashPdfDefect, dashPdfViewKey } from './dash-geometry-pdf-trial-policy.mjs';

const base = path.join(root, 'artifacts/dash-geometry-pdf-cairo-trial'), output = path.join(base, 'run-' + randomUUID()), artifacts = {}, toolHashes = {};
const save = (p, b) => writeArtifact(output, p, b, artifacts);
let phase = 'independent-calibration';
async function publish(report) {
  await writeArtifact(output, 'report.json', JSON.stringify(report, null, 2) + '\n');
  await writeArtifact(base, 'latest.json', JSON.stringify({ completed: report.completed, report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'),
    sha256: sha256(await readFile(path.join(output, 'report.json'))) }, null, 2) + '\n');
}
async function reportAt(folder) {
  const pointer = JSON.parse(await readFile(path.join(folder, 'latest.json'))); assert.equal(pointer.completed, true);
  assert.match(pointer.report, /^run-[\da-f-]+\/report\.json$/);
  const file = path.join(folder, pointer.report), bytes = await readFile(file); assert.equal(sha256(bytes), pointer.sha256);
  const report = JSON.parse(bytes); assert.equal(report.completed, true);
  await verifyDashAssets(path.dirname(file), report.artifacts); return { report, bytes, folder: path.dirname(file), sha256: pointer.sha256 };
}
async function main() {
  assert.equal(process.argv.length, 2);
  const calibration = await reportAt(path.join(root, 'artifacts/dash-geometry-pdf-cairo')), c = calibration.report;
  assert.equal(c.comparisonKind, 'oracle-only-dash-geometry-Cairo-PDF-trial');
  assert.equal(c.converterInvoked, false); assert.equal(c.approvedImagePolicy, false); assert.equal(c.sensitivityPassed, true);
  assert.equal(c.defects.length, 19); assert.equal(c.replays.length, 40); assert.equal(c.numeric.executedChecks, 446); assert.equal(c.numeric.passed, true);
  const native = await readDashGeometryNative(); assert.equal(c.nativeSnapshotSha256, native.snapshotSha256);
  const derived = deriveDashGeometryPdfTrial(c.observations, c.camera, c.regions); assert.deepEqual(derived, c.derived);
  for (const d of c.defects) assert.equal(classifyDashPdfDefect(d, d.comparisons).allRequiredViewsRejected, true);
  for (const [p, h] of Object.entries(c.toolHashes)) {
    const b = await readFile(path.join(root, p)); assert.equal(sha256(b), h); toolHashes[p] = h; await save('tool-sources/' + p, b);
  }
  const own = 'tools/TikzVisual/trial-dash-geometry-pdf-cairo.mjs', ownBytes = await readFile(path.join(root, own)); toolHashes[own] = sha256(ownBytes); await save('tool-sources/' + own, ownBytes);
  await save('independent-calibration-report.json', calibration.bytes);
  await save('original-reference.svg', native.referenceBytes); await save('native-snapshot.json', native.snapshotBytes);
  const pdfPages = {};
  for (const scale of [1, 4]) {
    const p = 'pdf-page-' + scale + 'x.png', b = await readFile(path.join(calibration.folder, p)); assert.equal(sha256(b), c.artifacts[p]);
    await save(p, b); pdfPages[scale] = 'data:image/png;base64,' + b.toString('base64');
  }
  phase = 'fresh-public-primary';
  await publish({ completed: false, phase, overallVerdict: 'pending', approvedImagePolicy: false, toolHashes, artifacts });
  console.log('Unapproved public PDF trial: ' + path.relative(root, output));
  const primaryProcess = spawnSync(process.execPath, ['tools/TikzVisual/compare-dash-geometry-primary.mjs'],
    { cwd: root, windowsHide: true, timeout: 360000, maxBuffer: 1000000 });
  await save('primary-command.txt', Buffer.concat([primaryProcess.stdout ?? Buffer.alloc(0), primaryProcess.stderr ?? Buffer.alloc(0)]));
  assert.equal(primaryProcess.error, undefined); assert.equal(primaryProcess.status, 0, 'Fresh public primary comparison failed.');
  const primary = await reportAt(path.join(root, 'artifacts/dash-geometry-primary')), p = primary.report;
  assert.equal(p.primaryConformanceClaim, true); assert.equal(p.passed, true);
  assert.equal(p.policyId, 'chromium-153-dash-geometry-primary-v1');
  assert.equal(p.numeric.state, 'passed'); assert.equal(p.numeric.executedChecks, 1090);
  assert.equal(p.frame.state, 'passed'); assert.equal(p.frame.executedChecks, 6);
  assert.equal(p.primary.state, 'passed'); assert.equal(p.primary.executedViews, 12); assert.equal(p.comparisons.length, 12);
  assert.ok(p.comparisons.every(r => r.evaluation.passed));
  await save('primary-report.json', primary.bytes);
  for (const q of ['source.tikz', 'actual.svg', 'actual-scene.json']) {
    const b = await readFile(path.join(primary.folder, 'candidate-evidence', q));
    assert.equal(sha256(b), p.artifacts['candidate-evidence/' + q]); await save(q, b);
  }
  const actual = await readFile(path.join(output, 'actual.svg'), 'utf8'), renderer = await createRenderer();
  try {
    await installShapeMetrics(renderer); requireRenderer(renderer.identity, c.renderer); requireRenderer(p.renderer, c.renderer);
    phase = 'both-SVG-PDF-comparisons'; const rows = [];
    for (const variant of [{ mode: 'original-svg', svg: native.reference, units: 'bp', origin: native.metrics.driverOriginBp, policy: derived.policies.original },
      { mode: 'public-candidate', svg: actual, units: 'cssPixels', origin: { x: 0, y: 0 }, policy: derived.policies.native }]) for (const view of shapePdfViews) {
      const result = await measureShapePdfPair(renderer, { svg: variant.svg, units: variant.units, svgOriginBp: variant.origin,
        camera: c.camera, regions: c.regions, ...view, pdfPage: pdfPages[view.scale], rightLabel: variant.mode, cropLimit: 16 });
      const evaluation = evaluateShapePdfTrial(variant.policy, view, result), links = {}, crops = new Map(), stem = variant.mode + '/' + dashPdfViewKey(view);
      for (const [k, png] of Object.entries(result.images)) { links[k] = stem + '-' + k + '.png'; await save(links[k], Buffer.from(png, 'base64')); }
      for (const crop of result.crops) {
        const links = {}; for (const [k, png] of Object.entries(crop.images)) { links[k] = stem + '-' + crop.id + '-' + k + '.png'; await save(links[k], Buffer.from(png, 'base64')); } crops.set(crop.id, links);
      }
      rows.push({ mode: variant.mode, ...result, images: undefined, crops: undefined, evaluation, artifacts: links,
        regions: result.regions.map(r => ({ ...r, crops: crops.get(r.id) ?? null })) });
      console.log(variant.mode + ' ' + dashPdfViewKey(view) + ': ' + (evaluation.passed ? 'trial pass' : 'trial failed'));
    }
    const primaryGate = { state: p.primary.state, executedChecks: p.comparisons.reduce((n, r) => n + r.evaluation.checks.length, 0) };
    const combined = combineShapePdfTrial(p.numeric, p.frame, primaryGate,
      rows.filter(r => r.mode === 'original-svg'), rows.filter(r => r.mode === 'public-candidate'), { original: derived.policies.original, candidate: derived.policies.native });
    const sourceLinks = c.regions.slice(1).map((r, i) => {
      const link = p.sourceLinks[i]; assert.equal(link.regionId, r.id); assert.equal(link.caseId, r.caseId); return link;
    });
    await save('index.html', '<!doctype html><meta charset="utf-8"><h1>Dash geometry: ' + combined.verdict
      + '</h1><p>Unapproved PDF trial; combined image admission remains pending.</p><a href="report.json">Report</a> · <a href="source.tikz">Source</a> · <a href="actual-scene.json">Scene</a>'
      + rows.filter(r => r.artifacts.sheet).map(r => '<h2>' + r.mode + ' / ' + dashPdfViewKey(r) + '</h2><img src="' + r.artifacts.sheet + '">'
        + r.regions.map(r => '<p>' + r.id + ' / ' + r.caseId + '</p><img src="' + r.crops.sheet + '">').join('')).join(''));
    for (const [q, h] of Object.entries(toolHashes)) assert.equal(sha256(await readFile(path.join(root, q))), h);
    assert.equal((await readDashGeometryNative()).snapshotSha256, c.nativeSnapshotSha256); await verifyDashAssets(output, artifacts);
    await publish({ schemaVersion: 1, comparisonKind: 'unapproved-dash-geometry-Cairo-PDF-public-trial', completed: true, ...combined,
      calibrationReportSha256: calibration.sha256, primaryReportSha256: primary.sha256, nativeSnapshotSha256: c.nativeSnapshotSha256,
      renderer: renderer.identity, pdfRenderer: c.pdfRenderer, toolHashes, camera: c.camera, regions: c.regions, sourceLinks, comparisons: rows, artifacts,
      agent: { viewer: 'index.html', source: 'source.tikz', scene: 'actual-scene.json', focusedRerun: 'node tools/TikzVisual/trial-dash-geometry-pdf-cairo.mjs' } });
    process.exitCode = combined.passed ? 0 : 1;
  } finally { await renderer.browser.close(); }
}
await main().catch(async error => { process.exitCode = 2; console.error(error.stack);
  await publish({ completed: false, phase, verdict: 'infrastructure-error', overallVerdict: 'pending', approvedImagePolicy: false, error: error.message, toolHashes, artifacts }); });
