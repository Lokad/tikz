// PDF-grid expectations are separate from the primary SVG visibility policy.
import assert from 'node:assert/strict';
import {edgePrimaryDefects} from './curved-edge-primary-defects.mjs';
import {edgePrimaryVisibility, edgeVisibilityPair} from './curved-edge-primary-visibility.mjs';
import {edgePdfViews, edgePdfViewKey} from './curved-edge-pdf-policy.mjs';
export {edgeVisibilityPair};
export const edgePdfDefects = edgePrimaryDefects.map(({invisibleBackgrounds, invisibleViews, ...d}) =>
  ({...d, invisibleViews: d.name === 'disabled-rectangle-clip' ? ['natural-1x-white', 'natural-4x-white'] : []}));
export const edgePdfVisibility = edgePrimaryVisibility.map(({invisibleBackgrounds, invisibleViews, expectedPassed, ...d}) =>
  ({...d, invisibleViews: d.name === 'subquantum-curved-stroke-loss' ? ['natural-1x-white', 'natural-4x-white', 'expanded-1x-white', 'expanded-4x-white'] : []}));
export const edgePdfInvisible = (d, v) => d.invisibleViews.includes(v.frame + '-' + v.scale + 'x-white');

// Controlled faint SVG versus ordinary opaque PDF is a renderer sensitivity
// experiment. It supplies exact SVG ink expectations, not a PDF fidelity policy.
export function deriveVisibilityInk(rows) {
  assert.deepEqual(rows.map(edgePdfViewKey), edgePdfViews.map(edgePdfViewKey));
  assert.ok(rows.every(r => r.converterInvoked === false));
  for (const r of rows) for (const q of [r.whole, ...r.regions]) {
    const c = q.inkCoverage, area = q.rasterRectangles[r.scale + 'x'].width * q.rasterRectangles[r.scale + 'x'].height;
    assert.equal(c.id, q.id);
    for (const side of ['reference', 'actual']) assert.ok(Array.isArray(c[side]) && c[side].length === 3
      && c[side].every(v => Number.isSafeInteger(v) && v >= 0 && v <= area * 255), 'Invalid visibility ink sum.');
  }
  return rows.map(r => ({frame: r.frame, scale: r.scale, background: r.background,
    regions: [r.whole, ...r.regions].map(q => structuredClone(q.inkCoverage))}));
}
export function evaluateVisibilityInk(policy, row) {
  const p = policy.filter(p => p.frame === row.frame && p.scale === row.scale && p.background === row.background);
  assert.equal(p.length, 1); const measured = [row.whole, ...row.regions]; assert.equal(measured.length, p[0].regions.length);
  const checks = measured.map((q, i) => { const e = p[0].regions[i]; assert.equal(e.id, q.id); assert.deepEqual(q.inkCoverage.reference, e.reference);
    return {id: q.id, passed: q.inkCoverage.actual.every((v, k) => v === e.actual[k])}; });
  return {passed: checks.every(q => q.passed), checks};
}
