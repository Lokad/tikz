import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Fixed independent limits; admission never changes raw research roles.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root, sha256} from './shape-oracle-bundle.mjs';
import {edgeCanonical, edgeInputFiles} from './edge-log.mjs';
import {edgeSnapshotSha256} from './edge-evidence.mjs';
import {edgeImageCacheFile, edgeImageCacheSha256, edgeImageCacheDecodedSha256, edgeImageCacheReports, loadEdgeImageCache} from './edge-image-cache.mjs';
import {edgePrimaryViews, edgePrimaryViewKey} from './edge-primary-policy.mjs';
import {edgePdfViews} from './edge-pdf-policy.mjs';
import {edgeTrialDefects} from './edge-trial-defects.mjs';
import {edgeTrialSources} from './edge-trial-sources.mjs';
import {finishEdgeTrial} from './edge-trial-policy.mjs';

export const edgeProfileFile = 'tools/TikzVisual/edge-profile.json';
export const edgePolicyId = 'chromium-153-native-pgf-straight-edges-v1';
export const edgePolicyScope = 'Only the five fixed straight to/edge fixtures: 99 paths, 90 paints, two clips, four nodes, 64 anchors, one named coordinate and 16 glyphs. Calibrated derived-driver and ordinary-PDF agreement; exact pixels refer only to the independently reconstructed native SVG page.';
export const edgeGateCounts = {numeric: 2585, frame: 630, primary: 3936, derivedPdf: 1372, candidatePdf: 1372, nativePage: 1332, freshPrimary: 150, freshPdfNative: 50};
export const edgeAdmissionQualification = {
  "cacheControls": {
    "report": "artifacts/edge-image-cache-controls/run-95fb5d4e-1647-47e3-b402-0fb11b79eb4e/report.json",
    "sha256": "cf86a83f4d080f408fab3d3f3751eec2e1d8757ec9e1cfe949befe44b105e464"
  },
  "cachedTrial": {
    "report": "artifacts/edge-cached-trial/run-68ae7211-f9b2-49c1-a269-2edfb75adf40/report.json",
    "sha256": "1eaaec427675771883aa507c3ca4735afb3c58bc5d7ef5cead0a22c80ab1fa14"
  },
  "trial": {
    "report": "artifacts/edge-public-trial/run-28caa309-a102-435e-bcee-d4cee6846486/report.json",
    "sha256": "3d8703e6c58ede402ee9632fa6abe8602ea76b876333e1c7eb7ba191c86cf192"
  },
  "checker": {
    "report": "artifacts/edge-public-checks/run-aeb170da-46bf-4d28-86db-cdf2620b766a/report.json",
    "sha256": "7928724a2ab603d5dcb90d166b9a497e8638c0d25c0bd08da36279f3c2c0174b"
  }
};
const checkerControls = ['false-admission', 'false-converter-role', 'missing-case', 'missing-primary-view', 'missing-PDF-view', 'missing-native-page', 'changed-frame', 'changed-numeric', 'hidden-dot-correction', 'missing-original-diagnostics', 'missing-defect', 'numeric-mask', 'wrong-defect-target', 'false-visibility', 'missing-source-attribution', 'weakened-native-zero-gate', 'false-summary', 'missing-gallery', 'changed-qualification'];
const extras = ['edge-image-cache.mjs', 'materialize-edge-image-cache.mjs', 'edge-image-owned-child.mjs', 'trial-edge-cached.mjs',
  'edge-admission-policy.mjs', 'edge-admission-owned-child.mjs', 'prepare-edge-admission.mjs', 'compare-edge-conformance.mjs', 'edge-admission-self-test.mjs',
  'edge-image-cache-self-test.mjs', 'edge-native-source-revisions.json', 'qualification-source-guards.mjs'].map(p => 'tools/TikzVisual/' + p);
export const edgeGuardFiles = e => [...new Set([...Object.keys(e.toolHashes), ...edgeTrialSources, ...edgeInputFiles, ...extras,
  'tools/TikzEdgeOracle/NativeSourceRevisions.cs', 'tools/TikzEdgeComparison/Program.cs', 'tools/TikzEdgeComparison/TikzEdgeComparison.csproj',
  'tools/TikzEdgeComparison/NativeComparison.cs', 'tools/TikzEdgeComparison/packages.lock.json'])].sort();
const digest = value => sha256(JSON.stringify(value));
const jsonRecord = value => JSON.parse(JSON.stringify(value));
export function makeEdgeProfile(e, guardToolHashes) {
  return {schemaVersion: 1, id: edgePolicyId, scope: edgePolicyScope, approvedImagePolicy: true,
    calibration: {file: edgeImageCacheFile, sha256: edgeImageCacheSha256, decodedSha256: edgeImageCacheDecodedSha256, snapshotSha256: edgeSnapshotSha256},
    qualification: Object.fromEntries(Object.entries(edgeAdmissionQualification).map(([k, v]) => [k, v.sha256])),
    renderer: e.calibration.renderer, requiredGates: Object.keys(edgeGateCounts), executedChecks: edgeGateCounts,
    requiredViews: {primary: edgePrimaryViews, pdf: edgePdfViews}, numericCounts: [441, 462, 435, 957, 290],
    nativePageRawLimit: 0, primaryPolicySha256: digest(e.reports.primary.policy),
    claims: {primary: 'calibrated-derived-driver-with-explicit-dot-correction', pdf: 'separate-calibrated-derived-driver-and-native', nativePage: 'exact-independent-native-SVG-page', originalDriver: 'diagnostic-only', hostedExecution: 'unverified'},
    counts: {cases: 5, nativePaths: 99, paints: 90, clips: 2, nodes: 4, anchors: 64, namedCoordinates: 1, glyphs: 16,
      primaryViews: 60, originalDiagnosticViews: 12, pdfViewsPerRoute: 20, nativePages: 20, defects: 13,
      visiblePrimaryDefectViews: 134, invisiblePrimaryDefectViews: 16, primaryDefectViews: 150, pdfNativeDefectViews: 50, sourceRegions: 323},
    defects: edgeTrialDefects,
    cases: e.reports.primary.cases.map((p, i) => ({id: p.id, primaryFrameSha256: digest(p.frame), corrections: p.corrections,
      pdfCameraSha256: digest(e.reports.pdf.cases[i].camera), pdfRegionsSha256: digest(e.reports.pdf.cases[i].regions), pdfPoliciesSha256: digest(e.reports.pdf.cases[i].policies)})),
    guardToolHashes};
}
export function validateEdgeProfile(p, e) {
  assert.deepEqual(Object.keys(p.guardToolHashes).sort(), edgeGuardFiles(e));
  for (const h of Object.values(p.guardToolHashes)) assert.match(h, /^[a-f0-9]{64}$/);
  assert.deepEqual(p, makeEdgeProfile(e, p.guardToolHashes), 'Changed fixed straight-edge profile.');
}
export async function verifyEdgeGuards(profile, read = readFile) {
  for (const [p, h] of Object.entries(profile.guardToolHashes)) assert.equal(sha256(edgeCanonical(await read(path.join(root, p)))), h, 'Changed admission source: ' + p);
}
export async function loadEdgePolicy(read = readFile) {
  const e = await loadEdgeImageCache(read), profileBytes = edgeCanonical(await read(path.join(root, edgeProfileFile))), profile = JSON.parse(profileBytes);
  validateEdgeProfile(profile, e); await verifyEdgeGuards(profile, read);
  return {...e, profile, profileBytes, profileSha256: sha256(profileBytes)};
}
function rawRole(r, kind) {
  assert.deepEqual([r.schemaVersion, r.comparisonKind, r.completed, r.converterInvoked, r.approvedImagePolicy, r.imageConformanceClaim], [1, kind, true, true, false, false]);
}
export function validateEdgeCheckedTrial(e, cached, trial, checker, trialSha256, checkerSha256) {
  rawRole(cached, 'cached-public-edge-trial'); rawRole(trial, 'public-straight-edge-image-trial'); rawRole(checker, 'independent-public-edge-trial-check');
  assert.equal(cached.passed, true); assert.equal(cached.overallVerdict, 'pending'); assert.equal(trial.overallVerdict, 'pending');
  assert.equal(cached.cacheSha256, edgeImageCacheSha256); assert.equal(cached.decodedCacheSha256, edgeImageCacheDecodedSha256);
  assert.equal(trial.snapshotSha256, edgeSnapshotSha256);
  requireRenderer(trial.renderer, e.calibration.renderer); assert.deepEqual(checker.renderer, trial.renderer);
  assert.equal(cached.inputs.trial.sha256, trialSha256); assert.equal(cached.inputs.checker.sha256, checkerSha256);
  for (const role of ['trial', 'checker']) assert.deepEqual([cached.inputs[role].completed, cached.inputs[role].passed], [true, true]);
  assert.equal(checker.inputReportSha256, trialSha256);
  assert.deepEqual(checker.controls.map(c => c.name), checkerControls); assert.ok(checker.controls.every(c => c.passed === true));
  assert.deepEqual([checker.numericChecksVerified, checker.svgsReconstructed, checker.primaryMetricsRecomputed, checker.pdfMetricsRecomputed, checker.nativeMetricsRecomputed, checker.pagesRecomputed], [2585, 18, 14550, 6022, 4710, 90]);
  assert.deepEqual(trial.qualification.map(q => q.role), Object.keys(edgeImageCacheReports));
  assert.deepEqual(cached.inputs.qualifications.map(q => q.role), Object.keys(edgeImageCacheReports));
  for (const [i, role] of Object.keys(edgeImageCacheReports).entries()) {
    assert.equal(trial.qualification[i].sha256, edgeImageCacheReports[role].sha256);
    assert.equal(trial.qualification[i].copiedReport, 'qualification/' + role + '/report.json');
    assert.equal(cached.inputs.qualifications[i].sha256, edgeImageCacheReports[role].sha256);
    assert.deepEqual(cached.inputs.qualifications[i].original, edgeImageCacheReports[role]);
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
    assert.equal(c.originalDiagnostics.length, c.id === 'clipping' ? 12 : 0);
    if (c.id === 'clipping') assert.deepEqual(c.originalDiagnostics.map(edgePrimaryViewKey), edgePrimaryViews.map(edgePrimaryViewKey));
    assert.deepEqual(c.sources.map(s => s.regionId), p.frame.regions.map(r => r.id));
    for (const s of c.sources) assert.ok(/^candidate-[pg]\d+$/.test(s.svgElementId) && Number.isSafeInteger(s.source.offset) && s.source.offset >= 0 && Number.isSafeInteger(s.source.length) && s.source.length > 0 && s.text.length === s.source.length);
    sourceRegions += c.sources.length;
  }
  assert.equal(sourceRegions, 323); assert.match(trial.artifacts['index.html'], /^[a-f0-9]{64}$/);
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
  assert.deepEqual([r.schemaVersion, r.comparisonKind, r.completed, r.passed, r.converterInvoked], [1, 'cached-public-straight-edge-conformance', true, true, true]);
  assert.equal(r.policyId, edgePolicyId); assert.equal(r.policyScope, edgePolicyScope); assert.equal(r.profileSha256, e.profileSha256); assert.equal(r.cacheSha256, edgeImageCacheSha256);
  requireRenderer(r.renderer, e.calibration.renderer); assert.equal(r.artifacts['profile.json'], e.profileSha256);
  for (const [role, child] of Object.entries({cached, trial, checker})) {
    assert.equal(r.inputs[role].report, role + '/report.json'); assert.equal(r.artifacts[r.inputs[role].report], r.inputs[role].sha256);
    assert.match(r.inputs[role].sourceFile, new RegExp('^artifacts/edge-' + ({cached: 'cached-trial', trial: 'public-trial', checker: 'public-checks'})[role] + '/run-[a-f0-9-]+/report\\.json$'));
    for (const [p, h] of Object.entries(child.artifacts)) assert.equal(r.artifacts[role + '/' + p], h);
  }
  assert.equal(r.inputs.trial.sourceFile, cached.inputs.trial.report); assert.equal(r.inputs.checker.sourceFile, cached.inputs.checker.report);
  const combined = validateEdgeCheckedTrial(e, cached, trial, checker, r.inputs.trial.sha256, r.inputs.checker.sha256);
  assert.deepEqual(r.combined, finishEdgeAdmission(e, combined)); assert.deepEqual([r.approvedImagePolicy, r.imageConformanceClaim, r.overallVerdict], [true, true, 'pass']);
  assert.deepEqual(r.agent, {viewer: 'index.html', trialViewer: 'trial/index.html', firstFailedGate: null, command: 'node tools/TikzVisual/compare-edge-conformance.mjs'});
  assert.deepEqual(r.sourceHashes, e.profile.guardToolHashes);
  for (const [p, h] of Object.entries(r.sourceHashes)) assert.equal(r.artifacts['source-captures/' + p], h);
}
