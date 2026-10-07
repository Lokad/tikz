import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root, sha256} from './shape-oracle-bundle.mjs';
import {arrowCanonical} from './arrow-native-contract.mjs';
import {arrowSourcePdfSources} from './arrow-source-pdf-contract.mjs';

export async function arrowPublicSourceTools() {
  const sources = await arrowSourcePdfSources(), queue = ['trial-arrow-source-baselines.mjs','arrow-public-source-policy.mjs','arrow-public-source-contract.mjs'].map(p => 'tools/TikzVisual/' + p);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i]; if (sources.has(p)) continue;
    assert.match(p, /^tools\/TikzVisual\/[a-z0-9.-]+\.mjs$/);
    const bytes = arrowCanonical(await readFile(path.join(root,p))); sources.set(p,{bytes,sha256:sha256(bytes)});
    for (const m of bytes.toString().matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g)) queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(p),m[1])));
  }
  return new Map([...sources].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0));
}

export async function validateArrowPublicNumeric(n, read) {
  assert.deepEqual([n.completed,n.converterInvoked,n.approvedImagePolicy,n.imageConformanceClaim],[true,true,false,false]);
  assert.equal(n.checks,12062); assert.ok(n.cases.every(c => c.converted));
  assert.ok(n.converterAssemblyReferences.length > 0 && n.converterAssemblyReferences.every(s => s === 'System' || s.startsWith('System.')));
  for (const [p,h] of Object.entries(n.artifacts)) assert.equal(sha256(await read(p)),h);
  for (const [p,h] of Object.entries(n.sources)) assert.equal(sha256(arrowCanonical(await readFile(path.join(root,p)))),h);
  for (const [p,h] of Object.entries(n.inputs)) {
    const bytes=await readFile(path.join(root,p)), captured=await read('input-captures/'+p);
    assert.equal(sha256(captured),h);
    assert.ok(bytes.equals(captured) || arrowCanonical(bytes).equals(captured), 'Changed public numeric input: '+p);
  }
}
