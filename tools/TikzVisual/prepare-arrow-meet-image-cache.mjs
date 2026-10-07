// Explicit preparation owns fresh output; it never updates checked-in pins.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {root, sha256, outputPath, writeArtifact} from './shape-oracle-bundle.mjs';
import {loadArrowImageCache} from './arrow-image-cache.mjs';
import {loadArrowMeetPdfOwned} from './arrow-meet-pdf-contract.mjs';
import {arrowMeetCacheBounds, encodeArrowMeetArchive, decodeArrowMeetArchive} from './arrow-meet-image-cache-codec.mjs';
import {arrowMeetImageCacheMetadata, validateArrowMeetImageArchive, loadArrowMeetImageCache} from './arrow-meet-image-cache.mjs';
import {arrowMeetImageCacheReports, arrowMeetFreshCheckout} from './arrow-meet-image-cache-pin.mjs';

const output = await outputPath(path.join(root, 'artifacts/arrow-meet-image-cache-preparation/run-' + randomUUID()));
let phase = 'arguments';
async function publish(completed, details) {
  const bytes = Buffer.from(JSON.stringify({schemaVersion: 1, comparisonKind: 'native-arrow-meet-cache-preparation', completed, phase,
    converterInvoked: false, nativeToolInvoked: false, browserInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false,
    imageAdmission: 'pending', ...details}, null, 2) + '\n');
  await writeArtifact(output, 'report.json', bytes);
  console.log(JSON.stringify({completed, phase, report: path.relative(root, path.join(output, 'report.json')).split(path.sep).join('/'), sha256: sha256(bytes)}));
}
try {
  const args = process.argv.slice(2); assert.ok(args.length === 0 || args.length === 1 && args[0] === '--replay');
  phase = 'qualified-inputs'; let files;
  if (args.length) files = (await loadArrowMeetImageCache()).files;
  else {
    const base = await loadArrowImageCache(), owned = await loadArrowMeetPdfOwned(arrowMeetImageCacheReports.pdf.origin, base);
    assert.equal(owned.sha256, arrowMeetImageCacheReports.pdf.sha256);
    files = new Map(owned.files); files.set('report.json', owned.bytes);
    files.set('manifest.json', await readFile(path.join(owned.folder, 'manifest.json')));
    for (const [role, pin] of Object.entries(arrowMeetImageCacheReports)) {
      if (files.has(pin.file)) {assert.equal(sha256(files.get(pin.file)), pin.sha256); continue;}
      const source = path.join(root, role === 'freshPdfCheck' ? arrowMeetFreshCheckout : '', pin.origin);
      const bytes = await readFile(source); assert.ok(bytes.length < 100000); assert.equal(sha256(bytes), pin.sha256); files.set(pin.file, bytes);
    }
  }
  phase = 'encode'; const bytes = encodeArrowMeetArchive(arrowMeetImageCacheMetadata(), files), cache = decodeArrowMeetArchive(bytes);
  validateArrowMeetImageArchive(cache);
  for (const [name, original] of files) assert.ok(cache.get(name).equals(original), name);
  phase = 'compress'; const compressed = gzipSync(bytes, {level: 9}); assert.ok(compressed.length <= arrowMeetCacheBounds.compressed);
  await writeArtifact(output, 'native-meet.bin.gz', compressed);
  phase = 'complete'; await publish(true, {compressedSha256: sha256(compressed), decodedSha256: sha256(bytes), compressedBytes: compressed.length,
    decodedBytes: bytes.length, logicalArtifacts: files.size, logicalBytes: cache.logicalBytes, distinctLogicalBlobs: cache.logical.size,
    physicalChunks: Object.keys(cache.header.assets).length, distinctPhysicalBlobs: cache.blobs.size, pngs: [...files.keys()].filter(p => p.endsWith('.png')).length,
    reports: arrowMeetImageCacheReports, cache: path.relative(root, path.join(output, 'native-meet.bin.gz')).split(path.sep).join('/')});
} catch (error) {process.exitCode = 2; await publish(false, {error: error.message.slice(0, 1000).replaceAll(root, '<repo>')}); console.error(error.stack);}
