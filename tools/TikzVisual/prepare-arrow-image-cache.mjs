// Explicit preparation stays ignored; no converter, browser or native process.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {root, sha256, outputPath, writeArtifact} from './shape-oracle-bundle.mjs';
import {loadArrowSourcePdfOwned} from './arrow-source-pdf-contract.mjs';
import {encodeArrowCache, decodeArrowCache} from './arrow-image-cache-codec.mjs';
import {arrowImageCacheReports, arrowImageCacheMetadata, validateArrowImageCache, arrowImageCacheCompressedBound, loadArrowImageCache} from './arrow-image-cache.mjs';

const output = await outputPath(path.join(root, 'artifacts/arrow-image-cache-preparation/run-' + randomUUID()));
let phase = 'arguments';
async function publish(completed, details) {
  const bytes = Buffer.from(JSON.stringify({schemaVersion: 1, completed, phase, converterInvoked: false, approvedImagePolicy: false,
    imageConformanceClaim: false, ...details}, null, 2) + '\n');
  await writeArtifact(output, 'report.json', bytes);
  console.log(JSON.stringify({completed, phase, report: path.relative(root, path.join(output, 'report.json')).split(path.sep).join('/'), sha256: sha256(bytes), ...details}));
}
try {
  const args = process.argv.slice(2); assert.ok(args.length === 0 || args.length === 1 && args[0] === '--replay');
  phase = 'checked-input'; let reports, files;
  if (args.length) {
    const e = await loadArrowImageCache(); reports = e.header.reports;
    files = new Map(Object.keys(e.header.assets).map(p => [p, e.get(p)]));
  } else {
    const owned = await loadArrowSourcePdfOwned(arrowImageCacheReports.pdf.path); reports = {};
    assert.equal(owned.sha256, arrowImageCacheReports.pdf.sha256);
    for (const [role, pin] of Object.entries(arrowImageCacheReports)) {
      const b = await readFile(path.join(root, pin.path)); assert.equal(sha256(b), pin.sha256); reports[role] = b.toString('utf8');
    }
    files = new Map(owned.files); files.set('manifest.json', await readFile(path.join(owned.folder, 'manifest.json')));
  }
  phase = 'encode'; const bytes = encodeArrowCache(arrowImageCacheMetadata(reports), files), cache = decodeArrowCache(bytes);
  validateArrowImageCache(cache);
  phase = 'compress'; const compressed = gzipSync(bytes, {level: 9});
  assert.ok(compressed.length <= arrowImageCacheCompressedBound, 'Arrow cache exceeds the compressed bound.');
  await writeArtifact(output, 'native-source.bin.gz', compressed);
  phase = 'complete'; await publish(true, {compressedSha256: sha256(compressed), decodedSha256: sha256(bytes),
    compressedBytes: compressed.length, decodedBytes: bytes.length, assets: files.size, blobs: cache.blobs.size,
    blobBytes: [...cache.blobs.values()].reduce((n, b) => n + b.length, 0), sourceReports: arrowImageCacheReports,
    cache: path.relative(root, path.join(output, 'native-source.bin.gz')).split(path.sep).join('/')});
} catch (error) { process.exitCode = 2; await publish(false, {error: error.message.replaceAll(root, '<repo>')}); console.error(error.stack); }
