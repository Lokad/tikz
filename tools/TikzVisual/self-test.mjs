import { readFile, writeFile, mkdir, cp, rm, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer, compareBundle, profile } from './compare.mjs';
import assert from 'node:assert/strict';
import { canonicalEdgeSvg } from './edge-replay.mjs';
import { edgeSvgPaints, edgePdfPaints } from './edge-driver-state.mjs';
import { pgfPdfPoint } from './dash-pdf-vector.mjs';

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

const defaultBasis = { folder: baseline, input: originalInput, scene: originalScene, svg: original, keepPdf: false };
const transformed = (svg, transform) => svg.replace(/(<svg[^>]+>)/, `$1<g transform="${transform}">`).replace('</svg>', '</g></svg>');

async function check(name, svg, expected, synthetic = false, toleranceProfile = 'line-units', actualUnits = undefined, basis = defaultBasis) {
  const folder = path.join(output, name);
  if (!folder.startsWith(output + path.sep)) throw new Error('Mutation output escapes its directory.');
  await rm(folder, { recursive: true, force: true });
  await mkdir(folder, { recursive: true });
  for (const file of ['reference.svg', 'reference-metrics.json', 'provenance.json', 'oracle.log', 'source.tikz',
    ...(basis.keepPdf ? ['reference.pdf', 'pdf-page-1x.png', 'pdf-page-4x.png'] : [])])
    await cp(path.join(basis.folder, file), path.join(folder, file));
  const input = structuredClone(basis.input);
  input.caseId = name;
  input.toleranceProfile = toleranceProfile;
  input.referenceMode = synthetic ? 'comparator-synthetic' : 'cached-with-controlled-candidate-mutation';
  // Test raster/dimension rejection independently: never force a mismatch via
  // a fabricated numeric failure and never send mutated source to TeX.
  input.numeric = { passed: true, checks: [], note: 'Comparator-only mutation; numeric checking exercised separately.' };
  if (!basis.keepPdf) delete input.pdf;
  if (actualUnits) input.actualUnits = actualUnits;
  let actual = svg, scene = basis.scene;
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
  await writeFile(path.join(folder, 'mutation.json'), JSON.stringify({ schemaVersion: 1, name, expected, candidateSha256: hash(actual), originalCandidateSha256: hash(basis.svg) }, null, 2));
  if (basis.mutateBundle) await basis.mutateBundle(folder);
  let report;
  try { report = await compareBundle(folder, renderer); }
  catch (error) {
    if (expected !== 'harness-failure' || !error.message.includes('Width')) throw error;
    results.push({ name, verdict: 'harness-failure', expected: true, error: error.message });
    return null;
  }
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
  // Native scaled math faces introduce local outline aliases. The shared
  // normalization changes definition order only, preserving every byte of a
  // definition and rejecting unexpected or ambiguous definition vocabulary.
  const outline = "<path id='g1-0' d='M0 0L1 1'/>", alias = "<use id='g9-0' xlink:href='#g1-0' transform='scale(.833333)'/>";
  const definitions = body => '<svg><defs>' + body + '</defs><use xlink:href="#g9-0"/></svg>';
  const normal = canonicalEdgeSvg(Buffer.from(definitions(outline + alias)));
  assert.equal(normal, canonicalEdgeSvg(Buffer.from(definitions(alias + outline))));
  assert.notEqual(normal, canonicalEdgeSvg(Buffer.from(definitions(outline + alias.replace('.833333', '.833334')))));
  assert.notEqual(normal, canonicalEdgeSvg(Buffer.from(definitions(outline))));
  for (const body of [outline + outline, outline + '<rect/>', '<path d="M0 0"/>'])
    assert.throws(() => canonicalEdgeSvg(Buffer.from(definitions(body))));
  for (const name of ['definition-order', 'changed-alias-scale', 'missing-alias', 'duplicate-definition', 'unexpected-definition', 'unnamed-definition'])
    results.push({ name, verdict: 'control-passed', expected: true });
  await check('unchanged', original, 'pass');
  const repeat = await check('unchanged-repeat', original, 'pass');
  if (!repeat.primary.checks.every(c => c.exactMatch)) throw new Error('Unchanged elementary pair must be pixel identical.');
  await check('fractional-translation', transformed(original, 'translate(.5 .25)'), 'mismatch');
  await check('physical-units', transformed(original, 'scale(1.00375)'), 'mismatch');
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
  const offsetFrame = reference.replace('viewBox="0 0 120 20"', 'viewBox="-8 -4 120 20"');
  const bpCandidate = offsetFrame.replace('viewBox="-8 -4 120 20"', 'viewBox="-6 -3 90 15"')
    .replace(/(<svg[^>]+>)/, '$1<g transform="scale(.75)">').replace('</svg>', '</g></svg>');
  await check('bp-coordinate-registration', [offsetFrame, bpCandidate], 'pass', true, 'line-units', 'bp');
  await check('wrong-bp-coordinate-registration', [offsetFrame, bpCandidate], 'mismatch', true);
  await check('synthetic-identical', [reference, reference], 'pass', true);
  await check('missing-glyph', [reference, svg(minus + arrow + line)], 'mismatch', true);
  await check('missing-minus', [reference, svg(glyph + arrow + line)], 'mismatch', true);
  // DVI fraction/radical rules and converter rules use SVG rectangles. Exercise
  // the existing comparison machinery without changing any image allowances.
  const rule = '<rect x="25" y="9" width="6" height=".4" fill="#000"/>';
  await check('rule-identical', [svg(glyph + rule), svg(glyph + rule)], 'pass', true);
  await check('missing-rule', [svg(glyph + rule), svg(glyph)], 'mismatch', true);
  await check('displaced-rule', [svg(glyph + rule), svg(glyph + rule.replace('y="9"', 'y="9.5"'))], 'mismatch', true);
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
    await check(`${name}-translation`, transformed(original, 'translate(.5 .25)'), 'mismatch', false, name);
    await check(`${name}-stroke-scaling`, original.replace(/stroke-width="([^"]+)"/, (_, width) => `stroke-width="${Number(width) * 2}"`), 'mismatch', false, name);
    const faint = svg('<path d="M5 10H20" stroke="#000" stroke-width="1" stroke-opacity=".01"/>', 1000, 200);
    await check(`${name}-missing-faint-stroke`, [faint, svg('', 1000, 200)], 'mismatch', true, name);
  }

  // Reuse the same artifact/mutation handling on the actual width corpus.
  // Keep numeric checks positive so primary/PDF sensitivity is observed directly.
  const widthFolder = path.join(root, 'artifacts/comparisons/width-presets');
  const widthBasis = { folder: widthFolder, keepPdf: true,
    input: JSON.parse(await readFile(path.join(widthFolder, 'comparison-input.json'))),
    scene: JSON.parse(await readFile(path.join(widthFolder, 'actual-scene.json'))),
    svg: await readFile(path.join(widthFolder, 'actual.svg'), 'utf8') };
  const widthCheck = (name, svg, expected) => check('width-' + name, svg, expected, false, 'width-presets', undefined, widthBasis);
  const positiveWidth = await widthCheck('unchanged', widthBasis.svg, 'pass');
  assert.equal(positiveWidth.pdf.passed, true);
  const widths = JSON.parse(await readFile(path.join(widthFolder, 'reference-metrics.json'))).paths;
  const nativeSvg = edgeSvgPaints(await readFile(path.join(widthFolder, 'reference.svg')));
  const nativePdf = edgePdfPaints(await readFile(path.join(widthFolder, 'reference.pdf')));
  assert.equal(widths.length, 14); assert.equal(nativeSvg.paints.length, 14); assert.equal(nativePdf.paints.length, 14);
  for (let index = 0; index < widths.length; index++) {
    const sp = Math.round(widths[index].widthPt * 65536);
    assert.equal(Math.round(nativeSvg.paints[index].width * 65536), sp);
    assert.ok(Math.abs(nativePdf.paints[index].width - pgfPdfPoint(sp)) <= 1 / (2 * 65536), 'Native PDF width differs: ' + index);
  }
  for (const [name, svg] of [
    ['translation-quarter', transformed(widthBasis.svg, 'translate(.25 .25)')],
    ['translation-half', transformed(widthBasis.svg, 'translate(.5 .5)')],
    ['doubled-strokes', widthBasis.svg.replace(/stroke-width="([^"]+)"/g, (_, value) => `stroke-width="${Number(value) * 2}"`)],
    ['missing-thin-boundary', widthBasis.svg.replace(/<path\b[^>]*id="candidate-p0"[^>]*\/>/, '')],
    ['missing-thin-interior', widthBasis.svg.replace(/<path\b[^>]*id="candidate-p9"[^>]*\/>/, '')]
  ]) {
    assert.notEqual(svg, widthBasis.svg, 'Width control did not change its operand.');
    const report = await widthCheck(name, svg, 'mismatch');
    assert.equal(report.primary.passed, false, name + ': primary failed to detect the defect.');
    assert.equal(report.pdf.passed, false, name + ': independent PDF failed to detect the defect.');
  }
  const differentPdf = await readFile(path.join(baseline, 'pdf-page-1x.png'));
  for (const rehash of [false, true]) {
    await check('width-' + (rehash ? 'rehashed-reference-page' : 'changed-reference-page'), widthBasis.svg,
      'harness-failure', false, 'width-presets', undefined, { ...widthBasis, mutateBundle: async folder => {
        await writeFile(path.join(folder, 'pdf-page-1x.png'), differentPdf);
        if (rehash) {
          const provenance = JSON.parse(await readFile(path.join(folder, 'provenance.json')));
          provenance.artifacts['pdf-page-1x.png'] = hash(differentPdf);
          await writeFile(path.join(folder, 'provenance.json'), JSON.stringify(provenance));
        }
      } });
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
