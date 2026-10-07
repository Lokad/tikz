// Versioned logical-file wrapper over the unchanged lossless native codec.
import assert from 'node:assert/strict';
import {sha256} from './shape-oracle-bundle.mjs';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {arrowCachePath, encodeArrowCache, decodeArrowCache} from './arrow-image-cache-codec.mjs';

export const arrowMeetCacheBounds = {compressed: 96000000, files: 14500, logicalFile: 64000000, logicalTotal: 1024000000, chunk: 16 * 1024 * 1024};
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const digest = /^[a-f0-9]{64}$/;

export function encodeArrowMeetArchive(metadata, files) {
  assert.ok(files instanceof Map && files.size > 0 && files.size <= arrowMeetCacheBounds.files);
  for (const key of ['assets', 'blobs', 'chunkBytes', 'logicalAssets', 'logicalBlobs']) assert.ok(!Object.hasOwn(metadata, key));
  const logicalAssets = Object.create(null), originals = new Map(); let total = 0;
  for (const name of [...files.keys()].sort(order)) {
    arrowCachePath(name); const bytes = files.get(name);
    assert.ok(Buffer.isBuffer(bytes) && bytes.length <= arrowMeetCacheBounds.logicalFile);
    total += bytes.length; assert.ok(total <= arrowMeetCacheBounds.logicalTotal);
    const hash = sha256(bytes); logicalAssets[name] = hash;
    if (originals.has(hash)) assert.ok(originals.get(hash).equals(bytes)); else originals.set(hash, bytes);
  }
  const logicalBlobs = Object.create(null), physical = new Map();
  for (const [hash, bytes] of [...originals].sort(([a], [b]) => order(a, b))) {
    const parts = [];
    for (let i = 0; i < Math.max(1, Math.ceil(bytes.length / arrowMeetCacheBounds.chunk)); i++) {
      const name = 'chunks/' + hash + '/' + String(i).padStart(4, '0'); parts.push(name);
      physical.set(name, bytes.subarray(i * arrowMeetCacheBounds.chunk, Math.min(bytes.length, (i + 1) * arrowMeetCacheBounds.chunk)));
    }
    logicalBlobs[hash] = {bytes: bytes.length, parts};
  }
  return encodeArrowCache({...metadata, chunkBytes: arrowMeetCacheBounds.chunk, logicalAssets, logicalBlobs}, physical);
}

export function decodeArrowMeetArchive(bytes) {
  const cache = decodeArrowCache(bytes), h = cache.header;
  assert.equal(h.chunkBytes, arrowMeetCacheBounds.chunk);
  assert.ok(h.logicalAssets && typeof h.logicalAssets === 'object' && !Array.isArray(h.logicalAssets));
  assert.ok(h.logicalBlobs && typeof h.logicalBlobs === 'object' && !Array.isArray(h.logicalBlobs));
  const names = Object.keys(h.logicalAssets); assert.ok(names.length > 0 && names.length <= arrowMeetCacheBounds.files);
  assertNativeEqual(names, [...names].sort(order));
  for (const name of names) {arrowCachePath(name); assert.match(h.logicalAssets[name], digest);}
  const hashes = [...new Set(Object.values(h.logicalAssets))].sort(order);
  assertNativeEqual(Object.keys(h.logicalBlobs), hashes, 'Missing or unused logical blob.');
  const logical = new Map(), parts = new Set();
  for (const hash of hashes) {
    const descriptor = h.logicalBlobs[hash]; assert.ok(descriptor && typeof descriptor === 'object');
    assertNativeEqual(Object.keys(descriptor), ['bytes', 'parts']);
    assert.ok(Number.isSafeInteger(descriptor.bytes) && descriptor.bytes >= 0 && descriptor.bytes <= arrowMeetCacheBounds.logicalFile);
    assert.ok(Array.isArray(descriptor.parts)); assert.equal(descriptor.parts.length, Math.max(1, Math.ceil(descriptor.bytes / arrowMeetCacheBounds.chunk)));
    const chunks = descriptor.parts.map((name, i) => {
      assert.equal(name, 'chunks/' + hash + '/' + String(i).padStart(4, '0')); parts.add(name);
      const chunk = cache.get(name);
      assert.equal(chunk.length, Math.min(arrowMeetCacheBounds.chunk, Math.max(0, descriptor.bytes - i * arrowMeetCacheBounds.chunk)));
      return chunk;
    });
    const original = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, descriptor.bytes);
    assert.equal(sha256(original), hash, 'Changed reconstructed logical artifact.'); logical.set(hash, original);
  }
  assertNativeEqual(Object.keys(h.assets), [...parts].sort(order), 'Unused physical chunk.');
  const files = new Map(); let logicalBytes = 0;
  for (const name of names) {const original = logical.get(h.logicalAssets[name]); logicalBytes += original.length; assert.ok(logicalBytes <= arrowMeetCacheBounds.logicalTotal); files.set(name, original);}
  return {...cache, files, logicalBytes, logical, get(name) {arrowCachePath(name); assert.ok(files.has(name), 'Missing logical cache artifact: ' + name); return files.get(name);}};
}
