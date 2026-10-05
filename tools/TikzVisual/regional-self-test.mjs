// Synthetic image-only checks of the optional regional gate. No converter,
// TeX engine, existing candidate bundle, or production font resource is used.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer, compareBundle, profile } from './compare.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'artifacts/regional-comparator-mutations');
await mkdir(output, { recursive: true });
await rm(path.join(output, 'suite.json'), { force: true });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const snapshotBytes = await readFile(path.join(root, 'tests/Reference/NodeInteractionsRgb/calibration-ink.json'));
const snapshot = JSON.parse(snapshotBytes);
assert.equal(snapshot.completed, true); assert.equal(snapshot.converterInvoked, false);
const independent = snapshot.cases.find(c => c.caseId === 'state-paint').variants.flatMap(v => v.primary.checks);
// This prospective global limit intentionally reproduces the dilution defect.
// It is not written into any reviewed profile or used to set regional limits.
profile.cases['regional-self-test'] = { primary: {
  maxChannelError: Math.max(...independent.map(c => c.maxChannelError)),
  maxMeanForegroundError: Math.ceil(Math.max(...independent.map(c => c.meanForegroundError)) * 1e6) / 1e6,
  maxEdgeDisplacementRasterPixels: Math.max(...independent.map(c => c.maxEdgeDisplacementPixels * c.scale)),
  maxComponentDifference: 0
} };
const limits = profile.scales.flatMap(scale => ['transparent', 'white', 'black'].map(background => ({
  scale, background, maxChannelError: 0, maxMeanForegroundError: 0, maxEdgeDisplacementPixels: 0, maxComponentDifference: 0
})));
// These positions and regions are fixed before either rendered pair is read.
const periodRegion = { id: 'faint-period', actualElementId: 'faint-period', basis: 'Explicit synthetic punctuation bounds plus fixed two-pixel padding',
  rectanglePixels: { x: 178, y: 18, width: 5, height: 5 }, limits };
const strokeRegion = { id: 'faint-stroke', basis: 'Explicit synthetic four-pixel stroke plus fixed two-pixel padding',
  rectanglePixels: { x: 178, y: 37.5, width: 8, height: 5 }, limits };
const opaque = '<path d="M10 10H150V110H10Z" fill="black"/>';
const period = '<path id="faint-period" d="M180 20H181V21H180Z" fill="black" fill-opacity=".01"/>';
const stroke = '<path d="M180 40H184" fill="none" stroke="black" stroke-width="1" stroke-opacity=".01"/>';
const frame = (content, reference = false) => '<svg xmlns="http://www.w3.org/2000/svg" width="256px" height="128px" viewBox="'
  + (reference ? '0 0 192 96' : '0 0 256 128') + '">' + (reference ? '<g transform="scale(.75)">' : '')
  + content + (reference ? '</g>' : '') + '</svg>';
const renderer = await createRenderer();
const results = [];

async function bundle(name, reference, actual, regions) {
  const folder = path.join(output, name);
  if (!folder.startsWith(output + path.sep)) throw new Error('Regional test output escapes its artifact directory.');
  await rm(folder, { recursive: true, force: true }); await mkdir(folder, { recursive: true });
  const input = { schemaVersion: 1, caseId: name, toleranceProfile: 'regional-self-test',
    referenceMode: 'synthetic-comparator-only', referenceOriginBp: { x: 0, y: 0 }, numericTolerancePixels: 0,
    scope: 'UNAPPROVED synthetic comparator check; whole-image limits from independent snapshot; exact declared regions',
    numeric: { passed: true, checks: [], note: 'Image-only test; numeric gates deliberately bypassed.' },
    ...(regions === undefined ? {} : { regionalChecks: regions }) };
  const source = '% Synthetic faint period and stroke next to unrelated opaque ink.\n';
  const scene = { schemaVersion: 1, paths: [{ svgElementId: 'faint-period', semanticId: 'synthetic-period',
    source: { start: 0, length: source.length, line: 1, column: 1 }, inkBounds: { minX: 180, maxX: 181, minY: 20, maxY: 21 } }] };
  for (const [file, data] of Object.entries({
    'reference.svg': frame(reference, true), 'actual.svg': frame(actual), 'source.tikz': source,
    'comparison-input.json': JSON.stringify(input, null, 2), 'actual-scene.json': JSON.stringify(scene, null, 2),
    'provenance.json': JSON.stringify({ schemaVersion: 1, synthetic: true, independentSnapshotSha256: digest(snapshotBytes) }, null, 2)
  })) await writeFile(path.join(folder, file), data);
  return folder;
}

async function check(name, reference, actual, regions, expected, expectedGlobal = true, inspect = false) {
  const folder = await bundle(name, reference, actual, regions);
  const report = await compareBundle(folder, renderer);
  assert.equal(report.verdict, expected, name);
  assert.equal(report.primary.checks.every(c => c.passed), expectedGlobal, name + ' global gate');
  assert.equal(report.numeric.passed, true); assert.equal(report.dimensions.passed, true);
  if (regions?.length) assert.equal(report.primary.regionalChecks.length, regions.length * profile.scales.length * 3);
  else assert.equal(report.primary.regionalChecks, undefined, 'Legacy reports retain their original shape.');
  if (inspect) {
    const crop = report.regionalRegions.find(c => c.id === 'faint-period');
    assert.ok(crop); assert.equal(crop.semanticId, 'synthetic-period'); assert.equal(crop.source.line, 1);
    assert.ok((await readFile(path.join(folder, 'index.html'), 'utf8')).includes('Independent region faint-period'));
    for (const file of [crop.reference, crop.actual, crop.difference]) {
      await access(path.join(folder, file)); assert.equal(report.artifacts[file], digest(await readFile(path.join(folder, file))));
    }
  }
  results.push({ name, passed: true, expected, globalPassed: expectedGlobal, report: name + '/report.json' });
  console.log(name + ': ' + expected + ' (expected)');
  return report;
}

async function reject(name, regions, pattern = /independent.*region|regional limit/i) {
  const folder = await bundle(name, opaque + period, opaque + period, regions);
  await assert.rejects(compareBundle(folder, renderer), pattern, name);
  await assert.rejects(access(path.join(folder, 'report.json')), /ENOENT/, 'Infrastructure failure must not leave a passing report.');
  results.push({ name, passed: true, expected: 'rejected malformed manifest' });
  console.log(name + ': rejected (expected)');
}

try {
  await check('unchanged-legacy', opaque + period, opaque + period, undefined, 'pass');
  const repeated = await check('unchanged-regional-a', opaque + period, opaque + period, [periodRegion], 'pass');
  const repeat = await check('unchanged-regional-b', opaque + period, opaque + period, [periodRegion], 'pass');
  assert.deepEqual(repeated.primary.regionalChecks, repeat.primary.regionalChecks);
  assert.equal(repeated.artifacts['actual-4x.png'], repeat.artifacts['actual-4x.png']);
  await check('missing-period-global-counterexample', opaque + period, opaque, undefined, 'pass');
  await check('missing-period-regional', opaque + period, opaque, [periodRegion], 'mismatch', true, true);
  await check('missing-stroke-global-counterexample', opaque + stroke, opaque, undefined, 'pass');
  await check('missing-stroke-regional', opaque + stroke, opaque, [strokeRegion], 'mismatch');
  await check('extra-stroke-regional', opaque, opaque + stroke, [strokeRegion], 'mismatch');
  await check('shifted-period-regional', opaque + period, opaque + '<g transform="translate(.25 .25)">' + period + '</g>', [periodRegion], 'mismatch');
  await check('lost-opaque-ink', opaque + period, period, [periodRegion], 'mismatch', false);
  const displayOnly = { ...periodRegion, limits: limits.map(l => l.scale === 1 ? l : { ...l, maxChannelError: 255,
    maxMeanForegroundError: 255, maxEdgeDisplacementPixels: 100, maxComponentDifference: 100 }) };
  const display = await check('display-only-failure', opaque + period, opaque, [displayOnly], 'mismatch', true, true);
  assert.equal(display.regionalRegions[0].scale, 1);
  assert.ok(display.primary.regionalChecks.filter(c => c.scale === 4).every(c => c.passed));
  const manyRegions = Array.from({ length: profile.maxCrops + 3 }, (_, i) => ({ ...periodRegion, id: 'period-' + i, actualElementId: 'period-' + i,
    rectanglePixels: { x: 178 + i * 4, y: 58, width: 5, height: 5 } }));
  const manyPeriods = manyRegions.map((r, i) => '<g transform="translate(' + i * 4 + ' 40)">'
    + period.replace('id="faint-period"', 'id="' + r.id + '"') + '</g>').join('');
  const many = await check('bounded-crops-preserve-all-failures', opaque + manyPeriods, opaque, manyRegions, 'mismatch');
  assert.equal(many.regionalRegions.length, profile.maxCrops); assert.equal(many.regionalCropsTruncated, true);
  assert.equal(many.regionalRegions.length + many.regions.length, profile.maxCrops);
  assert.equal(new Set(many.primary.regionalChecks.filter(c => !c.passed).map(c => c.id)).size, manyRegions.length);
  await reject('duplicate-region', [periodRegion, periodRegion]);
  await reject('null-region', [null]);
  await reject('negative-region-width', [{ ...periodRegion, rectanglePixels: { ...periodRegion.rectanglePixels, width: -1 } }]);
  await reject('missing-limits', [{ ...periodRegion, limits: [] }]);
  await reject('duplicate-limit', [{ ...periodRegion, limits: limits.map((l, i) => i === 1 ? limits[0] : l) }]);
  await reject('null-limit', [{ ...periodRegion, limits: limits.map((l, i) => i ? l : null) }]);
  await reject('invalid-channel-limit', [{ ...periodRegion, limits: limits.map(l => ({ ...l, maxChannelError: 256 })) }]);
  await reject('noninteger-components', [{ ...periodRegion, limits: limits.map(l => ({ ...l, maxComponentDifference: .5 })) }]);
  await reject('outside-camera', [{ ...periodRegion, rectanglePixels: { x: 400, y: 400, width: 5, height: 5 } }], /outside the comparison camera/);
  assert.equal(results.length, 21);
  await writeFile(path.join(output, 'suite.json'), JSON.stringify({ schemaVersion: 1, completed: true, passed: true,
    expectedChecks: results.length, renderer: renderer.identity, independentSnapshotSha256: digest(snapshotBytes), results }, null, 2) + '\n');
} finally { await renderer.browser.close(); }
