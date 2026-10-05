// Independent viewport/camera measurements for the unlabelled border corpus.
// This route accepts no candidate SVG, converter, or production resource.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer } from './compare.mjs';
import { measurePdfRegions } from './pdf-region-renderer.mjs';
import { verifyPdfNativeGeometry } from './pdf-native-geometry.mjs';
import { pdfRegionViewer } from './pdf-region-viewer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'artifacts/border-pdf-frame-probe');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const snapshotPath = 'tests/Reference/NodeBorders/framing.json';
const snapshotBytes = await readFile(path.join(root, snapshotPath));
const snapshot = JSON.parse(snapshotBytes);
const ids = ['node-border-lines', 'node-border-paths', 'node-border-transforms'];
assert.equal(snapshot.completed, true); assert.equal(snapshot.converterInvoked, false);
assert.equal(snapshot.approvedPolicy, false); assert.equal(snapshot.conformanceClaim, false);
assert.deepEqual(snapshot.expectedCases, ids); assert.deepEqual(snapshot.cases.map(c => c.caseId), ids);
for (const [file, expected] of Object.entries(snapshot.toolHashes))
  assert.equal(hash(await readFile(path.join(root, file))), expected, 'Native frame tool changed: ' + file);
await mkdir(output, { recursive: true }); await rm(path.join(output, 'evidence.json'), { force: true });
const renderer = await createRenderer();
const cases = [];
try {
  for (const item of snapshot.cases) {
    const baseline = path.join(root, 'tests/Reference', item.caseId);
    const derived = path.join(root, 'artifacts/border-native-framing', item.caseId);
    const original = await readFile(path.join(baseline, 'reference.svg'));
    const expanded = await readFile(path.join(derived, 'actual.svg'));
    const metricsBytes = await readFile(path.join(baseline, 'reference-metrics.json'));
    const metrics = JSON.parse(metricsBytes);
    assert.equal(hash(original), item.originalProvenance.artifacts['reference.svg']);
    assert.equal(hash(expanded), item.expandedOracleSha256);
    assert.equal(hash(metricsBytes), item.originalProvenance.artifacts['reference-metrics.json']);
    const source = await readFile(path.join(root, 'tests/Fixtures', item.caseId + '.tikz'));
    assert.equal(hash(source), item.sourceSha256);
    const native = verifyPdfNativeGeometry(await readFile(path.join(baseline, 'oracle.log'), 'utf8'));
    const pdfPages = {};
    for (const scale of [1, 4]) {
      const bytes = await readFile(path.join(baseline, 'pdf-page-' + scale + 'x.png'));
      assert.equal(hash(bytes), item.originalProvenance.artifacts['pdf-page-' + scale + 'x.png']);
      pdfPages[scale] = 'data:image/png;base64,' + bytes.toString('base64');
    }
    const b = item.frame.expandedPixels;
    const regions = [{ id: 'whole-picture', basis: 'Independently measured native stroke frame plus fixed eight CSS pixel padding',
      rectanglePixels: { x: b.minX - 8, y: b.minY - 8, width: b.maxX - b.minX + 16, height: b.maxY - b.minY + 16 } },
      ...item.regions.map(({ id, basis, rectanglePixels }) => ({ id, basis, rectanglePixels }))];
    const variants = [];
    for (const mode of ['original-driver', 'expanded-native-frame']) {
      const svg = mode === 'original-driver' ? original : expanded;
      const input = { svg: svg.toString('utf8'), units: 'bp', pdfPages, regions, renderMode: 'page-coordinates',
        svgOriginBp: mode === 'original-driver' ? item.frame.camera.origin : { x: 0, y: 0 },
        pdfOriginPixels: metrics.pdfOriginPixels, captureIds: ['whole-picture'] };
      const first = await measurePdfRegions(renderer.page, input);
      const captures = ['whole-picture', ...first.results.filter(r => r.scale === 4 && r.id !== 'whole-picture')
        .sort((a, b) => b.meanForegroundError - a.meanForegroundError || a.id.localeCompare(b.id)).slice(0, 5).map(r => r.id)];
      const repeat = await measurePdfRegions(renderer.page, { ...input, captureIds: captures });
      assert.deepEqual(repeat.results, first.results, 'Native border PDF measurements did not repeat.');
      for (const name of Object.keys(first.images))
        assert.equal(hash(Buffer.from(first.images[name], 'base64')), hash(Buffer.from(repeat.images[name], 'base64')));
      assert.equal(repeat.results.length, regions.length * 2);
      const folder = path.join(output, item.caseId, mode);
      assert.ok(folder.startsWith(output + path.sep), 'Border PDF output escapes its artifact directory.');
      await rm(folder, { recursive: true, force: true }); await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, 'oracle.svg'), svg); await writeFile(path.join(folder, 'source.tikz'), source);
      const camera = { schemaVersion: 1, mode, units: input.units, svgOriginBp: input.svgOriginBp,
        pdfOriginPixels: input.pdfOriginPixels, renderMode: input.renderMode, regions,
        converterInvoked: false, approvedPolicy: false, registration: 'Measured native page; integer crops; fixed regions; no content fitting' };
      await writeFile(path.join(folder, 'comparison-input.json'), JSON.stringify(camera, null, 2) + '\n');
      const imageFiles = Object.keys(repeat.images);
      for (const [file, data] of Object.entries(repeat.images)) await writeFile(path.join(folder, file), Buffer.from(data, 'base64'));
      delete repeat.images; repeat.regionDefinitions = regions;
      await writeFile(path.join(folder, 'measurements.json'), JSON.stringify(repeat, null, 2) + '\n');
      await writeFile(path.join(folder, 'index.html'), pdfRegionViewer(item.caseId, mode, repeat, captures, source.toString('utf8')));
      variants.push({ mode, svgSha256: hash(svg), repeatedMetrics: true, repeatedWholePictureCaptures: true,
        regions, measurements: repeat.results,
        artifactHashes: Object.fromEntries(await Promise.all(['oracle.svg', 'source.tikz', 'comparison-input.json', 'measurements.json', 'index.html',
          ...imageFiles].map(async file => [file, hash(await readFile(path.join(folder, file)))]))) });
    }
    cases.push({ caseId: item.caseId, native, sourceSha256: item.sourceSha256, originalProvenance: item.originalProvenance,
      pdfOriginPixels: metrics.pdfOriginPixels, regions, variants });
  }
  const toolFiles = ['tools/TikzVisual/border-pdf-frame-probe.mjs', 'tools/TikzVisual/compare.mjs',
    'tools/TikzVisual/pdf-region-renderer.mjs', 'tools/TikzVisual/pdf-native-geometry.mjs', 'tools/TikzVisual/pdf-region-viewer.mjs'];
  await writeFile(path.join(output, 'evidence.json'), JSON.stringify({ schemaVersion: 1, completed: true, converterInvoked: false,
    approvedPolicy: false, conformanceClaim: false, nativeFrameSnapshotSha256: hash(snapshotBytes), renderer: renderer.identity,
    expectedCases: ids, scales: [1, 4], background: 'white', renderMode: 'page-coordinates',
    scope: 'Original/expanded native SVG viewports versus ordinary PDF; raw independent measurements only; no candidate and no limits selected',
    toolHashes: Object.fromEntries(await Promise.all(toolFiles.map(async file => [file, hash(await readFile(path.join(root, file)))]))), cases }, null, 2) + '\n');
  console.log(JSON.stringify({ completed: true, cases: cases.length, nativePathRecords: cases.reduce((n, c) => n + c.native.pathRecords, 0),
    measurements: cases.reduce((n, c) => n + c.variants.reduce((s, v) => s + v.measurements.length, 0), 0), converterInvoked: false, approvedPolicy: false }));
} finally { await renderer.browser.close(); }
