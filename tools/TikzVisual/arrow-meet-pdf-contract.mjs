import {requireRenderer} from './shape-primary-trial-policy.mjs';
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import path from 'node:path';
import {root, sha256, outputPath} from './shape-oracle-bundle.mjs';
import {arrowCanonical} from './arrow-native-contract.mjs';
import {arrowQualifiedSources} from './arrow-qualified-sources.mjs';
import {arrowAgentPath} from './arrow-agent-evidence.mjs';
import {arrowMeetSources, loadArrowMeetOwned, rewriteArrowMeetRoot} from './arrow-meet-source-contract.mjs';
import {arrowImageCacheSha256} from './arrow-image-cache.mjs';
import {arrowSourcePdfPlan, arrowSourcePdfInputs} from './arrow-source-pdf-model.mjs';
import {arrowViewportRegions} from './arrow-viewport-model.mjs';
import {measureShapePdfPair} from './shape-pdf-image-pair.mjs';
import {measureEdgePdfPair} from './edge-pdf-image-pair.mjs';
import {measureArrowPdfInk, attachArrowPdfInk} from './arrow-pdf-ink.mjs';

// Failed controls can compare 30 MB of policy data. Avoid assertion diff
// formatting, which can consume more memory than the image experiments.
export function assertNativeEqual(actual, expected, message = 'Native evidence differs.') {
  assert.ok(isDeepStrictEqual(actual, expected), message.slice(0, 500));
}

export const arrowMeetPdfContract = {
  id: 'native-arrow-meet-source-physical-PDF-invariance-v1',
  sourceAspectRatio: 'xMidYMid meet',
  change: 'Only the root aspect-ratio declaration changes; drawing and other attributes remain unchanged.',
  physicalPage: 'Original ordinary PDF pages, fixed native origin/cameras, source/scene regions and both raster routes stay unchanged.',
  limits: 'Recomputed physical-page policies and every measured quantity must equal the original pinned cache. No limit is widened.',
  sourceGate: 'Fixed-page normalization removes the source aspect-ratio declaration. The separately checked meet-primary source gate remains mandatory.',
  scope: 'Six glyph-free native fixtures; this certificate grants no public image admission.'
};

export async function arrowMeetPdfSources(evidence) {
  const sources = await arrowMeetSources(evidence);
  const queue = ['arrow-meet-primary-binding.mjs', 'arrow-meet-pdf-contract.mjs', 'calibrate-arrow-meet-pdf.mjs', 'check-arrow-meet-pdf.mjs'].map(f => 'tools/TikzVisual/' + f);
  for (let i = 0; i < queue.length; i++) {
    const file = queue[i]; if (sources.has(file)) continue;
    assert.match(file, /^tools\/TikzVisual\/[a-z0-9.-]+\.mjs$/);
    const bytes = arrowCanonical(await readFile(path.join(root, file))); sources.set(file, {bytes, sha256: sha256(bytes)});
    for (const match of bytes.toString().matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g)) queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1])));
  }
  return new Map([...sources].sort(([a], [b]) => a.localeCompare(b)));
}

export async function loadArrowMeetPdfInput(evidence, producer, checker, readOverride, qualificationPin) {
  const primary = await loadArrowMeetOwned(producer, evidence, readOverride ? f => readOverride('primary', f) : undefined, qualificationPin);
  arrowAgentPath(checker); assert.match(checker, /^artifacts\/arrow-meet-source-checks\/run-[a-f0-9-]+\/report\.json$/);
  const checkerPath = await outputPath(path.dirname(path.join(root, checker)), 'report.json');
  if (!readOverride) assert.ok((await stat(checkerPath)).size < 100000);
  const checkBytes = readOverride ? await readOverride('primary-check', 'report.json') : await readFile(checkerPath);
  assert.ok(Buffer.isBuffer(checkBytes) && checkBytes.length < 100000);
  const check = JSON.parse(checkBytes);
  assertNativeEqual([check.schemaVersion, check.completed, check.phase, check.comparisonKind], [1, true, 'complete', 'independent-native-arrow-meet-source-check']);
  assertNativeEqual([check.converterInvoked, check.approvedImagePolicy, check.imageConformanceClaim, check.imageAdmission], [false, false, false, 'pending']);
  assert.equal(check.inputReport, producer); assert.equal(check.inputReportSha256, primary.sha256);
  assertNativeEqual(check.renderer, primary.report.renderer); assertNativeEqual(check.sourceHashes, primary.report.sourceHashes);
  assertNativeEqual(check.summary, primary.report.summary);
  assertNativeEqual([check.measurements, check.recapturedImages, check.deltaChecks], [39834, 3057, 210]);
  assertNativeEqual(check.controls.map(c => c.name), ['false approval', 'false conformance', 'changed aspect-ratio contract', 'lost pending gate', 'wrong native cache', 'false baseline count',
    'missing view', 'weakened independently derived policy', 'consistently rehashed SVG substitution', 'consistently rehashed PNG and metric substitution']);
  assert.ok(check.controls.every(c => c.passed === true));
  const files = new Map([...primary.files].map(([f, b]) => ['primary/' + f, b]));
  const primaryManifest = readOverride ? await readOverride('primary', 'manifest.json') : await readFile(path.join(primary.folder, 'manifest.json'));
  assert.equal(sha256(primaryManifest), primary.report.manifest.sha256);
  files.set('primary/report.json', primary.bytes); files.set('primary/manifest.json', primaryManifest);
  files.set('primary-check/report.json', checkBytes);
  return {primary, check, files, bindings: {producer, checker, producerSha256: primary.sha256, checkerSha256: sha256(checkBytes)}};
}

export async function measureArrowMeetPdfView(renderer, evidence, view, base) {
  const frame = evidence.frames.find(f => f.caseId === view.caseId), physical = await arrowSourcePdfInputs(renderer, view, frame, base);
  const meta = JSON.parse(evidence.getRole('pdf', 'views/' + view.id + '/record.json'));
  assertNativeEqual(meta.view, view); assertNativeEqual(meta.sourceFrame, physical.sourceFrame); assertNativeEqual(meta.normalization, physical.normalization); assertNativeEqual(meta.extra, physical.extra);
  const pdfBytes = evidence.getRole('pdf', meta.files.pdf), measure = view.raster === 'relative-viewport' ? measureShapePdfPair : measureEdgePdfPair;
  const record = {...meta, rootProofs: {}}, captures = {};
  for (const type of ['source', 'scene']) {
    const original = type === 'source' ? physical.svg : physical.scene;
    assert.equal(original, evidence.getRole('pdf', meta.files[type].svg).toString());
    const rewritten = await rewriteArrowMeetRoot(renderer, original), regions = type === 'source' ? frame.paper.regions : arrowViewportRegions(frame);
    const raw = await measure(renderer, {...physical, svg: rewritten.svg, camera: frame.paper.camera, regions, scale: view.scale, frame: view.frame,
      pdfPage: 'data:image/png;base64,' + pdfBytes.toString('base64'), cropLimit: 0, rightLabel: physical.rightLabel + (type === 'scene' ? ' scene' : '')});
    const {images, crops, ...values} = raw; assert.equal(crops.length, 0);
    const png = Buffer.from(images['svg-page'], 'base64');
    const numbers = attachArrowPdfInk({...values, view, mode: view.caseId + '/' + view.route, converterInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false,
      ...(type === 'scene' ? {outsideDiagramChangedPixels: raw.fullPage.rawChangedPixels - raw.regions[0].rawChangedPixels} : {}), rightLabel: physical.rightLabel + (type === 'scene' ? ' scene' : '')},
      await measureArrowPdfInk(renderer, [pdfBytes, png], raw.pageSize, regions, view.scale));
    assertNativeEqual(numbers, JSON.parse(evidence.getRole('pdf', meta.files[type].numbers)), 'Changed physical-page measurement: ' + view.id + '/' + type);
    assertNativeEqual(Object.keys(images), Object.keys(meta.files[type].images));
    for (const [name, image] of Object.entries(images)) assertNativeEqual(Buffer.from(image, 'base64'), evidence.getRole('pdf', meta.files[type].images[name]), 'Changed fixed-page capture: ' + view.id + '/' + type + '/' + name);
    record[type] = numbers; record.rootProofs[type] = rewritten.proof; captures[type] = {svg: rewritten.svg, numbers, images};
  }
  return {record, captures};
}

export function arrowMeetPdfEntry(evidence, input, sources, manifest) {
  return {schemaVersion: 1, completed: true, phase: 'complete', comparisonKind: 'native-arrow-meet-physical-PDF-certificate', converterInvoked: false, nativeToolInvoked: false,
    approvedImagePolicy: false, imageConformanceClaim: false, imageAdmission: 'pending', contract: arrowMeetPdfContract,
    cacheSha256: arrowImageCacheSha256, nativePdfReportSha256: evidence.header.sourceReports.pdf.sha256, snapshotSha256: evidence.native.snapshotSha256,
    renderer: evidence.reports.pdf.renderer, inputs: input.bindings, sourceHashes: Object.fromEntries([...sources].map(([f, s]) => [f, s.sha256])),
    views: 396, sourceSceneCaptures: 792, exactQualifiedPages: 792, physicalLimitsUnchanged: true, summary: evidence.pdf.summary, eligibility: evidence.pdf.eligibility,
    manifest, records: 'record-index.json', policies: 'policies.json', viewer: 'index.html',
    pendingGates: ['independent-meet-PDF-reader', 'immutable-combined-meet-inputs', 'public-image-only-controls', 'public-combined-admission']};
}

export function validateArrowMeetPdfEntry(report, evidence, sources) {
  assertNativeEqual([report.schemaVersion, report.completed, report.phase, report.comparisonKind], [1, true, 'complete', 'native-arrow-meet-physical-PDF-certificate']);
  assertNativeEqual([report.converterInvoked, report.nativeToolInvoked, report.approvedImagePolicy, report.imageConformanceClaim, report.imageAdmission], [false, false, false, false, 'pending']);
  assertNativeEqual(report.contract, arrowMeetPdfContract); assert.equal(report.cacheSha256, arrowImageCacheSha256);
  assert.equal(report.nativePdfReportSha256, evidence.header.sourceReports.pdf.sha256); assert.equal(report.snapshotSha256, evidence.native.snapshotSha256);
  requireRenderer(report.renderer, evidence.reports.pdf.renderer); assertNativeEqual(report.sourceHashes, Object.fromEntries([...sources].map(([f, s]) => [f, s.sha256])));
  assertNativeEqual([report.views, report.sourceSceneCaptures, report.exactQualifiedPages, report.physicalLimitsUnchanged], [396, 792, 792, true]);
  assertNativeEqual(report.summary, evidence.pdf.summary); assertNativeEqual(report.eligibility, evidence.pdf.eligibility);
  assertNativeEqual([report.manifest.file, report.records, report.policies, report.viewer], ['manifest.json', 'record-index.json', 'policies.json', 'index.html']);
  assertNativeEqual(report.pendingGates, ['independent-meet-PDF-reader', 'immutable-combined-meet-inputs', 'public-image-only-controls', 'public-combined-admission']);
  assert.match(report.manifest.sha256, /^[a-f0-9]{64}$/);
}

export async function loadArrowMeetPdfOwned(file, evidence, readOverride, qualificationPins) {
  arrowAgentPath(file); assert.match(file, /^artifacts\/arrow-meet-pdf-calibration\/run-[a-f0-9-]+\/report\.json$/);
  const folder = path.dirname(path.join(root, file)); await outputPath(folder);
  const read = async (name, bound) => {
    const full = await outputPath(folder, arrowAgentPath(name)); if (!readOverride) assert.ok((await stat(full)).size <= bound);
    const bytes = readOverride ? await readOverride(name) : await readFile(full); assert.ok(Buffer.isBuffer(bytes) && bytes.length <= bound, 'Missing or oversized certificate artifact: ' + name); return bytes;
  };
  const bytes = await read('report.json', 100000), report = JSON.parse(bytes);
  const sources = qualificationPins
    ? await arrowQualifiedSources(bytes, qualificationPins.pdf, p => read(p, 5000000))
    : await arrowMeetPdfSources(evidence);
  validateArrowMeetPdfEntry(report, evidence, sources);
  const mb = await read('manifest.json', 5000000); assert.equal(sha256(mb), report.manifest.sha256);
  const manifest = JSON.parse(mb); assert.equal(manifest.schemaVersion, 1); assert.equal(Object.keys(manifest.artifacts).length, report.manifest.files); assert.ok(report.manifest.files <= 14000);
  const files = new Map(); let total = 0;
  for (const [name, digest] of Object.entries(manifest.artifacts)) {
    assert.match(digest, /^[a-f0-9]{64}$/); const content = await read(name, 64000000); total += content.length; assert.ok(total <= 1024000000);
    assert.equal(sha256(content), digest, 'Changed certificate artifact: ' + name); files.set(name, content);
  }
  for (const [name, source] of sources) assert.equal(sha256(files.get('source-captures/' + name)), source.sha256);
  assertNativeEqual(JSON.parse(files.get('record-index.json')), arrowSourcePdfPlan().map(v => 'views/' + v.id + '/record.json'));
  const input = await loadArrowMeetPdfInput(evidence, report.inputs.producer, report.inputs.checker, (kind, name) => files.get('upstream/' + kind + '/' + name), qualificationPins?.primary);
  assertNativeEqual(report.inputs, input.bindings);
  return {folder, bytes, sha256: sha256(bytes), report, manifest, files, sources, input};
}

export function arrowMeetPdfIndex(records) {
  return '<!doctype html><meta charset="utf-8"><title>Native meet PDF invariance</title><h1>Native meet source/scene PDF certificate; public admission pending</h1>' +
    '<p>Physical-page normalization removes root aspect ratio. Original source presentation requires the separately checked meet-primary gate.</p><a href="report.json">Report</a>' +
    records.filter(r => r.view.scale === 1).map(r => '<h2>' + r.view.id + '</h2>' + ['source', 'scene'].map(type => '<p>' + type + ' · <a href="' + r.files[type].numbers + '">measurements</a></p><img src="' + r.files[type].images['svg-page'] + '">').join('')).join('');
}
