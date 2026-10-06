import assert from 'node:assert/strict';
import { createShapeRasterMetrics } from './shape-raster-metrics.mjs';
import { shapePdfRasterRectangle } from './shape-pdf-camera.mjs';
import { shapePdfViews, deriveShapePdfTrialPolicy, evaluateShapePdfTrial, combineShapePdfTrial } from './shape-pdf-trial-policy.mjs';

const { compare } = createShapeRasterMetrics();
const camera = { origin: { x: 0, y: 0 }, rasterSizes: { '1x': { width: 16, height: 16 }, '4x': { width: 64, height: 64 } } };
const regions = [{ id: 'whole-picture', kind: 'picture', rectangle: { x: 0, y: 0, width: 16, height: 16 } },
  { id: 'period', kind: 'glyph', rectangle: { x: 11, y: 1, width: 3, height: 3 } },
  { id: 'stroke', kind: 'background', rectangle: { x: 10, y: 10, width: 5, height: 3 } }].map(r => ({ ...r,
    rasterRectangles: Object.fromEntries([1, 4].map(scale => [scale + 'x', shapePdfRasterRectangle(r.rectangle, camera, scale)])) }));
const repeat = { pdf: { exactRgbaMatch: true, rawChangedPixels: 0, maxRawChannelError: 0 }, svg: { exactRgbaMatch: true, rawChangedPixels: 0, maxRawChannelError: 0 } };
function image(scale, kind) {
  const width = 16 * scale, data = new Uint8ClampedArray(width * width * 4).fill(255);
  function rectangle(x, y, w, h, color) {
    for (let iy = y * scale; iy < (y + h) * scale; iy++) for (let ix = x * scale; ix < (x + w) * scale; ix++)
      data.fill(color, 4 * (iy * width + ix), 4 * (iy * width + ix) + 3);
  }
  rectangle(2, 2, 4, 4, 0);
  if (kind !== 'period-loss') rectangle(12, 2, 1, 1, 252);
  if (kind !== 'stroke-loss') rectangle(11, 11, 3, 1, 252);
  if (kind === 'independent') rectangle(6, 6, 3, 1, 0); // Authored independent alias sample, never a candidate-derived limit.
  if (kind === 'opaque-loss') rectangle(2, 2, 4, 4, 255);
  return data;
}
function measure(view, kind) {
  const size = camera.rasterSizes[view.scale + 'x'], a = image(view.scale, 'reference'), b = image(view.scale, kind);
  const values = regions.map(r => ({ ...r, ...compare(a, b, { ...size, scale: view.scale, background: 'white', rectangle: r.rasterRectangles[view.scale + 'x'] }) }));
  return { mode: 'synthetic', ...view, pageSize: size, outsideWholeChangedPixels: 0, repeat: structuredClone(repeat), whole: values[0], regions: values.slice(1) };
}
const independent = shapePdfViews.map(v => measure(v, 'independent'));
const policy = deriveShapePdfTrialPolicy(independent, camera, regions, 'synthetic');
const evaluations = kind => shapePdfViews.map(view => ({ ...view, evaluation: evaluateShapePdfTrial(policy, view, measure(view, kind)) }));
const good = { state: 'passed', executedChecks: 1 }, bad = { state: 'failed', executedChecks: 1 }, policies = { original: policy, candidate: policy };
let checks = 0;
function check(name, action) { action(); checks++; console.log(name + ': pass'); }
check('independent replay passes without admission', () => assert.ok(evaluations('independent').every(c => c.evaluation.passed)));
check('exact reference can improve on the measured allowance', () => assert.ok(evaluations('reference').every(c => c.evaluation.passed)));
for (const kind of ['period-loss', 'stroke-loss']) check('faint ' + kind + ' passes whole but fails local at both scales', () => {
  for (const c of evaluations(kind)) { assert.equal(c.evaluation.globalPassed, true); assert.equal(c.evaluation.regionalPassed, false); assert.equal(c.evaluation.passed, false);
    assert.ok(c.evaluation.checks.find(r => r.id === kind.split('-')[0]).metrics.some(m => m.quantity === 'meanForegroundChannelError' && !m.passed)); }
});
check('lost opaque edges are explicit failures', () => { for (const c of evaluations('opaque-loss')) assert.ok(c.evaluation.checks.some(r => r.metrics.some(m => m.edgeState === 'actual-empty' && !m.passed))); });
for (const [name, mutation] of [
  ['missing view', values => values.pop()], ['duplicate view', values => values[1] = values[0]],
  ['changed representation', values => values[0].mode = 'candidate'], ['missing region', values => values[0].regions.pop()],
  ['changed crop', values => values[0].regions[0].rasterRectangles['1x'].x++],
  ['changed background', values => values[0].background = 'black'], ['negative metric', values => values[0].whole.rawChangedPixels = -1],
  ['changed threshold', values => values[0].whole.topology.threshold = 0], ['false edge state', values => values[0].whole.topology.edgeState = 'both-empty'],
  ['false component difference', values => values[0].whole.topology.componentDifference = 10],
  ['changed page', values => values[0].pageSize.width++], ['ink outside camera', values => values[0].outsideWholeChangedPixels = 1],
  ['failed repeat', values => values[0].repeat.svg.rawChangedPixels = 1]
]) check('reject ' + name, () => { const values = structuredClone(independent); mutation(values); assert.throws(() => deriveShapePdfTrialPolicy(values, camera, regions, 'synthetic')); });
for (const [name, mutation] of [
  ['candidate crop', r => r.regions[0].rasterRectangles['1x'].width++], ['candidate coverage', r => r.regions.pop()],
  ['changed reference pixels', r => r.whole.referenceForegroundPixels++], ['nonfinite metric', r => r.whole.meanForegroundChannelError = NaN]
]) check('reject ' + name, () => { const r = structuredClone(measure(shapePdfViews[0], 'reference')); mutation(r); assert.throws(() => evaluateShapePdfTrial(policy, shapePdfViews[0], r)); });
for (const name of ['pdf', 'svg']) check('unchanged ' + name + ' instability fails', () => { const r = measure(shapePdfViews[0], 'reference'); r.repeat[name].exactRgbaMatch = false; assert.equal(evaluateShapePdfTrial(policy, shapePdfViews[0], r).passed, false); });
check('ink beyond the whole-picture crop fails', () => { const r = measure(shapePdfViews[0], 'reference'); r.outsideWholeChangedPixels = 1; assert.equal(evaluateShapePdfTrial(policy, shapePdfViews[0], r).passed, false); });
check('combined success remains pending', () => { const c = combineShapePdfTrial(good, good, good, evaluations('reference'), evaluations('reference'), policies); assert.equal(c.passed, true); assert.equal(c.overallVerdict, 'pending'); assert.equal(c.approvedImagePolicy, false); });
for (const [gate, args] of [['numeric', [bad, good, good]], ['frame', [good, bad, good]], ['primary', [good, good, bad]]])
  check('correct PDF pixels cannot bypass ' + gate, () => assert.equal(combineShapePdfTrial(...args, evaluations('reference'), evaluations('reference'), policies).firstFailedGate, gate));
check('original SVG/PDF is independently required', () => assert.equal(combineShapePdfTrial(good, good, good, evaluations('period-loss'), evaluations('reference'), policies).firstFailedGate, 'originalPdf'));
check('candidate SVG/PDF is independently required', () => assert.equal(combineShapePdfTrial(good, good, good, evaluations('reference'), evaluations('period-loss'), policies).firstFailedGate, 'candidatePdf'));
check('empty prerequisites cannot pass', () => assert.throws(() => combineShapePdfTrial({ state: 'passed', executedChecks: 0 }, good, good, evaluations('reference'), evaluations('reference'), policies)));
for (const [name, change] of [
  ['missing PDF view', v => v.pop()], ['duplicate PDF view', v => v[1] = v[0]], ['empty PDF checks', v => v[0].evaluation.checks = []],
  ['contradictory summary', v => v[0].evaluation.checks[0].metrics[0].passed = false], ['nonboolean summary', v => v[0].evaluation.passed = 'false'],
  ['missing metric', v => v[0].evaluation.checks[0].metrics.pop()]
]) check('reject ' + name, () => { const v = evaluations('reference'); change(v); assert.throws(() => combineShapePdfTrial(good, good, good, v, evaluations('reference'), policies)); });
console.log('Shape PDF policy controls: ' + checks + ' passed. Synthetic bitmap controls make no PDF/TikZ compatibility claim.');
