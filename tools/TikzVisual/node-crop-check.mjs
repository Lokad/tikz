// Oracle-only: original outlined glyphs at independent native DVI positions.
// This check has no access to the candidate converter, font data, or scene.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRenderer } from './compare.mjs';

if (process.argv.length !== 3) throw new Error('Usage: node node-crop-check.mjs <oracle-calibration-directory>');
const folder = path.resolve(process.argv[2]);
const svg = await readFile(path.join(folder, 'actual.svg'), 'utf8');
const renderer = await createRenderer();
try {
  const result = await renderer.page.evaluate(text => {
    const document = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (document.querySelector('parsererror')) throw new Error('Invalid oracle SVG.');
    const root = window.document.importNode(document.documentElement, true);
    window.document.body.append(root);
    try {
      const [x, y, width, height] = root.getAttribute('viewBox').split(/\s+/).map(Number);
      const checks = [...root.querySelectorAll('use')].map((use, index) => {
        const box = use.getBBox();
        const [a, b, c, d, e, f] = use.getAttribute('transform').match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/g).map(Number);
        const corners = [[box.x, box.y], [box.x + box.width, box.y],
          [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]
          .map(([px, py]) => ({ x: a * px + c * py + e, y: b * px + d * py + f }));
        const margins = corners.flatMap(p => [p.x - x, x + width - p.x, p.y - y, y + height - p.y]);
        const minimumMarginPixels = Math.min(...margins);
        return { index, outline: use.getAttribute('href'), minimumMarginPixels, passed: minimumMarginPixels >= 0 };
      });
      return { checks, passed: checks.length > 0 && checks.every(c => c.passed),
        scope: 'Original oracle outline bounding boxes fit the independently measured native node frame; no candidate data.' };
    } finally { root.remove(); }
  }, svg);
  await writeFile(path.join(folder, 'oracle-crop-check.json'), JSON.stringify({ schemaVersion: 1,
    renderer: renderer.identity, ...result }, null, 2) + '\n');
  if (!result.passed) process.exitCode = 1;
} finally { await renderer.browser.close(); }
