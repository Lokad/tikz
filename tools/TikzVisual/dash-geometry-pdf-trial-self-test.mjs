// Research-policy controls: this command grants no image admission.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { root, sha256, writeArtifact } from './shape-oracle-bundle.mjs';
import { readDashGeometryNative, verifyDashAssets } from './dash-geometry-primary-common.mjs';
import { deriveDashGeometryPdfTrial, classifyDashPdfDefect, dashPdfViewKey } from './dash-geometry-pdf-trial-policy.mjs';
import { evaluateShapePdfTrial } from './shape-pdf-trial-policy.mjs';

assert.equal(process.argv.length, 2);
const base = path.join(root, 'artifacts/dash-geometry-pdf-trial-controls'), output = path.join(base, 'run-' + randomUUID()), artifacts = {}, controls = [];
const save = (p, b) => writeArtifact(output, p, b, artifacts);
const sourceBase = path.join(root, 'artifacts/dash-geometry-pdf-cairo'), pointer = JSON.parse(await readFile(path.join(sourceBase, 'latest.json')));
assert.equal(pointer.completed, true); assert.match(pointer.report, /^run-[\da-f-]+\/report\.json$/);
const bytes = await readFile(path.join(sourceBase, pointer.report)); assert.equal(sha256(bytes), pointer.sha256);
const source = JSON.parse(bytes); assert.equal(source.completed, true); assert.equal(source.converterInvoked, false); assert.equal(source.approvedImagePolicy, false);
await verifyDashAssets(path.dirname(path.join(sourceBase, pointer.report)), source.artifacts);
const native = await readDashGeometryNative(); assert.equal(source.nativeSnapshotSha256, native.snapshotSha256);
for (const [p, h] of Object.entries(source.toolHashes)) assert.equal(sha256(await readFile(path.join(root, p))), h);
const derived = deriveDashGeometryPdfTrial(source.observations, source.camera, source.regions); assert.deepEqual(derived, source.derived);
controls.push({ name: 'recompute-independent-envelope', passed: true });
const original = source.observations.filter(o => o.mode === 'printed-pen-hull-driver-width-elements');
for (const row of original) {
  assert.equal(evaluateShapePdfTrial(derived.policies.native, row, row).passed, true);
  controls.push({ name: 'unchanged-' + dashPdfViewKey(row), passed: true });
}
function rejected(name, body) {
  let rejected = false; try { rejected = body() === false; } catch { rejected = true; }
  assert.equal(rejected, true, name); controls.push({ name, passed: true });
}
for (const [name, change] of [
  ['missing-region', r => r.regions.pop()], ['duplicate-region', r => r.regions[0] = r.regions[1]],
  ['chosen-crop', r => r.regions[0].rasterRectangles['1x'].x++], ['missing-reference-foreground', r => r.regions[0].referenceForegroundPixels++],
  ['changed-reference-components', r => r.regions[0].topology.referenceComponents++],
  ['changed-reference-edges', r => r.regions[0].topology.referenceEdgePixels++],
  ['nonfinite-mean', r => r.regions[0].meanForegroundChannelError = NaN],
  ['invalid-pixel-count', r => r.regions[0].rawChangedPixels = -1],
  ['fractional-pixel-count', r => r.regions[0].rawChangedPixels += .5],
  ['false-exact-summary', r => r.regions[0].exactRgbaMatch = true],
  ['false-component-summary', r => r.regions[0].topology.componentDifference++],
  ['lost-reference-edges', r => { r.regions[0].topology.referenceEdgePixels = 0; r.regions[0].topology.edgeState = 'reference-empty'; }],
  ['unmeasured-edge-distance', r => r.regions[0].topology.maxEdgeDisplacementRasterPixels = null],
  ['wrong-topology-threshold', r => r.regions[0].topology.threshold = 17],
  ['wrong-native-page', r => r.pageSize.width++], ['wrong-frame', r => r.frame = 'chosen'],
  ['wrong-scale', r => r.scale = 2], ['wrong-background', r => r.background = 'black'],
  ['outside-whole-ink', r => r.outsideWholeChangedPixels++],
  ['unstable-pdf', r => r.repeat.pdf.exactRgbaMatch = false], ['unstable-svg', r => r.repeat.svg.exactRgbaMatch = false]
]) {
  const row = structuredClone(original.find(r => r.scale === 1 && r.frame === 'natural')), view = { frame: row.frame, scale: row.scale, background: row.background };
  change(row); rejected(name, () => evaluateShapePdfTrial(derived.policies.native, view, row).passed);
}
for (const defect of source.defects) {
  const calculated = classifyDashPdfDefect(defect, defect.comparisons);
  assert.equal(calculated.allRequiredViewsRejected, defect.allRequiredViewsRejected); assert.deepEqual(calculated.views, defect.views);
  controls.push({ name: 'classify-' + defect.name, passed: true, sensitivityPassed: calculated.allRequiredViewsRejected });
  rejected('missing-defect-view-' + defect.name, () => { classifyDashPdfDefect(defect, defect.comparisons.slice(1)); return true; });
}
for (const p of ['dash-geometry-pdf-trial-self-test.mjs', 'dash-geometry-pdf-trial-policy.mjs', 'shape-pdf-trial-policy.mjs']) {
  await save('tool-sources/' + p, await readFile(path.join(root, 'tools/TikzVisual', p)));
}
await save('source-calibration-report.json', bytes);
const report = { schemaVersion: 1, completed: true, passed: true, converterInvoked: false, approvedImagePolicy: false,
  imageConformanceClaim: false, sourceReportSha256: pointer.sha256, sourceSensitivityPassed: source.sensitivityPassed, controls, artifacts };
await writeArtifact(output, 'report.json', JSON.stringify(report, null, 2) + '\n');
await writeArtifact(base, 'latest.json', JSON.stringify({ completed: true, report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'),
  sha256: sha256(await readFile(path.join(output, 'report.json'))) }, null, 2) + '\n');
console.log('PDF trial controls: ' + controls.length + ' pass; independent sensitivity ' + (source.sensitivityPassed ? 'passes' : 'remains insufficient') + '.');
