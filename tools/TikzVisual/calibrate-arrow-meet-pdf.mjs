import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root, sha256, outputPath, writeArtifact} from './shape-oracle-bundle.mjs';
import {loadArrowImageCache} from './arrow-image-cache.mjs';
import {assertNativeEqual, arrowMeetPdfSources, loadArrowMeetPdfInput, loadArrowMeetPdfOwned, measureArrowMeetPdfView, arrowMeetPdfEntry, arrowMeetPdfIndex} from './arrow-meet-pdf-contract.mjs';
import {arrowSourcePrimaryReference} from './arrow-source-primary-reference.mjs';
import {arrowSourcePdfPlan, buildArrowSourcePdfExperiment} from './arrow-source-pdf-model.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

const out = await outputPath(path.join(root, 'artifacts/arrow-meet-pdf-calibration/run-' + randomUUID()));
const artifacts = {}, records = [], bases = new Map();
const save = (f, b) => writeArtifact(out, f, b, artifacts), json = (f, v) => save(f, JSON.stringify(v) + '\n');
let renderer, phase = 'arguments';
async function publish(report) {
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n'); await writeArtifact(out, 'report.json', bytes);
  console.log(JSON.stringify({completed: report.completed, phase: report.phase, report: path.relative(root, path.join(out, 'report.json')).split(path.sep).join('/'), sha256: sha256(bytes)}));
}
try {
  const args = process.argv.slice(2); assert.equal(args.length, 2);
  const evidence = await loadArrowImageCache();
  const input = args[0] === '--replay' ? (await loadArrowMeetPdfOwned(args[1], evidence)).input : await loadArrowMeetPdfInput(evidence, ...args);
  const sources = await arrowMeetPdfSources(evidence);
  for (const [f, bytes] of input.files) await save('upstream/' + f, bytes);
  for (const [f, source] of sources) await save('source-captures/' + f, source.bytes);
  await save('native-PDF-report.json', evidence.getRole('pdf', 'report.json'));
  renderer = await createRenderer(); assertNativeEqual(renderer.identity, evidence.reports.pdf.renderer); await installShapeMetrics(renderer);
  for (const c of evidence.native.cases) {
    const frame = evidence.frames.find(f => f.caseId === c.id);
    bases.set(c.id, await arrowSourcePrimaryReference(renderer, c.metrics, frame, evidence.native.artifacts.get(c.id + '/plain-reference.svg').toString()));
  }
  for (const view of arrowSourcePdfPlan()) {
    phase = view.id;
    const {record, captures} = await measureArrowMeetPdfView(renderer, evidence, view, bases.get(view.caseId));
    if (!Object.hasOwn(artifacts, record.files.pdf)) await save(record.files.pdf, evidence.getRole('pdf', record.files.pdf));
    for (const type of ['source', 'scene']) {
      const capture = captures[type], files = record.files[type];
      await save(files.svg, capture.svg); await json(files.numbers, capture.numbers);
      for (const [name, image] of Object.entries(capture.images)) await save(files.images[name], Buffer.from(image, 'base64'));
    }
    const {source, scene, ...meta} = record; await json('views/' + view.id + '/record.json', meta); records.push(record);
    if (view.scale === 4 && view.frame === 'expanded') console.log('Native meet PDF certified: ' + view.id);
  }
  phase = 'coupled-gates'; const model = buildArrowSourcePdfExperiment(records, evidence.frames); assertNativeEqual(model, evidence.pdf);
  for (const evaluation of model.evaluations) await json('views/' + evaluation.view.id + '/gates.json', evaluation);
  await json('policies.json', {policies: model.policies, visibility: model.visibility}); await json('summary.json', model.summary);
  await json('record-index.json', arrowSourcePdfPlan().map(v => 'views/' + v.id + '/record.json')); await save('index.html', arrowMeetPdfIndex(records));
  const manifest = Buffer.from(JSON.stringify({schemaVersion: 1, artifacts}, null, 2) + '\n'); await writeArtifact(out, 'manifest.json', manifest);
  assertNativeEqual(await arrowMeetPdfSources(evidence), sources);
  await publish(arrowMeetPdfEntry(evidence, input, sources, {file: 'manifest.json', sha256: sha256(manifest), files: Object.keys(artifacts).length}));
} catch (error) {
  process.exitCode = 2; await publish({schemaVersion: 1, completed: false, phase, converterInvoked: false, nativeToolInvoked: false,
    approvedImagePolicy: false, imageConformanceClaim: false, renderedViews: records.length, error: error.message.replaceAll(root, '<repo>')}); console.error(error.stack);
} finally { await renderer?.browser.close(); }
