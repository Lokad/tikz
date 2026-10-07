// Fixed independent limits; admission never changes raw research roles.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root, sha256} from './shape-oracle-bundle.mjs';
import {edgeCanonical} from './curved-edge-log.mjs';
import {edgeSnapshotSha256} from './curved-edge-evidence.mjs';
import {edgeImageCacheFile, edgeImageCacheSha256, edgeImageCacheDecodedSha256, edgeImageCacheReports, loadEdgeImageCache} from './curved-edge-image-cache.mjs';
import {edgePrimaryViews, edgePrimaryViewKey} from './curved-edge-primary-policy.mjs';
import {edgePdfViews} from './curved-edge-pdf-policy.mjs';
import {edgeTrialDefects} from './curved-edge-trial-defects.mjs';
import {edgeTrialSources} from './curved-edge-trial-sources.mjs';
import {finishEdgeTrial} from './curved-edge-trial-policy.mjs';
import {edgeProfileSha256} from './curved-edge-profile-pin.mjs';
import {buildEdgeAgent, validateEdgeAgentLinks} from './curved-edge-agent.mjs';

export const edgeProfileFile = 'tools/TikzVisual/curved-edge-profile.json';
export const edgeProfilePinFile = 'tools/TikzVisual/curved-edge-profile-pin.mjs';
export const edgePolicyId = 'chromium-153-native-pgf-curved-connections-v1';
export const edgePolicyScope = 'Only the five fixed curved to/edge fixtures: 70 native paths, 66 paints, two clips, four nodes, 64 anchors, one named coordinate and ten glyphs. Separately calibrated original-driver SVG and ordinary-PDF agreement; exact pixels refer only to the independently reconstructed native SVG page.';
export const edgeGateCounts = {"numeric":2066,"frame":471,"primary":4728,"originalPdf":1636,"candidatePdf":1636,"nativePage":1596,"freshPrimary":210,"freshPdfNative":70};
export const edgeAdmissionQualification = {
  "cacheControls": {
    "report": "artifacts/curved-edge-image-cache-controls/run-9a023277-fb13-4e88-9eb4-06e35fdeb6fb/report.json",
    "sha256": "cba85500602a8de7b41c484bb635438fe34f8d26c5a334fd96e6984e04cb1876"
  },
  "cachedTrial": {
    "report": "artifacts/curved-edge-cached-trial/run-cc660086-b013-42d4-af1c-f84725295b39/report.json",
    "sha256": "2e38cfc2daf710bd377af8ba05a5348c5158c175a294ac21a8715e59e186cb37"
  },
  "trial": {
    "report": "artifacts/curved-edge-public-trial/run-a6e27ec4-57e5-4d4c-8816-46989f7f49cb/report.json",
    "sha256": "e60e35a877e4d9384b12e699f2c0af3b1cf4f83f915bda01e91e9e61b36d4cf1"
  },
  "checker": {
    "report": "artifacts/curved-edge-public-checks/run-a1ec703b-5446-40a1-b2be-4183e1798395/report.json",
    "sha256": "950537a347e1e5a75155e16e5b6405c9d43cdcc75e9e4f90790013f771da6f5b"
  }
};
const checkerControls = ['false-admission', 'false-converter-role', 'missing-case', 'missing-primary-view', 'missing-PDF-view', 'missing-native-page', 'changed-frame', 'changed-numeric', 'invented-driver-correction', 'invented-original-diagnostics', 'missing-defect', 'numeric-mask', 'wrong-defect-target', 'false-visibility', 'missing-source-attribution', 'weakened-native-zero-gate', 'false-summary', 'missing-gallery', 'changed-qualification'];
const extras = ['curved-edge-image-cache.mjs', 'materialize-curved-edge-image-cache.mjs', 'curved-edge-image-owned-child.mjs', 'trial-curved-edge-cached.mjs',
  'curved-edge-admission-policy.mjs', 'curved-edge-admission-owned-child.mjs', 'prepare-curved-edge-admission.mjs', 'compare-curved-edge-conformance.mjs', 'curved-edge-admission-self-test.mjs', 'curved-edge-agent.mjs', 'curved-edge-agent-viewer.mjs', 'curved-edge-agent-self-test.mjs'].map(p => 'tools/TikzVisual/' + p);
export const edgeGuardFiles = e => [...new Set([...Object.keys(e.toolHashes), ...edgeTrialSources, ...extras])].sort();
const digest = value => sha256(JSON.stringify(value));
const jsonRecord = value => JSON.parse(JSON.stringify(value));
export function makeEdgeProfile(e, guardToolHashes) {
  return {schemaVersion: 1, id: edgePolicyId, scope: edgePolicyScope, approvedImagePolicy: true,
    calibration: {file: edgeImageCacheFile, sha256: edgeImageCacheSha256, decodedSha256: edgeImageCacheDecodedSha256, snapshotSha256: edgeSnapshotSha256},
    qualification: Object.fromEntries(Object.entries(edgeAdmissionQualification).map(([k, v]) => [k, v.sha256])),
    renderer: e.calibration.renderer, requiredGates: Object.keys(edgeGateCounts), executedChecks: edgeGateCounts,
    requiredViews: {primary: edgePrimaryViews, pdf: edgePdfViews}, numericCounts: [342, 421, 356, 719, 228],
    nativePageRawLimit: 0, primaryPolicySha256: digest(e.reports.primary.policy),
    claims: {primary: 'calibrated-unchanged-original-driver', pdf: 'separate-calibrated-original-driver-and-native', nativePage: 'exact-independent-native-SVG-page', originalDriver: 'required-calibrated-uncorrected', hostedExecution: 'unverified'},
    counts: {cases: 5, nativePaths: 70, paints: 66, clips: 2, nodes: 4, anchors: 64, namedCoordinates: 1, glyphs: 10,
      primaryViews: 60, originalDiagnosticViews: 0, pdfViewsPerRoute: 20, nativePages: 20, defects: 18,
      visiblePrimaryDefectViews: 169, invisiblePrimaryDefectViews: 41, primaryDefectViews: 210, visiblePdfDefectViews: 68, invisiblePdfDefectViews: 2, pdfNativeDefectViews: 70, sourceRegions: 389, cubicSamples: 183},
    defects: edgeTrialDefects,
    cases: e.reports.primary.cases.map((p, i) => ({id: p.id, primaryFrameSha256: digest(p.frame), corrections: p.corrections,
      pdfCameraSha256: digest(e.reports.pdf.cases[i].camera), pdfRegionsSha256: digest(e.reports.pdf.cases[i].regions), pdfPoliciesSha256: digest(e.reports.pdf.cases[i].policies)})),
    guardToolHashes};
}
export function validateEdgeProfile(p, e) {
  assert.deepEqual(Object.keys(p.guardToolHashes).sort(), edgeGuardFiles(e));
  for (const h of Object.values(p.guardToolHashes)) assert.match(h, /^[a-f0-9]{64}$/);
  assert.deepEqual(p, makeEdgeProfile(e, p.guardToolHashes), 'Changed fixed curved-connection profile.');
}
export async function verifyEdgeGuards(profile, read = readFile) {
  for (const [p, h] of Object.entries(profile.guardToolHashes)) assert.equal(sha256(edgeCanonical(await read(path.join(root, p)))), h, 'Changed admission source: ' + p);
}
export async function loadEdgePolicy(read = readFile) {
  const e = await loadEdgeImageCache(read), profileBytes = edgeCanonical(await read(path.join(root, edgeProfileFile))), profile = decodeEdgeProfile(profileBytes);
  validateEdgeProfile(profile, e); await verifyEdgeGuards(profile, read);
  const acceptancePinBytes = edgeCanonical(await read(path.join(root, edgeProfilePinFile)));
  assert.ok(acceptancePinBytes.toString('utf8').includes("export const edgeProfileSha256='" + edgeProfileSha256 + "';"));
  return {...e, profile, profileBytes, profileSha256: sha256(profileBytes), acceptancePinBytes, acceptancePinSha256: sha256(acceptancePinBytes)};
}
export function decodeEdgeProfile(bytes) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length <= 1000000);
  assert.equal(sha256(bytes), edgeProfileSha256, 'Unreviewed curved-connection profile.');
  return JSON.parse(bytes);
}
function rawRole(r, kind) {
  assert.deepEqual([r.schemaVersion, r.comparisonKind, r.completed, r.converterInvoked, r.approvedImagePolicy, r.imageConformanceClaim], [1, kind, true, true, false, false]);
}
export function validateEdgeCheckedTrial(e, cached, trial, checker, trialSha256, checkerSha256) {
  rawRole(cached, 'cached-public-curved-edge-trial'); rawRole(trial, 'public-curved-edge-image-trial'); rawRole(checker, 'independent-public-curved-edge-trial-check');
  assert.equal(cached.passed, true); assert.equal(cached.overallVerdict, 'pending'); assert.equal(trial.overallVerdict, 'pending');
  assert.equal(cached.cacheSha256, edgeImageCacheSha256); assert.equal(cached.decodedCacheSha256, edgeImageCacheDecodedSha256);
  assert.equal(trial.snapshotSha256, edgeSnapshotSha256);
  assert.deepEqual(trial.renderer, e.calibration.renderer); assert.deepEqual(checker.renderer, trial.renderer);
  assert.equal(cached.inputs.trial.sha256, trialSha256); assert.equal(cached.inputs.checker.sha256, checkerSha256);
  for (const role of ['trial', 'checker']) assert.deepEqual([cached.inputs[role].completed, cached.inputs[role].passed], [true, true]);
  assert.equal(checker.inputReportSha256, trialSha256);
  assert.equal(checker.inputReport, cached.inputs.trial.report);
  assert.deepEqual(checker.controls.map(c => c.name), checkerControls); assert.ok(checker.controls.every(c => c.passed === true));
  assert.deepEqual([checker.numericChecksVerified, checker.svgsReconstructed, checker.primaryMetricsRecomputed, checker.pdfMetricsRecomputed, checker.nativeMetricsRecomputed, checker.pagesRecomputed], [2066, 23, 22254, 8994, 7418, 110]);
  assert.deepEqual(trial.qualification.map(q => q.role), Object.keys(edgeImageCacheReports));
  assert.deepEqual(cached.inputs.qualifications.map(q => q.role), Object.keys(edgeImageCacheReports));
  for (const [i, role] of Object.keys(edgeImageCacheReports).entries()) {
    assert.equal(trial.qualification[i].sha256, edgeImageCacheReports[role].sha256);
    assert.equal(trial.qualification[i].copiedReport, 'qualification/' + role + '/report.json');
    assert.equal(cached.inputs.qualifications[i].sha256, edgeImageCacheReports[role].sha256);
    assert.deepEqual(cached.inputs.qualifications[i].original, edgeImageCacheReports[role]);
    assert.equal(trial.qualification[i].input, cached.inputs.qualifications[i].materializedReport);
  }
  assert.deepEqual(Object.keys(cached.sourceHashes), extras.slice(0, 4));
  for (const [p, h] of Object.entries(cached.sourceHashes)) assert.equal(h, e.profile.guardToolHashes[p]);
  assert.deepEqual(Object.keys(trial.sourceHashes), edgeTrialSources);
  for (const [p, h] of Object.entries(trial.sourceHashes)) {
    assert.equal(h, e.profile.guardToolHashes[p]); assert.equal(checker.artifacts['source-captures/' + p], h);
  }
  let sourceRegions = 0;
  for (const [i, c] of trial.cases.entries()) {
    const p = e.reports.primary.cases[i]; assert.equal(c.id, p.id); assert.deepEqual(c.corrections, p.corrections);
    assert.deepEqual(c.originalDiagnostics, []); assert.deepEqual(c.corrections, []);
    assert.deepEqual(c.sources.map(s => s.regionId), p.frame.regions.map(r => r.id));
    for (const s of c.sources) {
      assert.ok(/^candidate-[pgc]\d+$/.test(s.svgElementId) && Number.isSafeInteger(s.source.offset) && s.source.offset >= 0 && Number.isSafeInteger(s.source.length) && s.source.length > 0 && s.text.length === s.source.length);
      assert.equal(s.attribution, 'direct-scene-source');
      if (s.kind === 'clip') { assert.match(s.svgElementId, /^candidate-c\d+$/); assert.ok(s.text.startsWith('\\clip')); }
    }
    sourceRegions += c.sources.length;
  }
  assert.equal(sourceRegions, 389); assert.match(trial.artifacts['index.html'], /^[a-f0-9]{64}$/);
  const combined = jsonRecord(finishEdgeTrial(trial.cases, trial.defects, e.reports.primary.policy, e.reports.pdf.cases));
  assert.deepEqual(trial.combined, combined); assert.deepEqual(cached.combined, combined); assert.equal(combined.passed, true);
  for (const [gate, count] of Object.entries(edgeGateCounts)) assert.deepEqual(combined.gates[gate], {state: 'passed', executedChecks: count});
  return combined;
}
export function finishEdgeAdmission(e, combined) {
  assert.equal(e.profile.approvedImagePolicy, true);
  assert.deepEqual(Object.keys(combined.gates), Object.keys(edgeGateCounts));
  for (const [gate, count] of Object.entries(edgeGateCounts)) assert.equal(combined.gates[gate].executedChecks, count);
  const firstFailedGate = Object.keys(edgeGateCounts).find(k => combined.gates[k].state !== 'passed') ?? null;
  const passed = firstFailedGate === null;
  assert.equal(combined.passed, passed);
  return {passed, verdict: passed ? 'pass' : 'fail', firstFailedGate, gates: combined.gates, approvedImagePolicy: true, imageConformanceClaim: passed, overallVerdict: passed ? 'pass' : 'fail'};
}
export function validateEdgeAdmissionViewer(html, artifacts) {
  const links = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]);
  for (const p of links) {
    assert.ok(/^[\w./-]+$/.test(p) && !p.startsWith('/') && !p.split('/').some(s => ['', '.', '..'].includes(s)));
    if (p !== 'report.json') assert.match(artifacts[p] ?? '', /^[a-f0-9]{64}$/, 'Missing viewer artifact: ' + p);
  }
  for (const p of ['profile.json', 'cached/report.json', 'trial/index.html', 'checker/report.json', ...['continuation', 'styles', 'coordinates', 'nodes', 'clipping'].flatMap(id => ['source.tikz', 'actual-scene.json'].map(p => 'trial/numeric/' + id + '/' + p))]) assert.ok(links.includes(p), 'Missing agent link: ' + p);
}
export function validateEdgeAdmissionReport(r, e, cached, trial, checker) {
  assert.deepEqual([r.schemaVersion, r.comparisonKind, r.completed, r.passed, r.converterInvoked], [1, 'cached-public-curved-edge-conformance', true, true, true]);
  assert.equal(r.policyId, edgePolicyId); assert.equal(r.policyScope, edgePolicyScope); assert.equal(r.profileSha256, e.profileSha256); assert.equal(r.cacheSha256, edgeImageCacheSha256);
  assert.deepEqual(r.renderer, e.calibration.renderer); assert.equal(r.artifacts['profile.json'], e.profileSha256);
  assert.equal(r.acceptancePinSha256, e.acceptancePinSha256); assert.equal(r.artifacts['acceptance-pin.mjs'], e.acceptancePinSha256);
  for (const [role, child] of Object.entries({cached, trial, checker})) {
    assert.equal(r.inputs[role].report, role + '/report.json'); assert.equal(r.artifacts[r.inputs[role].report], r.inputs[role].sha256);
    assert.match(r.inputs[role].sourceFile, new RegExp('^artifacts/curved-edge-' + ({cached: 'cached-trial', trial: 'public-trial', checker: 'public-checks'})[role] + '/run-[a-f0-9-]+/report\\.json$'));
    for (const [p, h] of Object.entries(child.artifacts)) assert.equal(r.artifacts[role + '/' + p], h);
  }
  assert.equal(r.inputs.trial.sourceFile, cached.inputs.trial.report); assert.equal(r.inputs.checker.sourceFile, cached.inputs.checker.report);
  const combined = validateEdgeCheckedTrial(e, cached, trial, checker, r.inputs.trial.sha256, r.inputs.checker.sha256);
  assert.deepEqual(r.combined, finishEdgeAdmission(e, combined)); assert.deepEqual([r.approvedImagePolicy, r.imageConformanceClaim, r.overallVerdict], [true, true, 'pass']);
  assert.equal(digest(r.agent), digest(buildEdgeAgent(trial)), 'Changed complete agent projection.'); validateEdgeAgentLinks(r.agent, r.artifacts);
  assert.deepEqual(r.sourceHashes, e.profile.guardToolHashes);
  for (const [p, h] of Object.entries(r.sourceHashes)) assert.equal(r.artifacts['source-captures/' + p], h);
}
