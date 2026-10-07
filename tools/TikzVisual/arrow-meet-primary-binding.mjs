// Revalidate a bound primary bundle rather than trusting its checker summary.
import assert from 'node:assert/strict';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {rewriteArrowMeetRoot, arrowMeetFiles, arrowMeetControl, buildArrowMeetModel} from './arrow-meet-source-contract.mjs';
import {arrowSourcePrimaryPlan} from './arrow-source-primary-contract.mjs';
import {arrowSourcePrimaryFrame} from './arrow-source-primary-reference.mjs';
import {arrowPrimaryRegions} from './arrow-primary-contract.mjs';
import {arrowSourcePrimaryLabels} from './arrow-source-primary-panels.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {arrowMetrics} from './arrow-native-contract.mjs';

export async function verifyArrowMeetPrimaryView(renderer, evidence, owned, view) {
  const frame = evidence.frames.find(f => f.caseId === view.caseId), regions = arrowPrimaryRegions(frame);
  const original = JSON.parse(evidence.getRole('primary', 'views/' + view.id + '/record.json'));
  const reference = await rewriteArrowMeetRoot(renderer, evidence.getRole('primary', original.files.reference).toString());
  const actual = await rewriteArrowMeetRoot(renderer, evidence.getRole('primary', original.files.actual).toString());
  const files = arrowMeetFiles(view, regions), read = f => {assert.ok(owned.files.has(f), f); return owned.files.get(f);};
  const record = JSON.parse(read(files.record)), numbers = JSON.parse(read(files.numbers));
  assertNativeEqual(record.view, view); assertNativeEqual(record.files, files);
  assertNativeEqual(record.rootProofs, {reference: reference.proof, actual: actual.proof});
  assertNativeEqual(read(files.reference), Buffer.from(reference.svg)); assertNativeEqual(read(files.actual), Buffer.from(actual.svg));
  assertNativeEqual(record.sourceFrame, await arrowSourcePrimaryFrame(renderer, actual.svg, frame.sourceEnvelope));
  const control = arrowMeetControl(view), synthetic = view.kind.startsWith('visibility-');
  const raw = await measureEdgeTrialPrimary(renderer, {reference: reference.svg, actual: actual.svg, leftIsDriver: !synthetic,
    origin: synthetic ? {x: 0, y: 0} : frame.origin, camera: frame.camera, regions, ...view,
    cropLimit: control ? 1 : 0, cropRegionIds: control ? [control.target] : [], ...arrowSourcePrimaryLabels(view)});
  const {images, crops, ...freshNumbers} = raw;
  assertNativeEqual(Object.keys(images), Object.keys(files.images));
  for (const [name, image] of Object.entries(images)) assertNativeEqual(read(files.images[name]), Buffer.from(image, 'base64'), 'Primary SVG/image binding: ' + view.id + '/' + name);
  assertNativeEqual(crops.map(c => ({id: c.id, presentation: c.presentation})), files.crops.map(c => ({id: c.id, presentation: c.presentation})));
  for (const [i, crop] of crops.entries()) for (const [name, image] of Object.entries({...crop.paired, sheet: crop.sheet}))
    assertNativeEqual(read(files.crops[i].images[name]), Buffer.from(image, 'base64'));
  assertNativeEqual(numbers, {...freshNumbers, view, converterInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false});
  const size = {width: frame.camera.width * view.scale, height: frame.camera.height * view.scale};
  const decoded = await decodeEdgeOraclePngPair(renderer, [read(files.images.reference), read(files.images.actual)], size,
    [{x: 0, y: 0, ...size}, ...regions.map(r => Object.fromEntries(Object.entries(r.rectangle).map(([k, n]) => [k, n * view.scale])))], view.scale, view.background);
  assertNativeEqual(decoded.metrics.map(arrowMetrics), [numbers.metrics, ...numbers.regions].map(arrowMetrics));
  return {...record, numbers};
}

export function verifyArrowMeetPrimaryModel(owned, records, check) {
  const model = buildArrowMeetModel(records);
  assertNativeEqual(JSON.parse(owned.files.get('policies.json')), {policies: model.policies, visibility: model.visibility});
  assertNativeEqual(JSON.parse(owned.files.get('summary.json')), model.summary);
  assertNativeEqual(owned.report.summary, model.summary); assertNativeEqual(check.summary, model.summary);
  for (const e of model.evaluations) assertNativeEqual(JSON.parse(owned.files.get('views/' + e.view.id + '/gates.json')), e);
  return model;
}

export async function verifyArrowMeetPrimaryBinding(renderer, evidence, owned, check, progress = () => {}) {
  const records = []; let measurements = 0, images = 0, deltas = 0;
  for (const view of arrowSourcePrimaryPlan()) {
    progress(view); const record = await verifyArrowMeetPrimaryView(renderer, evidence, owned, view);
    if (['defect', 'visibility-missing'].includes(view.kind)) {
      const kind = view.kind === 'defect' ? 'calibration' : 'visibility-calibration';
      const baseline = records.find(r => r.view.caseId === view.caseId && r.view.kind === kind && r.view.frame === view.frame &&
        r.view.scale === view.scale && r.view.background === view.background && (kind === 'calibration' || r.view.name === view.name)); assert.ok(baseline);
      const frame = evidence.frames.find(f => f.caseId === view.caseId), size = {width: frame.camera.width * view.scale, height: frame.camera.height * view.scale};
      const delta = await decodeEdgeOraclePngPair(renderer, [owned.files.get(baseline.files.images.actual), owned.files.get(record.files.images.actual)],
        size, [{x: 0, y: 0, ...size}], view.scale, view.background);
      assertNativeEqual(record.delta, delta.metrics[0]); deltas++;
    } else assert.equal(record.delta, null);
    measurements += record.numbers.regions.length + 1;
    images += Object.keys(record.files.images).length + record.files.crops.reduce((n, c) => n + Object.keys(c.images).length, 0);
    records.push(record);
  }
  const model = verifyArrowMeetPrimaryModel(owned, records, check);
  assertNativeEqual([measurements, images, deltas], [39834, 3057, 210]);
  return {records, model, measurements, images, deltas};
}
