// Root-only perturbations must not move drawing instructions on native paper.
import assert from 'node:assert/strict';
import {edgeSpToCss} from './edge-oracle.mjs';
import {edgePdfRoutes} from './curved-edge-pdf-policy.mjs';
import {measureEdgePdfPair} from './edge-pdf-image-pair.mjs';

export const edgePdfViewportChanges = [{name: 'padded', side: null, amount: 0},
  ...['left', 'right', 'top', 'bottom'].flatMap(side => [-1, 1].map(sign =>
    ({name: side + (sign > 0 ? '-plus' : '-minus'), side, amount: sign * 4 * edgeSpToCss})))];

export async function edgePdfViewportSvg(renderer, svg, c, route, change) {
  assert.ok(edgePdfRoutes.includes(route));
  assert.ok(edgePdfViewportChanges.some(q => q.name === change.name && q.side === change.side && q.amount === change.amount));
  return renderer.page.evaluate(({svg, rectangle, origin, units, change}) => {
    const d = new DOMParser().parseFromString(svg, 'image/svg+xml'), s = d.documentElement;
    if (d.querySelector('parsererror') || d.doctype || s.localName !== 'svg') throw Error('Invalid viewport input.');
    const before = s.innerHTML, factor = units === 'bp' ? 4 / 3 : 1;
    const box = {x: rectangle.x - 8, y: rectangle.y - 8, width: rectangle.width + 16, height: rectangle.height + 16};
    if (change.side === 'left') { box.x -= change.amount; box.width += change.amount; }
    if (change.side === 'right') box.width += change.amount;
    if (change.side === 'top') { box.y -= change.amount; box.height += change.amount; }
    if (change.side === 'bottom') box.height += change.amount;
    s.setAttribute('width', box.width + 'px'); s.setAttribute('height', box.height + 'px');
    s.setAttribute('viewBox', [box.x / factor + origin.x, box.y / factor + origin.y, box.width / factor, box.height / factor].join(' '));
    if (before !== s.innerHTML) throw Error('Viewport control changed drawing instructions.');
    return new XMLSerializer().serializeToString(s);
  }, {svg, rectangle: c.regions[0].rectangle, units: route === 'native-semantic' ? 'cssPixels' : 'bp',
    origin: route === 'native-semantic' ? {x: 0, y: 0} : c.frame.origin, change});
}

export async function measureEdgePdfViewport(renderer, c, route, svg, baseline, scale) {
  const input = {svg, pdfPage: 'data:image/png;base64,' + baseline.toString('base64'),
    camera: c.camera, regions: c.regions, scale, frame: 'natural', units: route === 'native-semantic' ? 'cssPixels' : 'bp',
    svgOriginBp: route === 'native-semantic' ? {x: 0, y: 0} : c.frame.origin, capture: false};
  const measured = await measureEdgePdfPair(renderer, input);
  const regionsExact = [measured.whole, ...measured.regions].every(q => q.exactRgbaMatch);
  for (const repeated of Object.values(measured.repeat)) assert.deepEqual(repeated, {exactRgbaMatch: true, rawChangedPixels: 0, maxRawChannelError: 0});
  return {scale, fullPage: measured.fullPage, regionCount: c.regions.length, regionsExact, repeat: measured.repeat,
    ...(!measured.fullPage.exactRgbaMatch || !regionsExact ? {diagnostic: await measureEdgePdfPair(renderer, {...input, capture: true, cropLimit: 0})} : {})};
}
