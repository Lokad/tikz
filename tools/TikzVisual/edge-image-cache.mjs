// Frozen independent qualifications. No candidate, browser or native process.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {root, sha256} from './shape-oracle-bundle.mjs';
import {edgeCanonical} from './edge-log.mjs';
import {loadEdgeEvidence, edgeSnapshotSha256} from './edge-evidence.mjs';
import {edgePrimaryContract} from './edge-primary-reference.mjs';
import {deriveEdgePrimaryPolicy} from './edge-primary-policy.mjs';
import {deriveEdgePdfPolicy, edgePdfCalibratedRoutes} from './edge-pdf-policy.mjs';

export const edgeImageCacheFile = 'tests/Reference/Edges/conformance/qualifications.json.gz';
export const edgeImageCacheSha256 = '38345002d507eb509e3617475927b86e7df245c2095576b41a924203e156c7fa';
export const edgeImageCacheDecodedSha256 = '630c7b9166c947b1d266df605277fdffa924f1ceef2611a714291138887ff35f';
export const edgeImageCacheReports = {
  primary: {path: 'artifacts/edge-primary-calibration/run-153814c3-b8dc-4a54-bd6d-51e3e03bf957/report.json', sha256: 'a8a5c117e809b6e22cbd75244b777513611d10f6969ed7a198728460b944c3ae'},
  primaryCheck: {path: 'artifacts/edge-primary-checks/run-68d1ae4b-d270-469a-8583-edd7b9ee4a43/report.json', sha256: '252844a1945a6343343df12745b06301aa78717be2b644d662925eced358d8c8'},
  pdf: {path: 'artifacts/edge-pdf-calibration/run-7ecf6fa4-7b90-451b-8a6f-00fa1f4173df/report.json', sha256: '01e9c154b5f68c721f86f657886c7590ba6582c41b6f6a4b91b7d08334c3c98c'},
  pdfCheck: {path: 'artifacts/edge-pdf-checks/run-b273bacf-34ff-4c6a-9627-89702a245e4a/report.json', sha256: 'f6dc3da20d5d5840a251d20bc8c727969d3c49f481415b1dc108eecd41161686'}
};
const kinds = {primary: 'oracle-only-edge-primary-calibration', primaryCheck: 'independent-edge-primary-check', pdf: 'oracle-only-edge-pdf-calibration', pdfCheck: 'independent-edge-pdf-check'};
const ids = ['continuation', 'styles', 'coordinates', 'nodes', 'clipping'];
const digest = /^[a-f0-9]{64}$/;
export function edgeCacheRelative(p) {
  assert.ok(typeof p === 'string' && p.length <= 1024 && /^[A-Za-z0-9_./-]+$/.test(p)
    && !p.startsWith('/') && !p.split('/').some(s => ['', '.', '..'].includes(s)), 'Invalid cache path.');
}
export function edgeCacheAssets(reports) {
  const assets = {};
  for (const [role, report] of Object.entries(reports)) for (const [p, h] of Object.entries(report.artifacts)) {
    edgeCacheRelative(p); assert.match(h, digest); assets[role + '/' + p] = h;
  }
  return Object.fromEntries(Object.entries(assets).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
export function validateEdgeImageCache(c) {
  assert.deepEqual([c.schemaVersion, c.comparisonKind, c.completed, c.converterInvoked, c.approvedImagePolicy, c.imageConformanceClaim, c.overallVerdict],
    [1, 'portable-independent-edge-image-evidence', true, false, false, false, 'pending']);
  assert.equal(c.snapshotSha256, edgeSnapshotSha256); assert.deepEqual(c.sourceReports, edgeImageCacheReports);
  assert.deepEqual(Object.keys(c.reports), Object.keys(edgeImageCacheReports));
  const reports = {}, toolHashes = {};
  for (const [role, pin] of Object.entries(edgeImageCacheReports)) {
    const text = c.reports[role]; assert.equal(typeof text, 'string'); assert.ok(Buffer.byteLength(text) <= 150000000);
    assert.equal(sha256(text), pin.sha256, 'Changed independent report: ' + role);
    const r = reports[role] = JSON.parse(text); assert.equal(r.comparisonKind, kinds[role]); assert.equal(r.completed, true);
    for (const key of ['converterInvoked', 'approvedImagePolicy', 'imageConformanceClaim']) assert.equal(r[key], false);
    assert.deepEqual(r.renderer, c.renderer);
    if (role.endsWith('Check')) {
      const count = role === 'primaryCheck' ? 21 : 23;
      assert.equal(r.controls.length, count); assert.equal(new Set(r.controls.map(q => q.name)).size, count); assert.ok(r.controls.every(q => q.passed === true));
      assert.equal(r.svgsReconstructed, role === 'primaryCheck' ? 37 : 163); assert.equal(r.metricsRecomputed, role === 'primaryCheck' ? 23934 : 9958);
      if (role === 'pdfCheck') { assert.equal(r.pagesRecomputed, 150); assert.equal(r.viewportControlsReplayed, 270); assert.equal(r.inkSumsRecomputed, 59748); }
    } else {
      assert.equal(r.overallVerdict, 'pending'); assert.deepEqual(r.contract, edgePrimaryContract); assert.equal(r.snapshotSha256, edgeSnapshotSha256);
      assert.deepEqual(r.cases.map(q => q.id), ids);
      if (role === 'primary') assert.deepEqual(r.policy, deriveEdgePrimaryPolicy(r.cases));
      else for (const q of r.cases) for (const route of edgePdfCalibratedRoutes)
        assert.deepEqual(q.policies[route], deriveEdgePdfPolicy(q.measurements.filter(o => o.route === route), q.camera, q.regions, q.id + '/' + route));
    }
    for (const [p, h] of Object.entries(r.sourceHashes ?? {})) { edgeCacheRelative(p); assert.match(h, digest); assert.ok(!toolHashes[p] || toolHashes[p] === h); toolHashes[p] = h; }
    for (const [p, h] of Object.entries(r.sourceHashes ?? {})) assert.equal(r.artifacts['source-captures/' + p], h, 'Missing historical source capture: ' + p);
    for (const [p, h] of Object.entries(r.artifacts)) if (p.startsWith('source-captures/')) {
      const file = p.slice(16); edgeCacheRelative(file); assert.ok(!toolHashes[file] || toolHashes[file] === h); toolHashes[file] = h;
    }
  }
  for (const role of ['primary', 'pdf']) assert.equal(reports[role + 'Check'].inputReportSha256, edgeImageCacheReports[role].sha256);
  assert.deepEqual(c.assets, edgeCacheAssets(reports));
  assert.equal(Object.keys(c.assets).length, 10200);
  assert.deepEqual(Object.keys(c.blobs).sort(), [...new Set(Object.values(c.assets))].sort());
  let decodedBlobBytes = 0;
  for (const [h, text] of Object.entries(c.blobs)) {
    assert.match(h, digest); assert.equal(typeof text, 'string'); assert.ok(text.length <= 10000000);
    const bytes = Buffer.from(text, 'base64'); assert.equal(bytes.toString('base64'), text); assert.equal(sha256(bytes), h, 'Changed cache blob.');
    decodedBlobBytes += bytes.length; assert.ok(decodedBlobBytes <= 120000000);
  }
  return {reports, toolHashes, get: (role, p) => {
    edgeCacheRelative(p); const h = c.assets[role + '/' + p]; assert.match(h ?? '', digest); return Buffer.from(c.blobs[h], 'base64');
  }};
}
export function decodeEdgeImageCache(compressed) {
  assert.ok(Buffer.isBuffer(compressed) && compressed.length <= 64000000);
  assert.equal(sha256(compressed), edgeImageCacheSha256, 'Unreviewed edge image cache.');
  const bytes = gunzipSync(compressed, {maxOutputLength: 400000000}); assert.equal(sha256(bytes), edgeImageCacheDecodedSha256);
  return {compressed, bytes, calibration: JSON.parse(bytes)};
}
export async function loadEdgeImageCache(read = readFile) {
  const e = decodeEdgeImageCache(await read(path.join(root, edgeImageCacheFile))), verified = validateEdgeImageCache(e.calibration);
  // Captured sources belong to the immutable reports, not the current tools.
  // Current admission consumers have their own reviewed source guards.
  const native = await loadEdgeEvidence(p => read(path.join(root, p))); assert.equal(native.snapshotSha256, e.calibration.snapshotSha256);
  return {...e, ...verified, native};
}
