// Only exact pinned qualification reports may use historical captured tools.
import assert from 'node:assert/strict';
import {sha256} from './shape-oracle-bundle.mjs';
import {arrowCachePath} from './arrow-image-cache-codec.mjs';

export async function arrowQualifiedSources(reportBytes, pin, readCaptured) {
  assert.equal(sha256(reportBytes), pin.sha256, 'Changed pinned qualification report.');
  const sources = new Map();
  for (const [file, hash] of Object.entries(JSON.parse(reportBytes).sourceHashes)) {
    arrowCachePath(file); assert.match(hash, /^[a-f0-9]{64}$/);
    const bytes = await readCaptured('source-captures/' + file);
    assert.ok(Buffer.isBuffer(bytes));
    assert.equal(sha256(bytes), hash, 'Changed captured qualification source: ' + file);
    sources.set(file, {bytes, sha256: hash});
  }
  return sources;
}
