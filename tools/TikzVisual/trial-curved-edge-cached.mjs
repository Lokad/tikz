// Fresh public trial and independent checker backed only by tracked evidence.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root, sha256, writeArtifact} from './shape-oracle-bundle.mjs';
import {edgeCanonical} from './curved-edge-log.mjs';
import {edgeImageCacheSha256, edgeImageCacheDecodedSha256, loadEdgeImageCache} from './curved-edge-image-cache.mjs';
import {materializeEdgeImageCache} from './materialize-curved-edge-image-cache.mjs';
import {runOwnedEdgeImageChild} from './curved-edge-image-owned-child.mjs';

const base = path.join(root, 'artifacts/curved-edge-cached-trial'), output = path.join(base, 'run-' + randomUUID()), artifacts = {}, sourceHashes = {}, inputs = {};
let phase = 'cache-integrity', converterInvoked = false, trial, checker;
const save = (p, b) => writeArtifact(output, p, b, artifacts);
async function publish(completed, error) {
  const passed = completed && trial?.passed === true && checker?.passed === true;
  const report = {schemaVersion: 1, comparisonKind: 'cached-public-curved-edge-trial', completed, passed, phase, converterInvoked,
    approvedImagePolicy: false, imageConformanceClaim: false, overallVerdict: 'pending', cacheSha256: edgeImageCacheSha256,
    decodedCacheSha256: edgeImageCacheDecodedSha256, sourceHashes, inputs, combined: trial?.report.combined, artifacts, ...(error ? {error} : {})};
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n'); await writeArtifact(output, 'report.json', bytes);
  await writeArtifact(base, 'latest.json', JSON.stringify({completed, report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'), sha256: sha256(bytes)}, null, 2) + '\n');
  console.log(JSON.stringify({kind: 'curved-edge-cached-trial', final: completed || Boolean(error), completed, passed,
    report: path.relative(root, path.join(output, 'report.json')).split(path.sep).join('/'), sha256: sha256(bytes)}));
}
const binding = c => ({report: c.marker.report, sha256: c.marker.sha256, completed: c.report.completed, passed: c.passed});
try {
  await publish(false); assert.equal(process.argv.length, 2);
  for (const name of ['curved-edge-image-cache.mjs', 'materialize-curved-edge-image-cache.mjs', 'curved-edge-image-owned-child.mjs', 'trial-curved-edge-cached.mjs']) {
    const p = 'tools/TikzVisual/' + name, b = edgeCanonical(await readFile(path.join(root, p))); sourceHashes[p] = sha256(b); await save('source-captures/' + p, b);
  }
  const e = await loadEdgeImageCache(); phase = 'cache-materialization'; const materialized = await materializeEdgeImageCache(e);
  inputs.qualifications = materialized.bindings;
  phase = 'owned-public-trial'; converterInvoked = null;
  trial = await runOwnedEdgeImageChild('trial-curved-edge-images.mjs', Object.values(materialized.inputs), save, 'trial-command.log');
  converterInvoked = trial.report.converterInvoked;
  inputs.trial = binding(trial); assert.equal(trial.passed, true, 'Owned cached public trial failed; its evidence remains.');
  phase = 'owned-independent-checker'; checker = await runOwnedEdgeImageChild('check-curved-edge-trial.mjs', [trial.marker.report], save, 'checker-command.log');
  inputs.checker = binding(checker); assert.equal(checker.passed, true, 'Owned independent checker failed; its evidence remains.');
  assert.equal(checker.report.inputReportSha256, trial.marker.sha256);
  await save('owned-trial-report.json', trial.bytes); await save('owned-checker-report.json', checker.bytes);
  phase = 'final-integrity'; for (const [p, h] of Object.entries(sourceHashes)) assert.equal(sha256(edgeCanonical(await readFile(path.join(root, p)))), h);
  const again = await loadEdgeImageCache(); assert.equal(sha256(again.compressed), edgeImageCacheSha256);
  await publish(true);
} catch (error) { process.exitCode = 2; await publish(false, error.message.replaceAll(root, '<repo>')); console.error(error.stack); }
