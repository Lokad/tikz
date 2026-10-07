// Explicit preparation writes an ignored candidate; never replaces a profile.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root, sha256, writeArtifact, outputPath} from './shape-oracle-bundle.mjs';
import {edgeCanonical} from './curved-edge-log.mjs';
import {loadEdgeImageCache} from './curved-edge-image-cache.mjs';
import {edgeAdmissionQualification, edgeGuardFiles, makeEdgeProfile, validateEdgeProfile, verifyEdgeGuards, validateEdgeCheckedTrial} from './curved-edge-admission-policy.mjs';

assert.equal(process.argv.length, 2);
const output = path.join(root, 'artifacts/curved-edge-admission-preparation/run-' + randomUUID()), artifacts = {}, inputs = {}, hashes = {};
const save = (p, b) => writeArtifact(output, p, b, artifacts), e = await loadEdgeImageCache();
for (const p of edgeGuardFiles(e)) {const b = edgeCanonical(await readFile(path.join(root, p))); hashes[p] = sha256(b); await save('source-captures/' + p, b);}
const profile = makeEdgeProfile(e, hashes); validateEdgeProfile(profile, e); e.profile = profile;
for (const [role, pin] of Object.entries(edgeAdmissionQualification)) {
  const bytes = await readFile(path.join(root, pin.report)); assert.equal(sha256(bytes), pin.sha256); const r = inputs[role] = JSON.parse(bytes);
  assert.equal(r.completed, true); const folder = path.dirname(path.join(root, pin.report));
  for (const [p, h] of Object.entries(r.artifacts ?? {})) assert.equal(sha256(await readFile(await outputPath(folder, p))), h);
  await save('qualification/' + role + '/report.json', bytes);
}
const c = inputs.cacheControls; assert.equal(c.converterInvoked, false); assert.equal(c.approvedImagePolicy, false); assert.equal(c.imageConformanceClaim, false);
assert.equal(c.controls.length, 33); assert.ok(c.controls.every(c => c.passed === true));
validateEdgeCheckedTrial(e, inputs.cachedTrial, inputs.trial, inputs.checker, edgeAdmissionQualification.trial.sha256, edgeAdmissionQualification.checker.sha256);
await verifyEdgeGuards(profile); const bytes = Buffer.from(JSON.stringify(profile, null, 2) + '\n'); await save('profile.json', bytes);
await writeArtifact(output, 'report.json', JSON.stringify({schemaVersion: 1, completed: true, converterInvoked: false, profileWritten: false,
  profileSha256: sha256(bytes), qualification: edgeAdmissionQualification, artifacts}, null, 2) + '\n');
console.log(JSON.stringify({completed: true, profile: path.relative(root, path.join(output, 'profile.json')).split(path.sep).join('/'), sha256: sha256(bytes), trackedProfileWritten: false}));
