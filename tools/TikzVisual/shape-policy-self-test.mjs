import assert from 'node:assert/strict';
import { createShapeRasterMetrics } from './shape-raster-metrics.mjs';
import { deriveShapeTrialPolicy, evaluateShapeTrial, combineShapeTrial } from './shape-primary-trial-policy.mjs';

const { compare } = createShapeRasterMetrics(), view = { frame: 'natural', scale: 1, background: 'white' };
const width = 100, height = 100, reference = new Uint8ClampedArray(width * height * 4).fill(255);
function pixel(data, x, y, color) { data.fill(color, 4 * (y * width + x), 4 * (y * width + x) + 3); }
for (let y = 2; y < 10; y++) for (let x = 2; x < 10; x++) pixel(reference, x, y, 0);
pixel(reference, 80, 20, 252); // Faint sample below the topology threshold.
const reconstructed = reference.slice(); pixel(reconstructed, 2, 2, 4);
const regions = [{ id: 'opaque', nodeId: 'synthetic', kind: 'background', rectangle: { x: 1, y: 1, width: 10, height: 10 } },
  { id: 'period', nodeId: 'synthetic', kind: 'glyph', rectangle: { x: 78, y: 18, width: 5, height: 5 } }];
function measure(actual) { const options = { width, height, background: 'white' }; return { metrics: compare(reference, actual, options),
  regions: regions.map(r => ({ ...r, ...compare(reference, actual, { ...options, rectangle: r.rectangle }) })) }; }
const independent = measure(reconstructed), measurement = { ...view, ...independent.metrics, regions: independent.regions };
const policy = deriveShapeTrialPolicy([measurement], 'Synthetic comparator-only exact regions; controlled independent four-level alias sample', [view]);
const evaluate = (actual, v = view) => evaluateShapeTrial(policy, v, measure(actual));
let checks = 0;
function check(name, action) { action(); checks++; console.log(name + ': pass'); }
check('independent reconstruction passes its measured bounds', () => assert.equal(evaluate(reconstructed).passed, true));
check('exact reference passes', () => assert.equal(evaluate(reference).passed, true));
check('faint loss passes global but fails independent local gate', () => {
  const lost = reference.slice(); pixel(lost, 80, 20, 255); const result = evaluate(lost);
  assert.equal(result.globalPassed, true); assert.equal(result.regionalPassed, false); assert.equal(result.passed, false);
  assert.ok(result.checks.find(c => c.id === 'period').metrics.some(c => c.quantity === 'meanForegroundChannelError' && !c.passed));
});
check('missing opaque component fails with explicit absent edges', () => { const blank = reference.slice(); for (let y = 2; y < 10; y++) for (let x = 2; x < 10; x++) pixel(blank, x, y, 255); const result = evaluate(blank); assert.equal(result.passed, false); assert.ok(result.checks.some(c => c.metrics.some(m => m.edgeState === 'actual-empty' && !m.passed))); });
check('shift fails edge gate independently', () => { const shifted = reference.slice(); pixel(shifted, 2, 2, 255); pixel(shifted, 10, 2, 0); assert.ok(evaluate(shifted).checks.some(c => c.metrics.some(m => m.quantity === 'edgeDisplacementRasterPixels' && !m.passed))); });
for (const [name, change] of [
  ['missing view', values => values.splice(0)], ['duplicate view', values => values.push(structuredClone(values[0]))],
  ['missing region', values => values[0].regions.splice(0)], ['invalid channel', values => values[0].maxRawChannelError = NaN],
  ['lost oracle components', values => values[0].topology.componentDifference = 1], ['changed mask threshold', values => values[0].topology.threshold = 0]
]) check('reject ' + name, () => { const values = structuredClone([measurement]); change(values); assert.throws(() => deriveShapeTrialPolicy(values, 'negative control', [view])); });
check('reject incomplete candidate regions', () => { const value = measure(reference); value.regions.pop(); assert.throws(() => evaluateShapeTrial(policy, view, value)); });
check('reject candidate-defined region', () => { const value = measure(reference); value.regions = structuredClone(value.regions); value.regions[0].rectangle.x++; assert.throws(() => evaluateShapeTrial(policy, view, value)); });
check('reject uncalibrated background', () => assert.throws(() => evaluate(reference, { ...view, background: 'black' })));
const comparisons = [{ ...view, evaluation: evaluate(reference) }], passed = { state: 'passed', executedChecks: 1 }, failed = { state: 'failed', executedChecks: 1 };
check('combined positive remains unapproved and PDF pending', () => { const result = combineShapeTrial(passed, passed, comparisons, [view]); assert.equal(result.passed, true); assert.equal(result.overallVerdict, 'pending'); assert.equal(result.approvedImagePolicy, false); assert.equal(result.pdf.state, 'pending'); });
check('correct pixels with numeric failure fail combined trial', () => assert.equal(combineShapeTrial(failed, passed, comparisons, [view]).firstFailedGate, 'numeric'));
check('correct pixels with frame failure fail combined trial', () => assert.equal(combineShapeTrial(passed, failed, comparisons, [view]).firstFailedGate, 'frame'));
check('empty numeric evidence cannot pass', () => assert.throws(() => combineShapeTrial({ state: 'passed', executedChecks: 0 }, passed, comparisons, [view])));
check('missing required image cannot pass', () => assert.throws(() => combineShapeTrial(passed, passed, [], [view])));
check('duplicate required image cannot pass', () => assert.throws(() => combineShapeTrial(passed, passed, comparisons.concat(comparisons), [view])));
check('empty image evidence cannot pass', () => { const values = structuredClone(comparisons); values[0].evaluation.checks = []; assert.throws(() => combineShapeTrial(passed, passed, values, [view])); });
check('fabricated positive summary cannot pass', () => { const values = structuredClone(comparisons); values[0].evaluation.checks[0].metrics[0].passed = false; assert.throws(() => combineShapeTrial(passed, passed, values, [view])); });
check('nonboolean summary cannot pass', () => { const values = structuredClone(comparisons); values[0].evaluation.passed = 'false'; assert.throws(() => combineShapeTrial(passed, passed, values, [view])); });
console.log('Shape trial policy controls: ' + checks + ' passed; image admission remains pending.');
