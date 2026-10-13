import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Fresh native reconstruction and independent saved-PNG measurement.
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root, sha256, outputPath, writeArtifact} from './shape-oracle-bundle.mjs';
import {edgeCanonical} from './edge-log.mjs';
import {loadEdgeEvidence, edgeReference} from './edge-evidence.mjs';
import {readEdgeOriginal} from './edge-oracle.mjs';
import {buildEdgeOracleFrame} from './edge-oracle-frame.mjs';
import {edgeOraclePdfRegions} from './edge-oracle-pdf.mjs';
import {buildEdgePrimaryReference, edgePrimaryContract} from './edge-primary-reference.mjs';
import {edgePrimaryDefects, mutateEdgePrimary} from './edge-primary-defects.mjs';
import {edgePdfSources} from './edge-pdf-sources.mjs';
import {edgePdfViews, edgePdfRoutes, edgePdfCalibratedRoutes, edgePdfViewKey, deriveEdgePdfPolicy, evaluateEdgePdfPolicy} from './edge-pdf-policy.mjs';
import {measureEdgePdfInk} from './edge-pdf-ink.mjs';
import {edgePdfSourceFrame} from './edge-pdf-registration.mjs';
import {edgePdfViewportChanges, edgePdfViewportSvg, measureEdgePdfViewport} from './edge-pdf-viewport.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {shapePdfMetricRecord} from './shape-pdf-trial-policy.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

const base = path.join(root, 'artifacts/edge-pdf-checks'), output = path.join(base, 'run-' + randomUUID()), artifacts = {}, controls = [], native = [];
let phase = 'arguments', renderer, inputReportSha256, metricsRecomputed = 0, inkSumsRecomputed = 0, pagesRecomputed = 0, svgsReconstructed = 0, viewportControlsReplayed = 0;
const normalize = o => JSON.parse(JSON.stringify(o));
async function publish(completed, error) {
  const report = {schemaVersion: 1, comparisonKind: 'independent-edge-pdf-check', completed, phase, inputReportSha256,
    metricsRecomputed, inkSumsRecomputed, pagesRecomputed, svgsReconstructed, viewportControlsReplayed, controls, renderer: renderer?.identity,
    converterInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false, artifacts, ...(error ? {error} : {})};
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n'); await writeArtifact(output, 'report.json', bytes);
  await writeArtifact(base, 'latest.json', JSON.stringify({completed, report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'), sha256: sha256(bytes)}, null, 2) + '\n');
  console.log(JSON.stringify({kind: 'edge-pdf-check', completed, report: path.relative(root, path.join(output, 'report.json')).split(path.sep).join('/'), sha256: sha256(bytes)}));
}
try {
  assert.equal(process.argv.length, 3); assert.match(process.argv[2], /^artifacts\/edge-pdf-calibration\/run-[a-f0-9-]+\/report.json$/);
  const folder = path.dirname(path.join(root, process.argv[2])), read = async p => readFile(await outputPath(folder, p));
  assert.ok((await stat(await outputPath(folder, 'report.json'))).size <= 150000000);
  const bytes = await read('report.json'), report = JSON.parse(bytes); inputReportSha256 = sha256(bytes); await publish(false);
  phase = 'integrity'; assert.deepEqual(Object.keys(report.sourceHashes).sort(), edgePdfSources);
  for (const [p, h] of Object.entries(report.sourceHashes)) {
    assert.equal(sha256(edgeCanonical(await readFile(path.join(root, p)))), h); assert.equal(sha256(await read('source-captures/' + p)), h);
    await writeArtifact(output, 'source-captures/' + p, await read('source-captures/' + p), artifacts);
  }
  for (const [p, h] of Object.entries(report.artifacts)) assert.equal(sha256(await read(p)), h);
  const evidence = await loadEdgeEvidence(); for (const [p, b] of evidence.files) assert.ok(b.equals(await read('evidence/' + p)));
  phase = 'fresh-native-glyphs'; let command;
  try { command = await promisify(execFile)('dotnet', ['run', '--project', 'tools/TikzEdgeOracle', '-c', 'Release', '--', '--out', path.relative(root, path.join(output, 'oracle'))],
    {cwd: root, windowsHide: true, timeout: 180000, maxBuffer: 1000000}); }
  catch (e) { await writeArtifact(output, 'oracle-command.log', (String(e.stdout ?? '') + String(e.stderr ?? '')).replaceAll(root, '<repo>'), artifacts); throw e; }
  await writeArtifact(output, 'oracle-command.log', (command.stdout + command.stderr).replaceAll(root, '<repo>'), artifacts);
  const glyphReport = JSON.parse(await readFile(path.join(output, 'oracle/report.json'))); assert.equal(glyphReport.completed, true); assert.equal(glyphReport.glyphs, 16);
  for (const k of ['converterInvoked', 'approvedImagePolicy', 'imageConformanceClaim']) assert.equal(glyphReport[k], false);
  assert.equal(glyphReport.snapshotSha256, evidence.snapshotSha256);
  assert.ok(glyphReport.oracleAssemblyReferences.length > 0 && glyphReport.oracleAssemblyReferences.every(n => n === 'System' || n.startsWith('System.')));
  for (const [p, h] of Object.entries(glyphReport.artifacts)) { assert.equal(sha256(await readFile(path.join(output, 'oracle', p))), h); artifacts['oracle/' + p] = h; }
  artifacts['oracle/report.json'] = sha256(await readFile(path.join(output, 'oracle/report.json')));
  renderer = await createRenderer(); requireRenderer(renderer.identity, report.renderer); await installShapeMetrics(renderer);
  phase = 'native-reconstruction';
  for (const n of evidence.cases) {
    const id = n.fixture.id, reference = evidence.files.get(edgeReference + id + '/plain-reference.svg').toString('utf8');
    const glyphs = JSON.parse(await readFile(path.join(output, 'oracle', id, 'native-glyphs.json')));
    assert.deepEqual(glyphs, JSON.parse(await read('oracle/' + id + '/native-glyphs.json')));
    const original = await readEdgeOriginal(renderer, reference, n.metrics, glyphs), frame = await buildEdgeOracleFrame(renderer, reference, n.metrics, glyphs, original);
    const built = await buildEdgePrimaryReference(renderer, reference, n.metrics, glyphs, original, frame);
    const c = report.cases.find(c => c.id === id); assert.ok(c); assert.deepEqual(frame, c.frame);
    assert.deepEqual(original, JSON.parse(await read(id + '/original.json'))); assert.deepEqual(frame, JSON.parse(await read(id + '/frame.json')));
    const registered = edgeOraclePdfRegions(n.metrics, frame); assert.deepEqual(c.camera, registered.camera); assert.deepEqual(c.regions, registered.regions);
    for (const k of ['corrections', 'serializationChecks', 'paintChecks', 'rootChecks']) assert.deepEqual(c[k], normalize(built[k]));
    const representations = {'original-driver': reference, 'derived-driver': built.referenceSvg, 'native-semantic': built.nativeSvg};
    for (const route of edgePdfRoutes) { assert.equal(c.svg[route], id + '/' + route + '.svg'); assert.equal((await read(c.svg[route])).toString('utf8'), representations[route]); svgsReconstructed++; }
    assert.deepEqual(c.policies, JSON.parse(await read(id + '/policies.json')));
    const sourceFrames = {}; for (const route of edgePdfRoutes) sourceFrames[route] = await edgePdfSourceFrame(renderer, representations[route], route, frame.origin);
    native.push({id, frame, ...registered, original, built, metrics: n.metrics, sourceFrames, defectFrames: {}});
  }
  phase = 'defect-reconstruction'; for (const d of report.defects) { const n = native.find(n => n.id === d.caseId);
    const svg = await mutateEdgePrimary(renderer, n.built.nativeSvg, n.original, n.metrics, d); assert.equal((await read(d.input)).toString('utf8'), svg);
    n.defectFrames[d.name] = await edgePdfSourceFrame(renderer, svg, 'native-semantic', n.frame.origin); svgsReconstructed++; }
  assert.equal(svgsReconstructed, 28);
  function coverage(r) {
    assert.equal(r.schemaVersion, 1); assert.equal(r.comparisonKind, 'oracle-only-edge-pdf-calibration'); assert.equal(r.completed, true); assert.equal(r.overallVerdict, 'pending');
    assert.equal(r.snapshotSha256, evidence.snapshotSha256); requireRenderer(r.renderer, renderer.identity); assert.deepEqual(Object.keys(r.sourceHashes).sort(), edgePdfSources);
    for (const p of edgePdfSources) assert.equal(r.sourceHashes[p], report.sourceHashes[p]);
    for (const k of ['converterInvoked', 'approvedImagePolicy', 'imageConformanceClaim']) assert.equal(r[k], false);
    assert.deepEqual(r.contract, edgePrimaryContract); assert.deepEqual(r.requiredViews, edgePdfViews); assert.deepEqual(r.routes, edgePdfRoutes); assert.deepEqual(r.calibratedRoutes, edgePdfCalibratedRoutes);
    assert.deepEqual(r.cases.map(c => c.id), native.map(c => c.id));
    const linked = p => { assert.equal(typeof p, 'string'); assert.ok(p && !p.includes(':') && !p.includes('\\') && !p.startsWith('/') && !p.split('/').includes('..')); assert.match(r.artifacts[p] ?? '', /^[a-f0-9]{64}$/); };
    linked('index.html'); let views = 0;
    function rows(c, rows, prefix, route, viewsRequired = edgePdfViews, expectedPassed, sourceFrame) {
      assert.deepEqual(rows.map(edgePdfViewKey), viewsRequired.map(edgePdfViewKey));
      for (const o of rows) {
        assert.equal(o.id, prefix + '/' + edgePdfViewKey(o)); assert.equal(o.route, route); assert.equal(o.mode, c.id + '/' + route); assert.equal(o.converterInvoked, false);
        assert.deepEqual(o.pageSize, c.camera.rasterSizes[o.scale + 'x']); assert.deepEqual(o.repeat, {pdf: {exactRgbaMatch: true, rawChangedPixels: 0, maxRawChannelError: 0}, svg: {exactRgbaMatch: true, rawChangedPixels: 0, maxRawChannelError: 0}});
        assert.deepEqual(o.sourceFrame, sourceFrame ?? native.find(n => n.id === c.id).sourceFrames[route]);
        assert.deepEqual([o.whole, ...o.regions].map((q, i) => Object.fromEntries(Object.keys(c.regions[i]).map(k => [k, q[k]]))), c.regions);
        assert.deepEqual(o.clipFrame, o.frame === 'natural' ? o.sourceFrame : c.regions[0].rectangle);
        assert.equal(o.outsideWholeChangedPixels, 0); assert.ok(o.fullPage.rawChangedPixels >= o.whole.rawChangedPixels);
        for (const k of ['svg-page', 'pdf', 'svg', 'difference', 'amplified', 'overlay', ...(o.scale === 1 ? ['sheet'] : [])]) { assert.equal(o.images[k], o.id + '-' + k + '.png'); linked(o.images[k]); }
        assert.equal(o.crops.length, 2); assert.equal(new Set(o.crops.map(q => q.id)).size, 2);
        for (const crop of o.crops) { assert.ok(c.regions.some(q => q.id === crop.id)); for (const k of ['pdf', 'svg', 'difference', 'amplified', 'overlay', 'sheet']) { assert.equal(crop.images[k], o.id + '-' + crop.id + '-' + k + '.png'); linked(crop.images[k]); } }
        if (expectedPassed !== undefined) { const evaluation = evaluateEdgePdfPolicy(c.policies[route], o); assert.deepEqual(o.evaluation, evaluation); assert.equal(evaluation.passed, expectedPassed); }
        views++;
      }
    }
    for (const [i, c] of r.cases.entries()) {
      const n = native[i]; for (const k of ['frame', 'camera', 'regions']) assert.deepEqual(c[k], n[k]); assert.deepEqual(c.corrections, n.built.corrections);
      assert.deepEqual(Object.keys(c.policies), edgePdfCalibratedRoutes); assert.equal(c.measurements.length, 12); assert.equal(c.replays.length, 8);
      assert.equal(c.viewport.length, 27); assert.deepEqual(c.viewport.map(o => ({route: o.route, name: o.name, side: o.side, amount: o.amount})),
        edgePdfRoutes.flatMap(route => edgePdfViewportChanges.map(change => ({route, ...change}))));
      for (const v of c.viewport) { assert.equal(v.input, c.id + '/viewport/' + v.route + '-' + v.name + '.svg'); linked(v.input);
        assert.deepEqual(v.observations.map(o => o.scale), [1, 4]); for (const o of v.observations) {
          assert.equal(o.regionCount, c.regions.length); assert.equal(o.regionsExact, true); assert.deepEqual(o.fullPage, {exactRgbaMatch: true, rawChangedPixels: 0, maxRawChannelError: 0});
          for (const repeated of Object.values(o.repeat)) assert.deepEqual(repeated, {exactRgbaMatch: true, rawChangedPixels: 0, maxRawChannelError: 0}); } }
      for (const route of edgePdfRoutes) { linked(c.svg[route]); rows(c, c.measurements.filter(o => o.route === route), c.id + '/calibration/' + route, route); }
      for (const route of edgePdfCalibratedRoutes) {
        assert.deepEqual(c.policies[route], deriveEdgePdfPolicy(c.measurements.filter(o => o.route === route), c.camera, c.regions, c.id + '/' + route));
        rows(c, c.replays.filter(o => o.route === route), c.id + '/replay/' + route, route, edgePdfViews, true);
        for (const o of c.replays.filter(o => o.route === route)) { const first = c.measurements.find(q => q.route === route && edgePdfViewKey(q) === edgePdfViewKey(o));
          for (const k of ['whole', 'regions', 'sourceFrame', 'clipFrame', 'fullPage', 'outsideWholeChangedPixels', 'repeat']) assert.deepEqual(o[k], first[k]);
          for (const k of ['svg-page', 'pdf', 'svg', 'difference', 'amplified', 'overlay']) assert.equal(r.artifacts[o.images[k]], r.artifacts[first.images[k]]); }
      }
    }
    assert.deepEqual(r.defects.map((d, i) => Object.fromEntries(Object.keys(edgePrimaryDefects[i] ?? {}).map(k => [k, d[k]]))), edgePrimaryDefects);
    for (const d of r.defects) {
      const c = r.cases.find(c => c.id === d.caseId); assert.equal(d.numericGatesBypassed, true); assert.equal(d.converterInvoked, false); linked(d.input);
      rows(c, d.comparisons, c.id + '/defects/' + d.name, 'native-semantic', edgePdfViews.filter(v => !d.frames || d.frames.includes(v.frame)), false, native.find(n => n.id === c.id).defectFrames[d.name]);
      for (const o of d.comparisons) { assert.equal(o.observedVisible, true); const b = c.measurements.find(q => q.route === 'native-semantic' && edgePdfViewKey(q) === edgePdfViewKey(o));
        assert.notEqual(r.artifacts[o.images['svg-page']], r.artifacts[b.images['svg-page']]); assert.ok(o.evaluation.checks.some(q => q.id === d.target && !q.passed)); assert.ok(o.crops.some(q => q.id === d.target)); }
    }
    assert.equal(views, 150); return views;
  }
  coverage(report);
  phase = 'viewport-replay'; for (const c of report.cases) for (const v of c.viewport) {
    const svg = await edgePdfViewportSvg(renderer, (await read(c.svg[v.route])).toString('utf8'), c, v.route, v);
    assert.equal((await read(v.input)).toString('utf8'), svg); svgsReconstructed++;
    for (const recorded of v.observations) { const baseline = c.measurements.find(o => o.route === v.route && o.frame === 'expanded' && o.scale === recorded.scale);
      assert.deepEqual(await measureEdgePdfViewport(renderer, c, v.route, svg, await read(baseline.images['svg-page']), recorded.scale), recorded); viewportControlsReplayed++; }
    if (v.name === 'bottom-plus') console.log(c.id + '/' + v.route + ': native-page viewport controls replayed.');
  }
  assert.equal(viewportControlsReplayed, 270); assert.equal(svgsReconstructed, 163);
  phase = 'saved-pages';
  for (const c of report.cases) {
    const rows = [...c.measurements, ...c.replays, ...report.defects.filter(d => d.caseId === c.id).flatMap(d => d.comparisons)];
    for (const o of rows) {
      const stored = JSON.parse(await read(o.id + '.json')), {evaluation, observedVisible, ...raw} = o; assert.deepEqual(stored, raw);
      const pdf = evidence.files.get(edgeReference + c.id + '/plain-pdf-page-' + o.scale + 'x.png'), svg = await read(o.images['svg-page']);
      const rectangles = c.regions.map(q => q.rasterRectangles[o.scale + 'x']);
      const decoded = await decodeEdgeOraclePngPair(renderer, [pdf, svg], o.pageSize, rectangles, o.scale, 'white', true);
      assert.deepEqual(decoded.fullPage, o.fullPage); assert.equal(decoded.fullPage.rawChangedPixels - decoded.metrics[0].rawChangedPixels, o.outsideWholeChangedPixels);
      for (const [i, q] of [o.whole, ...o.regions].entries()) assert.deepEqual(shapePdfMetricRecord(q), shapePdfMetricRecord(decoded.metrics[i]));
      const ink = await measureEdgePdfInk(renderer, [pdf, svg], o.pageSize, c.regions, o.scale);
      assert.deepEqual(ink, [o.whole, ...o.regions].map(q => q.inkCoverage)); metricsRecomputed += decoded.metrics.length; inkSumsRecomputed += ink.length * 6; pagesRecomputed++;
    }
    console.log(c.id + ': every saved page, native crop and ink sum remeasured.');
  }
  assert.equal(pagesRecomputed, 150);
  phase = 'viewer'; const html = (await read('index.html')).toString('utf8'), viewerLinks = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
  const expectedLinks = ['report.json', ...report.cases.flatMap(c => c.measurements.filter(o => o.scale === 1).map(o => o.images.sheet)),
    ...report.defects.flatMap(d => d.comparisons.filter(o => o.scale === 1).map(o => o.crops.find(q => q.id === d.target).images.sheet))];
  assert.deepEqual(viewerLinks, expectedLinks); for (const p of viewerLinks) assert.ok((await read(p)).length);
  phase = 'corruption-controls';
  const mutations = [
    ['false-admission', r => r.approvedImagePolicy = true], ['false-converter-role', r => r.converterInvoked = true],
    ['missing-case', r => r.cases.pop()], ['missing-view', r => r.cases[0].measurements.pop()], ['duplicate-view', r => r.cases[0].measurements[1] = r.cases[0].measurements[0]],
    ['missing-replay', r => r.cases[0].replays.pop()], ['changed-origin', r => r.cases[0].camera.origin.x += .25],
    ['changed-crop', r => r.cases[0].regions[0].rasterRectangles['1x'].x++], ['hidden-dot-correction', r => r.cases[4].corrections = []],
    ['widened-limits', r => r.cases[0].policies['native-semantic'].rows[0].regions[0].limits.maxRawChannelError++],
    ['changed-ink-sum', r => r.cases[0].policies['native-semantic'].inkRows[0].regions[0].actual[0]++],
    ['missing-defect', r => r.defects.pop()], ['wrong-defect-target', r => r.defects[0].target = 'path-1'],
    ['numeric-mask', r => r.defects[0].numericGatesBypassed = false], ['invisible-defect-lie', r => r.defects[0].comparisons[0].observedVisible = false],
    ['unchanged-page-substitution', r => { const o = r.defects[0].comparisons[0], c = r.cases[0], b = c.measurements.find(q => q.route === o.route && edgePdfViewKey(q) === edgePdfViewKey(o)); r.artifacts[o.images['svg-page']] = r.artifacts[b.images['svg-page']]; }],
    ['missing-gallery', r => delete r.artifacts['index.html']], ['missing-source', r => delete r.sourceHashes[edgePdfSources[0]]],
    ['failed-repeat', r => r.cases[0].measurements[0].repeat.svg.rawChangedPixels = 1],
    ['outside-picture-ink', r => r.cases[0].measurements[0].outsideWholeChangedPixels = 1],
    ['missing-viewport', r => r.cases[0].viewport.pop()], ['moved-viewport-pixels', r => r.cases[0].viewport[0].observations[0].fullPage.rawChangedPixels = 1]
    ,['changed-source-frame', r => r.cases[0].measurements[0].sourceFrame.x += .25]
  ];
  for (const [name, mutation] of mutations) { const corrupt = structuredClone(report); mutation(corrupt); assert.throws(() => coverage(corrupt), undefined, name); controls.push({name, passed: true}); }
  phase = 'final-integrity'; assert.equal(sha256(await read('report.json')), inputReportSha256);
  for (const [p, h] of Object.entries(report.sourceHashes)) assert.equal(sha256(edgeCanonical(await readFile(path.join(root, p)))), h);
  for (const [p, h] of Object.entries(report.artifacts)) assert.equal(sha256(await read(p)), h);
  const after = await loadEdgeEvidence(); for (const [p, b] of evidence.files) assert.ok(b.equals(after.files.get(p)));
  await publish(true);
} catch (error) { process.exitCode = 2; await publish(false, error.message.replaceAll(root, '<repo>')); console.error(error.stack); }
finally { await renderer?.browser.close(); }
