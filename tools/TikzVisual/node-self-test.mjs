import { readFile, writeFile, mkdir, access, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer, compareBundle } from './compare.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baseline = path.join(root, 'artifacts/node-comparisons');
const output = path.join(root, 'artifacts/node-comparator-mutations');
const baselineReport = JSON.parse(await readFile(path.join(baseline, 'report.json'), 'utf8'));
if (baselineReport.verdict !== 'pass' || baselineReport.rasterPolicy.id !== 'chromium-153-node-css-v1')
  throw new Error('Passing public node SVG bundle required.');
const original = await readFile(path.join(baseline, 'actual.svg'), 'utf8');
const scene = JSON.parse(await readFile(path.join(baseline, 'actual-scene.json'), 'utf8'));
const renderer = await createRenderer();
const results = [];
const glyph = index => new RegExp(`<use id="candidate-g${index}"[^>]+/>`);
const period = scene.glyphs.findIndex(g => g.slot === 46);
const ligature = scene.glyphs.findIndex(g => g.slot === 30);
if (period < 0 || ligature < 0) throw new Error('Native node fixture needs a period and ffi ligature.');

function change(pattern, replacement) {
  const result = original.replace(pattern, replacement);
  if (result === original) throw new Error('Node mutation did not change its intended artifact.');
  return result;
}
const defs = original.match(/<defs>[\s\S]*?<\/defs>/)[0];
const firstGlyph = original.match(glyph(0))[0];
const actualFrame = content => `<svg xmlns="http://www.w3.org/2000/svg" width="480px" height="128px" viewBox="-30 -50 480 128">${defs}${content}</svg>`;
const referenceFrame = content => `<svg xmlns="http://www.w3.org/2000/svg" width="480px" height="128px" viewBox="-22.5 -37.5 360 96">${defs}<g transform="scale(.75)">${content}</g></svg>`;

async function check(name, candidate, expected, options = {}) {
  const folder = path.join(output, name);
  if (!folder.startsWith(output + path.sep)) throw new Error('Node mutation escapes its output directory.');
  await rm(folder, { recursive: true, force: true });
  await mkdir(folder, { recursive: true });
  for (const file of ['reference.svg', 'actual-scene.json', 'source.tikz', 'provenance.json'])
    await writeFile(path.join(folder, file), await readFile(path.join(baseline, file)));
  const input = JSON.parse(await readFile(path.join(baseline, 'comparison-input.json'), 'utf8'));
  input.caseId = name; input.toleranceProfile = 'rectangles';
  input.numeric = options.numeric ?? { passed: true, checks: [], note: 'Deliberate image-only mutation; numeric gates bypassed.' };
  input.referenceMode = 'cached-with-controlled-node-mutation';
  if (options.reference !== undefined) {
    await writeFile(path.join(folder, 'reference.svg'), options.reference);
    input.referenceOriginBp = { x: 0, y: 0 };
  }
  await writeFile(path.join(folder, 'comparison-input.json'), JSON.stringify(input, null, 2));
  await writeFile(path.join(folder, 'actual.svg'), candidate);
  const report = await compareBundle(folder, renderer);
  if (report.verdict !== expected) throw new Error(`${name}: expected ${expected}, got ${report.verdict}.`);
  for (const file of ['comparison.png', 'diff.png', 'diff-amplified.png', 'report.json', 'index.html'])
    await access(path.join(folder, file));
  if (options.semanticId && !report.regions.some(r => r.attribution.some(a => a.semanticId === options.semanticId)))
    throw new Error(`${name}: intended source glyph absent from region attribution.`);
  results.push({ name, verdict: report.verdict, report: `${name}/report.json` });
  console.log(`${name}: ${report.verdict} (expected)`);
}

try {
  await check('unchanged-a', original, 'pass');
  await check('unchanged-b', original, 'pass');
  await check('missing-glyph', change(glyph(0), ''), 'mismatch', { semanticId: 'glyph-0' });
  await check('missing-period', change(glyph(period), ''), 'mismatch', { semanticId: `glyph-${period}` });
  await check('missing-ligature', change(glyph(ligature), ''), 'mismatch', { semanticId: `glyph-${ligature}` });
  await check('baseline-quarter-pixel', change(glyph(0), tag => `<g transform="translate(0 .25)">${tag}</g>`), 'mismatch', { semanticId: 'glyph-0' });
  await check('wrong-advance', change(glyph(1), tag => `<g transform="translate(.25 0)">${tag}</g>`), 'mismatch', { semanticId: 'glyph-1' });
  await check('thickened-outline', change(glyph(0), tag => tag.replace('<use ', '<use stroke="black" stroke-width=".5" ')), 'mismatch');
  await check('wrong-border-width', change(/(<path id="candidate-p0"[^>]+stroke-width=")([\d.]+)/, (_, prefix, width) => prefix + Number(width) * 2), 'mismatch');
  await check('wrong-physical-unit', change(glyph(0), tag => tag.replace('matrix(1.333333 0 0 1.333333', 'matrix(1.00375 0 0 1.00375')), 'mismatch');
  await check('wrong-canvas-height', change(/height="([\d.]+)px"/, (_, height) => `height="${Number(height) + 12}px"`), 'mismatch');
  const faint = `<g fill="black" fill-opacity=".01">${firstGlyph}</g>`;
  await check('missing-faint-text', actualFrame(''), 'mismatch', { reference: referenceFrame(faint) });
  const faintStroke = '<path d="M10 10L110 10" stroke="black" stroke-width="1" stroke-opacity=".01" fill="none"/>';
  await check('missing-faint-stroke', actualFrame(''), 'mismatch', { reference: referenceFrame(faintStroke) });
  const cover = '<path d="M-25 -15H0V5H-25Z" fill="white"/>';
  const blackGlyph = `<g fill="black">${firstGlyph}</g>`;
  await check('paint-order', actualFrame(blackGlyph + cover), 'mismatch', { reference: referenceFrame(cover + blackGlyph) });
  await check('numeric-gate', original, 'mismatch', { numeric: { passed: false,
    checks: [{ name: 'controlled-anchor-defect', expected: 0, actual: 1, tolerance: 0, passed: false }] } });
  await writeFile(path.join(output, 'suite.json'), JSON.stringify({ schemaVersion: 1, passed: true,
    expectedChecks: 15, imageOnlyMutations: true, results }, null, 2) + '\n');
} finally { await renderer.browser.close(); }
