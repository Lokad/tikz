import assert from 'node:assert/strict';
import { createShapeRasterMetrics } from './shape-raster-metrics.mjs';

const { compare } = createShapeRasterMetrics();
let checks = 0;
const check = (name, action) => { action(); checks++; console.log(name + ': pass'); };
function raster(width, height, points, background = 'transparent') {
  const data = new Uint8ClampedArray(width * height * 4);
  if (background !== 'transparent') for (let i = 0; i < data.length; i += 4) { data.fill(background === 'white' ? 255 : 0, i, i + 3); data[i + 3] = 255; }
  for (const [x, y, amplitude = 255] of points) {
    const i = 4 * (y * width + x);
    if (background === 'transparent') data[i + 3] = amplitude;
    else data.fill(background === 'white' ? 255 - amplitude : amplitude, i, i + 3);
  }
  return data;
}
const result = (r, a, options = {}) => compare(r, a, { width: 12, height: 12, background: 'transparent', ...options });
const point = raster(12, 12, [[2, 2]]), blank = raster(12, 12, []);
check('unchanged RGBA', () => { const m = result(point, point.slice()); assert.equal(m.exactRgbaMatch, true); assert.equal(m.topology.referenceComponents, 1); assert.equal(m.topology.actualComponents, 1); assert.equal(m.topology.maxEdgeDisplacementRasterPixels, 0); });
check('unchanged blank', () => { const m = result(blank, blank); assert.equal(m.meanForegroundChannelError, 0); assert.equal(m.topology.edgeState, 'both-empty'); });
check('Euclidean 3-4-5 displacement and scale', () => { const m = result(point, raster(12, 12, [[5, 6]]), { scale: 4 }); assert.equal(m.topology.maxEdgeDisplacementRasterPixels, 5); assert.equal(m.topology.maxEdgeDisplacementCssPixels, 1.25); });
check('symmetric directed edge distance', () => { const m = result(point, raster(12, 12, [[2, 2], [8, 10]])); assert.equal(m.topology.maxEdgeDisplacementRasterPixels, 10); assert.equal(m.topology.componentDifference, 1); });
check('diagonal pixels connect at eight neighbors', () => assert.equal(result(raster(12, 12, [[2, 2], [3, 3]]), blank).topology.referenceComponents, 1));
check('separated components', () => assert.equal(result(raster(12, 12, [[2, 2], [4, 2]]), blank).topology.referenceComponents, 2));
check('missing ink retains absent-edge state', () => { const m = result(point, blank); assert.equal(m.topology.edgeState, 'actual-empty'); assert.equal(m.topology.maxEdgeDisplacementRasterPixels, null); assert.equal(m.topology.componentDifference, 1); });
check('extra ink retains absent-edge state', () => assert.equal(result(blank, point).topology.edgeState, 'reference-empty'));
for (const background of ['transparent', 'white', 'black']) {
  check('faint samples below mask threshold: ' + background, () => {
    const r = raster(12, 12, [[2, 2, 3]], background), a = raster(12, 12, [], background);
    const m = result(r, a, { background }); assert.equal(m.foregroundPixels, 1); assert.equal(m.maxPremultipliedChannelError, 3);
    assert.equal(m.meanForegroundChannelError, background === 'transparent' ? .75 : 2.25); assert.equal(m.topology.referenceComponents, 0); assert.equal(m.exactRgbaMatch, false);
  });
}
check('blank area cannot dilute foreground error', () => {
  const a = result(point, blank), b = compare(raster(100, 100, [[2, 2]]), raster(100, 100, []), { width: 100, height: 100, background: 'transparent' });
  assert.equal(a.meanForegroundChannelError, b.meanForegroundChannelError); assert.equal(b.foregroundPixels, 1);
});
check('zero-alpha RGB remains a raw discrepancy', () => { const a = blank.slice(); a[0] = 255; const m = result(blank, a); assert.equal(m.exactRgbaMatch, false); assert.equal(m.maxRawChannelError, 255); assert.equal(m.maxPremultipliedChannelError, 0); });
check('alpha-only difference', () => { const a = point.slice(); a[4 * (2 * 12 + 2) + 3] = 128; const m = result(point, a); assert.equal(m.exactRgbaMatch, false); assert.equal(m.rawChangedPixels, 1); assert.equal(m.maxRawChannelError, 127); assert.equal(m.maxPremultipliedChannelError, 127); assert.equal(m.topology.referenceComponents, 1); assert.equal(m.topology.actualComponents, 1); assert.equal(m.topology.maxEdgeDisplacementRasterPixels, 0); });
check('integer region excludes unrelated errors', () => { const a = point.slice(); a[4 * (9 * 12 + 9) + 3] = 255; assert.equal(result(point, a, { rectangle: { x: 0, y: 0, width: 5, height: 5 } }).exactRgbaMatch, true); });
check('region does not reuse whole-picture foreground denominator', () => { const r = raster(12, 12, [[2, 2, 3], [9, 9]]), a = raster(12, 12, [[9, 9]]); assert.ok(result(r, a, { rectangle: { x: 1, y: 1, width: 3, height: 3 } }).meanForegroundChannelError > result(r, a).meanForegroundChannelError); });
for (const [name, options] of [
  ['fractional crop', { rectangle: { x: .5, y: 0, width: 2, height: 2 } }], ['crop overflow', { rectangle: { x: 11, y: 0, width: 2, height: 2 } }],
  ['empty crop', { rectangle: { x: 0, y: 0, width: 0, height: 2 } }], ['unknown background', { background: 'gray' }],
  ['invalid threshold', { maskThreshold: 0 }], ['nonfinite scale', { scale: NaN }], ['oversized raster', { width: 10000, height: 10000 }]
]) check('reject ' + name, () => assert.throws(() => result(point, point, options)));
check('reject truncated RGBA', () => assert.throws(() => result(point.subarray(1), point)));
check('reject signed-byte RGBA', () => assert.throws(() => result(new Int8Array(point.length), point)));
// An independent brute-force distance checks the separable transform on many
// sparse masks, including rows/columns without sites and competing parabolas.
check('distance transform against brute-force sparse points', () => {
  let seed = 14323;
  const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  for (let trial = 0; trial < 40; trial++) {
    const a = [], b = [];
    // Isolate points by a blank pixel so all of them are boundary samples.
    for (let k = 0; k < 5; k++) { a.push([2 * (next() % 6), 2 * (next() % 6)]); b.push([2 * (next() % 6), 2 * (next() % 6)]); }
    const directed = (from, to) => Math.max(...from.map(([x, y]) => Math.min(...to.map(([u, v]) => Math.hypot(x - u, y - v)))));
    const expected = Math.max(directed(a, b), directed(b, a));
    assert.ok(Math.abs(result(raster(12, 12, a), raster(12, 12, b)).topology.maxEdgeDisplacementRasterPixels - expected) < 1e-12);
  }
});
console.log('Shape raster metric controls: ' + checks + ' passed. No candidate policy is admitted.');
