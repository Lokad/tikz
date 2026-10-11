// Independent native root encoding. The original cache and its policies stay intact.
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {root, sha256, outputPath} from './shape-oracle-bundle.mjs';
import {arrowCanonical} from './arrow-native-contract.mjs';
import {arrowQualifiedSources} from './arrow-qualified-sources.mjs';
import {arrowAgentPath} from './arrow-agent-evidence.mjs';
import {arrowImageCacheSha256, arrowImageCacheDecodedSha256} from './arrow-image-cache.mjs';
import {arrowSourcePrimaryPlan, buildArrowSourcePrimaryExperiment, evaluateArrowSourcePrimary} from './arrow-source-primary-contract.mjs';
import {arrowSourcePrimaryContract} from './arrow-source-primary-reference.mjs';
import {arrowPrimaryDefects, arrowPrimaryVisibility} from './arrow-primary-defects.mjs';

export const arrowMeetSourceContract = {
  id: 'native-arrow-aspect-preserving-source-primary-v1',
  rootAspectRatio: 'xMidYMid meet',
  nativeInput: 'Pinned original native source cache; no public converter or TeX invocation.',
  change: 'Only preserveAspectRatio changes. Drawing children and all other root attributes are preserved.',
  framing: 'Unchanged independent native source envelopes, cameras, units, regions and view matrix.',
  calibration: 'Limits derive only from the new native original/reconstruction pairs. Original none policies stay intact.',
  scope: 'Six glyph-free native fixtures; public primary/PDF admission and wider compatibility remain pending.'
};

export async function arrowMeetSources(evidence) {
  const sources = new Map();
  for (const file of Object.keys(evidence.sourceHashes)) {
    const bytes = arrowCanonical(await readFile(path.join(root, file)));
    sources.set(file, {bytes, sha256: sha256(bytes)});
  }
  const queue = ['arrow-meet-source-contract.mjs', 'calibrate-arrow-meet-source.mjs', 'check-arrow-meet-source.mjs'].map(f => 'tools/TikzVisual/' + f);
  for (let i = 0; i < queue.length; i++) {
    const file = queue[i];
    if (sources.has(file)) continue;
    assert.match(file, /^tools\/TikzVisual\/[a-z0-9.-]+\.mjs$/);
    const bytes = arrowCanonical(await readFile(path.join(root, file)));
    sources.set(file, {bytes, sha256: sha256(bytes)});
    for (const match of bytes.toString().matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g))
      queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1])));
  }
  return new Map([...sources].sort(([a], [b]) => a.localeCompare(b)));
}

export async function rewriteArrowMeetRoot(renderer, original) {
  const proof = await renderer.page.evaluate(svg => {
    const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const element = document.documentElement, serializer = new XMLSerializer();
    if (document.querySelector('parsererror') || element.localName !== 'svg' || element.getAttribute('preserveAspectRatio') !== 'none')
      throw Error('Expected the pinned native none source root.');
    const body = () => [...element.childNodes].map(n => serializer.serializeToString(n)).join('');
    const attributes = () => [...element.attributes].filter(a => a.name !== 'preserveAspectRatio').map(a => [a.namespaceURI, a.name, a.value]);
    const beforeBody = body(), beforeAttributes = attributes();
    element.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (body() !== beforeBody || JSON.stringify(attributes()) !== JSON.stringify(beforeAttributes))
      throw Error('Root encoding changed native drawing or framing.');
    return {svg: serializer.serializeToString(document), body: beforeBody, attributes: beforeAttributes};
  }, original);
  const {svg, body, attributes} = proof;
  return {svg, proof: {originalSha256: sha256(original), encodedSha256: sha256(svg), bodySha256: sha256(body),
    otherRootAttributesSha256: sha256(JSON.stringify(attributes)), originalAspectRatio: 'none',
    encodedAspectRatio: arrowMeetSourceContract.rootAspectRatio, bodyUnchanged: true, otherRootAttributesUnchanged: true}};
}

export function arrowMeetControl(view) {
  return (view.kind === 'defect' ? arrowPrimaryDefects : arrowPrimaryVisibility).find(d => d.name === view.name);
}

export function arrowMeetFiles(view, regions) {
  const folder = 'views/' + view.id, control = arrowMeetControl(view);
  const files = {reference: folder + '/reference.svg', actual: folder + '/actual.svg', numbers: folder + '/numbers.json',
    record: folder + '/record.json', images: {}, crops: []};
  for (const name of ['reference', 'actual', 'difference', 'alpha-difference', 'amplified', 'overlay',
    ...(view.background === 'white' && view.scale === 1 ? ['comparison'] : [])]) files.images[name] = folder + '/' + name + '.png';
  if (control) {
    const rectangle = regions.find(r => r.id === control.target).rectangle;
    files.crops = [{id: control.target, presentation: {background: 'white', integerEnlargement: view.scale === 1 ? 4 : 1,
      rawDifferenceAmplification: 16, rasterRectangle: Object.fromEntries(Object.entries(rectangle).map(([k, n]) => [k, n * view.scale]))},
      images: Object.fromEntries(['reference', 'actual', 'difference', 'amplified', 'sheet'].map(name => [name, folder + '/crop-' + control.target + '-' + name + '.png']))}];
  }
  return files;
}

export function buildArrowMeetModel(records) {
  // Reuse the independent metric derivation and full defect assertions, with a
  // distinct scope. No old none limits are applied to the meet measurements.
  const model = buildArrowSourcePrimaryExperiment(records);
  for (const p of model.policies)
    p.policy.scope = p.policy.scope.replace(arrowSourcePrimaryContract.id, arrowMeetSourceContract.id);
  for (const p of model.visibility) p.policy.scope += '; ' + arrowMeetSourceContract.id;
  model.evaluations = records.map(r => evaluateArrowSourcePrimary(model, r));
  model.summary.qualification = 'pending-independent-meet-reader-source-PDF-and-public-admission';
  return model;
}

export function arrowMeetEntry(evidence, sources, model, renderer, manifest) {
  return {schemaVersion: 1, completed: true, phase: 'complete', comparisonKind: 'native-arrow-aspect-preserving-source-primary-observations',
    converterInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false, imageAdmission: 'pending',
    contract: arrowMeetSourceContract, cacheSha256: arrowImageCacheSha256, cacheDecodedSha256: arrowImageCacheDecodedSha256,
    nativePrimaryReportSha256: evidence.header.sourceReports.primary.sha256,
    nativePrimaryCheckSha256: evidence.header.sourceReports.primaryCheck.sha256, snapshotSha256: evidence.native.snapshotSha256,
    renderer, sourceHashes: Object.fromEntries([...sources].map(([f, s]) => [f, s.sha256])),
    summary: model.summary, manifest, policies: 'policies.json', records: 'record-index.json', viewer: 'index.html',
    pendingGates: ['independent-meet-reader', 'source-PDF-meet-qualification', 'public-image-only-controls', 'public-combined-admission']};
}

export function validateArrowMeetEntry(report, evidence, sources) {
  assert.deepEqual([report.schemaVersion, report.completed, report.phase, report.comparisonKind],
    [1, true, 'complete', 'native-arrow-aspect-preserving-source-primary-observations']);
  assert.deepEqual([report.converterInvoked, report.approvedImagePolicy, report.imageConformanceClaim, report.imageAdmission], [false, false, false, 'pending']);
  assert.deepEqual(report.contract, arrowMeetSourceContract);
  assert.equal(report.cacheSha256, arrowImageCacheSha256); assert.equal(report.cacheDecodedSha256, arrowImageCacheDecodedSha256);
  assert.equal(report.nativePrimaryReportSha256, evidence.header.sourceReports.primary.sha256);
  assert.equal(report.nativePrimaryCheckSha256, evidence.header.sourceReports.primaryCheck.sha256);
  assert.equal(report.snapshotSha256, evidence.native.snapshotSha256); assert.deepEqual(report.renderer, evidence.reports.primary.renderer);
  assert.deepEqual(report.sourceHashes, Object.fromEntries([...sources].map(([f, s]) => [f, s.sha256])));
  assert.deepEqual([report.manifest.file, report.policies, report.records, report.viewer], ['manifest.json', 'policies.json', 'record-index.json', 'index.html']);
  assert.deepEqual(report.pendingGates, ['independent-meet-reader', 'source-PDF-meet-qualification', 'public-image-only-controls', 'public-combined-admission']);
  assert.deepEqual([report.summary.views, report.summary.calibrationViews, report.summary.defectViews, report.summary.visibilityViews,
    report.summary.sourcePolicies, report.summary.baselinePasses], [306, 72, 186, 48, 6, 72]);
  assert.match(report.manifest.sha256, /^[a-f0-9]{64}$/);
}

export async function loadArrowMeetOwned(file, evidence, readOverride, qualificationPin) {
  arrowAgentPath(file); assert.match(file, /^artifacts\/arrow-meet-source-calibration\/run-[a-f0-9-]+\/report\.json$/);
  const folder = path.dirname(path.join(root, file)); await outputPath(folder);
  const read = async (name, bound) => {
    const full = await outputPath(folder, arrowAgentPath(name));
    if (!readOverride) assert.ok((await stat(full)).size <= bound, 'Oversized meet artifact: ' + name);
    const bytes = readOverride ? await readOverride(name) : await readFile(full);
    assert.ok(Buffer.isBuffer(bytes) && bytes.length <= bound, 'Oversized or missing meet artifact: ' + name);
    return bytes;
  };
  const bytes = await read('report.json', 100000), report = JSON.parse(bytes);
  const sources = qualificationPin
    ? await arrowQualifiedSources(bytes, qualificationPin, p => read(p, 5000000))
    : await arrowMeetSources(evidence);
  validateArrowMeetEntry(report, evidence, sources);
  const mb = await read('manifest.json', 3000000); assert.equal(sha256(mb), report.manifest.sha256);
  const manifest = JSON.parse(mb); assert.equal(manifest.schemaVersion, 1);
  assert.equal(Object.keys(manifest.artifacts).length, report.manifest.files); assert.ok(report.manifest.files <= 6000);
  const files = new Map(); let total = 0;
  for (const [name, hash] of Object.entries(manifest.artifacts)) {
    assert.match(hash, /^[a-f0-9]{64}$/); const content = await read(name, 64000000);
    total += content.length; assert.ok(total <= 512000000, 'Oversized meet bundle.');
    assert.equal(sha256(content), hash, 'Changed meet artifact: ' + name); files.set(name, content);
  }
  for (const [name, source] of sources) assert.equal(sha256(files.get('source-captures/' + name)), source.sha256);
  assert.deepEqual(files.get('native-primary-report.json'), evidence.getRole('primary', 'report.json'));
  assert.deepEqual(files.get('native-primary-check.json'), evidence.getRole('primaryCheck', 'report.json'));
  assert.deepEqual(JSON.parse(files.get('record-index.json')), arrowSourcePrimaryPlan().map(v => 'views/' + v.id + '/record.json'));
  return {folder, bytes, sha256: sha256(bytes), report, manifest, files, sources};
}
