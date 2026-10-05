import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer, profile } from './compare.mjs';
import { loadInteractionPolicy, compareInteractionPrimary } from './interaction-primary.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'artifacts/interaction-primary-mutations');
await mkdir(output, { recursive: true }); await rm(path.join(output, 'suite.json'), { force: true });
const evidence = await loadInteractionPolicy();
const results = [];
const hash = value => createHash('sha256').update(value).digest('hex');
// Missing/tampered evidence or inflated policy values must fail before pixels.
for (const [name, suffix, edit] of [
  ['changed-primary-evidence', 'calibration-ink.json', value => Buffer.concat([value, Buffer.from(' ')])],
  ['changed-regional-evidence', 'calibration-regions.json', value => Buffer.concat([value, Buffer.from(' ')])],
  ['missing-regional-evidence', 'calibration-regions.json', () => { throw new Error('Controlled missing evidence'); }],
  ['changed-comparator', 'compare.mjs', value => Buffer.concat([value, Buffer.from(' ')])],
  ['widened-global-policy', 'interaction-profile.json', value => {
    const policy = JSON.parse(value); policy.cases.transforms.primary.maxChannelError = 255; return Buffer.from(JSON.stringify(policy));
  }],
  ['missing-policy-case', 'interaction-profile.json', value => {
    const policy = JSON.parse(value); delete policy.cases.colors; return Buffer.from(JSON.stringify(policy));
  }]
]) {
  await assert.rejects(() => loadInteractionPolicy(async file => file.endsWith(suffix) ? edit(await readFile(file)) : readFile(file)));
  results.push({ name, passed: true, category: 'policy rejection' });
}
const renderer = await createRenderer();
const loaded = new Map();
async function base(id) {
  if (loaded.has(id)) return loaded.get(id);
  const folder = path.join(root, 'artifacts/node-interaction-primary', id);
  const report = JSON.parse(await readFile(path.join(folder, 'report.json')));
  assert.equal(report.verdict, 'pass', 'A fresh passing primary bundle is required.');
  assert.equal(report.rasterPolicy.id, evidence.declared.id); assert.equal(report.rasterPolicy.sha256, evidence.sha256);
  const data = { folder, scene: JSON.parse(await readFile(path.join(folder, 'actual-scene.json'))),
    actual: await readFile(path.join(folder, 'actual.svg'), 'utf8') };
  loaded.set(id, data); return data;
}
async function copy(id, name) {
  const original = await base(id), folder = path.join(output, id + '-' + name);
  assert.ok(folder.startsWith(output + path.sep));
  await rm(folder, { recursive: true, force: true }); await mkdir(folder, { recursive: true });
  for (const file of ['source.tikz', 'reference.svg', 'actual.svg', 'actual-scene.json', 'comparison-input.json',
    'original-driver.svg', 'metrics.json', 'native-positions.log', 'provenance.json', 'candidate-provenance.json', 'reference-frame.json'])
    await writeFile(path.join(folder, file), await readFile(path.join(original.folder, file)));
  return folder;
}
async function mutate(source, edit) {
  const result = await renderer.page.evaluate(({ source, edit }) => {
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml'), root = doc.documentElement;
    const target = edit.id ? doc.getElementById(edit.id) : root;
    if (!target) throw new Error('Missing mutation target');
    if (edit.kind === 'remove') target.remove();
    else if (edit.kind === 'attribute') target.setAttribute(edit.attribute, edit.value);
    else if (edit.kind === 'translate') {
      const group = doc.createElementNS(root.namespaceURI, 'g'); group.setAttribute('transform', 'translate(.25 .25)');
      target.replaceWith(group); group.append(target);
    } else if (edit.kind === 'unclip') {
      const clip = target.closest('[clip-path]'); if (!clip) throw new Error('Missing intended clip'); clip.removeAttribute('clip-path');
    } else if (edit.kind === 'paint-order') {
      const cover = doc.getElementById(edit.cover); if (!cover || cover.parentElement !== target.parentElement) throw new Error('Unexpected paint-order structure');
      cover.after(target);
    } else if (edit.kind === 'crop') {
      const box = root.getAttribute('viewBox').split(/\s+/).map(Number); box[1] += .5; root.setAttribute('viewBox', box.join(' '));
    } else if (edit.kind === 'faint-stroke') {
      const origin = edit.origin ?? { x: 0, y: 0 }, factor = edit.origin ? .75 : 1;
      const line = doc.createElementNS(root.namespaceURI, 'path');
      line.setAttribute('d', 'M' + (origin.x + 70 * factor) + ' ' + (origin.y - 100 * factor)
        + 'L' + (origin.x + 74 * factor) + ' ' + (origin.y - 100 * factor));
      line.setAttribute('stroke', '#000'); line.setAttribute('stroke-width', String(factor));
      line.setAttribute('stroke-opacity', '.01'); line.setAttribute('fill', 'none'); root.append(line);
    } else throw new Error('Unknown controlled mutation');
    return new XMLSerializer().serializeToString(doc);
  }, { source, edit });
  assert.notEqual(result, source); return result;
}
async function check(id, name, edit, expected = 'mismatch', synthetic = null) {
  const folder = await copy(id, name), original = await base(id);
  let actual = original.actual;
  if (edit) actual = await mutate(actual, edit);
  if (synthetic?.present) actual = await mutate(actual, { kind: 'faint-stroke' });
  await writeFile(path.join(folder, 'actual.svg'), actual);
  if (synthetic) {
    const input = JSON.parse(await readFile(path.join(folder, 'comparison-input.json')));
    await writeFile(path.join(folder, 'reference.svg'), await mutate(await readFile(path.join(folder, 'reference.svg'), 'utf8'),
      { kind: 'faint-stroke', origin: input.referenceOriginBp }));
  }
  const syntheticRegions = synthetic ? [{ id: 'synthetic-faint-stroke', rectanglePixels: { x: 68.5, y: -101.5, width: 7, height: 3 },
    limits: profile.scales.flatMap(scale => ['transparent', 'white', 'black'].map(background => ({
      scale, background, maxChannelError: 0, maxMeanForegroundError: 0, maxEdgeDisplacementPixels: 0, maxComponentDifference: 0
    }))) }] : undefined;
  const report = await compareInteractionPrimary(folder, renderer, { caseId: id, imageOnlyExperiment: true, syntheticRegions });
  assert.equal(report.verdict, expected, id + '/' + name); assert.equal(report.numeric.checks.length, 0);
  assert.equal(report.rasterPolicy.approvedPrimaryPolicy, false);
  const viewer = await readFile(path.join(folder, 'index.html'), 'utf8');
  const embedded = JSON.parse(/<script>const report=(.*?);const actual=/.exec(viewer)[1]);
  assert.deepEqual(embedded.rasterPolicy, report.rasterPolicy);
  assert.deepEqual(embedded.toolHashes, report.toolHashes);
  assert.ok(viewer.includes('numeric gates bypassed.'));
  results.push({ caseId: id, name, passed: true, expected, actual: report.verdict, numericBypassed: true,
    actualSha256: hash(actual), report: id + '-' + name + '/report.json' });
  console.log(id + '/' + name + ': ' + report.verdict + ' (expected ' + expected + ')');
}
try {
  for (const id of ['state-paint', 'transforms', 'colors']) {
    await check(id, 'unchanged-a', null, 'pass'); await check(id, 'unchanged-b', null, 'pass');
  }
  const state = await base('state-paint'), nodeId = name => 'candidate-n' + state.scene.nodes.findIndex(n => n.name === name);
  const faint = state.scene.nodes.findIndex(n => n.name === 'faint');
  await check('state-paint', 'missing-period', { kind: 'remove', id: state.scene.glyphs.find(g => g.slot === 46).svgElementId });
  await check('state-paint', 'missing-faint-label', { kind: 'remove', id: nodeId('faint') });
  await check('state-paint', 'missing-faint-period', { kind: 'remove', id: state.scene.glyphs.find(g => g.nodeId === faint && g.slot === 46).svgElementId });
  await check('state-paint', 'removed-label-clip', { kind: 'unclip', id: nodeId('clipped') });
  await check('state-paint', 'wrong-text-opacity', { kind: 'attribute', id: nodeId('text-opacity'), attribute: 'fill-opacity', value: '.7' });
  await check('state-paint', 'paint-order', { kind: 'paint-order', id: nodeId('below-path'), cover: 'candidate-p6' });
  await check('state-paint', 'faint-stroke-present', null, 'pass', { present: true });
  await check('state-paint', 'faint-stroke-removed', null, 'mismatch', { present: false });
  await check('transforms', 'translated-glyph', { kind: 'translate', id: 'candidate-g8' });
  await check('transforms', 'thickened-sheared-border', { kind: 'attribute', id: 'candidate-p6', attribute: 'stroke-width', value: '5.313408' });
  await check('transforms', 'cropped-miter-tip', { kind: 'crop' });
  const colors = await base('colors'), white = colors.scene.nodes.findIndex(n => n.name === 'white');
  await check('colors', 'missing-low-contrast-label', { kind: 'remove', id: 'candidate-n' + white });
  await check('colors', 'missing-low-contrast-period', { kind: 'remove', id: colors.scene.glyphs.find(g => g.nodeId === white && g.slot === 46).svgElementId });
  await check('colors', 'CMYK-magenta-text', { kind: 'attribute', id: 'candidate-n' + colors.scene.nodes.findIndex(n => n.name === 'magenta'), attribute: 'fill', value: '#ec008c' });
  const numericFolder = await copy('state-paint', 'numeric-failure');
  const numeric = JSON.parse(await readFile(path.join(numericFolder, 'comparison-input.json')));
  numeric.numeric.checks[0].passed = false; numeric.numeric.passed = false;
  await writeFile(path.join(numericFolder, 'comparison-input.json'), JSON.stringify(numeric));
  const failed = await compareInteractionPrimary(numericFolder, renderer);
  assert.equal(failed.verdict, 'mismatch'); assert.equal(failed.primary.passed, true);
  results.push({ name: 'numeric-failure', passed: true, category: 'combined verdict' });
  const dimensionFolder = await copy('state-paint', 'natural-height');
  await writeFile(path.join(dimensionFolder, 'actual.svg'), await mutate(state.actual,
    { kind: 'attribute', attribute: 'height', value: String(parseFloat(/height="([^"]+)"/.exec(state.actual)[1]) + .001) }));
  const dimension = await compareInteractionPrimary(dimensionFolder, renderer);
  assert.equal(dimension.verdict, 'mismatch'); assert.equal(dimension.dimensions.passed, false);
  results.push({ name: 'natural-height', passed: true, category: 'natural dimension gate' });
  for (const [name, edit] of [
    ['PDF-unapproved', input => { input.pdf = {}; }],
    ['empty-numeric', input => { input.numeric.checks = []; }],
    ['fitted-registration', input => { input.referenceOriginBp.x += .25; }]
  ]) {
    const folder = await copy('state-paint', name), input = JSON.parse(await readFile(path.join(folder, 'comparison-input.json')));
    edit(input); await writeFile(path.join(folder, 'comparison-input.json'), JSON.stringify(input));
    await assert.rejects(() => compareInteractionPrimary(folder, renderer));
    results.push({ name, passed: true, category: 'bundle rejection' });
  }
  await writeFile(path.join(output, 'suite.json'), JSON.stringify({ schemaVersion: 1, completed: true, passed: true,
    scope: 'Approved primary policy wiring/mutations; image defects bypass numeric gates; no PDF conformance claim',
    policySha256: evidence.sha256, renderer: renderer.identity, results }, null, 2) + '\n');
  console.log(results.length + ' primary interaction policy checks passed.');
} finally { await renderer.browser.close(); }
