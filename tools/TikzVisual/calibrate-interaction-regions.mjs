// Independent regional precision experiment: only the previously hash-pinned
// oracle SVGs/measurements are read. No candidate artifact or converter is used.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer, compareBundle, profile } from './compare.mjs';
import { inspectOracleGlyphFrame } from './interaction-crop-check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'artifacts/interaction-region-calibration');
await mkdir(output, { recursive: true });
await rm(path.join(output, 'calibration-evidence.json'), { force: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const snapshotBytes = await readFile(path.join(root, 'tests/Reference/NodeInteractionsRgb/calibration-ink.json'));
const snapshot = JSON.parse(snapshotBytes);
assert.equal(snapshot.completed, true); assert.equal(snapshot.converterInvoked, false);
assert.deepEqual(snapshot.expectedCases, ['state-paint', 'transforms', 'colors']);
assert.deepEqual(snapshot.cases.map(c => c.caseId), snapshot.expectedCases);
const renderer = await createRenderer();
const cases = [];
const paddingPixels = 1; // Fixed before inspecting candidate output.
const exactLimits = profile.scales.flatMap(scale => ['transparent', 'white', 'black'].map(background => ({
  scale, background, maxChannelError: 0, maxMeanForegroundError: 0, maxEdgeDisplacementPixels: 0, maxComponentDifference: 0
})));
const rectangle = (minX, minY, maxX, maxY) => ({
  x: minX - paddingPixels, y: minY - paddingPixels,
  width: maxX - minX + 2 * paddingPixels, height: maxY - minY + 2 * paddingPixels
});
try {
  for (const key of ['profile', 'playwright', 'browser', 'browserSha256', 'profileSha256', 'os', 'osRelease', 'architecture', 'node'])
    assert.equal(renderer.identity[key], snapshot.renderer[key], 'Pinned oracle renderer differs: ' + key);
  for (const c of snapshot.cases) {
    assert.deepEqual(c.variants.map(v => v.mode), ['native-css', 'sp-plus', 'sp-minus']);
    const originalFolder = path.join(root, 'artifacts/node-interaction-svg-calibration-rgb-ink', c.caseId);
    const native = await readFile(path.join(originalFolder, 'native-css/actual.svg'));
    assert.equal(hash(native), c.variants[0].derivedSha256);
    const containment = await inspectOracleGlyphFrame(native.toString('utf8'), renderer);
    assert.equal(containment.passed, true);
    const definitions = containment.checks.filter(g => g.visible).map(g => ({
      id: 'glyph-' + g.index, actualElementId: 'candidate-g' + g.index, basis: 'native DVI glyph and original outline bounds',
      rectanglePixels: rectangle(g.boundsPixels.minX, g.boundsPixels.minY, g.boundsPixels.maxX, g.boundsPixels.maxY)
    }));
    const metricsBytes = await readFile(path.join(originalFolder, 'native-css/metrics.json'));
    assert.equal(hash(metricsBytes), c.variants[0].metricsSha256);
    assert.equal(hash(await readFile(path.join(originalFolder, 'native-css/native-positions.log'))), c.variants[0].nativePositionsSha256);
    const metrics = JSON.parse(metricsBytes);
    const original = await readFile(path.join(originalFolder, 'native-css/reference.svg'));
    assert.equal(hash(original), c.variants[0].referenceSha256);
    const strokes = await renderer.page.evaluate(svg => {
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      if (doc.querySelector('parsererror')) throw new Error('Invalid original oracle SVG.');
      const inherited = (element, name, fallback) => {
        for (let p = element; p; p = p.parentElement) if (p.hasAttribute(name)) return p.getAttribute(name);
        return fallback;
      };
      return [...doc.querySelectorAll('path')].filter(p => !p.closest('defs,clipPath')).map(p => ({
        stroke: inherited(p, 'stroke', 'none') !== 'none', join: inherited(p, 'stroke-linejoin', 'miter'),
        miterLimit: Number(inherited(p, 'stroke-miterlimit', '4'))
      }));
    }, original.toString('utf8'));
    assert.equal(strokes.length, metrics.geometry.paths.length, 'Original painted paths and native soft paths must agree.');
    for (const [index, p] of metrics.geometry.paths.entries()) {
      const points = p.segments.flatMap(s => s.kind === 'Cubic' ? [s.end, s.control1, s.control2] : [s.end]);
      const scale = 96 / 72.27;
      const stroke = strokes[index];
      assert.equal(stroke.stroke, p.stroke); assert.equal(stroke.join, p.join);
      assert.ok(Number.isFinite(stroke.miterLimit) && stroke.miterLimit >= 1);
      assert.ok(points.length > 0 && points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
      // Conservative native control bounds and inherited original stroke
      // extent. No candidate path, viewport, or bounds participate.
      const radius = p.stroke ? p.widthPt * scale * (p.join === 'miter' ? stroke.miterLimit : 1) / 2 : 0;
      definitions.push({ id: 'path-' + index, actualElementId: 'candidate-p' + index,
        basis: 'native PGF soft path and conservative recorded stroke extent',
        stroke: { widthPt: p.widthPt, join: stroke.join, miterLimit: stroke.miterLimit },
        rectanglePixels: rectangle(Math.min(...points.map(p => p.x)) * scale - radius,
          -Math.max(...points.map(p => p.y)) * scale - radius,
          Math.max(...points.map(p => p.x)) * scale + radius, -Math.min(...points.map(p => p.y)) * scale + radius) });
    }
    const variants = [];
    for (const v of c.variants) {
      const source = path.join(originalFolder, v.mode), folder = path.join(output, c.caseId, v.mode);
      if (!folder.startsWith(output + path.sep)) throw new Error('Regional output escapes artifact folder.');
      await rm(folder, { recursive: true, force: true }); await mkdir(folder, { recursive: true });
      for (const file of ['reference.svg', 'actual.svg', 'source.tikz', 'provenance.json', 'actual-scene.json'])
        await writeFile(path.join(folder, file), await readFile(path.join(source, file)));
      assert.equal(hash(await readFile(path.join(folder, 'reference.svg'))), v.referenceSha256);
      assert.equal(hash(await readFile(path.join(folder, 'actual.svg'))), v.derivedSha256);
      const input = JSON.parse(await readFile(path.join(source, 'comparison-input.json')));
      delete input.pdf;
      input.scope = 'Oracle-only regional precision experiment; native glyph/path regions with fixed one-CSS-pixel padding; exact gates';
      input.regionalChecks = definitions.map(d => ({ ...d, limits: exactLimits }));
      await writeFile(path.join(folder, 'comparison-input.json'), JSON.stringify(input, null, 2));
      const report = await compareBundle(folder, renderer);
      assert.equal(report.numeric.passed, true); assert.equal(report.dimensions.passed, true);
      assert.equal(report.primary.regionalChecks.length, definitions.length * profile.scales.length * 3);
      variants.push({ mode: v.mode, referenceSha256: v.referenceSha256, nativeOracleSha256: v.derivedSha256,
        checks: report.primary.regionalChecks.map(({ id, scale, background, pixelCrop, changedPixels, maxChannelError,
          meanForegroundError, foregroundPixels, maxEdgeDisplacementPixels, referenceComponents, actualComponents }) => ({
          id, scale, background, pixelCrop, changedPixels, maxChannelError, meanForegroundError, foregroundPixels,
          maxEdgeDisplacementPixels, referenceComponents, actualComponents })) });
      console.log(c.caseId + '/' + v.mode + ': ' + report.primary.regionalChecks.length + ' independent region measurements');
    }
    const regions = definitions.map(d => ({ ...d, limits: exactLimits.map(l => {
      const checks = variants.flatMap(v => v.checks).filter(c => c.id === d.id && c.scale === l.scale && c.background === l.background);
      assert.equal(checks.length, 3);
      assert.ok(checks.every(c => c.maxEdgeDisplacementPixels !== null));
      return { scale: l.scale, background: l.background,
        maxChannelError: Math.max(...checks.map(c => c.maxChannelError)),
        maxMeanForegroundError: Math.ceil(Math.max(...checks.map(c => c.meanForegroundError)) * 1e6) / 1e6,
        maxEdgeDisplacementPixels: Math.max(...checks.map(c => c.maxEdgeDisplacementPixels)),
        maxComponentDifference: Math.max(...checks.map(c => Math.abs(c.referenceComponents - c.actualComponents))) };
    }) }));
    cases.push({ caseId: c.caseId, metricsSha256: c.variants[0].metricsSha256,
      nativePositionsSha256: c.variants[0].nativePositionsSha256, regions, variants });
  }
  const tools = ['tools/TikzVisual/calibrate-interaction-regions.mjs', 'tools/TikzVisual/interaction-crop-check.mjs',
    'tools/TikzVisual/compare.mjs', 'tools/TikzVisual/browser-profile.json'];
  await writeFile(path.join(output, 'calibration-evidence.json'), JSON.stringify({ schemaVersion: 1, completed: true,
    converterInvoked: false, conformanceClaim: false, approvedPolicy: false, baseCalibrationSha256: hash(snapshotBytes),
    operation: 'Native glyph/soft-path bounds plus fixed 1 CSS px padding; native integer-pixel crops; independent original/native/±4-sp pairs',
    paddingPixels, scales: profile.scales, backgrounds: ['transparent', 'white', 'black'], measurementLimits: exactLimits,
    renderer: renderer.identity, toolHashes: Object.fromEntries(await Promise.all(tools.map(async f => [f, hash(await readFile(path.join(root, f)))]))),
    expectedCases: snapshot.expectedCases, cases }, null, 2) + '\n');
} finally { await renderer.browser.close(); }
