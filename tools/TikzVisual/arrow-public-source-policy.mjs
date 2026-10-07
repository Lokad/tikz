// Required public baseline routes; no limits are derived from a candidate.
import assert from 'node:assert/strict';
import {arrowPrimaryCaseIds, arrowPrimaryViews, arrowPrimaryViewKey} from './arrow-primary-policy.mjs';
import {arrowPdfViews, arrowPdfViewKey} from './arrow-pdf-policy.mjs';
import {evaluateShapeTrial} from './shape-primary-trial-policy.mjs';
import {evaluateArrowFaint} from './arrow-faint-policy.mjs';

export function arrowPublicPrimaryPlan() {
  return arrowPrimaryCaseIds.flatMap(caseId => ['pgf-source', 'native-source'].flatMap(route => arrowPrimaryViews.map(v =>
    ({id: caseId + '/primary/' + route + '/' + arrowPrimaryViewKey(v), caseId, route, ...v}))));
}
export function arrowPublicPdfPlan() {
  return arrowPrimaryCaseIds.flatMap(caseId => ['original-source', 'public-source'].flatMap(route =>
    ['relative-viewport', 'absolute-viewport'].flatMap(raster => arrowPdfViews.map(v =>
      ({id: caseId + '/PDF/' + route + '/' + raster + '/' + arrowPdfViewKey(v), caseId, route, raster, ...v})))));
}
export function evaluateArrowPublicPrimary(e, row) {
  if (row.view.route === 'pgf-source') return evaluateShapeTrial(e.primary.policies.find(p => p.id === row.view.caseId).policy, row.view, row.numbers);
  const values = [{id: 'whole-picture', ...row.numbers.metrics}, ...row.numbers.regions];
  const checks = values.map(r => ({id: r.id, passed: r.exactRgbaMatch && r.rawChangedPixels === 0 && r.maxRawChannelError === 0,
    rawChangedPixels: r.rawChangedPixels, maxRawChannelError: r.maxRawChannelError, limit: 0}));
  return {passed: checks.every(c => c.passed), checks};
}
export function evaluateArrowPublicPdf(e, view, type, numbers) {
  const route = view.route === 'public-source' ? 'native-source' : 'original-source';
  const policy = e.pdf.policies.find(p => p.caseId === view.caseId && p.route === route && p.raster === view.raster);
  assert.ok(policy); const evaluation = evaluateArrowFaint(policy[type], numbers);
  if (type === 'scene') evaluation.checks.push({id: 'outside-diagram', passed: numbers.outsideDiagramChangedPixels === 0});
  evaluation.passed = evaluation.checks.every(c => c.passed); return evaluation;
}
export function arrowPublicExactPage(decoded) {
  const checks = [{id: 'full-page', ...decoded.fullPage}, ...decoded.metrics].map((q, i) => ({id: i ? 'region-' + (i - 1) : 'full-page',
    passed: q.exactRgbaMatch && q.rawChangedPixels === 0 && q.maxRawChannelError === 0,
    rawChangedPixels: q.rawChangedPixels, maxRawChannelError: q.maxRawChannelError, limit: 0}));
  return {passed: checks.every(c => c.passed), checks};
}
export function finishArrowPublicBaselines(numeric, frames, primary, pdf) {
  assert.deepEqual(numeric.cases.map(c => c.id), arrowPrimaryCaseIds); assert.equal(numeric.checks, 12062);
  assert.deepEqual(numeric.cases.map(c => c.checks), [1084,2350,2060,1998,2304,2266]);
  assert.deepEqual(frames.map(c => c.caseId), arrowPrimaryCaseIds);
  assert.deepEqual(primary.map(r => r.view), arrowPublicPrimaryPlan()); assert.deepEqual(pdf.map(r => r.view), arrowPublicPdfPlan());
  const gates = {}, add = (name, rows) => {
    assert.ok(rows.length > 0 && rows.every(r => typeof r.passed === 'boolean' && r.checks.length > 0));
    for (const r of rows) assert.equal(r.passed, r.checks.every(c => c.passed));
    gates[name] = {state: rows.every(r => r.passed) ? 'passed' : 'failed', observations: rows.length, executedChecks: rows.reduce((n, r) => n + r.checks.length, 0)};
  };
  add('numeric', numeric.cases.map(c => ({passed: c.passed, checks: [{id: c.id, passed: c.passed}]})));
  add('publicTraceParity', numeric.cases.map(c => ({passed: c.publicTraceParity, checks: [{id: c.id, passed: c.publicTraceParity}]})));
  add('sourceFrame', frames.map(c => ({passed: c.sourceFrame.passed, checks: [{id: c.caseId, passed: c.sourceFrame.passed}]})));
  for (const route of ['pgf-source','native-source']) add(route === 'pgf-source' ? 'primary' : 'nativePrimary', primary.filter(r => r.view.route === route).map(r => r.evaluation));
  for (const route of ['original-source','public-source']) for (const type of ['source','scene']) {
    const rows = pdf.filter(r => r.view.route === route);
    add(route + '/' + type + '/PDF', rows.map(r => r[type].evaluation));
    add(route + '/' + type + '/exact-qualified-raster', rows.map(r => r[type].exact));
  }
  const firstFailedGate = Object.keys(gates).find(k => gates[k].state !== 'passed') ?? null;
  return {passed: firstFailedGate === null, firstFailedGate, gates, approvedImagePolicy: false, imageConformanceClaim: false, overallVerdict: 'pending',
    pendingGates: ['public-image-only-defect-and-visibility-controls','independent-public-trial-reader','fixed-family-image-admission']};
}
