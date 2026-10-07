// Frozen native evidence. Loading never invokes a converter or reference tool.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {root, sha256} from './shape-oracle-bundle.mjs';
import {decodeArrowCache, arrowCacheBounds} from './arrow-image-cache-codec.mjs';
import {arrowImageCacheFile, arrowImageCacheSha256, arrowImageCacheDecodedSha256, arrowImageCacheReports} from './arrow-image-cache-pin.mjs';
import {loadArrowEvidence} from './arrow-evidence.mjs';
import {arrowSnapshotSha256} from './arrow-reference-pin.mjs';
import {arrowCanonical, arrowPdfRegions} from './arrow-native-contract.mjs';
import {buildArrowNativeFrame} from './arrow-native-frame.mjs';
import {arrowSourceEnvelope} from './arrow-source-envelope.mjs';
import {arrowViewportFrameCheck} from './arrow-viewport-model.mjs';
import {arrowSourcePrimaryContract} from './arrow-source-primary-reference.mjs';
import {arrowSourcePrimaryPlan, buildArrowSourcePrimaryExperiment} from './arrow-source-primary-contract.mjs';
import {arrowSourcePdfSources} from './arrow-source-pdf-contract.mjs';
import {arrowSourcePdfContract, arrowSourcePdfPlan, buildArrowSourcePdfExperiment, arrowSourcePdfPolicyIndex, arrowSourcePdfVisibilityIndex} from './arrow-source-pdf-model.mjs';

export {arrowImageCacheFile, arrowImageCacheSha256, arrowImageCacheDecodedSha256, arrowImageCacheReports};
export const arrowImageCacheCompressedBound = 96000000;
const kinds = {primary: 'native-arrow-standalone-source-primary-observations', primaryCheck: 'independent-native-arrow-source-primary-check',
  pdf: 'native-arrow-conservative-source-PDF-observations', pdfCheck: 'independent-native-arrow-source-PDF-check'};

export function arrowImageCacheMetadata(reports) {
  return {schemaVersion: 1, comparisonKind: 'portable-native-arrow-source-evidence', completed: true,
    converterInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false, publicAdmission: 'pending',
    snapshotSha256: arrowSnapshotSha256, sourceReports: arrowImageCacheReports, reports};
}

// This validation also serves preparation and corruption controls before pinning.
export function validateArrowImageCache(cache) {
  const h = cache.header;
  assert.deepEqual(Object.keys(h), [...Object.keys(arrowImageCacheMetadata({})), 'assets', 'blobs']);
  assert.deepEqual({...h, reports: {}, assets: undefined, blobs: undefined}, {...arrowImageCacheMetadata({}), assets: undefined, blobs: undefined});
  assert.deepEqual(Object.keys(h.reports), Object.keys(arrowImageCacheReports));
  const reports = {};
  for (const [role, pin] of Object.entries(arrowImageCacheReports)) {
    const text = h.reports[role]; assert.equal(typeof text, 'string'); assert.ok(Buffer.byteLength(text) < 100000);
    assert.equal(sha256(text), pin.sha256, 'Changed checked native report: ' + role);
    const r = reports[role] = JSON.parse(text);
    assert.deepEqual([r.schemaVersion, r.completed, r.converterInvoked, r.approvedImagePolicy, r.imageConformanceClaim], [1, true, false, false, false]);
    assert.equal(r.comparisonKind, kinds[role]); assert.equal(r.snapshotSha256, arrowSnapshotSha256);
    assert.deepEqual(r.renderer, reports.primary.renderer);
  }
  for (const role of ['primary', 'pdf']) {
    const r = reports[role], c = reports[role + 'Check'];
    assert.equal(r.imageAdmission, 'pending'); assert.equal(c.imageAdmission, 'pending');
    assert.equal(c.inputReport, arrowImageCacheReports[role].path); assert.equal(c.inputReportSha256, arrowImageCacheReports[role].sha256);
    assert.deepEqual(c.sourceHashes, r.sourceHashes); assert.deepEqual(c.summary, r.summary);
    assert.ok(c.controls.every(q => q.passed === true));
    assert.equal(new Set(c.controls.map(q => q.name)).size, c.controls.length);
  }
  assert.deepEqual(reports.primary.contract, arrowSourcePrimaryContract); assert.deepEqual(reports.pdf.contract, arrowSourcePdfContract);
  assert.deepEqual([reports.primaryCheck.measurements, reports.primaryCheck.deltaChecks, reports.primaryCheck.panels, reports.primaryCheck.controls.length], [39834, 210, 2445, 89]);
  assert.deepEqual([reports.pdfCheck.measurements, reports.pdfCheck.momentRegions, reports.pdfCheck.fullPageMeasurements, reports.pdfCheck.deltaChecks,
    reports.pdfCheck.panels, reports.pdfCheck.focusPanels, reports.pdfCheck.controls.length], [100908, 100908, 792, 568, 6436, 2080, 130]);
  assert.equal(reports.pdf.inputs.producerSha256, arrowImageCacheReports.primary.sha256);
  assert.equal(reports.pdf.inputs.checkerSha256, arrowImageCacheReports.primaryCheck.sha256);
  assert.equal(reports.pdf.inputs.producer, arrowImageCacheReports.primary.path); assert.equal(reports.pdf.inputs.checker, arrowImageCacheReports.primaryCheck.path);
  const manifestBytes = cache.get('manifest.json'); assert.equal(sha256(manifestBytes), reports.pdf.manifest.sha256);
  assert.equal(reports.pdf.manifest.file, 'manifest.json');
  const manifest = JSON.parse(manifestBytes);
  assert.equal(Object.keys(manifest.artifacts).length, 19004); assert.equal(reports.pdf.manifest.files, 19004);
  const expectedAssets = {...manifest.artifacts, 'manifest.json': sha256(manifestBytes)};
  assert.deepEqual(h.assets, Object.fromEntries(Object.entries(expectedAssets).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)), 'Lost or substituted native artifact.');
  const primaryManifestBytes = cache.get('upstream/primary/manifest.json');
  assert.equal(sha256(primaryManifestBytes), reports.primary.manifest.sha256);
  const primaryManifest = JSON.parse(primaryManifestBytes);
  assert.equal(Object.keys(primaryManifest.artifacts).length, 9256); assert.equal(reports.primary.manifest.files, 9256);
  assert.ok(cache.get('upstream/primary/report.json').equals(Buffer.from(h.reports.primary)));
  assert.ok(cache.get('upstream/primary-check/report.json').equals(Buffer.from(h.reports.primaryCheck)));
  for (const [p, hash] of Object.entries(primaryManifest.artifacts)) assert.equal(h.assets['upstream/primary/' + p], hash);
  assert.equal(Object.keys(reports.pdf.sourceHashes).length, 83);
  for (const [p, hash] of Object.entries(reports.pdf.sourceHashes)) assert.equal(h.assets['source-captures/' + p], hash);
  for (const [p, hash] of Object.entries(reports.primary.sourceHashes)) assert.equal(reports.pdf.sourceHashes[p], hash);
  return {reports, manifest, primaryManifest};
}

export function decodeArrowImageCache(compressed) {
  assert.ok(Buffer.isBuffer(compressed) && compressed.length > 0 && compressed.length <= arrowImageCacheCompressedBound);
  assert.equal(sha256(compressed), arrowImageCacheSha256, 'Unreviewed native arrow cache.');
  const bytes = gunzipSync(compressed, {maxOutputLength: arrowCacheBounds.decoded});
  assert.equal(sha256(bytes), arrowImageCacheDecodedSha256);
  return {...decodeArrowCache(bytes), compressed};
}

function cachedModels(cache, verified, native) {
  const json = p => JSON.parse(cache.get(p));
  const frames = native.cases.map(c => {
    const f = buildArrowNativeFrame(c.id, native.artifacts.get(c.id + '/plain-reference.svg').toString(), c.metrics);
    f.paper = arrowPdfRegions(c.metrics, f);
    const framing = json('cases/' + c.id + '/framing.json');
    assert.deepEqual(framing.envelope, arrowSourceEnvelope(c.metrics, f));
    assert.deepEqual(json('cases/' + c.id + '/paper.json'), f.paper);
    return {...f, sourceEnvelope: framing.envelope};
  });
  const primaryRecords = arrowSourcePrimaryPlan().map(view => {
    const prefix = 'upstream/primary/views/' + view.id, meta = json(prefix + '/record.json'), numbers = json(prefix + '/numbers.json');
    assert.deepEqual(meta.view, view); assert.deepEqual(numbers.view, view);
    assert.deepEqual(meta.sourceFrame, arrowViewportFrameCheck(numbers.naturalFrames.actual, frames.find(f => f.caseId === view.caseId).sourceEnvelope.root));
    return {...meta, numbers};
  });
  const primary = buildArrowSourcePrimaryExperiment(primaryRecords);
  assert.deepEqual(json('upstream/primary/policies.json'), {policies: primary.policies, visibility: primary.visibility});
  assert.deepEqual(primary.summary, verified.reports.primary.summary);
  for (const e of primary.evaluations) assert.deepEqual(json('upstream/primary/views/' + e.view.id + '/gates.json'), e);
  const pdfRecords = arrowSourcePdfPlan().map(view => {
    const meta = json('views/' + view.id + '/record.json'); assert.deepEqual(meta.view, view);
    const f = frames.find(f => f.caseId === view.caseId);
    assert.deepEqual(meta.sourceFrame, arrowViewportFrameCheck(meta.normalization.sourceFrame, f.sourceEnvelope.root));
    return {...meta, source: json(meta.files.source.numbers), scene: json(meta.files.scene.numbers)};
  });
  const pdf = buildArrowSourcePdfExperiment(pdfRecords, frames), index = arrowSourcePdfPolicyIndex(pdf.policies);
  assert.deepEqual(json('baseline-policies.json'), index);
  for (const [i, policy] of pdf.policies.entries()) assert.deepEqual(json(index[i].file), policy);
  for (const policy of pdf.visibility) assert.deepEqual(json('visibility/' + policy.name + '/' + policy.raster + '/policy.json'), policy);
  assert.deepEqual(json('policies.json'), {policies: index, visibility: arrowSourcePdfVisibilityIndex(pdf.visibility)});
  assert.deepEqual(pdf.summary, verified.reports.pdf.summary); assert.deepEqual(pdf.eligibility, verified.reports.pdf.eligibility);
  assert.deepEqual(pdf.eligibility, verified.reports.pdfCheck.eligibility);
  for (const e of pdf.evaluations) assert.deepEqual(json('views/' + e.view.id + '/gates.json'), e);
  return {frames, primary, pdf};
}

export async function loadArrowImageCache(read = readFile) {
  const cache = decodeArrowImageCache(await read(path.join(root, arrowImageCacheFile))), verified = validateArrowImageCache(cache);
  const sources = await arrowSourcePdfSources();
  assert.deepEqual(Object.fromEntries([...sources].map(([p, s]) => [p, s.sha256])), verified.reports.pdf.sourceHashes);
  for (const [p, s] of sources) assert.equal(sha256(arrowCanonical(await read(path.join(root, p)))), s.sha256, 'Changed native qualification source: ' + p);
  const native = await loadArrowEvidence(), models = cachedModels(cache, verified, native);
  return {...cache, ...verified, ...models, native, sourceHashes: verified.reports.pdf.sourceHashes,
    getRole(role, p) {
      assert.ok(Object.hasOwn(arrowImageCacheReports, role));
      if (p === 'report.json') return Buffer.from(cache.header.reports[role]);
      assert.ok(role === 'pdf' || role === 'primary');
      return cache.get(role === 'pdf' ? p : 'upstream/primary/' + p);
    }};
}
