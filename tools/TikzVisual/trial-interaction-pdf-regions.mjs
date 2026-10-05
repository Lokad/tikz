// Prospective independent PDF limits. Defects alter SVG artifacts only, never
// source sent to TeX; candidate trials explicitly bypass semantic checks.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer } from './compare.mjs';
import { measurePdfRegions } from './pdf-region-renderer.mjs';
import { pdfRegionVerdict } from './pdf-region-verdict.mjs';
import { pdfRegionViewer } from './pdf-region-viewer.mjs';

assert.ok(process.argv.length === 2 || process.argv.length === 3 && process.argv[2] === '--candidate',
  'Usage: node trial-interaction-pdf-regions.mjs [--candidate]');
const candidate = process.argv[2] === '--candidate';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'artifacts/interaction-pdf-region-trial-' + (candidate ? 'candidate' : 'oracle'));
await mkdir(output, { recursive: true }); await rm(path.join(output, 'trial-evidence.json'), { force: true });
const hash = b => createHash('sha256').update(b).digest('hex');
const snapshotBytes = await readFile(path.join(root, 'artifacts/interaction-pdf-region-calibration/calibration-evidence.json'));
const snapshot = JSON.parse(snapshotBytes);
assert.equal(snapshot.completed, true); assert.equal(snapshot.converterInvoked, false); assert.equal(snapshot.approvedPolicy, false);
assert.deepEqual(snapshot.expectedCases, ['state-paint', 'transforms', 'colors']);
for (const [file, sha256] of Object.entries(snapshot.toolHashes))
  assert.equal(hash(await readFile(path.join(root, file))), sha256, 'PDF calibration tool changed: ' + file);
const renderer = await createRenderer(), results = [], loaded = new Map();
async function base(id) {
  if (loaded.has(id)) return loaded.get(id);
  const c = snapshot.cases.find(c => c.caseId === id), folder = path.join(root, 'artifacts/interaction-pdf-region-calibration', id, 'native-css');
  const source = await readFile(path.join(folder, 'source.tikz'), 'utf8');
  assert.equal(hash(source), c.originalProvenance.sourceHashes['tests/Fixtures/Nodes/' + id + '.tikz']);
  const metricsBytes = await readFile(path.join(root, 'tests/Reference/NodeInteractionsRgb', id, 'metrics.json'));
  assert.equal(hash(metricsBytes), c.originalProvenance.artifacts['metrics.json']);
  const metrics = JSON.parse(metricsBytes);
  const glyphs = metrics.painting.filter(p => p.kind === 'glyph');
  const svgFile = candidate ? path.join(root, 'artifacts/node-interaction-primary', id, 'actual.svg') : path.join(folder, 'oracle.svg');
  const svg = await readFile(svgFile, 'utf8');
  let candidateProvenance;
  if (!candidate) assert.equal(hash(svg), c.variants[0].svgSha256);
  else {
    const report = JSON.parse(await readFile(path.join(root, 'artifacts/node-interaction-primary', id, 'report.json')));
    assert.equal(report.verdict, 'pass'); assert.equal(report.numeric.passed, true);
    assert.equal(report.artifacts['actual.svg'], hash(svg)); assert.equal(report.sourceHash, hash(source));
    const bytes = await readFile(path.join(root, 'artifacts/node-interaction-primary', id, 'candidate-provenance.json'));
    assert.equal(hash(bytes), report.artifacts['candidate-provenance.json']);
    candidateProvenance = { ...JSON.parse(bytes), primaryReportSha256: hash(await readFile(path.join(root,
      'artifacts/node-interaction-primary', id, 'report.json'))), numericChecks: report.numeric.checks.length };
  }
  const pdfPages = {};
  for (const scale of [1, 4]) {
    const bytes = await readFile(path.join(folder, 'pdf-page-' + scale + 'x.png'));
    assert.equal(hash(bytes), c.originalProvenance.artifacts['pdf-page-' + scale + 'x.png']);
    pdfPages[scale] = 'data:image/png;base64,' + bytes.toString('base64');
  }
  const data = { c, folder, source, metrics, glyphs, svg, pdfPages, candidateProvenance };
  loaded.set(id, data); return data;
}
async function mutation(svg, edit) {
  return renderer.page.evaluate(({ svg, edit, candidate }) => {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml'), root = doc.documentElement;
    const uses = [...doc.querySelectorAll('use')], paths = [...doc.querySelectorAll('path')].filter(p => !p.closest('defs,clipPath'));
    const glyph = i => candidate ? doc.getElementById('candidate-g' + i) : uses[i];
    const node = () => candidate ? [doc.getElementById('candidate-n' + edit.nodeIndex)] : edit.glyphIndices.map(glyph);
    const selected = edit.kind === 'crop' ? [root] : edit.kind === 'path-attribute' ? [candidate ? doc.getElementById('candidate-p' + edit.pathIndex) : paths[edit.pathIndex]]
      : edit.glyphIndex === undefined ? node() : [glyph(edit.glyphIndex)];
    if (selected.some(e => !e)) throw new Error('Missing intended PDF trial target.');
    if (edit.kind === 'remove') for (const e of selected) e.remove();
    else if (edit.kind === 'attribute' || edit.kind === 'path-attribute') for (const e of selected) e.setAttribute(edit.attribute, edit.value);
    else if (edit.kind === 'translate') for (const e of selected) {
      const g = doc.createElementNS(root.namespaceURI, 'g'); g.setAttribute('transform', 'translate(.25 .25)'); e.replaceWith(g); g.append(e);
    } else if (edit.kind === 'unclip') for (const e of selected) {
      const g = e.closest('[clip-path]'); if (!g) throw new Error('Missing intended PDF trial clip.'); g.removeAttribute('clip-path');
    } else if (edit.kind === 'paint-order') {
      const cover = candidate ? doc.getElementById('candidate-p' + edit.pathIndex) : paths[edit.pathIndex];
      if (!cover || selected.some(e => e.parentElement !== cover.parentElement)) throw new Error('Unexpected PDF trial paint structure.');
      cover.after(...selected);
    } else if (edit.kind === 'crop') {
      const box = root.getAttribute('viewBox').split(/\s+/).map(Number); box[1] += .5; root.setAttribute('viewBox', box.join(' '));
    } else throw new Error('Unknown PDF trial mutation.');
    return new XMLSerializer().serializeToString(doc);
  }, { svg, edit, candidate });
}
async function check(id, name, edit = null) {
  const b = await base(id), svg = edit ? await mutation(b.svg, edit) : b.svg;
  if (edit) assert.notEqual(svg, b.svg, 'PDF trial mutation must change the intended SVG.');
  const input = { svg, units: 'cssPixels', pdfPages: b.pdfPages, pdfOriginPixels: b.c.pdfOriginPixels,
    regions: b.c.regions, captureIds: ['whole-picture'] };
  const measured = await measurePdfRegions(renderer.page, input), verdict = pdfRegionVerdict(measured.results, b.c.regions);
  const failed = verdict.checks.filter(c => !c.passed);
  const captures = ['whole-picture', ...[...new Set(failed.filter(c => c.id !== 'whole-picture')
    .sort((a, b) => b.meanForegroundError - a.meanForegroundError || a.id.localeCompare(b.id)).map(c => c.id))].slice(0, 5)];
  if (captures.length > 1) {
    const repeated = await measurePdfRegions(renderer.page, { ...input, captureIds: captures });
    assert.deepEqual(repeated.results, measured.results); measured.images = repeated.images;
  }
  const folder = path.join(output, id + '-' + name); assert.ok(folder.startsWith(output + path.sep));
  await rm(folder, { recursive: true, force: true }); await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, 'actual.svg'), svg); await writeFile(path.join(folder, 'source.tikz'), b.source);
  for (const [file, data] of Object.entries(measured.images)) await writeFile(path.join(folder, file), Buffer.from(data, 'base64'));
  delete measured.images;
  measured.regionDefinitions = b.c.regions;
  await writeFile(path.join(folder, 'comparison-input.json'), JSON.stringify({ schemaVersion: 1, sourceRole: candidate ? 'candidate artifact' : 'native oracle',
    numericBypassed: true, approvedPolicy: false, snapshotSha256: hash(snapshotBytes), pdfOriginPixels: b.c.pdfOriginPixels,
    regions: b.c.regions, originalSvgSha256: hash(b.svg), svgSha256: hash(svg) }, null, 2) + '\n');
  await writeFile(path.join(folder, 'measurements.json'), JSON.stringify({ ...measured, verdict }, null, 2) + '\n');
  await writeFile(path.join(folder, 'index.html'), pdfRegionViewer(id, name, { ...measured, verdict }, captures, b.source,
    { scope: 'Prospective PDF policy trial against ' + (candidate ? 'candidate' : 'native oracle') + ' SVG artifacts; numeric gates bypassed; no approved PDF allowance.',
      svgFile: 'actual.svg', svgLabel: candidate ? 'Candidate SVG' : 'Native oracle SVG' }));
  const artifactFiles = ['actual.svg', 'source.tikz', 'comparison-input.json', 'measurements.json', 'index.html',
    ...captures.flatMap(id => [1, 4].flatMap(scale => ['pdf', 'svg', 'difference'].map(label => id + '-' + scale + 'x-' + label + '.png')))];
  const artifactHashes = Object.fromEntries(await Promise.all(artifactFiles.map(async file => [file, hash(await readFile(path.join(folder, file)))])));
  const expected = edit ? 'mismatch' : 'pass', actual = verdict.passed ? 'pass' : 'mismatch';
  const result = { caseId: id, name, expected, actual, passed: expected === actual, numericBypassed: true,
    originalSvgSha256: hash(b.svg), svgSha256: hash(svg), report: id + '-' + name + '/measurements.json',
    failedChecks: failed, globalPassed: verdict.checks.filter(c => c.id === 'whole-picture').every(c => c.passed), artifactHashes };
  results.push(result); console.log(id + '/' + name + ': ' + actual + ' (expected ' + expected + (result.passed ? ')' : '; ACCEPTED DEFECT/UNEXPECTED FAILURE)'));
}
try {
  for (const key of ['profile', 'playwright', 'browser', 'browserSha256', 'profileSha256', 'os', 'architecture', 'node'])
    assert.equal(renderer.identity[key], snapshot.renderer[key], 'PDF trial renderer differs: ' + key);
  for (const id of ['state-paint', 'transforms', 'colors']) { await check(id, 'unchanged-a'); await check(id, 'unchanged-b'); }
  const state = await base('state-paint'), glyph = (b, name, slot) => b.glyphs.findIndex(g => g.node === name
    && b.metrics.nodes.nodes.find(n => n.id === name).glyphs[g.glyphIndex].slot === slot);
  const node = (b, name) => ({ nodeIndex: b.metrics.nodes.nodes.findIndex(n => n.id === name),
    glyphIndices: b.glyphs.flatMap((g, i) => g.node === name ? [i] : []) });
  await check('state-paint', 'missing-ordinary-glyph', { kind: 'remove', glyphIndex: 0 });
  await check('state-paint', 'missing-period', { kind: 'remove', glyphIndex: state.glyphs.findIndex(g => state.metrics.nodes.nodes.find(n => n.id === g.node).glyphs[g.glyphIndex].slot === 46) });
  await check('state-paint', 'missing-faint-label', { kind: 'remove', ...node(state, 'faint') });
  await check('state-paint', 'missing-faint-period', { kind: 'remove', glyphIndex: glyph(state, 'faint', 46) });
  await check('state-paint', 'removed-label-clip', { kind: 'unclip', ...node(state, 'clipped') });
  await check('state-paint', 'wrong-text-opacity', { kind: 'attribute', ...node(state, 'text-opacity'), attribute: 'fill-opacity', value: '.7' });
  await check('state-paint', 'paint-order', { kind: 'paint-order', ...node(state, 'below-path'), pathIndex: 6 });
  await check('transforms', 'translated-glyph', { kind: 'translate', glyphIndex: 8 });
  await check('transforms', 'thickened-sheared-border', { kind: 'path-attribute', pathIndex: 6, attribute: 'stroke-width', value: '5.313408' });
  await check('transforms', 'cropped-miter-tip', { kind: 'crop', glyphIndices: [] });
  const colors = await base('colors');
  await check('colors', 'missing-low-contrast-label', { kind: 'remove', ...node(colors, 'white') });
  await check('colors', 'missing-low-contrast-period', { kind: 'remove', glyphIndex: glyph(colors, 'white', 46) });
  await check('colors', 'CMYK-magenta-text', { kind: 'attribute', ...node(colors, 'magenta'), attribute: 'fill', value: '#ec008c' });
  const files = ['tools/TikzVisual/trial-interaction-pdf-regions.mjs', 'tools/TikzVisual/pdf-region-renderer.mjs',
    'tools/TikzVisual/pdf-region-verdict.mjs', 'tools/TikzVisual/pdf-region-viewer.mjs'];
  await writeFile(path.join(output, 'trial-evidence.json'), JSON.stringify({ schemaVersion: 1, completed: true,
    approvedPolicy: false, conformanceClaim: false, sourceRole: candidate ? 'candidate artifacts' : 'native oracle',
    numericBypassed: true, independentSnapshotSha256: hash(snapshotBytes), renderer: renderer.identity,
    candidateProvenance: candidate ? Object.fromEntries([...loaded].map(([id, b]) => [id, b.candidateProvenance])) : undefined,
    toolHashes: Object.fromEntries(await Promise.all(files.map(async f => [f, hash(await readFile(path.join(root, f)))]))),
    passed: results.every(r => r.passed), results }, null, 2) + '\n');
  if (results.some(r => !r.passed)) process.exitCode = 1;
} finally { await renderer.browser.close(); }
