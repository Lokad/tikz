// Ordinary-PDF observations from independent SVG representations only.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRenderer } from './compare.mjs';
import { root, sha256, outputPath, writeArtifact } from './shape-oracle-bundle.mjs';
import { unionBounds } from './shape-frame-math.mjs';
import { installShapeMetrics } from './shape-image-pair.mjs';
import { shapePdfPageCamera, shapePdfRegions } from './shape-pdf-camera.mjs';
import { measureShapePdfPair } from './shape-pdf-image-pair.mjs';
import { shapePdfViewportControls } from './shape-pdf-viewport-controls.mjs';

const base = path.join(root, 'artifacts/node-shape-pdf-calibration');
const output = path.join(base, 'run-' + randomUUID());
const oracleFolder = path.join(output, 'oracle');
const toolFiles = ['tools/TikzVisual/calibrate-shape-pdf.mjs', 'tools/TikzVisual/shape-pdf-camera.mjs', 'tools/TikzVisual/shape-pdf-image-pair.mjs',
  'tools/TikzVisual/shape-raster-metrics.mjs', 'tools/TikzVisual/shape-image-pair.mjs', 'tools/TikzVisual/shape-oracle-bundle.mjs',
  'tools/TikzVisual/shape-frame-math.mjs', 'tools/TikzVisual/inspect-shape-frames.mjs', 'tools/TikzVisual/compare.mjs',
  'tools/TikzVisual/browser-profile.json', 'tools/TikzVisual/package.json', 'tools/TikzVisual/package-lock.json'];
toolFiles.push('tools/TikzVisual/shape-pdf-viewport-controls.mjs', 'tools/TikzVisual/shape-pdf-self-test.mjs');
async function command(executable, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: root, shell: false, windowsHide: true });
    let captured = '', settled = false;
    const finish = error => { if (settled) return; settled = true; clearTimeout(timer); if (error) { child.kill(); reject(error); } else resolve(); };
    const timer = setTimeout(() => finish(new Error('Independent PDF calibration dependency timed out.')), 240000);
    const capture = bytes => { captured += bytes.toString(); if (captured.length > 1048576) finish(new Error('Dependency output exceeds its limit.')); };
    child.stdout.on('data', capture); child.stderr.on('data', capture); child.on('error', finish);
    child.on('close', code => { process.stdout.write(captured); finish(code === 0 ? null : new Error('Independent dependency failed: ' + code)); });
  });
}
async function main() {
  assert.equal(process.argv.length, 2, 'Usage: node tools/TikzVisual/calibrate-shape-pdf.mjs');
  await outputPath(output);
  const artifacts = {};
  const toolHashes = Object.fromEntries(await Promise.all(toolFiles.map(async file => [file, sha256(await readFile(path.join(root, file)))])));
  for (const file of toolFiles) await writeArtifact(output, 'tool-sources/' + file, await readFile(path.join(root, file)), artifacts);
  await writeArtifact(output, 'report.json', JSON.stringify({ schemaVersion: 1, completed: false, verdict: 'in-progress', converterInvoked: false,
    conformanceClaim: false, approvedImagePolicy: false, toolHashes }, null, 2) + '\n');
  const relativeReport = path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/');
  await writeArtifact(base, 'latest.json', JSON.stringify({ schemaVersion: 1, completed: false, report: relativeReport,
    converterInvoked: false, approvedImagePolicy: false }, null, 2) + '\n');
  console.log('Fresh PDF observation directory: ' + path.relative(root, output).split(path.sep).join('/'));
  await command('node', ['tools/TikzVisual/shape-pdf-self-test.mjs']);
  await command('dotnet', ['run', '--project', 'tools/TikzShapePdfReference', '-c', 'Release', '--no-restore', '--', 'check-cached']);
  await command('node', ['tools/TikzVisual/inspect-shape-frames.mjs', '--out', path.relative(root, oracleFolder)]);
  const frameBytes = await readFile(path.join(oracleFolder, 'frames.json')), frames = JSON.parse(frameBytes);
  const derivationBytes = await readFile(path.join(oracleFolder, 'derivation.json')), derivation = JSON.parse(derivationBytes);
  const pdfSnapshotBytes = await readFile(path.join(root, 'tests/Reference/NodeShapes/pdf-snapshot.json')), snapshot = JSON.parse(pdfSnapshotBytes);
  const pdfProvenanceBytes = await readFile(path.join(root, 'tests/Reference/NodeShapes/pdf/provenance.json'));
  const pdfMetricsBytes = await readFile(path.join(root, 'tests/Reference/NodeShapes/pdf/metrics.json')), pdf = JSON.parse(pdfMetricsBytes);
  assert.equal(frames.completed, true); assert.equal(frames.converterInvoked, false); assert.equal(frames.approvedImagePolicy, false);
  assert.equal(frames.analyticBrowserValidation.passed, true); assert.equal(frames.analyticBrowserValidation.checks.length, 214);
  assert.equal(sha256(derivationBytes), frames.derivation.sha256); assert.equal(derivation.converterInvoked, false);
  assert.deepEqual(derivation.counts, { nodes: 28, pathTokens: 420, glyphs: 70 });
  assert.ok(derivation.evidence.frameworkReferences.every(n => n === 'System' || n.startsWith('System.')));
  assert.equal(pdf.nativeRecordCount, 1810); assert.equal(pdf.converterInvoked, false); assert.equal(pdf.approvedImagePolicy, false);
  const camera = shapePdfPageCamera(pdf.measurement, pdf.rasterSizes), regions = shapePdfRegions(frames, camera);
  const measurements = [], repeats = [];
  async function verify() {
    assert.equal(sha256(await readFile(path.join(oracleFolder, 'frames.json'))), sha256(frameBytes));
    assert.equal(sha256(await readFile(path.join(oracleFolder, 'derivation.json'))), sha256(derivationBytes));
    assert.equal(sha256(await readFile(path.join(root, 'tests/Reference/NodeShapes/pdf-snapshot.json'))), sha256(pdfSnapshotBytes));
    assert.equal(sha256(await readFile(path.join(root, 'tests/Reference/NodeShapes/pdf/provenance.json'))), sha256(pdfProvenanceBytes));
    for (const [file, hash] of Object.entries(snapshot.artifacts))
      assert.equal(sha256(await readFile(path.join(root, 'tests/Reference/NodeShapes/pdf', file))), hash, file);
    for (const [file, hash] of Object.entries({ ...derivation.evidence.artifacts, ...frames.artifacts }))
      assert.equal(sha256(await readFile(await outputPath(oracleFolder, file))), hash, file);
    for (const [file, hash] of Object.entries({ ...derivation.evidence.toolHashes, ...frames.toolHashes, ...toolHashes }))
      assert.equal(sha256(await readFile(path.join(root, file))), hash, file);
  }
  await verify();
  const renderer = await createRenderer();
  try {
    assert.deepEqual(renderer.identity, frames.renderer); await installShapeMetrics(renderer);
    await writeArtifact(output, 'pdf-provenance.json', pdfProvenanceBytes, artifacts);
    await writeArtifact(output, 'pdf-snapshot.json', pdfSnapshotBytes, artifacts);
    await writeArtifact(output, 'pdf-metrics.json', pdfMetricsBytes, artifacts);
    const pdfPages = {};
    for (const scale of [1, 4]) {
      const bytes = await readFile(path.join(root, 'tests/Reference/NodeShapes/pdf/pdf-page-' + scale + 'x.png'));
      pdfPages[scale] = 'data:image/png;base64,' + bytes.toString('base64');
      await writeArtifact(output, 'pdf-page-' + scale + 'x.png', bytes, artifacts);
    }
    const original = await readFile(path.join(oracleFolder, 'reference.svg'), 'utf8');
    const variants = [{ mode: 'original-driver', svg: original, units: 'bp', origin: derivation.originBp }];
    for (const variant of derivation.variants)
      variants.push({ mode: variant.mode, svg: await readFile(path.join(oracleFolder, variant.svg), 'utf8'), units: 'cssPixels', origin: { x: 0, y: 0 } });
    const semantic = unionBounds([frames.frames.picture, frames.frames.nativeInk]), rootValues =
      [semantic.minX, semantic.minY, semantic.maxX - semantic.minX, semantic.maxY - semantic.minY].map(n => n.toFixed(6));
    const six = variants.find(v => v.mode === 'native-css-6').svg;
    const semanticSvg = await renderer.page.evaluate(({ svg, values }) => {
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml'), root = doc.documentElement, before = root.innerHTML;
      root.setAttribute('width', values[2] + 'px'); root.setAttribute('height', values[3] + 'px'); root.setAttribute('viewBox', values.join(' '));
      if (root.innerHTML !== before) throw new Error('Changing semantic root changed drawing instructions.');
      return new XMLSerializer().serializeToString(doc);
    }, { svg: six, values: rootValues });
    variants.push({ mode: 'native-semantic-css-6', svg: semanticSvg, units: 'cssPixels', origin: { x: 0, y: 0 } });
    assert.equal(variants.length, 7);
    for (const variant of variants) await writeArtifact(output, variant.mode + '.svg', variant.svg, artifacts);
    const viewport = await shapePdfViewportControls(renderer, { variants, camera, regions, pdfPages },
      (file, bytes) => writeArtifact(output, file, bytes, artifacts));
    await writeArtifact(output, 'viewport-controls.json', JSON.stringify(viewport, null, 2) + '\n', artifacts);
    if (!viewport.passed) { const error = new Error('One or more required native-page viewport controls changed unchanged pixels.'); error.exitCode = 1; throw error; }
    for (const variant of variants) for (const frame of ['natural', 'expanded']) for (const scale of [1, 4]) {
      const result = await measureShapePdfPair(renderer, { svg: variant.svg, units: variant.units, svgOriginBp: variant.origin,
        camera, regions, scale, frame, pdfPage: pdfPages[scale], rightLabel: variant.mode });
      assert.equal(result.repeat.pdf.exactRgbaMatch, true); assert.equal(result.repeat.svg.exactRgbaMatch, true);
      assert.equal(result.outsideWholeChangedPixels, 0, 'Reference ink differs outside independently fixed whole camera.');
      const prefix = variant.mode + '-' + frame + '-' + scale + 'x', links = {}, cropLinks = new Map();
      for (const [name, bytes] of Object.entries(result.images)) {
        const file = prefix + '-' + name + '.png'; await writeArtifact(output, file, Buffer.from(bytes, 'base64'), artifacts); links[name] = file;
      }
      for (const crop of result.crops) {
        const links = {};
        for (const [name, bytes] of Object.entries(crop.images)) {
          const file = 'crops/' + prefix + '-' + crop.id + '-' + name + '.png';
          await writeArtifact(output, file, Buffer.from(bytes, 'base64'), artifacts); links[name] = file;
        }
        cropLinks.set(crop.id, { ...links, presentation: crop.presentation });
      }
      measurements.push({ mode: variant.mode, svgSha256: sha256(variant.svg), units: variant.units, ...result, images: undefined, crops: undefined,
        regions: result.regions.map(r => ({ ...r, crops: cropLinks.get(r.id) ?? null })), artifacts: links });
      repeats.push({ mode: variant.mode, frame, scale, ...result.repeat });
      console.log(prefix + ': ' + result.whole.rawChangedPixels + ' changed pixels, max ' + result.whole.maxRawChannelError + '/255.');
    }
    assert.equal(measurements.length, 28); assert.equal(measurements.reduce((n, m) => n + m.regions.length, 0), 2744);
    for (const scale of [1, 4]) {
      const driverRoot = measurements.find(m => m.mode === 'native-css-6' && m.frame === 'expanded' && m.scale === scale);
      const semanticRoot = measurements.find(m => m.mode === 'native-semantic-css-6' && m.frame === 'expanded' && m.scale === scale);
      assert.equal(artifacts[driverRoot.artifacts['svg-page']], artifacts[semanticRoot.artifacts['svg-page']], 'Root-only change moved expanded native-page pixels.');
    }
    await verify();
    for (const [file, hash] of Object.entries(artifacts)) assert.equal(sha256(await readFile(await outputPath(output, file))), hash);
    const contacts = measurements.filter(m => m.scale === 1), worst = measurements.flatMap(m => m.regions.filter(r => r.crops)
      .map(r => ({ mode: m.mode, frame: m.frame, scale: m.scale, ...r }))).sort((a, b) => b.rawChangedPixels - a.rawChangedPixels || a.id.localeCompare(b.id)).slice(0, 32);
    const html = '<!doctype html><meta charset="utf-8"><title>Curved-node ordinary PDF calibration</title><h1>Circle/ellipse PDF observations — admission pending</h1>'
      + '<p>No converter invoked; native page registration, white paper, natural and independent expanded framing. Raw differences are retained without an acceptance policy.</p>'
      + '<p><a href="report.json">Report</a> | <a href="oracle/source.tikz">Source</a> | <a href="pdf-metrics.json">Native page evidence</a> | <a href="viewport-controls.json">Viewport controls</a></p>'
      + contacts.map(m => '<h2>' + m.mode + ' / ' + m.frame + '</h2><img style="max-width:100%" src="' + m.artifacts.sheet + '">').join('')
      + '<h2>Largest regional differences</h2><ul>' + worst.map(r => '<li><a href="' + r.crops.sheet + '">' + r.id + ' / ' + r.mode + ' / ' + r.frame + ' / ' + r.scale + 'x</a></li>').join('') + '</ul>';
    await writeArtifact(output, 'index.html', html, artifacts);
    const report = { schemaVersion: 1, comparisonKind: 'oracle-only-curved-node-pdf-calibration', completed: true, verdict: 'pending',
      converterInvoked: false, conformanceClaim: false, approvedImagePolicy: false,
      scope: 'One trusted 28-node fixture; independent SVG representations versus ordinary PDF. White-paper whole/local observations, no candidate-derived camera or tolerance.',
      toolHashes, renderer: renderer.identity, camera, regions, semanticRoot: { values: rootValues.map(Number), drawingInstructionsUnchanged: true },
      independentEvidence: { frames: 'oracle/frames.json', framesSha256: sha256(frameBytes), derivation: 'oracle/derivation.json', derivationSha256: sha256(derivationBytes),
        pdfSnapshot: 'pdf-snapshot.json', pdfSnapshotSha256: sha256(pdfSnapshotBytes), nativeRecordCount: 1810 },
      expectedVariants: variants.map(v => v.mode), expectedFrames: ['natural', 'expanded'], expectedScales: [1, 4], background: 'white',
      cameraControls: { passed: true, report: 'viewport-controls.json', reportSha256: artifacts['viewport-controls.json'], controls: 54, requiredRegionChecks: 5346,
        paddedBaselineOrdinaryPdfPairs: 6, rootOnlyExpandedPageMatches: 2 },
      metricConvention: 'Exact raw RGBA, rounded premultiplied foreground means including every visible sample; threshold-16 eight-neighbor components, four-neighbor boundaries, symmetric Euclidean distances. Missing edges have explicit state and null distances. Native integer crops after full-page rendering; no fitting/resampling.',
      measurements, repeatability: { passed: true, captures: repeats }, artifacts,
      agent: { state: 'pending', firstPendingRequiredGate: 'reviewed-PDF-policy-and-image-only-defects', viewer: 'index.html', report: 'report.json',
        source: 'oracle/source.tikz', focusedRerun: 'node tools/TikzVisual/calibrate-shape-pdf.mjs',
        worstRegions: worst.map(r => ({ id: r.id, nodeId: r.nodeId, mode: r.mode, frame: r.frame, scale: r.scale, crops: r.crops, rawChangedPixels: r.rawChangedPixels })) },
      remaining: ['Oracle-only cross-renderer policy and sensitivity/defect controls.', 'Both SVG-versus-PDF candidate gates.',
        'Reviewed immutable primary/PDF admission.', 'Focused/interaction corpora and hosted execution.'] };
    await writeArtifact(output, 'report.json', JSON.stringify(report, null, 2) + '\n');
    await writeArtifact(base, 'latest.json', JSON.stringify({ schemaVersion: 1, completed: true, report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'),
      sha256: sha256(await readFile(path.join(output, 'report.json'))), converterInvoked: false, approvedImagePolicy: false }, null, 2) + '\n');
    console.log('Independent curved-node PDF observations: 28 whole, 2,744 local, 56 exact repeats. Image/PDF admission pending.');
  } finally { await renderer.browser.close(); }
}
await main().catch(async error => {
  console.error(error.stack ?? String(error)); process.exitCode = error.exitCode ?? 2;
  try { await writeArtifact(output, 'report.json', JSON.stringify({ schemaVersion: 1, completed: false, verdict: 'infrastructure-error',
    converterInvoked: false, conformanceClaim: false, approvedImagePolicy: false, error: error.message,
    exitCode: process.exitCode, controlReport: error.exitCode === 1 ? 'viewport-controls.json' : null }, null, 2) + '\n');
    await writeArtifact(base, 'latest.json', JSON.stringify({ schemaVersion: 1, completed: false,
      report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'),
      sha256: sha256(await readFile(path.join(output, 'report.json'))), converterInvoked: false, approvedImagePolicy: false }, null, 2) + '\n');
  } catch { }
});
