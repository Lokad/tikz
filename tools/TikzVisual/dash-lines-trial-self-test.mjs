// Controls for prospective line policies. This is not an admission loader.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { root, sha256, writeArtifact, outputPath } from './shape-oracle-bundle.mjs';
import { deriveDashLinesPrimary, verifyDashLinesAssets, dashLinesViewKey } from './dash-lines-primary-common.mjs';
import { deriveDashLinesPdfTrial, evaluateDashLinesPdfTrial, dashLinesPdfViewKey } from './dash-lines-pdf-trial-policy.mjs';
import { evaluateShapeTrial } from './shape-primary-trial-policy.mjs';

const output = path.join(root, 'artifacts/dash-lines-trial-controls/run-' + randomUUID()), artifacts = {}, controls = [];
const save = (p, b) => writeArtifact(output, p, b, artifacts);
const reject = (name, action) => { assert.throws(action, undefined, name); controls.push({ name, rejected: true }); };
async function readLatest(family) {
  const base = path.join(root, 'artifacts', family), pointerBytes = await readFile(path.join(base, 'latest.json')), pointer = JSON.parse(pointerBytes);
  assert.equal(pointer.completed, true); assert.match(pointer.report, /^run-[\da-f-]+\/report\.json$/);
  const filename = await outputPath(base, pointer.report), bytes = await readFile(filename); assert.equal(sha256(bytes), pointer.sha256);
  const report = JSON.parse(bytes); assert.equal(report.completed, true); assert.equal(report.sensitivityPassed, true);
  assert.equal(report.converterInvoked, false); assert.equal(report.approvedImagePolicy, false); assert.equal(report.overallVerdict, 'pending');
  await verifyDashLinesAssets(path.dirname(filename), report.artifacts);
  for (const [p, h] of Object.entries(report.toolHashes)) assert.equal(sha256(await readFile(path.join(root, p))), h, 'Stale trial input: ' + p);
  await save(family + '-report.json', bytes); await save(family + '-pointer.json', pointerBytes);
  return { report, folder: path.dirname(filename), hash: pointer.sha256 };
}
async function main() {
  assert.equal(process.argv.length, 2);
  for (const p of ['dash-lines-trial-self-test.mjs', 'dash-lines-primary-common.mjs', 'dash-lines-pdf-trial-policy.mjs', 'dash-lines-pdf-image-pair.mjs'])
    await save('tool-sources/' + p, await readFile(path.join(root, 'tools/TikzVisual', p)));
  const primaryInput = await readLatest('dash-lines-primary-calibration'), pdfInput = await readLatest('dash-lines-pdf-cairo');
  const primaryBytes = await readFile(path.join(primaryInput.folder, 'calibration.json')); assert.equal(sha256(primaryBytes), primaryInput.report.calibrationSha256);
  const primary = JSON.parse(primaryBytes), pdf = pdfInput.report;
  assert.deepEqual(deriveDashLinesPrimary(primary.measurements, primary.geometry.regions), primary.derived);
  assert.deepEqual(deriveDashLinesPdfTrial(pdf.observations, pdf.camera, pdf.regions), pdf.derived);
  controls.push({ name: 'recompute-both-independent-envelopes', passed: true });
  const pRow = primary.measurements.find(r => r.name === 'printed-pen-hull-driver-width-elements' && r.frame === 'expanded' && r.scale === 1 && r.background === 'white');
  const fRow = pdf.observations.find(r => r.mode === 'printed-pen-hull-driver-width-elements' && r.frame === 'expanded' && r.scale === 1);
  assert.equal(evaluateShapeTrial(primary.derived.policy, pRow, pRow).passed, true);
  assert.equal(evaluateDashLinesPdfTrial(pdf.derived.policies.native, fRow, fRow).passed, true);
  for (const change of ['missing', 'duplicate', 'wrong-mode', 'candidate', 'missing-region', 'nonfinite']) {
    const rows = structuredClone(primary.measurements), regions = structuredClone(primary.geometry.regions);
    if (change === 'missing') rows.pop(); if (change === 'duplicate') rows[0] = rows[1]; if (change === 'wrong-mode') rows[0].name = 'candidate';
    if (change === 'candidate') rows[0].converterInvoked = true; if (change === 'missing-region') regions.pop(); if (change === 'nonfinite') rows[0].metrics.meanForegroundChannelError = NaN;
    reject('primary-' + change, () => deriveDashLinesPrimary(rows, regions));
  }
  for (const change of ['missing', 'duplicate', 'wrong-mode', 'candidate', 'missing-region', 'fitted-camera', 'nonfinite', 'missing-ink', 'changed-reference-ink']) {
    const rows = structuredClone(pdf.observations), camera = structuredClone(pdf.camera), regions = structuredClone(pdf.regions);
    if (change === 'missing') rows.pop(); if (change === 'duplicate') rows[0] = rows[1]; if (change === 'wrong-mode') rows[0].mode = 'candidate';
    if (change === 'candidate') rows[0].converterInvoked = true; if (change === 'missing-region') regions.pop(); if (change === 'fitted-camera') camera.origin.x += 1;
    if (change === 'nonfinite') rows[0].whole.meanForegroundChannelError = NaN; if (change === 'missing-ink') delete rows[0].whole.inkCoverage;
    if (change === 'changed-reference-ink') rows[4].whole.inkCoverage.reference[0] += 1;
    reject('PDF-' + change, () => deriveDashLinesPdfTrial(rows, camera, regions));
  }
  const pLimits = primary.derived.policy.rows.find(r => dashLinesViewKey(r) === dashLinesViewKey(pRow));
  const fLimits = pdf.derived.policies.native.inkCoverageRows.find(r => dashLinesPdfViewKey(r) === dashLinesPdfViewKey(fRow));
  for (let i = 0; i < 40; i++) {
    const altered = structuredClone(pRow); altered.regions[i].rawChangedPixels = pLimits.regions[i].limits.rawChangedPixels + 1;
    const evaluated = evaluateShapeTrial(primary.derived.policy, altered, altered); assert.equal(evaluated.passed, false); assert.equal(evaluated.checks[i + 1].passed, false);
    controls.push({ name: 'primary-region-' + i, rejected: true });
    for (const channel of [0, 1, 2]) {
      const changed = structuredClone(fRow); changed.regions[i].inkCoverage.actual[channel] = fLimits.regions[i + 1].actualRanges[channel].max + 1;
      const measured = evaluateDashLinesPdfTrial(pdf.derived.policies.native, changed, changed); assert.equal(measured.passed, false); assert.equal(measured.checks[i + 1].passed, false);
      controls.push({ name: 'PDF-region-' + i + '-ink-' + channel, rejected: true });
    }
  }
  for (const [name, mutate] of [
    ['missing-native-region', r => { r.regions.pop(); }], ['changed-native-crop', r => { r.regions[0].rectangle.x += 1; }],
    ['changed-reference-ink', r => { r.whole.inkCoverage.reference[0] += 1; }], ['nonfinite-actual-ink', r => { r.whole.inkCoverage.actual[0] = NaN; }]
  ]) { const changed = structuredClone(fRow); mutate(changed); reject(name, () => evaluateDashLinesPdfTrial(pdf.derived.policies.native, changed, changed)); }
  for (const mode of ['missing-ink-view', 'duplicate-ink-view', 'wrong-ink-region', 'invalid-ink-range', 'false-admission']) {
    const policy = structuredClone(pdf.derived.policies.native);
    if (mode === 'missing-ink-view') policy.inkCoverageRows = []; if (mode === 'duplicate-ink-view') policy.inkCoverageRows.push(structuredClone(fLimits));
    if (mode === 'wrong-ink-region') policy.inkCoverageRows.find(r => dashLinesPdfViewKey(r) === dashLinesPdfViewKey(fRow)).regions[0].id = 'chosen';
    if (mode === 'invalid-ink-range') policy.inkCoverageRows.find(r => dashLinesPdfViewKey(r) === dashLinesPdfViewKey(fRow)).regions[0].actualRanges[0].min = -1;
    if (mode === 'false-admission') policy.approvedImagePolicy = true;
    reject(mode, () => evaluateDashLinesPdfTrial(policy, fRow, fRow));
  }
  // The extra mark is inside every native natural root and path-0 crop, in
  // empty space below the first stroke. This proof does not read a candidate.
  const factor = 96 / 72.27, radius = factor / 2;
  const mark = { minX: 20 * factor - radius, maxX: 24 * factor + radius, minY: 1.5 * factor - radius, maxY: 1.5 * factor + radius };
  const contains = b => mark.minX >= b.minX && mark.maxX <= b.maxX && mark.minY >= b.minY && mark.maxY <= b.maxY;
  assert.ok(primary.geometry.roots.every(r => contains(r.picture)));
  const region = primary.geometry.regions[0].rectangle, camera = primary.geometry.camera;
  assert.ok(contains({ minX: camera.x + region.x, minY: camera.y + region.y, maxX: camera.x + region.x + region.width, maxY: camera.y + region.y + region.height }));
  assert.ok(mark.minY > primary.geometry.lines[0].driverWidth * factor / 2);
  assert.ok(mark.maxY < -primary.geometry.lines[1].start.y * factor - primary.geometry.lines[1].driverWidth * factor / 2);
  controls.push({ name: 'extra-faint-mark-inside-natural-frame-and-native-region-in-empty-space', passed: true, mark });
  assert.equal(primary.defects.length, 21); assert.ok(primary.defects.every(d => d.allRequiredViewsRejected));
  assert.equal(pdf.defects.length, 21); assert.ok(pdf.defects.every(d => d.allRequiredViewsRejected));
  for (const c of [primary, pdf]) { assert.equal(c.visibility.length, 2); assert.ok(c.visibility.every(v => v.exactPixelsPreserved)); }
  await save('report.json', JSON.stringify({ completed: true, passed: true, converterInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false,
    primaryReportSha256: primaryInput.hash, pdfReportSha256: pdfInput.hash, controls, artifacts: { ...artifacts } }, null, 2) + '\n');
  console.log('Passed ' + controls.length + ' line trial controls: ' + path.relative(root, path.join(output, 'report.json')));
}
await main().catch(async error => { process.exitCode = 2; console.error(error.stack);
  await save('report.json', JSON.stringify({ completed: false, converterInvoked: false, approvedImagePolicy: false, error: error.message, controls, artifacts: { ...artifacts } }, null, 2) + '\n'); });
