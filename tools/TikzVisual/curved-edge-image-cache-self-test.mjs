// Byte/provenance controls; image replay belongs to the owned public checker.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root, sha256, writeArtifact} from './shape-oracle-bundle.mjs';
import {loadEdgeImageCache, decodeEdgeImageCache, validateEdgeImageCache, edgeCacheRelative, edgeImageCacheSha256} from './curved-edge-image-cache.mjs';

const base = path.join(root, 'artifacts/curved-edge-image-cache-controls'), output = path.join(base, 'run-' + randomUUID()), controls = [];
const e = await loadEdgeImageCache(), c = e.calibration;
function reject(name, action) { assert.throws(action, undefined, name); controls.push({name, expected: 'reject', passed: true}); }
const mutate = (name, action) => reject(name, () => { const copy = {...c}; action(copy); validateEdgeImageCache(copy); });
for (const [key, value] of Object.entries({schemaVersion: 2, comparisonKind: 'candidate-evidence', completed: false,
  converterInvoked: true, approvedImagePolicy: true, imageConformanceClaim: true, overallVerdict: 'passed', snapshotSha256: '0'.repeat(64)}))
  mutate('role/' + key, q => q[key] = value);
mutate('rehashed source pin', q => q.sourceReports = {...c.sourceReports, primary: {...c.sourceReports.primary, sha256: sha256('changed')}});
for (const role of Object.keys(c.reports)) mutate('modified exact report/' + role, q => q.reports = {...c.reports, [role]: c.reports[role] + ' '});
mutate('missing source report', q => { q.reports = {...c.reports}; delete q.reports.primaryCheck; });
mutate('changed renderer', q => q.renderer = {...c.renderer, osRelease: 'unqualified'});
const asset = Object.keys(c.assets)[0], hash = c.assets[asset];
mutate('missing required artifact', q => { q.assets = {...c.assets}; delete q.assets[asset]; });
mutate('extra artifact', q => q.assets = {...c.assets, 'primary/unexpected.svg': hash});
mutate('changed artifact digest', q => q.assets = {...c.assets, [asset]: sha256('changed')});
mutate('missing blob', q => { q.blobs = {...c.blobs}; delete q.blobs[hash]; });
mutate('changed blob', q => q.blobs = {...c.blobs, [hash]: Buffer.from('changed').toString('base64')});
mutate('noncanonical base64', q => q.blobs = {...c.blobs, [hash]: c.blobs[hash] + '\n'});
mutate('rehashed replacement blob', q => { const h = sha256('changed'); q.assets = {...c.assets, [asset]: h}; q.blobs = {...c.blobs, [h]: Buffer.from('changed').toString('base64')}; });
const changed = Buffer.from(e.compressed); changed[changed.length - 1] ^= 1;
reject('changed compressed archive', () => decodeEdgeImageCache(changed));
reject('unreviewed empty archive', () => decodeEdgeImageCache(Buffer.alloc(0)));
reject('compressed size bound', () => decodeEdgeImageCache(Buffer.alloc(96000001)));
for (const p of ['../outside', '/absolute', 'C:/outside', 'a\\b', 'a//b', 'a/./b']) reject('unsafe path/' + p, () => edgeCacheRelative(p));
const firstSource = Object.keys(e.toolHashes)[0];
await assert.rejects(loadEdgeImageCache(async p => p === path.join(root, firstSource) ? Buffer.from('changed source') : readFile(p)));
controls.push({name: 'changed qualification source before conversion', expected: 'reject', passed: true});
for (const role of Object.keys(e.reports)) for (const [p, h] of Object.entries(e.reports[role].artifacts)) assert.equal(sha256(e.get(role, p)), h);
controls.push({name: 'all 11507 original artifact digests reproduced', expected: 'pass', passed: true});
const report = {schemaVersion: 1, comparisonKind: 'curved-edge-image-cache-controls', completed: true, converterInvoked: false,
  approvedImagePolicy: false, imageConformanceClaim: false, cacheSha256: edgeImageCacheSha256, assets: Object.keys(c.assets).length,
  blobs: Object.keys(c.blobs).length, nativeInputs: e.native.files.size, controls};
const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n'); await writeArtifact(output, 'report.json', bytes);
await writeArtifact(base, 'latest.json', JSON.stringify({completed: true, report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'), sha256: sha256(bytes)}, null, 2) + '\n');
console.log(JSON.stringify({kind: 'curved-edge-image-cache-controls', completed: true, controls: controls.length,
  report: path.relative(root, path.join(output, 'report.json')).split(path.sep).join('/'), sha256: sha256(bytes)}));
