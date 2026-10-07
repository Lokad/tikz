// Check recorded source frames against the independently reconstructed SVG.
import assert from 'node:assert/strict';
import {edgePdfRoutes} from './curved-edge-pdf-policy.mjs';
export async function edgePdfSourceFrame(renderer, svg, route, origin) {
  assert.ok(edgePdfRoutes.includes(route));
  return renderer.page.evaluate(({svg, route, origin}) => {
    const d = new DOMParser().parseFromString(svg, 'image/svg+xml'), s = d.documentElement;
    if (d.querySelector('parsererror') || d.doctype || s.localName !== 'svg') throw Error('Invalid registered SVG.');
    const factor = route === 'native-semantic' ? 1 : 4 / 3;
    const offset = route === 'native-semantic' ? {x: 0, y: 0} : origin;
    const view = (s.getAttribute('viewBox') ?? '').trim().split(/[ ,]+/).map(Number);
    const dimension = value => { const m = /^([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)(px|pt)?$/i.exec(value ?? '');
      if (!m) throw Error('Invalid registered physical dimension.'); return Number(m[1]) * (m[2] === 'pt' ? 4 / 3 : 1); };
    const width = dimension(s.getAttribute('width')), height = dimension(s.getAttribute('height'));
    if (view.length !== 4 || !view.every(Number.isFinite) || view[2] <= 0 || view[3] <= 0
      || Math.abs(width - view[2] * factor) > 1e-9 || Math.abs(height - view[3] * factor) > 1e-9) throw Error('Registered SVG frame/units disagree.');
    return {x: view[0] * factor - offset.x * 4 / 3, y: view[1] * factor - offset.y * 4 / 3, width, height};
  }, {svg, route, origin});
}
