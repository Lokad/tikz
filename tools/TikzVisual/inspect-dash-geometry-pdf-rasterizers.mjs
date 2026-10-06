// Development-only diagnosis of the fixed PDF oracle. No candidate or policy.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { root, sha256, writeArtifact } from './shape-oracle-bundle.mjs';
import { createRenderer } from './compare.mjs';
import { readDashGeometryNative, verifyDashAssets } from './dash-geometry-primary-common.mjs';
import { installShapeMetrics } from './dash-geometry-image-pair.mjs';
import { measureShapePdfPair } from './shape-pdf-image-pair.mjs';
import { parseDashGeometryPdf } from './dash-geometry-pdf-vector.mjs';

const base = path.join(root, 'artifacts/dash-geometry-pdf-rasterizers');
const output = path.join(base, 'run-' + randomUUID()), artifacts = {}, tools = {}, sources = {};
const save = (p, bytes) => writeArtifact(output, p, bytes, artifacts);
let phase = 'inputs';
async function publish(report) {
  await writeArtifact(output, 'report.json', JSON.stringify(report, null, 2) + '\n');
  await writeArtifact(base, 'latest.json', JSON.stringify({ completed: report.completed,
    report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'),
    sha256: sha256(await readFile(path.join(output, 'report.json'))) }, null, 2) + '\n');
}
function run(executable, args) {
  const result = spawnSync(executable, args, { cwd: output, windowsHide: true, timeout: 180000, maxBuffer: 100000 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, String(result.stderr));
  return Buffer.concat([result.stdout, result.stderr]);
}
// A minimal one-page diagnostic PDF keeps every original graphics instruction.
// Only the explicitly recorded, semantically equivalent dash spelling changes.
function diagnosticPdf(parsed, content) {
  const data = deflateSync(Buffer.from(content, 'ascii'));
  const objects = [Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [' + parsed.mediaBox.join(' ')
      + '] /Resources << /ExtGState << /pgf@ca.1 << /ca .1 >> >> >> /Contents 4 0 R >>'),
    Buffer.concat([Buffer.from('<< /Length ' + data.length + ' /Filter /FlateDecode >>\nstream\n'), data, Buffer.from('\nendstream')])];
  const parts = [Buffer.from('%PDF-1.5\n')], offsets = [0]; let size = parts[0].length;
  objects.forEach((body, i) => { offsets.push(size); const b = Buffer.concat([Buffer.from((i + 1) + ' 0 obj\n'), body, Buffer.from('\nendobj\n')]); parts.push(b); size += b.length; });
  parts.push(Buffer.from('xref\n0 5\n0000000000 65535 f \n' + offsets.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')
    + 'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n' + size + '\n%%EOF\n'));
  return Buffer.concat(parts);
}
async function main() {
  assert.equal(process.argv.length, 2);
  const previousBase = path.join(root, 'artifacts/dash-geometry-pdf'), pointerBytes = await readFile(path.join(previousBase, 'latest.json'));
  const pointer = JSON.parse(pointerBytes); assert.equal(pointer.completed, true);
  assert.match(pointer.report, /^run-[\da-f-]+\/report\.json$/);
  const reportBytes = await readFile(path.join(previousBase, pointer.report)); assert.equal(sha256(reportBytes), pointer.sha256);
  const prior = JSON.parse(reportBytes), priorFolder = path.dirname(path.join(previousBase, pointer.report));
  assert.equal(prior.completed, true); assert.equal(prior.converterInvoked, false); assert.equal(prior.approvedImagePolicy, false);
  assert.equal(prior.numeric.passed, true); assert.equal(prior.viewport.passed, true); assert.equal(prior.observations.length, 40);
  await verifyDashAssets(priorFolder, prior.artifacts);
  const native = await readDashGeometryNative(); assert.equal(native.snapshotSha256, prior.nativeSnapshotSha256);
  for (const [p, h] of Object.entries(prior.toolHashes)) assert.equal(sha256(await readFile(path.join(root, p))), h, 'Stale prerequisite tool: ' + p);
  for (const p of [...Object.keys(prior.toolHashes), 'tools/TikzVisual/inspect-dash-geometry-pdf-rasterizers.mjs']) {
    const b = await readFile(path.join(root, p)); sources[p] = sha256(b); await save('tool-sources/' + p, b);
  }
  await save('prerequisite-report.json', reportBytes); await save('prerequisite-pointer.json', pointerBytes);
  // Exact upstream release source is optional inspection evidence, never a
  // production input. This explicit investigation requires it locally.
  for (const p of ['poppler-24.04.0.tar.xz', 'splash/Splash.cc', 'poppler/SplashOutputDev.cc', 'utils/pdftoppm.cc']) {
    const bytes = await readFile(path.join(root, 'external/poppler-24.04.0', p)); await save('upstream/' + p, bytes);
  }
  assert.equal(artifacts['upstream/poppler-24.04.0.tar.xz'], '1e804ec565acf7126eb2e9bb3b56422ab2039f7e05863a5dfabdd1ffd1bb77a7');
  for (const name of ['pdftoppm', 'pdftocairo']) {
    const paths = spawnSync('where.exe', [name], { windowsHide: true, encoding: 'utf8' }); assert.equal(paths.status, 0);
    const executable = paths.stdout.trim().split(/\r?\n/)[0], bytes = await readFile(executable), version = run(executable, ['-v']).toString();
    assert.ok(version.startsWith(name + ' version 24.04.0'));
    const hash = sha256(bytes); if (name === 'pdftoppm') assert.equal(hash, native.snapshot.tools.find(t => t.name === name).sha256);
    tools[name] = { executable, sha256: hash, version }; await save(name + '-version.txt', version);
  }
  const original = await readFile(path.join(priorFolder, 'reference.pdf')), parsed = parseDashGeometryPdf(original);
  assert.deepEqual(Object.keys(parsed.resources), ['pgf@ca.1']); await save('original.pdf', original);
  const p = parsed.paints[3], doubled = [...p.state.dash, ...p.state.dash], period = doubled.reduce((n, v) => n + v, 0);
  assert.equal(p.state.dash.length, 3); assert.ok(p.state.phase < 0);
  const odd = '[ ' + p.state.dash.join(' ') + ' ] ' + p.state.phase + ' d';
  // PGF emits this state both when applying options and before path use.
  assert.equal(parsed.content.split(odd).length, 3);
  const number = n => { const x = Math.round(n * 1e5) / 1e5; assert.ok(Math.abs(x - n) <= 1e-10); return String(x); };
  const fullPhase = p.state.phase - Math.floor(p.state.phase / period) * period;
  const halfPhase = p.state.phase - Math.floor(p.state.phase / (period / 2)) * (period / 2);
  const diagnostics = [{ name: 'original-instructions', command: odd },
    { name: 'explicit-even-negative', command: '[' + doubled.join(' ') + '] ' + p.state.phase + ' d' },
    { name: 'explicit-even-positive', command: '[' + doubled.join(' ') + '] ' + number(fullPhase) + ' d' },
    { name: 'odd-full-period-positive', command: '[' + p.state.dash.join(' ') + '] ' + number(fullPhase) + ' d' }];
  for (const d of diagnostics) {
    const content = parsed.content.replaceAll(odd, d.command);
    const bytes = diagnosticPdf(parsed, content); await save(d.name + '.pdf', bytes);
    const reparsed = parseDashGeometryPdf(bytes);
    assert.equal(reparsed.content, content);
    assert.deepEqual(reparsed.mediaBox, parsed.mediaBox);
  }
  await save('dash-equivalence.json', JSON.stringify({ originalCommand: odd, doubled, period, fullPhase, halfPhase, diagnostics,
    scope: 'Only dash spelling changes. Page, origin, resources and all other instructions are preserved. No reference baseline is replaced.' }, null, 2) + '\n');
  phase = 'rasterization'; const pages = {}, commands = [];
  for (const name of Object.keys(tools)) for (const document of ['original', ...diagnostics.map(d => d.name)]) for (const scale of [1, 4]) {
    const stem = name + '/' + document + '-' + scale + 'x';
    const args = ['-png', '-r', String(96 * scale), '-f', '1', '-singlefile', document + '.pdf', stem];
    // writeArtifact creates the subdirectory without granting the renderer
    // any path assembled from source input.
    await save(stem + '-command.json', JSON.stringify(args) + '\n');
    const log = run(tools[name].executable, args); await save(stem + '-log.txt', log);
    const bytes = await readFile(path.join(output, stem + '.png')); await save(stem + '.png', bytes);
    const repeatArgs = [...args.slice(0, -1), stem + '-repeat']; run(tools[name].executable, repeatArgs);
    const repeat = await readFile(path.join(output, stem + '-repeat.png')); await save(stem + '-repeat.png', repeat); assert.ok(bytes.equals(repeat));
    if (name === 'pdftoppm' && document === 'original') assert.ok(bytes.equals(await readFile(path.join(priorFolder, 'pdf-page-' + scale + 'x.png'))));
    if (document === 'original-instructions') assert.equal(sha256(bytes), artifacts[name + '/original-' + scale + 'x.png'], 'Diagnostic wrapper changed original pixels.');
    pages[name + '/' + document + '/' + scale] = 'data:image/png;base64,' + bytes.toString('base64');
    commands.push({ name, document, scale, args, exactRepeat: true });
  }
  const equivalenceControls = [];
  for (const scale of [1, 4]) {
    const hash = (name, document) => artifacts[name + '/' + document + '-' + scale + 'x.png'];
    const compare = (name, left, right, expectedIdentical) => {
      const identical = hash(name, left) === hash(name, right); assert.equal(identical, expectedIdentical);
      equivalenceControls.push({ name, scale, left, right, expectedIdentical, observedIdentical: identical, passed: true });
    };
    for (const d of diagnostics) compare('pdftocairo', 'original', d.name, true);
    compare('pdftoppm', 'original', 'original-instructions', true);
    compare('pdftoppm', 'original', 'odd-full-period-positive', true);
    compare('pdftoppm', 'explicit-even-negative', 'explicit-even-positive', true);
    compare('pdftoppm', 'original', 'explicit-even-negative', false);
  }
  phase = 'registered-measurements'; const renderer = await createRenderer(), observations = [];
  try {
    await installShapeMetrics(renderer);
    const svg = await readFile(path.join(priorFolder, 'pdf-instructions.svg'), 'utf8');
    const target = /(<path id="pdf-p3"[^>]*stroke-dashoffset=")[^"]+("[^>]*\/?>)/;
    assert.equal([...svg.matchAll(new RegExp(target.source, 'g'))].length, 1);
    const splash = svg.replace(target, (_, before, after) => before + halfPhase + after);
    await save('literal-pdf.svg', svg); await save('diagnostic-half-period.svg', splash);
    for (const name of Object.keys(tools)) for (const d of diagnostics) for (const scale of [1, 4]) {
      const result = await measureShapePdfPair(renderer, { svg, units: 'cssPixels', svgOriginBp: { x: 0, y: 0 },
        camera: prior.camera, regions: prior.regions, frame: 'expanded', scale, pdfPage: pages[name + '/' + d.name + '/' + scale],
        rightLabel: 'Literal PDF instructions in SVG', cropLimit: 1, cropRegionIds: ['path-3'] });
      const prefix = name + '/' + d.name + '-' + scale + 'x', links = {};
      for (const [kind, png] of Object.entries(result.crops[0].images)) { links[kind] = prefix + '-path-3-' + kind + '.png'; await save(links[kind], Buffer.from(png, 'base64')); }
      observations.push({ name, document: d.name, ...result, images: undefined, crops: undefined, target: 'path-3', artifacts: links });
      assert.ok(result.repeat.pdf.exactRgbaMatch && result.repeat.svg.exactRgbaMatch); assert.equal(result.outsideWholeChangedPixels, 0);
      const region = result.regions.find(r => r.id === 'path-3');
      console.log(name + ' ' + d.name + ' ' + scale + 'x: mean ' + region.meanForegroundChannelError + ', edge ' + region.topology.maxEdgeDisplacementCssPixels);
    }
    for (const scale of [1, 4]) {
      const result = await measureShapePdfPair(renderer, { svg: splash, units: 'cssPixels', svgOriginBp: { x: 0, y: 0 }, camera: prior.camera,
        regions: prior.regions, frame: 'expanded', scale, pdfPage: pages['pdftoppm/original/' + scale], cropLimit: 1, cropRegionIds: ['path-3'] });
      for (const [kind, png] of Object.entries(result.crops[0].images)) await save('half-period-' + scale + 'x-' + kind + '.png', Buffer.from(png, 'base64'));
      assert.ok(result.repeat.pdf.exactRgbaMatch && result.repeat.svg.exactRgbaMatch); assert.equal(result.outsideWholeChangedPixels, 0);
      observations.push({ name: 'pdftoppm', document: 'original', svgVariant: 'diagnostic-half-period', ...result, images: undefined, crops: undefined });
    }
    await save('index.html', '<!doctype html><meta charset="utf-8"><h1>Independent dash/PDF rasterizer diagnosis</h1><p>No image policy or converter.</p><a href="report.json">Report</a>'
      + observations.filter(o => o.artifacts).map(o => '<h2>' + o.name + ' / ' + o.document + ' / ' + o.scale + 'x</h2><img src="' + o.artifacts.sheet + '">').join(''));
    for (const [p, h] of Object.entries(sources)) assert.equal(sha256(await readFile(path.join(root, p))), h);
    assert.equal((await readDashGeometryNative()).snapshotSha256, native.snapshotSha256); await verifyDashAssets(output, artifacts);
    await publish({ schemaVersion: 1, completed: true, converterInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false, overallVerdict: 'pending',
      prerequisiteReportSha256: pointer.sha256, nativeSnapshotSha256: native.snapshotSha256, sources, tools, renderer: renderer.identity,
      upstream: { url: 'https://poppler.freedesktop.org/poppler-24.04.0.tar.xz', sha256: artifacts['upstream/poppler-24.04.0.tar.xz'],
        phaseNormalization: 'splash/Splash.cc:2171-2188', patternTransfer: 'poppler/SplashOutputDev.cc:1455-1468',
        svgSemantics: 'https://www.w3.org/TR/SVG2/painting.html#StrokeDashing' }, commands, equivalenceControls, observations, artifacts });
  } finally { await renderer.browser.close(); }
}
await main().catch(async error => { process.exitCode = 2; console.error(error.stack);
  await publish({ completed: false, phase, converterInvoked: false, approvedImagePolicy: false, error: error.message, sources, tools, artifacts }); });
