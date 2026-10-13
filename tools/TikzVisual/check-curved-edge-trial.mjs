import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Owned public trial verification: fresh conversion, native frames and saved PNGs.
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root, sha256, outputPath, writeArtifact} from './shape-oracle-bundle.mjs';
import {edgeCanonical} from './curved-edge-log.mjs';
import {loadEdgeEvidence, edgeReference} from './curved-edge-evidence.mjs';
import {edgePrimaryViews, edgePrimaryViewKey, evaluateEdgePrimary, deriveEdgePrimaryPolicy} from './curved-edge-primary-policy.mjs';
import {edgePrimaryContract} from './curved-edge-primary-reference.mjs';
import {edgePdfViews, edgePdfViewKey, evaluateEdgePdfPolicy, deriveEdgePdfPolicy, edgePdfCalibratedRoutes} from './curved-edge-pdf-policy.mjs';
import {shapePdfMetricRecord} from './shape-pdf-trial-policy.mjs';
import {edgePdfSourceFrame} from './curved-edge-pdf-registration.mjs';
import {measureEdgePdfInk} from './edge-pdf-ink.mjs';
import {verifyPdfSavedCrops} from './curved-edge-pdf-crops.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {buildEdgeDeclaredFrame, evaluateEdgeDeclaredFrame, edgeTrialAttribution} from './curved-edge-trial-frame.mjs';
import {edgeTrialDefects, mutateEdgeTrial} from './curved-edge-trial-defects.mjs';
import {edgeNativePageVerdict, finishEdgeTrial} from './curved-edge-trial-policy.mjs';
import {edgeTrialSources} from './curved-edge-trial-sources.mjs';
import {verifyEdgeQualificationSources} from './curved-edge-trial-inputs.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

const base = path.join(root, 'artifacts/curved-edge-public-checks'), output = path.join(base, 'run-' + randomUUID()), artifacts = {}, controls = [];
let phase = 'arguments', renderer, inputReportSha256, converterInvoked = false, primaryMetricsRecomputed = 0, pdfMetricsRecomputed = 0, nativeMetricsRecomputed = 0, pagesRecomputed = 0, numericChecksVerified = 0, svgsReconstructed = 0;
const save = (p, b) => writeArtifact(output, p, b, artifacts), ownRead = p => readFile(path.join(output, p));
const tuple = v => ({frame: v.frame, scale: v.scale, background: v.background});
const metricKeys = ['exactRgbaMatch', 'rawChangedPixels', 'maxRawChannelError', 'premultipliedChangedPixels', 'maxPremultipliedChannelError', 'foregroundPixels', 'referenceForegroundPixels', 'actualForegroundPixels', 'meanForegroundChannelError', 'topology'];
const primaryMetric = r => Object.fromEntries(metricKeys.map(k => [k, r[k]]));
// Saved JSON has one zero; compare reconstruction under the same byte contract.
const jsonRecord = value => JSON.parse(JSON.stringify(value));
async function publish(completed, error) {
  const report = {schemaVersion: 1, comparisonKind: 'independent-public-curved-edge-trial-check', completed, phase, inputReport: process.argv[2], inputReportSha256, primaryMetricsRecomputed, pdfMetricsRecomputed,
    nativeMetricsRecomputed, pagesRecomputed, numericChecksVerified, svgsReconstructed, controls, renderer: renderer?.identity,
    converterInvoked, approvedImagePolicy: false, imageConformanceClaim: false, artifacts, ...(error ? {error} : {})};
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n'); await writeArtifact(output, 'report.json', bytes);
  await writeArtifact(base, 'latest.json', JSON.stringify({completed, report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'), sha256: sha256(bytes)}, null, 2) + '\n');
  console.log(JSON.stringify({kind: 'curved-edge-public-check', completed, report: path.relative(root, path.join(output, 'report.json')).split(path.sep).join('/'), sha256: sha256(bytes)}));
}
try {
  assert.equal(process.argv.length, 3); assert.match(process.argv[2], /^artifacts\/curved-edge-public-trial\/run-[a-f0-9-]+\/report.json$/);
  const directory = path.dirname(path.join(root, process.argv[2])), read = async p => readFile(await outputPath(directory, p));
  assert.ok((await stat(await outputPath(directory, 'report.json'))).size <= 150000000);
  const bytes = await read('report.json'), report = JSON.parse(bytes); inputReportSha256 = sha256(bytes); await publish(false);
  phase = 'source-and-artifact-integrity'; assert.deepEqual(Object.keys(report.sourceHashes), edgeTrialSources);
  for (const [p, h] of Object.entries(report.sourceHashes)) { assert.equal(sha256(edgeCanonical(await readFile(path.join(root, p)))), h); assert.equal(sha256(await read('source-captures/' + p)), h); await save('source-captures/' + p, await read('source-captures/' + p)); }
  for (const [p, h] of Object.entries(report.artifacts)) assert.equal(sha256(await read(p)), h);
  const evidence = await loadEdgeEvidence(); for (const [p, b] of evidence.files) assert.ok(b.equals(await read('native-inputs/' + p)));
  const q = {}; assert.deepEqual(report.qualification.map(r => r.role), ['primary', 'primaryCheck', 'pdf', 'pdfCheck']);
  for (const binding of report.qualification) {
    const b = await read(binding.copiedReport); assert.equal(sha256(b), binding.sha256); q[binding.role] = JSON.parse(b);
    for (const k of ['converterInvoked', 'approvedImagePolicy', 'imageConformanceClaim']) assert.equal(q[binding.role][k], false);
    assert.equal(q[binding.role].completed, true);
    for (const [p, h] of Object.entries(q[binding.role].artifacts)) assert.equal(sha256(await read('qualification/' + binding.role + '/' + p)), h);
    await verifyEdgeQualificationSources(binding.role, b, q[binding.role]);
  }
  for (const role of ['primary', 'pdf']) assert.equal(q[role + 'Check'].inputReportSha256, report.qualification.find(r => r.role === role).sha256);
  const qualificationKinds = {primary: 'oracle-only-curved-edge-primary-calibration', primaryCheck: 'independent-curved-edge-primary-check',
    pdf: 'oracle-only-curved-edge-pdf-calibration', pdfCheck: 'independent-curved-edge-pdf-check'};
  for (const [role, doc] of Object.entries(q)) {
    assert.equal(doc.comparisonKind, qualificationKinds[role]);
    assert.deepEqual(doc.renderer, report.renderer);
    if (role.endsWith('Check')) {
      const count = role === 'primaryCheck' ? 23 : 28;
      assert.equal(doc.controls.length, count); assert.equal(new Set(doc.controls.map(c => c.name)).size, count);
      assert.ok(doc.controls.every(c => c.passed === true));
      assert.equal(doc.svgsReconstructed, role === 'primaryCheck' ? 42 : 124);
      assert.equal(doc.metricsRecomputed, role === 'primaryCheck' ? 31686 : 13714);
      if (role === 'pdfCheck') { assert.equal(doc.pagesRecomputed, 174); assert.equal(doc.viewportControlsReplayed, 180); assert.equal(doc.inkSumsRecomputed, 82284); assert.equal(doc.presentationImagesChecked, 2610); }
    } else {
      assert.deepEqual(doc.contract, edgePrimaryContract); assert.equal(doc.overallVerdict, 'pending');
      assert.equal(doc.snapshotSha256, evidence.snapshotSha256);
      assert.deepEqual(doc.cases.map(c => c.id), ['continuation', 'styles', 'coordinates', 'nodes', 'clipping']);
      if (role === 'primary') assert.deepEqual(doc.policy, deriveEdgePrimaryPolicy(doc.cases));
      else for (const c of doc.cases) for (const route of edgePdfCalibratedRoutes)
        assert.deepEqual(c.policies[route], deriveEdgePdfPolicy(c.measurements.filter(o => o.route === route), c.camera, c.regions, c.id + '/' + route));
    }
  }
  renderer = await createRenderer(); requireRenderer(renderer.identity, report.renderer); requireRenderer(renderer.identity, q.primary.renderer); await installShapeMetrics(renderer);
  const originalNumeric = JSON.parse(await read('numeric/report.json'));
  for (const [p, h] of Object.entries({...originalNumeric.converterSources, ...originalNumeric.toolHashes})) assert.equal(sha256(edgeCanonical(await readFile(path.join(root, p)))), h);
  phase = 'fresh-public-conversion'; let command;
  converterInvoked = true;
  try { command = await promisify(execFile)('dotnet', ['run', '--project', 'tools/TikzCurvedEdgeComparison', '-c', 'Release', '--', '--out', path.relative(root, path.join(output, 'numeric'))], {cwd: root, windowsHide: true, timeout: 180000, maxBuffer: 1000000}); }
  catch (e) { await save('numeric-command.log', String(e.stdout ?? '') + String(e.stderr ?? '')); if (e.code !== 1) throw e; }
  if (command) await save('numeric-command.log', (command.stdout + command.stderr).replaceAll(root, '<repo>'));
  const numeric = JSON.parse(await ownRead('numeric/report.json')); assert.equal(numeric.completed, true); assert.equal(numeric.checks, 2066); assert.deepEqual(numeric.cases, originalNumeric.cases);
  assert.deepEqual(numeric.converterSources, originalNumeric.converterSources); assert.deepEqual(numeric.toolHashes, originalNumeric.toolHashes);
  assert.ok(numeric.converterAssemblyReferences.every(n => n === 'System' || n.startsWith('System.')));
  for (const [p, h] of Object.entries(numeric.artifacts)) { assert.equal(sha256(await ownRead('numeric/' + p)), h); artifacts['numeric/' + p] = h; } artifacts['numeric/report.json'] = sha256(await ownRead('numeric/report.json'));
  phase = 'public-source-frame-reconstruction'; const declarations = [], frames = [];
  for (const [i, n] of evidence.cases.entries()) {
    const id = n.fixture.id, p = q.primary.cases[i], c = report.cases[i], scene = JSON.parse(await ownRead('numeric/' + id + '/actual-scene.json')), svg = (await ownRead('numeric/' + id + '/actual.svg')).toString('utf8');
    assert.equal((await read('numeric/' + id + '/actual.svg')).toString('utf8'), svg); svgsReconstructed++;
    assert.deepEqual(scene, JSON.parse(await read('numeric/' + id + '/actual-scene.json')));
    const source = (await ownRead('numeric/' + id + '/source.tikz')).toString('utf8'), checks = JSON.parse(await ownRead('numeric/' + id + '/numeric.json'));
    assert.deepEqual(jsonRecord(checks), c.numeric); assert.deepEqual(checks, JSON.parse(await read('numeric/' + id + '/numeric.json'))); numericChecksVerified += checks.checks.length;
    const declared = jsonRecord(buildEdgeDeclaredFrame(n.metrics, p.frame)), sourceFrame = jsonRecord(await edgePdfSourceFrame(renderer, svg, 'native-semantic', p.frame.origin));
    assert.deepEqual(declared, c.declared); assert.deepEqual(sourceFrame, c.sourceFrame);
    assert.deepEqual(jsonRecord(evaluateEdgeDeclaredFrame(declared, scene, sourceFrame, p.frame)), c.frameEvaluation); declarations.push(declared); frames.push(sourceFrame);
    assert.deepEqual(edgeTrialAttribution(p.frame.regions, n.metrics, scene, source), c.sources);
  }
  assert.equal(numericChecksVerified, 2066); assert.deepEqual(declarations, JSON.parse(await read('declared-frames.json')));
  for (const d of report.defects) {
    const n = evidence.cases.find(n => n.fixture.id === d.caseId), svg = await mutateEdgeTrial(renderer, (await ownRead('numeric/' + d.caseId + '/actual.svg')).toString('utf8'), n.metrics, d);
    assert.equal((await read(d.input)).toString('utf8'), svg); svgsReconstructed++;
  }
  const linked = (r, p) => { assert.ok(typeof p === 'string' && p && !p.includes(':') && !p.includes('\\') && !p.startsWith('/') && !p.split('/').includes('..')); assert.match(r.artifacts[p] ?? '', /^[a-f0-9]{64}$/); };
  function coverage(r) {
    assert.deepEqual([r.schemaVersion, r.comparisonKind, r.completed, r.converterInvoked, r.approvedImagePolicy, r.imageConformanceClaim, r.overallVerdict], [1, 'public-curved-edge-image-trial', true, true, false, false, 'pending']);
    assert.equal(r.snapshotSha256, evidence.snapshotSha256); requireRenderer(r.renderer, renderer.identity); assert.deepEqual(r.qualification, report.qualification);
    assert.deepEqual(r.sourceHashes, report.sourceHashes); assert.equal(r.numericReport, 'numeric/report.json'); linked(r, 'index.html');
    for (const [i, c] of r.cases.entries()) { assert.deepEqual(c.declared, declarations[i]); assert.deepEqual(c.sourceFrame, frames[i]); assert.deepEqual(c.numeric, report.cases[i].numeric);
      assert.deepEqual(c.frameEvaluation, report.cases[i].frameEvaluation); assert.deepEqual(c.sources, report.cases[i].sources); assert.deepEqual(c.corrections, q.primary.cases[i].corrections);
      assert.deepEqual(c.originalDiagnostics.map(edgePrimaryViewKey), []);
      const all = [...c.primary, ...c.originalDiagnostics, ...c.originalPdf, ...c.candidatePdf];
      for (const o of all) { assert.equal(o.converterInvoked, true); for (const p of Object.values(o.images)) linked(r, p); for (const crop of o.crops) for (const p of Object.values(crop.images)) linked(r, p); }
      for (const o of c.nativePages) { linked(r, o.referencePage); linked(r, o.actualPage); assert.equal(o.referencePage.startsWith('qualification/pdf/'), true); }
    }
    for (const d of r.defects) { linked(r, d.input); assert.deepEqual(d.targetSource, r.cases.find(c => c.id === d.caseId).sources.find(s => s.regionId === d.target));
      for (const o of [...d.primary, ...d.pdf]) { assert.equal(o.converterInvoked, true); for (const p of Object.values(o.images)) linked(r, p); assert.ok(o.crops.some(c => c.id === d.target));
        for (const crop of o.crops) for (const p of Object.values(crop.images)) linked(r, p); }
      const c = r.cases.find(c => c.id === d.caseId); for (const o of d.primary) { const b = c.primary.find(b => edgePrimaryViewKey(b) === edgePrimaryViewKey(o));
        assert.equal(o.observedVisible, r.artifacts[o.images.actual] !== r.artifacts[b.images.actual]); }
      for (const o of d.pdf) { const b = c.candidatePdf.find(b => edgePdfViewKey(b) === edgePdfViewKey(o)); assert.equal(o.observedVisible, r.artifacts[o.images['svg-page']] !== r.artifacts[b.images['svg-page']]); }
    }
    assert.deepEqual(r.combined, finishEdgeTrial(r.cases, r.defects, q.primary.policy, q.pdf.cases));
  }
  coverage(report);
  phase = 'saved-primary-samples';
  for (const c of report.cases) {
    const p = q.primary.cases.find(p => p.id === c.id), rows = [...c.primary, ...c.originalDiagnostics, ...report.defects.filter(d => d.caseId === c.id).flatMap(d => d.primary)];
    for (const o of rows) { const decoded = await decodeEdgeOraclePngPair(renderer, [await read(o.images.reference), await read(o.images.actual)],
      {width: p.frame.camera.width * o.scale, height: p.frame.camera.height * o.scale}, [undefined, ...p.frame.regions.map(r => ({x: r.rectangle.x * o.scale, y: r.rectangle.y * o.scale, width: r.rectangle.width * o.scale, height: r.rectangle.height * o.scale}))], o.scale, o.background);
      assert.deepEqual(primaryMetric(o.metrics), primaryMetric(decoded.metrics[0])); for (const [i, r] of o.regions.entries()) assert.deepEqual(primaryMetric(r), primaryMetric(decoded.metrics[i + 1])); primaryMetricsRecomputed += decoded.metrics.length;
      assert.equal(o.repeat.rawChangedPixels, 0); assert.equal(o.actualRepeat.rawChangedPixels, 0);
    }
    console.log(c.id + ': public primary samples independently remeasured.');
  }
  phase = 'saved-PDF-native-pages';
  for (const c of report.cases) {
    const p = q.pdf.cases.find(p => p.id === c.id), rows = [...c.originalPdf, ...c.candidatePdf, ...report.defects.filter(d => d.caseId === c.id).flatMap(d => d.pdf)];
    for (const o of rows) {
      const page = evidence.files.get(edgeReference + c.id + '/plain-pdf-page-' + o.scale + 'x.png'), actual = await read(o.images['svg-page']);
      const rectangles = p.regions.map(r => r.rasterRectangles[o.scale + 'x']), decoded = await decodeEdgeOraclePngPair(renderer, [page, actual], o.pageSize, rectangles, o.scale, 'white', true);
      assert.deepEqual(decoded.fullPage, o.fullPage); assert.equal(decoded.fullPage.rawChangedPixels - decoded.metrics[0].rawChangedPixels, o.outsideWholeChangedPixels);
      for (const [i, r] of [o.whole, ...o.regions].entries()) assert.deepEqual(shapePdfMetricRecord(r), shapePdfMetricRecord(decoded.metrics[i])); pdfMetricsRecomputed += decoded.metrics.length; pagesRecomputed++;
      await verifyPdfSavedCrops(renderer, [page, actual], o, read);
      const ink = await measureEdgePdfInk(renderer, [page, actual], o.pageSize, p.regions, o.scale); assert.deepEqual(ink, [o.whole, ...o.regions].map(r => r.inkCoverage));
      if (o.route === 'native-semantic') { const reference = p.measurements.find(r => r.route === 'native-semantic' && edgePdfViewKey(r) === edgePdfViewKey(o));
        const measured = await decodeEdgeOraclePngPair(renderer, [await read('qualification/pdf/' + reference.images['svg-page']), actual], o.pageSize, rectangles, o.scale, 'white', true);
        if (o.nativeMeasurement) { assert.deepEqual(measured, o.nativeMeasurement); assert.deepEqual(o.nativeEvaluation, edgeNativePageVerdict(measured, p.regions)); }
        else { const n = c.nativePages.find(r => edgePdfViewKey(r) === edgePdfViewKey(o)); assert.deepEqual(measured, n.measurement); assert.deepEqual(n.evaluation, edgeNativePageVerdict(measured, p.regions)); }
        nativeMetricsRecomputed += measured.metrics.length;
      }
    }
    console.log(c.id + ': public PDF pages, native equality and ink sums independently remeasured.');
  }
  assert.equal(pagesRecomputed, 110); assert.equal(primaryMetricsRecomputed, 22254); assert.equal(pdfMetricsRecomputed, 8994); assert.equal(nativeMetricsRecomputed, 7418); assert.equal(svgsReconstructed, 23);
  phase = 'gallery'; const html = (await read('index.html')).toString('utf8');
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) assert.ok(m[1] === 'report.json' || report.artifacts[m[1]], 'Missing gallery link.');
  phase = 'corruption-controls';
  const mutations = [
    ['false-admission', r => r.approvedImagePolicy = true], ['false-converter-role', r => r.converterInvoked = false], ['missing-case', r => r.cases.pop()],
    ['missing-primary-view', r => r.cases[0].primary.pop()], ['missing-PDF-view', r => r.cases[0].candidatePdf.pop()], ['missing-native-page', r => r.cases[0].nativePages.pop()],
    ['changed-frame', r => r.cases[0].declared.root.minX -= 1], ['changed-numeric', r => r.cases[0].numeric.checks[0].passed = false],
    ['invented-driver-correction', r => r.cases[4].corrections = ['invented']], ['invented-original-diagnostics', r => r.cases[4].originalDiagnostics.push(r.cases[4].primary[0])],
    ['missing-defect', r => r.defects.pop()], ['numeric-mask', r => r.defects[0].numericGatesBypassed = false], ['wrong-defect-target', r => r.defects[0].target = 'path-1'],
    ['false-visibility', r => r.defects[0].primary[0].observedVisible = false], ['missing-source-attribution', r => r.defects[0].targetSource = null],
    ['weakened-native-zero-gate', r => r.cases[0].nativePages[0].evaluation.checks[0].limit = 1], ['false-summary', r => r.combined.passed = !r.combined.passed],
    ['missing-gallery', r => delete r.artifacts['index.html']], ['changed-qualification', r => r.qualification[0].sha256 = '0'.repeat(64)]
  ];
  for (const [name, mutation] of mutations) { const corrupt = structuredClone(report); mutation(corrupt); assert.throws(() => coverage(corrupt), undefined, name); controls.push({name, passed: true}); }
  phase = 'final-integrity'; assert.equal(sha256(await read('report.json')), inputReportSha256);
  for (const [p, h] of Object.entries({...report.sourceHashes, ...originalNumeric.converterSources, ...originalNumeric.toolHashes})) assert.equal(sha256(edgeCanonical(await readFile(path.join(root, p)))), h);
  for (const [p, h] of Object.entries(report.artifacts)) assert.equal(sha256(await read(p)), h); await publish(true);
} catch (error) { process.exitCode = 2; await publish(false, error.message.replaceAll(root, '<repo>')); console.error(error.stack); }
finally { await renderer?.browser.close(); }
