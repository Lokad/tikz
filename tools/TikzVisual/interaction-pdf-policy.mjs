import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadInteractionPolicy } from './interaction-primary.mjs';
import { verifyPdfNativeGeometry } from './pdf-native-geometry.mjs';
import { pdfRegionVerdict } from './pdf-region-verdict.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(directory, '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const ids = ['state-paint', 'transforms', 'colors'];
const modes = ['native-css', 'sp-plus', 'sp-minus', 'original-ink-driver'];
const rendererKeys = ['profile', 'playwright', 'browser', 'browserSha256', 'profileSha256', 'os', 'architecture', 'node'];
export function requirePdfRenderer(identity, expected) {
  for (const key of rendererKeys) assert.equal(identity[key], expected[key], 'PDF renderer differs: ' + key);
}

export async function loadInteractionPdfPolicy(read = readFile) {
  const bytes = await read(path.join(directory, 'interaction-pdf-profile.json')), declared = JSON.parse(bytes);
  assert.equal(declared.schemaVersion, 1); assert.equal(declared.approvedPdfPolicy, true);
  assert.equal(declared.id, 'chromium-153-node-interactions-rgb-ink-pdf-page-v1');
  assert.equal(declared.renderMode, 'page-coordinates');
  assert.deepEqual(declared.scales, [1, 4]); assert.deepEqual(declared.backgrounds, ['white']);
  assert.deepEqual(Object.keys(declared.cases), ids);
  assert.equal(declared.primaryPolicyFile, 'interaction-profile.json');
  assert.equal(hash(await read(path.join(directory, declared.primaryPolicyFile))), declared.primaryPolicySha256);
  const primary = await loadInteractionPolicy(read);
  const snapshots = {};
  for (const [key, file] of [['calibration', 'pdf-calibration-page.json'], ['viewportProbe', 'pdf-viewport-probe.json'], ['originalCalibration', 'pdf-calibration.json']]) {
    assert.equal(declared[key + 'File'], '../../tests/Reference/NodeInteractionsRgb/' + file);
    const content = await read(path.resolve(directory, declared[key + 'File']));
    assert.equal(hash(content), declared[key + 'Sha256'], 'PDF evidence differs: ' + file);
    const value = snapshots[key] = JSON.parse(content);
    assert.equal(value.schemaVersion, 1); assert.equal(value.completed, true); assert.equal(value.converterInvoked, false);
    assert.equal(value.approvedPolicy, false); assert.equal(value.conformanceClaim, false);
    assert.deepEqual(value.expectedCases, ids); assert.deepEqual(value.cases.map(c => c.caseId), ids);
  }
  const { calibration, viewportProbe, originalCalibration } = snapshots;
  assert.equal(calibration.renderMode, declared.renderMode);
  assert.equal(calibration.baseCalibrationSha256, primary.declared.calibrationSha256);
  assert.equal(calibration.baseRegionalSha256, primary.declared.regionalSha256);
  assert.equal(viewportProbe.originalSnapshotSha256, declared.originalCalibrationSha256);
  assert.equal(viewportProbe.paddingPixels, 8);
  assert.equal(viewportProbe.boundaryDeltaPixels, 4 / 65536 * 96 / 72.27);
  assert.equal(viewportProbe.pageCoordinateControlsPassed, true);
  requirePdfRenderer(calibration.renderer, primary.regional.renderer);
  requirePdfRenderer(viewportProbe.renderer, calibration.renderer);
  for (const evidence of [calibration, viewportProbe]) for (const [file, sha256] of Object.entries(evidence.toolHashes))
    assert.equal(hash(await read(path.join(root, file))), sha256, 'PDF evidence tool changed: ' + file);
  for (const id of ids) {
    const c = calibration.cases.find(c => c.caseId === id), original = originalCalibration.cases.find(c => c.caseId === id);
    const native = primary.calibration.cases.find(c => c.caseId === id), local = primary.regional.cases.find(c => c.caseId === id);
    assert.deepEqual(declared.cases[id], { numericChecks: primary.declared.cases[id].numericChecks, regions: local.regions.length + 1 });
    assert.deepEqual(c.originalProvenance, native.originalProvenance);
    for (const [file, sha256] of Object.entries(c.originalProvenance.artifacts))
      assert.equal(hash(await read(path.join(root, 'tests/Reference/NodeInteractionsRgb', id, file))), sha256);
    for (const [file, sha256] of Object.entries(c.originalProvenance.sourceHashes))
      assert.equal(hash(await read(path.join(root, file))), sha256);
    const metrics = JSON.parse(await read(path.join(root, 'tests/Reference/NodeInteractionsRgb', id, 'metrics.json')));
    assert.deepEqual(c.pdfOriginPixels, metrics.geometry.pdfOriginPixels);
    assert.deepEqual(c.nativeAgreement, verifyPdfNativeGeometry((await read(path.join(root, 'tests/Reference/NodeInteractionsRgb', id, 'oracle.log'))).toString()));
    assert.deepEqual(c.regions.map(({ limits, ...r }) => r), original.regions.map(({ limits, ...r }) => r));
    assert.deepEqual(c.regions.map(r => r.id), ['whole-picture', ...local.regions.map(r => r.id)]);
    for (let i = 0; i < local.regions.length; i++) {
      const a = c.regions[i + 1], b = local.regions[i];
      for (const key of ['id', 'rectanglePixels', 'basis', 'actualElementId']) assert.deepEqual(a[key], b[key]);
    }
    const frame = native.variants[0].frame.expanded, origin = metrics.geometry.svgOriginBp;
    const minX = Math.floor((frame[0] - origin.x) * 4 / 3) - 8, minY = Math.floor((frame[1] - origin.y) * 4 / 3) - 8;
    assert.deepEqual(c.regions[0].rectanglePixels, { x: minX, y: minY,
      width: Math.ceil((frame[0] + frame[2] - origin.x) * 4 / 3) + 8 - minX,
      height: Math.ceil((frame[1] + frame[3] - origin.y) * 4 / 3) + 8 - minY });
    assert.deepEqual(c.variants.map(v => v.mode), modes);
    assert.deepEqual(c.variants.map(v => v.svgSha256), original.variants.map(v => v.svgSha256));
    for (const v of c.variants) {
      assert.equal(v.repeatedMeasurementsEqual, true); assert.equal(v.repeatedCaptureHashesEqual, true);
      assert.equal(v.checks.length, c.regions.length * 2);
      assert.deepEqual(v.checks.map(m => [m.id, m.scale, m.background]), [1, 4].flatMap(scale => c.regions.map(r => [r.id, scale, 'white'])));
      assert.ok(v.checks.every(m => Number.isFinite(m.maxChannelError) && m.maxChannelError >= 0 && m.maxChannelError <= 255
        && Number.isFinite(m.meanForegroundError) && m.meanForegroundError >= 0 && m.meanForegroundError <= 255
        && Number.isFinite(m.maxEdgeDisplacementPixels) && m.maxEdgeDisplacementPixels >= 0
        && [m.referenceComponents, m.actualComponents, m.changedPixels, m.foregroundPixels].every(n => Number.isSafeInteger(n) && n >= 0)
        && m.exactMatch === (m.changedPixels === 0)));
    }
    for (const region of c.regions) {
      assert.equal(region.limits.length, 2); assert.deepEqual(region.limits.map(l => l.scale), [1, 4]);
      for (const limit of region.limits) {
        const checks = c.variants.flatMap(v => v.checks).filter(m => m.id === region.id && m.scale === limit.scale);
        assert.equal(checks.length, 4);
        assert.deepEqual(limit, { scale: limit.scale, background: 'white', maxChannelError: Math.max(...checks.map(m => m.maxChannelError)),
          maxMeanForegroundError: Math.ceil(Math.max(...checks.map(m => m.meanForegroundError)) * 1e6) / 1e6,
          maxEdgeDisplacementPixels: Math.max(...checks.map(m => m.maxEdgeDisplacementPixels)),
          maxComponentDifference: Math.max(...checks.map(m => Math.abs(m.referenceComponents - m.actualComponents))) });
      }
    }
    assert.ok(c.variants.every(v => pdfRegionVerdict(v.checks, c.regions).passed));
    const probe = viewportProbe.cases.find(c => c.caseId === id);
    assert.equal(probe.sourceSha256, c.variants[0].svgSha256);
    assert.equal(hash(await read(path.join(root, 'tests/Reference/NodeInteractionsRgb', id, 'native-css.svg'))), probe.sourceSha256);
    const names = ['padded', ...['left', 'right', 'top', 'bottom'].flatMap(side => [side + '-minus', side + '-plus'])];
    assert.deepEqual(probe.controls.map(c => [c.renderMode, c.name]), ['picture-image', 'page-svg', 'page-coordinates'].flatMap(mode => names.map(name => [mode, name])));
    assert.ok(probe.controls.filter(c => c.renderMode === 'page-coordinates').every(c => c.exactMatch && c.changedRegions.length === 0));
  }
  return { declared, sha256: hash(bytes), primary, calibration, viewportProbe };
}
