import assert from 'node:assert/strict';
import { createRenderer } from './compare.mjs';
import { installShapeMetrics, measureDashGeometryPair } from './dash-geometry-image-pair.mjs';

const source = '<svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 16 16">'
  + '<defs><clipPath id="c"><path d="M0 0H8V16H0Z"/></clipPath></defs>'
  + '<path d="M0 8H16" stroke="#000" stroke-width="2" clip-path="url(#c)"/></svg>';
const renderer = await createRenderer();
try {
  await installShapeMetrics(renderer); let positives = 0, negatives = 0;
  const input = { reference: source, actual: source, leftIsDriver: false, origin: { x: 0, y: 0 }, camera: { x: 0, y: 0, width: 16, height: 16 },
    frame: 'expanded', regions: [{ id: 'line', nodeId: null, kind: 'path', rectangle: { x: 0, y: 0, width: 16, height: 16 } }], cropLimit: 0 };
  for (const scale of [1, 4]) for (const background of ['transparent', 'white', 'black']) {
    const result = await measureDashGeometryPair(renderer, { ...input, scale, background });
    assert.equal(result.metrics.rawChangedPixels, 0); positives++;
  }
  for (const scale of [1, 4]) {
    const result = await measureDashGeometryPair(renderer, { ...input, actual: source.replace(' clip-path="url(#c)"', ''), scale, background: 'white' });
    assert.ok(result.metrics.rawChangedPixels > 0); assert.ok(result.regions[0].rawChangedPixels > 0); negatives++;
  }
  for (const actual of [source.replace('id="c"', 'id="missing"'), source.replace('url(#c)', 'url(https://example.invalid/c)'),
    source.replace('stroke="#000"', 'onload="x()" stroke="#000"'), source.replace('<defs>', '<defs><path id="c" d="M0 0"/>')]) {
    await assert.rejects(() => measureDashGeometryPair(renderer, { ...input, actual, scale: 1, background: 'white' })); negatives++;
  }
  console.log('Dash geometry image controls: ' + positives + ' unchanged pairs and ' + negatives + ' defect/input rejections pass.');
} finally { await renderer.browser.close(); }
