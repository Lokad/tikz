// Explicit reference promotion; comparison has no baseline-write mode.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { root, sha256 } from './shape-oracle-bundle.mjs';
import { createRenderer } from './compare.mjs';
import { reconstructDashGeometryPrimary } from './dash-geometry-primary-reconstruction.mjs';
import { readDashGeometryNative, dashPrimaryScope } from './dash-geometry-primary-common.mjs';
import { shapeViews } from './shape-primary-trial-policy.mjs';
import { dashPrimaryPolicyId, dashPrimaryProfileFile, dashPrimaryCalibrationFile, dashPrimaryCalibrationSha256, dashPrimaryNativeSha256,
  dashPrimaryGuardTools, validateDashPrimaryCalibration, requireDashPrimaryRenderer } from './dash-geometry-primary-policy.mjs';

assert.equal(process.argv.length, 2);
const base = path.join(root, 'artifacts/dash-geometry-primary-calibration');
const pointer = JSON.parse(await readFile(path.join(base, 'latest.json')));
assert.equal(pointer.completed, true); assert.equal(pointer.converterInvoked, false);
const reportFile = path.resolve(base, pointer.report); assert.ok(reportFile.startsWith(base + path.sep));
const reportBytes = await readFile(reportFile), report = JSON.parse(reportBytes);
assert.equal(sha256(reportBytes), pointer.sha256); assert.equal(report.verdict, 'oracle-calibration-pass');
const calibrationBytes = await readFile(path.join(path.dirname(reportFile), 'calibration.json')), calibration = JSON.parse(calibrationBytes);
assert.equal(sha256(calibrationBytes), report.calibrationSha256); assert.equal(sha256(calibrationBytes), dashPrimaryCalibrationSha256);
const native = await readDashGeometryNative(); assert.equal(native.snapshotSha256, dashPrimaryNativeSha256);
for (const [p, h] of Object.entries(calibration.toolHashes)) assert.equal(sha256(await readFile(path.join(root, p))), h);
const renderer = await createRenderer();
try {
  requireDashPrimaryRenderer(renderer.identity, calibration.renderer);
  const reconstruction = await reconstructDashGeometryPrimary(renderer, native), limits = await validateDashPrimaryCalibration(calibration, reconstruction, renderer);
  const guardToolHashes = {};
  for (const p of dashPrimaryGuardTools) guardToolHashes[p] = sha256(await readFile(path.join(root, p)));
  const profile = { schemaVersion: 1, id: dashPrimaryPolicyId, scope: dashPrimaryScope, approvedPrimaryPolicy: true, approvedPdfPolicy: false,
    overallVerdict: 'pending', nativeChecks: 1090, frameChecks: 6, requiredViews: shapeViews, calibration: { file: dashPrimaryCalibrationFile, sha256: sha256(calibrationBytes) },
    guardToolHashes, camera: reconstruction.camera, regions: reconstruction.regions, limits };
  const destination = path.join(root, dashPrimaryCalibrationFile); await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, calibrationBytes);
  await writeFile(path.join(root, dashPrimaryProfileFile), JSON.stringify(profile, null, 2) + '\n');
  console.log('Promoted independently reviewed primary evidence; nineteen visible defects rejected; ordinary PDF remains pending.');
} finally { await renderer.browser.close(); }
