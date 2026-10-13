import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Prospective limits and independent replays precede public conversion.
// Failed sensitivity controls remain evidence; this tool approves no policy.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRenderer } from './compare.mjs';
import { root, sha256, outputPath, writeArtifact } from './shape-oracle-bundle.mjs';
import { installShapeMetrics } from './shape-image-pair.mjs';
import { shapePdfPageCamera, shapePdfRegions } from './shape-pdf-camera.mjs';
import { measureShapePdfPair } from './shape-pdf-image-pair.mjs';
import { shapeViews, combineShapeTrial } from './shape-primary-trial-policy.mjs';
import { shapePdfViews, shapePdfMetricRecord, deriveShapePdfTrialPolicy, evaluateShapePdfTrial, combineShapePdfTrial } from './shape-pdf-trial-policy.mjs';

const base = path.join(root, 'artifacts/node-shape-pdf-trial'), output = path.join(base, 'run-' + randomUUID());
const artifacts = {}, cases = [], toolHashes = {};
let phase = 'initializing';
const relative = file => path.relative(root, file).split(path.sep).join('/');
async function save(file, bytes) { return writeArtifact(output, file, bytes, artifacts); }
async function publish(report) {
  await writeArtifact(output, 'report.json', JSON.stringify(report, null, 2) + '\n');
  await writeArtifact(base, 'latest.json', JSON.stringify({ schemaVersion: 1, completed: report.completed, verdict: report.verdict,
    report: relative(path.join(output, 'report.json')).slice(relative(base).length + 1), sha256: sha256(await readFile(path.join(output, 'report.json'))),
    approvedImagePolicy: false }, null, 2) + '\n');
}
async function command(args, name, allowedCodes = [0]) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', args, { cwd: root, windowsHide: true, shell: false }); let captured = '', settled = false;
    const finish = error => { if (settled) return; settled = true; clearTimeout(timer); if (error) { child.kill(); reject(error); } else resolve(); };
    const timer = setTimeout(() => finish(new Error('PDF trial dependency timed out: ' + name)), 600000);
    const capture = bytes => { captured += bytes.toString(); if (captured.length > 1048576) finish(new Error('PDF trial dependency output limit: ' + name)); };
    child.stdout.on('data', capture); child.stderr.on('data', capture); child.on('error', finish);
    child.on('close', async code => {
      try { await save('commands/' + name + '.txt', captured); process.stdout.write(captured);
        if (!allowedCodes.includes(code)) { const error = new Error('PDF trial dependency failed: ' + name + ', exit ' + code); if (code === 1 || code === 3) error.exitCode = code; finish(error); }
        else finish();
      } catch (error) { finish(error); }
    });
  });
}
async function hashes(folder, entries) { for (const [file, hash] of Object.entries(entries)) assert.equal(sha256(await readFile(await outputPath(folder, file))), hash, file); }
async function main() {
  assert.equal(process.argv.length, 2, 'Usage: node tools/TikzVisual/trial-shape-pdf.mjs'); await outputPath(output);
  const tools = ['trial-shape-pdf.mjs', 'shape-pdf-trial-policy.mjs', 'shape-pdf-policy-self-test.mjs', 'shape-pdf-camera.mjs', 'shape-pdf-image-pair.mjs',
    'shape-image-pair.mjs', 'shape-raster-metrics.mjs', 'shape-frame-math.mjs', 'shape-oracle-bundle.mjs', 'shape-primary-trial-policy.mjs', 'compare.mjs',
    'browser-profile.json', 'package.json', 'package-lock.json'].map(f => 'tools/TikzVisual/' + f);
  for (const file of tools) { const bytes = await readFile(path.join(root, file)); toolHashes[file] = sha256(bytes); await save('tool-sources/' + file, bytes); }
  await publish({ schemaVersion: 1, completed: false, verdict: 'in-progress', phase, approvedImagePolicy: false, imageConformanceClaim: false, toolHashes });
  console.log('Fresh PDF trial directory: ' + relative(output));
  phase = 'policy-controls'; await command(['tools/TikzVisual/shape-pdf-policy-self-test.mjs'], 'policy-controls');
  phase = 'fresh-independent-calibration'; await command(['tools/TikzVisual/calibrate-shape-pdf.mjs'], 'independent-calibration');
  const calibrationBase = path.join(root, 'artifacts/node-shape-pdf-calibration');
  const pointer = JSON.parse(await readFile(path.join(calibrationBase, 'latest.json')));
  assert.equal(pointer.completed, true);
  const calibrationReport = await outputPath(calibrationBase, pointer.report), folder = path.dirname(calibrationReport);
  const evidenceBytes = await readFile(calibrationReport), evidence = JSON.parse(evidenceBytes); assert.equal(sha256(evidenceBytes), pointer.sha256);
  assert.equal(evidence.comparisonKind, 'oracle-only-curved-node-pdf-calibration'); assert.equal(evidence.completed, true);
  assert.equal(evidence.converterInvoked, false); assert.equal(evidence.conformanceClaim, false); assert.equal(evidence.approvedImagePolicy, false);
  assert.deepEqual(evidence.expectedVariants, ['original-driver', 'driver-css', 'native-css-12', 'native-css-6', 'sp-plus', 'sp-minus', 'native-semantic-css-6']);
  assert.deepEqual(evidence.expectedFrames, ['natural', 'expanded']); assert.deepEqual(evidence.expectedScales, [1, 4]); assert.equal(evidence.background, 'white');
  assert.equal(evidence.measurements.length, 28); assert.equal(evidence.repeatability.captures.length, 28);
  assert.ok(evidence.repeatability.captures.every(c => c.pdf.exactRgbaMatch && c.svg.exactRgbaMatch));
  assert.equal(evidence.cameraControls.passed, true); assert.equal(evidence.cameraControls.controls, 54); assert.equal(evidence.cameraControls.requiredRegionChecks, 5346);
  const frameBytes = await readFile(await outputPath(folder, evidence.independentEvidence.frames)), frames = JSON.parse(frameBytes);
  const derivationBytes = await readFile(await outputPath(folder, evidence.independentEvidence.derivation)), derivation = JSON.parse(derivationBytes);
  assert.equal(sha256(frameBytes), evidence.independentEvidence.framesSha256); assert.equal(sha256(derivationBytes), evidence.independentEvidence.derivationSha256);
  assert.equal(frames.converterInvoked, false); assert.equal(frames.completed, true); assert.equal(frames.checks.length, 98);
  assert.equal(sha256(derivationBytes), frames.derivation.sha256); assert.equal(derivation.converterInvoked, false);
  assert.deepEqual(derivation.counts, { nodes: 28, pathTokens: 420, glyphs: 70 }); assert.equal(frames.analyticBrowserValidation.checks.length, 214);
  assert.ok(frames.analyticBrowserValidation.checks.every(c => c.passed)); assert.ok(derivation.evidence.frameworkReferences.every(n => n === 'System' || n.startsWith('System.')));
  const pdfBytes = await readFile(path.join(folder, 'pdf-metrics.json')), pdf = JSON.parse(pdfBytes);
  assert.equal(pdf.nativeRecordCount, 1810); assert.equal(pdf.converterInvoked, false); assert.equal(evidence.independentEvidence.nativeRecordCount, 1810);
  const camera = shapePdfPageCamera(pdf.measurement, pdf.rasterSizes), regions = shapePdfRegions(frames, camera);
  assert.deepEqual(camera, evidence.camera); assert.deepEqual(regions, evidence.regions);
  const policies = Object.fromEntries([['original', 'original-driver'], ['candidate', 'native-semantic-css-6']].map(([name, mode]) =>
    [name, deriveShapePdfTrialPolicy(evidence.measurements.filter(m => m.mode === mode), camera, regions, mode)]));
  await save('prospective-policy.json', JSON.stringify({ schemaVersion: 1, converterInvoked: false, approvedImagePolicy: false,
    calibration: { path: relative(calibrationReport), sha256: sha256(evidenceBytes) }, policies }, null, 2) + '\n');
  await save('independent-calibration.json', evidenceBytes); await save('independent-frames.json', frameBytes); await save('independent-derivation.json', derivationBytes);
  await save('pdf-metrics.json', pdfBytes); await save('source.tikz', await readFile(path.join(folder, 'oracle/source.tikz')));
  async function verify() {
    assert.equal(sha256(await readFile(calibrationReport)), sha256(evidenceBytes));
    await hashes(folder, evidence.artifacts); await hashes(path.join(folder, 'oracle'), { ...derivation.evidence.artifacts, ...frames.artifacts });
    for (const [file, hash] of Object.entries({ ...derivation.evidence.toolHashes, ...frames.toolHashes, ...evidence.toolHashes, ...toolHashes }))
      assert.equal(sha256(await readFile(path.join(root, file))), hash, 'Changed experiment tool: ' + file);
    assert.equal(sha256(await readFile(path.join(folder, evidence.independentEvidence.pdfSnapshot))), evidence.independentEvidence.pdfSnapshotSha256);
  }
  await verify();
  const renderer = await createRenderer();
  try {
    requireRenderer(renderer.identity, evidence.renderer); await installShapeMetrics(renderer);
    const pdfPages = {};
    for (const scale of [1, 4]) { const bytes = await readFile(path.join(folder, 'pdf-page-' + scale + 'x.png')); pdfPages[scale] = 'data:image/png;base64,' + bytes.toString('base64'); await save('pdf-page-' + scale + 'x.png', bytes); }
    async function compareCase(name, svg, units, origin, policy, views, expectedPassed, targets = [], sources = null) {
      await save(name + '/actual.svg', svg); const comparisons = [];
      for (const view of views) {
        const result = await measureShapePdfPair(renderer, { svg, units, svgOriginBp: origin, camera, regions, ...view,
          pdfPage: pdfPages[view.scale], cropLimit: 3, cropRegionIds: targets, rightLabel: name });
        const evaluation = evaluateShapePdfTrial(policy, view, result), prefix = name + '/' + view.frame + '-' + view.scale + 'x', links = {}, crops = new Map();
        for (const [kind, png] of Object.entries(result.images)) { const file = prefix + '-' + kind + '.png'; await save(file, Buffer.from(png, 'base64')); links[kind] = file; }
        for (const crop of result.crops) {
          const links = {}; for (const [kind, png] of Object.entries(crop.images)) { const file = prefix + '-' + crop.id + '-' + kind + '.png'; await save(file, Buffer.from(png, 'base64')); links[kind] = file; }
          crops.set(crop.id, { ...links, presentation: crop.presentation });
        }
        comparisons.push({ ...result, images: undefined, crops: undefined, evaluation, artifacts: links,
          regions: result.regions.map(r => ({ ...r, source: sources?.get(r.id) ?? null, crops: crops.get(r.id) ?? null })) });
        console.log(name + ' ' + view.frame + ' ' + view.scale + 'x: ' + (evaluation.passed ? 'trial pass' : 'trial rejection') + ', global ' + evaluation.globalPassed + ', local ' + evaluation.regionalPassed + '.');
      }
      const value = { name, expectedPassed, passed: comparisons.every(c => c.evaluation.passed === expectedPassed), numericGatesBypassed: true, comparisons };
      cases.push(value); return value;
    }
    function replay(value, mode) {
      for (const m of value.comparisons) {
        const original = evidence.measurements.find(r => r.mode === mode && r.frame === m.frame && r.scale === m.scale); assert.ok(original);
        assert.deepEqual(shapePdfMetricRecord(m.whole), shapePdfMetricRecord(original.whole));
        assert.deepEqual(m.regions.map(shapePdfMetricRecord), original.regions.map(shapePdfMetricRecord));
        assert.deepEqual(m.fullPage, original.fullPage); assert.deepEqual(m.repeat, original.repeat);
      }
    }
    phase = 'independent-replays';
    const originalSvg = await readFile(path.join(folder, 'original-driver.svg'), 'utf8'), nativeSvg = await readFile(path.join(folder, 'native-semantic-css-6.svg'), 'utf8');
    const original = await compareCase('original-replay', originalSvg, 'bp', derivation.originBp, policies.original, shapePdfViews, true); replay(original, 'original-driver');
    const native = await compareCase('native-replay', nativeSvg, 'cssPixels', { x: 0, y: 0 }, policies.candidate, shapePdfViews, true); replay(native, 'native-semantic-css-6');
    await verify();
    // No candidate execution above this point. Both PDF policies are already fixed.
    phase = 'fresh-public-primary-numeric-frame'; await command(['tools/TikzVisual/trial-shape-primary.mjs'], 'public-primary', [0, 1]);
    const primaryFolder = path.join(root, 'artifacts/node-shape-primary-trial'), primaryBytes = await readFile(path.join(primaryFolder, 'report.json')), primary = JSON.parse(primaryBytes);
    assert.equal(primary.completed, true); assert.equal(primary.comparisonKind, 'unapproved-shape-primary-policy-trial'); assert.equal(primary.imageConformanceClaim, false);
    await hashes(primaryFolder, primary.artifacts);
    for (const [file, hash] of Object.entries(primary.artifacts)) await save('primary/' + file, await readFile(await outputPath(primaryFolder, file)));
    await save('primary/report.json', primaryBytes);
    for (const [file, hash] of Object.entries(primary.toolHashes)) { const bytes = await readFile(path.join(root, file)); assert.equal(sha256(bytes), hash); await save('tool-sources/' + file, bytes); }
    const numericBytes = await readFile(path.join(primaryFolder, 'candidate-numeric-report.json')), numeric = JSON.parse(numericBytes);
    const frameReport = JSON.parse(await readFile(path.join(primaryFolder, 'candidate-frame-report.json')));
    assert.equal(numeric.numeric.checks.length, 4461); assert.equal(frameReport.numeric.checks.length, 406);
    const primaryCandidate = primary.cases.find(c => c.name === 'candidate'); assert.ok(primaryCandidate && !primaryCandidate.numericGatesBypassed);
    const numericGate = { state: numeric.numeric.checks.every(c => c.passed) ? 'passed' : 'failed', executedChecks: numeric.numeric.checks.length };
    const frameGate = { state: frameReport.numeric.checks.every(c => c.passed) ? 'passed' : 'failed', executedChecks: frameReport.numeric.checks.length };
    const primaryCombined = combineShapeTrial(numericGate, frameGate, primaryCandidate.comparisons, shapeViews);
    assert.equal(primaryCombined.passed, primary.combined.passed); assert.equal(primaryCombined.primary.executedViews, 12);
    const actual = await readFile(path.join(primaryFolder, 'candidate/actual.svg'), 'utf8'), scene = JSON.parse(await readFile(path.join(primaryFolder, 'actual-scene.json')));
    assert.equal(sha256(await readFile(path.join(primaryFolder, 'source.tikz'))), artifacts['source.tikz']); assert.equal(sha256(actual), primary.artifacts['candidate/actual.svg']);
    assert.deepEqual([scene.nodes.length, scene.paths.length, scene.glyphs.length], [28, 28, 70]);
    const sources = new Map(regions.slice(1).map(r => {
      const operation = r.kind === 'glyph' ? scene.glyphs[Number(r.id.slice(6))] : scene.paths[scene.nodes.findIndex(n => n.name === r.nodeId)]; assert.ok(operation);
      return [r.id, { semanticId: operation.semanticId, svgElementId: operation.svgElementId, span: operation.source,
        attribution: 'Unmutated public scene operation. Overlapping independent crops locate discrepancies and do not alone prove causation.' }];
    }));
    phase = 'candidate-pdf';
    const candidate = await compareCase('candidate', actual, 'cssPixels', { x: 0, y: 0 }, policies.candidate, shapePdfViews, true, [], sources); candidate.numericGatesBypassed = false;
    const combined = combineShapePdfTrial(numericGate, frameGate, { state: primaryCombined.primary.state, executedChecks: primaryCandidate.comparisons.reduce((n, c) => n + c.evaluation.checks.length, 0) }, original.comparisons, candidate.comparisons, policies);
    const representationControls = candidate.comparisons.map(c => { const n = native.comparisons.find(v => v.frame === c.frame && v.scale === c.scale);
      return { frame: c.frame, scale: c.scale, candidate: c.artifacts['svg-page'], native: n.artifacts['svg-page'], identicalEncodedCanvasPng: artifacts[c.artifacts['svg-page']] === artifacts[n.artifacts['svg-page']] }; });
    const periodIndex = Number(regions.find(r => r.nodeId === 'c-period' && r.kind === 'glyph').id.slice(6)), fontIndex = Number(regions.find(r => r.nodeId === 'c-font' && r.kind === 'glyph').id.slice(6));
    const regularIndex = frames.checks.filter(r => r.kind === 'background').findIndex(r => r.nodeId === 'c-regular');
    const mutations = [{ name: 'missing-period', target: 'glyph-' + periodIndex }, { name: 'missing-font-glyph', target: 'glyph-' + fontIndex },
      { name: 'missing-border', target: 'shape-c-regular' }, { name: 'double-border', target: 'shape-c-regular' }, { name: 'shift-glyph', target: 'glyph-0' },
      { name: 'half-opacity', target: 'glyph-' + fontIndex }, { name: 'quarter-pixel-shift', target: 'shape-c-font' }, { name: 'height-crop', target: 'shape-c-shear' },
      { name: 'extra-ink', target: null }, { name: 'extra-outside-whole', target: null }];
    phase = 'image-only-defects';
    for (const mutation of mutations) {
      const changed = await renderer.page.evaluate(({ actual, name, periodIndex, fontIndex, regularIndex }) => {
        const doc = new DOMParser().parseFromString(actual, 'image/svg+xml'), svg = doc.documentElement;
        const selected = id => { const element = doc.getElementById(id); if (!element) throw new Error('Missing mutation operation ' + id); return element; };
        if (name === 'missing-period') selected('candidate-g' + periodIndex).remove();
        if (name === 'missing-font-glyph') selected('candidate-g' + fontIndex).remove();
        if (name === 'missing-border') selected('candidate-p' + regularIndex).remove();
        if (name === 'double-border') { const p = selected('candidate-p' + regularIndex); p.setAttribute('stroke-width', String(Number(p.getAttribute('stroke-width')) * 2)); }
        if (name === 'shift-glyph') { const p = selected('candidate-g0'), m = p.getAttribute('transform').match(/^matrix\(([^)]+)\)$/)[1].split(/[ ,]+/).map(Number); m[4] += 1; p.setAttribute('transform', 'matrix(' + m.join(' ') + ')'); }
        if (name === 'half-opacity') selected('candidate-g' + fontIndex).setAttribute('opacity', '.5');
        if (name === 'quarter-pixel-shift') { const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('transform', 'translate(.25 .125)'); while (svg.firstChild) g.append(svg.firstChild); svg.append(g); }
        if (name === 'height-crop') { const v = svg.getAttribute('viewBox').split(/[ ,]+/).map(Number); v[3] -= 4; svg.setAttribute('viewBox', v.join(' ')); svg.setAttribute('height', v[3] + 'px'); }
        if (name === 'extra-ink' || name === 'extra-outside-whole') {
          const p = doc.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', name === 'extra-ink' ? 'M130 600h2v2h-2Z' : 'M150 600h3v3h-3Z'); p.setAttribute('fill', '#000'); svg.append(p);
          if (name === 'extra-outside-whole') { const v = svg.getAttribute('viewBox').split(/[ ,]+/).map(Number); v[2] += 40; svg.setAttribute('viewBox', v.join(' ')); svg.setAttribute('width', v[2] + 'px'); }
        }
        return new XMLSerializer().serializeToString(svg);
      }, { actual, name: mutation.name, periodIndex, fontIndex, regularIndex });
      assert.notEqual(changed, actual); await compareCase(mutation.name, changed, 'cssPixels', { x: 0, y: 0 }, policies.candidate,
        shapePdfViews.filter(v => v.frame === 'natural'), false, mutation.target ? [mutation.target] : [], sources);
    }
    phase = 'final-integrity'; await verify(); assert.equal(sha256(await readFile(path.join(primaryFolder, 'report.json'))), sha256(primaryBytes)); await hashes(output, artifacts);
    const controlsPassed = cases.every(c => c.passed), passed = controlsPassed && combined.passed && primary.controls.passed;
    const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
    const html = '<!doctype html><meta charset="utf-8"><title>Curved-node PDF policy trial</title><h1>Circle/ellipse PDF policy trial — admission pending</h1><p>Prospective per-region/view limits are fixed from independent representations before public conversion. Unexpected control outcomes stay visible.</p>'
      + '<p><a href="report.json">Report</a> · <a href="source.tikz">TikZ source</a> · <a href="prospective-policy.json">Unapproved policy</a> · <a href="primary/index.html">Fresh primary/numeric/frame bundle</a></p>'
      + cases.map(c => '<h2>' + escape(c.name) + ': ' + (c.passed ? 'expected outcome' : 'UNEXPECTED outcome') + '</h2>' + c.comparisons.map(v =>
        '<p>' + escape(v.frame) + ' ' + v.scale + 'x: ' + (v.evaluation.passed ? 'trial pass' : 'trial rejection') + ' · <a href="' + escape(v.artifacts.svg) + '">SVG PNG</a> · <a href="' + escape(v.artifacts.pdf) + '">PDF PNG</a></p>'
        + (v.artifacts.sheet ? '<img style="max-width:100%" src="' + escape(v.artifacts.sheet) + '">' : '')
        + v.regions.filter(r => r.crops).map(r => '<p>' + escape(r.id) + '</p><img style="max-width:100%" src="' + escape(r.crops.sheet) + '">').join('')).join('')).join('');
    await save('index.html', html); await hashes(output, artifacts);
    const failedCases = cases.filter(c => !c.passed).map(c => c.name);
    await publish({ schemaVersion: 1, comparisonKind: 'unapproved-shape-pdf-policy-trial', completed: true, verdict: passed ? 'trial-pass' : 'trial-failed',
      overallVerdict: 'pending', imageConformanceClaim: false, approvedImagePolicy: false, generatedUtc: new Date().toISOString(),
      scope: 'Trusted 28-node fixture. Four views per positive gate; two natural white views per image-only defect. Original-driver and native-semantic representations have separate oracle-only policies.',
      calibration: { path: relative(calibrationReport), sha256: sha256(evidenceBytes) }, primary: { report: 'primary/report.json', sha256: sha256(primaryBytes) },
      toolHashes, renderer: renderer.identity, camera, regions, policies: 'prospective-policy.json', combined, representationControls,
      controls: { passed: controlsPassed, cases: cases.length, failedCases }, cases, artifacts,
      agent: { state: passed ? 'trial-pass-admission-pending' : 'trial-failed', firstPendingRequiredGate: 'reviewed-immutable-primary-PDF-admission',
        viewer: 'index.html', report: 'report.json', source: 'source.tikz', scene: 'primary/actual-scene.json', numeric: 'primary/candidate-numeric-report.json',
        frame: 'primary/candidate-frame-report.json', policy: 'prospective-policy.json', focusedRerun: 'node tools/TikzVisual/trial-shape-pdf.mjs',
        controls: 'node tools/TikzVisual/shape-pdf-policy-self-test.mjs', failedCases },
      remaining: ['Investigate any unexpected sensitivity outcomes without candidate-based limit changes.', 'Reviewed immutable primary/PDF policy and provenance/coverage controls.',
        'Focused and interaction fixtures, broader M0–M4 implementation and hosted execution.'] });
    console.log('Shape PDF trial: ' + cases.length + ' cases; ' + (passed ? 'all expected outcomes pass' : 'unexpected outcomes retained: ' + failedCases.join(', ')) + '. Admission remains pending.');
    if (!passed) process.exitCode = 1;
  } finally { await renderer.browser.close(); }
}
await main().catch(async error => { console.error(error.stack ?? String(error)); process.exitCode = error.exitCode ?? 2;
  try { await publish({ schemaVersion: 1, completed: false, verdict: process.exitCode === 2 ? 'infrastructure-error' : 'candidate-or-trial-failure', phase,
    overallVerdict: 'pending', imageConformanceClaim: false, approvedImagePolicy: false, error: error.message, toolHashes, artifacts, cases }); } catch { }
});
