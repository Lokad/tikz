import assert from 'node:assert/strict';
import { sha256 } from './shape-oracle-bundle.mjs';
import { shapePdfSpToCss } from './shape-pdf-camera.mjs';
import { measureShapePdfPair } from './shape-pdf-image-pair.mjs';

// Same oracle content and measured page origin, varying only padded root bounds.
export async function shapePdfViewportControls(renderer, input, save) {
  const sources = input.variants.filter(v => ['original-driver', 'native-css-6', 'native-semantic-css-6'].includes(v.mode));
  assert.equal(sources.length, 3);
  const delta = 4 * shapePdfSpToCss, controls = [], ordinary = [];
  const changes = [{ name: 'padded', side: null, amount: 0 }, ...['left', 'right', 'top', 'bottom']
    .flatMap(side => [-1, 1].map(sign => ({ name: side + (sign === 1 ? '-plus' : '-minus'), side, amount: sign * delta })))];
  for (const source of sources) {
    const baselinePages = {};
    for (const change of changes) {
      const svg = await renderer.page.evaluate(({ svg, units, side, amount }) => {
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml'), root = doc.documentElement, before = root.innerHTML;
        const factor = units === 'bp' ? 4 / 3 : 1, view = root.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);
        view[0] -= 8 / factor; view[1] -= 8 / factor; view[2] += 16 / factor; view[3] += 16 / factor;
        if (side === 'left') { view[0] -= amount / factor; view[2] += amount / factor; }
        if (side === 'right') view[2] += amount / factor;
        if (side === 'top') { view[1] -= amount / factor; view[3] += amount / factor; }
        if (side === 'bottom') view[3] += amount / factor;
        root.setAttribute('width', view[2] * factor + 'px'); root.setAttribute('height', view[3] * factor + 'px'); root.setAttribute('viewBox', view.join(' '));
        if (root.innerHTML !== before) throw new Error('Viewport control changed drawing instructions.');
        return new XMLSerializer().serializeToString(doc);
      }, { svg: source.svg, units: source.units, ...change });
      const prefix = 'viewport/' + source.mode + '-' + change.name;
      await save(prefix + '.svg', svg);
      for (const scale of [1, 4]) {
        const result = await measureShapePdfPair(renderer, { svg, units: source.units, svgOriginBp: source.origin,
          camera: input.camera, regions: input.regions, scale, frame: 'natural', cropLimit: 0,
          pdfPage: change.side === null ? input.pdfPages[scale] : baselinePages[scale], capture: change.side === null });
        assert.equal(result.repeat.pdf.exactRgbaMatch, true); assert.equal(result.repeat.svg.exactRgbaMatch, true);
        if (change.side === null) {
          baselinePages[scale] = 'data:image/png;base64,' + result.images['svg-page'];
          const file = prefix + '-' + scale + 'x-svg.png'; await save(file, Buffer.from(result.images['svg-page'], 'base64'));
          ordinary.push({ mode: source.mode, scale, whole: result.whole, fullPage: result.fullPage, image: file });
          // Compare a separately decoded unchanged SVG with its recorded full-page bitmap.
          const repeated = await measureShapePdfPair(renderer, { svg, units: source.units, svgOriginBp: source.origin,
            camera: input.camera, regions: input.regions, scale, frame: 'natural', pdfPage: baselinePages[scale], capture: false });
          assert.equal(repeated.fullPage.exactRgbaMatch, true);
          controls.push({ mode: source.mode, name: change.name, scale, exactRgbaMatch: true, svgSha256: sha256(svg), page: repeated.fullPage,
            requiredRegionCount: input.regions.length, regionsExact: repeated.whole.exactRgbaMatch && repeated.regions.every(r => r.exactRgbaMatch) });
        } else {
          controls.push({ mode: source.mode, name: change.name, scale, exactRgbaMatch: result.fullPage.exactRgbaMatch, svgSha256: sha256(svg),
            page: result.fullPage, requiredRegionCount: input.regions.length, regionsExact: result.whole.exactRgbaMatch && result.regions.every(r => r.exactRgbaMatch),
            changedRegions: result.regions.filter(r => !r.exactRgbaMatch).map(r => ({ id: r.id, rawChangedPixels: r.rawChangedPixels, maxRawChannelError: r.maxRawChannelError })) });
        }
      }
    }
    console.log(source.mode + ': 18 padded native-page viewport controls measured.');
  }
  assert.equal(controls.length, 54); assert.equal(ordinary.length, 6);
  return { paddingCssPixels: 8, boundaryDeltaSp: 4, boundaryDeltaCssPixels: delta, rendering: 'Direct page coordinates with separate natural-root clipping.',
    comparisonBasis: 'Independent padded SVG page versus its unchanged bitmap; separate ordinary-PDF observations are retained without a conformance claim.',
    drawingInstructionsUnchanged: true, passed: controls.every(c => c.exactRgbaMatch && c.regionsExact), controls, ordinary };
}
