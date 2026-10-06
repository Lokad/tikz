// Explicit reference revision. Normal comparison never writes these files.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { root, sha256 } from './shape-oracle-bundle.mjs';
import { createRenderer } from './compare.mjs';
import { loadDashPrimaryPolicy } from './dash-geometry-primary-policy.mjs';
import { parseDashGeometryPdf, verifyDashGeometryPdf } from './dash-geometry-pdf-vector.mjs';
import { shapePdfViews } from './shape-pdf-trial-policy.mjs';
import { dashPdfId, dashPdfScope, dashPdfProfileFile, dashPdfCalibrationFile, dashPdfCalibrationSha256,
  dashPdfGuardTools, reconstructDashPdfGeometry, validateDashPdfCalibration } from './dash-geometry-pdf-policy.mjs';

assert.equal(process.argv.length, 2);
const base = path.join(root, 'artifacts/dash-geometry-pdf-prepared'), pointer = JSON.parse(await readFile(path.join(base, 'latest.json')));
assert.equal(pointer.completed, true); assert.match(pointer.report, /^run-[\da-f-]+\/report\.json$/);
const reportFile = path.join(base, pointer.report), bytes = await readFile(reportFile); assert.equal(sha256(bytes), pointer.sha256);
const report = JSON.parse(bytes); assert.equal(report.converterInvoked, false); assert.equal(report.approvedImagePolicy, false);
const calibrationBytes = await readFile(path.join(path.dirname(reportFile), 'calibration.json'));
assert.equal(sha256(calibrationBytes), report.calibrationSha256); assert.equal(sha256(calibrationBytes), dashPdfCalibrationSha256, 'Different reviewed PDF evidence.');
const calibration = JSON.parse(calibrationBytes);
for (const [p, h] of Object.entries(calibration.toolHashes)) assert.equal(sha256(await readFile(path.join(root, p))), h);
const renderer = await createRenderer();
try {
  const primary = await loadDashPrimaryPolicy(renderer), native = primary.native;
  const pdf = await readFile(path.join(root, 'tests/Reference/DashGeometry/native/reference.pdf')), parsed = parseDashGeometryPdf(pdf);
  assert.equal(sha256(pdf), calibration.native.pdfSha256); assert.equal(native.snapshotSha256, calibration.native.snapshotSha256);
  const numeric = verifyDashGeometryPdf(parsed, native, primary.reconstruction.styles), geometry = reconstructDashPdfGeometry(native, primary.reconstruction, parsed);
  const derived = await validateDashPdfCalibration(calibration, geometry, numeric, renderer), guardToolHashes = {};
  for (const p of dashPdfGuardTools) guardToolHashes[p] = sha256(await readFile(path.join(root, p)));
  const profile = { schemaVersion: 1, id: dashPdfId, scope: dashPdfScope, approvedPdfPolicy: true,
    nativeChecks: 1090, frameChecks: 6, pdfInstructionChecks: 446, requiredViews: shapePdfViews,
    primaryPolicyId: primary.profile.id, primaryPolicySha256: primary.profileSha256,
    calibration: { file: dashPdfCalibrationFile, sha256: dashPdfCalibrationSha256 }, guardToolHashes,
    camera: geometry.camera, regions: geometry.regions, limits: derived.policies };
  const destination = path.join(root, dashPdfCalibrationFile); await mkdir(path.dirname(destination), { recursive: true });
  for (const scale of [1, 4]) {
    const p = calibration.pages[scale + 'x'], b = await readFile(path.join(path.dirname(reportFile), 'pdf-page-' + scale + 'x.png'));
    assert.equal(sha256(b), p.sha256); await writeFile(path.join(root, p.file), b);
  }
  await writeFile(destination, calibrationBytes); await writeFile(path.join(root, dashPdfProfileFile), JSON.stringify(profile, null, 2) + '\n');
  console.log('Promoted qualified ordinary-PDF/Cairo evidence; nineteen defects rejected; fixed geometry corpus only.');
} finally { await renderer.browser.close(); }
