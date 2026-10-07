// Immutable fixed-corpus admission around one owned fresh cached trial/checker.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root, sha256, writeArtifact, outputPath} from './shape-oracle-bundle.mjs';
import {edgeCanonical} from './curved-edge-log.mjs';
import {edgeImageCacheFile, edgeImageCacheSha256} from './curved-edge-image-cache.mjs';
import {loadEdgePolicy, edgeProfileFile, edgeProfilePinFile, edgePolicyId, edgePolicyScope, verifyEdgeGuards, validateEdgeCheckedTrial, finishEdgeAdmission, validateEdgeAdmissionViewer, validateEdgeAdmissionReport} from './curved-edge-admission-policy.mjs';
import {runOwnedEdgeCached, readEdgeAdmissionChild, copyEdgeAdmissionChild} from './curved-edge-admission-owned-child.mjs';
import {buildEdgeAgent, validateEdgeAgentLinks} from './curved-edge-agent.mjs';
import {edgeAgentViewer,edgeAgentImages} from './curved-edge-agent-viewer.mjs';

const base = path.join(root, 'artifacts/curved-edge-conformance'), output = path.join(base, 'run-' + randomUUID()), artifacts = {}, sourceHashes = {}, inputs = {};
let phase = 'immutable-evidence', converterInvoked = false, cached, e;
const save = (p, b) => writeArtifact(output, p, b, artifacts);
const binding = (child, role) => ({sourceFile: child.reportPath, report: role + '/report.json', sha256: child.sha256});
async function publish(report) {
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n'); await writeArtifact(output, 'report.json', bytes);
  const reportPath = path.relative(root, path.join(output, 'report.json')).split(path.sep).join('/');
  await writeArtifact(base, 'latest.json', JSON.stringify({completed: report.completed, report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'), sha256: sha256(bytes)}, null, 2) + '\n');
  console.log(JSON.stringify({kind: 'curved-edge-conformance', final: report.completed === true || Boolean(report.error), completed: report.completed, passed: report.passed, report: reportPath, sha256: sha256(bytes)}));
}
try {
  await publish({completed: false, passed: false, phase, converterInvoked, approvedImagePolicy: false, imageConformanceClaim: false, overallVerdict: 'pending', artifacts});
  assert.equal(process.argv.length, 2); e = await loadEdgePolicy(); Object.assign(sourceHashes, e.profile.guardToolHashes);
  await save('profile.json', e.profileBytes);
  await save('acceptance-pin.mjs', e.acceptancePinBytes);
  for (const [p, h] of Object.entries(sourceHashes)) {const b = edgeCanonical(await readFile(path.join(root, p))); assert.equal(sha256(b), h); await save('source-captures/' + p, b);}
  phase = 'owned-cached-trial'; converterInvoked = null; cached = await runOwnedEdgeCached(save); converterInvoked = cached.report.converterInvoked;
  inputs.cached = binding(cached, 'cached'); await copyEdgeAdmissionChild(cached, 'cached', save);
  assert.equal(cached.status, 0, 'Owned cached trial failed; evidence retained.');
  const t = cached.report.inputs.trial, c = cached.report.inputs.checker;
  const trial = await readEdgeAdmissionChild(t.report, t.sha256), checker = await readEdgeAdmissionChild(c.report, c.sha256);
  inputs.trial = binding(trial, 'trial'); inputs.checker = binding(checker, 'checker');
  phase = 'admission'; const rawCombined = validateEdgeCheckedTrial(e, cached.report, trial.report, checker.report, trial.sha256, checker.sha256);
  const combined = finishEdgeAdmission(e, rawCombined); assert.equal(combined.passed, true);
  phase = 'self-contained-agent-artifacts'; await copyEdgeAdmissionChild(trial, 'trial', save); await copyEdgeAdmissionChild(checker, 'checker', save);
  const agent = buildEdgeAgent(trial.report); validateEdgeAgentLinks(agent, artifacts);
  const imageData=await edgeAgentImages(agent,artifacts,async p=>readFile(await outputPath(output,p)));
  const html = edgeAgentViewer(agent, edgePolicyScope,imageData);
  validateEdgeAdmissionViewer(html, artifacts); await save('index.html', html);
  phase = 'final-integrity'; await verifyEdgeGuards(e.profile);
  assert.equal(sha256(await readFile(path.join(root, edgeImageCacheFile))), edgeImageCacheSha256);
  assert.equal(sha256(edgeCanonical(await readFile(path.join(root, edgeProfileFile)))), e.profileSha256);
  assert.equal(sha256(edgeCanonical(await readFile(path.join(root, edgeProfilePinFile)))), e.acceptancePinSha256);
  const numeric = JSON.parse(await readFile(await outputPath(trial.folder, 'numeric/report.json')));
  for (const [p, h] of Object.entries({...numeric.converterSources, ...numeric.toolHashes})) assert.equal(sha256(edgeCanonical(await readFile(path.join(root, p)))), h, p);
  for (const [p, h] of Object.entries(artifacts)) assert.equal(sha256(await readFile(await outputPath(output, p))), h);
  const report = {schemaVersion: 1, comparisonKind: 'cached-public-curved-edge-conformance', completed: true, passed: true, converterInvoked: true,
    approvedImagePolicy: true, imageConformanceClaim: true, overallVerdict: 'pass', policyId: edgePolicyId, policyScope: edgePolicyScope,
    profileSha256: e.profileSha256, acceptancePinSha256: e.acceptancePinSha256, cacheSha256: edgeImageCacheSha256, renderer: trial.report.renderer, inputs, combined, sourceHashes,
    agent, artifacts};
  validateEdgeAdmissionReport(report, e, cached.report, trial.report, checker.report); await publish(report);
} catch (error) {
  process.exitCode = 2; console.error(error.stack);
  await publish({schemaVersion: 1, comparisonKind: 'cached-public-curved-edge-conformance', completed: false, passed: false, phase, converterInvoked,
    approvedImagePolicy: false, imageConformanceClaim: false, overallVerdict: 'pending', error: error.message.replaceAll(root, '<repo>'), inputs, sourceHashes, artifacts});
}
