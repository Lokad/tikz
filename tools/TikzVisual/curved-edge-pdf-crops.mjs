// Independent verification of presentation pixels against the saved full pages.
import assert from 'node:assert/strict';
export async function verifyPdfSavedCrops(renderer, pages, row, read) {
  assert.equal(pages.length, 2); assert.ok(pages.every(Buffer.isBuffer));
  const panels = [{rectangle: row.whole.rasterRectangles[row.scale + 'x'], enlargement: 1, images: row.images},
    ...row.crops.map(c => {
      const r = row.regions.find(r => r.id === c.id); assert.ok(r);
      assert.deepEqual(c.presentation, {background: 'white', integerEnlargement: row.scale === 1 ? 4 : 1,
        rawDifferenceAmplification: 16, rasterRectangle: r.rasterRectangles[row.scale + 'x']});
      return {rectangle: c.presentation.rasterRectangle, enlargement: c.presentation.integerEnlargement, images: c.images};
    })];
  const input = [];
  for (const p of panels) for (const name of ['pdf', 'svg', 'difference', 'amplified', 'overlay'])
    input.push({rectangle: p.rectangle, enlargement: p.enlargement, name, png: 'data:image/png;base64,' + (await read(p.images[name])).toString('base64')});
  return renderer.page.evaluate(async ({pages, size, input}) => {
    const decode = async src => { const im = new Image(); im.src = src; await im.decode();
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const ctx = c.getContext('2d', {colorSpace: 'srgb', willReadFrequently: true}); ctx.drawImage(im, 0, 0);
      return {width: im.width, height: im.height, bytes: ctx.getImageData(0, 0, c.width, c.height).data}; };
    const source = []; for (const p of pages) { const im = await decode(p);
      if (im.width !== size.width || im.height !== size.height) throw Error('Changed presentation source dimensions.'); source.push(im.bytes); }
    for (const p of input) {
      const q = p.rectangle, e = p.enlargement, im = await decode(p.png);
      if (im.width !== q.width * e || im.height !== q.height * e) throw Error('Changed presentation crop dimensions.');
      for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) {
        const si = 4 * ((q.y + Math.floor(y / e)) * size.width + q.x + Math.floor(x / e)), di = 4 * (y * im.width + x);
        let maximum = 0;
        if (p.name === 'amplified') for (let k = 0; k < 4; k++) maximum = Math.max(maximum, Math.abs(source[0][si + k] - source[1][si + k]));
        for (let k = 0; k < 4; k++) {
          const a = source[0][si + k], b = source[1][si + k];
          const expected = p.name === 'pdf' ? a : p.name === 'svg' ? b : k === 3 ? 255
            : p.name === 'difference' ? Math.abs(a - b) : p.name === 'overlay' ? Math.round((a + b) / 2)
            : k === 0 ? 255 : 255 - Math.min(255, maximum * 16);
          if (im.bytes[di + k] !== expected) throw Error('Presentation pixels differ from full-page evidence: ' + p.name);
        }
      }
    }
    return input.length;
  }, {pages: pages.map(p => 'data:image/png;base64,' + p.toString('base64')), size: row.pageSize, input});
}
