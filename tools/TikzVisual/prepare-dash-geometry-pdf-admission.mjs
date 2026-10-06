// Explicit oracle-only preparation; output remains under ignored artifacts/.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { root, sha256, writeArtifact } from './shape-oracle-bundle.mjs';
import { verifyDashAssets, readDashGeometryNative } from './dash-geometry-primary-common.mjs';
import { deriveDashGeometryPdfTrial } from './dash-geometry-pdf-trial-policy.mjs';

assert.equal(process.argv.length, 2);
const base = path.join(root, 'artifacts/dash-geometry-pdf-prepared'), output = path.join(base, 'run-' + randomUUID()), artifacts = {};
const save = (p, b) => writeArtifact(output, p, b, artifacts);
const sourceBase = path.join(root, 'artifacts/dash-geometry-pdf-cairo'), pointer = JSON.parse(await readFile(path.join(sourceBase, 'latest.json')));
assert.equal(pointer.completed, true); assert.match(pointer.report, /^run-[\da-f-]+\/report\.json$/);
const reportFile = path.join(sourceBase, pointer.report), reportBytes = await readFile(reportFile); assert.equal(sha256(reportBytes), pointer.sha256);
const c = JSON.parse(reportBytes), folder = path.dirname(reportFile);
assert.equal(c.converterInvoked, false); assert.equal(c.approvedImagePolicy, false); assert.equal(c.sensitivityPassed, true);
assert.equal(c.verdict, 'unapproved-trial-pass'); await verifyDashAssets(folder, c.artifacts);
const native = await readDashGeometryNative(); assert.equal(native.snapshotSha256, c.nativeSnapshotSha256);
assert.deepEqual(deriveDashGeometryPdfTrial(c.observations, c.camera, c.regions), c.derived);
const qualification = JSON.parse(await readFile(path.join(folder, 'qualification-report.json')));
const toolHashes = { ...qualification.sources, ...c.toolHashes };
const own = 'tools/TikzVisual/prepare-dash-geometry-pdf-admission.mjs'; toolHashes[own] = sha256(await readFile(path.join(root, own)));
for (const [p, h] of Object.entries(toolHashes)) { const b = await readFile(path.join(root, p)); assert.equal(sha256(b), h); await save('tool-sources/' + p, b); }
// Evaluation is recomputed by the guard; retain the independent measurements.
const compact = rows => rows.map(({ artifacts, evaluation, regions, ...r }) => ({ ...r, regions: regions.map(({ crops, ...r }) => r) }));
const identity = ({ executable, ...t }) => t;
const numeric = JSON.parse(await readFile(path.join(folder, 'pdf-numeric.json')));
const representations = [];
for (const name of [...new Set(c.observations.map(o => o.mode))]) {
 const svg = await readFile(path.join(folder, 'representations', name + '.svg'), 'utf8'); representations.push({ mode: name, svg, sha256: sha256(svg) });
}
const defects = [];
for (const d of c.defects) {
 const svg = await readFile(path.join(folder, 'defects', d.name + '.svg'), 'utf8'); assert.equal(sha256(svg), d.inputSha256);
 defects.push({ ...d, inputSvg: svg, comparisons: compact(d.comparisons) });
}
const pages = {};
for (const scale of [1, 4]) {
 const p = 'pdf-page-' + scale + 'x.png', b = await readFile(path.join(folder, p)); await save(p, b);
 pages[scale + 'x'] = { file: 'tests/Reference/DashGeometry/pdf-cairo/' + p, sha256: sha256(b) };
}
const calibration = { schemaVersion: 1, comparisonKind: 'oracle-only-dash-geometry-Cairo-PDF-calibration', completed: true,
 converterInvoked: false, approvedImagePolicy: false, conformanceClaim: false,
 scope: 'Only sixteen fixed geometry paints and three clips, white native-page PDF views at 1x/4x, with separate original/native SVG limits.',
 sourceReportSha256: pointer.sha256, qualificationReportSha256: c.qualificationSha256,
 native: { snapshotSha256: native.snapshotSha256, metricsSha256: native.metricsSha256, referenceSha256: native.referenceSha256, pdfSha256: native.snapshot.artifacts['reference.pdf'] },
 toolHashes, renderer: c.renderer, pdfRenderer: identity(c.pdfRenderer), pages, numeric,
 qualification: { completed: qualification.completed, converterInvoked: qualification.converterInvoked, approvedImagePolicy: qualification.approvedImagePolicy,
   nativeSnapshotSha256: qualification.nativeSnapshotSha256, upstream: qualification.upstream,
   tools: Object.fromEntries(Object.entries(qualification.tools).map(([k, v]) => [k, identity(v)])),
   commands: qualification.commands, equivalenceControls: qualification.equivalenceControls },
 camera: c.camera, regions: c.regions, viewport: c.viewport, representations,
 observations: compact(c.observations), derived: c.derived, replays: compact(c.replays), defects, controls: c.controls };
const bytes = Buffer.from(JSON.stringify(calibration, null, 2) + '\n');
assert.ok(!bytes.toString().includes('C:\\Users\\') && !bytes.toString().includes('C:\\\\Users\\\\'), 'Private absolute path in public evidence.');
await save('calibration.json', bytes); await save('source-calibration-report.json', reportBytes);
const report = { completed: true, converterInvoked: false, approvedImagePolicy: false, calibrationSha256: sha256(bytes),
 sourceReportSha256: pointer.sha256, sourceFile: pointer.report, toolHashes, artifacts };
await writeArtifact(output, 'report.json', JSON.stringify(report, null, 2) + '\n');
await writeArtifact(base, 'latest.json', JSON.stringify({ completed: true, report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'),
 sha256: sha256(await readFile(path.join(output, 'report.json'))) }, null, 2) + '\n');
console.log(JSON.stringify({ prepared: path.relative(root, output), calibrationSha256: sha256(bytes), bytes: bytes.length, tools: Object.keys(toolHashes).length }));
