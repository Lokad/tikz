// Mutate emitted public SVG only; frontend/numeric gates cannot mask image loss.
import assert from 'node:assert/strict';
import {edgePrimaryDefects} from './edge-primary-defects.mjs';
export const edgeTrialDefects = edgePrimaryDefects;
export async function mutateEdgeTrial(renderer, svg, metrics, defect) {
  assert.equal(defect.caseId, metrics.caseId);
  let id;
  if (defect.target.startsWith('path-')) {
    const index = metrics.driverState.paints.findIndex(p => p.pathId === Number(defect.target.slice(5)));
    assert.ok(index >= 0); id = 'candidate-p' + index;
  } else { const index = Number(defect.target.slice(6)); assert.ok(Number.isInteger(index) && index >= 0 && index < 16); id = 'candidate-g' + index; }
  return renderer.page.evaluate(({svg, id, change}) => {
    const d = new DOMParser().parseFromString(svg, 'image/svg+xml'), s = d.documentElement, e = d.getElementById(id);
    if (d.querySelector('parsererror') || d.doctype || !e) throw Error('Missing public mutation target.');
    switch (change) {
      case 'remove': e.remove(); break;
      case 'width': e.setAttribute('stroke-width', String(Number(e.getAttribute('stroke-width')) * 2)); break;
      case 'color': e.setAttribute('stroke', '#0f0'); break;
      case 'dash': if (!e.hasAttribute('stroke-dasharray')) throw Error('Public target has no dashes.'); e.setAttribute('stroke-dasharray', 'none'); break;
      case 'cap': e.setAttribute('stroke-linecap', 'butt'); break;
      case 'opacity': e.setAttribute('stroke-opacity', '0'); break;
      case 'clip': for (let p = e.parentElement; p && p !== s; p = p.parentElement) p.removeAttribute('clip-path'); break;
      case 'shift': case 'baseline': { const g = d.createElementNS(s.namespaceURI, 'g'); g.setAttribute('transform', change === 'shift' ? 'translate(.25 0)' : 'translate(0 .25)'); e.replaceWith(g); g.append(e); break; }
      case 'root': { const box = s.getAttribute('viewBox').split(/[ ,]+/).map(Number); box[2] = 1; s.setAttribute('width', '1px'); s.setAttribute('viewBox', box.join(' ')); break; }
      default: throw Error('Unknown public image mutation.');
    }
    return new XMLSerializer().serializeToString(s);
  }, {svg, id, change: defect.change});
}
