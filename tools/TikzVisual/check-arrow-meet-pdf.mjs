import {requireRenderer} from './shape-primary-trial-policy.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root, sha256, outputPath, writeArtifact} from './shape-oracle-bundle.mjs';
import {loadArrowImageCache} from './arrow-image-cache.mjs';
import {assertNativeEqual, arrowMeetPdfSources, loadArrowMeetPdfOwned, measureArrowMeetPdfView, arrowMeetPdfEntry, arrowMeetPdfIndex} from './arrow-meet-pdf-contract.mjs';
import {verifyArrowMeetPrimaryBinding, verifyArrowMeetPrimaryView} from './arrow-meet-primary-binding.mjs';
import {arrowSourcePrimaryReference} from './arrow-source-primary-reference.mjs';
import {arrowSourcePdfPlan, arrowSourcePdfBaseline, buildArrowSourcePdfExperiment} from './arrow-source-pdf-model.mjs';
import {arrowViewportRegions} from './arrow-viewport-model.mjs';
import {arrowMetrics} from './arrow-native-contract.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {measureArrowPdfInk} from './arrow-pdf-ink.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

assert.equal(process.argv.length, 3);
const out = await outputPath(path.join(root, 'artifacts/arrow-meet-pdf-checks/run-' + randomUUID()));
let renderer, phase = 'native-input', inputReportSha256, primaryAudit, measurements = 0, moments = 0, images = 0, deltaChecks = 0;
const records = [], controls = [], bases = new Map();
async function publish(report) {
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n'); await writeArtifact(out, 'report.json', bytes);
  console.log(JSON.stringify({completed: report.completed, phase: report.phase, report: path.relative(root, path.join(out, 'report.json')).split(path.sep).join('/'), sha256: sha256(bytes)}));
}

async function verifyView(owned, evidence, view) {
  const result = await measureArrowMeetPdfView(renderer, evidence, view, bases.get(view.caseId));
  const {record, captures} = result, read = f => {assert.ok(owned.files.has(f), f); return owned.files.get(f);};
  const {source, scene, ...meta} = record; assertNativeEqual(JSON.parse(read('views/' + view.id + '/record.json')), meta);
  const frame = evidence.frames.find(f => f.caseId === view.caseId), pdf = read(record.files.pdf);
  assertNativeEqual(pdf, evidence.getRole('pdf', record.files.pdf)); let viewMeasurements = 0, viewImages = 0;
  for (const type of ['source', 'scene']) {
    const capture = captures[type], files = record.files[type], numbers = JSON.parse(read(files.numbers));
    assertNativeEqual(read(files.svg), Buffer.from(capture.svg), 'Substituted physical-page SVG.');
    for (const [name, image] of Object.entries(capture.images)) assertNativeEqual(read(files.images[name]), Buffer.from(image, 'base64'), 'PDF SVG/image binding: ' + view.id + '/' + type + '/' + name);
    assertNativeEqual(numbers, capture.numbers);
    const regions = type === 'source' ? frame.paper.regions : arrowViewportRegions(frame);
    const decoded = await decodeEdgeOraclePngPair(renderer, [pdf, read(files.images['svg-page'])], numbers.pageSize,
      [...regions.map(r => r.rasterRectangles[view.scale + 'x'])], view.scale, 'white', true);
    const quantities = [numbers.whole, ...numbers.regions];
    assertNativeEqual(decoded.metrics.map(arrowMetrics), quantities.map(arrowMetrics)); assertNativeEqual(decoded.fullPage, numbers.fullPage);
    const ink = await measureArrowPdfInk(renderer, [pdf, read(files.images['svg-page'])], numbers.pageSize, regions, view.scale);
    // Reattach the independently decoded integer RGB mass and first moments.
    for (const [i, region] of quantities.entries()) {
      assertNativeEqual(region.inkCoverage, ink[i].inkCoverage); assertNativeEqual(region.inkMoments, ink[i].inkMoments);
    }
    viewMeasurements += quantities.length; viewImages += Object.keys(capture.images).length;
  }
  return {record, measurements: viewMeasurements, images: viewImages};
}

function verifyModel(owned, evidence, checked) {
  const model = buildArrowSourcePdfExperiment(checked, evidence.frames); assertNativeEqual(model, evidence.pdf);
  assertNativeEqual(JSON.parse(owned.files.get('policies.json')), {policies: model.policies, visibility: model.visibility});
  assertNativeEqual(JSON.parse(owned.files.get('summary.json')), model.summary);
  for (const e of model.evaluations) assertNativeEqual(JSON.parse(owned.files.get('views/' + e.view.id + '/gates.json')), e);
  assertNativeEqual(owned.files.get('index.html'), Buffer.from(arrowMeetPdfIndex(checked)));
  assertNativeEqual(owned.report, arrowMeetPdfEntry(evidence, owned.input, owned.sources, owned.report.manifest));
  const expected = new Set(['native-PDF-report.json', 'policies.json', 'summary.json', 'record-index.json', 'index.html']);
  for (const [name] of owned.input.files) expected.add('upstream/' + name);
  for (const name of owned.sources.keys()) expected.add('source-captures/' + name);
  for (const r of checked) {
    expected.add(r.files.pdf); expected.add('views/' + r.view.id + '/record.json'); expected.add('views/' + r.view.id + '/gates.json');
    for (const type of ['source', 'scene']) for (const name of [r.files[type].svg, r.files[type].numbers, ...Object.values(r.files[type].images)]) expected.add(name);
  }
  assertNativeEqual(owned.files.get('native-PDF-report.json'), evidence.getRole('pdf', 'report.json'));
  assertNativeEqual([...owned.files.keys()].sort(), [...expected].sort()); return model;
}

function corrupt(owned, change) {
  const report = structuredClone(owned.report), manifest = structuredClone(owned.manifest), files = new Map(owned.files);
  change({report, manifest, files});
  for (const [name, bytes] of files) manifest.artifacts[name] = sha256(bytes);
  const mb = Buffer.from(JSON.stringify(manifest, null, 2) + '\n'); report.manifest.sha256 = sha256(mb);
  files.set('manifest.json', mb); files.set('report.json', Buffer.from(JSON.stringify(report, null, 2) + '\n'));
  return name => files.get(name);
}

try {
  const evidence = await loadArrowImageCache(), owned = await loadArrowMeetPdfOwned(process.argv[2], evidence); inputReportSha256 = owned.sha256;
  renderer = await createRenderer(); requireRenderer(renderer.identity, owned.report.renderer); await installShapeMetrics(renderer);
  phase = 'bound-primary'; primaryAudit = await verifyArrowMeetPrimaryBinding(renderer, evidence, owned.input.primary, owned.input.check, view => {
    phase = 'primary/' + view.id; if (view.background === 'black' && view.scale === 4) console.log('Bound meet primary checked: ' + view.id);
  });
  for (const c of evidence.native.cases) {
    const frame = evidence.frames.find(f => f.caseId === c.id);
    bases.set(c.id, await arrowSourcePrimaryReference(renderer, c.metrics, frame, evidence.native.artifacts.get(c.id + '/plain-reference.svg').toString()));
  }
  for (const view of arrowSourcePdfPlan()) {
    phase = view.id; const checked = await verifyView(owned, evidence, view), record = checked.record;
    if (!['calibration', 'visibility-calibration'].includes(view.kind)) {
      const baseline = arrowSourcePdfBaseline(records, view); assert.ok(baseline);
      for (const type of ['source', 'scene']) {
        const size = record[type].pageSize, delta = await decodeEdgeOraclePngPair(renderer,
          [owned.files.get(baseline.files[type].images['svg-page']), owned.files.get(record.files[type].images['svg-page'])], size, [{x: 0, y: 0, ...size}], view.scale, 'white');
        assertNativeEqual(record[type + 'Delta'], delta.metrics[0]); deltaChecks++;
      }
    } else {assert.equal(record.sourceDelta, null); assert.equal(record.sceneDelta, null);}
    measurements += checked.measurements; moments += checked.measurements; images += checked.images; records.push(record);
    if (view.scale === 4 && view.frame === 'expanded') console.log('Meet PDF independently checked: ' + view.id);
  }
  phase = 'model'; const model = verifyModel(owned, evidence, records);
  phase = 'corruption-controls';
  const reject = async (name, change, afterLoad) => {
    phase = 'corruption/' + name; console.log('Checking meet PDF control: ' + name);
    // Mutation errors are broken test fixtures, not successful rejections.
    const override = corrupt(owned, change); let rejection;
    await assert.rejects(async () => {const bad = await loadArrowMeetPdfOwned(process.argv[2], evidence, override); if (afterLoad) await afterLoad(bad);}, error => {
      assert.ok(error instanceof assert.AssertionError, 'Unexpected corruption-control error.');
      rejection = error.message.slice(0, 500); return true;
    });
    controls.push({name, passed: true, rejection});
  };
  await reject('false public admission', b => b.report.imageConformanceClaim = true);
  await reject('false policy approval', b => b.report.approvedImagePolicy = true);
  await reject('lost primary source gate', b => b.report.contract.sourceGate = 'physical page only');
  await reject('changed root contract', b => b.report.contract.sourceAspectRatio = 'none');
  await reject('lost pending gate', b => b.report.pendingGates.pop());
  await reject('wrong native PDF identity', b => b.report.nativePdfReportSha256 = '0'.repeat(64));
  await reject('lost view', b => {const index = JSON.parse(b.files.get('record-index.json')); index.pop(); b.files.set('record-index.json', Buffer.from(JSON.stringify(index) + '\n'));});
  await reject('changed fixed policy', b => {const p = JSON.parse(b.files.get('policies.json')); p.policies.pop(); b.files.set('policies.json', Buffer.from(JSON.stringify(p) + '\n'));}, b => verifyModel(b, evidence, records));
  const sample = records.find(r => r.view.kind === 'defect' && r.sourceDelta.rawChangedPixels > 0); assert.ok(sample);
  await reject('rehashed source SVG substitution', b => b.files.set(sample.files.source.svg, b.files.get(sample.files.scene.svg)), b => verifyView(b, evidence, sample.view));
  assert.ok(!owned.files.get(sample.files.source.images['svg-page']).equals(owned.files.get(sample.files.pdf)));
  await reject('rehashed source PNG substitution', b => b.files.set(sample.files.source.images['svg-page'], b.files.get(sample.files.pdf)), b => verifyView(b, evidence, sample.view));
  await reject('rehashed camera substitution', b => {const n = JSON.parse(b.files.get(sample.files.source.numbers)); n.sourceFrame.x += .25; b.files.set(sample.files.source.numbers, Buffer.from(JSON.stringify(n) + '\n'));}, b => verifyView(b, evidence, sample.view));
  await reject('rehashed integer moment substitution', b => {const n = JSON.parse(b.files.get(sample.files.source.numbers)); n.regions[0].inkMoments.actual[0].mass++; b.files.set(sample.files.source.numbers, Buffer.from(JSON.stringify(n) + '\n'));}, b => verifyView(b, evidence, sample.view));
  await reject('forged bound primary checker', b => {const check = JSON.parse(b.files.get('upstream/primary-check/report.json')); check.completed = false; b.files.set('upstream/primary-check/report.json', Buffer.from(JSON.stringify(check) + '\n'));});
  const primarySample = primaryAudit.records.find(r => r.view.kind === 'defect' && r.delta.rawChangedPixels > 0); assert.ok(primarySample);
  await reject('fully rehashed bound primary image substitution', b => {
    const prefix = 'upstream/primary/', file = primarySample.files.images.actual;
    b.files.set(prefix + file, b.files.get(prefix + primarySample.files.images.reference));
    const innerManifest = JSON.parse(b.files.get(prefix + 'manifest.json')); innerManifest.artifacts[file] = sha256(b.files.get(prefix + file));
    const mb = Buffer.from(JSON.stringify(innerManifest, null, 2) + '\n'); b.files.set(prefix + 'manifest.json', mb);
    const innerReport = JSON.parse(b.files.get(prefix + 'report.json')); innerReport.manifest.sha256 = sha256(mb);
    const rb = Buffer.from(JSON.stringify(innerReport, null, 2) + '\n'); b.files.set(prefix + 'report.json', rb); b.report.inputs.producerSha256 = sha256(rb);
    const check = JSON.parse(b.files.get('upstream/primary-check/report.json')); check.inputReportSha256 = sha256(rb);
    const cb = Buffer.from(JSON.stringify(check, null, 2) + '\n'); b.files.set('upstream/primary-check/report.json', cb); b.report.inputs.checkerSha256 = sha256(cb);
  }, b => verifyArrowMeetPrimaryView(renderer, evidence, b.input.primary, primarySample.view));
  phase = 'final-source-guards'; assertNativeEqual(await arrowMeetPdfSources(evidence), owned.sources); await loadArrowMeetPdfOwned(process.argv[2], evidence);
  await publish({schemaVersion: 1, completed: true, phase: 'complete', comparisonKind: 'independent-native-arrow-meet-PDF-check',
    converterInvoked: false, nativeToolInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false, imageAdmission: 'pending',
    inputReport: process.argv[2], inputReportSha256, renderer: renderer.identity, inputs: owned.report.inputs, sourceHashes: owned.report.sourceHashes,
    summary: model.summary, eligibility: model.eligibility, primary: {views: 306, measurements: primaryAudit.measurements, images: primaryAudit.images, deltas: primaryAudit.deltas},
    views: 396, sourceSceneCaptures: 792, measurements, moments, fullPageMeasurements: 792, recapturedImages: images, deltaChecks, controls,
    pendingGates: ['immutable-combined-meet-inputs', 'public-image-only-controls', 'public-combined-admission']});
} catch (error) {
  process.exitCode = 2; await publish({schemaVersion: 1, completed: false, phase, converterInvoked: false, nativeToolInvoked: false,
    approvedImagePolicy: false, imageConformanceClaim: false, inputReportSha256, checkedPdfViews: records.length, measurements, moments, recapturedImages: images, deltaChecks, controls,
    error: error.message.replaceAll(root, '<repo>')}); console.error(error.stack);
} finally { await renderer?.browser.close(); }
