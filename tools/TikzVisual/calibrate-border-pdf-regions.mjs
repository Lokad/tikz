// Independent native-page PDF calibration: original oracle paths and fixed
// precision variants only. Candidate SVGs and production resources are absent.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer } from './compare.mjs';
import { measurePdfRegions } from './pdf-region-renderer.mjs';
import { verifyPdfNativeGeometry } from './pdf-native-geometry.mjs';
import { pdfRegionViewer } from './pdf-region-viewer.mjs';

async function main() {
  assert.equal(process.argv.length, 2, 'The trusted border PDF experiment accepts no arguments.');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const output = path.join(root, 'artifacts/border-pdf-region-calibration');
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const primaryBytes = await readFile(path.join(root, 'artifacts/border-region-calibration/evidence.json'));
  const primary = JSON.parse(primaryBytes);
  const ids = ['node-border-lines', 'node-border-paths', 'node-border-transforms'];
  assert.equal(primary.completed, true); assert.equal(primary.converterInvoked, false);
  assert.equal(primary.approvedPolicy, false); assert.equal(primary.conformanceClaim, false);
  assert.deepEqual(primary.expectedCases, ids); assert.deepEqual(primary.cases.map(c => c.caseId), ids);
  for (const [file, expected] of Object.entries(primary.toolHashes))
    assert.equal(hash(await readFile(path.join(root, file))), expected, 'Border primary precision tool changed: ' + file);
  assert.equal(hash(await readFile(path.join(root, 'tests/Reference/NodeBorders/framing.json'))), primary.nativeFrameSnapshotSha256);
  await mkdir(output, { recursive: true }); await rm(path.join(output, 'evidence.json'), { force: true });
  const renderer = await createRenderer();
  const cases = [];
  try {
    for (const key of ['profile', 'playwright', 'browser', 'browserSha256', 'profileSha256', 'os', 'osRelease', 'architecture', 'node'])
      assert.equal(renderer.identity[key], primary.renderer[key], 'Border PDF renderer differs: ' + key);
    for (const item of primary.cases) {
      const baseline = path.join(root, 'tests/Reference', item.caseId);
      for (const file of ['reference.svg', 'reference-metrics.json', 'reference.pdf', 'oracle.log', 'pdf-page-1x.png', 'pdf-page-4x.png'])
        assert.equal(hash(await readFile(path.join(baseline, file))), item.originalProvenance.artifacts[file], 'Native PDF artifact changed: ' + file);
      const source = await readFile(path.join(root, 'tests/Fixtures', item.caseId + '.tikz'));
      assert.equal(hash(source), item.sourceSha256); assert.equal(hash(item.referenceSvg), item.referenceSha256);
      const native = verifyPdfNativeGeometry(await readFile(path.join(baseline, 'oracle.log'), 'utf8'));
      const metrics = JSON.parse(await readFile(path.join(baseline, 'reference-metrics.json')));
      const pdfPages = Object.fromEntries(await Promise.all([1, 4].map(async scale => [scale,
        'data:image/png;base64,' + (await readFile(path.join(baseline, 'pdf-page-' + scale + 'x.png'))).toString('base64')])));
      const box = item.frame.expandedPixels;
      const regions = [{ id: 'whole-picture', basis: 'Independent native stroke frame plus fixed eight CSS pixel padding',
        rectanglePixels: { x: box.minX - 8, y: box.minY - 8, width: box.maxX - box.minX + 16, height: box.maxY - box.minY + 16 } },
        ...item.regions.map(({ id, basis, rectanglePixels }) => ({ id, basis, rectanglePixels }))];
      const representations = [{ mode: 'expanded-native-driver', svg: item.referenceSvg, units: 'bp', sha256: item.referenceSha256 },
        ...item.variants.map(v => ({ mode: v.mode, svg: v.svg, units: 'cssPixels', sha256: v.representationSha256 }))];
      assert.deepEqual(representations.map(v => v.mode), ['expanded-native-driver', 'flattened', 'precision-plus', 'precision-minus']);
      const variants = [];
      for (const variant of representations) {
        assert.equal(hash(variant.svg), variant.sha256);
        const input = { svg: variant.svg, units: variant.units, svgOriginBp: { x: 0, y: 0 },
          pdfPages, pdfOriginPixels: metrics.pdfOriginPixels, regions, renderMode: 'page-coordinates', captureIds: ['whole-picture'] };
        const first = await measurePdfRegions(renderer.page, input);
        assert.equal(first.results.length, regions.length * 2);
        assert.ok(first.results.every(c => c.maxEdgeDisplacementPixels !== null));
        const captures = ['whole-picture', ...first.results.filter(c => c.scale === 4 && c.id !== 'whole-picture')
          .sort((a, b) => b.meanForegroundError - a.meanForegroundError || a.id.localeCompare(b.id)).slice(0, 5).map(c => c.id)];
        const repeat = await measurePdfRegions(renderer.page, { ...input, captureIds: captures });
        assert.deepEqual(repeat.results, first.results, 'Border PDF measurements did not repeat.');
        for (const [file, bytes] of Object.entries(first.images)) assert.equal(hash(Buffer.from(bytes, 'base64')), hash(Buffer.from(repeat.images[file], 'base64')));
        const folder = path.join(output, item.caseId, variant.mode);
        assert.ok(folder.startsWith(output + path.sep), 'Border PDF output escapes its artifact directory.');
        await rm(folder, { recursive: true, force: true }); await mkdir(folder, { recursive: true });
        await writeFile(path.join(folder, 'oracle.svg'), variant.svg); await writeFile(path.join(folder, 'source.tikz'), source);
        const camera = { schemaVersion: 1, units: variant.units, svgOriginBp: input.svgOriginBp,
          pdfOriginPixels: input.pdfOriginPixels, renderMode: input.renderMode, regions, converterInvoked: false,
          registration: 'Measured native PDF page and integer crops; independently fixed regions; no fitting' };
        await writeFile(path.join(folder, 'comparison-input.json'), JSON.stringify(camera, null, 2) + '\n');
        const images = Object.keys(repeat.images);
        for (const [file, bytes] of Object.entries(repeat.images)) await writeFile(path.join(folder, file), Buffer.from(bytes, 'base64'));
        delete repeat.images; repeat.regionDefinitions = regions;
        await writeFile(path.join(folder, 'measurements.json'), JSON.stringify(repeat, null, 2) + '\n');
        await writeFile(path.join(folder, 'index.html'), pdfRegionViewer(item.caseId, variant.mode, repeat, captures, source.toString('utf8')));
        variants.push({ mode: variant.mode, units: variant.units, svgSha256: variant.sha256,
          repeatedMeasurements: true, repeatedWholePictureCaptures: true, measurements: repeat.results,
          artifacts: Object.fromEntries(await Promise.all(['oracle.svg', 'source.tikz', 'comparison-input.json', 'measurements.json', 'index.html',
            ...images].map(async file => [file, hash(await readFile(path.join(folder, file)))]))) });
        console.log(item.caseId + '/' + variant.mode + ': ' + repeat.results.length + ' repeated native-page PDF measurements');
      }
      const prospectiveRegions = regions.map(region => ({ ...region, limits: [1, 4].map(scale => {
        const checks = variants.flatMap(v => v.measurements).filter(c => c.id === region.id && c.scale === scale);
        assert.equal(checks.length, 4);
        return { scale, background: 'white', maxChannelError: Math.max(...checks.map(c => c.maxChannelError)),
          maxMeanForegroundError: Math.ceil(Math.max(...checks.map(c => c.meanForegroundError)) * 1e6) / 1e6,
          maxEdgeDisplacementPixels: Math.max(...checks.map(c => c.maxEdgeDisplacementPixels)),
          maxComponentDifference: Math.max(...checks.map(c => Math.abs(c.referenceComponents - c.actualComponents))) };
      }) }));
      cases.push({ caseId: item.caseId, native, sourceSha256: item.sourceSha256, originalProvenance: item.originalProvenance,
        pdfOriginPixels: metrics.pdfOriginPixels, regions: prospectiveRegions, variants });
    }
    const tools = ['tools/TikzVisual/calibrate-border-pdf-regions.mjs', 'tools/TikzVisual/compare.mjs', 'tools/TikzVisual/browser-profile.json',
      'tools/TikzVisual/pdf-region-renderer.mjs', 'tools/TikzVisual/pdf-native-geometry.mjs', 'tools/TikzVisual/pdf-region-viewer.mjs'];
    await writeFile(path.join(output, 'evidence.json'), JSON.stringify({ schemaVersion: 1, completed: true,
      converterInvoked: false, approvedPolicy: false, conformanceClaim: false, expectedCases: ids,
      primaryCalibrationSha256: hash(primaryBytes), nativeFrameSnapshotSha256: primary.nativeFrameSnapshotSha256,
      renderer: renderer.identity, scales: [1, 4], backgrounds: ['white'], renderMode: 'page-coordinates',
      scope: 'Oracle-only ordinary PDF comparison against expanded native driver and six-decimal/±4-sp variants; whole-picture and 140 fixed local regions; prospective limits only',
      toolHashes: Object.fromEntries(await Promise.all(tools.map(async file => [file, hash(await readFile(path.join(root, file)))]))), cases }, null, 2) + '\n');
    console.log(JSON.stringify({ completed: true, cases: cases.length,
      nativePathRecords: cases.reduce((n, c) => n + c.native.pathRecords, 0),
      measurements: cases.reduce((n, c) => n + c.variants.reduce((s, v) => s + v.measurements.length, 0), 0), approvedPolicy: false }));
  } finally { await renderer.browser.close(); }
}
await main().catch(error => { console.error(error.stack ?? String(error)); process.exitCode = 2; });
