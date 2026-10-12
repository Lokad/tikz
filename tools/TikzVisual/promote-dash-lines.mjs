// Explicit reference revision. Ordinary comparisons never write baselines.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { root, sha256, outputPath } from './shape-oracle-bundle.mjs';
import { createRenderer } from './compare.mjs';
import { readDashLinesNative, reconstructDashLines } from './dash-lines-oracle.mjs';
import { shapeViews } from './shape-primary-trial-policy.mjs';
import { shapePdfViews } from './shape-pdf-trial-policy.mjs';
import { dashLinesPolicyId, dashLinesScope, dashLinesProfileFile, dashLinesCalibrationFile,
  dashLinesCalibrationSha256, dashLinesDecodedSha256, dashLinesGuardFiles, validateDashLinesCalibration } from './dash-lines-policy.mjs';

assert.equal(process.argv.length, 2);
const base = path.join(root, 'artifacts/dash-lines-prepared'), pointer = JSON.parse(await readFile(path.join(base, 'latest.json')));
assert.equal(pointer.completed, true); assert.match(pointer.report, /^run-[\da-f-]+\/report\.json$/);
const filename = await outputPath(base, pointer.report), reportBytes = await readFile(filename); assert.equal(sha256(reportBytes), pointer.sha256);
const report = JSON.parse(reportBytes); assert.equal(report.completed, true); assert.equal(report.converterInvoked, false); assert.equal(report.approvedImagePolicy, false);
const compressed = await readFile(path.join(path.dirname(filename), 'calibration.json.gz'));
assert.equal(sha256(compressed), report.calibrationSha256); assert.equal(sha256(compressed), dashLinesCalibrationSha256, 'Different reviewed evidence.');
const decoded = gunzipSync(compressed, { maxOutputLength: 64000000 }); assert.equal(sha256(decoded), dashLinesDecodedSha256);
const calibration = JSON.parse(decoded);
for (const [p, h] of Object.entries(calibration.toolHashes)) assert.equal(sha256(await readFile(path.join(root, p))), h);
const renderer = await createRenderer();
try {
  const native = await readDashLinesNative(), reconstruction = await reconstructDashLines(renderer, native);
  const validated = await validateDashLinesCalibration(calibration, native, reconstruction, renderer), guardToolHashes = {};
  for (const p of dashLinesGuardFiles(calibration)) guardToolHashes[p] = sha256(await readFile(path.join(root, p)));
  const profile = { schemaVersion: 1, id: dashLinesPolicyId, scope: dashLinesScope, approvedImagePolicy: true,
    counts: { native: 927, frame: 6, primary: 492, pdfPerRoute: 176, pdfInstructions: 444 }, requiredViews: { primary: shapeViews, pdf: shapePdfViews },
    calibration: { file: dashLinesCalibrationFile, sha256: dashLinesCalibrationSha256, decodedSha256: dashLinesDecodedSha256 }, guardToolHashes,
    camera: { primary: reconstruction.camera, pdf: validated.registered.camera }, regions: { primary: reconstruction.regions, pdf: validated.registered.regions },
    limits: { primary: validated.primary, pdf: validated.pdf } };
  const pages = [];
  for (const scale of [1, 4]) {
    const p = calibration.pages[scale + 'x']; assert.equal(p.file, 'tests/Reference/Dashes/conformance/pdf-page-' + scale + 'x.png');
    const bytes = await readFile(path.join(path.dirname(filename), 'pdf-page-' + scale + 'x.png')); assert.equal(sha256(bytes), p.sha256);
    assert.equal(p.sha256, calibration.qualification.pageHashes['pdftocairo/original-' + scale + 'x.png']);
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a'); assert.equal(bytes.subarray(12, 16).toString(), 'IHDR');
    const size = validated.registered.camera.rasterSizes[scale + 'x']; assert.equal(bytes.readUInt32BE(16), size.width); assert.equal(bytes.readUInt32BE(20), size.height);
    pages.push({ file: path.join(root, p.file), bytes });
  }
  const destination = path.join(root, dashLinesCalibrationFile); await mkdir(path.dirname(destination), { recursive: true });
  for (const p of pages) await writeFile(p.file, p.bytes);
  await writeFile(destination, compressed); await writeFile(path.join(root, dashLinesProfileFile), JSON.stringify(profile, null, 2) + '\n');
  console.log('Promoted independent forty-line primary/Cairo evidence; twenty-one targeted defects per route; fixed corpus only.');
} finally { await renderer.browser.close(); }
