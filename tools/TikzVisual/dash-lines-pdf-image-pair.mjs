import assert from 'node:assert/strict';
import { measureShapePdfPair } from './shape-pdf-image-pair.mjs';

// Additional native-page ink measurement, without changing shared/pinned
// raster math. Sum every channel's darkness, including sub-threshold ink.
// This constrains actual coverage when a wrong thin stroke is closer to PDF.
export async function measureDashLinesPdfPair(renderer, input) {
  const result = await measureShapePdfPair(renderer, input);
  assert.ok(result.images?.['svg-page'], 'Ink measurement requires a captured SVG page.');
  const coverage = await renderer.page.evaluate(async ({ reference, actual, regions, scale, pageSize }) => {
    const require = (v, m) => { if (!v) throw new Error(m); };
    require(regions.length === 41 && regions[0].id === 'whole-picture', 'Incomplete line ink regions.');
    require([1, 4].includes(scale) && pageSize.width * pageSize.height <= 20000000, 'Unbounded ink canvas.');
    async function read(url) {
      const image = new Image(); image.src = url; await image.decode();
      require(image.width === pageSize.width && image.height === pageSize.height, 'Ink page dimensions differ.');
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0); return ctx;
    }
    const left = await read(reference), right = await read(actual);
    return regions.map(region => {
      const q = region.rasterRectangles[scale + 'x'];
      require([q.x, q.y, q.width, q.height].every(Number.isSafeInteger) && q.x >= 0 && q.y >= 0 && q.width > 0 && q.height > 0
        && q.x + q.width <= pageSize.width && q.y + q.height <= pageSize.height, 'Invalid fixed ink crop.');
      const sum = ctx => {
        const data = ctx.getImageData(q.x, q.y, q.width, q.height).data, channels = [0, 0, 0];
        for (let i = 0; i < data.length; i += 4) {
          require(data[i + 3] === 255, 'Ink page is not opaque white-backed.');
          for (let c = 0; c < 3; c++) channels[c] += 255 - data[i + c];
        }
        require(channels.every(Number.isSafeInteger), 'Invalid native ink sum.'); return channels;
      };
      return { id: region.id, reference: sum(left), actual: sum(right) };
    });
  }, { reference: input.pdfPage, actual: 'data:image/png;base64,' + result.images['svg-page'],
    regions: input.regions, scale: input.scale, pageSize: result.pageSize });
  assert.deepEqual(coverage.map(r => r.id), [result.whole.id, ...result.regions.map(r => r.id)]);
  return { ...result, whole: { ...result.whole, inkCoverage: coverage[0] },
    regions: result.regions.map((r, i) => ({ ...r, inkCoverage: coverage[i + 1] })) };
}
