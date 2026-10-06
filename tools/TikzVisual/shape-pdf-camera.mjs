import assert from 'node:assert/strict';
import { unionBounds } from './shape-frame-math.mjs';

export const shapePdfSpToCss = 96 / (72.27 * 65536);
const finite = values => values.every(Number.isFinite);
export function shapePdfPageCamera(measurement, rasterSizes) {
  const { page, pictureBounds: b, pictureBox: box, pdfOriginPixels } = measurement;
  assert.ok(Object.values(page).every(Number.isSafeInteger));
  assert.ok(Object.values(b).every(Number.isSafeInteger) && Object.values(box).every(Number.isSafeInteger));
  assert.equal(page.widthSp, 600 * 65536); assert.equal(page.heightSp, 800 * 65536);
  assert.equal(box.depthSp, 0); assert.equal(box.widthSp, b.maxXSp - b.minXSp); assert.equal(box.heightSp, b.maxYSp - b.minYSp);
  assert.ok(box.widthSp > 0 && box.heightSp > 0 && page.boxXSp >= 0 && page.boxBaselineYSp >= 0);
  assert.ok(page.boxXSp <= page.widthSp && page.boxBaselineYSp <= page.heightSp);
  const origin = { x: (page.boxXSp - b.minXSp) * shapePdfSpToCss,
    y: (page.heightSp - page.boxBaselineYSp + b.minYSp + box.depthSp) * shapePdfSpToCss };
  assert.deepEqual(origin, pdfOriginPixels, 'Saved page position and recorded camera disagree.');
  const physicalPage = { width: page.widthSp * shapePdfSpToCss, height: page.heightSp * shapePdfSpToCss };
  const picture = { minX: b.minXSp * shapePdfSpToCss, minY: -b.maxYSp * shapePdfSpToCss,
    maxX: b.maxXSp * shapePdfSpToCss, maxY: -b.minYSp * shapePdfSpToCss };
  assert.ok(origin.x + picture.minX >= 0 && origin.y + picture.minY >= 0
    && origin.x + picture.maxX <= physicalPage.width && origin.y + picture.maxY <= physicalPage.height);
  assert.deepEqual(Object.keys(rasterSizes).sort(), ['1x', '4x']);
  for (const scale of [1, 4]) {
    assert.deepEqual(rasterSizes[scale + 'x'], { width: Math.ceil(physicalPage.width * scale), height: Math.ceil(physicalPage.height * scale) });
    assert.ok(rasterSizes[scale + 'x'].width * rasterSizes[scale + 'x'].height <= 20000000);
  }
  return { origin, physicalPage, picture, rasterSizes };
}

export function shapePdfRasterRectangle(rectangle, camera, scale) {
  assert.ok([1, 4].includes(scale));
  assert.ok(finite(Object.values(rectangle)) && rectangle.width > 0 && rectangle.height > 0);
  const x = Math.floor((camera.origin.x + rectangle.x) * scale), y = Math.floor((camera.origin.y + rectangle.y) * scale);
  const width = Math.ceil((camera.origin.x + rectangle.x + rectangle.width) * scale) - x;
  const height = Math.ceil((camera.origin.y + rectangle.y + rectangle.height) * scale) - y;
  const page = camera.rasterSizes[scale + 'x'];
  assert.ok([x, y, width, height].every(Number.isSafeInteger) && x >= 0 && y >= 0 && width > 0 && height > 0
    && x + width <= page.width && y + height <= page.height, 'Region escapes the native page.');
  return { x, y, width, height };
}

export function shapePdfRegions(frames, camera) {
  assert.equal(frames.checks.length, 98); assert.equal(new Set(frames.checks.map(c => c.id)).size, 98);
  assert.equal(frames.checks.filter(c => c.kind === 'background').length, 28);
  assert.equal(frames.checks.filter(c => c.kind === 'glyph').length, 70);
  for (const key of Object.keys(camera.picture)) assert.ok(Math.abs(frames.frames.picture[key] - camera.picture[key]) <= 1e-9);
  const whole = frames.camera;
  assert.ok(finite(Object.values(whole)) && Number.isInteger(whole.width) && Number.isInteger(whole.height));
  const regions = [{ id: 'whole-picture', nodeId: null, kind: 'picture', rectangle: { ...whole } },
    ...frames.checks.map(c => {
      assert.ok(['background', 'glyph'].includes(c.kind) && /^[a-z0-9-]{1,128}$/.test(c.id) && /^[a-z0-9-]+$/.test(c.nodeId));
      for (const b of [c.native, c.driver]) assert.ok(finite(Object.values(b)) && b.maxX > b.minX && b.maxY > b.minY);
      const b = unionBounds([c.native, c.driver]);
      const minX = Math.max(whole.x, b.minX - 3), minY = Math.max(whole.y, b.minY - 3);
      const maxX = Math.min(whole.x + whole.width, b.maxX + 3), maxY = Math.min(whole.y + whole.height, b.maxY + 3);
      assert.ok(minX <= b.minX && minY <= b.minY && maxX >= b.maxX && maxY >= b.maxY, 'Whole camera truncates required ink.');
      return { id: c.id, nodeId: c.nodeId, kind: c.kind, font: c.font ?? null, slot: c.slot ?? null,
        rectangle: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } };
    })];
  return regions.map(r => ({ ...r, rasterRectangles: Object.fromEntries([1, 4].map(scale => [scale + 'x', shapePdfRasterRectangle(r.rectangle, camera, scale)])),
    basis: 'Native page origin; independent original/native tight bounds and fixed padding. No candidate input.' }));
}
