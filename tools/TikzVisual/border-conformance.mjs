import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareBundle, profile } from './compare.mjs';
import { loadBorderPolicy, requireBorderRenderer, borderIds } from './border-policy.mjs';
import { requireBorderNumeric, borderInkChecks } from './border-numeric.mjs';
import { measurePdfRegions } from './pdf-region-renderer.mjs';
import { pdfRegionVerdict } from './pdf-region-verdict.mjs';
import { pdfRegionViewer } from './pdf-region-viewer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export async function compareBorderConformance(bundle, renderer, options = {}) {
  bundle = path.resolve(bundle);
  assert.ok(bundle.startsWith(path.join(root, 'artifacts') + path.sep), 'Conformance must own an artifacts bundle.');
  await rm(path.join(bundle, 'report.json'), { force: true }); await rm(path.join(bundle, 'index.html'), { force: true });
  try {
    assert.ok(Object.keys(options).every(k => k === 'imageOnlyExperiment'));
    assert.ok(options.imageOnlyExperiment === undefined || typeof options.imageOnlyExperiment === 'boolean');
    const imageOnly = !!options.imageOnlyExperiment;
    const evidence = await loadBorderPolicy(), { declared } = evidence;
    requireBorderRenderer(renderer.identity, evidence.primary.renderer);
    const read = async file => readFile(path.join(bundle, file));
    const input = JSON.parse(await read('comparison-input.json')), id = input.caseId;
    assert.ok(borderIds.includes(id), 'Unknown border fixture.');
    const p = evidence.primary.cases.find(c => c.caseId === id), d = evidence.pdf.cases.find(c => c.caseId === id), counts = declared.cases[id];
    assert.equal(input.schemaVersion, 1); assert.equal(input.actualUnits, 'cssPixels');
    assert.equal(input.referenceMode, 'derived-native-stroke-frame; original-driver.svg retained');
    assert.deepEqual(input.referenceOriginBp, { x: 0, y: 0 }, 'Registration cannot be fitted.');
    assert.equal(input.numericTolerancePixels, declared.numericTolerancePixels);
    assert.equal(input.pdf, undefined); assert.equal(input.rasterProfile, undefined); assert.equal(input.numericBypassed, undefined);
    assert.ok(input.toleranceProfile === undefined || input.toleranceProfile === declared.id + '-' + id);
    assert.ok(input.exactPrimary === undefined || input.exactPrimary === false);
    if (input.regionalChecks !== undefined) assert.deepEqual(input.regionalChecks, p.regions, 'Caller cannot weaken or remove regions.');
    const provenance = JSON.parse(await read('provenance.json'));
    assert.deepEqual(provenance, p.originalProvenance);
    for (const [file, sha256] of Object.entries({ 'source.tikz': p.sourceSha256, 'reference.svg': p.referenceSha256,
      'original-driver.svg': provenance.artifacts['reference.svg'], 'reference-metrics.json': provenance.artifacts['reference-metrics.json'],
      'oracle.log': provenance.artifacts['oracle.log'], 'reference.pdf': provenance.artifacts['reference.pdf'] }))
      assert.equal(hash(await read(file)), sha256, 'Changed conformance artifact: ' + file);
    const metrics = JSON.parse(await read('reference-metrics.json')), scene = JSON.parse(await read('actual-scene.json'));
    const candidateProvenance = JSON.parse(await read('candidate-provenance.json'));
    assert.equal(candidateProvenance.schemaVersion, 1); assert.equal(candidateProvenance.configuration, 'Release');
    for (const key of ['workingTreeSha256', 'assemblySha256']) assert.match(candidateProvenance[key], /^[a-f0-9]{64}$/);
    assert.match(candidateProvenance.commit, /^[a-f0-9]{40}$/);
    assert.equal(candidateProvenance.options.idPrefix, 'candidate'); assert.equal(candidateProvenance.options.paddingPixels, 0);
    assert.deepEqual(candidateProvenance.options.libraries, []);
    assert.deepEqual(metrics.pdfOriginPixels, d.pdfOriginPixels);
    const source = (await read('source.tikz')).toString('utf8'), actual = (await read('actual.svg')).toString('utf8');
    const rootFrame = await renderer.page.evaluate(svg => {
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('Invalid candidate SVG.');
      const root = doc.documentElement, view = root.getAttribute('viewBox')?.trim().split(/\s+/).map(Number);
      if (!view || view.length !== 4 || !view.every(Number.isFinite)) throw new Error('Invalid candidate viewBox.');
      return view;
    }, actual);
    const box = p.frame.expandedPixels, expectedFrame = [box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY];
    const frameChecks = expectedFrame.map((expected, index) => ({ name: 'viewBox.' + ['minX', 'minY', 'width', 'height'][index],
      expected, actual: rootFrame[index], absoluteError: Math.abs(expected - rootFrame[index]), units: 'CSS pixels',
      tolerance: declared.numericTolerancePixels, passed: Math.abs(expected - rootFrame[index]) <= declared.numericTolerancePixels }));
    let native = [];
    if (!imageOnly) {
      assert.equal(input.numeric.passed, input.numeric.checks.every(c => c.passed), 'Inconsistent supplied numeric verdict.');
      if (input.numeric.nativeChecks !== undefined) {
        assert.equal(input.numeric.nativeChecks, counts.nativeChecks); assert.equal(input.numeric.inkChecks, counts.inkChecks);
        assert.equal(input.numeric.frameChecks, 4); assert.equal(input.numeric.checks.length, counts.nativeChecks + counts.inkChecks + 4);
      } else assert.equal(input.numeric.checks.length, counts.nativeChecks);
      const supplied = input.numeric.checks.slice(0, counts.nativeChecks);
      native = requireBorderNumeric({ checks: supplied, passed: supplied.every(c => c.passed) }, metrics, scene, counts.nativeChecks);
    }
    const ink = imageOnly ? [] : borderInkChecks(p.frame, scene);
    if (!imageOnly) assert.equal(ink.length, counts.inkChecks);
    const checks = imageOnly ? [] : [...native, ...ink, ...frameChecks];
    const numeric = { passed: checks.every(c => c.passed), checks,
      ...(imageOnly ? { note: 'IMAGE-ONLY EXPERIMENT; every native/ink/frame numeric gate bypassed; no conformance claim.' } : { nativeChecks: native.length, inkChecks: ink.length, frameChecks: frameChecks.length }) };
    const key = declared.id + '-' + id;
    profile.cases[key] = { primary: structuredClone(counts.primary) };
    input.toleranceProfile = key; input.exactPrimary = false; input.regionalChecks = structuredClone(p.regions); input.numeric = numeric;
    input.scope = declared.scope + (imageOnly ? '; IMAGE-ONLY EXPERIMENT; numeric bypass; no conformance claim' : '');
    await writeFile(path.join(bundle, 'comparison-input.json'), JSON.stringify(input, null, 2) + '\n');
    const primary = await compareBundle(bundle, renderer);
    assert.equal(primary.primary.checks.length, 6); assert.equal(primary.primary.regionalChecks.length, counts.primaryRegions * 6);
    const primaryBytes = await read('report.json');
    await writeFile(path.join(bundle, 'primary-report.json'), primaryBytes);
    await writeFile(path.join(bundle, 'primary.html'), (await read('index.html')).toString('utf8').replaceAll('href="report.json"', 'href="primary-report.json"'));
    const pdfPages = {};
    for (const scale of declared.scales) {
      const bytes = await read('pdf-page-' + scale + 'x.png');
      assert.equal(hash(bytes), provenance.artifacts['pdf-page-' + scale + 'x.png'], 'Changed ordinary PDF page.');
      pdfPages[scale] = 'data:image/png;base64,' + bytes.toString('base64');
    }
    const pdf = {};
    for (const role of ['oracle', 'candidate']) {
      const svg = role === 'oracle' ? p.referenceSvg : actual;
      const camera = { svg, units: role === 'oracle' ? 'bp' : 'cssPixels', svgOriginBp: { x: 0, y: 0 }, pdfPages,
        pdfOriginPixels: d.pdfOriginPixels, regions: d.regions, renderMode: declared.renderMode, captureIds: ['whole-picture'] };
      const folder = path.join(bundle, 'pdf-' + role);
      assert.ok(folder.startsWith(bundle + path.sep)); await rm(folder, { recursive: true, force: true }); await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, 'actual.svg'), svg); await writeFile(path.join(folder, 'source.tikz'), source);
      let measured;
      try { measured = await measurePdfRegions(renderer.page, camera); }
      catch (error) {
        if (role !== 'candidate' || !String(error.message).includes('SVG viewport does not match its declared physical units.')) throw error;
        pdf[role] = { passed: false, executed: false, checks: [], reason: 'Candidate viewport and physical dimensions disagree.' };
        await writeFile(path.join(folder, 'measurements.json'), JSON.stringify(pdf[role], null, 2) + '\n');
        await writeFile(path.join(folder, 'comparison-input.json'), JSON.stringify({ role, units: camera.units,
          svgOriginBp: camera.svgOriginBp, pdfOriginPixels: d.pdfOriginPixels, renderMode: declared.renderMode,
          regions: d.regions, policyId: declared.id, numericBypassed: imageOnly }, null, 2) + '\n');
        await writeFile(path.join(folder, 'index.html'), '<!doctype html><meta charset="utf-8"><h1>Candidate PDF gate: failure</h1><p>'
          + pdf[role].reason + '</p><a href="measurements.json">Failure report</a> · <a href="comparison-input.json">Physical camera</a>');
        pdf[role].artifacts = Object.fromEntries(await Promise.all(['actual.svg', 'source.tikz', 'measurements.json', 'comparison-input.json', 'index.html']
          .map(async file => ['pdf-' + role + '/' + file, hash(await readFile(path.join(folder, file)))])));
        continue;
      }
      const verdict = pdfRegionVerdict(measured.results, d.regions);
      const captures = ['whole-picture', ...[...new Set(verdict.checks.filter(c => !c.passed && c.id !== 'whole-picture')
        .sort((a, b) => b.meanForegroundError - a.meanForegroundError || a.id.localeCompare(b.id)).map(c => c.id))].slice(0, 5)];
      if (captures.length > 1) {
        const repeat = await measurePdfRegions(renderer.page, { ...camera, captureIds: captures });
        assert.deepEqual(repeat.results, measured.results); measured.images = repeat.images;
      }
      const imageFiles = Object.keys(measured.images);
      for (const [file, bytes] of Object.entries(measured.images)) await writeFile(path.join(folder, file), Buffer.from(bytes, 'base64'));
      delete measured.images; measured.regionDefinitions = d.regions;
      await writeFile(path.join(folder, 'comparison-input.json'), JSON.stringify({ schemaVersion: 1, role, units: camera.units,
        svgOriginBp: camera.svgOriginBp, pdfOriginPixels: d.pdfOriginPixels, regions: d.regions, renderMode: declared.renderMode,
        policyId: declared.id, policySha256: evidence.sha256, numericBypassed: imageOnly }, null, 2) + '\n');
      await writeFile(path.join(folder, 'measurements.json'), JSON.stringify({ ...measured, verdict }, null, 2) + '\n');
      await writeFile(path.join(folder, 'index.html'), pdfRegionViewer(id, role, { ...measured, verdict }, captures, source,
        { scope: input.scope, svgFile: 'actual.svg', svgLabel: role === 'oracle' ? 'Independent stroke-framed oracle' : 'Public converter SVG' }));
      pdf[role] = { passed: verdict.passed, executed: true, checks: verdict.checks,
        artifacts: Object.fromEntries(await Promise.all(['actual.svg', 'source.tikz', 'comparison-input.json', 'measurements.json', 'index.html', ...imageFiles]
          .map(async file => ['pdf-' + role + '/' + file, hash(await readFile(path.join(folder, file)))]))) };
    }
    const passed = primary.verdict === 'pass' && pdf.oracle.passed && pdf.candidate.passed;
    const report = { ...primary, completed: true, verdict: passed ? 'pass' : 'mismatch',
      fidelity: primary.primary.passed && pdf.oracle.passed && pdf.candidate.passed
        ? 'Calibrated primary match with ordinary PDF cross-check; independent ink-frame profile; original driver report retained' : 'Visual conformance failed',
      conformanceClaim: !imageOnly && passed, scope: input.scope, pdf: { passed: pdf.oracle.passed && pdf.candidate.passed, renderMode: declared.renderMode, ...pdf },
      borderPolicy: { id: declared.id, sha256: evidence.sha256, approvedPrimaryPolicy: !imageOnly, approvedPdfPolicy: !imageOnly,
        evidence: declared.evidence, scope: declared.scope }, candidateProvenance,
      artifacts: { ...primary.artifacts, 'primary-report.json': hash(primaryBytes), 'primary.html': hash(await read('primary.html')),
        ...pdf.oracle.artifacts, ...pdf.candidate.artifacts },
      toolHashes: declared.guardToolHashes };
    await writeFile(path.join(bundle, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await writeFile(path.join(bundle, 'index.html'), '<!doctype html><meta charset="utf-8"><h1>' + id + ': ' + report.verdict + '</h1><p>'
      + input.scope + '</p><p>All native numeric, ink/frame, primary and both PDF gates are required.</p><ul>'
      + '<li><a href="primary.html">Primary SVG and numeric report</a></li><li><a href="pdf-oracle/index.html">Oracle versus PDF</a></li>'
      + '<li><a href="pdf-candidate/index.html">Candidate versus PDF</a></li><li><a href="report.json">Combined report</a></li></ul>');
    return report;
  } catch (error) {
    // A partially written primary report cannot masquerade as a completed
    // combined pass when later evidence validation or PDF rendering fails.
    await rm(path.join(bundle, 'report.json'), { force: true }); await rm(path.join(bundle, 'index.html'), { force: true });
    throw error;
  }
}
