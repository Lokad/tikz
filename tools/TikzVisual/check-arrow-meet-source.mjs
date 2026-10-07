// Rebuild source captures from frozen native SVGs and re-decode saved pixels.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root, sha256, outputPath, writeArtifact} from './shape-oracle-bundle.mjs';
import {loadArrowImageCache} from './arrow-image-cache.mjs';
import {arrowMeetSources, rewriteArrowMeetRoot, arrowMeetControl, arrowMeetFiles, buildArrowMeetModel, arrowMeetEntry, loadArrowMeetOwned} from './arrow-meet-source-contract.mjs';
import {arrowSourcePrimaryPlan} from './arrow-source-primary-contract.mjs';
import {arrowSourcePrimaryFrame} from './arrow-source-primary-reference.mjs';
import {arrowPrimaryRegions} from './arrow-primary-contract.mjs';
import {arrowSourcePrimaryLabels, arrowSourcePrimaryIndex} from './arrow-source-primary-panels.mjs';
import {arrowMetrics} from './arrow-native-contract.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

assert.equal(process.argv.length, 3);
const out = await outputPath(path.join(root, 'artifacts/arrow-meet-source-checks/run-' + randomUUID()));
let renderer, phase = 'native-input', inputReportSha256, measurements = 0, recapturedImages = 0, deltaChecks = 0;
const records = [], controls = [];
async function publish(report) {
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n'); await writeArtifact(out, 'report.json', bytes);
  console.log(JSON.stringify({completed: report.completed, phase: report.phase,
    report: path.relative(root, path.join(out, 'report.json')).split(path.sep).join('/'), sha256: sha256(bytes)}));
}

async function verifyView(owned, evidence, view) {
  const read = file => {assert.ok(owned.files.has(file), 'Missing meet artifact: ' + file); return owned.files.get(file);};
  const folder = 'views/' + view.id, frame = evidence.frames.find(f => f.caseId === view.caseId), regions = arrowPrimaryRegions(frame);
  const input = JSON.parse(evidence.getRole('primary', folder + '/record.json'));
  const reference = await rewriteArrowMeetRoot(renderer, evidence.getRole('primary', input.files.reference).toString());
  const actual = await rewriteArrowMeetRoot(renderer, evidence.getRole('primary', input.files.actual).toString());
  const files = arrowMeetFiles(view, regions), record = JSON.parse(read(files.record)), numbers = JSON.parse(read(files.numbers));
  assert.deepEqual(record.view, view); assert.deepEqual(numbers.view, view); assert.deepEqual(record.files, files);
  assert.deepEqual([numbers.converterInvoked, numbers.approvedImagePolicy, numbers.imageConformanceClaim], [false, false, false]);
  assert.deepEqual(record.rootProofs, {reference: reference.proof, actual: actual.proof});
  assert.deepEqual(read(files.reference), Buffer.from(reference.svg), 'Substituted reference SVG.');
  assert.deepEqual(read(files.actual), Buffer.from(actual.svg), 'Substituted actual SVG.');
  const sourceFrame = await arrowSourcePrimaryFrame(renderer, actual.svg, frame.sourceEnvelope);
  assert.deepEqual(record.sourceFrame, sourceFrame);
  const control = arrowMeetControl(view), synthetic = view.kind.startsWith('visibility-');
  const fresh = await measureEdgeTrialPrimary(renderer, {reference: reference.svg, actual: actual.svg, leftIsDriver: !synthetic,
    origin: synthetic ? {x: 0, y: 0} : frame.origin, camera: frame.camera, regions, ...view,
    cropLimit: control ? 1 : 0, cropRegionIds: control ? [control.target] : [], ...arrowSourcePrimaryLabels(view)});
  const {images, crops, ...freshNumbers} = fresh;
  assert.deepEqual(Object.keys(images), Object.keys(files.images));
  for (const [name, image] of Object.entries(images))
    assert.deepEqual(read(files.images[name]), Buffer.from(image, 'base64'), 'SVG-to-image binding failed: ' + files.images[name]);
  assert.deepEqual(crops.map(c => ({id: c.id, presentation: c.presentation})), files.crops.map(c => ({id: c.id, presentation: c.presentation})));
  for (const [i, crop] of crops.entries())
    for (const [name, image] of Object.entries({...crop.paired, sheet: crop.sheet}))
      assert.deepEqual(read(files.crops[i].images[name]), Buffer.from(image, 'base64'), 'Substituted paired crop.');
  assert.deepEqual(numbers, {...freshNumbers, view, converterInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false});
  const size = {width: frame.camera.width * view.scale, height: frame.camera.height * view.scale};
  const decoded = await decodeEdgeOraclePngPair(renderer, [read(files.images.reference), read(files.images.actual)], size,
    [{x: 0, y: 0, ...size}, ...regions.map(r => Object.fromEntries(Object.entries(r.rectangle).map(([k, n]) => [k, n * view.scale])))], view.scale, view.background);
  assert.deepEqual(decoded.metrics.map(arrowMetrics), [numbers.metrics, ...numbers.regions].map(arrowMetrics));
  return {...record, numbers};
}

function verifyModel(owned, evidence, verifiedRecords) {
  const model = buildArrowMeetModel(verifiedRecords), read = file => JSON.parse(owned.files.get(file));
  assert.deepEqual(read('policies.json'), {policies: model.policies, visibility: model.visibility});
  assert.deepEqual(read('summary.json'), model.summary);
  for (const evaluation of model.evaluations) assert.deepEqual(read('views/' + evaluation.view.id + '/gates.json'), evaluation);
  assert.deepEqual(owned.files.get('index.html'), Buffer.from('<!-- Native meet root encoding; original none evidence retained. -->\n' + arrowSourcePrimaryIndex(model, verifiedRecords)));
  assert.deepEqual(owned.report, arrowMeetEntry(evidence, owned.sources, model, owned.report.renderer, owned.report.manifest));
  const expected = new Set(['native-primary-report.json', 'native-primary-check.json', 'record-index.json', 'policies.json', 'summary.json', 'index.html']);
  for (const name of owned.sources.keys()) expected.add('source-captures/' + name);
  for (const r of verifiedRecords) {
    for (const name of [r.files.reference, r.files.actual, r.files.numbers, r.files.record, ...Object.values(r.files.images),
      ...r.files.crops.flatMap(c => Object.values(c.images)), 'views/' + r.view.id + '/gates.json']) expected.add(name);
  }
  assert.deepEqual([...owned.files.keys()].sort(), [...expected].sort(), 'Missing, extra or substituted view artifacts.');
  return model;
}

function corruptBundle(owned, change) {
  const report = structuredClone(owned.report), manifest = structuredClone(owned.manifest), files = new Map(owned.files);
  change({report, manifest, files});
  for (const [name, bytes] of files) manifest.artifacts[name] = sha256(bytes);
  const mb = Buffer.from(JSON.stringify(manifest, null, 2) + '\n'); report.manifest.sha256 = sha256(mb);
  files.set('manifest.json', mb); files.set('report.json', Buffer.from(JSON.stringify(report, null, 2) + '\n'));
  return name => files.get(name);
}

try {
  const evidence = await loadArrowImageCache(), owned = await loadArrowMeetOwned(process.argv[2], evidence);
  inputReportSha256 = owned.sha256;
  renderer = await createRenderer(); assert.deepEqual(renderer.identity, owned.report.renderer); await installShapeMetrics(renderer);
  for (const view of arrowSourcePrimaryPlan()) {
    phase = view.id; const record = await verifyView(owned, evidence, view), frame = evidence.frames.find(f => f.caseId === view.caseId);
    if (['defect', 'visibility-missing'].includes(view.kind)) {
      const kind = view.kind === 'defect' ? 'calibration' : 'visibility-calibration';
      const baseline = records.find(r => r.view.caseId === view.caseId && r.view.kind === kind && r.view.frame === view.frame &&
        r.view.scale === view.scale && r.view.background === view.background && (kind === 'calibration' || r.view.name === view.name)); assert.ok(baseline);
      const size = {width: frame.camera.width * view.scale, height: frame.camera.height * view.scale};
      const decoded = await decodeEdgeOraclePngPair(renderer, [owned.files.get(baseline.files.images.actual), owned.files.get(record.files.images.actual)],
        size, [{x: 0, y: 0, ...size}], view.scale, view.background);
      assert.deepEqual(record.delta, decoded.metrics[0]); deltaChecks++;
    } else assert.equal(record.delta, null);
    measurements += record.numbers.regions.length + 1;
    recapturedImages += Object.keys(record.files.images).length + record.files.crops.reduce((n, c) => n + Object.keys(c.images).length, 0);
    records.push(record);
    if (view.background === 'black' && view.scale === 4) console.log('Independent meet checked: ' + view.id);
  }
  phase = 'model'; const model = verifyModel(owned, evidence, records);
  phase = 'corruption-controls';
  const reject = async (name, change, afterLoad) => {
    await assert.rejects(async () => {
      const altered = await loadArrowMeetOwned(process.argv[2], evidence, corruptBundle(owned, change));
      if (afterLoad) await afterLoad(altered);
    }); controls.push({name, passed: true});
  };
  await reject('false approval', b => b.report.approvedImagePolicy = true);
  await reject('false conformance', b => b.report.imageConformanceClaim = true);
  await reject('changed aspect-ratio contract', b => b.report.contract.rootAspectRatio = 'none');
  await reject('lost pending gate', b => b.report.pendingGates.pop());
  await reject('wrong native cache', b => b.report.cacheSha256 = '0'.repeat(64));
  await reject('false baseline count', b => b.report.summary.baselinePasses--);
  await reject('missing view', b => {const rows = JSON.parse(b.files.get('record-index.json')); rows.pop(); b.files.set('record-index.json', Buffer.from(JSON.stringify(rows) + '\n'));});
  await reject('weakened independently derived policy', b => {const p = JSON.parse(b.files.get('policies.json')); p.policies[0].policy.rows[0].whole.maxRawChannelError++; b.files.set('policies.json', Buffer.from(JSON.stringify(p) + '\n'));}, b => verifyModel(b, evidence, records));
  const sample = records.find(r => r.view.kind === 'defect' && r.delta.rawChangedPixels > 0); assert.ok(sample);
  await reject('consistently rehashed SVG substitution', b => b.files.set(sample.files.actual, b.files.get(sample.files.reference)), b => verifyView(b, evidence, sample.view));
  await reject('consistently rehashed PNG and metric substitution', asyncBundle => {
    const numbers = JSON.parse(asyncBundle.files.get(sample.files.numbers));
    numbers.metrics.rawChangedPixels = 0; numbers.metrics.maxRawChannelError = 0;
    asyncBundle.files.set(sample.files.images.actual, asyncBundle.files.get(sample.files.images.reference));
    asyncBundle.files.set(sample.files.numbers, Buffer.from(JSON.stringify(numbers) + '\n'));
  }, b => verifyView(b, evidence, sample.view));
  assert.deepEqual(await arrowMeetSources(evidence), owned.sources); await loadArrowMeetOwned(process.argv[2], evidence);
  await publish({schemaVersion: 1, completed: true, phase: 'complete', comparisonKind: 'independent-native-arrow-meet-source-check',
    converterInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false, imageAdmission: 'pending',
    inputReport: process.argv[2], inputReportSha256, renderer: renderer.identity, sourceHashes: owned.report.sourceHashes,
    summary: model.summary, measurements, recapturedImages, deltaChecks, controls,
    pendingGates: ['source-PDF-meet-qualification', 'public-image-only-controls', 'public-combined-admission']});
} catch (error) {
  process.exitCode = 2; await publish({schemaVersion: 1, completed: false, phase, converterInvoked: false, approvedImagePolicy: false,
    imageConformanceClaim: false, inputReportSha256, verifiedViews: records.length, measurements, recapturedImages, deltaChecks, controls,
    error: error.message.replaceAll(root, '<repo>')}); console.error(error.stack);
} finally { await renderer?.browser.close(); }
