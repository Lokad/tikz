// Frozen independent qualifications. No candidate, browser or native process.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {root, sha256} from './shape-oracle-bundle.mjs';
import {edgeCanonical} from './curved-edge-log.mjs';
import {loadEdgeEvidence, edgeSnapshotSha256} from './curved-edge-evidence.mjs';
import {edgePrimaryContract} from './curved-edge-primary-reference.mjs';
import {deriveEdgePrimaryPolicy} from './curved-edge-primary-policy.mjs';
import {deriveEdgePdfPolicy, edgePdfCalibratedRoutes} from './curved-edge-pdf-policy.mjs';

export const edgeImageCacheFile = 'tests/Reference/CurvedEdges/conformance/qualifications.json.gz';
export const edgeImageCacheSha256 = 'a95de58283f0a5b91dc2a7d6232b3667954c4cd4997590beaeec5ff0e5c4c2c1';
export const edgeImageCacheDecodedSha256 = '62b2369e974131d025276f96ef1fe984445d0c88ce0ed434496dce8bae439f9e';
export const edgeImageCacheReports = {
  "primary": {
    "path": "artifacts/curved-edge-primary-calibration/run-5d9fac34-1b5a-4cbb-93e3-7b4a67bedc77/report.json",
    "sha256": "9c566e112cc20d8b7258d36a0c46875a055fe702dd4847a4f2c0cbcee96ddc80"
  },
  "primaryCheck": {
    "path": "artifacts/curved-edge-primary-checks/run-305c9f72-3135-4e6e-94b2-48a668b3fd91/report.json",
    "sha256": "da089f5a54b4d54e8158007bcc5f60e9559c17b51085b8824f5047c7026947f1"
  },
  "pdf": {
    "path": "artifacts/curved-edge-pdf-calibration/run-7bb1fe61-a02e-4ee7-b685-a116e30735a5/report.json",
    "sha256": "6b19efacea0e0e561fd71e4486848b32fc7d435eefead972424db27db2011aee"
  },
  "pdfCheck": {
    "path": "artifacts/curved-edge-pdf-checks/run-78d12a7a-81e4-40b4-9ca1-9926edf56f4e/report.json",
    "sha256": "16c025824216c97bc514cb8ef225bb6cc37d6b020e2a9c6fca8283c3f5437ef7"
  }
};
const kinds = {primary: 'oracle-only-curved-edge-primary-calibration', primaryCheck: 'independent-curved-edge-primary-check', pdf: 'oracle-only-curved-edge-pdf-calibration', pdfCheck: 'independent-curved-edge-pdf-check'};
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
    [1, 'portable-independent-curved-edge-image-evidence', true, false, false, false, 'pending']);
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
      const count = role === 'primaryCheck' ? 23 : 28;
      assert.equal(r.controls.length, count); assert.equal(new Set(r.controls.map(q => q.name)).size, count); assert.ok(r.controls.every(q => q.passed === true));
      assert.equal(r.svgsReconstructed, role === 'primaryCheck' ? 42 : 124); assert.equal(r.metricsRecomputed, role === 'primaryCheck' ? 31686 : 13714);
      if (role === 'pdfCheck') { assert.equal(r.pagesRecomputed, 174); assert.equal(r.viewportControlsReplayed, 180); assert.equal(r.inkSumsRecomputed, 82284); assert.equal(r.presentationImagesChecked, 2610); }
    } else {
      assert.equal(r.overallVerdict, 'pending'); assert.deepEqual(r.contract, edgePrimaryContract); assert.equal(r.snapshotSha256, edgeSnapshotSha256);
      assert.deepEqual(r.cases.map(q => q.id), ids);
      if (role === 'primary') assert.deepEqual(r.policy, deriveEdgePrimaryPolicy(r.cases));
      else for (const q of r.cases) for (const route of edgePdfCalibratedRoutes)
        assert.deepEqual(q.policies[route], deriveEdgePdfPolicy(q.measurements.filter(o => o.route === route), q.camera, q.regions, q.id + '/' + route));
    }
    for (const [p, h] of Object.entries(r.sourceHashes ?? {})) { edgeCacheRelative(p); assert.match(h, digest); assert.ok(!toolHashes[p] || toolHashes[p] === h); toolHashes[p] = h; }
    for (const [p, h] of Object.entries(r.artifacts)) if (p.startsWith('source-captures/')) {
      const file = p.slice(16); edgeCacheRelative(file); assert.ok(!toolHashes[file] || toolHashes[file] === h); toolHashes[file] = h;
    }
  }
  for (const role of ['primary', 'pdf']) assert.equal(reports[role + 'Check'].inputReportSha256, edgeImageCacheReports[role].sha256);
  assert.deepEqual(c.assets, edgeCacheAssets(reports));
  assert.equal(Object.keys(c.assets).length, 11507);
  assert.deepEqual(Object.keys(c.blobs).sort(), [...new Set(Object.values(c.assets))].sort());
  assert.equal(Object.keys(c.blobs).length, 4708);
  let decodedBlobBytes = 0;
  for (const [h, text] of Object.entries(c.blobs)) {
    assert.match(h, digest); assert.equal(typeof text, 'string'); assert.ok(text.length <= 10000000);
    const bytes = Buffer.from(text, 'base64'); assert.equal(bytes.toString('base64'), text); assert.equal(sha256(bytes), h, 'Changed cache blob.');
    decodedBlobBytes += bytes.length; assert.ok(decodedBlobBytes <= 160000000);
  }
  assert.equal(decodedBlobBytes, 156271405);
  return {reports, toolHashes, get: (role, p) => {
    edgeCacheRelative(p); const h = c.assets[role + '/' + p]; assert.match(h ?? '', digest); return Buffer.from(c.blobs[h], 'base64');
  }};
}
export function decodeEdgeImageCache(compressed) {
  assert.ok(Buffer.isBuffer(compressed) && compressed.length <= 96000000);
  assert.equal(sha256(compressed), edgeImageCacheSha256, 'Unreviewed edge image cache.');
  const bytes = gunzipSync(compressed, {maxOutputLength: 400000000}); assert.equal(sha256(bytes), edgeImageCacheDecodedSha256);
  return {compressed, bytes, calibration: JSON.parse(bytes)};
}
export async function loadEdgeImageCache(read = readFile) {
  const e = decodeEdgeImageCache(await read(path.join(root, edgeImageCacheFile))), verified = validateEdgeImageCache(e.calibration);
  for (const [p, h] of Object.entries(verified.toolHashes)) assert.equal(sha256(edgeCanonical(await read(path.join(root, p)))), h, 'Changed qualification source: ' + p);
  const native = await loadEdgeEvidence(); assert.equal(native.snapshotSha256, e.calibration.snapshotSha256);
  return {...e, ...verified, native};
}
