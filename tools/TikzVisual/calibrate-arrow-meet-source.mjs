import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root, sha256, outputPath, writeArtifact} from './shape-oracle-bundle.mjs';
import {loadArrowImageCache} from './arrow-image-cache.mjs';
import {arrowMeetSources, rewriteArrowMeetRoot, arrowMeetControl, arrowMeetFiles, buildArrowMeetModel, arrowMeetEntry} from './arrow-meet-source-contract.mjs';
import {arrowSourcePrimaryPlan} from './arrow-source-primary-contract.mjs';
import {arrowSourcePrimaryFrame} from './arrow-source-primary-reference.mjs';
import {arrowPrimaryRegions} from './arrow-primary-contract.mjs';
import {arrowSourcePrimaryLabels, arrowSourcePrimaryIndex} from './arrow-source-primary-panels.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

assert.equal(process.argv.length, 2);
const out = await outputPath(path.join(root, 'artifacts/arrow-meet-source-calibration/run-' + randomUUID()));
const artifacts = {}, records = [];
const save = (file, bytes) => writeArtifact(out, file, bytes, artifacts);
const json = (file, value) => save(file, JSON.stringify(value) + '\n');
let renderer, phase = 'native-input';
async function publish(report) {
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n');
  await writeArtifact(out, 'report.json', bytes);
  console.log(JSON.stringify({completed: report.completed, phase: report.phase,
    report: path.relative(root, path.join(out, 'report.json')).split(path.sep).join('/'), sha256: sha256(bytes)}));
}
try {
  const evidence = await loadArrowImageCache(), sources = await arrowMeetSources(evidence);
  for (const [file, source] of sources) await save('source-captures/' + file, source.bytes);
  await save('native-primary-report.json', evidence.getRole('primary', 'report.json'));
  await save('native-primary-check.json', evidence.getRole('primaryCheck', 'report.json'));
  renderer = await createRenderer(); assert.deepEqual(renderer.identity, evidence.reports.primary.renderer);
  await installShapeMetrics(renderer);
  for (const view of arrowSourcePrimaryPlan()) {
    phase = view.id;
    const frame = evidence.frames.find(f => f.caseId === view.caseId), folder = 'views/' + view.id;
    const input = JSON.parse(evidence.getRole('primary', folder + '/record.json'));
    assert.deepEqual(input.view, view);
    const reference = await rewriteArrowMeetRoot(renderer, evidence.getRole('primary', input.files.reference).toString());
    const actual = await rewriteArrowMeetRoot(renderer, evidence.getRole('primary', input.files.actual).toString());
    const regions = arrowPrimaryRegions(frame), files = arrowMeetFiles(view, regions), control = arrowMeetControl(view);
    await save(files.reference, reference.svg); await save(files.actual, actual.svg);
    const synthetic = view.kind.startsWith('visibility-');
    const pair = await measureEdgeTrialPrimary(renderer, {reference: reference.svg, actual: actual.svg, leftIsDriver: !synthetic,
      origin: synthetic ? {x: 0, y: 0} : frame.origin, camera: frame.camera, regions, ...view,
      cropLimit: control ? 1 : 0, cropRegionIds: control ? [control.target] : [], ...arrowSourcePrimaryLabels(view)});
    assert.equal(pair.repeat.rawChangedPixels, 0); assert.equal(pair.actualRepeat.rawChangedPixels, 0);
    const {images, crops, ...numbers} = pair;
    assert.deepEqual(Object.keys(images), Object.keys(files.images));
    for (const [name, image] of Object.entries(images)) await save(files.images[name], Buffer.from(image, 'base64'));
    assert.deepEqual(crops.map(c => ({id: c.id, presentation: c.presentation})), files.crops.map(c => ({id: c.id, presentation: c.presentation})));
    for (const [i, crop] of crops.entries())
      for (const [name, image] of Object.entries({...crop.paired, sheet: crop.sheet})) await save(files.crops[i].images[name], Buffer.from(image, 'base64'));
    const sourceFrame = await arrowSourcePrimaryFrame(renderer, actual.svg, frame.sourceEnvelope);
    let delta = null;
    if (['defect', 'visibility-missing'].includes(view.kind)) {
      const kind = view.kind === 'defect' ? 'calibration' : 'visibility-calibration';
      const baseline = records.find(r => r.view.caseId === view.caseId && r.view.kind === kind && r.view.frame === view.frame &&
        r.view.scale === view.scale && r.view.background === view.background && (kind === 'calibration' || r.view.name === view.name));
      assert.ok(baseline);
      delta = (await decodeEdgeOraclePngPair(renderer, [baseline.actualPng, Buffer.from(images.actual, 'base64')],
        {width: frame.camera.width * view.scale, height: frame.camera.height * view.scale},
        [{x: 0, y: 0, width: frame.camera.width * view.scale, height: frame.camera.height * view.scale}], view.scale, view.background)).metrics[0];
    }
    const record = {view, sourceFrame, rootProofs: {reference: reference.proof, actual: actual.proof}, files, delta};
    await json(files.record, record);
    await json(files.numbers, {...numbers, view, converterInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false});
    records.push({...record, numbers, actualPng: Buffer.from(images.actual, 'base64')});
    if (view.background === 'black' && view.scale === 4) console.log('Native meet rendered: ' + view.id);
  }
  phase = 'coupled-gates'; const model = buildArrowMeetModel(records);
  for (const evaluation of model.evaluations) await json('views/' + evaluation.view.id + '/gates.json', evaluation);
  await json('policies.json', {policies: model.policies, visibility: model.visibility});
  await json('summary.json', model.summary);
  await json('record-index.json', arrowSourcePrimaryPlan().map(v => 'views/' + v.id + '/record.json'));
  await save('index.html', '<!-- Native meet root encoding; original none evidence retained. -->\n' + arrowSourcePrimaryIndex(model, records));
  const manifest = Buffer.from(JSON.stringify({schemaVersion: 1, artifacts}, null, 2) + '\n');
  await writeArtifact(out, 'manifest.json', manifest);
  assert.deepEqual(await arrowMeetSources(evidence), sources);
  await publish(arrowMeetEntry(evidence, sources, model, renderer.identity, {file: 'manifest.json', sha256: sha256(manifest), files: Object.keys(artifacts).length}));
} catch (error) {
  process.exitCode = 2;
  await publish({schemaVersion: 1, completed: false, phase, converterInvoked: false, approvedImagePolicy: false,
    imageConformanceClaim: false, renderedViews: records.length, error: error.message.replaceAll(root, '<repo>')});
  console.error(error.stack);
} finally { await renderer?.browser.close(); }
