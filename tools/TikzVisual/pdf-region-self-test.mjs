import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer } from './compare.mjs';
import { measurePdfRegions } from './pdf-region-renderer.mjs';
import { pdfRegionVerdict } from './pdf-region-verdict.mjs';
import { verifyPdfNativeGeometry } from './pdf-native-geometry.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'artifacts/pdf-region-self-tests');
await mkdir(output, { recursive: true }); await rm(path.join(output, 'suite.json'), { force: true });
const limits = [1, 4].map(scale => ({ scale, background: 'white', maxChannelError: 0, maxMeanForegroundError: 0,
  maxEdgeDisplacementPixels: 0, maxComponentDifference: 0 }));
const region = { id: 'period', rectanglePixels: { x: 9, y: 9, width: 6, height: 6 }, limits };
const frame = content => '<svg xmlns="http://www.w3.org/2000/svg" width="32px" height="24px" viewBox="0 0 32 24">' + content + '</svg>';
const period = '<path d="M11 11H13V13H11Z" fill="black"/>';
const faint = '<path d="M11 11H13V13H11Z" fill="black" fill-opacity=".01"/>';
const opaque = '<path d="M1 1H8V23H1Z" fill="black"/>';
const renderer = await createRenderer(), results = [];
async function pages(svg, origin) {
  return renderer.page.evaluate(async ({ svg, origin }) => {
    const i = new Image(); i.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))); await i.decode();
    const output = {};
    for (const scale of [1, 4]) {
      const c = document.createElement('canvas'); c.width = 64 * scale; c.height = 48 * scale;
      const x = c.getContext('2d'); x.fillStyle = 'white'; x.fillRect(0, 0, c.width, c.height);
      x.drawImage(i, origin.x * scale, origin.y * scale, 32 * scale, 24 * scale); output[scale] = c.toDataURL('image/png');
    }
    return output;
  }, { svg, origin });
}
async function check(name, reference, actual, expected, edit = null) {
  const origin = { x: .25, y: .5 }, pdfPages = await pages(reference, origin);
  const input = { svg: actual, units: 'cssPixels', pdfPages, pdfOriginPixels: origin, regions: [region], captureIds: ['period'] };
  if (edit) edit(input);
  const measured = await measurePdfRegions(renderer.page, input);
  const verdict = pdfRegionVerdict(measured.results, [region]);
  const folder = path.join(output, name); assert.ok(folder.startsWith(output + path.sep));
  await mkdir(folder, { recursive: true });
  for (const [file, data] of Object.entries(measured.images)) await writeFile(path.join(folder, file), Buffer.from(data, 'base64'));
  const hashes = Object.fromEntries(Object.entries(measured.images).map(([f, b]) => [f, createHash('sha256').update(Buffer.from(b, 'base64')).digest('hex')]));
  await writeFile(path.join(folder, 'report.json'), JSON.stringify(verdict, null, 2) + '\n');
  assert.equal(verdict.passed, expected, name);
  results.push({ name, passed: true, expected, imageHashes: hashes }); return { verdict, hashes };
}
try {
  const a = await check('fractional-origin-native-crop', frame(period), frame(period), true);
  const b = await check('repeat', frame(period), frame(period), true); assert.deepEqual(a.hashes, b.hashes);
  await check('missing-period', frame(period), frame(''), false);
  await check('missing-faint-period-with-opaque-ink', frame(opaque + faint), frame(opaque), false);
  await check('extra-period', frame(''), frame(period), false);
  await check('quarter-pixel-shift', frame(period), frame('<g transform="translate(.25 .25)">' + period + '</g>'), false);
  await check('wrong-opacity', frame(period), frame(faint), false);
  await check('wrong-page-registration', frame(period), frame(period), false, input => { input.pdfOriginPixels.x += .25; });
  const invisible = await check('white-on-white-unobservable', frame('<path d="M11 11H13V13H11Z" fill="white"/>'), frame(''), true);
  assert.ok(invisible.verdict.checks.every(c => c.foregroundPixels === 0));
  const clip = '<defs><clipPath id="clip"><path d="M11 11H12V13H11Z"/></clipPath></defs><g clip-path="url(#clip)">' + period + '</g>';
  await check('unchanged-clip', frame(clip), frame(clip), true);
  await check('removed-clip', frame(clip), frame(period), false);
  const input = { svg: frame(period), units: 'cssPixels', pdfPages: await pages(frame(period), { x: .25, y: .5 }),
    pdfOriginPixels: { x: .25, y: .5 }, regions: [region] };
  for (const [name, edit] of [
    ['invalid-region', value => { value.regions[0].rectanglePixels.width = -1; }],
    ['duplicate-region', value => { value.regions.push(value.regions[0]); }],
    ['huge-page-position', value => { value.pdfOriginPixels.x = 1e30; }],
    ['missing-PDF-scale', value => { delete value.pdfPages[4]; }],
    ['external-SVG-reference', value => { value.svg = frame('<use href="https://invalid.example/image.svg#p"/>'); }]
  ]) {
    const copy = structuredClone(input); edit(copy); await assert.rejects(() => measurePdfRegions(renderer.page, copy));
    results.push({ name, passed: true, category: 'input rejection' });
  }
  assert.throws(() => pdfRegionVerdict(a.verdict.checks.slice(1), [region]));
  results.push({ name: 'missing-measurement-coverage', passed: true });
  const record = 'LOKAD-PATH-BEGIN actions=draw; width=0.4pt\nLOKAD-SOFTPATH macro:->\\pgfsyssoftpath@movetotoken{1.0pt}{2.0pt}\nLOKAD-PATH-END\n'
    + 'LOKAD-BOUNDS minx=0pt; miny=0pt; maxx=10pt; maxy=10pt\nLOKAD-BOX width=10pt; height=10pt; depth=0pt\n'
    + 'LOKAD-ANCHOR-start x=1pt; y=2pt\nLOKAD-ANCHOR-end x=3pt; y=4pt\n';
  const combined = record + '\n--- Ordinary PDF oracle ---\n' + record;
  assert.equal(verifyPdfNativeGeometry(combined).pathRecords, 1);
  results.push({ name: 'native-SVG-PDF-geometry', passed: true });
  for (const [name, pdf] of [
    ['changed-native-path', record.replace('{2.0pt}', '{2.1pt}')],
    ['changed-native-anchor', record.replace('x=3pt', 'x=3.1pt')],
    ['missing-native-record', record.replace(/LOKAD-BOX.*\n/, '')],
    ['duplicate-native-record', record + 'LOKAD-BOX width=10pt; height=10pt; depth=0pt\n']
  ]) {
    assert.throws(() => verifyPdfNativeGeometry(record + '\n--- Ordinary PDF oracle ---\n' + pdf));
    results.push({ name, passed: true, category: 'native geometry rejection' });
  }
  await writeFile(path.join(output, 'suite.json'), JSON.stringify({ schemaVersion: 1, completed: true, passed: true,
    scope: 'Synthetic native PDF crop/registration/local-metric and native-log checks; no TikZ fidelity claim', renderer: renderer.identity, results }, null, 2) + '\n');
  console.log(results.length + ' PDF region/registration checks passed.');
} finally { await renderer.browser.close(); }
