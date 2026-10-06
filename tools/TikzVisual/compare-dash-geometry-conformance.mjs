import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { root, sha256, writeArtifact } from './shape-oracle-bundle.mjs';
import { createRenderer } from './compare.mjs';
import { verifyDashAssets } from './dash-geometry-primary-common.mjs';
import { installShapeMetrics } from './dash-geometry-image-pair.mjs';
import { measureShapePdfPair } from './shape-pdf-image-pair.mjs';
import { shapePdfViews, evaluateShapePdfTrial } from './shape-pdf-trial-policy.mjs';
import { dashPdfViewKey } from './dash-geometry-pdf-trial-policy.mjs';
import { loadDashPdfPolicy, combineDashPdf } from './dash-geometry-pdf-policy.mjs';

const base = path.join(root, 'artifacts/dash-geometry-conformance'), output = path.join(base, 'run-' + randomUUID()), artifacts = {};
const save = (p, b) => writeArtifact(output, p, b, artifacts);
let phase = 'immutable-PDF-policy';
async function publish(report) {
  await writeArtifact(output, 'report.json', JSON.stringify(report, null, 2) + '\n');
  await writeArtifact(base, 'latest.json', JSON.stringify({ completed: report.completed, report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'),
    sha256: sha256(await readFile(path.join(output, 'report.json'))) }, null, 2) + '\n');
}
async function main() {
  assert.equal(process.argv.length, 2); const renderer = await createRenderer();
  try {
    await installShapeMetrics(renderer); const evidence = await loadDashPdfPolicy(renderer);
    await save('pdf-profile.json', evidence.profileBytes); await save('independent-PDF-calibration.json', evidence.calibrationBytes);
    await save('reference.svg', evidence.native.referenceBytes); await save('native-snapshot.json', evidence.native.snapshotBytes);
    for (const [p, h] of Object.entries({ ...evidence.calibration.toolHashes, ...evidence.profile.guardToolHashes })) {
      const b = await readFile(path.join(root, p)); assert.equal(sha256(b), h); await save('tool-sources/' + p, b);
    }
    phase = 'fresh-public-primary'; await publish({ completed: false, phase, overallVerdict: 'pending', artifacts });
    console.log('Combined dash geometry comparison: ' + path.relative(root, output));
    const processResult = spawnSync(process.execPath, ['tools/TikzVisual/compare-dash-geometry-primary.mjs'],
      { cwd: root, windowsHide: true, timeout: 360000, maxBuffer: 1000000 });
    await save('primary-command.txt', Buffer.concat([processResult.stdout ?? Buffer.alloc(0), processResult.stderr ?? Buffer.alloc(0)]));
    assert.equal(processResult.error, undefined); assert.equal(processResult.status, 0);
    const primaryBase = path.join(root, 'artifacts/dash-geometry-primary'), pointer = JSON.parse(await readFile(path.join(primaryBase, 'latest.json')));
    assert.equal(pointer.completed, true); assert.match(pointer.report, /^run-[\da-f-]+\/report\.json$/);
    const primaryFile = path.join(primaryBase, pointer.report), primaryBytes = await readFile(primaryFile); assert.equal(sha256(primaryBytes), pointer.sha256);
    const primary = JSON.parse(primaryBytes); assert.equal(primary.completed, true); assert.equal(primary.primaryConformanceClaim, true);
    await verifyDashAssets(path.dirname(primaryFile), primary.artifacts); await save('primary-report.json', primaryBytes);
    for (const p of ['source.tikz', 'actual.svg', 'actual-scene.json']) {
      const b = await readFile(path.join(path.dirname(primaryFile), 'candidate-evidence', p)); assert.equal(sha256(b), primary.artifacts['candidate-evidence/' + p]); await save(p, b);
    }
    const actual = await readFile(path.join(output, 'actual.svg'), 'utf8'), rows = [];
    const { camera, regions } = evidence.geometry;
    for (const scale of [1, 4]) await save('pdf-page-' + scale + 'x.png', Buffer.from(evidence.pdfPages[scale].split(',')[1], 'base64'));
    phase = 'both-PDF-comparisons';
    for (const v of [{ mode: 'original-svg', svg: evidence.native.reference, units: 'bp', origin: evidence.native.metrics.driverOriginBp, policy: evidence.policies.original },
      { mode: 'candidate', svg: actual, units: 'cssPixels', origin: { x: 0, y: 0 }, policy: evidence.policies.native }]) for (const view of shapePdfViews) {
      const result = await measureShapePdfPair(renderer, { svg: v.svg, units: v.units, svgOriginBp: v.origin,
        camera, regions, ...view, pdfPage: evidence.pdfPages[view.scale], rightLabel: v.mode, cropLimit: 16 });
      const links = {}, crops = new Map(), stem = v.mode + '/' + dashPdfViewKey(view);
      for (const [k, png] of Object.entries(result.images)) { links[k] = stem + '-' + k + '.png'; await save(links[k], Buffer.from(png, 'base64')); }
      for (const crop of result.crops) { const links = {}; for (const [k, png] of Object.entries(crop.images)) {
        links[k] = stem + '-' + crop.id + '-' + k + '.png'; await save(links[k], Buffer.from(png, 'base64')); } crops.set(crop.id, links); }
      rows.push({ mode: v.mode, ...result, images: undefined, crops: undefined, artifacts: links,
        evaluation: evaluateShapePdfTrial(v.policy, view, result), regions: result.regions.map(r => ({ ...r, crops: crops.get(r.id) })) });
    }
    const combined = combineDashPdf(evidence, primary, rows.filter(r => r.mode === 'original-svg'), rows.filter(r => r.mode === 'candidate'));
    const sourceLinks = regions.slice(1).map((r, i) => { const link = primary.sourceLinks[i]; assert.equal(link.regionId, r.id); assert.equal(link.caseId, r.caseId); return link; });
    await save('index.html', '<!doctype html><meta charset="utf-8"><h1>Dash geometry: ' + combined.verdict + '</h1><p>Fixed sixteen-paint/three-clip profile.</p>'
      + '<a href="report.json">Report</a> · <a href="source.tikz">Source</a> · <a href="actual-scene.json">Scene</a>'
      + rows.filter(r => r.artifacts.sheet).map(r => '<h2>' + r.mode + ' / ' + dashPdfViewKey(r) + '</h2><img src="' + r.artifacts.sheet + '">'
        + r.regions.map(r => '<p>' + r.id + ' / ' + r.caseId + '</p><img src="' + r.crops.sheet + '">').join('')).join(''));
    const current = await loadDashPdfPolicy(renderer); assert.equal(current.profileSha256, evidence.profileSha256); await verifyDashAssets(output, artifacts);
    await publish({ schemaVersion: 1, comparisonKind: 'dash-geometry-combined-conformance', completed: true, ...combined,
      policyId: evidence.profile.id, policySha256: evidence.profileSha256, calibrationSha256: evidence.profile.calibration.sha256,
      primaryReportSha256: pointer.sha256, renderer: renderer.identity, pdfRenderer: evidence.calibration.pdfRenderer,
      numericPdfInstructionChecks: evidence.numeric.checks.length, camera, regions, sourceLinks, comparisons: rows, artifacts,
      agent: { viewer: 'index.html', source: 'source.tikz', scene: 'actual-scene.json', focusedRerun: 'node tools/TikzVisual/compare-dash-geometry-conformance.mjs' } });
    console.log('Dash geometry ' + combined.verdict + ': numeric/frame/primary and both PDF gates; fixed corpus only.'); process.exitCode = combined.passed ? 0 : 1;
  } finally { await renderer.browser.close(); }
}
await main().catch(async error => { process.exitCode = 2; console.error(error.stack);
  await publish({ completed: false, phase, verdict: 'infrastructure-error', overallVerdict: 'pending', error: error.message, artifacts }); });
