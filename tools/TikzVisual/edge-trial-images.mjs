// Keep reference roles visible; older primary renderer labels remain untouched.
import {measureEdgeOraclePair} from './edge-oracle-pair.mjs';
export async function measureEdgeTrialPrimary(renderer, input) {
  const result = await measureEdgeOraclePair(renderer, {...input, rightLabel: input.rightLabel ?? 'Public candidate'});
  if (result.images.comparison) result.images.comparison = await renderer.page.evaluate(async ({images, referenceLabel, rightLabel}) => {
    const parts = [];
    for (const k of ['reference', 'actual', 'amplified']) { const im = new Image(); im.src = 'data:image/png;base64,' + images[k]; await im.decode(); parts.push(im); }
    const w = parts[0].width, h = parts[0].height, c = document.createElement('canvas'); c.width = 3 * w; c.height = h + 48;
    const ctx = c.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = 'black'; ctx.font = '12px sans-serif';
    [referenceLabel, rightLabel, 'Raw difference\nAmplified ×16'].forEach((text, i) => { text.split('\n').forEach((line, j) => ctx.fillText(line, i * w + 4, 16 + j * 16)); ctx.drawImage(parts[i], i * w, 48); });
    return c.toDataURL('image/png').split(',')[1];
  }, {images: result.images, referenceLabel: input.referenceLabel ?? 'Derived driver\nCorrection recorded', rightLabel: input.rightLabel ?? 'Public candidate'});
  return result;
}
