// Lossless development archive: JSON index followed by distinct original bytes.
import assert from 'node:assert/strict';
import {sha256} from './shape-oracle-bundle.mjs';

const magic = Buffer.from('LTZAC01\n');
export const arrowCacheBounds = {decoded: 512000000, index: 16000000, assets: 30000, artifact: 30000000};
const digest = /^[a-f0-9]{64}$/;
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function arrowCachePath(p) {
  assert.ok(typeof p === 'string' && p.length <= 1024 && /^[A-Za-z0-9_./-]+$/.test(p)
    && !p.startsWith('/') && !p.split('/').some(s => ['', '.', '..'].includes(s)), 'Unsafe arrow cache path.');
  return p;
}

export function encodeArrowCache(metadata, files) {
  assert.ok(files instanceof Map && files.size > 0 && files.size <= arrowCacheBounds.assets);
  assert.ok(!Object.hasOwn(metadata, 'assets') && !Object.hasOwn(metadata, 'blobs'));
  assert.ok(metadata && typeof metadata === 'object' && !Array.isArray(metadata));
  const assets = Object.create(null), distinct = new Map();
  for (const p of [...files.keys()].sort(order)) {
    arrowCachePath(p); const b = files.get(p);
    assert.ok(Buffer.isBuffer(b) && b.length < arrowCacheBounds.artifact);
    const h = sha256(b); assets[p] = h;
    if (distinct.has(h)) assert.ok(distinct.get(h).equals(b)); else distinct.set(h, b);
  }
  const hashes = [...distinct.keys()].sort(order);
  const header = {...metadata, assets, blobs: hashes.map(h => ({sha256: h, bytes: distinct.get(h).length}))};
  const index = Buffer.from(JSON.stringify(header) + '\n');
  assert.ok(index.length <= arrowCacheBounds.index);
  const prefix = Buffer.alloc(12); magic.copy(prefix); prefix.writeUInt32LE(index.length, 8);
  const length = 12 + index.length + hashes.reduce((n, h) => n + distinct.get(h).length, 0);
  assert.ok(length <= arrowCacheBounds.decoded, 'Arrow archive exceeds its decoded bound.');
  return Buffer.concat([prefix, index, ...hashes.map(h => distinct.get(h))], length);
}

export function decodeArrowCache(bytes) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length >= 12 && bytes.length <= arrowCacheBounds.decoded);
  assert.ok(bytes.subarray(0, 8).equals(magic), 'Unknown arrow archive format.');
  const length = bytes.readUInt32LE(8);
  assert.ok(length > 0 && length <= arrowCacheBounds.index && length <= bytes.length - 12);
  const index = bytes.subarray(12, 12 + length), header = JSON.parse(index);
  assert.ok(index.equals(Buffer.from(JSON.stringify(header) + '\n')), 'Noncanonical arrow archive index.');
  assert.ok(header && !Array.isArray(header) && typeof header.assets === 'object' && header.assets !== null && !Array.isArray(header.assets));
  const paths = Object.keys(header.assets);
  assert.ok(paths.length > 0 && paths.length <= arrowCacheBounds.assets);
  assert.deepEqual(paths, [...paths].sort(order));
  for (const p of paths) { arrowCachePath(p); assert.match(header.assets[p], digest); }
  assert.ok(Array.isArray(header.blobs) && header.blobs.length <= paths.length);
  assert.deepEqual(header.blobs.map(q => q.sha256), [...new Set(Object.values(header.assets))].sort(order), 'Missing, repeated or unused cache blob.');
  const blobs = new Map(); let offset = 12 + length;
  for (const q of header.blobs) {
    assert.deepEqual(Object.keys(q), ['sha256', 'bytes']);
    assert.ok(Number.isSafeInteger(q.bytes) && q.bytes >= 0 && q.bytes < arrowCacheBounds.artifact && q.bytes <= bytes.length - offset);
    const b = bytes.subarray(offset, offset + q.bytes);
    assert.equal(sha256(b), q.sha256, 'Changed original arrow artifact.');
    blobs.set(q.sha256, b); offset += q.bytes;
  }
  assert.equal(offset, bytes.length, 'Trailing arrow archive bytes.');
  return {bytes, header, blobs, get(p) {
    arrowCachePath(p); assert.ok(Object.hasOwn(header.assets, p), 'Missing arrow cache artifact: ' + p); const h = header.assets[p];
    return blobs.get(h);
  }};
}
