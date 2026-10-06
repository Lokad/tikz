// Integer RGB ink on the unchanged native PDF pixel grid; development only.
import assert from 'node:assert/strict';

export async function measureEdgePdfInk(renderer, images, pageSize, regions, scale) {
  assert.equal(images.length, 2);
  assert.ok(images.every(Buffer.isBuffer));
  assert.ok([1, 4].includes(scale));
  return renderer.page.evaluate(async ({images, pageSize, regions, scale}) => {
    const require = (v, m) => { if (!v) throw Error(m); };
    require([pageSize.width, pageSize.height].every(n => Number.isSafeInteger(n) && n > 0)
      && pageSize.width * pageSize.height <= 20000000, 'Unbounded PDF ink page.');
    require(regions.length > 1 && regions.length <= 2048 && regions[0].id === 'whole-picture'
      && new Set(regions.map(r => r.id)).size === regions.length, 'Invalid PDF ink coverage.');
    const buffers = [];
    for (const src of images) {
      const im = new Image(); im.src = src; await im.decode();
      require(im.width === pageSize.width && im.height === pageSize.height, 'PDF ink page dimensions changed.');
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const ctx = c.getContext('2d', {colorSpace: 'srgb', willReadFrequently: true});
      ctx.drawImage(im, 0, 0); buffers.push(ctx.getImageData(0, 0, c.width, c.height).data);
    }
    return regions.map(r => {
      const q = r.rasterRectangles[scale + 'x'];
      require([q.x, q.y, q.width, q.height].every(Number.isSafeInteger) && q.x >= 0 && q.y >= 0
        && q.width > 0 && q.height > 0 && q.x + q.width <= pageSize.width && q.y + q.height <= pageSize.height,
      'Invalid native PDF ink crop.');
      const sums = buffers.map(b => {
        const channels = [0, 0, 0];
        for (let y = q.y; y < q.y + q.height; y++) for (let x = q.x; x < q.x + q.width; x++) {
          const i = (y * pageSize.width + x) * 4;
          require(b[i + 3] === 255, 'PDF ink samples must be opaque white-backed.');
          for (let k = 0; k < 3; k++) channels[k] += 255 - b[i + k];
        }
        require(channels.every(Number.isSafeInteger), 'Noninteger PDF ink sum.'); return channels;
      });
      return {id: r.id, reference: sums[0], actual: sums[1]};
    });
  }, {images: images.map(b => 'data:image/png;base64,' + b.toString('base64')), pageSize, regions, scale});
}

export function attachEdgePdfInk(row, coverage) {
  assert.deepEqual(coverage.map(r => r.id), [row.whole.id, ...row.regions.map(r => r.id)]);
  return {...row, whole: {...row.whole, inkCoverage: coverage[0]},
    regions: row.regions.map((r, i) => ({...r, inkCoverage: coverage[i + 1]}))};
}
