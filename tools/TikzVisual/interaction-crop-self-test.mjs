import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer } from './compare.mjs';
import { inspectOracleGlyphFrame } from './interaction-crop-check.mjs';

const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../artifacts/interaction-crop-mutations');
await mkdir(output, { recursive: true });
const renderer = await createRenderer();
const results = [];
const glyph = '<use href="#outline" transform="matrix(1 0 0 1 15 5)"/>';
const clip = '<clipPath id="clip" clipPathUnits="userSpaceOnUse"><path d="M15 0H20V20H15Z"/></clipPath>';
const frame = (content, clipping = '') => '<svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 20 20"><defs><path id="outline" d="M0 0H10V10H0Z"/>'
  + clipping + '</defs>' + content + '</svg>';

async function check(name, svg, expected) {
  const result = await inspectOracleGlyphFrame(svg, renderer);
  assert.equal(result.passed, expected, name);
  await writeFile(path.join(output, name + '.json'), JSON.stringify(result, null, 2) + '\n');
  results.push({ name, passed: true, expected });
  console.log(name + ': expected containment ' + expected);
}
async function reject(name, svg) {
  await assert.rejects(inspectOracleGlyphFrame(svg, renderer), /Unexpected|Missing/, name);
  results.push({ name, passed: true, expected: 'rejected malformed input' });
  console.log(name + ': rejected (expected)');
}
const clipped = value => '<g clip-path="url(#clip)">' + value + '</g>';

try {
  await check('inside-frame', frame(glyph.replace('15 5', '5 5')), true);
  await check('unclipped-overhang', frame(glyph), false);
  await check('visible-clipped-glyph', frame(clipped(glyph), clip), true);
  await check('fully-clipped-glyph', frame(clipped(glyph.replace('15 5', '40 40')), clip), true);
  await check('clip-allows-overflow', frame(clipped(glyph), clip.replace('H20', 'H22')), false);
  await check('removed-clip', frame(glyph, clip), false);
  await check('missing-glyphs', frame(''), false);
  await reject('unhandled-ancestor-transform', frame('<g transform="scale(2)">' + glyph + '</g>'));
  await reject('missing-clip-definition', frame(clipped(glyph)));
  await reject('malformed-glyph-frame', frame(glyph.replace('matrix(1 0 0 1 15 5)', 'matrix(1 0 0 1)')));
  assert.equal(results.length, 10);
  await writeFile(path.join(output, 'suite.json'), JSON.stringify({ schemaVersion: 1, passed: true,
    expectedChecks: 10, renderer: renderer.identity, results }, null, 2) + '\n');
} finally { await renderer.browser.close(); }
