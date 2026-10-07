// Portable qualified native inputs; loading never invokes a converter or renderer.
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {root, sha256} from './shape-oracle-bundle.mjs';
import {arrowCacheBounds} from './arrow-image-cache-codec.mjs';
import {arrowMeetCacheBounds, decodeArrowMeetArchive} from './arrow-meet-image-cache-codec.mjs';
import {arrowImageCacheSha256, arrowImageCacheDecodedSha256, loadArrowImageCache} from './arrow-image-cache.mjs';
import {assertNativeEqual, loadArrowMeetPdfOwned} from './arrow-meet-pdf-contract.mjs';
import {buildArrowMeetModel} from './arrow-meet-source-contract.mjs';
import {arrowSourcePrimaryPlan} from './arrow-source-primary-contract.mjs';
import {arrowSourcePdfPlan, buildArrowSourcePdfExperiment} from './arrow-source-pdf-model.mjs';
import {arrowMeetImageCacheFile, arrowMeetImageCacheSha256, arrowMeetImageCacheDecodedSha256,
  arrowMeetQualification, arrowMeetManifestSha256, arrowMeetImageCacheReports} from './arrow-meet-image-cache-pin.mjs';

export {arrowMeetImageCacheFile, arrowMeetImageCacheSha256, arrowMeetImageCacheDecodedSha256, arrowMeetImageCacheReports};
export const arrowMeetPdfControlNames = ['false public admission', 'false policy approval', 'lost primary source gate',
  'changed root contract', 'lost pending gate', 'wrong native PDF identity', 'lost view', 'changed fixed policy',
  'rehashed source SVG substitution', 'rehashed source PNG substitution', 'rehashed camera substitution',
  'rehashed integer moment substitution', 'forged bound primary checker', 'fully rehashed bound primary image substitution'];
const sort = entries => [...entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
const primaryCounts = {views: 306, measurements: 39834, images: 3057, deltas: 210};
const pdfCounts = r => [r.views, r.measurements, r.moments, r.fullPageMeasurements, r.recapturedImages, r.deltaChecks];

export function arrowMeetImageCacheMetadata() {
  return {schemaVersion: 1, comparisonKind: 'portable-native-arrow-meet-combined-evidence', completed: true,
    converterInvoked: false, nativeToolInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false, imageAdmission: 'pending',
    qualification: arrowMeetQualification, baseCache: {sha256: arrowImageCacheSha256, decodedSha256: arrowImageCacheDecodedSha256},
    reports: arrowMeetImageCacheReports, pendingGates: ['public-image-only-controls', 'public-combined-admission']};
}

export function validateArrowMeetImageArchive(cache) {
  const {chunkBytes, logicalAssets, logicalBlobs, assets, blobs, ...metadata} = cache.header;
  assertNativeEqual(metadata, arrowMeetImageCacheMetadata(), 'Changed native meet cache identity.');
  assert.equal(chunkBytes, arrowMeetCacheBounds.chunk);
  const reports = {};
  for (const [role, pin] of Object.entries(arrowMeetImageCacheReports)) {
    const bytes = cache.get(pin.file); assert.ok(bytes.length < 100000); assert.equal(sha256(bytes), pin.sha256, 'Changed qualified report: ' + role);
    reports[role] = JSON.parse(bytes); assert.equal(reports[role].completed, true);
  }
  const {pdf, pdfCheck, freshPdfCheck, freshReplay, postcommit} = reports;
  const manifestBytes = cache.get('manifest.json'); assert.equal(sha256(manifestBytes), arrowMeetManifestSha256);
  const manifest = JSON.parse(manifestBytes); assert.equal(manifest.schemaVersion, 1);
  assert.equal(pdf.manifest.sha256, arrowMeetManifestSha256); assert.equal(pdf.manifest.files, 12319);
  assert.equal(Object.keys(manifest.artifacts).length, 12319);
  const expected = {...manifest.artifacts, 'manifest.json': arrowMeetManifestSha256, 'report.json': arrowMeetImageCacheReports.pdf.sha256};
  for (const pin of Object.values(arrowMeetImageCacheReports)) expected[pin.file] = pin.sha256;
  assertNativeEqual(logicalAssets, Object.fromEntries(sort(Object.entries(expected))), 'Lost or substituted combined native artifact.');
  assert.equal(cache.files.size, 12325);
  assertNativeEqual(pdf.inputs, {producer: arrowMeetImageCacheReports.primary.origin, checker: arrowMeetImageCacheReports.primaryCheck.origin,
    producerSha256: arrowMeetImageCacheReports.primary.sha256, checkerSha256: arrowMeetImageCacheReports.primaryCheck.sha256});
  assert.equal(Object.keys(pdf.sourceHashes).length, 93);
  for (const [name, hash] of Object.entries(pdf.sourceHashes)) assert.equal(sha256(cache.get('source-captures/' + name)), hash);
  for (const c of [pdfCheck, freshPdfCheck]) {
    assertNativeEqual([c.schemaVersion, c.phase, c.comparisonKind], [1, 'complete', 'independent-native-arrow-meet-PDF-check']);
    assertNativeEqual([c.converterInvoked, c.nativeToolInvoked, c.approvedImagePolicy, c.imageConformanceClaim, c.imageAdmission], [false, false, false, false, 'pending']);
    assert.equal(c.inputReportSha256, arrowMeetImageCacheReports.pdf.sha256);
    assertNativeEqual(c.inputs, pdf.inputs); assertNativeEqual(c.sourceHashes, pdf.sourceHashes); assertNativeEqual(c.renderer, pdf.renderer);
    assertNativeEqual(c.summary, pdf.summary); assertNativeEqual(c.eligibility, pdf.eligibility);
    assertNativeEqual(c.primary, primaryCounts); assertNativeEqual(pdfCounts(c), [396, 100908, 100908, 792, 5148, 568]);
    assert.equal(c.sourceSceneCaptures, 792); assertNativeEqual(c.controls.map(q => q.name), arrowMeetPdfControlNames);
    assert.ok(c.controls.every(q => q.passed === true && typeof q.rejection === 'string' && q.rejection.length <= 500));
    assertNativeEqual(c.pendingGates, ['immutable-combined-meet-inputs', 'public-image-only-controls', 'public-combined-admission']);
  }
  assert.equal(pdfCheck.inputReport, arrowMeetImageCacheReports.pdf.origin);
  assert.equal(freshPdfCheck.inputReport, freshReplay.freshProducer.report);
  const {inputReport: a, ...rootAudit} = pdfCheck, {inputReport: b, ...freshAudit} = freshPdfCheck; assertNativeEqual(freshAudit, rootAudit);
  assert.equal(freshReplay.phase, 'complete'); assert.equal(freshReplay.expectedTree, arrowMeetQualification.tree);
  assert.equal(freshReplay.originalProducer, arrowMeetImageCacheReports.pdf.origin); assert.equal(freshReplay.originalReader, arrowMeetImageCacheReports.pdfCheck.origin);
  assertNativeEqual([freshReplay.trackedFiles, freshReplay.ordinaryTests, freshReplay.equalArtifacts, freshReplay.equalPngs, freshReplay.equalArtifactBytes], [1445, 389, 12319, 8217, 596960324]);
  assertNativeEqual(freshReplay.excludedBeforeRestore, ['PLAN.md', 'artifacts', 'external', 'tools/TikzVisual/node_modules']);
  assertNativeEqual(freshReplay.nativeExecutablesAbsent, ['latex', 'pdflatex', 'lualatex', 'xelatex', 'dvisvgm', 'dvitype', 'pdftoppm', 'pdftocairo']);
  assert.equal(freshReplay.freshProducer.sha256, arrowMeetImageCacheReports.pdf.sha256);
  assertNativeEqual(freshReplay.freshReader, {report: arrowMeetImageCacheReports.freshPdfCheck.origin, sha256: arrowMeetImageCacheReports.freshPdfCheck.sha256});
  assertNativeEqual(freshReplay.primary, primaryCounts); assertNativeEqual(pdfCounts(freshReplay), pdfCounts(pdfCheck)); assertNativeEqual(freshReplay.controls, pdfCheck.controls);
  assertNativeEqual([postcommit.commit, postcommit.tree, postcommit.trackedWorktreeClean, postcommit.planIgnoredAndUntracked],
    [arrowMeetQualification.commit, arrowMeetQualification.tree, true, true]);
  assertNativeEqual([postcommit.sourceGuards, postcommit.assets, postcommit.cacheSha256], [93, 12319, arrowImageCacheSha256]);
  assertNativeEqual(postcommit.producer, {report: arrowMeetImageCacheReports.pdf.origin, sha256: arrowMeetImageCacheReports.pdf.sha256});
  assertNativeEqual(postcommit.checker, {completed: true, phase: 'complete', report: arrowMeetImageCacheReports.pdfCheck.origin, sha256: arrowMeetImageCacheReports.pdfCheck.sha256});
  assertNativeEqual(postcommit.fresh, {completed: true, receipt: arrowMeetImageCacheReports.freshReplay.origin, sha256: arrowMeetImageCacheReports.freshReplay.sha256});
  assertNativeEqual(postcommit.primary, primaryCounts); assertNativeEqual(postcommit.controls, pdfCheck.controls);
  assertNativeEqual([postcommit.approvedImagePolicy, postcommit.imageConformanceClaim, postcommit.imageAdmission], [false, false, 'pending']);
  return {reports, manifest};
}

export function decodeArrowMeetImageCache(compressed) {
  assert.ok(Buffer.isBuffer(compressed) && compressed.length > 0 && compressed.length <= arrowMeetCacheBounds.compressed);
  assert.equal(sha256(compressed), arrowMeetImageCacheSha256, 'Changed pinned native meet archive.');
  const bytes = gunzipSync(compressed, {maxOutputLength: arrowCacheBounds.decoded}); assert.equal(sha256(bytes), arrowMeetImageCacheDecodedSha256);
  const cache = decodeArrowMeetArchive(bytes); return {...cache, ...validateArrowMeetImageArchive(cache), compressed};
}

export async function loadArrowMeetImageCache(read = readFile) {
  const file = path.join(root, arrowMeetImageCacheFile);
  if (read === readFile) assert.ok((await stat(file)).size <= arrowMeetCacheBounds.compressed);
  const cache = decodeArrowMeetImageCache(await read(file)), base = await loadArrowImageCache(read);
  const owned = await loadArrowMeetPdfOwned(arrowMeetImageCacheReports.pdf.origin, base, name => cache.get(name));
  assert.equal(owned.sha256, arrowMeetImageCacheReports.pdf.sha256);
  const primaryRecords = arrowSourcePrimaryPlan().map(view => ({...JSON.parse(owned.input.primary.files.get('views/' + view.id + '/record.json')),
    numbers: JSON.parse(owned.input.primary.files.get('views/' + view.id + '/numbers.json'))}));
  const primary = buildArrowMeetModel(primaryRecords); assertNativeEqual(primary.summary, cache.reports.primary.summary);
  assertNativeEqual(JSON.parse(owned.input.primary.files.get('policies.json')), {policies: primary.policies, visibility: primary.visibility});
  for (const row of primary.evaluations) assertNativeEqual(JSON.parse(owned.input.primary.files.get('views/' + row.view.id + '/gates.json')), row);
  const pdfRecords = arrowSourcePdfPlan().map(view => {
    const meta = JSON.parse(owned.files.get('views/' + view.id + '/record.json'));
    return {...meta, source: JSON.parse(owned.files.get(meta.files.source.numbers)), scene: JSON.parse(owned.files.get(meta.files.scene.numbers))};
  });
  const pdf = buildArrowSourcePdfExperiment(pdfRecords, base.frames); assertNativeEqual(pdf, base.pdf);
  assertNativeEqual(JSON.parse(owned.files.get('policies.json')), {policies: pdf.policies, visibility: pdf.visibility});
  for (const row of pdf.evaluations) assertNativeEqual(JSON.parse(owned.files.get('views/' + row.view.id + '/gates.json')), row);
  return {...cache, base, owned, native: base.native, frames: base.frames, primary, primaryRecords, pdf, pdfRecords, sourceHashes: owned.report.sourceHashes,
    getRole(role, name) {
      assert.ok(Object.hasOwn(arrowMeetImageCacheReports, role));
      if (name === 'report.json') return cache.get(arrowMeetImageCacheReports[role].file);
      assert.ok(role === 'primary' || role === 'pdf'); return cache.get(role === 'primary' ? 'upstream/primary/' + name : name);
    }};
}
