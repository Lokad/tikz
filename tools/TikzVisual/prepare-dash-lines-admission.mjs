// Explicit independent reference preparation. Writes ignored artifacts only.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { root, sha256, writeArtifact } from './shape-oracle-bundle.mjs';
import { readDashLinesNative } from './dash-lines-oracle.mjs';
import { deriveDashLinesPrimary, verifyDashLinesAssets } from './dash-lines-primary-common.mjs';
import { deriveDashLinesPdfTrial } from './dash-lines-pdf-trial-policy.mjs';

const primaryFile = 'artifacts/dash-lines-primary-calibration/run-ef8a4ec4-7847-4ee1-b842-c6bdef47c1fa/report.json';
const primaryHash = '03938fc9f918f62c6ef3525c634b91aadd2ecc1c90366bab95bf70e087890a78';
const pdfFile = 'artifacts/dash-lines-pdf-cairo/run-ed366d68-a180-4a56-a650-fed5d2c8572c/report.json';
const pdfHash = '9e9d8a72c40b5e6900d7faf08d306bb0ddcc72574f91080ac4f5888b1b9da673';
const base = path.join(root, 'artifacts/dash-lines-prepared'), output = path.join(base, 'run-' + randomUUID()), artifacts = {};
const save = (p, b) => writeArtifact(output, p, b, artifacts);
const compact = rows => rows.map(({ artifacts, evaluation, regions, ...r }) => ({ ...r, regions: regions.map(({ crops, ...r }) => r) }));
const identity = ({ executable, ...r }) => r;
async function report(file, digest) {
  const bytes = await readFile(path.join(root, file)); assert.equal(sha256(bytes), digest);
  const value = JSON.parse(bytes), folder = path.dirname(path.join(root, file));
  assert.equal(value.completed, true); assert.equal(value.converterInvoked, false); assert.equal(value.approvedImagePolicy, false);
  assert.equal(value.sensitivityPassed, true); await verifyDashLinesAssets(folder, value.artifacts);
  return { value, folder, bytes };
}
async function main() {
  assert.equal(process.argv.length, 2);
  const p = await report(primaryFile, primaryHash), f = await report(pdfFile, pdfHash), native = await readDashLinesNative();
  const primaryBytes = await readFile(path.join(p.folder, 'calibration.json')); assert.equal(sha256(primaryBytes), p.value.calibrationSha256);
  const primary = JSON.parse(primaryBytes), pdf = f.value;
  assert.deepEqual(deriveDashLinesPrimary(primary.measurements, primary.geometry.regions), primary.derived);
  assert.deepEqual(deriveDashLinesPdfTrial(pdf.observations, pdf.camera, pdf.regions), pdf.derived);
  assert.equal(primary.native.snapshotSha256, native.snapshotSha256); assert.equal(pdf.nativeSnapshotSha256, native.snapshotSha256);
  const toolHashes = { ...primary.toolHashes, ...pdf.toolHashes }, own = 'tools/TikzVisual/prepare-dash-lines-admission.mjs';
  toolHashes[own] = sha256(await readFile(path.join(root, own)));
  for (const [file, h] of Object.entries(toolHashes)) { const b = await readFile(path.join(root, file)); assert.equal(sha256(b), h); await save('tool-sources/' + file, b); }
  const qBytes = await readFile(path.join(f.folder, 'qualification-report.json')); assert.equal(sha256(qBytes), pdf.qualificationSha256);
  const q = JSON.parse(qBytes), pageHashes = {}, qFolder = path.dirname(path.join(root, 'artifacts/dash-lines-pdf-rasterizers/run-c254fd69-7abc-476b-adee-321bd67cf747/report.json'));
  const commands = await Promise.all(q.commands.map(async c => {
    assert.deepEqual(c.args.slice(0, 6), ['-png', '-r', String(96 * c.scale), '-f', '1', '-singlefile']);
    assert.equal(path.basename(c.args[6]), c.document + '.pdf'); assert.equal(c.repeatArgs[6], c.args[6]);
    const stem = c.name + '/' + c.document + '-' + c.scale + 'x';
    for (const suffix of ['', '-repeat']) {
      const file = stem + suffix + '.png'; pageHashes[file] = q.artifacts[file];
      assert.equal(sha256(await readFile(path.join(qFolder, file))), pageHashes[file]);
    }
    return { ...c, args: [...c.args.slice(0, 6), c.document + '.pdf', stem], repeatArgs: [...c.args.slice(0, 6), c.document + '.pdf', stem + '-repeat'] };
  }));
  const pages = {};
  for (const scale of [1, 4]) {
    const file = 'pdf-page-' + scale + 'x.png', b = await readFile(path.join(f.folder, file)); assert.equal(sha256(b), pdf.artifacts[file]); await save(file, b);
    pages[scale + 'x'] = { file: 'tests/Reference/Dashes/conformance/' + file, sha256: sha256(b) };
  }
  const representations = [];
  for (const mode of [...new Set(pdf.observations.map(r => r.mode))]) {
    const svg = await readFile(path.join(f.folder, 'representations/' + mode + '.svg'), 'utf8'); representations.push({ mode, svg, sha256: sha256(svg) });
  }
  const calibration = {
    schemaVersion: 1, comparisonKind: 'oracle-only-dash-lines-combined-calibration', completed: true,
    converterInvoked: false, approvedImagePolicy: false, conformanceClaim: false,
    sourceReports: { primary: primaryHash, pdf: pdfHash }, qualificationReportSha256: pdf.qualificationSha256,
    native: { snapshotSha256: native.snapshotSha256, metricsSha256: sha256(native.metricsBytes), referenceSha256: sha256(native.referenceBytes), pdfSha256: native.snapshot.artifacts['reference.pdf'] },
    toolHashes, pages,
    primary: { ...primary, defects: primary.defects.map(({ evaluations, ...r }) => r) },
    pdf: { renderer: pdf.renderer, pdfRenderer: identity(pdf.pdfRenderer), camera: pdf.camera, regions: pdf.regions,
      numeric: JSON.parse(await readFile(path.join(f.folder, 'pdf-numeric.json'))), representations, viewport: pdf.viewport,
      observations: compact(pdf.observations), replays: compact(pdf.replays), derived: pdf.derived,
      defects: pdf.defects.map(d => ({ ...d, comparisons: compact(d.comparisons) })),
      visibility: pdf.visibility.map(d => ({ ...d, comparisons: compact(d.comparisons) })), controls: pdf.controls },
    qualification: { completed: q.completed, converterInvoked: q.converterInvoked, approvedImagePolicy: q.approvedImagePolicy,
      nativeSnapshotSha256: q.nativeSnapshotSha256, tools: Object.fromEntries(Object.entries(q.tools).map(([k, v]) => [k, identity(v)])),
      commands, pageHashes, wrapperControls: q.wrapperControls, equivalenceControls: q.equivalenceControls, viewport: q.viewport, qualification: q.qualification }
  };
  const bytes = Buffer.from(JSON.stringify(calibration, null, 2) + '\n');
  assert.ok(!bytes.toString().includes('C:\\Users\\') && !bytes.toString().includes('C:\\\\Users\\\\'), 'Private path in public evidence.');
  const compressed = gzipSync(bytes, { level: 9 });
  await save('calibration.json', bytes); await save('calibration.json.gz', compressed); await save('primary-source-report.json', p.bytes); await save('pdf-source-report.json', f.bytes);
  const result = { completed: true, converterInvoked: false, approvedImagePolicy: false, calibrationSha256: sha256(compressed), decodedSha256: sha256(bytes), toolHashes, artifacts };
  const rBytes = Buffer.from(JSON.stringify(result, null, 2) + '\n'); await writeArtifact(output, 'report.json', rBytes);
  await writeArtifact(base, 'latest.json', JSON.stringify({ completed: true, report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'), sha256: sha256(rBytes) }, null, 2) + '\n');
  console.log(JSON.stringify({ prepared: path.relative(root, output), calibrationSha256: sha256(compressed), decodedSha256: sha256(bytes), bytes: bytes.length, compressedBytes: compressed.length, tools: Object.keys(toolHashes).length }));
}
await main().catch(async error => { process.exitCode = 2; console.error(error.stack);
  await writeArtifact(output, 'report.json', JSON.stringify({ completed: false, converterInvoked: false, error: error.message, artifacts }, null, 2) + '\n'); });
