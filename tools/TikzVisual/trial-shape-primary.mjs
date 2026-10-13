import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Unapproved fixture-only primary policy trial. Independent expectations and
// limits are established before invoking the public converter.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRenderer } from './compare.mjs';
import { root, sha256, outputPath, writeArtifact } from './shape-oracle-bundle.mjs';
import { unionBounds } from './shape-frame-math.mjs';
import { installShapeMetrics, measureShapePair } from './shape-image-pair.mjs';
import { shapeViews, deriveShapeTrialPolicy, evaluateShapeTrial, combineShapeTrial } from './shape-primary-trial-policy.mjs';

const output = path.join(root, 'artifacts/node-shape-primary-trial');
const calibrationFolder = path.join(root, 'artifacts/node-shape-semantic-frame');
const toolFiles = ['tools/TikzVisual/trial-shape-primary.mjs', 'tools/TikzVisual/shape-primary-trial-policy.mjs', 'tools/TikzVisual/shape-image-pair.mjs',
  'tools/TikzVisual/shape-raster-metrics.mjs', 'tools/TikzVisual/shape-oracle-bundle.mjs', 'tools/TikzVisual/shape-frame-math.mjs',
  'tools/TikzVisual/compare-shape-frames.mjs', 'tools/TikzVisual/compare.mjs', 'tools/TikzVisual/browser-profile.json'];
async function command(args, candidate = false) {
  await new Promise((resolve, reject) => {
    const child = spawn('node', args, { cwd: root, windowsHide: true, shell: false }); let captured = '', settled = false;
    const finish = error => { if (settled) return; settled = true; clearTimeout(timer); if (error) { child.kill(); reject(error); } else resolve(); };
    const timer = setTimeout(() => finish(new Error('Required shape trial command timed out.')), 600000);
    const capture = bytes => { captured += bytes.toString(); if (captured.length > 1048576) finish(new Error('Required command output limit exceeded.')); };
    child.stdout.on('data', capture); child.stderr.on('data', capture); child.on('error', finish);
    child.on('close', code => { process.stdout.write(captured); const error = code === 0 ? null : new Error('Required shape trial command failed: exit ' + code);
      if (error && candidate && [1, 3].includes(code)) error.exitCode = code; finish(error); });
  });
}

async function main() {
  assert.equal(process.argv.length, 2, 'Usage: node tools/TikzVisual/trial-shape-primary.mjs');
  await outputPath(output);
  const toolHashes = Object.fromEntries(await Promise.all(toolFiles.map(async file => [file, sha256(await readFile(path.join(root, file)))])));
  await command(['tools/TikzVisual/calibrate-shape-semantic-frame.mjs']);
  const evidenceBytes = await readFile(path.join(calibrationFolder, 'report.json')), evidence = JSON.parse(evidenceBytes);
  assert.equal(evidence.comparisonKind, 'oracle-only-shape-semantic-frame-calibration'); assert.equal(evidence.completed, true);
  assert.equal(evidence.converterInvoked, false); assert.equal(evidence.conformanceClaim, false); assert.equal(evidence.approvedImagePolicy, false);
  assert.equal(evidence.measurements.length, 24); assert.equal(evidence.repeatability.captures.length, 24); assert.ok(evidence.repeatability.captures.every(c => c.exactRgbaMatch));
  const frameBytes = await readFile(path.join(calibrationFolder, evidence.independentEvidence.frames)), frames = JSON.parse(frameBytes);
  const derivationBytes = await readFile(path.join(calibrationFolder, evidence.independentEvidence.derivation)), derivation = JSON.parse(derivationBytes);
  assert.equal(sha256(frameBytes), evidence.independentEvidence.framesSha256); assert.equal(sha256(derivationBytes), evidence.independentEvidence.derivationSha256);
  assert.equal(sha256(derivationBytes), frames.derivation.sha256); assert.equal(frames.converterInvoked, false); assert.equal(frames.checks.length, 98);
  assert.deepEqual(derivation.counts, { nodes: 28, pathTokens: 420, glyphs: 70 }); assert.equal(derivation.converterInvoked, false);
  assert.ok(derivation.evidence.frameworkReferences.every(n => n === 'System' || n.startsWith('System.')));
  assert.equal(frames.analyticBrowserValidation.checks.length, 214); assert.ok(frames.analyticBrowserValidation.checks.every(c => c.passed));
  assert.deepEqual(evidence.semanticFrame, unionBounds([frames.frames.picture, frames.frames.nativeInk])); assert.deepEqual(evidence.camera, frames.camera);
  const independent = evidence.measurements.filter(m => m.pair === 'original-primary');
  assert.equal(independent.length, 12); assert.ok(independent.every(m => m.regions.length === 98));
  const rootControls = evidence.measurements.filter(m => m.pair === 'root-only' && m.frame === 'expanded'); assert.equal(rootControls.length, 6); assert.ok(rootControls.every(m => m.exactRgbaMatch));
  assert.ok(evidence.rootSerialization.checks.every(c => c.passed));
  const policy = deriveShapeTrialPolicy(independent);
  const original = await readFile(path.join(calibrationFolder, 'oracle/reference.svg'), 'utf8');
  const native = await readFile(path.join(calibrationFolder, 'native-semantic-css-6.svg'), 'utf8');
  const regions = policy.regions, camera = evidence.camera, origin = derivation.originBp;
  // Reconstruct region rectangles independently from the retained tight bounds.
  assert.deepEqual(regions.map(r => r.id), frames.checks.map(r => r.id));
  for (let i = 0; i < regions.length; i++) {
    const b = unionBounds([frames.checks[i].native, frames.checks[i].driver]), x = Math.max(0, Math.floor(b.minX - camera.x - 3)), y = Math.max(0, Math.floor(b.minY - camera.y - 3));
    assert.deepEqual(regions[i].rectangle, { x, y, width: Math.min(camera.width, Math.ceil(b.maxX - camera.x + 3)) - x, height: Math.min(camera.height, Math.ceil(b.maxY - camera.y + 3)) - y });
  }
  async function verify() {
    assert.equal(sha256(await readFile(path.join(calibrationFolder, 'report.json'))), sha256(evidenceBytes), 'Independent calibration changed.');
    assert.equal(sha256(await readFile(path.join(calibrationFolder, evidence.independentEvidence.frames))), sha256(frameBytes));
    assert.equal(sha256(await readFile(path.join(calibrationFolder, evidence.independentEvidence.derivation))), sha256(derivationBytes));
    for (const [file, hash] of Object.entries(evidence.artifacts)) assert.equal(sha256(await readFile(await outputPath(calibrationFolder, file))), hash, file);
    for (const [file, hash] of Object.entries({ ...derivation.evidence.artifacts, ...frames.artifacts })) assert.equal(sha256(await readFile(await outputPath(path.join(calibrationFolder, 'oracle'), file))), hash, file);
    for (const [file, hash] of Object.entries({ ...derivation.evidence.toolHashes, ...frames.toolHashes, ...evidence.tools, ...toolHashes }))
      assert.equal(sha256(await readFile(path.join(root, file))), hash, 'Changed experiment tool: ' + file);
  }
  await verify();
  const artifacts = {}, cases = [], renderer = await createRenderer();
  await writeArtifact(output, 'independent-calibration.json', evidenceBytes, artifacts);
  await writeArtifact(output, 'source.tikz', await readFile(path.join(calibrationFolder, 'oracle/source.tikz')), artifacts);
  await writeArtifact(output, 'prospective-policy.json', JSON.stringify({ ...policy, independentEvidenceSha256: sha256(evidenceBytes) }, null, 2) + '\n', artifacts);
  try {
    requireRenderer(renderer.identity, evidence.renderer); await installShapeMetrics(renderer);
    async function compareCase(name, reference, actual, activePolicy, views, expectedPassed, cropRegionIds = [], sources = null) {
      const comparisons = [];
      for (const view of views) {
        const result = await measureShapePair(renderer, { reference, actual, leftIsDriver: true, origin, camera, regions: activePolicy.regions,
          ...view, rightLabel: name, cropRegionIds, cropLimit: 2 });
        assert.equal(result.repeat.exactRgbaMatch, true, 'Unchanged SVG repeat differs.');
        const evaluation = evaluateShapeTrial(activePolicy, view, result), prefix = `${name}/${view.frame}-${view.scale}x-${view.background}`, links = {}, cropLinks = new Map();
        for (const [kind, png] of Object.entries(result.images)) { const file = prefix + '-' + kind + '.png'; await writeArtifact(output, file, Buffer.from(png, 'base64'), artifacts); links[kind] = file; }
        for (const crop of result.crops) {
          const links = {};
          for (const [kind, png] of Object.entries({ ...crop.paired, sheet: crop.sheet })) { const file = `${prefix}-${crop.id}-${kind}.png`; await writeArtifact(output, file, Buffer.from(png, 'base64'), artifacts); links[kind] = file; }
          cropLinks.set(crop.id, { ...links, presentation: crop.presentation });
        }
        comparisons.push({ ...view, metrics: result.metrics, evaluation, naturalFrames: result.naturalFrames, artifacts: links,
          regions: result.regions.map(r => ({ ...r, source: sources?.get(r.id) ?? null, crops: cropLinks.get(r.id) ?? null })) });
        console.log(name + ' ' + view.scale + 'x ' + view.frame + ' ' + view.background + ': ' + (evaluation.passed ? 'trial pass' : 'trial rejection') + ', global ' + evaluation.globalPassed + ', local ' + evaluation.regionalPassed + '.');
      }
      const value = { name, comparisonKind: 'unapproved-shape-image-only-control', expectedPassed, passed: comparisons.every(c => c.evaluation.passed === expectedPassed),
        numericGatesBypassed: true, executedViews: views, comparisons };
      await writeArtifact(output, name + '/reference.svg', reference, artifacts); await writeArtifact(output, name + '/actual.svg', actual, artifacts);
      cases.push(value); return value;
    }
    // A full replay proves that this separate pair renderer reproduces every
    // independently recorded measurement before any candidate is invoked.
    const oracle = await compareCase('independent-replay', original, native, policy, shapeViews, true);
    for (const comparison of oracle.comparisons) {
      const original = independent.find(m => m.frame === comparison.frame && m.scale === comparison.scale && m.background === comparison.background);
      const pick = value => ({ exactRgbaMatch: value.exactRgbaMatch, rawChangedPixels: value.rawChangedPixels, maxRawChannelError: value.maxRawChannelError,
        premultipliedChangedPixels: value.premultipliedChangedPixels, maxPremultipliedChannelError: value.maxPremultipliedChannelError,
        foregroundPixels: value.foregroundPixels, referenceForegroundPixels: value.referenceForegroundPixels, actualForegroundPixels: value.actualForegroundPixels,
        meanForegroundChannelError: value.meanForegroundChannelError, topology: value.topology });
      assert.deepEqual(pick(comparison.metrics), pick(original), 'Whole-picture replay differs from independent calibration.');
      assert.deepEqual(comparison.regions.map(pick), original.regions.map(pick), 'Regional replay differs from independent calibration.');
    }
    const whiteViews = shapeViews.filter(v => v.frame === 'natural' && v.background === 'white');
    const periodIndex = Number(regions.find(r => r.nodeId === 'c-period' && r.kind === 'glyph').id.slice(6));
    const fontIndex = Number(regions.find(r => r.nodeId === 'c-font' && r.kind === 'glyph').id.slice(6));
    const regularIndex = frames.checks.filter(r => r.kind === 'background').findIndex(r => r.nodeId === 'c-regular');
    async function faintSvg(source, isDriver, remove = '') {
      return renderer.page.evaluate(({ source, isDriver, origin, periodIndex, remove }) => {
        const doc = new DOMParser().parseFromString(source, 'image/svg+xml'), svg = doc.documentElement;
        const use = [...svg.querySelectorAll('use')][periodIndex]; if (!use) throw new Error('Missing native period control.');
        use.setAttribute('opacity', '.01'); if (remove === 'period') use.remove();
        const line = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
        const x = isDriver ? 110 * 3 / 4 + origin.x : 110, y = isDriver ? 500 * 3 / 4 + origin.y : 500;
        line.setAttribute('d', `M${x} ${y}h${isDriver ? 3 : 4}`); line.setAttribute('fill', 'none'); line.setAttribute('stroke', '#000');
        line.setAttribute('stroke-width', isDriver ? '.75' : '1'); line.setAttribute('stroke-opacity', '.01');
        if (remove !== 'stroke') svg.append(line);
        return new XMLSerializer().serializeToString(svg);
      }, { source, isDriver, origin, periodIndex, remove });
    }
    // These are explicit artifact-only synthetic controls, not new TikZ
    // compatibility references. Their own precision evidence precedes candidate.
    const faintReference = await faintSvg(original, true), faintNative = await faintSvg(native, false);
    const x = Math.floor(106 - camera.x), y = Math.floor(496 - camera.y);
    const faintRegions = [...regions, { id: 'synthetic-short-stroke', nodeId: null, kind: 'synthetic', rectangle: { x, y, width: 12, height: 9 } }];
    const faintMeasurements = [];
    for (const view of whiteViews) {
      const result = await measureShapePair(renderer, { reference: faintReference, actual: faintNative, leftIsDriver: true, origin, camera,
        regions: faintRegions, ...view, cropLimit: 0 });
      assert.equal(result.repeat.exactRgbaMatch, true); faintMeasurements.push({ ...view, ...result.metrics, regions: result.regions });
    }
    const faintPolicy = deriveShapeTrialPolicy(faintMeasurements, 'Synthetic artifact-only native period at 1% opacity and authored four-CSS-pixel stroke; white natural views only', whiteViews);
    await writeArtifact(output, 'faint-calibration.json', JSON.stringify({ converterInvoked: false, conformanceClaim: false, approvedImagePolicy: false,
      basis: 'Fixed source-independent opacity/short-stroke controls applied to both oracle representations; measured before candidate invocation.', measurements: faintMeasurements, policy: faintPolicy }, null, 2) + '\n', artifacts);
    await compareCase('faint-unchanged', faintReference, faintNative, faintPolicy, whiteViews, true, ['glyph-' + periodIndex, 'synthetic-short-stroke']);
    await compareCase('faint-period-loss', faintReference, await faintSvg(native, false, 'period'), faintPolicy, whiteViews, false, ['glyph-' + periodIndex]);
    await compareCase('faint-stroke-loss', faintReference, await faintSvg(native, false, 'stroke'), faintPolicy, whiteViews, false, ['synthetic-short-stroke']);
    await verify();
    // Only now invoke the candidate, after all expectations/limits above exist.
    await command(['tools/TikzVisual/compare-shape-frames.mjs'], true);
    const candidateFolder = path.join(root, 'artifacts/node-shape-frame-comparisons/candidate');
    const frameComparisonBytes = await readFile(path.join(root, 'artifacts/node-shape-frame-comparisons/report.json')), frameComparison = JSON.parse(frameComparisonBytes);
    const numericBytes = await readFile(path.join(candidateFolder, 'report.json')), numeric = JSON.parse(numericBytes);
    assert.equal(frameComparison.verdict, 'frame-pass'); assert.equal(frameComparison.numeric.checks.length, 406); assert.ok(frameComparison.numeric.checks.every(c => c.passed));
    assert.equal(sha256(numericBytes), frameComparison.candidate.sha256); assert.equal(numeric.verdict, 'numeric-pass');
    assert.equal(numeric.numeric.checks.length, 4461); assert.ok(numeric.numeric.checks.every(c => c.passed));
    const provenanceBytes = await readFile(path.join(candidateFolder, numeric.provenance)), provenance = JSON.parse(provenanceBytes);
    assert.equal(sha256(provenanceBytes), numeric.provenanceSha256);
    async function verifyCandidate() {
      assert.equal(sha256(await readFile(path.join(root, 'artifacts/node-shape-frame-comparisons/report.json'))), sha256(frameComparisonBytes));
      assert.equal(sha256(await readFile(path.join(candidateFolder, 'report.json'))), sha256(numericBytes));
      assert.equal(sha256(await readFile(path.join(candidateFolder, numeric.provenance))), numeric.provenanceSha256);
      for (const [file, hash] of Object.entries(provenance.artifacts)) {
        assert.ok(!path.isAbsolute(file) && !file.split(/[\\/]/).includes('..'));
        assert.equal(sha256(await readFile(path.join(candidateFolder, file))), hash, 'Candidate artifact changed: ' + file);
      }
    }
    await verifyCandidate();
    const actual = await readFile(path.join(candidateFolder, 'actual.svg'), 'utf8'), scene = JSON.parse(await readFile(path.join(candidateFolder, 'actual-scene.json')));
    assert.equal(sha256(await readFile(path.join(candidateFolder, 'source.tikz'))), artifacts['source.tikz'], 'Candidate and oracle sources differ.');
    await writeArtifact(output, 'actual-scene.json', await readFile(path.join(candidateFolder, 'actual-scene.json')), artifacts);
    await writeArtifact(output, 'candidate-provenance.json', provenanceBytes, artifacts);
    await writeArtifact(output, 'candidate-numeric-report.json', numericBytes, artifacts);
    await writeArtifact(output, 'candidate-frame-report.json', frameComparisonBytes, artifacts);
    assert.equal(scene.nodes.length, 28); assert.equal(scene.paths.length, 28); assert.equal(scene.glyphs.length, 70);
    const sources = new Map(regions.map(r => {
      const operation = r.kind === 'glyph' ? scene.glyphs[Number(r.id.slice(6))] : scene.paths[scene.nodes.findIndex(n => n.name === r.nodeId)];
      assert.ok(operation); return [r.id, { semanticId: operation.semanticId, svgElementId: operation.svgElementId, span: operation.source,
        attribution: 'Verified operation order in the unmutated public scene. Mutations are artifact-only; raster regions may include neighboring ink.' }];
    }));
    const candidate = await compareCase('candidate', original, actual, policy, shapeViews, true, [], sources);
    candidate.comparisonKind = 'unapproved-public-shape-primary-trial'; candidate.numericGatesBypassed = false;
    const combined = combineShapeTrial({ state: 'passed', executedChecks: 4461 }, { state: 'passed', executedChecks: 406 }, candidate.comparisons);
    const representationControls = candidate.comparisons.map(c => {
      const baseline = oracle.comparisons.find(o => o.frame === c.frame && o.scale === c.scale && o.background === c.background);
      return { frame: c.frame, scale: c.scale, background: c.background, candidate: c.artifacts.actual, independent: baseline.artifacts.actual,
        identicalEncodedCanvasPng: artifacts[c.artifacts.actual] === artifacts[baseline.artifacts.actual] };
    });
    const mutations = [
      { name: 'missing-period', target: 'glyph-' + periodIndex }, { name: 'missing-font-glyph', target: 'glyph-' + fontIndex },
      { name: 'missing-border', target: 'shape-c-regular' }, { name: 'double-border', target: 'shape-c-regular' },
      { name: 'shift-glyph', target: 'glyph-0' }, { name: 'half-opacity', target: 'glyph-' + fontIndex },
      { name: 'quarter-pixel-shift', target: 'shape-c-font' }, { name: 'height-crop', target: 'shape-c-shear' }, { name: 'extra-ink', target: null }
    ];
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
        if (name === 'extra-ink') { const p = doc.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', 'M130 600h2v2h-2Z'); p.setAttribute('fill', '#000'); svg.append(p); }
        return new XMLSerializer().serializeToString(svg);
      }, { actual, name: mutation.name, periodIndex, fontIndex, regularIndex });
      assert.notEqual(changed, actual); await compareCase(mutation.name, original, changed, policy, whiteViews, false, mutation.target ? [mutation.target] : [], sources);
    }
    await verify(); await verifyCandidate();
    const controlsPassed = cases.every(c => c.passed), successful = controlsPassed && combined.passed;
    const contacts = cases.flatMap(c => c.comparisons.filter(v => v.artifacts.comparison).map(v => ({ name: c.name, file: v.artifacts.comparison })));
    const html = '<!doctype html><meta charset="utf-8"><title>Shape primary policy trial</title><h1>Circle/ellipse primary trial — admission pending</h1><p>Limits come only from independent oracle representations. Numeric gates are bypassed for image-only defect controls.</p><p><a href="report.json">Report</a> · <a href="source.tikz">Source</a> · <a href="actual-scene.json">Public scene trace</a> · <a href="prospective-policy.json">Unapproved region/view limits</a> · <a href="faint-calibration.json">Independent synthetic faint controls</a></p>'
      + contacts.map(c => `<h2>${c.name}</h2><img style="max-width:100%" src="${c.file}">`).join('');
    await writeArtifact(output, 'index.html', html, artifacts);
    for (const [file, hash] of Object.entries(artifacts)) assert.equal(sha256(await readFile(await outputPath(output, file))), hash, file);
    const report = { schemaVersion: 1, comparisonKind: 'unapproved-shape-primary-policy-trial', completed: true, verdict: successful ? 'trial-pass' : 'trial-failed',
      overallVerdict: 'pending', imageConformanceClaim: false, approvedImagePolicy: false, generatedUtc: new Date().toISOString(),
      scope: 'Fixed trusted 28-node corpus; per-region/view/background limits from independent native semantic-frame reconstruction. Two white natural scales for defect controls; all twelve required views for oracle replay and public candidate. Synthetic faint controls have their own independently measured two-view policy and make no TikZ compatibility claim.',
      calibration: { path: 'artifacts/node-shape-semantic-frame/report.json', sha256: sha256(evidenceBytes) },
      candidate: { frameReport: 'artifacts/node-shape-frame-comparisons/report.json', frameReportSha256: sha256(frameComparisonBytes), numericReportSha256: sha256(numericBytes), provenanceSha256: numeric.provenanceSha256 },
      toolHashes, renderer: renderer.identity, camera, policy: 'prospective-policy.json', combined, representationControls,
      controls: { passed: controlsPassed, cases: cases.length }, cases, artifacts,
      agent: { state: successful ? 'trial-pass-admission-pending' : 'trial-failed', viewer: 'index.html', focusedRerun: 'node tools/TikzVisual/trial-shape-primary.mjs',
        controls: 'node tools/TikzVisual/shape-policy-self-test.mjs', source: 'source.tikz', scene: 'actual-scene.json',
        numeric: 'candidate-numeric-report.json', frame: 'candidate-frame-report.json', provenance: 'candidate-provenance.json',
        failedCases: cases.filter(c => !c.passed).map(c => c.name) },
      remaining: ['Reviewed immutable policy and negative provenance/coverage controls.', 'Focused and interaction reference coverage.',
        'Ordinary PDF reference and independent renderer calibration.', 'Combined admission and hosted execution.'] };
    await writeArtifact(output, 'report.json', JSON.stringify(report, null, 2) + '\n');
    console.log('Shape primary trial: ' + cases.length + ' cases, ' + (successful ? 'all expected outcomes pass' : 'unexpected outcomes retained') + '; image/PDF admission remains pending.');
    if (!successful) process.exitCode = 1;
  } finally { await renderer.browser.close(); }
}
await main().catch(async error => {
  console.error(error.stack ?? String(error)); process.exitCode = error.exitCode ?? 2;
  try { await writeArtifact(output, 'report.json', JSON.stringify({ schemaVersion: 1, completed: false, verdict: process.exitCode === 2 ? 'infrastructure-error' : 'candidate-failure',
    overallVerdict: 'pending', imageConformanceClaim: false, approvedImagePolicy: false, error: error.message }, null, 2) + '\n'); } catch { }
});
