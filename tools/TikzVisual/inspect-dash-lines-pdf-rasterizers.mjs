// Fixed trusted oracle investigation. No converter, image policy or baseline write.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { root, sha256, writeArtifact } from './shape-oracle-bundle.mjs';
import { createRenderer } from './compare.mjs';
import { installShapeMetrics } from './dash-geometry-image-pair.mjs';
import { measureShapePdfPair } from './shape-pdf-image-pair.mjs';
import { parseDashPdf } from './dash-pdf-vector.mjs';
import { readDashLinesNative, reconstructDashLines, verifyDashLinesPdf, dashLinesPdfCamera } from './dash-lines-oracle.mjs';
import { dashLinesPdfDiagnostics, dashLinesPdfInstructionSvg } from './dash-lines-pdf-evidence.mjs';
import { verifyDashLinesPdfViewports } from './dash-lines-pdf-viewport.mjs';

const base = path.join(root, 'artifacts/dash-lines-pdf-rasterizers'), output = path.join(base, 'run-' + randomUUID());
const artifacts = {}, toolHashes = {}, tools = {}, commands = [];
const save = (p, bytes) => writeArtifact(output, p, bytes, artifacts);
let phase = 'inputs';
async function publish(report) {
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n');
  await writeArtifact(output, 'report.json', bytes);
  await writeArtifact(base, 'latest.json', JSON.stringify({ completed: report.completed,
    report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'), sha256: sha256(bytes) }, null, 2) + '\n');
}
function run(executable, args) {
  const r = spawnSync(executable, args, { cwd: root, windowsHide: true, timeout: 180000, maxBuffer: 100000 });
  assert.equal(r.error, undefined); assert.equal(r.status, 0, String(r.stderr)); return Buffer.concat([r.stdout, r.stderr]);
}
function pngSize(bytes) {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a'); assert.equal(bytes.subarray(12, 16).toString(), 'IHDR');
  const size = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  assert.ok(size.width > 0 && size.height > 0 && size.width * size.height <= 20000000); return size;
}
async function verifyAssets() {
  for (const [p, h] of Object.entries(artifacts)) assert.equal(sha256(await readFile(path.join(output, p))), h, 'Changed evidence: ' + p);
}
async function main() {
  assert.equal(process.argv.length, 2);
  const native = await readDashLinesNative();
  const sources = [...Object.keys(native.snapshot.sourceHashes), ...[
    'inspect-dash-lines-pdf-rasterizers.mjs', 'dash-lines-oracle.mjs', 'dash-lines-pdf-evidence.mjs', 'dash-lines-pdf-viewport.mjs',
    'fixed-pdf-diagnostics.mjs', 'dash-pdf-vector.mjs', 'compare.mjs', 'dash-geometry-image-pair.mjs', 'shape-raster-metrics.mjs',
    'shape-oracle-bundle.mjs', 'shape-pdf-image-pair.mjs', 'shape-pdf-camera.mjs', 'shape-frame-math.mjs',
    'browser-profile.json', 'text-profile.json', 'node-profile.json', 'package.json', 'package-lock.json'
  ].map(p => 'tools/TikzVisual/' + p)];
  for (const p of sources) { const b = await readFile(path.join(root, p)); toolHashes[p] = sha256(b); await save('tool-sources/' + p, b); }
  await save('cached-validation.txt', run('dotnet', ['run', '--project', 'tools/TikzDashReference', '-c', 'Release', '--no-restore', '--', 'check-cached']));
  const pdfBytes = await readFile(path.join(root, 'tests/Reference/Dashes/native/reference.pdf')), parsed = parseDashPdf(pdfBytes);
  await save('original.pdf', pdfBytes); await save('reference.svg', native.referenceBytes);
  await save('native-snapshot.json', native.snapshotBytes); await save('native-metrics.json', native.metricsBytes); await save('original-content.txt', parsed.content);
  for (const name of ['pdftoppm', 'pdftocairo']) {
    const found = spawnSync('where.exe', [name], { windowsHide: true, encoding: 'utf8' }); assert.equal(found.status, 0);
    const executable = found.stdout.trim().split(/\r?\n/)[0], version = run(executable, ['-v']).toString(), h = sha256(await readFile(executable));
    assert.ok(version.startsWith(name + ' version 24.04.0'));
    assert.equal(h, name === 'pdftoppm' ? native.snapshot.tools.find(t => t.name === name).sha256
      : '35e9a069589d52ad9e2b2ce3eb28b00dee2555c4ee72c1335242a4842f9b10e5');
    tools[name] = { executable, sha256: h, version }; await save(name + '-version.txt', version);
  }
  const renderer = await createRenderer();
  try {
    await installShapeMetrics(renderer);
    const reconstruction = await reconstructDashLines(renderer, native), { camera, regions } = dashLinesPdfCamera(native, reconstruction);
    const numeric = verifyDashLinesPdf(parsed, native, reconstruction.lines); assert.ok(numeric.passed);
    const instruction = dashLinesPdfInstructionSvg(parsed, camera), diagnostics = dashLinesPdfDiagnostics(parsed);
    await save('numeric.json', JSON.stringify(numeric, null, 2) + '\n'); await save('pdf-instructions.svg', instruction.svg);
    await save('independent-reconstruction.json', JSON.stringify({ ...reconstruction, representations: reconstruction.representations.map(v => ({ ...v, svg: undefined })) }, null, 2) + '\n');
    for (const r of reconstruction.representations) await save('representations/' + r.mode + '.svg', r.svg);
    for (const d of diagnostics) await save(d.name + '.pdf', d.bytes);
    await save('equivalent-instructions.json', JSON.stringify(diagnostics.map(d => ({ ...d, bytes: undefined, content: undefined })), null, 2) + '\n');
    phase = 'rasterization'; const pages = {}, wrapperControls = [], equivalenceControls = [];
    for (const name of Object.keys(tools)) for (const document of ['original', ...diagnostics.map(d => d.name)]) for (const scale of [1, 4]) {
      const stem = name + '/' + document + '-' + scale + 'x';
      const args = ['-png', '-r', String(96 * scale), '-f', '1', '-singlefile', path.join(output, document + '.pdf'), path.join(output, stem)];
      await save(stem + '-command.json', JSON.stringify(args) + '\n'); await save(stem + '-log.txt', run(tools[name].executable, args));
      const bytes = await readFile(path.join(output, stem + '.png')); await save(stem + '.png', bytes); assert.deepEqual(pngSize(bytes), camera.rasterSizes[scale + 'x']);
      const repeatArgs = [...args.slice(0, -1), path.join(output, stem + '-repeat')]; run(tools[name].executable, repeatArgs);
      const repeat = await readFile(path.join(output, stem + '-repeat.png')); await save(stem + '-repeat.png', repeat); assert.ok(bytes.equals(repeat));
      if (name === 'pdftoppm' && document === 'original') assert.ok(bytes.equals(await readFile(path.join(root, 'tests/Reference/Dashes/native/pdf-page-' + scale + 'x.png'))));
      if (document === 'original-instructions') { const passed = sha256(bytes) === artifacts[name + '/original-' + scale + 'x.png'];
        wrapperControls.push({ name, scale, passed }); assert.ok(passed, 'Wrapper changed the original PDF pixels.'); }
      pages[name + '/' + document + '/' + scale] = 'data:image/png;base64,' + bytes.toString('base64');
      commands.push({ name, document, scale, args, repeatArgs, exactRepeat: true, size: pngSize(bytes) });
    }
    for (const name of Object.keys(tools)) for (const d of diagnostics) for (const scale of [1, 4]) {
      const identical = artifacts[name + '/original-' + scale + 'x.png'] === artifacts[name + '/' + d.name + '-' + scale + 'x.png'];
      equivalenceControls.push({ name, document: d.name, scale, exactPngMatch: identical, requiredForCairoQualification: name === 'pdftocairo' });
    }
    const variants = [{ mode: 'original-svg', svg: native.reference, units: 'bp', origin: native.metrics.driverOriginBp },
      { mode: 'native-svg', svg: reconstruction.representations.find(r => r.mode === 'printed-pen-hull-driver-width-elements').svg, units: 'cssPixels', origin: { x: 0, y: 0 } },
      { mode: 'pdf-instructions', svg: instruction.svg, units: 'cssPixels', origin: { x: 0, y: 0 } }];
    phase = 'viewport-controls'; const viewport = await verifyDashLinesPdfViewports(renderer,
      { variants, camera, regions, pdfPages: { 1: pages['pdftocairo/original/1'], 4: pages['pdftocairo/original/4'] } }, save);
    assert.ok(viewport.passed);
    phase = 'registered-observations'; const observations = [], sheetLinks = [];
    for (const name of Object.keys(tools)) for (const variant of variants) for (const frame of ['natural', 'expanded']) for (const scale of [1, 4]) {
      const prefix = name + '/' + variant.mode + '-' + frame + '-' + scale + 'x', crops = new Map(), links = {};
      let result;
      // The shared bounded capture helper admits at most sixteen crop pairs.
      // Three deterministic batches retain every one of the forty regions.
      for (let offset = 0; offset < 40; offset += 16) {
        const ids = regions.slice(1 + offset, 1 + Math.min(40, offset + 16)).map(r => r.id);
        const measured = await measureShapePdfPair(renderer, { svg: variant.svg, units: variant.units, svgOriginBp: variant.origin,
          camera, regions, frame, scale, pdfPage: pages[name + '/original/' + scale], rightLabel: variant.mode, cropLimit: ids.length, cropRegionIds: ids });
        assert.ok(measured.repeat.pdf.exactRgbaMatch && measured.repeat.svg.exactRgbaMatch); assert.equal(measured.outsideWholeChangedPixels, 0);
        const summary = r => ({ ...r, images: undefined, crops: undefined });
        if (result) assert.deepEqual(summary(measured), summary(result), 'Crop batches changed measurements.');
        else {
          result = measured;
          for (const [kind, png] of Object.entries(result.images)) { links[kind] = prefix + '-' + kind + '.png'; await save(links[kind], Buffer.from(png, 'base64')); }
        }
        assert.deepEqual(measured.crops.map(c => c.id).sort(), [...ids].sort());
        for (const crop of measured.crops) {
          assert.ok(!crops.has(crop.id)); const images = {};
          for (const [kind, png] of Object.entries(crop.images)) { images[kind] = prefix + '-' + crop.id + '-' + kind + '.png'; await save(images[kind], Buffer.from(png, 'base64')); }
          crops.set(crop.id, { images, presentation: crop.presentation });
          if (['path-2', 'path-5', 'path-28', 'path-29', 'path-30', 'path-31'].includes(crop.id)) sheetLinks.push({ name, mode: variant.mode, frame, scale, id: crop.id, sheet: images.sheet });
        }
      }
      assert.equal(crops.size, 40);
      observations.push({ rasterizer: name, mode: variant.mode, svgSha256: sha256(variant.svg), ...result, images: undefined, crops: undefined,
        artifacts: links, regions: result.regions.map(r => ({ ...r, crops: crops.get(r.id) })) });
      console.log(name + ' / ' + variant.mode + ' / ' + frame + ' / ' + scale + 'x: ' + result.whole.rawChangedPixels + ' changed pixels; 40 crop pairs.');
    }
    assert.equal(observations.length, 24); assert.equal(commands.length, 24); assert.equal(equivalenceControls.length, 20);
    const qualification = { scope: 'Unchanged original forty-line PDF; fixed binaries; exact repeat, wrapper, equivalent-dash and native viewport controls.',
      renderer: 'pdftocairo', passed: wrapperControls.every(c => c.passed) && viewport.passed
        && equivalenceControls.filter(c => c.requiredForCairoQualification).every(c => c.exactPngMatch) };
    await save('index.html', '<!doctype html><meta charset="utf-8"><title>Forty-line PDF rasterizer investigation</title><h1>Forty-line PDF rasterizer investigation</h1>'
      + '<p>Oracle-only observations. Numeric checks and rasterizer qualification do not grant image admission. Camera and regions come from native evidence.</p><a href="report.json">Machine-readable report</a>'
      + sheetLinks.map(s => '<h2>' + s.name + ' / ' + s.mode + ' / ' + s.frame + ' / ' + s.scale + 'x / ' + s.id + '</h2><img src="' + s.sheet + '">').join(''));
    for (const [p, h] of Object.entries(toolHashes)) assert.equal(sha256(await readFile(path.join(root, p))), h, 'Tool changed during run: ' + p);
    for (const t of Object.values(tools)) assert.equal(sha256(await readFile(t.executable)), t.sha256);
    assert.equal((await readDashLinesNative()).snapshotSha256, native.snapshotSha256); await verifyAssets();
    await publish({ schemaVersion: 1, completed: true, converterInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false, overallVerdict: 'pending',
      rerun: 'node tools/TikzVisual/inspect-dash-lines-pdf-rasterizers.mjs', nativeSnapshotSha256: native.snapshotSha256, toolHashes, tools, renderer: renderer.identity,
      camera, regions, numeric, printedOrigin: instruction.printedOrigin, printedOriginDelta: instruction.translation,
      independentRepresentations: reconstruction.representations.map(v => ({ ...v, svg: undefined })), serializationChecks: reconstruction.serialization.length,
      rootChecks: reconstruction.rootChecks, commands, wrapperControls, equivalenceControls, viewport, qualification, observations, artifacts });
    if (!qualification.passed) process.exitCode = 1;
    console.log('Report: ' + path.relative(root, path.join(output, 'report.json')));
  } finally { await renderer.browser.close(); }
}
await main().catch(async error => { process.exitCode = 2; console.error(error.stack);
  await publish({ completed: false, phase, converterInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false,
    error: error.message, toolHashes, tools, commands, artifacts }); });
