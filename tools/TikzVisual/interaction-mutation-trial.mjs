// Unapproved-policy stress test. Limits come only from the independent oracle
// experiment; candidate errors never set them. All defect runs bypass numeric
// gates. An accepted defect makes this command fail.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer, compareBundle, profile } from './compare.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (process.argv.length > 3 || process.argv.length === 3 && process.argv[2] !== '--regional')
  throw new Error('Usage: node interaction-mutation-trial.mjs [--regional]');
const useRegions = process.argv[2] === '--regional';
const output = path.join(root, 'artifacts/interaction-mutation-trial-' + (useRegions ? 'regions' : 'global'));
await mkdir(output, { recursive: true });
await rm(path.join(output, 'suite.json'), { force: true });
const snapshotBytes = await readFile(path.join(root, 'tests/Reference/NodeInteractionsRgb/calibration-ink.json'));
const snapshot = JSON.parse(snapshotBytes);
assert.equal(snapshot.completed, true);
assert.equal(snapshot.converterInvoked, false);
assert.equal(snapshot.conformanceClaim, false);
assert.deepEqual(snapshot.expectedCases, ['state-paint', 'transforms', 'colors']);
const snapshotSha256 = createHash('sha256').update(snapshotBytes).digest('hex');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const regionalBytes = useRegions ? await readFile(path.join(root, 'artifacts/interaction-region-calibration/calibration-evidence.json')) : null;
const regional = regionalBytes ? JSON.parse(regionalBytes) : null;
if (regional) {
  assert.equal(regional.completed, true); assert.equal(regional.converterInvoked, false);
  assert.equal(regional.approvedPolicy, false); assert.equal(regional.baseCalibrationSha256, snapshotSha256);
  assert.deepEqual(regional.expectedCases, snapshot.expectedCases);
  assert.deepEqual(regional.cases.map(c => c.caseId), snapshot.expectedCases);
  for (const [file, sha256] of Object.entries(regional.toolHashes))
    assert.equal(createHash('sha256').update(await readFile(path.join(root, file))).digest('hex'), sha256,
      'Regional calibration tool changed: ' + file);
}
const renderer = await createRenderer();
const results = [];
const loaded = new Map();

async function baseline(id) {
  if (loaded.has(id)) return loaded.get(id);
  const folder = path.join(root, 'artifacts/node-interactions-rgb-ink', id);
  const input = JSON.parse(await readFile(path.join(folder, 'comparison-input.json')));
  assert.equal(input.numeric.passed, true, 'Native candidate measurements must pass before image trials.');
  assert.ok(input.numeric.checks.length > 0);
  const oracle = snapshot.cases.find(c => c.caseId === id);
  const reference = await readFile(path.join(folder, 'reference.svg'));
  assert.equal(createHash('sha256').update(reference).digest('hex'), oracle.variants[0].referenceSha256);
  const checks = oracle.variants.flatMap(v => v.primary.checks);
  assert.ok(checks.every(c => c.referenceComponents === c.actualComponents));
  // Mutate only this process's imported profile object. No reviewed profile
  // file or baseline is written, and every report labels the policy as a trial.
  profile.cases['interaction-trial-' + id] = { primary: {
    maxChannelError: Math.max(...checks.map(c => c.maxChannelError)),
    maxMeanForegroundError: Math.ceil(Math.max(...checks.map(c => c.meanForegroundError)) * 1e6) / 1e6,
    maxEdgeDisplacementRasterPixels: Math.max(...checks.map(c => c.maxEdgeDisplacementPixels * c.scale)),
    maxComponentDifference: 0
  } };
  const data = { folder, input, reference: reference.toString('utf8'),
    actual: await readFile(path.join(folder, 'actual.svg'), 'utf8'),
    scene: JSON.parse(await readFile(path.join(folder, 'actual-scene.json'))) };
  loaded.set(id, data);
  return data;
}

async function mutate(source, edit) {
  const result = await renderer.page.evaluate(({ source, edit }) => {
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    const root = doc.documentElement;
    const target = edit.id ? doc.getElementById(edit.id) : root;
    if (!target) throw new Error('Missing mutation target: ' + edit.id);
    if (edit.kind === 'remove') target.remove();
    else if (edit.kind === 'attribute') target.setAttribute(edit.attribute, edit.value);
    else if (edit.kind === 'translate') {
      const group = doc.createElementNS(root.namespaceURI, 'g');
      group.setAttribute('transform', 'translate(.25 .25)');
      target.replaceWith(group); group.append(target);
    } else if (edit.kind === 'unclip') {
      const parent = target.closest('[clip-path]');
      if (!parent) throw new Error('Missing intended clip.');
      parent.removeAttribute('clip-path');
    } else if (edit.kind === 'paint-order') {
      const cover = doc.getElementById(edit.cover);
      if (!cover || cover.parentElement !== target.parentElement) throw new Error('Unexpected paint-order structure.');
      cover.after(target);
    } else if (edit.kind === 'crop-top') {
      const box = root.getAttribute('viewBox').split(/\s+/).map(Number);
      box[1] += .5; root.setAttribute('viewBox', box.join(' '));
    } else if (edit.kind === 'faint-stroke') {
      const origin = edit.origin ?? { x: 0, y: 0 }, factor = edit.origin ? .75 : 1;
      const line = doc.createElementNS(root.namespaceURI, 'path');
      line.setAttribute('d', 'M' + (origin.x + 70 * factor) + ' ' + (origin.y - 100 * factor)
        + 'L' + (origin.x + 74 * factor) + ' ' + (origin.y - 100 * factor));
      line.setAttribute('stroke', '#000'); line.setAttribute('stroke-width', String(factor));
      line.setAttribute('stroke-opacity', '.01'); line.setAttribute('fill', 'none'); root.append(line);
    } else throw new Error('Unknown controlled mutation.');
    return new XMLSerializer().serializeToString(doc);
  }, { source, edit });
  assert.notEqual(result, source, 'A mutation must change its intended artifact.');
  return result;
}

async function check(id, name, edit, expected = 'mismatch', extra = {}) {
  const base = await baseline(id), folder = path.join(output, id + '-' + name);
  if (!folder.startsWith(output + path.sep)) throw new Error('Trial output escapes its artifact directory.');
  await rm(folder, { recursive: true, force: true }); await mkdir(folder, { recursive: true });
  for (const file of ['source.tikz', 'actual-scene.json', 'provenance.json', 'reference-frame.json', 'original-driver.svg'])
    await writeFile(path.join(folder, file), await readFile(path.join(base.folder, file)));
  const input = { ...base.input, caseId: id + '-' + name, toleranceProfile: 'interaction-trial-' + id, exactPrimary: false,
    scope: 'UNAPPROVED precision-policy trial from independent ink-frame snapshot ' + snapshotSha256 + '; numeric gates bypassed for image defects',
    numeric: { passed: true, checks: [], note: 'Controlled image-only trial; no candidate semantic conformance claim.' } };
  if (regional) {
    input.regionalChecks = structuredClone(regional.cases.find(c => c.caseId === id).regions);
    if (extra.faintStroke) input.regionalChecks.push({ id: 'synthetic-faint-stroke',
      basis: 'Explicit synthetic four-pixel line at one percent opacity, plus fixed one-pixel padding',
      rectanglePixels: { x: 68.5, y: -101.5, width: 7, height: 3 },
      limits: profile.scales.flatMap(scale => ['transparent', 'white', 'black'].map(background => ({
        scale, background, maxChannelError: 0, maxMeanForegroundError: 0, maxEdgeDisplacementPixels: 0, maxComponentDifference: 0
      }))) });
  }
  await writeFile(path.join(folder, 'comparison-input.json'), JSON.stringify(input, null, 2));
  const reference = extra.faintStroke ? await mutate(base.reference, { kind: 'faint-stroke', origin: input.referenceOriginBp }) : base.reference;
  let actual = edit ? await mutate(base.actual, edit) : base.actual;
  if (extra.faintStroke && extra.present) actual = await mutate(actual, { kind: 'faint-stroke' });
  await writeFile(path.join(folder, 'reference.svg'), reference); await writeFile(path.join(folder, 'actual.svg'), actual);
  const report = await compareBundle(folder, renderer);
  const passed = report.verdict === expected;
  results.push({ caseId: id, name, expected, actual: report.verdict, passed, numericBypassed: true,
    originalCandidateSha256: hash(base.actual), actualSha256: hash(actual), referenceSha256: hash(reference),
    globalPassed: report.primary.checks.every(c => c.passed), primaryPassed: report.primary.passed,
    regionalFailures: report.primary.regionalChecks?.filter(c => !c.passed).map(c => ({ id: c.id, scale: c.scale,
      background: c.background, maxChannelError: c.maxChannelError, meanForegroundError: c.meanForegroundError, thresholds: c.thresholds })),
    dimensionsPassed: report.dimensions.passed, report: id + '-' + name + '/report.json' });
  console.log(id + '/' + name + ': ' + report.verdict + ' (expected ' + expected + (passed ? ')' : '; ACCEPTED DEFECT/UNEXPECTED FAILURE)'));
}

try {
  if (regional) for (const key of ['profile', 'playwright', 'browser', 'browserSha256', 'profileSha256', 'os', 'osRelease', 'architecture', 'node'])
    assert.equal(renderer.identity[key], regional.renderer[key], 'Regional calibration renderer differs: ' + key);
  for (const id of ['state-paint', 'transforms', 'colors']) {
    await check(id, 'unchanged-a', null, 'pass');
    await check(id, 'unchanged-b', null, 'pass');
  }
  const state = await baseline('state-paint');
  const nodeId = name => 'candidate-n' + state.scene.nodes.findIndex(n => n.name === name);
  const faintIndex = state.scene.nodes.findIndex(n => n.name === 'faint');
  const faintPeriod = state.scene.glyphs.find(g => g.nodeId === faintIndex && g.slot === 46).svgElementId;
  const ordinaryPeriod = state.scene.glyphs.find(g => g.slot === 46).svgElementId;
  await check('state-paint', 'missing-period', { kind: 'remove', id: ordinaryPeriod });
  await check('state-paint', 'missing-faint-label', { kind: 'remove', id: nodeId('faint') });
  await check('state-paint', 'missing-faint-period', { kind: 'remove', id: faintPeriod });
  await check('state-paint', 'removed-label-clip', { kind: 'unclip', id: nodeId('clipped') });
  await check('state-paint', 'wrong-text-opacity', { kind: 'attribute', id: nodeId('text-opacity'), attribute: 'fill-opacity', value: '.7' });
  await check('state-paint', 'paint-order', { kind: 'paint-order', id: nodeId('below-path'), cover: 'candidate-p6' });
  await check('state-paint', 'synthetic-faint-stroke-present', null, 'pass', { faintStroke: true, present: true });
  await check('state-paint', 'synthetic-faint-stroke-removed', null, 'mismatch', { faintStroke: true });
  await check('transforms', 'translated-glyph', { kind: 'translate', id: 'candidate-g8' });
  await check('transforms', 'thickened-sheared-border', { kind: 'attribute', id: 'candidate-p6', attribute: 'stroke-width', value: '5.313408' });
  await check('transforms', 'cropped-miter-tip', { kind: 'crop-top' });
  const colors = await baseline('colors');
  const whiteIndex = colors.scene.nodes.findIndex(n => n.name === 'white');
  const whitePeriod = colors.scene.glyphs.find(g => g.nodeId === whiteIndex && g.slot === 46).svgElementId;
  const magentaIndex = colors.scene.nodes.findIndex(n => n.name === 'magenta');
  await check('colors', 'missing-low-contrast-label', { kind: 'remove', id: 'candidate-n' + whiteIndex });
  await check('colors', 'missing-low-contrast-period', { kind: 'remove', id: whitePeriod });
  await check('colors', 'CMYK-magenta-text', { kind: 'attribute', id: 'candidate-n' + magentaIndex, attribute: 'fill', value: '#ec008c' });
  await writeFile(path.join(output, 'suite.json'), JSON.stringify({ schemaVersion: 1, completed: true,
    approvedPolicy: false, conformanceClaim: false, independentSnapshotSha256: snapshotSha256, regionalChecksEnabled: useRegions,
    renderer: renderer.identity, toolHashes: Object.fromEntries(await Promise.all([
      'tools/TikzVisual/interaction-mutation-trial.mjs', 'tools/TikzVisual/compare.mjs', 'tools/TikzVisual/browser-profile.json'
    ].map(async file => [file, hash(await readFile(path.join(root, file)))]))),
    independentRegionalSha256: regionalBytes && createHash('sha256').update(regionalBytes).digest('hex'),
    passed: results.every(r => r.passed), results }, null, 2) + '\n');
  if (results.some(r => !r.passed)) process.exitCode = 1;
} finally { await renderer.browser.close(); }
