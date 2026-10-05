import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareInteractionPrimary } from './interaction-primary.mjs';
import { loadInteractionPdfPolicy, requirePdfRenderer } from './interaction-pdf-policy.mjs';
import { measurePdfRegions } from './pdf-region-renderer.mjs';
import { pdfRegionVerdict } from './pdf-region-verdict.mjs';
import { pdfRegionViewer } from './pdf-region-viewer.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export async function compareInteractionPdf(bundle, renderer, options = {}) {
  bundle = path.resolve(bundle);
  assert.ok(bundle.startsWith(path.join(root, 'artifacts') + path.sep), 'PDF comparison must own an artifacts bundle.');
  await rm(path.join(bundle, 'report.json'), { force: true }); await rm(path.join(bundle, 'index.html'), { force: true });
  const evidence = await loadInteractionPdfPolicy(), { declared, calibration } = evidence;
  requirePdfRenderer(renderer.identity, calibration.renderer);
  const primary = await compareInteractionPrimary(bundle, renderer, options);
  const id = options.caseId ?? primary.caseId.replace(/^node-/, ''), c = calibration.cases.find(c => c.caseId === id);
  assert.ok(c);
  const source = await readFile(path.join(bundle, 'source.tikz'), 'utf8');
  const metrics = JSON.parse(await readFile(path.join(bundle, 'metrics.json')));
  assert.deepEqual(c.pdfOriginPixels, metrics.geometry.pdfOriginPixels);
  const pdfPages = {};
  for (const scale of declared.scales) {
    const bytes = await readFile(path.join(bundle, 'pdf-page-' + scale + 'x.png'));
    assert.equal(hash(bytes), c.originalProvenance.artifacts['pdf-page-' + scale + 'x.png'], 'Changed ordinary PDF page.');
    pdfPages[scale] = 'data:image/png;base64,' + bytes.toString('base64');
  }
  const primaryBytes = await readFile(path.join(bundle, 'report.json'));
  await writeFile(path.join(bundle, 'primary-report.json'), primaryBytes);
  const primaryViewer = await readFile(path.join(bundle, 'index.html'), 'utf8');
  await writeFile(path.join(bundle, 'primary.html'), primaryViewer.replaceAll('href="report.json"', 'href="primary-report.json"'));
  const comparisons = {};
  for (const role of ['oracle', 'candidate']) {
    const file = role === 'oracle' ? 'reference.svg' : 'actual.svg';
    const svg = await readFile(path.join(bundle, file), 'utf8');
    if (role === 'oracle') assert.equal(hash(svg), c.variants.find(v => v.mode === 'original-ink-driver').svgSha256);
    const input = { svg, pdfPages, units: role === 'oracle' ? 'bp' : 'cssPixels',
      svgOriginBp: role === 'oracle' ? metrics.geometry.svgOriginBp : undefined,
      pdfOriginPixels: c.pdfOriginPixels, regions: c.regions, renderMode: declared.renderMode, captureIds: ['whole-picture'] };
    const output = path.join(bundle, 'pdf-' + role);
    assert.ok(output.startsWith(bundle + path.sep));
    await rm(output, { recursive: true, force: true }); await mkdir(output, { recursive: true });
    await writeFile(path.join(output, 'actual.svg'), svg); await writeFile(path.join(output, 'source.tikz'), source);
    let measured;
    try { measured = await measurePdfRegions(renderer.page, input); }
    catch (error) {
      if (role !== 'candidate' || !String(error.message).includes('SVG viewport does not match its declared physical units.')) throw error;
      comparisons[role] = { passed: false, executed: false, checks: [], reason: 'Candidate SVG physical dimensions do not agree with its declared units.' };
      await writeFile(path.join(output, 'measurements.json'), JSON.stringify(comparisons[role], null, 2) + '\n');
      await writeFile(path.join(output, 'index.html'), '<!doctype html><meta charset="utf-8"><h1>Candidate PDF gate: failure</h1><p>'
        + comparisons[role].reason + '</p><a href="measurements.json">Failure report</a>');
      comparisons[role].artifactHashes = Object.fromEntries(await Promise.all(['actual.svg', 'source.tikz', 'measurements.json', 'index.html']
        .map(async f => ['pdf-' + role + '/' + f, hash(await readFile(path.join(output, f)))])));
      continue;
    }
    const verdict = pdfRegionVerdict(measured.results, c.regions);
    const captures = ['whole-picture', ...[...new Set(verdict.checks.filter(r => !r.passed && r.id !== 'whole-picture')
      .sort((a, b) => b.meanForegroundError - a.meanForegroundError || a.id.localeCompare(b.id)).map(r => r.id))].slice(0, 5)];
    if (captures.length > 1) {
      const repeat = await measurePdfRegions(renderer.page, { ...input, captureIds: captures });
      assert.deepEqual(repeat.results, measured.results); measured.images = repeat.images;
    }
    const imageFiles = Object.keys(measured.images);
    for (const [name, bytes] of Object.entries(measured.images)) await writeFile(path.join(output, name), Buffer.from(bytes, 'base64'));
    delete measured.images; measured.regionDefinitions = c.regions;
    await writeFile(path.join(output, 'comparison-input.json'), JSON.stringify({ schemaVersion: 1, caseId: id, role,
      policyId: declared.id, policySha256: evidence.sha256, renderMode: declared.renderMode, units: input.units,
      svgOriginBp: input.svgOriginBp, pdfOriginPixels: c.pdfOriginPixels, regions: c.regions,
      numericBypassed: !!options.imageOnlyExperiment, registration: calibration.registration }, null, 2) + '\n');
    await writeFile(path.join(output, 'measurements.json'), JSON.stringify({ ...measured, verdict }, null, 2) + '\n');
    await writeFile(path.join(output, 'index.html'), pdfRegionViewer(id, role, { ...measured, verdict }, captures, source,
      { scope: declared.scope + '; ' + (options.imageOnlyExperiment ? 'IMAGE-ONLY EXPERIMENT; numeric bypass; no conformance claim.' : 'Combined candidate conformance gate.'),
        svgFile: 'actual.svg', svgLabel: role === 'oracle' ? 'Original ink-framed oracle SVG' : 'Candidate SVG' }));
    comparisons[role] = { passed: verdict.passed, executed: true, checks: verdict.checks, report: 'pdf-' + role + '/measurements.json',
      artifactHashes: Object.fromEntries(await Promise.all(['actual.svg', 'source.tikz', 'comparison-input.json', 'measurements.json', 'index.html', ...imageFiles]
        .map(async f => ['pdf-' + role + '/' + f, hash(await readFile(path.join(output, f)))]))) };
  }
  const report = { ...primary, completed: true, scope: declared.scope + (options.imageOnlyExperiment ? '; IMAGE-ONLY EXPERIMENT; numeric bypass; no conformance claim' : ''),
    verdict: primary.verdict === 'pass' && comparisons.oracle.passed && comparisons.candidate.passed ? 'pass' : 'mismatch',
    pdf: { passed: comparisons.oracle.passed && comparisons.candidate.passed, renderMode: declared.renderMode, ...comparisons },
    pdfPolicy: { id: declared.id, sha256: evidence.sha256, approvedPdfPolicy: !options.imageOnlyExperiment,
      calibrationSha256: declared.calibrationSha256, viewportProbeSha256: declared.viewportProbeSha256, scope: declared.scope } };
  report.toolHashes = { ...primary.toolHashes, ...Object.fromEntries(await Promise.all(['interaction-pdf.mjs', 'interaction-pdf-policy.mjs',
    'interaction-pdf-profile.json', 'pdf-region-renderer.mjs', 'pdf-region-verdict.mjs'].map(async f => ['tools/TikzVisual/' + f, hash(await readFile(path.join(directory, f)))]))) };
  report.artifacts = { ...primary.artifacts, 'primary-report.json': hash(primaryBytes), 'primary.html': hash(await readFile(path.join(bundle, 'primary.html'))),
    ...comparisons.oracle.artifactHashes, ...comparisons.candidate.artifactHashes };
  await writeFile(path.join(bundle, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  const scope = options.imageOnlyExperiment ? 'Controlled image-only experiment; numeric checks bypassed.' : 'Numeric, natural dimensions, primary SVG, and both ordinary PDF comparisons are required.';
  await writeFile(path.join(bundle, 'index.html'), '<!doctype html><meta charset="utf-8"><title>TikZ combined PDF gate</title><h1>' + id + ': ' + report.verdict
    + '</h1><p>' + scope + '</p><p>Policy: ' + declared.id + '</p><ul><li><a href="primary.html">Primary SVG and native numeric report</a></li>'
    + '<li><a href="pdf-oracle/index.html">Original oracle SVG versus ordinary PDF</a></li><li><a href="pdf-candidate/index.html">Candidate SVG versus ordinary PDF</a></li>'
    + '<li><a href="report.json">Combined machine-readable report</a></li></ul>');
  return report;
}
