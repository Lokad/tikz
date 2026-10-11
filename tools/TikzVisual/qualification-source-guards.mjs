// Shared byte/source boundary; family policies and inherited-source ownership
// remain the caller's responsibility.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root, sha256} from './shape-oracle-bundle.mjs';
import {edgeCanonical} from './edge-log.mjs';

export async function verifyQualificationSources(pins, role, bytes, report, read = readFile, requireOwnCaptures = true) {
  assert.ok(Object.hasOwn(pins, role));
  assert.deepEqual(report, JSON.parse(bytes), 'Qualification metadata differs from its bytes.');
  const frozen = sha256(bytes) === pins[role].sha256;
  if (!role.endsWith('Check')) assert.ok(report.sourceHashes && typeof report.sourceHashes === 'object' && !Array.isArray(report.sourceHashes));
  const sources = {...report.sourceHashes};
  if (requireOwnCaptures) for (const [p, h] of Object.entries(report.sourceHashes ?? {}))
    assert.equal(report.artifacts['source-captures/' + p], h, 'Missing qualification source capture: ' + p);
  for (const [p, h] of Object.entries(report.artifacts)) if (p.startsWith('source-captures/')) {
    const file = p.slice(16); assert.ok(!sources[file] || sources[file] === h); sources[file] = h;
  }
  if (!frozen) for (const [p, h] of Object.entries(sources))
    assert.equal(sha256(edgeCanonical(await read(path.join(root, p)))), h, 'Qualification source changed: ' + p);
  return frozen;
}
