// Oracle-only primary precision experiment for the separately manifested
// rectangle-border paths. The frame and local regions precede candidate data.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer, compareBundle, profile } from './compare.mjs';

async function main() {
  assert.equal(process.argv.length, 2, 'This trusted-corpus experiment accepts no arguments.');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const output = path.join(root, 'artifacts/border-region-calibration');
  const precisionFolder = path.join(root, 'artifacts/border-framed-precision');
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const ids = ['node-border-lines', 'node-border-paths', 'node-border-transforms'];
  const modes = ['flattened', 'precision-plus', 'precision-minus'];
  const backgrounds = ['transparent', 'white', 'black'];
  const frameBytes = await readFile(path.join(root, 'tests/Reference/NodeBorders/framing.json'));
  const frameEvidence = JSON.parse(frameBytes);
  const precisionBytes = await readFile(path.join(precisionFolder, 'calibration-evidence.json'));
  const precisionEvidence = JSON.parse(precisionBytes);
  assert.equal(frameEvidence.completed, true); assert.equal(frameEvidence.converterInvoked, false);
  assert.equal(frameEvidence.approvedPolicy, false); assert.equal(frameEvidence.conformanceClaim, false);
  assert.deepEqual(frameEvidence.expectedCases, ids); assert.deepEqual(frameEvidence.cases.map(c => c.caseId), ids);
  assert.equal(precisionEvidence.converterInvoked, false); assert.deepEqual(precisionEvidence.cases.map(c => c.caseId), ids);
  for (const evidence of [frameEvidence, precisionEvidence])
    for (const [file, expected] of Object.entries(evidence.toolHashes))
      assert.equal(hash(await readFile(path.join(root, file))), expected, 'Independent precision tool changed: ' + file);
  await mkdir(output, { recursive: true });
  await rm(path.join(output, 'evidence.json'), { force: true });
  const renderer = await createRenderer();
  const cases = [];
  const selectedChecks = checks => checks.map(({ id, scale, background, pixelCrop, changedPixels, exactMatch,
    maxChannelError, meanForegroundError, foregroundPixels, maxEdgeDisplacementPixels, referenceComponents, actualComponents }) => ({
    ...(id === undefined ? {} : { id }), scale, background, ...(pixelCrop === undefined ? {} : { pixelCrop }),
    changedPixels, exactMatch, maxChannelError, meanForegroundError, foregroundPixels,
    maxEdgeDisplacementPixels, referenceComponents, actualComponents
  }));
  const limits = checks => {
    assert.ok(checks.length > 0 && checks.every(c => c.maxEdgeDisplacementPixels !== null));
    return { maxChannelError: Math.max(...checks.map(c => c.maxChannelError)),
      maxMeanForegroundError: Math.ceil(Math.max(...checks.map(c => c.meanForegroundError)) * 1e6) / 1e6,
      maxEdgeDisplacementPixels: Math.max(...checks.map(c => c.maxEdgeDisplacementPixels)),
      maxComponentDifference: Math.max(...checks.map(c => Math.abs(c.referenceComponents - c.actualComponents))) };
  };
  try {
    for (const key of ['profile', 'playwright', 'browser', 'browserSha256', 'profileSha256', 'os', 'osRelease', 'architecture', 'node'])
      assert.equal(renderer.identity[key], precisionEvidence.renderer[key], 'Independent precision renderer changed: ' + key);
    for (const item of frameEvidence.cases) {
      const native = precisionEvidence.cases.find(c => c.caseId === item.caseId);
      assert.deepEqual(native.variants.map(v => v.mode), modes);
      assert.equal(native.sourceSha256, item.sourceSha256);
      assert.equal(native.referenceSvgSha256, item.originalProvenance.artifacts['reference.svg']);
      assert.equal(native.referenceMetricsSha256, item.originalProvenance.artifacts['reference-metrics.json']);
      const original = await readFile(path.join(root, 'tests/Reference', item.caseId, 'reference.svg'));
      assert.equal(hash(original), native.referenceSvgSha256);
      const reference = await readFile(path.join(root, 'artifacts/border-native-framing', item.caseId, 'actual.svg'));
      assert.equal(hash(reference), item.expandedOracleSha256);
      const source = await readFile(path.join(root, 'tests/Fixtures', item.caseId + '.tikz'));
      assert.equal(hash(source), item.sourceSha256);
      const variants = [];
      for (const variant of native.variants) {
        assert.equal(variant.provenance.converterInvoked, false);
        assert.equal(variant.numeric.passed, true); assert.equal(variant.dimensions.passed, true);
        const deltaPt = variant.mode === 'flattened' ? 0 : (variant.mode === 'precision-plus' ? 4 : -4) / 65536;
        assert.equal(variant.provenance.perturbationPt, deltaPt);
        const folder = path.join(output, item.caseId, variant.mode);
        assert.ok(folder.startsWith(output + path.sep), 'Border calibration output escapes its artifact directory.');
        await rm(folder, { recursive: true, force: true }); await mkdir(folder, { recursive: true });
        const raw = await readFile(path.join(precisionFolder, item.caseId, variant.mode, 'actual.svg'));
        assert.equal(hash(raw), variant.oracleRepresentationSha256);
        // Reframe the independent precision representation using the already
        // measured native stroke envelope. Painted coordinates stay untouched.
        // Fixed ±4-sp variants keep the same predetermined physical expansion.
        const actual = await renderer.page.evaluate(({ svg, box, padding, paths }) => {
          const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
          if (doc.querySelector('parsererror')) throw new Error('Invalid independent precision SVG.');
          const painted = [...doc.querySelectorAll('path')].filter(p => !p.closest('defs,clipPath'));
          if (painted.length !== paths) throw new Error('Native path correspondence differs.');
          for (const p of painted)
            for (let a = p; a; a = a.parentElement)
              if (a.hasAttribute('transform')) throw new Error('Unexpected painted transform in flattened native representation.');
          const number = v => (Math.abs(v) < 0.0000005 ? 0 : v).toFixed(6).replace(/\.?0+$/, '');
          const width = box.maxX - box.minX + 2 * padding, height = box.maxY - box.minY + 2 * padding;
          doc.documentElement.setAttribute('viewBox', [box.minX - padding, box.minY - padding, width, height].map(number).join(' '));
          doc.documentElement.setAttribute('width', number(width) + 'px');
          doc.documentElement.setAttribute('height', number(height) + 'px');
          return new XMLSerializer().serializeToString(doc);
        }, { svg: raw.toString('utf8'), box: item.frame.expandedPixels,
          padding: Math.abs(deltaPt) * 96 / 72.27, paths: item.frame.paths.length });
        for (const [file, bytes] of Object.entries({ 'reference.svg': reference, 'original-driver.svg': original,
          'actual.svg': actual, 'source.tikz': source, 'actual-scene.json': JSON.stringify({ paths: [], converterInvoked: false }) }))
          await writeFile(path.join(folder, file), bytes);
        // The driver's printed scale and exact TeX-pt/CSS conversion differ
        // slightly. Bound that independent frame conversion plus two fixed
        // padding extents and six-decimal serialization; no candidate is read.
        const box = item.frame.expandedPixels;
        const frameConversionErrorPixels = Math.max(
          Math.abs(box.maxX - box.minX - item.frame.camera.expanded[2] * 4 / 3),
          Math.abs(box.maxY - box.minY - item.frame.camera.expanded[3] * 4 / 3));
        const frameExpansionPixels = 2 * Math.abs(deltaPt) * 96 / 72.27;
        const dimensionErrorBoundPixels = frameConversionErrorPixels + frameExpansionPixels + 0.0000005 + 1e-12;
        const numericTolerancePixels = Math.max(variant.provenance.calibrationNumericTolerancePixels, dimensionErrorBoundPixels);
        const input = { schemaVersion: 1, caseId: item.caseId + '-border-region-calibration',
          referenceMode: 'independent-native-stroke-frame; original-driver.svg retained', referenceOriginBp: { x: 0, y: 0 },
          actualUnits: 'cssPixels', actualLabel: 'Independent native precision representation', exactPrimary: true,
          scope: 'Oracle-only primary precision measurements; fixed native path/miter regions; no converter or admitted policy',
          numericTolerancePixels, numeric: variant.numeric, regionalChecks: item.regions };
        await writeFile(path.join(folder, 'comparison-input.json'), JSON.stringify(input, null, 2) + '\n');
        const first = await compareBundle(folder, renderer);
        assert.equal(first.numeric.passed, true); assert.equal(first.dimensions.passed, true);
        assert.equal(first.primary.checks.length, 6);
        assert.equal(first.primary.regionalChecks.length, item.regions.length * 6);
        const repeated = await compareBundle(folder, renderer);
        assert.deepEqual(repeated.primary, first.primary, 'Independent primary measurements did not repeat.');
        assert.deepEqual(repeated.dimensions, first.dimensions);
        const pngs = Object.keys(first.artifacts).filter(file => file.endsWith('.png'));
        for (const file of pngs) assert.equal(repeated.artifacts[file], first.artifacts[file], 'Independent capture changed: ' + file);
        variants.push({ mode: variant.mode, perturbationPt: deltaPt,
          sourceRepresentationSha256: hash(raw), representationSha256: hash(actual), svg: actual,
          precisionProvenance: variant.provenance,
          framePrecision: { frameConversionErrorPixels, frameExpansionPixels, serializationErrorPixels: 0.0000005,
            dimensionErrorBoundPixels, calibrationDimensionTolerancePixels: numericTolerancePixels },
          numeric: first.numeric, dimensions: first.dimensions,
          repeatedMeasurements: true, repeatedCaptures: true, primary: selectedChecks(first.primary.checks),
          regions: selectedChecks(first.primary.regionalChecks), artifacts: first.artifacts });
        console.log(item.caseId + '/' + variant.mode + ': ' + first.primary.regionalChecks.length + ' repeated oracle-only local measurements');
      }
      const regions = item.regions.map(({ limits: unused, ...region }) => ({ ...region,
        limits: profile.scales.flatMap(scale => backgrounds.map(background => {
          const checks = variants.flatMap(v => v.regions).filter(c => c.id === region.id && c.scale === scale && c.background === background);
          assert.equal(checks.length, 3);
          return { scale, background, ...limits(checks) };
        })) }));
      cases.push({ caseId: item.caseId, sourceSha256: item.sourceSha256, originalProvenance: item.originalProvenance,
        referenceSha256: hash(reference), referenceSvg: reference.toString('utf8'), frame: item.frame,
        regions, variants, prospectiveGlobalLimits: limits(variants.flatMap(v => v.primary)) });
    }
    const tools = ['tools/TikzVisual/calibrate-border-regions.mjs', 'tools/TikzVisual/compare.mjs',
      'tools/TikzVisual/browser-profile.json', 'tools/TikzReference/ReferenceCalibration.cs'];
    await writeFile(path.join(output, 'evidence.json'), JSON.stringify({ schemaVersion: 1, completed: true,
      converterInvoked: false, approvedPolicy: false, conformanceClaim: false, expectedCases: ids,
      nativeFrameSnapshotSha256: hash(frameBytes), basePrecisionEvidenceSha256: hash(precisionBytes),
      basePrecisionEvidence: precisionEvidence, renderer: renderer.identity, scales: profile.scales, backgrounds,
      scope: 'Native stroke frame and 140 independently fixed path/miter regions; original oracle and six-decimal/±4-sp precision variants; raw measurements and prospective limits only',
      toolHashes: Object.fromEntries(await Promise.all(tools.map(async file => [file, hash(await readFile(path.join(root, file)))]))), cases }, null, 2) + '\n');
    console.log(JSON.stringify({ completed: true, cases: cases.length,
      measurements: cases.reduce((n, c) => n + c.variants.reduce((s, v) => s + v.regions.length, 0), 0),
      converterInvoked: false, approvedPolicy: false }));
  } finally { await renderer.browser.close(); }
}
await main().catch(error => { console.error(error.stack ?? String(error)); process.exitCode = 2; });
