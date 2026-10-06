// Oracle-only numeric/raster investigation. No candidate and no image policy.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRenderer } from './compare.mjs';
import { root, sha256, writeArtifact, outputPath } from './shape-oracle-bundle.mjs';
import { installShapeMetrics } from './shape-image-pair.mjs';
import { measureShapePdfPair } from './shape-pdf-image-pair.mjs';
import { shapePdfRasterRectangle } from './shape-pdf-camera.mjs';
import { parseDashPdf, pgfPdfPoint, dashIntervals } from './dash-pdf-vector.mjs';

const base = path.join(root, 'artifacts/dash-pdf-vector'), output = path.join(base, 'run-' + randomUUID()), artifacts = {};
const folder = path.join(root, 'tests/Reference/Dashes/native');
const validator = 'tools/TikzDashReference/bin/Release/net10.0/TikzDashReference.dll';
const toolFiles = ['inspect-dash-pdf.mjs', 'dash-pdf-vector.mjs', 'compare.mjs', 'browser-profile.json', 'package.json', 'package-lock.json',
  'shape-oracle-bundle.mjs', 'shape-image-pair.mjs', 'shape-raster-metrics.mjs', 'shape-pdf-camera.mjs', 'shape-pdf-image-pair.mjs'].map(f => 'tools/TikzVisual/' + f);
const save = (file, bytes) => writeArtifact(output, file, bytes, artifacts);
let toolHashes = {}, validatorAssemblySha256 = null, phase = 'independent-inputs';
async function publish(report) {
  await writeArtifact(output, 'report.json', JSON.stringify(report, null, 2) + '\n');
  await writeArtifact(base, 'latest.json', JSON.stringify({ completed: report.completed,
    report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'),
    sha256: sha256(await readFile(path.join(output, 'report.json'))), converterInvoked: false, approvedImagePolicy: false }, null, 2) + '\n');
}
async function main() {
  assert.equal(process.argv.length, 2, 'Fixed fixture only.'); await outputPath(output);
  for (const file of toolFiles) { const bytes = await readFile(path.join(root, file)); toolHashes[file] = sha256(bytes); await save('tool-sources/' + file, bytes); }
  await publish({ completed: false, verdict: 'in-progress', phase, converterInvoked: false, approvedImagePolicy: false, toolHashes });
  console.log('Fresh independent dash PDF investigation: ' + path.relative(root, output).split(path.sep).join('/'));
  validatorAssemblySha256 = sha256(await readFile(path.join(root, validator)));
  await save('cached-validation.txt', execFileSync('dotnet', [path.join(root, validator), 'check-cached'],
    { cwd: root, windowsHide: true, timeout: 30000, maxBuffer: 100000 }));
  const snapshotBytes = await readFile(path.join(root, 'tests/Reference/Dashes/snapshot.json')), snapshot = JSON.parse(snapshotBytes);
  const metricsBytes = await readFile(path.join(folder, 'metrics.json')), metrics = JSON.parse(metricsBytes);
  const pdfBytes = await readFile(path.join(folder, 'reference.pdf')), reference = await readFile(path.join(folder, 'reference.svg'), 'utf8');
  const parsed = parseDashPdf(pdfBytes), checks = [], spToCss = 96 / (72.27 * 65536);
  assert.equal(metrics.converterInvoked, false); assert.deepEqual(metrics.svg.records, metrics.pdf.records);
  assert.match(snapshot.inputs['pgfsys.code.tex'], /^[a-f0-9]{64}$/);
  async function verify() {
    assert.equal(sha256(await readFile(path.join(root, validator))), validatorAssemblySha256);
    assert.equal(sha256(await readFile(path.join(root, 'tests/Reference/Dashes/snapshot.json'))), sha256(snapshotBytes));
    for (const [file, h] of Object.entries(snapshot.artifacts)) assert.equal(sha256(await readFile(path.join(folder, file))), h, file);
    for (const [file, h] of Object.entries({ ...snapshot.sourceHashes, ...toolHashes })) assert.equal(sha256(await readFile(path.join(root, file))), h, file);
  }
  await verify();
  const renderer = await createRenderer();
  try {
    await installShapeMetrics(renderer);
    const lines = await renderer.page.evaluate(reference => {
      const doc = new DOMParser().parseFromString(reference, 'image/svg+xml'), paths = [...doc.querySelectorAll('path')];
      if (doc.querySelector('parsererror') || paths.length !== 40) throw new Error('Incomplete fixed SVG.');
      const attr = (p, k, fallback) => { for (let e = p; e; e = e.parentElement) if (e.hasAttribute(k)) return e.getAttribute(k); return fallback; };
      return paths.map(p => {
        const m = /^M([+-]?(?:\d+(?:\.\d*)?|\.\d+))[ ,]*([+-]?(?:\d+(?:\.\d*)?|\.\d+))H([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/.exec(p.getAttribute('d'));
        if (!m) throw new Error('Unexpected fixed SVG line.');
        const dash = attr(p, 'stroke-dasharray', 'none');
        return { start: { x: Number(m[1]), y: Number(m[2]) }, end: { x: Number(m[3]), y: Number(m[2]) },
          width: Number(attr(p, 'stroke-width', '1')), dash: dash === 'none' ? [] : dash.split(/[ ,]+/).map(Number),
          phase: Number(attr(p, 'stroke-dashoffset', '0')), cap: attr(p, 'stroke-linecap', 'butt') };
      });
    }, reference);
    function scalar(id, quantity, expected, observed, tolerance, unit = 'bp') {
      const error = Math.abs(expected - observed);
      checks.push({ id, quantity, expected, observed, unit, tolerance, error, passed: Number.isFinite(error) && error <= tolerance });
    }
    function dimension(id, quantity, sourceSp, printedBp) {
      const convertedBp = pgfPdfPoint(sourceSp);
      // TeX's shortest decimal round-trips to the integer dimension; it does
      // not necessarily round to the nearest fifth decimal place.
      scalar(id, quantity, convertedBp * 65536, Math.round(printedBp * 65536), 0, 'sp');
      Object.assign(checks.at(-1), { sourceSp, convertedBp, printedBp });
    }
    const intervals = [];
    for (let i = 0; i < 40; i++) {
      const native = metrics.pdf.records[i], record = parsed.records[i], driver = lines[i], id = native.id;
      scalar(id, 'dash.count', native.lengthsSp.length, record.dash.length, 0, 'integer');
      dimension(id, 'width', native.widthSp, record.width);
      dimension(id, 'phase', native.phaseSp, record.phase);
      for (let j = 0; j < native.lengthsSp.length; j++) dimension(id, 'dash.' + j, native.lengthsSp[j], record.dash[j]);
      scalar(id, 'cap', { butt: 0, round: 1, square: 2 }[driver.cap], record.cap, 0, 'integer');
      for (const end of ['start', 'end']) for (const axis of ['x', 'y']) {
        const sp = Math.round(driver[end][axis] * 65536); assert.ok(Math.abs(sp / 65536 - driver[end][axis]) < 1e-10);
        dimension(id, end + '.' + axis, sp, record[end][axis]);
      }
      const nativeIntervals = dashIntervals(Math.round((driver.end.x - driver.start.x) * 65536), native.lengthsSp, native.phaseSp);
      const driverIntervals = dashIntervals(Math.round((driver.end.x - driver.start.x) * 100000), driver.dash.map(n => Math.round(n * 100000)), Math.round(driver.phase * 100000));
      const pdfIntervals = dashIntervals(Math.round((record.end.x - record.start.x) * 100000), record.dash.map(n => Math.round(n * 100000)), Math.round(record.phase * 100000));
      const exportIntervals = (values, cssPerUnit) => values.map(v => ({ startCss: v.start * cssPerUnit, endCss: v.end * cssPerUnit, lengthCss: (v.end - v.start) * cssPerUnit }));
      intervals.push({ id, cap: driver.cap, native: exportIntervals(nativeIntervals, spToCss),
        originalSvg: exportIntervals(driverIntervals, 96 / (72.27 * 100000)), pdf: exportIntervals(pdfIntervals, 4 / (3 * 100000)) });
    }
    const page = metrics.pdf.page;
    scalar('page', 'width', page.width * 72 / (72.27 * 65536), parsed.mediaBox[2], .000500000001);
    scalar('page', 'height', page.height * 72 / (72.27 * 65536), parsed.mediaBox[3], .000500000001);
    const printedOriginCss = { x: parsed.origin.x * 4 / 3, y: (parsed.mediaBox[3] - parsed.origin.y) * 4 / 3 };
    scalar('page', 'origin.x', metrics.pdfOriginCss.x * 3 / 4, parsed.origin.x, .000500000001);
    scalar('page', 'origin.y', metrics.pdfOriginCss.y * 3 / 4, parsed.mediaBox[3] - parsed.origin.y, .001000000001);
    await save('numeric.json', JSON.stringify({ passed: checks.every(c => c.passed), checks }, null, 2) + '\n');
    await save('dash-intervals.json', JSON.stringify(intervals, null, 2) + '\n');
    await save('original-pdf-content.txt', parsed.content);
    await save('reference.pdf', pdfBytes); await save('reference.svg', reference);
    await save('reference-snapshot.json', snapshotBytes); await save('native-metrics.json', metricsBytes);
    assert.ok(checks.every(c => c.passed), 'PDF instructions do not match native finite conversion.');
    const b = metrics.pdf.bounds, picture = { minX: b.minX * spToCss, minY: -b.maxY * spToCss, maxX: b.maxX * spToCss, maxY: -b.minY * spToCss };
    const whole = { x: Math.floor(picture.minX - 4), y: Math.floor(picture.minY - 4), width: 0, height: 0 };
    whole.width = Math.ceil(picture.maxX + 4) - whole.x; whole.height = Math.ceil(picture.maxY + 4) - whole.y;
    const camera = { origin: metrics.pdfOriginCss, physicalPage: { width: page.width * spToCss, height: page.height * spToCss }, picture,
      rasterSizes: Object.fromEntries([1, 4].map(scale => [scale + 'x', { width: Math.ceil(page.width * spToCss * scale), height: Math.ceil(page.height * spToCss * scale) }])) };
    const regions = [{ id: 'whole-picture', rectangle: whole }, ...lines.map((line, i) => {
      const radius = Math.max(metrics.pdf.records[i].widthSp * spToCss, line.width * 96 / 72.27) / 2;
      const x = Math.floor(line.start.x * 96 / 72.27 - radius - 3), y = Math.floor(-line.start.y * 96 / 72.27 - radius - 3);
      return { id: 'path-' + i, nodeId: null, kind: 'path', rectangle: { x, y, width: Math.ceil(line.end.x * 96 / 72.27 + radius + 3) - x,
        height: Math.ceil(-line.start.y * 96 / 72.27 + radius + 3) - y } };
    })].map(r => ({ ...r, rasterRectangles: Object.fromEntries([1, 4].map(scale => [scale + 'x', shapePdfRasterRectangle(r.rectangle, camera, scale)])) }));
    const tx = printedOriginCss.x - camera.origin.x, ty = printedOriginCss.y - camera.origin.y;
    const body = parsed.records.map((p, i) => '<path id="pdf-p' + i + '" d="M' + p.start.x * 4 / 3 + ' ' + -p.start.y * 4 / 3 + 'H' + p.end.x * 4 / 3
      + '" fill="none" stroke="#000" stroke-width="' + p.width * 4 / 3 + '" stroke-linecap="' + ['butt', 'round', 'square'][p.cap] + '"'
      + (p.dash.length ? ' stroke-dasharray="' + p.dash.map(n => n * 4 / 3).join(' ') + '" stroke-dashoffset="' + p.phase * 4 / 3 + '"' : '') + '/>').join('');
    const width = picture.maxX - picture.minX, height = picture.maxY - picture.minY;
    const reconstructed = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + 'px" height="' + height + 'px" viewBox="'
      + [picture.minX, picture.minY, width, height].join(' ') + '"><g transform="translate(' + tx + ' ' + ty + ')">' + body + '</g></svg>';
    await save('pdf-instructions.svg', reconstructed);
    phase = 'independent-raster-observations'; const observations = [];
    for (const variant of [{ mode: 'original-svg', svg: reference, units: 'bp', origin: metrics.driverOriginBp },
      { mode: 'pdf-instructions', svg: reconstructed, units: 'cssPixels', origin: { x: 0, y: 0 } }]) {
      for (const frame of ['natural', 'expanded']) for (const scale of [1, 4]) {
        const result = await measureShapePdfPair(renderer, { svg: variant.svg, units: variant.units, svgOriginBp: variant.origin, camera, regions, frame, scale,
          pdfPage: 'data:image/png;base64,' + (await readFile(path.join(folder, 'pdf-page-' + scale + 'x.png'))).toString('base64'),
          rightLabel: variant.mode, cropLimit: 4, cropRegionIds: ['path-2', 'path-5'] });
        assert.ok(result.repeat.pdf.exactRgbaMatch && result.repeat.svg.exactRgbaMatch); assert.equal(result.outsideWholeChangedPixels, 0);
        const prefix = variant.mode + '/' + frame + '-' + scale + 'x', links = {}, crops = new Map();
        for (const [kind, png] of Object.entries(result.images)) { links[kind] = prefix + '-' + kind + '.png'; await save(links[kind], Buffer.from(png, 'base64')); }
        for (const crop of result.crops) { const links = {}; for (const [kind, png] of Object.entries(crop.images)) {
          links[kind] = prefix + '-' + crop.id + '-' + kind + '.png'; await save(links[kind], Buffer.from(png, 'base64'));
        } crops.set(crop.id, links); }
        observations.push({ mode: variant.mode, ...result, images: undefined, crops: undefined, artifacts: links,
          regions: result.regions.map(r => ({ ...r, crops: crops.get(r.id) ?? null })) });
      }
    }
    await verify(); for (const [file, h] of Object.entries(artifacts)) assert.equal(sha256(await readFile(await outputPath(output, file))), h);
    await save('index.html', '<!doctype html><meta charset="utf-8"><title>Independent dash PDF investigation</title><h1>Raw evidence; no image policy</h1>'
      + '<p><a href="report.json">Report</a> · <a href="numeric.json">Native/PDF instructions</a> · <a href="dash-intervals.json">Exact dash intervals</a></p>'
      + observations.flatMap(o => o.regions.filter(r => r.crops?.sheet).map(r => '<h2>' + o.mode + ' / ' + o.frame + ' / ' + o.scale + 'x / ' + r.id
        + '</h2><img src="' + r.crops.sheet + '">')).join(''));
    await publish({ schemaVersion: 1, comparisonKind: 'oracle-only-dash-PDF-vector-and-raster', completed: true, verdict: 'observations-complete',
      overallVerdict: 'pending', converterInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false,
      referenceSnapshotSha256: sha256(snapshotBytes), validatorAssemblySha256, toolHashes, renderer: renderer.identity,
      finiteConversion: { coefficientSp: 65292, denominator: 65536, literal: '0.99627', inputSourceSha256: snapshot.inputs['pgfsys.code.tex'],
        source: 'https://github.com/pgf-tikz/pgf/blob/839974a3f895bfb86f5a8bc155f0886c918f1bff/tex/generic/pgf/systemlayer/pgfsys.code.tex#L34' },
      numeric: { passed: true, executedChecks: checks.length, evidence: 'numeric.json' }, intervals: 'dash-intervals.json',
      printedOriginCss, nativeOriginCss: camera.origin, camera, regions, observations, artifacts,
      agent: { viewer: 'index.html', focusedRerun: 'node tools/TikzVisual/inspect-dash-pdf.mjs' },
      remaining: ['Rasterizer treatment of subpixel terminal fragments and thin dashes.', 'Independent PDF policy and image-only defects.', 'Broader dash interactions.'] });
    console.log('Independent PDF instructions: ' + checks.length + ' numeric checks pass; eight raw raster observations retained; admission pending.');
  } finally { await renderer.browser.close(); }
}
try { await main(); } catch (error) {
  await publish({ completed: false, verdict: 'infrastructure-error', converterInvoked: false, approvedImagePolicy: false, phase, toolHashes,
    error: error.message, artifacts }); console.error(error.stack); process.exitCode = 2;
}
