// Explicit preparation of independent evidence; output stays under artifacts/.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {root, sha256, outputPath, writeArtifact} from './shape-oracle-bundle.mjs';
import {loadEdgeEvidence} from './edge-evidence.mjs';
import {edgeImageCacheReports, edgeCacheAssets, validateEdgeImageCache} from './edge-image-cache.mjs';

const base = path.join(root, 'artifacts/edge-image-cache-preparation'), output = path.join(base, 'run-' + randomUUID()), artifacts = {};
const save = (p, b) => writeArtifact(output, p, b, artifacts);
async function publish(completed, details = {}) {
  const r = {schemaVersion: 1, completed, converterInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false, ...details, artifacts};
  const bytes = Buffer.from(JSON.stringify(r, null, 2) + '\n'); await writeArtifact(output, 'report.json', bytes);
  await writeArtifact(base, 'latest.json', JSON.stringify({completed, report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'), sha256: sha256(bytes)}, null, 2) + '\n');
  console.log(JSON.stringify({kind: 'edge-image-cache-preparation', completed, report: path.relative(root, path.join(output, 'report.json')).split(path.sep).join('/'), ...details}));
}
try {
  await publish(false); assert.equal(process.argv.length, 2); const native = await loadEdgeEvidence(), reports = {}, reportBytes = {}, blobs = {};
  for (const [role, pin] of Object.entries(edgeImageCacheReports)) {
    const b = await readFile(path.join(root, pin.path)); assert.equal(sha256(b), pin.sha256); reportBytes[role] = b.toString('utf8'); reports[role] = JSON.parse(b);
  }
  const assets = edgeCacheAssets(reports);
  for (const [p, h] of Object.entries(assets)) if (!blobs[h]) {
    const split = p.indexOf('/'), role = p.slice(0, split), file = p.slice(split + 1), folder = path.dirname(path.join(root, edgeImageCacheReports[role].path));
    const b = await readFile(await outputPath(folder, file)); assert.equal(sha256(b), h); blobs[h] = b.toString('base64');
  }
  const calibration = {schemaVersion: 1, comparisonKind: 'portable-independent-edge-image-evidence', completed: true, converterInvoked: false,
    approvedImagePolicy: false, imageConformanceClaim: false, overallVerdict: 'pending', snapshotSha256: native.snapshotSha256,
    sourceReports: edgeImageCacheReports, renderer: reports.primary.renderer, reports: reportBytes, assets, blobs};
  validateEdgeImageCache(calibration);
  const bytes = Buffer.from(JSON.stringify(calibration) + '\n'); assert.ok(bytes.length <= 400000000);
  assert.ok(!/(?:JoannesVermorel|ATHENA|[A-Z]:(?:\\\\|\\|\/)Users)/.test(bytes.toString('utf8')), 'Private host path in portable evidence.');
  const compressed = gzipSync(bytes, {level: 9}); assert.ok(compressed.length <= 64000000);
  await save('qualifications.json.gz', compressed);
  await publish(true, {compressedSha256: sha256(compressed), decodedSha256: sha256(bytes), compressedBytes: compressed.length, decodedBytes: bytes.length,
    assets: Object.keys(assets).length, blobs: Object.keys(blobs).length, sourceReports: edgeImageCacheReports});
} catch (error) { process.exitCode = 2; await publish(false, {error: error.message.replaceAll(root, '<repo>')}); console.error(error.stack); }
