import { readFile, writeFile, mkdir, access, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer, compareBundle } from './compare.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'artifacts/text-comparator-mutations');
const manifest = JSON.parse(await readFile(path.join(root, 'tests/Reference/Text/cases.json'), 'utf8'));
const renderer = await createRenderer();
const results = [];

async function check(c, suffix, candidate, expected, reference = undefined, semanticId = undefined) {
  const baseline = path.join(root, 'artifacts/text-comparisons', c.id);
  const name = `${c.id}-${suffix}`, folder = path.join(output, name);
  if (!folder.startsWith(output + path.sep)) throw new Error('Text mutation escapes its output directory.');
  await rm(folder, { recursive: true, force: true });
  await mkdir(folder, { recursive: true });
  for (const file of ['reference.svg', 'actual-scene.json', 'source.tikz', 'provenance.json'])
    await writeFile(path.join(folder, file), await readFile(path.join(baseline, file)));
  const input = JSON.parse(await readFile(path.join(baseline, 'comparison-input.json'), 'utf8'));
  input.caseId = name; input.toleranceProfile = c.id;
  input.numeric = { passed: true, checks: [], note: 'Deliberate image mutation; native integer layout gates remain separately required.' };
  input.referenceMode = 'cached-with-controlled-text-mutation';
  await writeFile(path.join(folder, 'comparison-input.json'), JSON.stringify(input, null, 2));
  await writeFile(path.join(folder, 'actual.svg'), candidate);
  if (reference !== undefined) {
    await writeFile(path.join(folder, 'reference.svg'), reference);
    input.referenceOriginBp = { x: 0, y: 0 };
    await writeFile(path.join(folder, 'comparison-input.json'), JSON.stringify(input, null, 2));
  }
  const report = await compareBundle(folder, renderer);
  if (report.verdict !== expected) throw new Error(`${name}: expected ${expected}, got ${report.verdict}.`);
  for (const file of ['comparison.png', 'diff.png', 'diff-amplified.png', 'report.json', 'index.html'])
    await access(path.join(folder, file));
  if (semanticId && !report.regions.some(r => r.attribution.some(a => a.semanticId === semanticId)))
    throw new Error(`${name}: intended glyph was not included in the source attribution.`);
  results.push({ name, verdict: report.verdict, report: `${name}/report.json` });
  console.log(`${name}: ${report.verdict} (expected)`);
}

function change(original, pattern, replacement) {
  const result = original.replace(pattern, replacement);
  if (result === original) throw new Error('Mutation did not change its intended artifact.');
  return result;
}

const frame = content => `<svg xmlns="http://www.w3.org/2000/svg" width="450pt" height="84pt" viewBox="-3 -54 450 84">${content}</svg>`;
const faint = frame('<path d="M10 -10L110 -10" stroke="black" stroke-width=".75" stroke-opacity=".01" fill="none"/>');
const glyph = index => new RegExp(`<use id="glyph-${index}"[^>]+/>`);
try {
  for (const c of manifest.cases) {
    const baseline = path.join(root, 'artifacts/text-comparisons', c.id);
    const report = JSON.parse(await readFile(path.join(baseline, 'report.json'), 'utf8'));
    if (report.verdict !== 'pass' || report.rasterPolicy.id !== 'chromium-153-text-bp-v1')
      throw new Error(`Passing grounded label bundle required: ${c.id}`);
    const original = await readFile(path.join(baseline, 'actual.svg'), 'utf8');
    await check(c, 'unchanged', original, 'pass');
    await check(c, 'missing-glyph', change(original, glyph(0), ''), 'mismatch', undefined, 'label-glyph-0');
    await check(c, 'baseline-quarter-pixel', change(original, glyph(0), tag => tag.replace('<use ', '<use transform="translate(0 .1875)" ')), 'mismatch', undefined, 'label-glyph-0');
    await check(c, 'thickened-outline', change(original, glyph(0), tag => tag.replace('<use ', '<use stroke="black" stroke-width=".5" ')), 'mismatch', undefined, 'label-glyph-0');
    await check(c, 'missing-faint-stroke', frame(''), 'mismatch', faint);
  }
  const c = manifest.cases.find(c => c.id === 'sentence-spacing');
  const original = await readFile(path.join(root, 'artifacts/text-comparisons', c.id, 'actual.svg'), 'utf8');
  const scene = JSON.parse(await readFile(path.join(root, 'artifacts/text-comparisons', c.id, 'actual-scene.json'), 'utf8'));
  const period = scene.layout.glyphs.findIndex(g => g.slot === 46);
  if (period < 0) throw new Error('Required punctuation fixture has no period.');
  await check(c, 'missing-period', change(original, glyph(period), ''), 'mismatch', undefined, `label-glyph-${period}`);
  const words = manifest.cases.find(c => c.id === 'words-regular-10');
  const wordSvg = await readFile(path.join(root, 'artifacts/text-comparisons', words.id, 'actual.svg'), 'utf8');
  const wordScene = JSON.parse(await readFile(path.join(root, 'artifacts/text-comparisons', words.id, 'actual-scene.json'), 'utf8'));
  const ligature = wordScene.layout.glyphs.findIndex(g => g.slot === 30);
  if (ligature < 0) throw new Error('Required word fixture has no ffi ligature.');
  await check(words, 'missing-ligature', change(wordSvg, glyph(ligature), ''), 'mismatch', undefined, `label-glyph-${ligature}`);
  const metrics = JSON.parse(await readFile(path.join(root, 'tests/Reference/Fonts/regular-10.json'), 'utf8'));
  const aWidth = metrics.glyphs.find(row => row[0] === 65)[1];
  const missingKernBp = (aWidth - wordScene.layout.glyphs[1].xSp) * 72 / (72.27 * 65536);
  await check(words, 'missing-AV-kern', change(wordSvg, glyph(1), tag => tag.replace('<use ', `<use transform="translate(${missingKernBp} 0)" `)), 'mismatch', undefined, 'label-glyph-1');
  await writeFile(path.join(output, 'suite.json'), JSON.stringify({ schemaVersion: 1, passed: true,
    expectedCases: manifest.cases.map(c => c.id), expectedChecks: manifest.cases.length * 5 + 3, results }, null, 2) + '\n');
} finally {
  await renderer.browser.close();
}
