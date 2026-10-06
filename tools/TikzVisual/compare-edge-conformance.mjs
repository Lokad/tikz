// Immutable fixed-corpus admission around one owned fresh cached trial/checker.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root, sha256, writeArtifact, outputPath} from './shape-oracle-bundle.mjs';
import {edgeCanonical} from './edge-log.mjs';
import {edgeImageCacheFile, edgeImageCacheSha256} from './edge-image-cache.mjs';
import {loadEdgePolicy, edgePolicyId, edgePolicyScope, verifyEdgeGuards, validateEdgeCheckedTrial, finishEdgeAdmission, validateEdgeAdmissionViewer, validateEdgeAdmissionReport} from './edge-admission-policy.mjs';
import {runOwnedEdgeCached, readEdgeAdmissionChild, copyEdgeAdmissionChild} from './edge-admission-owned-child.mjs';

const base = path.join(root, 'artifacts/edge-conformance'), output = path.join(base, 'run-' + randomUUID()), artifacts = {}, sourceHashes = {}, inputs = {};
let phase = 'immutable-evidence', converterInvoked = false, cached, e;
const save = (p, b) => writeArtifact(output, p, b, artifacts);
const binding = (child, role) => ({sourceFile: child.reportPath, report: role + '/report.json', sha256: child.sha256});
async function publish(report) {
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n'); await writeArtifact(output, 'report.json', bytes);
  const reportPath = path.relative(root, path.join(output, 'report.json')).split(path.sep).join('/');
  await writeArtifact(base, 'latest.json', JSON.stringify({completed: report.completed, report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'), sha256: sha256(bytes)}, null, 2) + '\n');
  console.log(JSON.stringify({kind: 'edge-conformance', final: report.completed === true || Boolean(report.error), completed: report.completed, passed: report.passed, report: reportPath, sha256: sha256(bytes)}));
}
try {
  await publish({completed: false, passed: false, phase, converterInvoked, approvedImagePolicy: false, imageConformanceClaim: false, overallVerdict: 'pending', artifacts});
  assert.equal(process.argv.length, 2); e = await loadEdgePolicy(); Object.assign(sourceHashes, e.profile.guardToolHashes);
  await save('profile.json', e.profileBytes);
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
  const cases = trial.report.cases.map(c => '<h2>' + c.id + '</h2><p><a href="trial/numeric/' + c.id + '/source.tikz">TikZ source</a> · <a href="trial/numeric/' + c.id + '/actual-scene.json">Scene and source spans</a></p>'
    + c.primary.filter(v => v.scale === 4 && v.background === 'white').map(v => '<p>' + v.frame + ' 4x: <a href="trial/' + v.images.reference + '">Reference</a> · <a href="trial/' + v.images.actual + '">Candidate</a> · <a href="trial/' + v.images.difference + '">Raw difference</a></p>').join('')).join('');
  const html = '<!doctype html><meta charset="utf-8"><title>Straight-edge conformance</title><h1>Fixed straight-edge conformance</h1><p>' + edgePolicyScope + '</p>'
    + '<p>All eight gates and the owned independent checker passed. Original-driver diagnostics and the explicit missing-dot correction remain in the detailed trial.</p>'
    + '<p><a href="report.json">Admission report</a> · <a href="profile.json">Fixed profile</a> · <a href="cached/report.json">Owned cached run</a> · <a href="checker/report.json">Independent checker</a> · <a href="trial/index.html">Paired images, overlays, raw/amplified differences and defect crops</a></p>'
    + cases + '<iframe title="Trial images" src="trial/index.html" style="width:100%;height:80vh;border:0"></iframe>';
  validateEdgeAdmissionViewer(html, artifacts); await save('index.html', html);
  phase = 'final-integrity'; await verifyEdgeGuards(e.profile);
  assert.equal(sha256(await readFile(path.join(root, edgeImageCacheFile))), edgeImageCacheSha256);
  const numeric = JSON.parse(await readFile(await outputPath(trial.folder, 'numeric/report.json')));
  for (const [p, h] of Object.entries({...numeric.converterSources, ...numeric.toolHashes})) assert.equal(sha256(edgeCanonical(await readFile(path.join(root, p)))), h, p);
  for (const [p, h] of Object.entries(artifacts)) assert.equal(sha256(await readFile(await outputPath(output, p))), h);
  const report = {schemaVersion: 1, comparisonKind: 'cached-public-straight-edge-conformance', completed: true, passed: true, converterInvoked: true,
    approvedImagePolicy: true, imageConformanceClaim: true, overallVerdict: 'pass', policyId: edgePolicyId, policyScope: edgePolicyScope,
    profileSha256: e.profileSha256, cacheSha256: edgeImageCacheSha256, renderer: trial.report.renderer, inputs, combined, sourceHashes,
    agent: {viewer: 'index.html', trialViewer: 'trial/index.html', firstFailedGate: null, command: 'node tools/TikzVisual/compare-edge-conformance.mjs'}, artifacts};
  validateEdgeAdmissionReport(report, e, cached.report, trial.report, checker.report); await publish(report);
} catch (error) {
  process.exitCode = 2; console.error(error.stack);
  await publish({schemaVersion: 1, comparisonKind: 'cached-public-straight-edge-conformance', completed: false, passed: false, phase, converterInvoked,
    approvedImagePolicy: false, imageConformanceClaim: false, overallVerdict: 'pending', error: error.message.replaceAll(root, '<repo>'), inputs, sourceHashes, artifacts});
}
