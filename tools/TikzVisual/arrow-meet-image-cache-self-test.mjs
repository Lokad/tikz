// Exercise the actual chunk codec, fixed proof bindings and browser-free loader.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root, sha256, writeArtifact} from './shape-oracle-bundle.mjs';
import {arrowMeetCacheBounds, encodeArrowMeetArchive, decodeArrowMeetArchive} from './arrow-meet-image-cache-codec.mjs';
import {arrowMeetImageCacheFile, arrowMeetImageCacheSha256, arrowMeetImageCacheDecodedSha256, decodeArrowMeetImageCache,
  validateArrowMeetImageArchive, loadArrowMeetImageCache} from './arrow-meet-image-cache.mjs';

assert.equal(process.argv.length, 2);
const output = path.join(root, 'artifacts/arrow-meet-image-cache-controls/run-' + randomUUID()), controls = [];
let phase = 'chunk-codec';
const pass = name => controls.push({name, passed: true});
const reject = (name, action) => {let message; assert.throws(action, error => {assert.ok(error instanceof assert.AssertionError); message = error.message.slice(0, 500); return true;}); controls.push({name, passed: true, rejection: message});};
async function publish(completed, details) {
  const bytes = Buffer.from(JSON.stringify({schemaVersion: 1, completed, phase, comparisonKind: 'native-arrow-meet-cache-controls',
    converterInvoked: false, nativeToolInvoked: false, browserInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false,
    imageAdmission: 'pending', controls, ...details}, null, 2) + '\n'); await writeArtifact(output, 'report.json', bytes);
  console.log(JSON.stringify({completed, phase, controls: controls.length, report: path.relative(root, path.join(output, 'report.json')).split(path.sep).join('/'), sha256: sha256(bytes)}));
}
try {
  const large = Buffer.alloc(arrowMeetCacheBounds.chunk + 7, 65);
  const files = new Map([['large/policy', large], ['alias', large], ['empty', Buffer.alloc(0)], ['__proto__', Buffer.from('named-file')], ['constructor', Buffer.from('other-name')]]);
  const encoded = encodeArrowMeetArchive({marker: 'synthetic'}, files), small = decodeArrowMeetArchive(encoded);
  assert.equal(small.logical.size, 4); assert.equal(small.files.size, 5);
  assert.equal(small.header.logicalBlobs[sha256(large)].parts.length, 2);
  for (const [name, bytes] of files) assert.ok(small.get(name).equals(bytes));
  pass('exact chunk-boundary bytes, deduplication, empty file and prototype-like paths');
  const body = encoded.subarray(12 + encoded.readUInt32LE(8));
  const wire = h => {const json = Buffer.from(JSON.stringify(h) + '\n'), prefix = Buffer.from(encoded.subarray(0, 12)); prefix.writeUInt32LE(json.length, 8); return Buffer.concat([prefix, json, body]);};
  const corrupt = (name, change) => {const h = structuredClone(small.header); change(h); const changed = wire(h); reject(name, () => decodeArrowMeetArchive(changed));};
  const big = sha256(large);
  corrupt('lost logical chunk', h => h.logicalBlobs[big].parts.pop());
  corrupt('reordered logical chunks', h => h.logicalBlobs[big].parts.reverse());
  corrupt('changed logical length', h => h.logicalBlobs[big].bytes--);
  corrupt('oversized logical file', h => h.logicalBlobs[big].bytes = arrowMeetCacheBounds.logicalFile + 1);
  corrupt('unused logical blob', h => h.logicalAssets = {...h.logicalAssets, alias: '0'.repeat(64)});
  corrupt('unsafe logical path', h => {h.logicalAssets['../escape'] = h.logicalAssets.alias; delete h.logicalAssets.alias; h.logicalAssets = Object.fromEntries(Object.entries(h.logicalAssets).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));});
  corrupt('changed chunk contract', h => h.chunkBytes++);
  reject('reserved wrapper metadata', () => encodeArrowMeetArchive({logicalAssets: {}}, files));
  reject('missing logical lookup', () => small.get('missing'));
  const {chunkBytes, logicalAssets, logicalBlobs, assets, blobs, ...smallMetadata} = small.header;
  const substituted = new Map(files), flipped = Buffer.from(large); flipped[0] ^= 1; substituted.set('large/policy', flipped); substituted.set('alias', flipped);
  const replacement = decodeArrowMeetArchive(encodeArrowMeetArchive(smallMetadata, substituted));
  assert.ok(replacement.get('alias').equals(flipped)); pass('internally consistent replacement decoded before fixed-profile validation');

  phase = 'fixed-combined-evidence'; const e = await loadArrowMeetImageCache();
  assert.equal(e.files.size, 12325); assert.equal(e.primaryRecords.length, 306); assert.equal(e.pdfRecords.length, 396);
  pass('pinned archive, seven completed reports, source guards and both rederived models');
  const {chunkBytes: c, logicalAssets: la, logicalBlobs: lb, assets: aa, blobs: bb, ...metadata} = e.header;
  const alter = (name, change) => {const m = structuredClone(metadata); change(m); reject(name, () => validateArrowMeetImageArchive({...e, header: {...e.header, ...m}}));};
  for (const [key, value] of Object.entries({schemaVersion: 2, completed: false, converterInvoked: true, nativeToolInvoked: true,
    approvedImagePolicy: true, imageConformanceClaim: true, imageAdmission: 'passed'})) alter('identity/' + key, m => m[key] = value);
  alter('changed qualification commit', m => m.qualification.commit = '0'.repeat(40));
  alter('changed qualification tree', m => m.qualification.tree = '0'.repeat(40));
  alter('changed original base cache', m => m.baseCache.sha256 = '0'.repeat(64));
  alter('missing public pending gate', m => m.pendingGates.pop());
  for (const role of Object.keys(metadata.reports)) alter('changed report pin/' + role, m => m.reports[role].sha256 = '0'.repeat(64));
  const forge = (name, change) => {
    // Mutation/encoding errors are broken fixtures, not successful rejections.
    const original = new Map(e.files); change(original);
    const forged = decodeArrowMeetArchive(encodeArrowMeetArchive(metadata, original));
    reject(name, () => validateArrowMeetImageArchive(forged));
  };
  phase = 'rehashed-substitutions';
  forge('missing independently checked source gate', m => m.delete('proofs/root-reader.json'));
  forge('missing fresh export proof', m => m.delete('proofs/fresh-export.json'));
  forge('missing postcommit proof', m => m.delete('proofs/postcommit.json'));
  const sample = e.primaryRecords.find(r => r.view.kind === 'defect' && r.delta?.rawChangedPixels > 0); assert.ok(sample);
  const actual = 'upstream/primary/' + sample.files.images.actual, reference = 'upstream/primary/' + sample.files.images.reference;
  assert.ok(!e.get(actual).equals(e.get(reference)));
  forge('source PNG substitution with recalculated logical and physical hashes', m => m.set(actual, m.get(reference)));
  forge('fully rehashed weakened policy, manifest and producer report', m => {
    const policy = JSON.parse(m.get('policies.json')); assert.ok(policy.policies.length > 1); policy.policies.pop();
    m.set('policies.json', Buffer.from(JSON.stringify(policy) + '\n'));
    const manifest = JSON.parse(m.get('manifest.json')); manifest.artifacts['policies.json'] = sha256(m.get('policies.json'));
    const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n'); m.set('manifest.json', manifestBytes);
    const report = JSON.parse(m.get('report.json')); report.manifest.sha256 = sha256(manifestBytes); m.set('report.json', Buffer.from(JSON.stringify(report, null, 2) + '\n'));
  });
  const changedCompressed = Buffer.from(e.compressed); changedCompressed[changedCompressed.length - 1] ^= 1;
  reject('changed compressed archive through pinned decoder', () => decodeArrowMeetImageCache(changedCompressed));
  reject('empty compressed archive', () => decodeArrowMeetImageCache(Buffer.alloc(0)));
  phase = 'complete'; await publish(true, {cacheSha256: arrowMeetImageCacheSha256, decodedSha256: arrowMeetImageCacheDecodedSha256,
    logicalArtifacts: e.files.size, logicalBytes: e.logicalBytes, sourceGuards: Object.keys(e.sourceHashes).length,
    primaryViews: e.primaryRecords.length, pdfViews: e.pdfRecords.length, reports: Object.keys(e.reports),
    pngs: [...e.files.keys()].filter(p => p.endsWith('.png')).length, cache: arrowMeetImageCacheFile});
} catch (error) {process.exitCode = 2; await publish(false, {error: error.message.slice(0, 1000).replaceAll(root, '<repo>')}); console.error(error.stack);}
