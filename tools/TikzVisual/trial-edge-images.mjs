import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Public combined trial against separately checked native-only qualifications.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root, sha256, writeArtifact} from './shape-oracle-bundle.mjs';
import {edgeCanonical} from './edge-log.mjs';
import {loadEdgeEvidence, edgeReference} from './edge-evidence.mjs';
import {edgePrimaryViews, edgePrimaryViewKey, evaluateEdgePrimary} from './edge-primary-policy.mjs';
import {edgePdfViews, edgePdfViewKey, evaluateEdgePdfPolicy} from './edge-pdf-policy.mjs';
import {edgePdfSourceFrame} from './edge-pdf-registration.mjs';
import {measureEdgePdfPair} from './edge-pdf-image-pair.mjs';
import {measureEdgePdfInk, attachEdgePdfInk} from './edge-pdf-ink.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {loadEdgeTrialInputs} from './edge-trial-inputs.mjs';
import {buildEdgeDeclaredFrame, evaluateEdgeDeclaredFrame} from './edge-trial-frame.mjs';
import {edgeTrialDefects, mutateEdgeTrial} from './edge-trial-defects.mjs';
import {edgeNativePageVerdict, finishEdgeTrial} from './edge-trial-policy.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';
import {edgeTrialSources} from './edge-trial-sources.mjs';

const base = path.join(root, 'artifacts/edge-public-trial'), output = path.join(base, 'run-' + randomUUID()), artifacts = {}, sourceHashes = {}, cases = [], defects = [];
let phase = 'arguments', renderer, qualification, evidence, numeric, combined, converterInvoked = false;
const relative = p => path.relative(root, p).split(path.sep).join('/');
const save = (p, b) => writeArtifact(output, p, b, artifacts), read = p => readFile(path.join(output, p));
const json = (p, o) => save(p, JSON.stringify(o, null, 2) + '\n');
async function publish(completed, error) {
  const report = {schemaVersion: 1, comparisonKind: 'public-straight-edge-image-trial', completed, phase, converterInvoked,
    approvedImagePolicy: false, imageConformanceClaim: false, overallVerdict: 'pending', sourceHashes,
    qualification: qualification?.records, renderer: renderer?.identity, snapshotSha256: evidence?.snapshotSha256,
    numericReport: numeric ? 'numeric/report.json' : null, cases, defects, combined, artifacts, ...(error ? {error} : {})};
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n'); await writeArtifact(output, 'report.json', bytes);
  await writeArtifact(base, 'latest.json', JSON.stringify({completed, report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'), sha256: sha256(bytes)}, null, 2) + '\n');
  console.log(JSON.stringify({kind: 'edge-public-trial', completed, report: relative(path.join(output, 'report.json')), sha256: sha256(bytes), verdict: combined?.verdict}));
}
async function images(prefix, raster) { const links = {}; for (const [k, b] of Object.entries(raster)) { const p = prefix + '-' + k + '.png'; await save(p, Buffer.from(b, 'base64')); links[k] = p; } return links; }
async function primary(c, prefix, actual, view, targets = [], original = false) {
  const q = qualification.primary.report.cases.find(q => q.id === c.id), reference = await qualification.primary.read(q.svg[original ? 'original' : 'reference']);
  const raw = await measureEdgeTrialPrimary(renderer, {reference: reference.toString('utf8'), actual, origin: q.frame.origin, leftIsDriver: true,
    camera: q.frame.camera, regions: q.frame.regions, ...view, cropLimit: 2, cropRegionIds: targets, referenceLabel: original ? 'Original driver\nDiagnostic' : 'Derived driver\nCorrection recorded'});
  const {images: raster, crops, ...m} = raw, row = {id: prefix, converterInvoked: true, ...view, ...m, images: await images(prefix, raster), crops: []};
  for (const crop of crops) row.crops.push({id: crop.id, presentation: crop.presentation, images: await images(prefix + '-' + crop.id, {...crop.paired, sheet: crop.sheet})});
  if (!original) row.evaluation = evaluateEdgePrimary(qualification.primary.report.policy, c.id, row);
  await json(prefix + '.json', row); return row;
}
async function pdf(c, prefix, svg, view, route, targets = []) {
  const q = qualification.pdf.report.cases.find(q => q.id === c.id), page = evidence.files.get(edgeReference + c.id + '/plain-pdf-page-' + view.scale + 'x.png');
  const raw = await measureEdgePdfPair(renderer, {svg, pdfPage: 'data:image/png;base64,' + page.toString('base64'), camera: q.camera, regions: q.regions,
    ...view, units: route === 'derived-driver' ? 'bp' : 'cssPixels', svgOriginBp: route === 'derived-driver' ? q.frame.origin : {x: 0, y: 0},
    cropLimit: 2, cropRegionIds: targets, rightLabel: route === 'derived-driver' ? 'Derived driver' : 'Public candidate'});
  const attached = attachEdgePdfInk(raw, await measureEdgePdfInk(renderer, [page, Buffer.from(raw.images['svg-page'], 'base64')], raw.pageSize, q.regions, view.scale));
  const {images: raster, crops, ...m} = attached, row = {id: prefix, converterInvoked: true, route, ...m, images: await images(prefix, raster), crops: []};
  for (const crop of crops) row.crops.push({id: crop.id, presentation: crop.presentation, images: await images(prefix + '-' + crop.id, crop.images)});
  row.evaluation = evaluateEdgePdfPolicy(q.policies[route], row); await json(prefix + '.json', row); return row;
}
async function nativePage(c, row) {
  const q = qualification.pdf.report.cases.find(q => q.id === c.id), expected = q.measurements.find(o => o.route === 'native-semantic' && edgePdfViewKey(o) === edgePdfViewKey(row));
  const measurement = await decodeEdgeOraclePngPair(renderer, [await qualification.pdf.read(expected.images['svg-page']), await read(row.images['svg-page'])],
    row.pageSize, q.regions.map(r => r.rasterRectangles[row.scale + 'x']), row.scale, 'white', true);
  return {frame: row.frame, scale: row.scale, background: 'white', referencePage: qualification.pdf.prefix + '/' + expected.images['svg-page'], actualPage: row.images['svg-page'],
    measurement, evaluation: edgeNativePageVerdict(measurement, q.regions)};
}
try {
  assert.equal(process.argv.length, 6, 'Usage: trial-edge-images.mjs <primary report> <primary checker> <PDF report> <PDF checker>'); await publish(false);
  phase = 'sources'; for (const p of edgeTrialSources) { const b = edgeCanonical(await readFile(path.join(root, p))); sourceHashes[p] = sha256(b); await save('source-captures/' + p, b); }
  phase = 'checked-independent-inputs'; qualification = await loadEdgeTrialInputs(Object.fromEntries(['primary', 'primaryCheck', 'pdf', 'pdfCheck'].map((k, i) => [k, process.argv[i + 2]])), save);
  evidence = await loadEdgeEvidence(); assert.equal(evidence.snapshotSha256, qualification.primary.report.snapshotSha256);
  for (const [p, b] of evidence.files) await save('native-inputs/' + p, b);
  renderer = await createRenderer(); requireRenderer(renderer.identity, qualification.primary.report.renderer); await installShapeMetrics(renderer);
  // Declare every expected frame before candidate conversion, using native data.
  const declarations = evidence.cases.map(n => buildEdgeDeclaredFrame(n.metrics, qualification.primary.report.cases.find(c => c.id === n.fixture.id).frame));
  await json('declared-frames.json', declarations);
  phase = 'public-numeric'; converterInvoked = true; let command;
  try { command = await promisify(execFile)('dotnet', ['run', '--project', 'tools/TikzEdgeComparison', '-c', 'Release', '--', '--out', relative(path.join(output, 'numeric'))],
    {cwd: root, windowsHide: true, timeout: 180000, maxBuffer: 1000000}); }
  catch (e) { await save('numeric-command.log', (String(e.stdout ?? '') + String(e.stderr ?? '')).replaceAll(root, '<repo>')); if (e.code !== 1) throw e; }
  if (command) await save('numeric-command.log', (command.stdout + command.stderr).replaceAll(root, '<repo>').replaceAll(relative(output), '<trial>'));
  numeric = JSON.parse(await read('numeric/report.json')); assert.equal(numeric.completed, true); assert.equal(numeric.converterInvoked, true);
  assert.equal(numeric.comparisonKind, 'public-straight-edge-numeric'); assert.equal(numeric.checks, 2585); assert.equal(numeric.snapshotSha256, evidence.snapshotSha256);
  for (const k of ['approvedImagePolicy', 'imageConformanceClaim']) assert.equal(numeric[k], false);
  assert.ok(numeric.converterAssemblyReferences.length > 0 && numeric.converterAssemblyReferences.every(n => n === 'System' || n.startsWith('System.')));
  for (const [p, h] of Object.entries(numeric.artifacts)) { assert.equal(sha256(await read('numeric/' + p)), h); artifacts['numeric/' + p] = h; } artifacts['numeric/report.json'] = sha256(await read('numeric/report.json'));
  for (const [i, native] of evidence.cases.entries()) {
    const id = native.fixture.id, p = qualification.primary.report.cases[i], q = qualification.pdf.report.cases[i], actual = (await read('numeric/' + id + '/actual.svg')).toString('utf8');
    const scene = JSON.parse(await read('numeric/' + id + '/actual-scene.json')), source = (await read('numeric/' + id + '/source.tikz')).toString('utf8');
    const numericChecks = JSON.parse(await read('numeric/' + id + '/numeric.json')), sourceFrame = await edgePdfSourceFrame(renderer, actual, 'native-semantic', p.frame.origin);
    const c = {id, numeric: numericChecks, declared: declarations[i], sourceFrame, frameEvaluation: evaluateEdgeDeclaredFrame(declarations[i], scene, sourceFrame, p.frame),
      corrections: p.corrections, primary: [], originalDiagnostics: [], derivedPdf: [], candidatePdf: [], nativePages: [], sources: []}; cases.push(c);
    c.sources = p.frame.regions.map(r => { const glyph = r.id.startsWith('glyph-'), index = glyph ? Number(r.id.slice(6)) : native.metrics.driverState.paints.findIndex(p => p.pathId === r.nativePathId), op = glyph ? scene.glyphs[index] : scene.paths[index];
      assert.ok(op?.source && Number.isSafeInteger(op.source.offset) && op.source.offset >= 0 && op.source.length > 0 && op.source.offset + op.source.length <= source.length);
      return {regionId: r.id, svgElementId: 'candidate-' + (glyph ? 'g' : 'p') + index, source: op.source, text: source.slice(op.source.offset, op.source.offset + op.source.length)}; });
    phase = id + '/baseline'; for (const view of edgePrimaryViews) c.primary.push(await primary(c, id + '/primary/' + edgePrimaryViewKey(view), actual, view));
    if (c.corrections.length) for (const view of edgePrimaryViews) c.originalDiagnostics.push(await primary(c, id + '/original-driver/' + edgePrimaryViewKey(view), actual, view, ['path-15'], true));
    for (const view of edgePdfViews) {
      c.derivedPdf.push(await pdf(c, id + '/derived-PDF/' + edgePdfViewKey(view), (await qualification.pdf.read(q.svg['derived-driver'])).toString('utf8'), view, 'derived-driver'));
      const row = await pdf(c, id + '/candidate-PDF/' + edgePdfViewKey(view), actual, view, 'native-semantic'); c.candidatePdf.push(row); c.nativePages.push(await nativePage(c, row));
    }
    console.log(id + ': all public baseline gates measured.');
  }
  for (const defect of edgeTrialDefects) {
    phase = 'public-defect/' + defect.name; const c = cases.find(c => c.id === defect.caseId), native = evidence.cases.find(n => n.fixture.id === c.id);
    const svg = await mutateEdgeTrial(renderer, (await read('numeric/' + c.id + '/actual.svg')).toString('utf8'), native.metrics, defect);
    const d = {...defect, input: c.id + '/defects/' + defect.name + '.svg', numericGatesBypassed: true, targetSource: c.sources.find(s => s.regionId === defect.target), primary: [], pdf: []}; defects.push(d); await save(d.input, svg); assert.ok(d.targetSource);
    for (const view of edgePrimaryViews.filter(v => !defect.frames || defect.frames.includes(v.frame))) {
      const row = await primary(c, c.id + '/defects/' + defect.name + '/primary/' + edgePrimaryViewKey(view), svg, view, [defect.target]);
      const baseline = c.primary.find(o => edgePrimaryViewKey(o) === edgePrimaryViewKey(view)); row.observedVisible = artifacts[row.images.actual] !== artifacts[baseline.images.actual]; d.primary.push(row);
    }
    for (const view of edgePdfViews.filter(v => !defect.frames || defect.frames.includes(v.frame))) {
      const row = await pdf(c, c.id + '/defects/' + defect.name + '/PDF/' + edgePdfViewKey(view), svg, view, 'native-semantic', [defect.target]), n = await nativePage(c, row);
      row.nativeMeasurement = n.measurement; row.nativeEvaluation = n.evaluation; row.referencePage = n.referencePage;
      const baseline = c.candidatePdf.find(o => edgePdfViewKey(o) === edgePdfViewKey(view)); row.observedVisible = artifacts[row.images['svg-page']] !== artifacts[baseline.images['svg-page']]; d.pdf.push(row);
    }
    console.log(defect.name + ': public image-only sensitivity measured.');
  }
  phase = 'combined-gates'; combined = finishEdgeTrial(cases, defects, qualification.primary.report.policy, qualification.pdf.report.cases);
  phase = 'viewer'; const escape = t => t.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const links = cases.flatMap(c => [...c.primary.filter(o => o.scale === 1 && o.background === 'white').map(o => o.images.comparison), ...c.candidatePdf.filter(o => o.scale === 1).map(o => o.images.sheet),
    ...c.originalDiagnostics.filter(o => o.scale === 1 && o.background === 'white').map(o => o.images.comparison)]);
  links.push(...defects.flatMap(d => [...d.primary.filter(o => o.scale === 1 && o.background === 'white').map(o => o.crops.find(c => c.id === d.target).images.sheet),
    ...d.pdf.filter(o => o.scale === 1).map(o => o.crops.find(c => c.id === d.target).images.sheet)]));
  const assets = cases.flatMap(c => ['numeric/' + c.id + '/source.tikz', 'numeric/' + c.id + '/actual.svg', 'numeric/' + c.id + '/actual-scene.json', 'numeric/' + c.id + '/numeric.json']);
  for (const p of [...links, ...assets]) assert.ok(artifacts[p]);
  await save('index.html', '<!doctype html><html lang="en"><meta charset="utf-8"><title>Public straight-edge trial</title><style>body{font:16px sans-serif;margin:24px}img{max-width:100%;display:block}pre{white-space:pre-wrap}</style>'
    + '<h1>Public straight-edge combined trial</h1><p>' + combined.verdict + '; image admission pending. Original-driver diagnostics retain the omitted dot. Derived-driver correction and independently reconstructed native pages have separate roles.</p><a href="report.json">Report</a>'
    + assets.map(p => '<p><a href="' + p + '">' + p + '</a></p>').join('') + links.map(p => '<h2>' + p + '</h2><img src="' + p + '">').join('')
    + cases.map(c => '<h2>' + c.id + ' source attribution</h2>' + c.sources.filter(s => !s.regionId.includes('.endpoint-')).map(s => '<p>' + s.regionId + ' → ' + s.svgElementId + ' / ' + s.source.line + ':' + s.source.column + '</p><pre>' + escape(s.text) + '</pre>').join('')).join('') + '</html>');
  phase = 'final-integrity'; for (const [p, h] of Object.entries({...sourceHashes, ...numeric.converterSources, ...numeric.toolHashes})) assert.equal(sha256(edgeCanonical(await readFile(path.join(root, p)))), h);
  for (const input of [qualification.primary, qualification.primaryCheck, qualification.pdf, qualification.pdfCheck]) assert.ok((await input.read('report.json')).equals(input.bytes));
  const after = await loadEdgeEvidence(); for (const [p, b] of evidence.files) assert.ok(b.equals(after.files.get(p)));
  for (const [p, h] of Object.entries(artifacts)) assert.equal(sha256(await read(p)), h); await publish(true); process.exitCode = combined.passed ? 0 : 1;
} catch (error) { process.exitCode = 2; await publish(false, error.message.replaceAll(root, '<repo>')); console.error(error.stack); }
finally { await renderer?.browser.close(); }
