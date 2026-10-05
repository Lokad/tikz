// Oracle-only glyph containment. The calibration generator separately admits
// only native axis-aligned rectangle clips. No candidate or bundled font data.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer } from './compare.mjs';

export async function inspectOracleGlyphFrame(svg, renderer) {
  return renderer.page.evaluate(text => {
    const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (parsed.querySelector('parsererror')) throw new Error('Invalid oracle SVG.');
    const root = document.importNode(parsed.documentElement, true);
    document.body.append(root);
    try {
      const [x, y, width, height] = root.getAttribute('viewBox').split(/\s+/).map(Number);
      const checks = [...root.querySelectorAll('use')].map((use, index) => {
        const box = use.getBBox();
        const values = use.getAttribute('transform').match(/^matrix\(([^)]+)\)$/)?.[1].split(/\s+/).map(Number);
        if (values?.length !== 6 || values.some(v => !Number.isFinite(v))) throw new Error('Unexpected native glyph frame.');
        const [a, b, c, d, e, f] = values;
        const corners = [[box.x, box.y], [box.x + box.width, box.y],
          [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]
          .map(([px, py]) => ({ x: a * px + c * py + e, y: b * px + d * py + f }));
        let minX = Math.min(...corners.map(p => p.x)), maxX = Math.max(...corners.map(p => p.x));
        let minY = Math.min(...corners.map(p => p.y)), maxY = Math.max(...corners.map(p => p.y));
        const clips = [];
        for (let parent = use.parentElement; parent !== root; parent = parent.parentElement) {
          if (!parent || parent.hasAttribute('transform')) throw new Error('Unexpected generated glyph ancestor.');
          const attribute = parent.getAttribute('clip-path');
          if (!attribute) continue;
          const id = /^url\(#([\w-]+)\)$/.exec(attribute)?.[1];
          const clip = id && [...root.querySelectorAll('clipPath')].find(p => p.id === id);
          if (!clip || clip.getAttribute('clipPathUnits') !== 'userSpaceOnUse') throw new Error('Missing independent rectangle clip.');
          const bounds = clip.querySelector('path').getBBox();
          minX = Math.max(minX, bounds.x); maxX = Math.min(maxX, bounds.x + bounds.width);
          minY = Math.max(minY, bounds.y); maxY = Math.min(maxY, bounds.y + bounds.height);
          clips.push(id);
        }
        const visible = minX <= maxX && minY <= maxY;
        // Each serialized matrix component differs by <= .5e-6. Include its
        // conservative outline-coordinate amplification and three frame/origin
        // number roundings; this allowance is not a raster tolerance.
        const roundingAllowancePixels = .0000005 * (Math.max(Math.abs(box.x), Math.abs(box.x + box.width))
          + Math.max(Math.abs(box.y), Math.abs(box.y + box.height)) + 4);
        const minimumMarginPixels = visible ? Math.min(minX - x, x + width - maxX, minY - y, y + height - maxY) : null;
        return { index, outline: use.getAttribute('href'), clips, visible, minimumMarginPixels, roundingAllowancePixels,
          passed: !visible || minimumMarginPixels >= -roundingAllowancePixels };
      });
      return { passed: checks.length > 0 && checks.every(c => c.passed), checks,
        scope: 'Original oracle outline bounds at native DVI positions and PGF frames; intersect only independently measured axis-aligned rectangle clips.' };
    } finally { root.remove(); }
  }, svg);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error('Usage: node interaction-crop-check.mjs <oracle-calibration-directory>');
  const folder = path.resolve(process.argv[2]);
  const svg = await readFile(path.join(folder, 'actual.svg'), 'utf8');
  const renderer = await createRenderer();
  try {
    const result = await inspectOracleGlyphFrame(svg, renderer);
    await writeFile(path.join(folder, 'oracle-crop-check.json'), JSON.stringify({ schemaVersion: 1,
      renderer: renderer.identity, ...result }, null, 2) + '\n');
    if (!result.passed) process.exitCode = 1;
  } finally { await renderer.browser.close(); }
}
