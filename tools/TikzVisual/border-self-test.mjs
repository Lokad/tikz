import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer } from './compare.mjs';
import { loadBorderPolicy, borderIds, borderMutations } from './border-policy.mjs';
import { compareBorderConformance } from './border-conformance.mjs';
import { borderNativeChecks } from './border-numeric.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'artifacts/border-policy-tests');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function main() {
  assert.equal(process.argv.length, 2, 'Usage: node tools/TikzVisual/border-self-test.mjs');
  assert.ok(output.startsWith(path.join(root, 'artifacts') + path.sep));
  await rm(output, { recursive: true, force: true }); await mkdir(output, { recursive: true });
  const evidence = await loadBorderPolicy(), results = [];
  const rel = f => path.relative(root, f).split(path.sep).join('/');
  const declaredFile = 'tools/TikzVisual/border-profile.json';
  for (const [name, file, edit] of [
    ...Object.entries(evidence.declared.evidence).flatMap(([key, pin]) => [
      ['missing-' + key, pin.file, () => { throw new Error('Controlled missing evidence'); }],
      ['changed-' + key, pin.file, bytes => Buffer.concat([bytes, Buffer.from(' ')])]
    ]),
    // One byte-corruption witness covers the identical current-source guard loop.
    ['changed-current-reference-runner', 'tools/TikzReference/Program.cs', bytes => Buffer.concat([bytes, Buffer.from(' ')])],
  ]) {
    await assert.rejects(() => loadBorderPolicy(async f => rel(f) === file ? edit(await readFile(f)) : readFile(f)));
    results.push({ name, passed: true, category: 'immutable evidence rejection' });
  }
  for (const [name, edit] of [
    ['borrowed-policy', p => { p.id = 'chromium-153-node-interactions-rgb-ink-pdf-page-v1'; }],
    ['weakened-numeric-tolerance', p => { p.numericTolerancePixels = 0.02; }],
    ['unapproved-camera', p => { p.renderMode = 'picture-image'; }],
    ['missing-policy-case', p => { delete p.cases['node-border-transforms']; }],
    ['missing-guard-tool', p => { delete p.guardToolHashes['tools/TikzVisual/border-numeric.mjs']; }],
    ['widened-global-limit', p => { p.cases['node-border-lines'].primary.maxChannelError = 255; }]
  ]) {
    const p = structuredClone(evidence.declared); edit(p);
    await assert.rejects(() => loadBorderPolicy(async f => rel(f) === declaredFile ? Buffer.from(JSON.stringify(p)) : readFile(f)));
    results.push({ name, passed: true, category: 'policy rejection' });
  }
  async function rehashed(key, edit) {
    const values = Object.fromEntries(Object.keys(evidence.declared.evidence).map(k => [k, structuredClone(evidence[k])]));
    edit(values[key]); const buffers = new Map(), p = structuredClone(evidence.declared);
    const save = k => { const bytes = Buffer.from(JSON.stringify(values[k])); buffers.set(p.evidence[k].file, bytes); p.evidence[k].sha256 = hash(bytes); };
    save('frame'); values.primary.nativeFrameSnapshotSha256 = p.evidence.frame.sha256; save('primary');
    values.primaryTrial.calibrationSha256 = p.evidence.primary.sha256; save('primaryTrial');
    values.pdf.nativeFrameSnapshotSha256 = p.evidence.frame.sha256; values.pdf.primaryCalibrationSha256 = p.evidence.primary.sha256; save('pdf');
    values.pdfTrial.pdfCalibrationSha256 = p.evidence.pdf.sha256; values.pdfTrial.primaryTrialSha256 = p.evidence.primaryTrial.sha256; save('pdfTrial');
    buffers.set(declaredFile, Buffer.from(JSON.stringify(p)));
    return f => buffers.get(rel(f)) ?? readFile(f);
  }
  await loadBorderPolicy(await rehashed('primary', () => {}));
  results.push({ name: 'consistent-rehashed-unchanged-control', passed: true, category: 'structural validation positive control' });
  for (const [name, key, edit] of [
    ['changed-historical-producer', 'frame', e => { e.toolHashes['tools/TikzReference/Program.cs'] = '0'.repeat(64); }],
    ['changed-historical-base-producer', 'primary', e => { e.basePrecisionEvidence.toolHashes['tools/TikzReference/Program.cs'] = '0'.repeat(64); }],
    ['widened-primary-region', 'primary', e => { e.cases[0].regions[0].limits[0].maxMeanForegroundError = 255; }],
    ['shifted-primary-region', 'primary', e => { e.cases[0].regions[0].rectanglePixels.x += .25; }],
    ['missing-primary-measurement', 'primary', e => { e.cases[0].variants[0].regions.pop(); }],
    ['duplicate-primary-measurement', 'primary', e => { e.cases[0].variants[0].regions[1] = structuredClone(e.cases[0].variants[0].regions[0]); }],
    ['missing-primary-background', 'primary', e => { e.cases[0].variants[0].primary.pop(); }],
    ['unrepeated-primary-control', 'primary', e => { e.cases[0].variants[0].repeatedCaptures = false; }],
    ['widened-frame-budget', 'primary', e => { e.cases[0].variants[0].framePrecision.calibrationDimensionTolerancePixels = 1; }],
    ['candidate-calibration', 'primary', e => { e.converterInvoked = true; }],
    ['widened-PDF-region', 'pdf', e => { e.cases[0].regions[0].limits[0].maxMeanForegroundError = 255; }],
    ['missing-PDF-measurement', 'pdf', e => { e.cases[0].variants[0].measurements.pop(); }],
    ['unresolved-PDF-edge', 'pdf', e => { e.cases[0].variants[0].measurements[0].maxEdgeDisplacementPixels = null; }],
    ['missing-PDF-variant', 'pdf', e => { e.cases[0].variants.pop(); }],
    ['fitted-PDF-origin', 'pdf', e => { e.cases[0].pdfOriginPixels.x += .25; }],
    ['missing-PDF-tool', 'pdf', e => { delete e.toolHashes['tools/TikzVisual/pdf-native-geometry.mjs']; }],
    ['missing-defect-control', 'primaryTrial', e => { e.trials.pop(); }],
    ['accepted-short-line', 'primaryTrial', e => { e.trials.find(t => t.mutation === 'missing-short-line').verdict = 'pass'; }],
    ['untargeted-miter-rejection', 'primaryTrial', e => { e.trials.find(t => t.mutation === 'bevel-triangle').failedRegions = []; }],
    ['accepted-PDF-miter', 'pdfTrial', e => { e.trials.find(t => t.mutation === 'bevel-triangle').pdfPassed = true; }]
  ]) {
    const read = await rehashed(key, edit);
    await assert.rejects(() => loadBorderPolicy(read), undefined, name);
    results.push({ name, passed: true, category: 'consistently rehashed evidence rejection' });
  }
  const renderer = await createRenderer();
  const files = ['source.tikz', 'reference.svg', 'original-driver.svg', 'actual.svg', 'actual-scene.json', 'comparison-input.json',
    'reference-metrics.json', 'provenance.json', 'candidate-provenance.json', 'oracle.log', 'reference.pdf', 'pdf-page-1x.png', 'pdf-page-4x.png'];
  async function copy(id, name) {
    const baseline = path.join(root, 'artifacts/border-conformance', id);
    const report = JSON.parse(await readFile(path.join(baseline, 'report.json')));
    assert.equal(report.verdict, 'pass'); assert.equal(report.borderPolicy.sha256, evidence.sha256);
    const folder = path.join(output, id, name); assert.ok(folder.startsWith(output + path.sep)); await mkdir(folder, { recursive: true });
    for (const file of files) await copyFile(path.join(baseline, file), path.join(folder, file));
    return folder;
  }
  async function editJson(folder, file, edit) {
    const value = JSON.parse(await readFile(path.join(folder, file))); edit(value);
    await writeFile(path.join(folder, file), JSON.stringify(value, null, 2) + '\n');
  }
  async function mutate(svg, mutation) {
    return renderer.page.evaluate(({ svg, mutation }) => {
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml'), root = doc.documentElement;
      const paths = [...doc.querySelectorAll('path')], p = n => doc.getElementById('candidate-p' + n);
      if (mutation === 'missing-border') p(0).remove();
      if (mutation === 'quarter-pixel-shift') { const g = doc.createElementNS(root.namespaceURI, 'g'); g.setAttribute('transform', 'translate(.25,.125)');
        while (root.firstChild) g.append(root.firstChild); root.append(g); }
      if (mutation === 'double-stroke') for (const path of paths) path.setAttribute('stroke-width', Number(path.getAttribute('stroke-width')) * 2);
      if (mutation === 'half-opacity') for (const path of paths) path.setAttribute('stroke-opacity', '.5');
      if (mutation === 'round-caps') for (const path of paths) path.setAttribute('stroke-linecap', 'round');
      if (mutation === 'joined-border-gap') { let index = 0; const old = p(3).getAttribute('d');
        const data = old.replace(/M/g, token => ++index === 1 ? token : 'L'); if (data === old) throw new Error('Mutation changed nothing.'); p(3).setAttribute('d', data); }
      if (mutation === 'missing-short-line') p(9).remove();
      if (mutation === 'bevel-triangle') p(8).setAttribute('stroke-linejoin', 'bevel');
      if (mutation === 'open-triangle') p(8).setAttribute('d', p(8).getAttribute('d').replace(/Z\s*$/, ''));
      if (mutation === 'height-crop') { const b = root.getAttribute('viewBox').split(' ').map(Number); b[3] -= 1;
        root.setAttribute('viewBox', b.join(' ')); root.setAttribute('height', b[3] + 'px'); }
      return mutation.startsWith('unchanged') ? svg : new XMLSerializer().serializeToString(doc);
    }, { svg, mutation });
  }
  try {
    for (const id of borderIds) for (const mutation of borderMutations(id).filter(m => m !== 'numeric-failure')) {
      const folder = await copy(id, mutation), original = await readFile(path.join(folder, 'actual.svg'), 'utf8');
      const svg = await mutate(original, mutation); assert.equal(svg === original, mutation.startsWith('unchanged'));
      await writeFile(path.join(folder, 'actual.svg'), svg);
      const report = await compareBorderConformance(folder, renderer, { imageOnlyExperiment: true });
      const expected = mutation.startsWith('unchanged') ? 'pass' : 'mismatch';
      assert.equal(report.verdict, expected); assert.equal(report.pdf.candidate.passed, expected === 'pass');
      assert.equal(report.pdf.oracle.passed, true); assert.equal(report.numeric.checks.length, 0);
      assert.equal(report.borderPolicy.approvedPdfPolicy, false); assert.equal(report.conformanceClaim, false);
      const target = mutation === 'missing-border' ? 'path-0' : mutation === 'joined-border-gap' ? 'path-3'
        : mutation === 'missing-short-line' ? 'path-9' : ['bevel-triangle', 'open-triangle'].includes(mutation) ? 'path-8-miter-' : null;
      if (target) {
        const matches = c => target.endsWith('-') ? c.id.startsWith(target) : c.id === target;
        assert.ok(report.primary.regionalChecks.some(c => !c.passed && matches(c)));
        assert.ok(report.pdf.candidate.checks.some(c => !c.passed && matches(c)));
      }
      results.push({ name: id + '/' + mutation, passed: true, expected, actual: report.verdict,
        category: 'image-only primary and independent PDF sensitivity', numericBypassed: true, report: id + '/' + mutation + '/report.json' });
      console.log(id + '/' + mutation + ': expected ' + report.verdict);
    }
    const numericFolder = await copy('node-border-lines', 'numeric-failure');
    await editJson(numericFolder, 'actual-scene.json', scene => { scene.pictureBounds.minX += .001; });
    const scene = JSON.parse(await readFile(path.join(numericFolder, 'actual-scene.json')));
    const metrics = JSON.parse(await readFile(path.join(numericFolder, 'reference-metrics.json')));
    await editJson(numericFolder, 'comparison-input.json', input => {
      const checks = borderNativeChecks(metrics, scene); input.numeric = { checks, passed: checks.every(c => c.passed) };
    });
    const numeric = await compareBorderConformance(numericFolder, renderer);
    assert.equal(numeric.verdict, 'mismatch'); assert.equal(numeric.numeric.passed, false);
    assert.equal(numeric.primary.passed, true); assert.equal(numeric.pdf.passed, true); assert.equal(numeric.conformanceClaim, false);
    results.push({ name: 'numeric-failure-with-correct-pixels', passed: true, category: 'combined verdict' });
    for (const [name, edit] of [
      ['empty-numeric', input => { input.numeric.checks = []; }],
      ['duplicated-numeric', input => { input.numeric.checks[1] = structuredClone(input.numeric.checks[0]); }],
      ['forged-native-expected', input => { input.numeric.checks[0].expected += .01; }],
      ['weakened-native-tolerance', input => { input.numeric.checks[0].tolerance = 1; }],
      ['inconsistent-native-verdict', input => { input.numeric.passed = false; }],
      ['removed-required-regions', input => { input.regionalChecks = []; }],
      ['weakened-caller-region', input => { input.regionalChecks[0].limits[0].maxChannelError = 255; }],
      ['fitted-registration', input => { input.referenceOriginBp.x += .25; }],
      ['caller-PDF-policy', input => { input.pdf = { originPixels: { x: 0, y: 0 } }; }],
      ['borrowed-raster-policy', input => { input.rasterProfile = 'node'; }],
      ['untrusted-numeric-bypass', input => { input.numericBypassed = true; }]
    ]) {
      const folder = await copy('node-border-lines', name); await editJson(folder, 'comparison-input.json', edit);
      await writeFile(path.join(folder, 'report.json'), JSON.stringify({ verdict: 'pass' }));
      await assert.rejects(() => compareBorderConformance(folder, renderer), undefined, name);
      await assert.rejects(() => readFile(path.join(folder, 'report.json')), /ENOENT/);
      results.push({ name, passed: true, category: 'bundle rejection; stale pass removed' });
    }
    for (const [name, file, edit] of [
      ['changed-reference', 'reference.svg', bytes => Buffer.concat([bytes, Buffer.from(' ')])],
      ['changed-source', 'source.tikz', bytes => Buffer.concat([bytes, Buffer.from(' ')])],
      ['changed-PDF-page', 'pdf-page-1x.png', bytes => Buffer.concat([bytes, Buffer.from(' ')])],
      ['missing-provenance', 'provenance.json', () => null]
    ]) {
      const folder = await copy('node-border-lines', name), full = path.join(folder, file);
      const bytes = edit(await readFile(full)); if (bytes === null) await rm(full); else await writeFile(full, bytes);
      await writeFile(path.join(folder, 'report.json'), JSON.stringify({ verdict: 'pass' }));
      await assert.rejects(() => compareBorderConformance(folder, renderer), undefined, name);
      await assert.rejects(() => readFile(path.join(folder, 'report.json')), /ENOENT/);
      results.push({ name, passed: true, category: 'artifact rejection; partial/stale pass removed' });
    }
    const heightFolder = await copy('node-border-lines', 'natural-height');
    const heightSvg = await readFile(path.join(heightFolder, 'actual.svg'), 'utf8');
    await writeFile(path.join(heightFolder, 'actual.svg'), heightSvg.replace(/height="([\d.]+)px"/, (_, v) => 'height="' + (Number(v) + .001) + 'px"'));
    const height = await compareBorderConformance(heightFolder, renderer);
    assert.equal(height.verdict, 'mismatch'); assert.equal(height.dimensions.passed, false); assert.equal(height.pdf.candidate.passed, false);
    results.push({ name: 'natural-height-physical-unit-failure', passed: true, category: 'combined verdict' });
    await writeFile(path.join(output, 'suite.json'), JSON.stringify({ schemaVersion: 1, completed: true, passed: true,
      policyId: evidence.declared.id, policySha256: evidence.sha256, expectedCases: borderIds,
      toolHashes: evidence.declared.guardToolHashes, results }, null, 2) + '\n');
    console.log(JSON.stringify({ completed: true, passed: true, checks: results.length }));
  } finally { await renderer.browser.close(); }
}
await main().catch(async error => {
  console.error(error.stack ?? String(error)); process.exitCode = 2;
  await mkdir(output, { recursive: true }); await writeFile(path.join(output, 'suite.json'), JSON.stringify({ schemaVersion: 1,
    completed: false, passed: false, error: String(error.message) }, null, 2) + '\n');
});
