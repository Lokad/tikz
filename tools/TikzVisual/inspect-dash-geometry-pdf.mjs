// Independent ordinary-PDF investigation. No converter or image allowance.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { root, sha256, writeArtifact } from './shape-oracle-bundle.mjs';
import { createRenderer } from './compare.mjs';
import { readDashGeometryNative, verifyDashAssets } from './dash-geometry-primary-common.mjs';
import { reconstructDashGeometryPrimary } from './dash-geometry-primary-reconstruction.mjs';
import { installShapeMetrics } from './dash-geometry-image-pair.mjs';
import { shapePdfRasterRectangle } from './shape-pdf-camera.mjs';
import { measureShapePdfPair } from './shape-pdf-image-pair.mjs';
import { parseDashGeometryPdf, verifyDashGeometryPdf, reconstructDashGeometryPdf } from './dash-geometry-pdf-vector.mjs';
import { verifyDashGeometryPdfViewports } from './dash-geometry-pdf-viewport.mjs';

const base = path.join(root, 'artifacts/dash-geometry-pdf'), output = path.join(base, 'run-' + randomUUID()), artifacts = {};
const folder = path.join(root, 'tests/Reference/DashGeometry/native');
const files = ['inspect-dash-geometry-pdf.mjs', 'dash-geometry-pdf-vector.mjs', 'dash-geometry-pdf-viewport.mjs', 'dash-pdf-vector.mjs',
  'dash-geometry-primary-common.mjs', 'dash-geometry-primary-reconstruction.mjs', 'dash-geometry-image-pair.mjs',
  'shape-oracle-bundle.mjs', 'shape-primary-trial-policy.mjs', 'shape-raster-metrics.mjs', 'shape-pdf-camera.mjs', 'shape-pdf-image-pair.mjs',
  'compare.mjs', 'browser-profile.json', 'package.json', 'package-lock.json'].map(p => 'tools/TikzVisual/' + p);
const save = (p, bytes) => writeArtifact(output, p, bytes, artifacts);
let phase = 'native-inputs', toolHashes = {};
async function publish(report) {
  await writeArtifact(output, 'report.json', JSON.stringify(report, null, 2) + '\n');
  await writeArtifact(base, 'latest.json', JSON.stringify({ completed: report.completed, report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'),
    sha256: sha256(await readFile(path.join(output, 'report.json'))), converterInvoked: false, approvedImagePolicy: false }, null, 2) + '\n');
}
async function main() {
  assert.equal(process.argv.length, 2);
  for (const p of files) { const bytes = await readFile(path.join(root, p)); toolHashes[p] = sha256(bytes); await save('tool-sources/' + p, bytes); }
  await publish({ completed: false, phase, converterInvoked: false, approvedImagePolicy: false, toolHashes });
  console.log('Fresh ordinary PDF geometry investigation: ' + path.relative(root, output));
  const validation = spawnSync('dotnet', ['run', '--project', 'tools/TikzDashGeometryReference', '-c', 'Release', '--no-restore', '--', 'check-cached'],
    { cwd: root, windowsHide: true, timeout: 180000, maxBuffer: 100000 });
  await save('cached-validation.txt', Buffer.concat([validation.stdout ?? Buffer.alloc(0), validation.stderr ?? Buffer.alloc(0)])); assert.equal(validation.status, 0);
  const native = await readDashGeometryNative(), pdfBytes = await readFile(path.join(folder, 'reference.pdf'));
  const parsed = parseDashGeometryPdf(pdfBytes);
  await save('reference.pdf', pdfBytes); await save('reference.svg', native.referenceBytes);
  await save('native-metrics.json', native.metricsBytes); await save('native-snapshot.json', native.snapshotBytes);
  await save('pdf-content.txt', parsed.content); await save('pdf-records.json', JSON.stringify(parsed, null, 2) + '\n');
  const renderer = await createRenderer();
  try {
    await installShapeMetrics(renderer); const reconstruction = await reconstructDashGeometryPrimary(renderer, native);
    const numeric = verifyDashGeometryPdf(parsed, native, reconstruction.styles); await save('pdf-numeric.json', JSON.stringify(numeric, null, 2) + '\n');
    assert.equal(numeric.passed, true, 'PDF instructions differ from native finite conversion.');
    const spToCss = 96 / (72.27 * 65536), { page, bounds: b, box } = native.metrics.pdf;
    assert.equal(box.depth, 0); assert.equal(box.width, b.maxX - b.minX); assert.equal(box.height, b.maxY - b.minY);
    const origin = { x: (page.x - b.minX) * spToCss, y: (page.height - page.baselineY + b.minY + box.depth) * spToCss };
    assert.deepEqual(origin, native.metrics.pdfOriginCss);
    const picture = { minX: b.minX * spToCss, minY: -b.maxY * spToCss, maxX: b.maxX * spToCss, maxY: -b.minY * spToCss };
    const camera = { origin, picture, physicalPage: { width: page.width * spToCss, height: page.height * spToCss },
      rasterSizes: Object.fromEntries([1, 4].map(scale => [scale + 'x', { width: Math.ceil(page.width * spToCss * scale), height: Math.ceil(page.height * spToCss * scale) }])) };
    const regions = [{ id: 'whole-picture', nodeId: null, kind: 'picture', rectangle: reconstruction.camera },
      ...reconstruction.regions.map(r => ({ ...r, rectangle: { ...r.rectangle, x: r.rectangle.x + reconstruction.camera.x, y: r.rectangle.y + reconstruction.camera.y } }))]
      .map(r => ({ ...r, rasterRectangles: Object.fromEntries([1, 4].map(scale => [scale + 'x', shapePdfRasterRectangle(r.rectangle, camera, scale)])) }));
    const instructions = reconstructDashGeometryPdf(parsed, picture, origin);
    const variants = [{ mode: 'original-svg', svg: native.reference, units: 'bp', origin: native.metrics.driverOriginBp },
      ...reconstruction.representations.map(r => ({ mode: r.name, svg: r.svg, units: 'cssPixels', origin: { x: 0, y: 0 } })),
      { mode: 'pdf-instructions', svg: instructions.svg, units: 'cssPixels', origin: { x: 0, y: 0 } }];
    assert.equal(variants.length, 10); for (const v of variants) await save(v.mode + '.svg', v.svg);
    const pdfPages = {};
    for (const scale of [1, 4]) { const bytes = await readFile(path.join(folder, 'pdf-page-' + scale + 'x.png'));
      await save('pdf-page-' + scale + 'x.png', bytes); pdfPages[scale] = 'data:image/png;base64,' + bytes.toString('base64'); }
    phase = 'page-viewport-controls';
    const viewport = await verifyDashGeometryPdfViewports(renderer, { variants, camera, regions, pdfPages }, save);
    await save('viewport-controls.json', JSON.stringify(viewport, null, 2) + '\n'); assert.equal(viewport.passed, true);
    phase = 'independent-raster-observations'; const observations = [];
    for (const variant of variants) for (const frame of ['natural', 'expanded']) for (const scale of [1, 4]) {
      const result = await measureShapePdfPair(renderer, { svg: variant.svg, units: variant.units, svgOriginBp: variant.origin,
        camera, regions, frame, scale, pdfPage: pdfPages[scale], rightLabel: variant.mode, cropLimit: 16 });
      assert.ok(result.repeat.pdf.exactRgbaMatch && result.repeat.svg.exactRgbaMatch); assert.equal(result.outsideWholeChangedPixels, 0);
      const prefix = variant.mode + '/' + frame + '-' + scale + 'x', links = {}, crops = new Map();
      for (const [k, png] of Object.entries(result.images)) { links[k] = prefix + '-' + k + '.png'; await save(links[k], Buffer.from(png, 'base64')); }
      for (const crop of result.crops) {
        const links = {}; for (const [k, png] of Object.entries(crop.images)) { links[k] = prefix + '-' + crop.id + '-' + k + '.png'; await save(links[k], Buffer.from(png, 'base64')); }
        crops.set(crop.id, links);
      }
      observations.push({ mode: variant.mode, svgSha256: sha256(variant.svg), units: variant.units, ...result, images: undefined, crops: undefined,
        artifacts: links, regions: result.regions.map(r => ({ ...r, crops: crops.get(r.id) ?? null })) });
      console.log(variant.mode + ' ' + frame + ' ' + scale + 'x: ' + result.whole.rawChangedPixels + ' pixels; max ' + result.whole.maxRawChannelError);
    }
    const current = await readDashGeometryNative(); assert.equal(current.snapshotSha256, native.snapshotSha256);
    for (const [p, h] of Object.entries(toolHashes)) assert.equal(sha256(await readFile(path.join(root, p))), h);
    await save('index.html', '<!doctype html><meta charset="utf-8"><h1>Independent PDF geometry observations; no image policy</h1>'
      + '<p><a href="report.json">Report</a> · <a href="pdf-numeric.json">PDF instructions</a> · <a href="viewport-controls.json">Viewport controls</a></p>'
      + observations.map(o => '<h2>' + o.mode + ' / ' + o.frame + ' / ' + o.scale + 'x</h2>'
        + o.regions.map(r => '<p>' + r.id + ' / ' + r.caseId + '</p><img style="max-width:100%" src="' + r.crops.sheet + '">').join('')).join(''));
    await verifyDashAssets(output, artifacts);
    await publish({ schemaVersion: 1, comparisonKind: 'oracle-only-dash-geometry-PDF-investigation', completed: true, verdict: 'observations-complete',
      converterInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false, overallVerdict: 'pending',
      nativeSnapshotSha256: native.snapshotSha256, toolHashes, renderer: renderer.identity, numeric: { passed: true, executedChecks: numeric.checks.length },
      camera, regions, printedOriginCss: instructions.printedOriginCss, nativeOriginCss: origin, viewport, observations, artifacts,
      agent: { viewer: 'index.html', focusedRerun: 'node tools/TikzVisual/inspect-dash-geometry-pdf.mjs' },
      remaining: ['Fixture-specific PDF image limits and image-only defect trials.', 'Immutable PDF/combined admission.', 'Label/node interactions.'] });
  } finally { await renderer.browser.close(); }
}
await main().catch(async error => { process.exitCode = 2; console.error(error.stack);
  await publish({ completed: false, verdict: 'infrastructure-error', phase, converterInvoked: false, approvedImagePolicy: false, error: error.message, toolHashes, artifacts }); });
