import { readFile, writeFile, mkdir, cp, rm, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer, compareBundle, profile } from './compare.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baseline = path.join(root, 'artifacts/comparisons/line-units');
const output = path.join(root, 'artifacts/comparator-mutations');
const original = await readFile(path.join(baseline, 'actual.svg'), 'utf8');
const originalInput = JSON.parse(await readFile(path.join(baseline, 'comparison-input.json'), 'utf8'));
const originalScene = JSON.parse(await readFile(path.join(baseline, 'actual-scene.json'), 'utf8'));
const originalReport = JSON.parse(await readFile(path.join(baseline, 'report.json'), 'utf8'));
if (originalReport.verdict !== 'pass') throw new Error('Generate a passing line-units comparison before testing the comparator.');

await mkdir(output, { recursive: true });
const renderer = await createRenderer();
const results = [];
const hash = value => createHash('sha256').update(value).digest('hex');

async function check(name, svg, expected, synthetic = false, toleranceProfile = 'line-units') {
  const folder = path.join(output, name);
  if (!folder.startsWith(output + path.sep)) throw new Error('Mutation output escapes its directory.');
  await rm(folder, { recursive: true, force: true });
  await mkdir(folder, { recursive: true });
  for (const file of ['reference.svg', 'reference-metrics.json', 'provenance.json', 'oracle.log', 'source.tikz'])
    await cp(path.join(baseline, file), path.join(folder, file));
  const input = structuredClone(originalInput);
  input.caseId = name;
  input.toleranceProfile = toleranceProfile;
  input.referenceMode = synthetic ? 'comparator-synthetic' : 'cached-with-controlled-candidate-mutation';
  // Test raster/dimension rejection independently: never force a mismatch via
  // a fabricated numeric failure and never send mutated source to TeX.
  input.numeric = { passed: true, checks: [], note: 'Comparator-only mutation; numeric checking exercised separately.' };
  delete input.pdf;
  let actual = svg, scene = originalScene;
  if (synthetic) {
    input.referenceOriginBp = { x: 0, y: 0 };
    const [reference, candidate] = svg;
    const viewBox = /viewBox="([^"]+)"/.exec(reference)[1].split(/\s+/).map(Number);
    const referenceBp = reference.replace(/viewBox="[^"]+"/, `viewBox="${viewBox.map(v => v * .75).join(' ')}"`)
      .replace(/(<svg[^>]+>)/, '$1<g transform="scale(.75)">').replace('</svg>', '</g></svg>');
    await writeFile(path.join(folder, 'reference.svg'), referenceBp);
    await writeFile(path.join(folder, 'source.tikz'), '% Synthetic comparator image pair; no TeX source is executed.\n');
    await writeFile(path.join(folder, 'oracle.log'), 'Comparator-only synthetic fixture.\n');
    await writeFile(path.join(folder, 'provenance.json'), JSON.stringify({ schemaVersion: 1, synthetic: true, referenceSha256: hash(referenceBp) }, null, 2));
    actual = candidate;
    scene = { schemaVersion: 1, paths: [] };
  }
  await writeFile(path.join(folder, 'actual.svg'), actual);
  await writeFile(path.join(folder, 'actual-scene.json'), JSON.stringify(scene, null, 2));
  await writeFile(path.join(folder, 'comparison-input.json'), JSON.stringify(input, null, 2));
  await writeFile(path.join(folder, 'mutation.json'), JSON.stringify({ schemaVersion: 1, name, expected, candidateSha256: hash(actual), originalCandidateSha256: hash(original) }, null, 2));
  const report = await compareBundle(folder, renderer);
  if (report.verdict !== expected) throw new Error(`${name}: expected ${expected}, got ${report.verdict}`);
  for (const file of ['reference.png', 'actual.png', 'comparison.png', 'diff.png', 'diff-amplified.png', 'overlay.png', 'report.json', 'index.html'])
    await access(path.join(folder, file));
  for (const [file, digest] of Object.entries(report.artifacts))
    if (hash(await readFile(path.join(folder, file))) !== digest) throw new Error(`${name}: artifact hash mismatch: ${file}`);
  if (!synthetic && expected === 'mismatch' && name !== 'canvas-size' && report.regions.length === 0)
    throw new Error(`${name}: missing failure crop.`);
  results.push({ name, verdict: report.verdict, primaryPassed: report.primary.passed, dimensionsPassed: report.dimensions.passed,
    worstChannelError: Math.max(...report.primary.checks.map(c => c.maxChannelError)), report: `${name}/report.json` });
  console.log(`${name}: ${report.verdict} (expected)`);
  return report;
}

try {
  await check('unchanged', original, 'pass');
  const repeat = await check('unchanged-repeat', original, 'pass');
  if (!repeat.primary.checks.every(c => c.exactMatch)) throw new Error('Unchanged elementary pair must be pixel identical.');
  await check('fractional-translation', original.replace('<path ', '<path transform="translate(.5 .25)" '), 'mismatch');
  await check('physical-units', original.replace('<path ', '<path transform="scale(1.00375)" '), 'mismatch');
  await check('stroke-scaling', original.replace(/stroke-width="([^"]+)"/, (_, width) => `stroke-width="${Number(width) * 2}"`), 'mismatch');
  await check('color', original.replace('stroke="#000099"', 'stroke="#ff0000"'), 'mismatch');
  await check('opacity', original.replace('stroke-opacity="0.8"', 'stroke-opacity="0.5"'), 'mismatch');
  await check('missing-path', original.replace(/<path[^>]+\/>/, ''), 'mismatch');
  await check('extra-geometry', original.replace('</svg>', '<path d="M20 -.5L22 -.5L22 .5L20 .5Z" fill="#ff0000"/></svg>'), 'mismatch');
  await check('clipping', original.replace(/(<svg[^>]+>)/, '$1<defs><clipPath id="defect"><path d="M0 -10H30V10H0Z"/></clipPath></defs>')
    .replace('<path id="candidate-p0"', '<path clip-path="url(#defect)" id="candidate-p0"'), 'mismatch');
  await check('canvas-size', original.replace(/width="([^"]+)px"/, (_, width) => `width="${Number(width) + 8}px"`), 'mismatch');

  const svg = (body, width = 120, height = 20) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}px" height="${height}px" viewBox="0 0 ${width} ${height}">${body}</svg>`;
  const glyph = '<path d="M10 5H12V15H10Z M12 5H17V7H12Z M12 10H16V12H12Z" fill="#000"/>';
  const minus = '<path d="M25 9H31V11H25Z" fill="#000"/>';
  const arrow = '<path d="M60 7L66 10L60 13Z" fill="#000"/>';
  const line = '<path d="M35 10H60" stroke="#000" stroke-width="1" fill="none"/>';
  const reference = svg(glyph + minus + arrow + line);
  await check('synthetic-identical', [reference, reference], 'pass', true);
  await check('missing-glyph', [reference, svg(minus + arrow + line)], 'mismatch', true);
  await check('missing-minus', [reference, svg(glyph + arrow + line)], 'mismatch', true);
  await check('missing-arrowhead', [reference, svg(glyph + minus + line)], 'mismatch', true);
  await check('displaced-baseline', [reference, svg(`<g transform="translate(0 .5)">${glyph}</g>` + minus + arrow + line)], 'mismatch', true);
  const blankReference = svg('<path d="M5 10H20" stroke="#000" stroke-width="1"/>', 1000, 200);
  const blankActual = svg('<path d="M5 10H20" stroke="#888" stroke-width="1"/>', 1000, 200);
  const blank = await check('blank-area-dilution', [blankReference, blankActual], 'mismatch', true);
  if (blank.primary.checks[0].meanForegroundError < 10 || blank.primary.checks[0].foregroundPixels >= 100)
    throw new Error('Foreground error was diluted by blank canvas area.');

  // Every calibrated primary allowance must continue to catch displacement,
  // stroke scaling, and disappearing low-opacity content. The mean error uses
  // all visible samples, including alpha below the edge-mask threshold.
  for (const name of Object.keys(profile.cases ?? {})) {
    await check(`${name}-translation`, original.replace('<path ', '<path transform="translate(.5 .25)" '), 'mismatch', false, name);
    await check(`${name}-stroke-scaling`, original.replace(/stroke-width="([^"]+)"/, (_, width) => `stroke-width="${Number(width) * 2}"`), 'mismatch', false, name);
    const faint = svg('<path d="M5 10H20" stroke="#000" stroke-width="1" stroke-opacity=".01"/>', 1000, 200);
    await check(`${name}-missing-faint-stroke`, [faint, svg('', 1000, 200)], 'mismatch', true, name);
  }

  // A malformed or missing artifact is an infrastructure error, never a pass.
  const missingFolder = path.join(output, 'missing-artifact');
  await mkdir(missingFolder, { recursive: true });
  await writeFile(path.join(missingFolder, 'comparison-input.json'), JSON.stringify(originalInput));
  let rejected = false;
  try { await compareBundle(missingFolder, renderer); } catch { rejected = true; }
  if (!rejected) throw new Error('Missing artifacts were accepted.');
  results.push({ name: 'missing-artifact', verdict: 'harness-failure', expected: true });

  await writeFile(path.join(output, 'suite.json'), JSON.stringify({ schemaVersion: 1, passed: true, results }, null, 2) + '\n');
  console.log(`Comparator self-test passed: ${results.length} cases.`);
} finally {
  await renderer.browser.close();
}
