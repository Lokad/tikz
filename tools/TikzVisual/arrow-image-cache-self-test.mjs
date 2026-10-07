// Exercise the production cache codec/loader, including rehashed forgeries.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root, sha256, writeArtifact} from './shape-oracle-bundle.mjs';
import {encodeArrowCache, decodeArrowCache, arrowCachePath, arrowCacheBounds} from './arrow-image-cache-codec.mjs';
import {loadArrowImageCache, decodeArrowImageCache, validateArrowImageCache, arrowImageCacheSha256} from './arrow-image-cache.mjs';

assert.equal(process.argv.length, 2);
const output = path.join(root, 'artifacts/arrow-image-cache-controls/run-' + randomUUID()), controls = [];
let phase = 'codec';
const passed = name => controls.push({name, passed: true});
const reject = (name, action) => {assert.throws(action, undefined, name); passed(name);};
async function publish(completed, details) {
  const b = Buffer.from(JSON.stringify({schemaVersion: 1, comparisonKind: 'native-arrow-image-cache-controls', completed, phase,
    converterInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false, controls, ...details}, null, 2) + '\n');
  await writeArtifact(output, 'report.json', b);
  console.log(JSON.stringify({completed, phase, controls: controls.length, report: path.relative(root, path.join(output, 'report.json')).split(path.sep).join('/'), sha256: sha256(b), ...details}));
}
try {
  const files = new Map([['a/first', Buffer.from('original')], ['b/alias', Buffer.from('original')], ['empty', Buffer.alloc(0)], ['__proto__', Buffer.from('named-file')]]);
  const bytes = encodeArrowCache({marker: 'synthetic'}, files), small = decodeArrowCache(bytes);
  assert.equal(Object.keys(small.header.assets).length, 4); assert.equal(small.blobs.size, 3);
  for (const [p, b] of files) assert.ok(small.get(p).equals(b));
  passed('lossless original bytes, deduplication, empty file and prototype-like filename');
  reject('missing artifact lookup', () => small.get('missing'));
  reject('truncated prefix', () => decodeArrowCache(bytes.subarray(0, 11)));
  reject('truncated original blob', () => decodeArrowCache(bytes.subarray(0, bytes.length - 1)));
  reject('trailing bytes', () => decodeArrowCache(Buffer.concat([bytes, Buffer.from([0])])));
  const flipped = Buffer.from(bytes); flipped[flipped.length - 1] ^= 1;
  reject('changed original blob bytes', () => decodeArrowCache(flipped));
  const badMagic = Buffer.from(bytes); badMagic[0] ^= 1;
  reject('unknown format', () => decodeArrowCache(badMagic));
  for (const n of [0, arrowCacheBounds.index + 1, 0xffffffff]) {
    const b = Buffer.from(bytes); b.writeUInt32LE(n, 8);
    reject('invalid index length/' + n, () => decodeArrowCache(b));
  }
  const body = bytes.subarray(12 + bytes.readUInt32LE(8));
  const wire = index => {const b = Buffer.from(index), prefix = Buffer.from(bytes.subarray(0, 12)); prefix.writeUInt32LE(b.length, 8); return Buffer.concat([prefix, b, body]);};
  reject('duplicate JSON keys', () => decodeArrowCache(wire(JSON.stringify(small.header).replace('"marker":"synthetic"', '"marker":"synthetic","marker":"synthetic"') + '\n')));
  reject('array used as asset index', () => decodeArrowCache(wire(JSON.stringify({...small.header, assets: [sha256('original')]}) + '\n')));
  reject('unused blob', () => decodeArrowCache(wire(JSON.stringify({...small.header, blobs: [...small.header.blobs, {sha256: '0'.repeat(64), bytes: 0}]}) + '\n')));
  reject('negative blob length', () => decodeArrowCache(wire(JSON.stringify({...small.header, blobs: small.header.blobs.map((q, i) => i ? q : {...q, bytes: -1})}) + '\n')));
  for (const p of ['../outside', '/absolute', 'C:/outside', 'a\\b', 'a//b', 'a/./b']) reject('unsafe path/' + p, () => arrowCachePath(p));
  reject('unsafe encoder path', () => encodeArrowCache({}, new Map([['../outside', Buffer.from('x')]])));

  phase = 'frozen-evidence'; const e = await loadArrowImageCache(); passed('complete pinned native cache and rederived primary/PDF policies');
  const mutate = (name, action) => reject(name, () => {const h = {...e.header}; action(h); validateArrowImageCache({...e, header: h});});
  for (const [key, value] of Object.entries({schemaVersion: 2, comparisonKind: 'candidate-evidence', completed: false,
    converterInvoked: true, approvedImagePolicy: true, imageConformanceClaim: true, publicAdmission: 'passed', snapshotSha256: '0'.repeat(64)}))
    mutate('role/' + key, h => h[key] = value);
  mutate('changed source report pin', h => h.sourceReports = {...h.sourceReports, pdf: {...h.sourceReports.pdf, sha256: '0'.repeat(64)}});
  for (const role of Object.keys(e.header.reports)) mutate('changed checked report/' + role, h => h.reports = {...h.reports, [role]: h.reports[role] + ' '});
  mutate('missing independent PDF reader', h => {h.reports = {...h.reports}; delete h.reports.pdfCheck;});
  mutate('lost required artifact', h => {h.assets = {...h.assets}; delete h.assets['reference/legacy-defaults/pdf-page-1x.png'];});

  const {assets, blobs, ...metadata} = e.header;
  const forge = (name, change) => reject(name, () => {
    const altered = new Map(Object.keys(assets).map(p => [p, e.get(p)])); change(altered);
    validateArrowImageCache(decodeArrowCache(encodeArrowCache(metadata, altered)));
  });
  phase = 'rehashed-forgeries';
  forge('substituted PNG with recalculated blob and artifact hashes', m => {
    const p = 'reference/legacy-defaults/pdf-page-1x.png', b = Buffer.from(m.get(p)); b[b.length - 1] ^= 1; m.set(p, b);
  });
  forge('weakened limit with recalculated blob and artifact hashes', m => {
    const p = 'policies/legacy-defaults/native-source/relative-viewport.json', q = JSON.parse(m.get(p));
    q.source.rows[0].regions[0].limits.maxRawChannelError++; m.set(p, Buffer.from(JSON.stringify(q) + '\n'));
  });
  forge('lost absolute raster with recalculated archive index', m => {for (const p of m.keys()) if (p.includes('/absolute-viewport/')) m.delete(p);});
  const changed = Buffer.from(e.compressed); changed[changed.length - 1] ^= 1;
  reject('changed compressed cache', () => decodeArrowImageCache(changed));
  reject('empty compressed cache', () => decodeArrowImageCache(Buffer.alloc(0)));
  const firstSource = Object.keys(e.sourceHashes)[0];
  await assert.rejects(loadArrowImageCache(p => p === path.join(root, firstSource) ? Promise.resolve(Buffer.from('changed source')) : readFile(p)));
  passed('changed captured qualification source rejected through loader');

  let originalBytes = 0;
  for (const [p, h] of Object.entries(e.manifest.artifacts)) {const b = e.get(p); assert.equal(sha256(b), h); originalBytes += b.length;}
  passed('all 19004 original artifacts retain their native manifest hashes');
  for (const p of Object.keys(e.header.assets)) if (/\.(?:json|mjs|svg|cs|tex|tikz)$/.test(p))
    assert.ok(!/\b[A-Z]:[\\/]+Users[\\/]+/.test(e.get(p).toString('utf8')), 'Absolute private home path in cached text: ' + p);
  passed('cached text contains no absolute Windows home paths');
  phase = 'complete'; await publish(true, {cacheSha256: arrowImageCacheSha256, assets: Object.keys(e.header.assets).length,
    blobs: e.blobs.size, originalBytes, sourceGuards: Object.keys(e.sourceHashes).length, primaryViews: e.primary.summary.views, pdfViews: e.pdf.summary.views});
} catch (error) {process.exitCode = 2; await publish(false, {error: error.message.replaceAll(root, '<repo>')}); console.error(error.stack);}
