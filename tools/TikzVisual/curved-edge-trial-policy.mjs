// Fixed public baseline and image-only sensitivity gates; still unapproved.
import assert from 'node:assert/strict';
import {edgePrimaryViews, edgePrimaryViewKey, evaluateEdgePrimary} from './curved-edge-primary-policy.mjs';
import {edgePdfViews, edgePdfViewKey, evaluateEdgePdfPolicy} from './curved-edge-pdf-policy.mjs';
import {edgeTrialDefects} from './curved-edge-trial-defects.mjs';
import {edgePrimaryDefectInvisible} from './curved-edge-primary-defects.mjs';
import {edgePdfDefects, edgePdfInvisible} from './curved-edge-pdf-visibility.mjs';

export function edgeNativePageVerdict(decoded, regions) {
  assert.equal(decoded.metrics.length, regions.length);
  const checks = regions.map((r, i) => ({id: r.id, passed: decoded.metrics[i].exactRgbaMatch === true && decoded.metrics[i].rawChangedPixels === 0
    && decoded.metrics[i].maxRawChannelError === 0, rawChangedPixels: decoded.metrics[i].rawChangedPixels, maxRawChannelError: decoded.metrics[i].maxRawChannelError, limit: 0}));
  return {passed: decoded.fullPage.exactRgbaMatch === true && decoded.fullPage.rawChangedPixels === 0 && decoded.fullPage.maxRawChannelError === 0 && checks.every(c => c.passed), fullPage: decoded.fullPage, checks};
}
export function finishEdgeTrial(cases, defects, primaryPolicy, pdfCases) {
  assert.deepEqual(cases.map(c => c.id), ['continuation', 'styles', 'coordinates', 'nodes', 'clipping']);
  const gates = {}, aggregate = (name, evaluations) => {
    assert.ok(evaluations.length > 0 && evaluations.every(e => typeof e.passed === 'boolean' && Array.isArray(e.checks) && e.checks.length > 0));
    for (const e of evaluations) assert.equal(e.passed, e.checks.every(c => c.passed), 'Contradictory ' + name + ' gate.');
    gates[name] = {state: evaluations.every(e => e.passed) ? 'passed' : 'failed', executedChecks: evaluations.reduce((n, e) => n + e.checks.length, 0)};
  };
  const numericCounts = [342, 421, 356, 719, 228];
  cases.forEach((c, i) => { assert.equal(c.numeric.checks.length, numericCounts[i]); assert.equal(c.numeric.passed, c.numeric.checks.every(q => q.passed)); });
  aggregate('numeric', cases.map(c => c.numeric)); aggregate('frame', cases.map(c => c.frameEvaluation));
  const primary = [], originalPdf = [], candidatePdf = [], nativePage = [];
  for (const c of cases) {
    assert.deepEqual(c.primary.map(edgePrimaryViewKey), edgePrimaryViews.map(edgePrimaryViewKey));
    for (const o of c.primary) { assert.deepEqual(o.evaluation, evaluateEdgePrimary(primaryPolicy, c.id, o)); primary.push(o.evaluation); }
    const p = pdfCases.find(p => p.id === c.id); assert.ok(p);
    for (const [name, route, target] of [['originalPdf', 'original-driver', originalPdf], ['candidatePdf', 'native-semantic', candidatePdf]]) {
      assert.deepEqual(c[name].map(edgePdfViewKey), edgePdfViews.map(edgePdfViewKey));
      for (const o of c[name]) { assert.deepEqual(o.evaluation, evaluateEdgePdfPolicy(p.policies[route], o)); target.push(o.evaluation); }
    }
    assert.deepEqual(c.nativePages.map(edgePdfViewKey), edgePdfViews.map(edgePdfViewKey));
    for (const o of c.nativePages) {
      assert.deepEqual(o.evaluation, edgeNativePageVerdict(o.measurement, p.regions));
      // Full-page equality is an independently required check, beyond local crops.
      nativePage.push({...o.evaluation, checks: [...o.evaluation.checks, {id: 'native-full-page', passed: o.evaluation.fullPage.exactRgbaMatch && o.evaluation.fullPage.rawChangedPixels === 0 && o.evaluation.fullPage.maxRawChannelError === 0}]});
    }
  }
  aggregate('primary', primary); aggregate('originalPdf', originalPdf); aggregate('candidatePdf', candidatePdf); aggregate('nativePage', nativePage);
  assert.deepEqual(defects.map((d, i) => Object.fromEntries(Object.keys(edgeTrialDefects[i] ?? {}).map(k => [k, d[k]]))), edgeTrialDefects);
  const sensitivity = {primary: [], pdf: []};
  for (const d of defects) {
    assert.equal(d.numericGatesBypassed, true); const c = cases.find(c => c.id === d.caseId), p = pdfCases.find(p => p.id === d.caseId);
    assert.deepEqual(d.primary.map(edgePrimaryViewKey), edgePrimaryViews.filter(v => !d.frames || d.frames.includes(v.frame)).map(edgePrimaryViewKey));
    assert.deepEqual(d.pdf.map(edgePdfViewKey), edgePdfViews.filter(v => !d.frames || d.frames.includes(v.frame)).map(edgePdfViewKey));
    for (const o of d.primary) { const e = evaluateEdgePrimary(primaryPolicy, c.id, o); assert.deepEqual(o.evaluation, e);
      const invisible = edgePrimaryDefectInvisible(d, o), target = e.checks.find(c => c.id === d.target); assert.ok(target);
      const passed = invisible ? e.passed && o.observedVisible === false : !e.passed && !target.passed && o.observedVisible === true;
      sensitivity.primary.push({passed, checks: [{id: d.name + '/' + edgePrimaryViewKey(o), passed}]}); }
    for (const o of d.pdf) { const e = evaluateEdgePdfPolicy(p.policies['native-semantic'], o); assert.deepEqual(o.evaluation, e);
      const native = edgeNativePageVerdict(o.nativeMeasurement, p.regions); assert.deepEqual(o.nativeEvaluation, native);
      const expected = edgePdfDefects.find(v => v.name === d.name), invisible = edgePdfInvisible(expected, o);
      const passed = invisible ? o.observedVisible === false && e.passed && native.passed
        : o.observedVisible === true && !e.passed && e.checks.some(c => c.id === d.target && !c.passed)
          && !native.passed && native.checks.some(c => c.id === d.target && !c.passed);
      sensitivity.pdf.push({passed, checks: [{id: d.name + '/' + edgePdfViewKey(o), passed}]}); }
  }
  assert.equal(sensitivity.primary.length, 210); assert.equal(sensitivity.pdf.length, 70);
  aggregate('freshPrimary', sensitivity.primary); aggregate('freshPdfNative', sensitivity.pdf);
  const firstFailedGate = Object.keys(gates).find(k => gates[k].state !== 'passed') ?? null;
  return {passed: firstFailedGate === null, verdict: firstFailedGate ? 'trial-failed' : 'trial-pass', firstFailedGate, gates,
    approvedImagePolicy: false, imageConformanceClaim: false, overallVerdict: 'pending'};
}
