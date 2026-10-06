import assert from 'node:assert/strict';
import { sha256 } from './shape-oracle-bundle.mjs';
import { measureShapePdfPair } from './shape-pdf-image-pair.mjs';

// Change only padded root bounds, and compare against the same SVG's bitmap.
// The drawing is mapped directly to native page pixels before any region crop.
export async function verifyDashGeometryPdfViewports(renderer, { variants, camera, regions, pdfPages }, save) {
  const names = ['original-svg', 'printed-pen-hull-driver-width-elements', 'pdf-instructions'];
  const sources = names.map(name => variants.find(v => v.mode === name)); assert.ok(sources.every(Boolean));
  const delta = 4 * 96 / (72.27 * 65536), controls = [], ordinary = [];
  const changes = [{ name: 'padded', side: null, amount: 0 }, ...['left', 'right', 'top', 'bottom'].flatMap(side => [-1, 1]
    .map(sign => ({ name: side + (sign === 1 ? '-plus' : '-minus'), side, amount: sign * delta })))];
  for (const source of sources) {
    const baselinePages = {};
    for (const change of changes) {
      const svg = await renderer.page.evaluate(({ svg, units, side, amount }) => {
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml'), root = doc.documentElement, before = root.innerHTML;
        const factor = units === 'bp' ? 4 / 3 : 1, v = root.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);
        v[0] -= 8 / factor; v[1] -= 8 / factor; v[2] += 16 / factor; v[3] += 16 / factor;
        if (side === 'left') { v[0] -= amount / factor; v[2] += amount / factor; }
        if (side === 'right') v[2] += amount / factor;
        if (side === 'top') { v[1] -= amount / factor; v[3] += amount / factor; }
        if (side === 'bottom') v[3] += amount / factor;
        root.setAttribute('width', v[2] * factor + 'px'); root.setAttribute('height', v[3] * factor + 'px'); root.setAttribute('viewBox', v.join(' '));
        if (root.innerHTML !== before) throw new Error('Viewport changed drawing instructions.');
        return new XMLSerializer().serializeToString(doc);
      }, { svg: source.svg, units: source.units, ...change });
      const prefix = 'viewport/' + source.mode + '-' + change.name; await save(prefix + '.svg', svg);
      for (const scale of [1, 4]) {
        const result = await measureShapePdfPair(renderer, { svg, units: source.units, svgOriginBp: source.origin,
          camera, regions, scale, frame: 'natural', cropLimit: 0, capture: change.side === null,
          pdfPage: change.side === null ? pdfPages[scale] : baselinePages[scale] });
        assert.ok(result.repeat.pdf.exactRgbaMatch && result.repeat.svg.exactRgbaMatch);
        if (change.side === null) {
          baselinePages[scale] = 'data:image/png;base64,' + result.images['svg-page'];
          await save(prefix + '-' + scale + 'x-svg.png', Buffer.from(result.images['svg-page'], 'base64'));
          ordinary.push({ mode: source.mode, scale, whole: result.whole, fullPage: result.fullPage });
          const repeat = await measureShapePdfPair(renderer, { svg, units: source.units, svgOriginBp: source.origin, camera, regions, scale,
            frame: 'natural', cropLimit: 0, capture: false, pdfPage: baselinePages[scale] });
          controls.push({ mode: source.mode, name: change.name, scale, svgSha256: sha256(svg), exactRgbaMatch: repeat.fullPage.exactRgbaMatch,
            regionsExact: repeat.whole.exactRgbaMatch && repeat.regions.every(r => r.exactRgbaMatch) });
        } else controls.push({ mode: source.mode, name: change.name, scale, svgSha256: sha256(svg), exactRgbaMatch: result.fullPage.exactRgbaMatch,
          regionsExact: result.whole.exactRgbaMatch && result.regions.every(r => r.exactRgbaMatch), page: result.fullPage });
      }
    }
  }
  assert.equal(controls.length, 54); assert.equal(ordinary.length, 6);
  return { passed: controls.every(c => c.exactRgbaMatch && c.regionsExact), paddingCssPixels: 8, boundaryDeltaSp: 4,
    boundaryDeltaCssPixels: delta, drawingInstructionsUnchanged: true, controls, ordinary };
}
