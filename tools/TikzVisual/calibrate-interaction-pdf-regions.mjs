// Oracle-only cross-renderer measurements; no candidate input, converter,
// glyph resource, or production geometry helper participates.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer } from './compare.mjs';
import { loadInteractionPolicy } from './interaction-primary.mjs';
import { measurePdfRegions } from './pdf-region-renderer.mjs';
import { verifyPdfNativeGeometry } from './pdf-native-geometry.mjs';
import { pdfRegionViewer } from './pdf-region-viewer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
assert.ok(process.argv.length === 2 || process.argv.length === 3 && process.argv[2] === '--page-coordinates',
  'Usage: node calibrate-interaction-pdf-regions.mjs [--page-coordinates]');
const renderMode = process.argv[2] === '--page-coordinates' ? 'page-coordinates' : 'picture-image';
const output = path.join(root, 'artifacts/interaction-pdf-region-calibration' + (renderMode === 'page-coordinates' ? '-page' : ''));
await mkdir(output, { recursive: true }); await rm(path.join(output, 'calibration-evidence.json'), { force: true });
const hash = b => createHash('sha256').update(b).digest('hex');
const evidence = await loadInteractionPolicy();
const renderer = await createRenderer(), cases = [];
try {
  for (const key of ['profile', 'playwright', 'browser', 'browserSha256', 'profileSha256', 'os', 'architecture', 'node'])
    assert.equal(renderer.identity[key], evidence.regional.renderer[key], 'Pinned PDF experiment renderer differs: ' + key);
  for (const c of evidence.calibration.cases) {
    const baseline = path.join(root, 'tests/Reference/NodeInteractionsRgb', c.caseId), original = c.originalProvenance;
    for (const [file, sha256] of Object.entries(original.artifacts))
      assert.equal(hash(await readFile(path.join(baseline, file))), sha256, 'Changed cached oracle: ' + file);
    for (const [file, sha256] of Object.entries(original.sourceHashes))
      assert.equal(hash(await readFile(path.join(root, file))), sha256, 'Changed oracle source/profile: ' + file);
    const nativeAgreement = verifyPdfNativeGeometry(await readFile(path.join(baseline, 'oracle.log'), 'utf8'));
    const metrics = JSON.parse(await readFile(path.join(baseline, 'metrics.json')));
    const sourceText = await readFile(path.join(root, 'tests/Fixtures/Nodes', c.caseId + '.tikz'), 'utf8');
    const glyphOperations = metrics.painting.filter(p => p.kind === 'glyph');
    const pdfPages = Object.fromEntries(await Promise.all([1, 4].map(async scale => [scale,
      'data:image/png;base64,' + (await readFile(path.join(baseline, 'pdf-page-' + scale + 'x.png'))).toString('base64')])));
    const local = evidence.regional.cases.find(r => r.caseId === c.caseId);
    const nativeFolder = path.join(root, 'artifacts/node-interaction-svg-calibration-rgb-ink', c.caseId, 'native-css');
    const nativeSvg = await readFile(path.join(nativeFolder, 'actual.svg'));
    assert.equal(hash(nativeSvg), c.variants[0].derivedSha256);
    const frame = c.variants[0].frame.expanded, origin = metrics.geometry.svgOriginBp;
    const minX = Math.floor((frame[0] - origin.x) * 4 / 3) - 8, minY = Math.floor((frame[1] - origin.y) * 4 / 3) - 8;
    const maxX = Math.ceil((frame[0] + frame[2] - origin.x) * 4 / 3) + 8;
    const maxY = Math.ceil((frame[1] + frame[3] - origin.y) * 4 / 3) + 8;
    const regions = [{ id: 'whole-picture', rectanglePixels: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } },
      ...local.regions.map(({ id, rectanglePixels, basis, actualElementId }) => {
        const definition = { id, rectanglePixels, basis, actualElementId };
        if (id.startsWith('glyph-')) {
          const nativeNode = glyphOperations[Number(id.slice(6))]?.node;
          assert.ok(nativeNode); const offset = sourceText.indexOf('(' + nativeNode + ')');
          assert.ok(offset >= 0, 'Native node identifier is absent from the trusted source.');
          definition.nativeNode = nativeNode; definition.sourceLine = sourceText.slice(0, offset).split('\n').length;
        }
        return definition;
      })];
    const variants = [];
    for (const mode of ['native-css', 'sp-plus', 'sp-minus', 'original-ink-driver']) {
      const source = mode === 'original-ink-driver' ? nativeFolder
        : path.join(root, 'artifacts/node-interaction-svg-calibration-rgb-ink', c.caseId, mode);
      const file = mode === 'original-ink-driver' ? 'reference.svg' : 'actual.svg';
      const svg = await readFile(path.join(source, file));
      const expected = mode === 'original-ink-driver' ? c.variants[0].referenceSha256 : c.variants.find(v => v.mode === mode).derivedSha256;
      assert.equal(hash(svg), expected);
      const input = { svg: svg.toString('utf8'), pdfPages, renderMode,
        units: mode === 'original-ink-driver' ? 'bp' : 'cssPixels',
        svgOriginBp: mode === 'original-ink-driver' ? origin : undefined,
        pdfOriginPixels: metrics.geometry.pdfOriginPixels, regions, captureIds: ['whole-picture'] };
      const measured = await measurePdfRegions(renderer.page, input);
      const captureIds = ['whole-picture', ...[...measured.results].filter(c => c.scale === 4 && c.id !== 'whole-picture')
        .sort((a, b) => b.meanForegroundError - a.meanForegroundError || a.id.localeCompare(b.id)).slice(0, 5).map(c => c.id)];
      const repeat = await measurePdfRegions(renderer.page, { ...input, captureIds });
      assert.deepEqual(repeat.results, measured.results, 'PDF region measurements did not repeat.');
      for (const name of Object.keys(measured.images)) assert.equal(hash(Buffer.from(repeat.images[name], 'base64')),
        hash(Buffer.from(measured.images[name], 'base64')), 'PDF/SVG capture did not repeat.');
      measured.images = repeat.images;
      const folder = path.join(output, c.caseId, mode);
      assert.ok(folder.startsWith(output + path.sep)); await rm(folder, { recursive: true, force: true }); await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, 'oracle.svg'), svg);
      await writeFile(path.join(folder, 'source.tikz'), sourceText);
      for (const scale of [1, 4]) await writeFile(path.join(folder, 'pdf-page-' + scale + 'x.png'),
        await readFile(path.join(baseline, 'pdf-page-' + scale + 'x.png')));
      const camera = { schemaVersion: 1, caseId: c.caseId, mode, converterInvoked: false,
        units: input.units, svgOriginBp: input.svgOriginBp, pdfOriginPixels: input.pdfOriginPixels, regions, renderMode,
        registration: 'Full measured PDF page rendering; both sides integer-cropped; no fitting or fractional raster resampling' };
      await writeFile(path.join(folder, 'comparison-input.json'), JSON.stringify(camera, null, 2) + '\n');
      const imageHashes = Object.fromEntries(Object.entries(measured.images).map(([name, b]) => [name, hash(Buffer.from(b, 'base64'))]));
      for (const [name, value] of Object.entries(measured.images)) await writeFile(path.join(folder, name), Buffer.from(value, 'base64'));
      delete measured.images;
      measured.regionDefinitions = regions;
      await writeFile(path.join(folder, 'measurements.json'), JSON.stringify(measured, null, 2) + '\n');
      await writeFile(path.join(folder, 'index.html'), pdfRegionViewer(c.caseId, mode, measured, captureIds, sourceText));
      assert.equal(measured.results.length, regions.length * 2);
      const artifactFiles = ['oracle.svg', 'source.tikz', 'comparison-input.json', 'measurements.json', 'index.html', 'pdf-page-1x.png', 'pdf-page-4x.png'];
      variants.push({ mode, svgSha256: hash(svg), repeatedMeasurementsEqual: true, repeatedCaptureHashesEqual: true,
        measurementsSha256: hash(await readFile(path.join(folder, 'measurements.json'))),
        artifactHashes: { ...imageHashes, ...Object.fromEntries(await Promise.all(artifactFiles.map(async f => [f, hash(await readFile(path.join(folder, f)))]))) },
        checks: measured.results });
      console.log(c.caseId + '/' + mode + ': ' + measured.results.length + ' independent PDF region/scale measurements');
    }
    const limits = regions.map(r => ({ ...r, limits: [1, 4].map(scale => {
      const checks = variants.flatMap(v => v.checks).filter(c => c.id === r.id && c.scale === scale);
      const edges = checks.map(c => c.maxEdgeDisplacementPixels);
      return { scale, background: 'white', maxChannelError: Math.max(...checks.map(c => c.maxChannelError)),
        maxMeanForegroundError: Math.ceil(Math.max(...checks.map(c => c.meanForegroundError)) * 1e6) / 1e6,
        maxEdgeDisplacementPixels: edges.some(e => e === null) ? null : Math.max(...edges),
        maxComponentDifference: Math.max(...checks.map(c => Math.abs(c.referenceComponents - c.actualComponents))) };
    }) }));
    cases.push({ caseId: c.caseId, originalProvenance: original, nativeAgreement, pdfOriginPixels: metrics.geometry.pdfOriginPixels,
      regions: limits, variants });
  }
  const files = ['tools/TikzVisual/calibrate-interaction-pdf-regions.mjs', 'tools/TikzVisual/pdf-region-renderer.mjs',
    'tools/TikzVisual/pdf-native-geometry.mjs',
    'tools/TikzVisual/pdf-region-viewer.mjs',
    'tools/TikzVisual/interaction-primary.mjs', 'tools/TikzVisual/compare.mjs', 'tools/TikzVisual/browser-profile.json'];
  await writeFile(path.join(output, 'calibration-evidence.json'), JSON.stringify({ schemaVersion: 1, completed: true,
    converterInvoked: false, approvedPolicy: false, conformanceClaim: false, renderMode,
    scope: 'Ordinary cached PDF pages versus original ink-driver/native CSS/±4-sp oracle SVGs; fixed native glyph/path regions; white paper only',
    baseCalibrationSha256: evidence.declared.calibrationSha256, baseRegionalSha256: evidence.declared.regionalSha256,
    registration: 'Measured PDF page origin; SVG rendered once on the full native page; both sides use integer native-pixel crops; no fitting or fractional raster resampling',
    pixelConvention: '8-bit sRGB RGBA on white; foreground mean includes every visible sample; edge/components use 16/255 mask',
    renderer: renderer.identity, toolHashes: Object.fromEntries(await Promise.all(files.map(async f => [f, hash(await readFile(path.join(root, f)))]))),
    expectedCases: evidence.calibration.expectedCases, cases }, null, 2) + '\n');
} finally { await renderer.browser.close(); }
