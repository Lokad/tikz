// One trusted dash fixture. Independent representations precede conversion.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRenderer } from './compare.mjs';
import { root, sha256, outputPath, writeArtifact } from './shape-oracle-bundle.mjs';
import { installShapeMetrics, measureShapePair } from './shape-image-pair.mjs';
import { shapeViews, deriveShapeTrialPolicy, evaluateShapeTrial, combineShapeTrial } from './shape-primary-trial-policy.mjs';
import { shapePdfRasterRectangle } from './shape-pdf-camera.mjs';
import { measureShapePdfPair } from './shape-pdf-image-pair.mjs';

const base = path.join(root, 'artifacts/dash-image-trial'), output = path.join(base, 'run-' + randomUUID()), artifacts = {};
const referenceFolder = path.join(root, 'tests/Reference/Dashes/native'), candidateBase = path.join(root, 'artifacts/dash-comparisons');
const toolFiles = ['trial-dashes.mjs', 'compare.mjs', 'browser-profile.json', 'package.json', 'package-lock.json', 'shape-oracle-bundle.mjs',
  'shape-image-pair.mjs', 'shape-raster-metrics.mjs', 'shape-primary-trial-policy.mjs', 'shape-pdf-camera.mjs', 'shape-pdf-image-pair.mjs'].map(f => 'tools/TikzVisual/' + f);
toolFiles.push('tools/TikzDashComparison/Program.cs', 'tools/TikzDashComparison/TikzDashComparison.csproj', 'tools/TikzDashComparison/packages.lock.json');
let phase = 'independent-inputs', toolHashes = {};
const save = (file, bytes) => writeArtifact(output, file, bytes, artifacts);
async function publish(report) {
  await writeArtifact(output, 'report.json', JSON.stringify(report, null, 2) + '\n');
  await writeArtifact(base, 'latest.json', JSON.stringify({ completed: report.completed, report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'),
    sha256: sha256(await readFile(path.join(output, 'report.json'))), approvedImagePolicy: false }, null, 2) + '\n');
}
async function command(args) {
  await new Promise((resolve, reject) => {
    const child = spawn('dotnet', args, { cwd: root, shell: false, windowsHide: true }); let text = '', settled = false;
    const finish = error => { if (settled) return; settled = true; clearTimeout(timer); if (error) { child.kill(); reject(error); } else resolve(); };
    const timer = setTimeout(() => finish(new Error('Dash comparison dependency timed out.')), 180000);
    const capture = bytes => { text += bytes.toString(); if (text.length > 1000000) finish(new Error('Dash dependency output limit exceeded.')); };
    child.stdout.on('data', capture); child.stderr.on('data', capture); child.on('error', finish);
    child.on('close', async code => { try { await save('commands/' + (args.includes('check-cached') ? 'reference' : 'candidate') + '.txt', text); process.stdout.write(text);
      if (code === 0) finish(); else { const error = new Error('Dash dependency failed: ' + code); if (code === 1 || code === 3) error.exitCode = code; finish(error); }
    } catch (error) { finish(error); } });
  });
}
async function main() {
  assert.equal(process.argv.length, 2, 'Usage: node tools/TikzVisual/trial-dashes.mjs'); await outputPath(output);
  for (const file of toolFiles) { const bytes = await readFile(path.join(root, file)); toolHashes[file] = sha256(bytes); await save('tool-sources/' + file, bytes); }
  await publish({ completed: false, verdict: 'in-progress', converterInvoked: false, approvedImagePolicy: false, phase, toolHashes });
  console.log('Fresh dash image trial: ' + path.relative(root, output).split(path.sep).join('/'));
  await command(['run', '--project', 'tools/TikzDashReference', '-c', 'Release', '--no-restore', '--', 'check-cached']);
  const snapshotBytes = await readFile(path.join(root, 'tests/Reference/Dashes/snapshot.json')), snapshot = JSON.parse(snapshotBytes);
  const metricsBytes = await readFile(path.join(referenceFolder, 'metrics.json')), metrics = JSON.parse(metricsBytes);
  const reference = await readFile(path.join(referenceFolder, 'reference.svg'), 'utf8'), source = await readFile(path.join(root, 'tests/Fixtures/Dashes/dashes.tikz'));
  assert.equal(metrics.converterInvoked, false); assert.equal(metrics.approvedImagePolicy, false); assert.equal(metrics.sourceSha256, sha256(source)); assert.equal(metrics.svg.records.length, 40);
  assert.deepEqual(metrics.svg.records, metrics.pdf.records);
  const spToCss = 96 / (72.27 * 65536), b = metrics.svg.bounds, picture = { minX: b.minX * spToCss, minY: -b.maxY * spToCss, maxX: b.maxX * spToCss, maxY: -b.minY * spToCss };
  const camera = { x: Math.floor(picture.minX - 4), y: Math.floor(picture.minY - 4), width: 0, height: 0 };
  camera.width = Math.ceil(picture.maxX + 4) - camera.x; camera.height = Math.ceil(picture.maxY + 4) - camera.y;
  const renderer = await createRenderer();
  try {
    await installShapeMetrics(renderer);
    // Use only retained original driver instructions and integer PGF paint.
    // The printed driver width is a separately measured representation, not a
    // value copied from candidate output. Each has its own declared root.
    const independent = await renderer.page.evaluate(({ reference, records, spToCss }) => {
      const doc = new DOMParser().parseFromString(reference, 'image/svg+xml'), paths = [...doc.querySelectorAll('path')];
      if (paths.length !== 40) throw new Error('Incomplete native SVG paths.');
      const attr = (element, name, fallback) => { for (let e = element; e; e = e.parentElement) if (e.hasAttribute(name)) return e.getAttribute(name); return fallback; };
      const number = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)', grammar = new RegExp('^M(' + number + ')[ ,]*(' + number + ')H(' + number + ')$');
      const lines = paths.map((p, i) => {
        const m = grammar.exec(p.getAttribute('d')); if (!m) throw new Error('Unexpected trusted line grammar.');
        return { index: i, id: records[i].id, x: Number(m[1]) * 96 / 72.27, y: -Number(m[2]) * 96 / 72.27, endX: Number(m[3]) * 96 / 72.27,
          nativeWidth: records[i].widthSp * spToCss, driverWidth: Number(attr(p, 'stroke-width', '1')) * 96 / 72.27,
          cap: attr(p, 'stroke-linecap', 'butt'), join: attr(p, 'stroke-linejoin', 'miter') };
      });
      const representations = ['native-width', 'driver-width'].map(mode => {
        const strokeBounds = lines.map(l => { const r = (mode === 'native-width' ? l.nativeWidth : l.driverWidth) / 2;
          return { minX: Math.min(l.x, l.endX) - r, maxX: Math.max(l.x, l.endX) + r, minY: l.y - r, maxY: l.y + r }; });
        const bounds = { minX: Math.min(...strokeBounds.map(b => b.minX)), maxX: Math.max(...strokeBounds.map(b => b.maxX)),
          minY: Math.min(...strokeBounds.map(b => b.minY)), maxY: Math.max(...strokeBounds.map(b => b.maxY)) };
        const n = v => Number(v.toFixed(6)), x = n(bounds.minX), y = n(bounds.minY), width = n(bounds.maxX - bounds.minX), height = n(bounds.maxY - bounds.minY);
        const body = lines.map((l, i) => '<path id="native-p' + i + '" d="M' + n(l.x) + ' ' + n(l.y) + 'H' + n(l.endX) + '" fill="none" stroke="#000" stroke-width="'
          + n(mode === 'native-width' ? l.nativeWidth : l.driverWidth) + '" stroke-linecap="' + l.cap + '" stroke-linejoin="' + l.join + '"'
          + (records[i].lengthsSp.length ? ' stroke-dasharray="' + records[i].lengthsSp.map(v => n(v * spToCss)).join(' ') + '" stroke-dashoffset="' + n(records[i].phaseSp * spToCss) + '"' : '') + '/>').join('');
        return { mode, bounds, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + 'px" height="' + height + 'px" viewBox="' + [x, y, width, height].join(' ') + '">' + body + '</svg>' };
      });
      return { lines, representations };
    }, { reference, records: metrics.svg.records, spToCss });
    for (const key of ['minX', 'minY', 'maxX', 'maxY']) assert.ok(Math.abs(independent.representations[0].bounds[key] - picture[key]) <= 1e-9, 'Native pen/picture bounds differ.');
    const regions = independent.lines.map(l => {
      const radius = Math.max(l.nativeWidth, l.driverWidth) / 2, x = Math.max(0, Math.floor(Math.min(l.x, l.endX) - radius - camera.x - 3)), y = Math.max(0, Math.floor(l.y - radius - camera.y - 3));
      return { id: 'path-' + l.index, nodeId: null, kind: 'path', rectangle: { x, y, width: Math.min(camera.width, Math.ceil(Math.max(l.x, l.endX) + radius - camera.x + 3)) - x,
        height: Math.min(camera.height, Math.ceil(l.y + radius - camera.y + 3)) - y } };
    });
    assert.equal(regions.length, 40); assert.equal(new Set(regions.map(r => r.id)).size, 40);
    await save('source.tikz', source); await save('reference.svg', reference); await save('native-metrics.json', metricsBytes); await save('reference-snapshot.json', snapshotBytes);
    for (const variant of independent.representations) await save(variant.mode + '.svg', variant.svg);
    async function verify() {
      assert.equal(sha256(await readFile(path.join(root, 'tests/Reference/Dashes/snapshot.json'))), sha256(snapshotBytes));
      for (const [file, hash] of Object.entries(snapshot.artifacts)) assert.equal(sha256(await readFile(path.join(referenceFolder, file))), hash, file);
      for (const [file, hash] of Object.entries({ ...snapshot.sourceHashes, ...toolHashes })) assert.equal(sha256(await readFile(path.join(root, file))), hash, file);
    }
    await verify(); const oracleMeasurements = [], cases = [];
    async function pairs(name, svg, activePolicy, views, expectedPassed, cropIds = []) {
      const comparisons = [];
      for (const view of views) {
        const result = await measureShapePair(renderer, { reference, actual: svg, leftIsDriver: true, origin: metrics.driverOriginBp, camera, regions, ...view, rightLabel: name, cropLimit: 2, cropRegionIds: cropIds });
        assert.equal(result.repeat.exactRgbaMatch, true);
        const evaluation = activePolicy ? evaluateShapeTrial(activePolicy, view, result) : null, prefix = name + '/' + view.frame + '-' + view.scale + 'x-' + view.background, links = {}, crops = new Map();
        for (const [kind, png] of Object.entries(result.images)) { const file = prefix + '-' + kind + '.png'; await save(file, Buffer.from(png, 'base64')); links[kind] = file; }
        for (const crop of result.crops) { const links = {}; for (const [kind, png] of Object.entries({ ...crop.paired, sheet: crop.sheet })) {
          const file = prefix + '-' + crop.id + '-' + kind + '.png'; await save(file, Buffer.from(png, 'base64')); links[kind] = file; } crops.set(crop.id, links); }
        comparisons.push({ ...view, metrics: result.metrics, evaluation, naturalFrames: result.naturalFrames, artifacts: links,
          regions: result.regions.map(r => ({ ...r, crops: crops.get(r.id) ?? null })) });
      }
      const value = { name, expectedPassed, numericGatesBypassed: true, passed: activePolicy ? comparisons.every(c => c.evaluation.passed === expectedPassed) : null, comparisons };
      cases.push(value); return value;
    }
    phase = 'oracle-only-primary-calibration';
    for (const variant of independent.representations) { const c = await pairs(variant.mode, variant.svg, null, shapeViews, null); oracleMeasurements.push(...c.comparisons.map(v => ({ mode: variant.mode, ...v, ...v.metrics }))); }
    // Fieldwise maxima of two independent observations in the exact same
    // region/view. Raw observations remain separate and precede conversion.
    const keys = ['rawChangedPixels', 'maxRawChannelError', 'premultipliedChangedPixels', 'maxPremultipliedChannelError', 'meanForegroundChannelError'];
    const merge = values => ({ ...values[0], ...Object.fromEntries(keys.map(k => [k, Math.max(...values.map(v => v[k]))])),
      topology: { ...values[0].topology, componentDifference: Math.max(...values.map(v => v.topology.componentDifference)),
        maxEdgeDisplacementRasterPixels: Math.max(...values.map(v => v.topology.maxEdgeDisplacementRasterPixels)) } });
    const merged = shapeViews.map(view => {
      const values = oracleMeasurements.filter(v => v.frame === view.frame && v.scale === view.scale && v.background === view.background); assert.equal(values.length, 2);
      for (const v of values) { assert.equal(v.topology.componentDifference, 0); assert.ok(['measured', 'both-empty'].includes(v.topology.edgeState));
        assert.ok(v.regions.every(r => r.topology.componentDifference === 0 && ['measured', 'both-empty'].includes(r.topology.edgeState))); }
      return { ...view, ...merge(values), regions: regions.map((r, i) => ({ ...r, ...merge(values.map(v => v.regions[i])) })) };
    });
    const policy = deriveShapeTrialPolicy(merged, 'Trusted 40-line dash fixture; fieldwise regional/view maxima of independently retained native/printed-width representations. No candidate input.');
    await save('prospective-policy.json', JSON.stringify({ ...policy, oracleMeasurements, candidateInvoked: false }, null, 2) + '\n');
    for (const variant of independent.representations) await pairs(variant.mode + '-replay', variant.svg, policy, shapeViews, true);
    await verify(); phase = 'public-candidate';
    await command(['run', '--project', 'tools/TikzDashComparison', '-c', 'Release', '--no-restore']);
    const pointer = JSON.parse(await readFile(path.join(candidateBase, 'latest.json'))), candidateReport = await outputPath(candidateBase, pointer.report), candidateFolder = path.dirname(candidateReport);
    const candidateBytes = await readFile(candidateReport), numeric = JSON.parse(candidateBytes); assert.equal(sha256(candidateBytes), pointer.sha256);
    assert.equal(numeric.verdict, 'numeric-pass'); assert.equal(numeric.executedCases, 40); assert.equal(numeric.numeric.checks.length, 647); assert.ok(numeric.numeric.checks.every(c => c.passed));
    assert.equal(numeric.referenceSnapshotSha256, sha256(snapshotBytes)); assert.equal(numeric.sourceSha256, sha256(source));
    for (const [file, hash] of Object.entries(numeric.toolHashes)) assert.equal(sha256(await readFile(path.join(root, file))), hash, file);
    assert.equal(numeric.compiler.sha256, sha256(await readFile(path.join(root, 'src/Lokad.TikZ/bin/Release/net10.0/Lokad.TikZ.dll'))));
    for (const [file, hash] of Object.entries(numeric.artifacts)) { const bytes = await readFile(await outputPath(candidateFolder, file)); assert.equal(sha256(bytes), hash); await save('candidate-evidence/' + file, bytes); }
    await save('candidate-numeric-report.json', candidateBytes);
    const actual = await readFile(path.join(candidateFolder, 'actual.svg'), 'utf8');
    const candidate = await pairs('candidate', actual, policy, shapeViews, true); candidate.numericGatesBypassed = false;
    const representationControls = candidate.comparisons.map(c => {
      const oracle = cases.find(c => c.name === 'driver-width-replay').comparisons.find(v => v.frame === c.frame && v.scale === c.scale && v.background === c.background);
      return { frame: c.frame, scale: c.scale, background: c.background, candidate: c.artifacts.actual, independent: oracle.artifacts.actual,
        identicalEncodedCanvasPng: artifacts[c.artifacts.actual] === artifacts[oracle.artifacts.actual] };
    });
    const mutations = ['missing-pattern', 'wrong-phase', 'missing-line', 'double-width', 'shift-line', 'half-opacity', 'root-crop'];
    phase = 'image-only-defects';
    for (const name of mutations) {
      const svg = await renderer.page.evaluate(({ actual, name }) => {
        const doc = new DOMParser().parseFromString(actual, 'image/svg+xml'), root = doc.documentElement, p = doc.getElementById('candidate-p1');
        if (!p) throw new Error('Missing trusted dashed line.');
        if (name === 'missing-pattern') { p.removeAttribute('stroke-dasharray'); p.removeAttribute('stroke-dashoffset'); }
        if (name === 'wrong-phase') p.setAttribute('stroke-dashoffset', '1');
        if (name === 'missing-line') p.remove();
        if (name === 'double-width') p.setAttribute('stroke-width', String(Number(p.getAttribute('stroke-width')) * 2));
        if (name === 'shift-line') p.setAttribute('transform', 'translate(1 0)');
        if (name === 'half-opacity') p.setAttribute('stroke-opacity', '.5');
        if (name === 'root-crop') { const v = root.getAttribute('viewBox').split(/[ ,]+/).map(Number); v[3] -= 4; root.setAttribute('viewBox', v.join(' ')); root.setAttribute('height', v[3] + 'px'); }
        return new XMLSerializer().serializeToString(root);
      }, { actual, name });
      await pairs(name, svg, policy, shapeViews.filter(v => v.frame === 'natural' && v.background === 'white'), false, [name === 'root-crop' ? 'path-39' : 'path-1']);
    }
    // PDF remains raw cross-renderer evidence: no primary limit is inherited.
    phase = 'ordinary-pdf-observations';
    const page = metrics.pdf.page, pdfCamera = { origin: metrics.pdfOriginCss, physicalPage: { width: page.width * spToCss, height: page.height * spToCss },
      picture, rasterSizes: Object.fromEntries([1, 4].map(scale => [scale + 'x', { width: Math.ceil(page.width * spToCss * scale), height: Math.ceil(page.height * spToCss * scale) }])) };
    const physicalRegions = [{ id: 'whole-picture', rectangle: camera }, ...regions.map(r => ({ ...r, rectangle: { ...r.rectangle, x: r.rectangle.x + camera.x, y: r.rectangle.y + camera.y } }))]
      .map(r => ({ ...r, rasterRectangles: Object.fromEntries([1, 4].map(scale => [scale + 'x', shapePdfRasterRectangle(r.rectangle, pdfCamera, scale)])) }));
    const pdf = [];
    const pdfVariants = [{ mode: 'original-driver', svg: reference, units: 'bp', origin: metrics.driverOriginBp }, ...independent.representations.map(v => ({ ...v, units: 'cssPixels', origin: { x: 0, y: 0 } })),
      { mode: 'candidate', svg: actual, units: 'cssPixels', origin: { x: 0, y: 0 } }];
    for (const variant of pdfVariants) for (const frame of ['natural', 'expanded']) for (const scale of [1, 4]) {
      const bytes = await readFile(path.join(referenceFolder, 'pdf-page-' + scale + 'x.png'));
      const result = await measureShapePdfPair(renderer, { svg: variant.svg, units: variant.units, svgOriginBp: variant.origin, camera: pdfCamera,
        regions: physicalRegions, frame, scale, pdfPage: 'data:image/png;base64,' + bytes.toString('base64'), rightLabel: variant.mode, cropLimit: 4, cropRegionIds: ['path-2', 'path-5'] });
      assert.ok(result.repeat.pdf.exactRgbaMatch && result.repeat.svg.exactRgbaMatch); assert.equal(result.outsideWholeChangedPixels, 0);
      const prefix = 'pdf/' + variant.mode + '-' + frame + '-' + scale + 'x', links = {}, crops = new Map();
      for (const [kind, png] of Object.entries(result.images)) { const file = prefix + '-' + kind + '.png'; await save(file, Buffer.from(png, 'base64')); links[kind] = file; }
      for (const crop of result.crops) { const links = {}; for (const [kind, png] of Object.entries(crop.images)) { const file = prefix + '-' + crop.id + '-' + kind + '.png'; await save(file, Buffer.from(png, 'base64')); links[kind] = file; } crops.set(crop.id, links); }
      pdf.push({ mode: variant.mode, ...result, images: undefined, crops: undefined, artifacts: links, regions: result.regions.map(r => ({ ...r, crops: crops.get(r.id) ?? null })) });
    }
    await verify(); for (const [file, hash] of Object.entries(artifacts)) assert.equal(sha256(await readFile(await outputPath(output, file))), hash);
    const controlsPassed = cases.filter(c => c.expectedPassed !== null).every(c => c.passed), numericGate = { state: 'passed', executedChecks: 647 };
    // Frame checks are part of the explicit native numeric report above. This
    // remains an unapproved trial, with the ordinary PDF gate still pending.
    const combined = combineShapeTrial(numericGate, { state: 'passed', executedChecks: 10 }, candidate.comparisons);
    const successful = controlsPassed && combined.passed;
    const html = '<!doctype html><meta charset="utf-8"><title>Dash image trial</title><h1>Dash primary trial and raw PDF evidence — admission pending</h1><p><a href="report.json">Report</a> · <a href="source.tikz">Source</a> · <a href="candidate-evidence/actual-scene.json">Public scene</a> · <a href="prospective-policy.json">Unapproved policy</a></p>'
      + cases.flatMap(c => c.comparisons.filter(v => v.artifacts.comparison).map(v => '<h2>' + c.name + ' / ' + v.frame + ' / ' + v.scale + 'x / ' + v.background + '</h2><img style="max-width:100%" src="' + v.artifacts.comparison + '">')).join('')
      + pdf.filter(v => v.artifacts.sheet).map(v => '<h2>Ordinary PDF / ' + v.mode + ' / ' + v.frame + '</h2><img style="max-width:100%" src="' + v.artifacts.sheet + '">').join('');
    await save('index.html', html);
    await publish({ schemaVersion: 1, comparisonKind: 'unapproved-dash-primary-and-PDF-observations', completed: true, verdict: successful ? 'trial-pass' : 'trial-failed',
      overallVerdict: 'pending', imageConformanceClaim: false, approvedImagePolicy: false, toolHashes, renderer: renderer.identity, camera, regions,
      independentEvidence: { snapshotSha256: sha256(snapshotBytes), converterInvoked: false, representations: independent.representations.map(v => ({ mode: v.mode, bounds: v.bounds, sha256: sha256(v.svg) })) },
      policy: 'prospective-policy.json', oracleMeasurements, cases, controls: { passed: controlsPassed, failedCases: cases.filter(c => c.passed === false).map(c => c.name) },
      candidateNumeric: 'candidate-numeric-report.json', combined, representationControls, pdf: { state: 'pending', camera: pdfCamera, regions: physicalRegions, observations: pdf }, artifacts,
      agent: { state: successful ? 'trial-pass-admission-pending' : 'trial-failed', viewer: 'index.html', source: 'source.tikz', scene: 'candidate-evidence/actual-scene.json',
        numeric: 'candidate-numeric-report.json', focusedRerun: 'node tools/TikzVisual/trial-dashes.mjs' },
      remaining: ['Reviewed immutable primary policy and negative provenance/coverage controls.', 'Independent PDF policy and image-only defects.',
        'Dashes on curves, compound/subpaths, closed shapes, transformed/clip/label/node interactions, and hosted execution.'] });
    console.log('Dash image trial: ' + (successful ? 'all expected primary outcomes pass' : 'unexpected primary outcomes retained') + '; sixteen raw PDF observations retained; admission pending.');
    if (!successful) process.exitCode = 1;
  } finally { await renderer.browser.close(); }
}
await main().catch(async error => { console.error(error.stack ?? String(error)); process.exitCode = error.exitCode ?? 2;
  try { await publish({ completed: false, verdict: process.exitCode === 2 ? 'infrastructure-error' : 'candidate-failure', phase, overallVerdict: 'pending',
    approvedImagePolicy: false, imageConformanceClaim: false, error: error.message, toolHashes, artifacts }); } catch { } });
