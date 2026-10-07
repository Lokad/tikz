// Synthetic comparator and saved-sample controls, not new native fixtures.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root, writeArtifact} from './shape-oracle-bundle.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {shapePdfRasterRectangle} from './shape-pdf-camera.mjs';
import {evaluateShapePdfTrial} from './shape-pdf-trial-policy.mjs';
import {edgePdfViews, deriveEdgePdfPolicy, evaluateEdgePdfPolicy} from './curved-edge-pdf-policy.mjs';
import {measureEdgePdfInk, attachEdgePdfInk} from './edge-pdf-ink.mjs';
import {verifyPdfSavedCrops} from './curved-edge-pdf-crops.mjs';
import {deriveVisibilityInk, evaluateVisibilityInk, edgePdfDefects, edgePdfVisibility} from './curved-edge-pdf-visibility.mjs';
import {edgePdfSources} from './curved-edge-pdf-sources.mjs';
import {edgePdfSourceFrame} from './curved-edge-pdf-registration.mjs';
import {measureEdgePdfPair} from './edge-pdf-image-pair.mjs';
import {edgePdfViewportChanges, edgePdfViewportSvg, measureEdgePdfViewport} from './curved-edge-pdf-viewport.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

const camera = {origin: {x: 0, y: 0}, rasterSizes: {'1x': {width: 16, height: 16}, '4x': {width: 64, height: 64}}};
const regions = [{id: 'whole-picture', kind: 'picture', rectangle: {x: 0, y: 0, width: 16, height: 16}},
  {id: 'period', kind: 'glyph', rectangle: {x: 11, y: 1, width: 3, height: 3}}].map(r => ({...r,
  rasterRectangles: Object.fromEntries([1, 4].map(scale => [scale + 'x', shapePdfRasterRectangle(r.rectangle, camera, scale)]))}));
const compare = createShapeRasterMetrics().compare, controls = [];
function image(scale, faint) {
  const width = 16 * scale, b = new Uint8ClampedArray(width * width * 4).fill(255);
  if (faint) for (let y = 2 * scale; y < 3 * scale; y++) for (let x = 12 * scale; x < 13 * scale; x++)
    b.fill(254, 4 * (y * width + x), 4 * (y * width + x) + 3);
  return b;
}
function sums(b, size, rectangle) {
  const c = [0, 0, 0]; for (let y = rectangle.y; y < rectangle.y + rectangle.height; y++) for (let x = rectangle.x; x < rectangle.x + rectangle.width; x++)
    for (let k = 0; k < 3; k++) c[k] += 255 - b[4 * (y * size.width + x) + k]; return c;
}
function row(view, faint = true) {
  const size = camera.rasterSizes[view.scale + 'x'], reference = image(view.scale, false), actual = image(view.scale, faint);
  const measured = regions.map(r => ({...r, ...compare(reference, actual, {...size, scale: view.scale, background: 'white', rectangle: r.rasterRectangles[view.scale + 'x']}),
    inkCoverage: {id: r.id, reference: sums(reference, size, r.rasterRectangles[view.scale + 'x']), actual: sums(actual, size, r.rasterRectangles[view.scale + 'x'])}}));
  return {id: 'synthetic/' + view.frame, converterInvoked: false, mode: 'synthetic', ...view, pageSize: size, outsideWholeChangedPixels: 0,
    repeat: {pdf: {exactRgbaMatch: true, rawChangedPixels: 0, maxRawChannelError: 0}, svg: {exactRgbaMatch: true, rawChangedPixels: 0, maxRawChannelError: 0}}, whole: measured[0], regions: measured.slice(1)};
}
const baseline = edgePdfViews.map(v => row(v)), policy = deriveEdgePdfPolicy(baseline, camera, regions, 'synthetic');
function check(name, action) { action(); controls.push({name, passed: true}); }
check('calibration source closure is unique and ordered', () => assert.deepEqual(edgePdfSources, [...new Set(edgePdfSources)].sort()));
check('unchanged independent samples pass without admission', () => { for (const r of baseline) assert.equal(evaluateEdgePdfPolicy(policy, r).passed, true); assert.equal(policy.approvedImagePolicy, false); });
check('subthreshold ink loss that improves PDF error still fails its region', () => {
  for (const view of edgePdfViews) { const missing = row(view, false); assert.equal(evaluateShapePdfTrial(policy, view, missing).passed, true);
    const e = evaluateEdgePdfPolicy(policy, missing); assert.equal(e.passed, false); assert.ok(e.checks.find(c => c.id === 'period').metrics.some(m => m.quantity.startsWith('nativeInkCoverage-') && !m.passed)); }
});
check('view ids do not replace native check ids or duplicate evidence', () => { const e = evaluateEdgePdfPolicy(policy, baseline[0]); assert.deepEqual(e.checks.map(c => c.id), ['whole-picture', 'period', 'outside-whole-picture', 'unchanged-pdf-repeat', 'unchanged-svg-repeat']); assert.ok(e.checks.every(c => !('whole' in c))); });
for (const [name, mutation] of [
  ['candidate calibration', a => a[0].converterInvoked = true], ['missing view', a => a.pop()], ['duplicate view', a => a[1] = a[0]],
  ['wrong mode', a => a[0].mode = 'candidate'], ['changed crop', a => a[0].regions[0].rasterRectangles['1x'].x++],
  ['missing region', a => a[0].regions.pop()], ['changed page', a => a[0].pageSize.width++], ['failed repeat', a => a[0].repeat.svg.rawChangedPixels = 1],
  ['outside picture ink', a => a[0].outsideWholeChangedPixels = 1], ['negative ink', a => a[0].regions[0].inkCoverage.actual[0] = -1],
  ['fractional ink', a => a[0].regions[0].inkCoverage.actual[0] = .5], ['oversized ink', a => a[0].regions[0].inkCoverage.actual[0] = 1000000],
  ['wrong ink identity', a => a[0].regions[0].inkCoverage.id = 'other']
]) check('reject ' + name, () => { const a = structuredClone(baseline); mutation(a); assert.throws(() => deriveEdgePdfPolicy(a, camera, regions, 'synthetic')); });
check('changed reference ink cannot pass', () => { const r = structuredClone(baseline[0]); r.regions[0].inkCoverage.reference[0]++; assert.throws(() => evaluateEdgePdfPolicy(policy, r)); });
check('ink attachment requires exact native coverage', () => assert.throws(() => attachEdgePdfInk(baseline[0], [baseline[0].regions[0].inkCoverage, baseline[0].whole.inkCoverage])));
check('reject another family contract', () => { const p = structuredClone(policy); p.calibrationFamily = 'straight'; assert.throws(() => evaluateEdgePdfPolicy(p, baseline[0])); });
check('faint SVG ink policy catches loss without relying on PDF errors', () => {
  const p = deriveVisibilityInk(baseline); assert.equal(evaluateVisibilityInk(p, baseline[0]).passed, true);
  assert.equal(evaluateVisibilityInk(p, row(edgePdfViews[0], false)).checks.find(c => c.id === 'period').passed, false);
});
check('visibility ink requires complete independent views', () => {
  assert.throws(() => deriveVisibilityInk(baseline.slice(1)));
  const bad = structuredClone(baseline); bad[0].converterInvoked = true; assert.throws(() => deriveVisibilityInk(bad));
});
check('reject malformed faint ink sums', () => {
  const bad = structuredClone(baseline); bad[0].regions[0].inkCoverage.actual[0] = -1;
  assert.throws(() => deriveVisibilityInk(bad));
});
check('PDF visibility does not inherit primary black-background declarations', () => {
  assert.equal(edgePdfDefects.length, 18); assert.equal(edgePdfVisibility.length, 3);
  assert.ok([...edgePdfDefects, ...edgePdfVisibility].every(d => !('invisibleBackgrounds' in d)));
  assert.deepEqual(edgePdfDefects.find(d => d.name === 'disabled-rectangle-clip').invisibleViews, ['natural-1x-white', 'natural-4x-white']);
  assert.deepEqual(edgePdfVisibility.find(d => d.name === 'faint-curved-stroke-loss').invisibleViews, []);
});
let renderer;
try {
  renderer = await createRenderer(); await installShapeMetrics(renderer);
  for (const scale of [1, 4]) {
    const size = camera.rasterSizes[scale + 'x'], bytes = [image(scale, false), image(scale, true)];
    const pngs = await renderer.page.evaluate(({size, bytes}) => bytes.map(b => { const c = document.createElement('canvas'); c.width = size.width; c.height = size.height;
      c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(b), size.width, size.height), 0, 0); return c.toDataURL('image/png').split(',')[1]; }), {size, bytes: bytes.map(b => [...b])});
    const images = pngs.map(p => Buffer.from(p, 'base64'));
    const ink = await measureEdgePdfInk(renderer, images, size, regions, scale);
    check('saved opaque PNG ink agrees at ' + scale + 'x', () => assert.deepEqual(ink, [row({frame: 'expanded', scale, background: 'white'}).whole.inkCoverage, row({frame: 'expanded', scale, background: 'white'}).regions[0].inkCoverage]));
    await assert.rejects(() => measureEdgePdfInk(renderer, images, {...size, width: size.width + 1}, regions, scale)); controls.push({name: 'reject changed saved page at ' + scale + 'x', passed: true});
    const bad = structuredClone(regions); bad[1].rasterRectangles[scale + 'x'].x = size.width;
    await assert.rejects(() => measureEdgePdfInk(renderer, images, size, bad, scale)); controls.push({name: 'reject escaping saved crop at ' + scale + 'x', passed: true});
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 16 16"><path d="M2 8C4 2 12 14 14 8" fill="none" stroke="black" stroke-width=".4"/></svg>';
    const c = {camera, regions, frame: {origin: {x: 0, y: 0}}};
    const base = await measureEdgePdfPair(renderer, {svg, pdfPage: 'data:image/png;base64,' + pngs[0], camera, regions, scale, frame: 'expanded', units: 'cssPixels', svgOriginBp: {x: 0, y: 0}, cropLimit: 0});
    const page = Buffer.from(base.images['svg-page'], 'base64');
    const saved = new Map(Object.entries(base.images).map(([k, b]) => [k, Buffer.from(b, 'base64')]));
    const proof = {...base, images: Object.fromEntries(Object.keys(base.images).map(k => [k, k]))};
    const count = await verifyPdfSavedCrops(renderer, [images[0], page], proof, p => saved.get(p));
    check('presentation samples match full pages at ' + scale + 'x', () => assert.equal(count, 5));
    const substitute = new Map(saved); substitute.set('pdf', saved.get('svg'));
    await assert.rejects(() => verifyPdfSavedCrops(renderer, [images[0], page], proof, p => substitute.get(p)));
    controls.push({name: 'reject substituted presentation pixels at ' + scale + 'x', passed: true});
    for (const change of edgePdfViewportChanges) {
      const input = await edgePdfViewportSvg(renderer, svg, c, 'native-semantic', change);
      const measured = await measureEdgePdfViewport(renderer, c, 'native-semantic', input, page, scale);
      check('synthetic viewport ' + change.name + ' at ' + scale + 'x', () => { assert.equal(measured.fullPage.exactRgbaMatch, true); assert.equal(measured.regionsExact, true); });
    }
    const cropped = svg.replace('width="16px"', 'width="1px"').replace('viewBox="0 0 16 16"', 'viewBox="0 0 1 16"');
    const loss = await measureEdgePdfPair(renderer, {svg: cropped, pdfPage: 'data:image/png;base64,' + page.toString('base64'), camera, regions, scale, frame: 'natural', units: 'cssPixels', svgOriginBp: {x: 0, y: 0}, capture: false});
    check('natural root crop remains effective at ' + scale + 'x', () => { assert.equal(loss.fullPage.exactRgbaMatch, false); assert.ok(loss.fullPage.rawChangedPixels > 0); });
  }
  const registered = '<svg xmlns="http://www.w3.org/2000/svg" width="16px" height="12px" viewBox="3 6 12 9"/>';
  const physical = await edgePdfSourceFrame(renderer, registered, 'original-driver', {x: 1, y: 2});
  check('bp source frame retains physical origin', () => { assert.ok(Math.abs(physical.x - 8 / 3) < 1e-14 && Math.abs(physical.y - 16 / 3) < 1e-14); assert.deepEqual([physical.width, physical.height], [16, 12]); });
  await assert.rejects(() => edgePdfSourceFrame(renderer, registered, 'native-semantic', {x: 0, y: 0})); controls.push({name: 'reject CSS/bp frame disagreement', passed: true});
  const output = path.join(root, 'artifacts/curved-edge-pdf-controls', 'run-' + randomUUID());
  await writeArtifact(output, 'report.json', JSON.stringify({schemaVersion: 1, completed: true, converterInvoked: false, approvedImagePolicy: false,
    imageConformanceClaim: false, scope: 'Synthetic bitmap policy and integer ink decoder controls only.', controls}, null, 2) + '\n');
  console.log('Curved PDF controls: ' + controls.length + ' passed.');
} finally { await renderer?.browser.close(); }
