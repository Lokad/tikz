// Admission controls inspect policy/proof bindings; the owned checker measures pixels.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root, sha256, outputPath, writeArtifact} from './shape-oracle-bundle.mjs';
import {edgeCanonical} from './curved-edge-log.mjs';
import {edgeAgentImages,edgeAgentViewer} from './curved-edge-agent-viewer.mjs';
import {loadEdgePolicy, decodeEdgeProfile, validateEdgeProfile, verifyEdgeGuards, edgeGateCounts, finishEdgeAdmission, validateEdgeAdmissionReport, validateEdgeAdmissionViewer} from './curved-edge-admission-policy.mjs';

assert.ok(process.argv.length === 2 || (process.argv.length === 4 && process.argv[2] === '--report'));
const e = await loadEdgePolicy(), controls = [];
const reject = (name, action) => {assert.throws(action, undefined, name); controls.push({name, expected: 'reject', passed: true});};
const mutateProfile = (name, change) => reject('profile/' + name, () => {const p = structuredClone(e.profile); change(p); validateEdgeProfile(p, e);});
reject('externally pinned profile rejects changed bytes',()=>decodeEdgeProfile(Buffer.concat([e.profileBytes,Buffer.from(' ')])));
reject('externally pinned profile rejects rehashed replacement guard',()=>{const p=structuredClone(e.profile);p.guardToolHashes[Object.keys(p.guardToolHashes)[0]]='0'.repeat(64);decodeEdgeProfile(Buffer.from(JSON.stringify(p,null,2)+'\n'));});
for (const [name, change] of Object.entries({id: p => p.id = 'other-family', scope: p => p.scope = 'All TikZ', approval: p => p.approvedImagePolicy = false,
  cache: p => p.calibration.sha256 = '0'.repeat(64), decoded: p => p.calibration.decodedSha256 = '0'.repeat(64), snapshot: p => p.calibration.snapshotSha256 = '0'.repeat(64),
  nativeAllowance: p => p.nativePageRawLimit = 1, nativeClaim: p => p.claims.nativePage = 'ordinary-PDF-pixel-identity', originalClaim: p => p.claims.originalDriver = 'exact',
  hostedClaim: p => p.claims.hostedExecution = 'verified', renderer: p => p.renderer.osRelease = 'unqualified', gate: p => p.requiredGates.pop(),
  primaryView: p => p.requiredViews.primary.pop(), pdfView: p => p.requiredViews.pdf.pop(), primaryPolicy: p => p.primaryPolicySha256 = '0'.repeat(64),
  missingCase: p => p.cases.pop(), inventedCorrection: p => p.cases[4].corrections = ['invented'], primaryFrame: p => p.cases[0].primaryFrameSha256 = '0'.repeat(64),
  pdfCamera: p => p.cases[0].pdfCameraSha256 = '0'.repeat(64), pdfRegions: p => p.cases[0].pdfRegionsSha256 = '0'.repeat(64), pdfPolicy: p => p.cases[0].pdfPoliciesSha256 = '0'.repeat(64),
  missingDefect: p => p.defects.pop(), missingGuard: p => delete p.guardToolHashes[Object.keys(p.guardToolHashes)[0]], extraGuard: p => p.guardToolHashes['tools/unknown.mjs'] = '0'.repeat(64)})) mutateProfile(name, change);
for (const key of Object.keys(e.profile.counts)) mutateProfile('count/' + key, p => p.counts[key]--);
for (const key of Object.keys(e.profile.qualification)) mutateProfile('qualification/' + key, p => p.qualification[key] = '0'.repeat(64));
for (const [gate, count] of Object.entries(edgeGateCounts)) {
  mutateProfile('executedChecks/' + gate, p => p.executedChecks[gate]--);
  const gates = Object.fromEntries(Object.entries(edgeGateCounts).map(([k, n]) => [k, {state: 'passed', executedChecks: n}]));
  gates[gate].state = 'failed'; const admitted = finishEdgeAdmission(e, {passed: false, gates});
  assert.deepEqual([admitted.passed, admitted.imageConformanceClaim, admitted.overallVerdict, admitted.firstFailedGate], [false, false, 'fail', gate]);
  controls.push({name: 'failed gate cannot be masked/' + gate, expected: 'fail', passed: true});
  reject('missing gate/' + gate, () => {delete gates[gate]; finishEdgeAdmission(e, {passed: true, gates});});
  reject('missing executed checks/' + gate, () => {gates[gate] = {state: 'passed', executedChecks: count - 1}; finishEdgeAdmission(e, {passed: true, gates});});
}
const sources = new Map(); for (const p of Object.keys(e.profile.guardToolHashes)) sources.set(path.join(root, p), await readFile(path.join(root, p)));
const first = sources.keys().next().value;
await assert.rejects(verifyEdgeGuards(e.profile, p => p === first ? Promise.resolve(Buffer.from('changed')) : Promise.resolve(sources.get(p))));
controls.push({name: 'changed guard source before conversion', expected: 'reject', passed: true});
const rehashed = structuredClone(e.profile); rehashed.guardToolHashes[path.relative(root, first).split(path.sep).join('/')] = sha256('changed');
await assert.rejects(verifyEdgeGuards(rehashed, p => Promise.resolve(sources.get(p))));
controls.push({name: 'consistently rehashed source replacement', expected: 'reject', passed: true});
let inputReportSha256 = null, savedArtifacts = 0;
if (process.argv.length === 4) {
  assert.match(process.argv[3], /^artifacts\/curved-edge-conformance\/run-[a-f0-9-]+\/report\.json$/);
  const folder = path.dirname(path.join(root, process.argv[3])), read = async p => readFile(await outputPath(folder, p));
  const bytes = await read('report.json'), r = JSON.parse(bytes); inputReportSha256 = sha256(bytes);
  for (const [p, h] of Object.entries(r.artifacts)) {assert.equal(sha256(await read(p)), h); savedArtifacts++;}
  const children = {};
  for (const role of ['cached', 'trial', 'checker']) {const b = await read(role + '/report.json'); assert.equal(sha256(b), r.inputs[role].sha256); children[role] = JSON.parse(b);}
  const {cached, trial, checker} = children;
  const validate = (a = r, b = cached, c = trial, d = checker) => validateEdgeAdmissionReport(a, e, b, c, d);
  validate(); const html = (await read('index.html')).toString('utf8'); validateEdgeAdmissionViewer(html, r.artifacts);
  const imageData=await edgeAgentImages(r.agent,r.artifacts,read);
  const expectedViewerSha256=sha256(edgeAgentViewer(r.agent,r.policyScope,imageData));
  const validateSavedViewer=h=>assert.equal(sha256(h),expectedViewerSha256,'Changed complete viewer payload.');validateSavedViewer(html);
  reject('changed embedded viewer evidence',()=>validateSavedViewer(html.replace('RGB/alpha difference','concealed difference')));
  const finalMarkers = (await read('cached-command.log')).toString('utf8').split(/\r?\n/).filter(s => s.startsWith('{')).map(s => JSON.parse(s)).filter(m => m.kind === 'curved-edge-cached-trial' && m.final === true);
  assert.equal(finalMarkers.length, 1); assert.equal(finalMarkers[0].report, r.inputs.cached.sourceFile); assert.equal(finalMarkers[0].sha256, r.inputs.cached.sha256);
  assert.deepEqual([finalMarkers[0].completed, finalMarkers[0].passed], [true, true]);
  const numeric = JSON.parse(await read('trial/numeric/report.json'));
  for (const [p, h] of Object.entries({...numeric.converterSources, ...numeric.toolHashes})) assert.equal(sha256(edgeCanonical(await readFile(path.join(root, p)))), h);
  controls.push({name: 'owned proof, copied artifacts, process marker and source identities', expected: 'pass', passed: true});
  for (const [name, change] of Object.entries({scope: a => a.policyScope = 'All TikZ', policy: a => a.profileSha256 = '0'.repeat(64),
    admission: a => a.approvedImagePolicy = false, claim: a => a.imageConformanceClaim = false, viewer: a => a.agent.viewer = 'missing.html',
    acceptancePin:a=>a.acceptancePinSha256='0'.repeat(64),missingPin:a=>delete a.artifacts['acceptance-pin.mjs'],
    rankedCoverage:a=>a.agent.rankedRegions.pop(),rankedOrder:a=>a.agent.rankedRegions.reverse(),
    cropRectangle:a=>a.agent.rankedRegions[0].rectangle.x++,referenceRoute:a=>a.agent.rankedRegions[0].referenceRoute='candidate-derived',
    imagePair:a=>a.agent.rankedRegions[0].images.reference=a.agent.rankedRegions[0].images.actual,
    attribution:a=>a.agent.rankedRegions[0].source.source.offset++,
    trialBinding: a => a.inputs.trial.sha256 = '0'.repeat(64), checkerBinding: a => a.inputs.checker.sha256 = '0'.repeat(64),
    trialSource: a => a.inputs.trial.sourceFile = 'artifacts/curved-edge-public-trial/run-00000000-0000-0000-0000-000000000000/report.json',
    missingCopiedImage: a => delete a.artifacts['trial/' + trial.cases[0].primary[0].images.actual]})) reject('admission/' + name, () => {const a = structuredClone(r); change(a); validate(a);});
  for (const [name, change] of Object.entries({role: c => c.approvedImagePolicy = true, missingCase: c => c.cases.pop(),
    missingPrimary: c => c.cases[0].primary.pop(), missingPdf: c => c.cases[0].candidatePdf.pop(), missingNativePage: c => c.cases[0].nativePages.pop(),
    inventedCorrection: c => c.cases[4].corrections = ['invented'], inventedDiagnostic: c => c.cases[4].originalDiagnostics.push(c.cases[4].primary[0]),
    missingSource: c => c.cases[0].sources.pop(), missingDefect: c => c.defects.pop(), numericMask: c => c.defects[0].numericGatesBypassed = false,
    changedVisibility: c => c.defects[0].primary[0].observedVisible = !c.defects[0].primary[0].observedVisible,
    weakenedNativeZero: c => c.cases[0].nativePages[0].measurement.fullPage.rawChangedPixels = 1})) reject('trial/' + name, () => {const c = structuredClone(trial); change(c); validate(r, cached, c);});
  for (const [name, change] of Object.entries({wrongTrial: d => d.inputReportSha256 = '0'.repeat(64), missingControl: d => d.controls.pop(),
    failedControl: d => d.controls[0].passed = false, missingMetrics: d => d.primaryMetricsRecomputed--, wrongRenderer: d => d.renderer.osRelease = 'unqualified'})) reject('checker/' + name, () => {const d = structuredClone(checker); change(d); validate(r, cached, trial, d);});
  reject('missing viewer image', () => validateEdgeAdmissionViewer(html.replace('href="profile.json"', 'href="missing-profile.json"'), r.artifacts));
  reject('viewer escaping bundle', () => validateEdgeAdmissionViewer(html.replace('href="profile.json"', 'href="../profile.json"'), r.artifacts));
}
await verifyEdgeGuards(e.profile);
const output = path.join(root, 'artifacts/curved-edge-admission-controls/run-' + randomUUID());
const report = {schemaVersion: 1, comparisonKind: 'curved-edge-admission-controls', completed: true, converterInvoked: false,
  approvedImagePolicy: false, imageConformanceClaim: false, profileSha256: e.profileSha256, inputReportSha256, savedArtifacts, controls};
const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n'); await writeArtifact(output, 'report.json', bytes);
console.log(JSON.stringify({kind: 'curved-edge-admission-controls', completed: true, controls: controls.length, savedArtifacts,
  report: path.relative(root, path.join(output, 'report.json')).split(path.sep).join('/'), sha256: sha256(bytes)}));
