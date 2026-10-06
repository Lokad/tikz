// Native-only PDF qualification. Fixed trusted evidence; no converter or TeX.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root, sha256, writeArtifact} from './shape-oracle-bundle.mjs';
import {edgeCanonical} from './edge-log.mjs';
import {loadEdgeEvidence, edgeReference} from './edge-evidence.mjs';
import {readEdgeOriginal} from './edge-oracle.mjs';
import {buildEdgeOracleFrame} from './edge-oracle-frame.mjs';
import {edgeOraclePdfRegions} from './edge-oracle-pdf.mjs';
import {buildEdgePrimaryReference, edgePrimaryContract} from './edge-primary-reference.mjs';
import {edgePrimaryDefects, mutateEdgePrimary} from './edge-primary-defects.mjs';
import {edgePdfSources} from './edge-pdf-sources.mjs';
import {edgePdfViews, edgePdfRoutes, edgePdfCalibratedRoutes, edgePdfViewKey, deriveEdgePdfPolicy, evaluateEdgePdfPolicy} from './edge-pdf-policy.mjs';
import {measureEdgePdfInk, attachEdgePdfInk} from './edge-pdf-ink.mjs';
import {edgePdfViewportChanges, edgePdfViewportSvg, measureEdgePdfViewport} from './edge-pdf-viewport.mjs';
import {measureEdgePdfPair} from './edge-pdf-image-pair.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

const base = path.join(root, 'artifacts/edge-pdf-calibration'), output = path.join(base, 'run-' + randomUUID());
const artifacts = {}, sourceHashes = {}, cases = [], defects = [];
let phase = 'arguments', renderer, evidence;
const save = (p, b) => writeArtifact(output, p, b, artifacts), read = p => readFile(path.join(output, p));
const json = (p, o) => save(p, JSON.stringify(o, null, 2) + '\n');
async function publish(completed, error) {
  const report = {schemaVersion: 1, comparisonKind: 'oracle-only-edge-pdf-calibration', completed, phase,
    converterInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false, overallVerdict: 'pending',
    contract: edgePrimaryContract, requiredViews: edgePdfViews, routes: edgePdfRoutes, calibratedRoutes: edgePdfCalibratedRoutes,
    snapshotSha256: evidence?.snapshotSha256, renderer: renderer?.identity, sourceHashes, cases, defects, artifacts, ...(error ? {error} : {})};
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n'); await writeArtifact(output, 'report.json', bytes);
  await writeArtifact(base, 'latest.json', JSON.stringify({completed, report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'), sha256: sha256(bytes)}, null, 2) + '\n');
  console.log(JSON.stringify({kind: 'edge-pdf-calibration', completed, report: path.relative(root, path.join(output, 'report.json')).split(path.sep).join('/'), sha256: sha256(bytes)}));
}
async function images(prefix, data) {
  const links = {}; for (const [k, png] of Object.entries(data)) { const p = prefix + '-' + k + '.png'; await save(p, Buffer.from(png, 'base64')); links[k] = p; } return links;
}
async function observe(c, prefix, svg, route, view, targets = []) {
  const pdfBytes = evidence.files.get(edgeReference + c.id + '/plain-pdf-page-' + view.scale + 'x.png');
  const result = await measureEdgePdfPair(renderer, {svg, pdfPage: 'data:image/png;base64,' + pdfBytes.toString('base64'),
    ...view, camera: c.camera, regions: c.regions, units: route === 'native-semantic' ? 'cssPixels' : 'bp',
    svgOriginBp: route === 'native-semantic' ? {x: 0, y: 0} : c.frame.origin, cropLimit: 2, cropRegionIds: targets,
    rightLabel: route === 'derived-driver' ? 'Derived driver' : route === 'native-semantic' ? 'Native pt / glyph six' : 'Original driver'});
  assert.deepEqual(result.repeat, {pdf: {exactRgbaMatch: true, rawChangedPixels: 0, maxRawChannelError: 0},
    svg: {exactRgbaMatch: true, rawChangedPixels: 0, maxRawChannelError: 0}});
  const attached = attachEdgePdfInk(result, await measureEdgePdfInk(renderer,
    [pdfBytes, Buffer.from(result.images['svg-page'], 'base64')], result.pageSize, c.regions, view.scale));
  const {images: raster, crops, ...measured} = attached;
  const row = {id: prefix, route, converterInvoked: false, mode: c.id + '/' + route, ...measured,
    images: await images(prefix, raster), crops: []};
  for (const crop of crops) row.crops.push({id: crop.id, presentation: crop.presentation, images: await images(prefix + '-' + crop.id, crop.images)});
  await json(prefix + '.json', row); return row;
}
try {
  assert.equal(process.argv.length, 2); await publish(false);
  phase = 'sources'; for (const p of edgePdfSources) { const b = edgeCanonical(await readFile(path.join(root, p))); sourceHashes[p] = sha256(b); await save('source-captures/' + p, b); }
  evidence = await loadEdgeEvidence(); for (const [p, b] of evidence.files) await save('evidence/' + p, b);
  phase = 'native-glyphs'; let command;
  try { command = await promisify(execFile)('dotnet', ['run', '--project', 'tools/TikzEdgeOracle', '-c', 'Release', '--', '--out', path.relative(root, path.join(output, 'oracle'))],
    {cwd: root, windowsHide: true, timeout: 180000, maxBuffer: 1000000}); }
  catch (e) { await save('oracle-command.log', (String(e.stdout ?? '') + String(e.stderr ?? '')).replaceAll(root, '<repo>')); throw e; }
  await save('oracle-command.log', (command.stdout + command.stderr).replaceAll(root, '<repo>'));
  const glyphReport = JSON.parse(await read('oracle/report.json')); assert.equal(glyphReport.completed, true); assert.equal(glyphReport.glyphs, 16);
  for (const k of ['converterInvoked', 'approvedImagePolicy', 'imageConformanceClaim']) assert.equal(glyphReport[k], false);
  assert.equal(glyphReport.snapshotSha256, evidence.snapshotSha256);
  assert.ok(glyphReport.oracleAssemblyReferences.length > 0 && glyphReport.oracleAssemblyReferences.every(n => n === 'System' || n.startsWith('System.')));
  for (const [p, h] of Object.entries(glyphReport.artifacts)) { assert.equal(sha256(await read('oracle/' + p)), h); artifacts['oracle/' + p] = h; }
  artifacts['oracle/report.json'] = sha256(await read('oracle/report.json'));
  renderer = await createRenderer(); await installShapeMetrics(renderer);
  for (const native of evidence.cases) {
    const id = native.fixture.id, reference = evidence.files.get(edgeReference + id + '/plain-reference.svg').toString('utf8');
    const glyphs = JSON.parse(await read('oracle/' + id + '/native-glyphs.json')), original = await readEdgeOriginal(renderer, reference, native.metrics, glyphs);
    const frame = await buildEdgeOracleFrame(renderer, reference, native.metrics, glyphs, original);
    const built = await buildEdgePrimaryReference(renderer, reference, native.metrics, glyphs, original, frame);
    const c = {id, frame, ...edgeOraclePdfRegions(native.metrics, frame), corrections: built.corrections,
      serializationChecks: built.serializationChecks, paintChecks: built.paintChecks, rootChecks: built.rootChecks,
      svg: Object.fromEntries(edgePdfRoutes.map(route => [route, id + '/' + route + '.svg'])), measurements: [], replays: [], policies: {}, viewport: []};
    cases.push(c); await json(id + '/original.json', original); await json(id + '/frame.json', frame);
    const representations = {'original-driver': reference, 'derived-driver': built.referenceSvg, 'native-semantic': built.nativeSvg};
    for (const route of edgePdfRoutes) {
      await save(c.svg[route], representations[route]); phase = id + '/' + route;
      for (const view of edgePdfViews) c.measurements.push(await observe(c, id + '/calibration/' + route + '/' + edgePdfViewKey(view), representations[route], route, view,
        id === 'clipping' ? ['path-15'] : id === 'nodes' ? ['glyph-12'] : []));
      if (edgePdfCalibratedRoutes.includes(route)) c.policies[route] = deriveEdgePdfPolicy(c.measurements.filter(r => r.route === route), c.camera, c.regions, id + '/' + route);
    }
    await json(id + '/policies.json', c.policies); console.log(id + ': registered PDF observations and independent limits saved.');
  }
  for (const c of cases) for (const route of edgePdfRoutes) {
    phase = c.id + '/viewport/' + route;
    for (const change of edgePdfViewportChanges) {
      const svg = await edgePdfViewportSvg(renderer, (await read(c.svg[route])).toString('utf8'), c, route, change);
      const row = {route, ...change, input: c.id + '/viewport/' + route + '-' + change.name + '.svg', observations: []};
      await save(row.input, svg); c.viewport.push(row);
      for (const scale of [1, 4]) {
        const baseline = c.measurements.find(o => o.route === route && o.frame === 'expanded' && o.scale === scale);
        const measured = await measureEdgePdfViewport(renderer, c, route, svg, await read(baseline.images['svg-page']), scale);
        if (measured.diagnostic) { const {images: raster, crops, ...raw} = measured.diagnostic;
          measured.diagnostic = {...raw, images: await images(c.id + '/viewport/failed-' + route + '-' + change.name + '-' + scale + 'x', raster)}; }
        row.observations.push(measured); assert.equal(measured.fullPage.exactRgbaMatch, true, 'Padded viewport moved native-page pixels.');
        assert.equal(measured.regionsExact, true, 'Padded viewport changed native regions.');
      }
    }
    console.log(c.id + '/' + route + ': padded viewport and eight signed boundary controls preserve page pixels.');
  }
  for (const c of cases) for (const route of edgePdfCalibratedRoutes) {
    phase = c.id + '/replay/' + route;
    for (const view of edgePdfViews) {
      const row = await observe(c, c.id + '/replay/' + route + '/' + edgePdfViewKey(view), (await read(c.svg[route])).toString('utf8'), route, view);
      const first = c.measurements.find(r => r.route === route && edgePdfViewKey(r) === edgePdfViewKey(view));
      for (const k of ['whole', 'regions', 'sourceFrame', 'clipFrame', 'fullPage', 'outsideWholeChangedPixels', 'repeat']) assert.deepEqual(row[k], first[k]);
      for (const k of ['svg-page', 'pdf', 'svg', 'difference', 'amplified', 'overlay']) assert.equal(artifacts[row.images[k]], artifacts[first.images[k]]);
      row.evaluation = evaluateEdgePdfPolicy(c.policies[route], row); assert.equal(row.evaluation.passed, true); c.replays.push(row);
    }
  }
  for (const defect of edgePrimaryDefects) {
    phase = 'defect/' + defect.name; const c = cases.find(c => c.id === defect.caseId), n = evidence.cases.find(n => n.fixture.id === c.id);
    const original = JSON.parse(await read(c.id + '/original.json'));
    const svg = await mutateEdgePrimary(renderer, (await read(c.svg['native-semantic'])).toString('utf8'), original, n.metrics, defect);
    const row = {...defect, numericGatesBypassed: true, converterInvoked: false, input: c.id + '/defects/' + defect.name + '.svg', comparisons: []}; defects.push(row); await save(row.input, svg);
    for (const view of edgePdfViews.filter(v => !defect.frames || defect.frames.includes(v.frame))) {
      const measured = await observe(c, c.id + '/defects/' + defect.name + '/' + edgePdfViewKey(view), svg, 'native-semantic', view, [defect.target]);
      measured.evaluation = evaluateEdgePdfPolicy(c.policies['native-semantic'], measured); row.comparisons.push(measured);
      const unchanged = c.measurements.find(r => r.route === 'native-semantic' && edgePdfViewKey(r) === edgePdfViewKey(view));
      measured.observedVisible = artifacts[measured.images['svg-page']] !== artifacts[unchanged.images['svg-page']];
      assert.equal(measured.observedVisible, true, 'Expected visible PDF defect is quantized away: ' + defect.name);
      assert.equal(measured.evaluation.passed, false, 'Visible PDF defect escaped limits: ' + defect.name);
      assert.ok(measured.evaluation.checks.some(q => q.id === defect.target && !q.passed), 'PDF defect failed outside target: ' + defect.name);
    }
    console.log(defect.name + ': native-page target sensitivity verified.');
  }
  phase = 'viewer'; const links = cases.flatMap(c => c.measurements.filter(r => r.scale === 1).map(r => r.images.sheet));
  links.push(...defects.flatMap(d => d.comparisons.filter(r => r.scale === 1).map(r => r.crops.find(q => q.id === d.target).images.sheet)));
  for (const p of links) assert.ok(artifacts[p]);
  await save('index.html', '<!doctype html><html lang="en"><meta charset="utf-8"><title>Native edge PDF qualification</title><style>body{font:16px sans-serif;margin:24px}img{max-width:100%;display:block}</style>'
    + '<h1>Native-page PDF calibration; admission pending</h1><p>No converter or approved policy. Original driver diagnostics retain the missing dot. Derived-driver correction is explicit in the report. All comparisons use white, fixed page coordinates and integer crops.</p><a href="report.json">Report</a>'
    + links.map(p => '<h2>' + p + '</h2><img src="' + p + '">').join('') + '</html>');
  phase = 'final-integrity'; for (const [p, h] of Object.entries({...sourceHashes, ...glyphReport.sourceHashes})) assert.equal(sha256(edgeCanonical(await readFile(path.join(root, p)))), h);
  const after = await loadEdgeEvidence(); for (const [p, b] of evidence.files) assert.ok(b.equals(after.files.get(p)));
  for (const [p, h] of Object.entries(artifacts)) assert.equal(sha256(await read(p)), h); await publish(true);
} catch (error) { process.exitCode = 2; await publish(false, error.message.replaceAll(root, '<repo>')); console.error(error.stack); }
finally { await renderer?.browser.close(); }
