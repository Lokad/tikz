import { readFile, writeFile, mkdir, access, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer, compareBundle } from './compare.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baseline = path.join(root, 'artifacts/font-comparisons/regular-10');
const output = path.join(root, 'artifacts/font-comparator-mutations');
const original = await readFile(path.join(baseline, 'actual.svg'), 'utf8');
const sourceReport = JSON.parse(await readFile(path.join(baseline, 'report.json'), 'utf8'));
if (sourceReport.verdict !== 'pass' || !sourceReport.primary.checks.every(c => c.exactMatch))
  throw new Error('A passing exact regular-10 atlas is required.');
const renderer = await createRenderer();
const results = [];

async function check(name, candidate, expected, slot = undefined) {
  const folder = path.join(output, name);
  if (!folder.startsWith(output + path.sep)) throw new Error('Font mutation output escapes its directory.');
  await rm(folder, { recursive: true, force: true });
  await mkdir(folder, { recursive: true });
  for (const file of ['reference.svg', 'actual-scene.json', 'source.tikz', 'font-provenance.json'])
    await writeFile(path.join(folder, file), await readFile(path.join(baseline, file)));
  const input = JSON.parse(await readFile(path.join(baseline, 'comparison-input.json'), 'utf8'));
  input.caseId = name;
  input.referenceMode = 'cached-with-controlled-font-mutation';
  input.numeric = { passed: true, checks: [], note: 'Comparator mutation; independent numeric gates are tested separately.' };
  await writeFile(path.join(folder, 'actual.svg'), candidate);
  await writeFile(path.join(folder, 'comparison-input.json'), JSON.stringify(input, null, 2));
  const report = await compareBundle(folder, renderer);
  if (report.verdict !== expected) throw new Error(`${name}: expected ${expected}, got ${report.verdict}`);
  for (const file of ['comparison.png', 'diff.png', 'diff-amplified.png', 'index.html', 'report.json'])
    await access(path.join(folder, file));
  if (slot !== undefined && !report.regions.some(r => r.attribution.some(a => a.source?.slot === slot)))
    throw new Error(`${name}: difference was not attributed to glyph slot ${slot}.`);
  results.push({ name, verdict: report.verdict, report: `${name}/report.json` });
  console.log(`${name}: ${report.verdict} (expected)`);
}

const use = slot => new RegExp(`<use id="glyph-${slot}"[^>]+/>`);
try {
  await check('font-unchanged-repeat', original, 'pass');
  await check('font-missing-period', original.replace(use(46), ''), 'mismatch', 46);
  await check('font-missing-ligature', original.replace(use(30), ''), 'mismatch', 30);
  await check('font-missing-accent', original.replace(use(233), ''), 'mismatch', 233);
  await check('font-displaced-baseline', original.replace(use(65), tag => tag.replace('<use ', '<use transform="translate(0 .1875)" ')), 'mismatch', 65);
  await check('font-wrong-glyph', original.replace(use(65), tag => tag.replace('href="#font-65"', 'href="#font-66"')), 'mismatch', 65);
  await writeFile(path.join(output, 'suite.json'), JSON.stringify({ schemaVersion: 1, passed: true, expectedChecks: 6, results }, null, 2) + '\n');
} finally {
  await renderer.browser.close();
}
