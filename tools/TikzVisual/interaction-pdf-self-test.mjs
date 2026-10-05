import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer } from './compare.mjs';
import { loadInteractionPdfPolicy } from './interaction-pdf-policy.mjs';
import { compareInteractionPdf } from './interaction-pdf.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'artifacts/interaction-pdf-mutations');
await mkdir(output, { recursive: true }); await rm(path.join(output, 'suite.json'), { force: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex'), results = [];
const evidence = await loadInteractionPdfPolicy();
for (const [name, suffix, edit] of [
  ['changed-PDF-evidence', 'pdf-calibration-page.json', b => Buffer.concat([b, Buffer.from(' ')])],
  ['missing-PDF-evidence', 'pdf-calibration-page.json', () => { throw new Error('Controlled missing evidence'); }],
  ['changed-viewport-evidence', 'pdf-viewport-probe.json', b => Buffer.concat([b, Buffer.from(' ')])],
  ['changed-PDF-renderer', 'pdf-region-renderer.mjs', b => Buffer.concat([b, Buffer.from(' ')])],
  ['changed-native-SVG', 'native-css.svg', b => Buffer.concat([b, Buffer.from(' ')])],
  ['unapproved-render-mode', 'interaction-pdf-profile.json', b => { const p = JSON.parse(b); p.renderMode = 'picture-image'; return Buffer.from(JSON.stringify(p)); }],
  ['missing-policy-case', 'interaction-pdf-profile.json', b => { const p = JSON.parse(b); delete p.cases.colors; return Buffer.from(JSON.stringify(p)); }],
  ['borrowed-primary-policy', 'interaction-profile.json', b => Buffer.concat([b, Buffer.from(' ')])]
]) {
  await assert.rejects(() => loadInteractionPdfPolicy(async file => file.endsWith(suffix) ? edit(await readFile(file)) : readFile(file)));
  results.push({ name, passed: true, category: 'policy rejection' });
}
for (const [name, key, edit] of [
  ['widened-regional-mean', 'calibration', v => { v.cases[0].regions[1].limits[0].maxMeanForegroundError = 255; }],
  ['missing-measurement', 'calibration', v => { v.cases[0].variants[0].checks.pop(); }],
  ['changed-fixed-region', 'calibration', v => { v.cases[0].regions[1].rectanglePixels.x += .25; }],
  ['fitted-PDF-origin', 'calibration', v => { v.cases[0].pdfOriginPixels.x += .25; }],
  ['missing-oracle-variant', 'calibration', v => { v.cases[0].variants.pop(); }],
  ['unrepeated-calibration', 'calibration', v => { v.cases[0].variants[0].repeatedCaptureHashesEqual = false; }],
  ['missing-viewport-control', 'viewportProbe', v => { v.cases[0].controls.pop(); }],
  ['failed-viewport-control', 'viewportProbe', v => { v.cases[0].controls.find(c => c.renderMode === 'page-coordinates').exactMatch = false; }]
]) {
  const policy = structuredClone(evidence.declared), file = policy[key + 'File'];
  const value = JSON.parse(await readFile(path.resolve(root, 'tools/TikzVisual', file))); edit(value);
  const bytes = Buffer.from(JSON.stringify(value)); policy[key + 'Sha256'] = hash(bytes);
  await assert.rejects(() => loadInteractionPdfPolicy(async f => f.endsWith('interaction-pdf-profile.json')
    ? Buffer.from(JSON.stringify(policy)) : f.endsWith(path.basename(file)) ? bytes : readFile(f)));
  results.push({ name, passed: true, category: 'rehashed evidence rejection' });
}
const renderer = await createRenderer(), loaded = new Map();
async function base(id) {
  if (loaded.has(id)) return loaded.get(id);
  const folder = path.join(root, 'artifacts/node-interaction-pdf', id), report = JSON.parse(await readFile(path.join(folder, 'report.json')));
  assert.equal(report.verdict, 'pass'); assert.equal(report.pdfPolicy.sha256, evidence.sha256);
  const data = { folder, actual: await readFile(path.join(folder, 'actual.svg'), 'utf8'), scene: JSON.parse(await readFile(path.join(folder, 'actual-scene.json'))) };
  loaded.set(id, data); return data;
}
async function copy(id, name) {
  const b = await base(id), folder = path.join(output, id + '-' + name);
  assert.ok(folder.startsWith(output + path.sep)); await rm(folder, { recursive: true, force: true }); await mkdir(folder, { recursive: true });
  for (const f of ['source.tikz', 'reference.svg', 'actual.svg', 'actual-scene.json', 'comparison-input.json', 'original-driver.svg',
    'metrics.json', 'native-positions.log', 'provenance.json', 'candidate-provenance.json', 'reference-frame.json', 'oracle.log',
    'reference.pdf', 'pdf-page-1x.png', 'pdf-page-4x.png']) await writeFile(path.join(folder, f), await readFile(path.join(b.folder, f)));
  return folder;
}
async function mutate(svg, edit) {
  return renderer.page.evaluate(({ svg, edit }) => {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml'), root = doc.documentElement;
    const e = edit.id ? doc.getElementById(edit.id) : root;
    if (!e) throw new Error('Missing intended PDF policy mutation target.');
    if (edit.kind === 'remove') e.remove();
    else if (edit.kind === 'attribute') e.setAttribute(edit.attribute, edit.value);
    else if (edit.kind === 'translate') { const g = doc.createElementNS(root.namespaceURI, 'g'); g.setAttribute('transform', 'translate(.25 .25)'); e.replaceWith(g); g.append(e); }
    else if (edit.kind === 'unclip') { const g = e.closest('[clip-path]'); if (!g) throw new Error('Missing intended clip.'); g.removeAttribute('clip-path'); }
    else if (edit.kind === 'paint-order') { const cover = doc.getElementById(edit.cover); if (!cover || cover.parentElement !== e.parentElement) throw new Error('Unexpected paint structure.'); cover.after(e); }
    else if (edit.kind === 'crop') { const b = root.getAttribute('viewBox').split(/\s+/).map(Number); b[1] += .5; root.setAttribute('viewBox', b.join(' ')); }
    else throw new Error('Unknown PDF policy mutation.');
    return new XMLSerializer().serializeToString(doc);
  }, { svg, edit });
}
async function check(id, name, edit, expected = 'mismatch') {
  const b = await base(id), folder = await copy(id, name), svg = edit ? await mutate(b.actual, edit) : b.actual;
  if (edit) assert.notEqual(svg, b.actual);
  await writeFile(path.join(folder, 'actual.svg'), svg);
  const report = await compareInteractionPdf(folder, renderer, { imageOnlyExperiment: true });
  assert.equal(report.verdict, expected); assert.equal(report.pdf.candidate.passed, expected === 'pass');
  assert.equal(report.pdf.oracle.passed, true); assert.equal(report.numeric.checks.length, 0);
  assert.equal(report.pdfPolicy.approvedPdfPolicy, false);
  assert.equal(report.pdf.candidate.checks.length, evidence.declared.cases[id].regions * 2);
  results.push({ caseId: id, name, passed: true, expected, actual: report.verdict, pdfOnlySensitivityVerified: true,
    numericBypassed: true, candidateSha256: hash(svg), report: id + '-' + name + '/report.json' });
  console.log(id + '/' + name + ': ' + report.verdict + ' (expected ' + expected + '; PDF verdict checked independently)');
}
try {
  for (const id of ['state-paint', 'transforms', 'colors']) { await check(id, 'unchanged-a', null, 'pass'); await check(id, 'unchanged-b', null, 'pass'); }
  const state = await base('state-paint'), nodeId = name => 'candidate-n' + state.scene.nodes.findIndex(n => n.name === name);
  const faint = state.scene.nodes.findIndex(n => n.name === 'faint');
  await check('state-paint', 'missing-ordinary-glyph', { kind: 'remove', id: 'candidate-g0' });
  await check('state-paint', 'missing-period', { kind: 'remove', id: state.scene.glyphs.find(g => g.slot === 46).svgElementId });
  await check('state-paint', 'missing-faint-label', { kind: 'remove', id: nodeId('faint') });
  await check('state-paint', 'missing-faint-period', { kind: 'remove', id: state.scene.glyphs.find(g => g.nodeId === faint && g.slot === 46).svgElementId });
  await check('state-paint', 'removed-label-clip', { kind: 'unclip', id: nodeId('clipped') });
  await check('state-paint', 'wrong-opacity', { kind: 'attribute', id: nodeId('text-opacity'), attribute: 'fill-opacity', value: '.7' });
  await check('state-paint', 'paint-order', { kind: 'paint-order', id: nodeId('below-path'), cover: 'candidate-p6' });
  await check('transforms', 'translated-glyph', { kind: 'translate', id: 'candidate-g8' });
  await check('transforms', 'thickened-border', { kind: 'attribute', id: 'candidate-p6', attribute: 'stroke-width', value: '5.313408' });
  await check('transforms', 'cropped-miter', { kind: 'crop' });
  const colors = await base('colors'), white = colors.scene.nodes.findIndex(n => n.name === 'white');
  await check('colors', 'missing-low-contrast-label', { kind: 'remove', id: 'candidate-n' + white });
  await check('colors', 'missing-low-contrast-period', { kind: 'remove', id: colors.scene.glyphs.find(g => g.nodeId === white && g.slot === 46).svgElementId });
  await check('colors', 'CMYK-magenta', { kind: 'attribute', id: 'candidate-n' + colors.scene.nodes.findIndex(n => n.name === 'magenta'), attribute: 'fill', value: '#ec008c' });
  const numericFolder = await copy('state-paint', 'numeric-failure'), numeric = JSON.parse(await readFile(path.join(numericFolder, 'comparison-input.json')));
  numeric.numeric.checks[0].passed = false; numeric.numeric.passed = false;
  await writeFile(path.join(numericFolder, 'comparison-input.json'), JSON.stringify(numeric));
  const numericReport = await compareInteractionPdf(numericFolder, renderer);
  assert.equal(numericReport.verdict, 'mismatch'); assert.equal(numericReport.primary.passed, true); assert.equal(numericReport.pdf.passed, true);
  results.push({ name: 'numeric-failure-with-correct-pixels', passed: true, category: 'combined verdict' });
  const heightFolder = await copy('state-paint', 'natural-height');
  await writeFile(path.join(heightFolder, 'actual.svg'), await mutate(state.actual,
    { kind: 'attribute', attribute: 'height', value: String(parseFloat(/height="([^"]+)"/.exec(state.actual)[1]) + .001) }));
  const heightReport = await compareInteractionPdf(heightFolder, renderer);
  assert.equal(heightReport.verdict, 'mismatch'); assert.equal(heightReport.dimensions.passed, false); assert.equal(heightReport.pdf.candidate.passed, false);
  results.push({ name: 'natural-height-and-physical-unit-failure', passed: true, category: 'combined verdict' });
  for (const [name, edit] of [
    ['empty-numeric', input => { input.numeric.checks = []; }],
    ['fitted-reference-origin', input => { input.referenceOriginBp.x += .25; }],
    ['caller-PDF-options', input => { input.pdf = {}; }]
  ]) {
    const folder = await copy('state-paint', name), input = JSON.parse(await readFile(path.join(folder, 'comparison-input.json')));
    edit(input); await writeFile(path.join(folder, 'comparison-input.json'), JSON.stringify(input));
    await assert.rejects(() => compareInteractionPdf(folder, renderer)); results.push({ name, passed: true, category: 'bundle rejection' });
  }
  const alteredPage = await copy('state-paint', 'changed-PDF-page');
  await writeFile(path.join(alteredPage, 'pdf-page-1x.png'), Buffer.concat([await readFile(path.join(alteredPage, 'pdf-page-1x.png')), Buffer.from(' ')]));
  await assert.rejects(() => compareInteractionPdf(alteredPage, renderer)); results.push({ name: 'changed-PDF-page', passed: true, category: 'bundle rejection' });
  await writeFile(path.join(output, 'suite.json'), JSON.stringify({ schemaVersion: 1, completed: true, passed: true,
    scope: 'Combined PDF policy: independent PDF image sensitivity, numeric/dimension gates, evidence and camera rejection',
    policySha256: evidence.sha256, renderer: renderer.identity, results }, null, 2) + '\n');
  console.log(results.length + ' combined PDF policy checks passed.');
} finally { await renderer.browser.close(); }
