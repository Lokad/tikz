import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { root, sha256, writeArtifact } from './shape-oracle-bundle.mjs';
import { createRenderer } from './compare.mjs';
import { installShapeMetrics } from './shape-image-pair.mjs';
import { shapePdfPageCamera, shapePdfRasterRectangle, shapePdfRegions } from './shape-pdf-camera.mjs';
import { measureShapePdfPair } from './shape-pdf-image-pair.mjs';

assert.equal(process.argv.length, 2);
const output = path.join(root, 'artifacts/node-shape-pdf-controls');
const evidence = JSON.parse(await readFile(path.join(root, 'tests/Reference/NodeShapes/pdf/metrics.json')));
const camera = shapePdfPageCamera(evidence.measurement, evidence.rasterSizes), controls = [];
function pass(name, action) { action(); controls.push({ name, passed: true }); }
function reject(name, action) { assert.throws(action); controls.push({ name, passed: true }); }
pass('native-origin-golden', () => assert.deepEqual(camera.origin, { x: 574.4789437071919, y: 199.1140198539332 }));
pass('integer-page-crop-1x', () => assert.deepEqual(shapePdfRasterRectangle({ x: 0, y: 0, width: 1, height: 1 }, camera, 1), { x: 574, y: 199, width: 2, height: 2 }));
pass('integer-page-crop-4x', () => assert.deepEqual(shapePdfRasterRectangle({ x: 0, y: 0, width: 1, height: 1 }, camera, 4), { x: 2297, y: 796, width: 5, height: 5 }));
for (const mutation of ['origin', 'page', 'fractional-native', 'box', 'depth', 'position', 'raster', 'missing-raster']) reject(mutation, () => {
  const e = structuredClone(evidence);
  if (mutation === 'origin') e.measurement.pdfOriginPixels.x += .25;
  if (mutation === 'page') e.measurement.page.widthSp++;
  if (mutation === 'fractional-native') e.measurement.page.boxXSp += .5;
  if (mutation === 'box') e.measurement.pictureBox.widthSp++;
  if (mutation === 'depth') e.measurement.pictureBox.depthSp = 1;
  if (mutation === 'position') e.measurement.page.boxBaselineYSp = -1;
  if (mutation === 'raster') e.rasterSizes['4x'].width++;
  if (mutation === 'missing-raster') delete e.rasterSizes['4x'];
  shapePdfPageCamera(e.measurement, e.rasterSizes);
});
for (const [name, rectangle, scale] of [
  ['negative-region', { x: -1000, y: 0, width: 1, height: 1 }, 1],
  ['off-page-region', { x: 1000, y: 0, width: 1, height: 1 }, 4],
  ['zero-region', { x: 0, y: 0, width: 0, height: 1 }, 1],
  ['nonfinite-region', { x: NaN, y: 0, width: 1, height: 1 }, 1],
  ['unknown-scale', { x: 0, y: 0, width: 1, height: 1 }, 2]
]) reject(name, () => shapePdfRasterRectangle(rectangle, camera, scale));
const frames = { camera: { x: -400, y: -40, width: 550, height: 800 }, frames: { picture: camera.picture },
  checks: Array.from({ length: 98 }, (_, i) => ({ id: i < 28 ? 'shape-node-' + i : 'glyph-' + (i - 28), nodeId: 'node-' + i % 28,
    kind: i < 28 ? 'background' : 'glyph', native: { minX: 0, minY: 0, maxX: 10, maxY: 10 }, driver: { minX: -.1, minY: .1, maxX: 10, maxY: 10.1 } })) };
pass('all-fixed-regions', () => {
  const regions = shapePdfRegions(frames, camera); assert.equal(regions.length, 99);
  assert.deepEqual(regions[1].rectangle, { x: -3.1, y: -3, width: 16.1, height: 16.1 });
});
for (const mutation of ['missing-region', 'duplicate-region', 'unknown-kind', 'invalid-node-id', 'nonfinite-bounds', 'zero-bounds', 'truncated-whole', 'wrong-picture']) reject(mutation, () => {
  const f = structuredClone(frames);
  if (mutation === 'missing-region') f.checks.pop();
  if (mutation === 'duplicate-region') f.checks[1].id = f.checks[0].id;
  if (mutation === 'unknown-kind') f.checks[1].kind = 'unknown';
  if (mutation === 'invalid-node-id') f.checks[0].nodeId = '../escape';
  if (mutation === 'nonfinite-bounds') f.checks[0].native.minX = NaN;
  if (mutation === 'zero-bounds') f.checks[0].driver.maxX = f.checks[0].driver.minX;
  if (mutation === 'truncated-whole') f.camera.width = 1;
  if (mutation === 'wrong-picture') f.frames.picture.minX++;
  shapePdfRegions(f, camera);
});

const renderer = await createRenderer();
try {
  await installShapeMetrics(renderer);
  const syntheticCamera = { origin: { x: 16, y: 16 }, rasterSizes: { '1x': { width: 64, height: 64 }, '4x': { width: 256, height: 256 } } };
  const physical = [{ id: 'whole-picture', rectangle: { x: -14, y: -14, width: 40, height: 40 } },
    { id: 'period', rectangle: { x: 7, y: 0, width: 3, height: 3 } },
    { id: 'stroke', rectangle: { x: -1, y: 6, width: 6, height: 4 } }];
  const regions = physical.map(r => ({ ...r, rasterRectangles: Object.fromEntries([1, 4].map(scale => [scale + 'x', shapePdfRasterRectangle(r.rectangle, syntheticCamera, scale)])) }));
  const css = '<svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="-10 -10 20 20"><path d="M0 0h4v4h-4Z"/></svg>';
  const bp = '<svg xmlns="http://www.w3.org/2000/svg" width="20pt" height="20pt" viewBox="-7 -4 20 20"><path d="M3 6h3v3h-3Z"/></svg>';
  for (const scale of [1, 4]) {
    // This bitmap is drawn manually, not generated by the SVG mapping under test.
    const page = await renderer.page.evaluate(scale => {
      const c = document.createElement('canvas'); c.width = c.height = 64 * scale;
      const ctx = c.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = 'black'; ctx.fillRect(16 * scale, 16 * scale, 4 * scale, 4 * scale);
      return c.toDataURL('image/png');
    }, scale);
    for (const [units, svg, origin] of [['cssPixels', css, { x: 0, y: 0 }], ['bp', bp, { x: 3, y: 6 }]]) {
      const input = { svg, units, svgOriginBp: origin, camera: syntheticCamera, regions, scale, frame: 'natural', pdfPage: page, capture: false };
      const measured = await measureShapePdfPair(renderer, input);
      assert.equal(measured.fullPage.exactRgbaMatch, true); assert.equal(measured.whole.referenceForegroundPixels, 16 * scale * scale);
      assert.ok(measured.regions.every(r => r.exactRgbaMatch)); controls.push({ name: 'manual-' + units + '-' + scale + 'x', passed: true });
      for (const [name, change] of [
        ['shift', x => { x.svg = x.svg.replace('<path ', '<path transform="translate(1 0)" '); }],
        ['physical-size', x => { x.svg = x.svg.replace('width="20', 'width="21'); }],
        ['aspect-ratio', x => { x.svg = x.svg.replace('<svg ', '<svg preserveAspectRatio="xMinYMin slice" '); }],
        ['external-reference', x => { x.svg = x.svg.replace('<path ', '<path onclick="alert(1)" '); }],
        ['changed-crop', x => { x.regions[0].rasterRectangles[scale + 'x'].x++; }],
        ['duplicate-region', x => { x.regions.push(x.regions[0]); }]
      ]) {
        const mutated = structuredClone(input); change(mutated);
        if (name === 'shift') { assert.equal((await measureShapePdfPair(renderer, mutated)).whole.exactRgbaMatch, false); }
        else await assert.rejects(() => measureShapePdfPair(renderer, mutated));
        controls.push({ name: name + '-' + units + '-' + scale + 'x', passed: true });
      }
    }
    const faint = '<svg xmlns="http://www.w3.org/2000/svg" width="30px" height="30px" viewBox="-10 -10 30 30">'
      + '<path d="M0 0h4v4h-4Z"/><path id="period" d="M8 1h1v1h-1Z" opacity=".01"/>'
      + '<path id="stroke" d="M0 8H4" fill="none" stroke="black" stroke-width="1" opacity=".01"/></svg>';
    const baseInput = { svg: faint, units: 'cssPixels', svgOriginBp: { x: 0, y: 0 }, camera: syntheticCamera, regions, scale, frame: 'natural', pdfPage: page };
    const reference = await measureShapePdfPair(renderer, baseInput);
    const unchanged = await measureShapePdfPair(renderer, { ...baseInput, pdfPage: 'data:image/png;base64,' + reference.images['svg-page'], capture: false });
    assert.equal(unchanged.fullPage.exactRgbaMatch, true);
    controls.push({ name: 'unchanged-faint-' + scale + 'x', passed: true });
    for (const id of ['period', 'stroke']) {
      const mutated = { ...baseInput, pdfPage: 'data:image/png;base64,' + reference.images['svg-page'],
        svg: faint.replace(new RegExp('<path id="' + id + '"[^>]+/>'), ''), capture: false };
      const measured = await measureShapePdfPair(renderer, mutated), region = measured.regions.find(r => r.id === id);
      assert.ok(region.rawChangedPixels > 0 && region.meanForegroundChannelError > 0);
      controls.push({ name: 'missing-faint-' + id + '-' + scale + 'x', passed: true, observations: region });
    }
  }
  const files = ['tools/TikzVisual/shape-pdf-self-test.mjs', 'tools/TikzVisual/shape-pdf-camera.mjs', 'tools/TikzVisual/shape-pdf-image-pair.mjs'];
  const report = { schemaVersion: 1, comparisonKind: 'curved-node-pdf-camera-controls', completed: true, passed: true, converterInvoked: false,
    conformanceClaim: false, approvedImagePolicy: false, scope: 'Native camera/region validation and manually drawn bitmap registration controls. Synthetic bitmaps are not an ordinary PDF conformance claim.',
    renderer: renderer.identity, controls, toolHashes: Object.fromEntries(await Promise.all(files.map(async file => [file, sha256(await readFile(path.join(root, file)))]))) };
  await writeArtifact(output, 'report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(controls.length + ' curved-node PDF camera/region/bitmap controls passed.');
} finally { await renderer.browser.close(); }
