// Test prospective PDF limits against the same image-only border defects.
// No PDF allowance is learned from candidate results or these mutations.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer } from './compare.mjs';
import { measurePdfRegions } from './pdf-region-renderer.mjs';
import { pdfRegionViewer } from './pdf-region-viewer.mjs';

async function main() {
  assert.equal(process.argv.length, 2, 'The trusted border PDF trial accepts no arguments.');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const output = path.join(root, 'artifacts/border-pdf-region-trial');
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const pdfBytes = await readFile(path.join(root, 'artifacts/border-pdf-region-calibration/evidence.json'));
  const pdfEvidence = JSON.parse(pdfBytes);
  const primaryBytes = await readFile(path.join(root, 'artifacts/border-region-trial/suite.json'));
  const primary = JSON.parse(primaryBytes);
  assert.equal(pdfEvidence.completed, true); assert.equal(pdfEvidence.converterInvoked, false);
  assert.equal(pdfEvidence.approvedPolicy, false); assert.equal(pdfEvidence.conformanceClaim, false);
  assert.equal(primary.completed, true); assert.equal(primary.passed, true); assert.equal(primary.approvedPolicy, false);
  assert.equal(pdfEvidence.primaryCalibrationSha256, primary.calibrationSha256);
  assert.deepEqual(pdfEvidence.expectedCases, primary.expectedCases);
  assert.deepEqual(pdfEvidence.cases.map(c => c.caseId), primary.expectedCases);
  assert.equal(primary.trials.length, 27); assert.ok(primary.trials.every(t => t.requirementMet));
  for (const evidence of [pdfEvidence, primary])
    for (const [file, sha256] of Object.entries(evidence.toolHashes))
      assert.equal(hash(await readFile(path.join(root, file))), sha256, 'Border PDF trial input tool changed: ' + file);
  await mkdir(output, { recursive: true }); await rm(path.join(output, 'suite.json'), { force: true });
  const renderer = await createRenderer();
  const trials = [];
  try {
    for (const key of ['profile', 'playwright', 'browser', 'browserSha256', 'profileSha256', 'os', 'osRelease', 'architecture', 'node'])
      assert.equal(renderer.identity[key], pdfEvidence.renderer[key], 'Border PDF trial renderer differs: ' + key);
    for (const item of pdfEvidence.cases) {
      const baseline = path.join(root, 'tests/Reference', item.caseId);
      const pdfPages = {};
      for (const scale of [1, 4]) {
        const bytes = await readFile(path.join(baseline, 'pdf-page-' + scale + 'x.png'));
        assert.equal(hash(bytes), item.originalProvenance.artifacts['pdf-page-' + scale + 'x.png']);
        pdfPages[scale] = 'data:image/png;base64,' + bytes.toString('base64');
      }
      for (const trial of primary.trials.filter(t => t.caseId === item.caseId)) {
        const sourceFolder = path.join(root, 'artifacts/border-region-trial', item.caseId, trial.mutation);
        const svg = await readFile(path.join(sourceFolder, 'actual.svg'), 'utf8');
        const source = await readFile(path.join(sourceFolder, 'source.tikz'));
        assert.equal(hash(svg), trial.actualSha256); assert.equal(hash(source), item.sourceSha256);
        const input = { svg, units: 'cssPixels', svgOriginBp: { x: 0, y: 0 }, pdfPages,
          pdfOriginPixels: item.pdfOriginPixels, regions: item.regions, renderMode: 'page-coordinates', captureIds: ['whole-picture'] };
        const measured = await measurePdfRegions(renderer.page, input);
        assert.equal(measured.results.length, item.regions.length * 2);
        const checks = measured.results.map(check => {
          const region = item.regions.find(r => r.id === check.id);
          const limit = region.limits.find(l => l.scale === check.scale && l.background === check.background);
          assert.ok(limit, 'Missing independent PDF limit.');
          const passed = check.maxEdgeDisplacementPixels !== null && check.maxChannelError <= limit.maxChannelError
            && check.meanForegroundError <= limit.maxMeanForegroundError
            && check.maxEdgeDisplacementPixels <= limit.maxEdgeDisplacementPixels
            && Math.abs(check.referenceComponents - check.actualComponents) <= limit.maxComponentDifference;
          return { ...check, limit, passed };
        });
        const pdfPassed = checks.every(c => c.passed);
        const expected = trial.mutation.startsWith('unchanged') || trial.mutation === 'numeric-failure' ? 'pass' : 'mismatch';
        const targetedRegionRejected = expected === 'pass' || trial.targetPrefix === null || checks.some(c => !c.passed
          && (trial.targetPrefix.endsWith('-') ? c.id.startsWith(trial.targetPrefix) : c.id === trial.targetPrefix));
        const requirementMet = (pdfPassed ? 'pass' : 'mismatch') === expected && targetedRegionRejected;
        const failedIds = [...new Set(checks.filter(c => !c.passed).map(c => c.id))].slice(0, 5);
        const captures = ['whole-picture', ...failedIds.filter(id => id !== 'whole-picture')];
        const repeated = await measurePdfRegions(renderer.page, { ...input, captureIds: captures });
        assert.deepEqual(repeated.results, measured.results, 'Border PDF trial measurements did not repeat.');
        for (const [file, bytes] of Object.entries(measured.images))
          assert.equal(hash(Buffer.from(bytes, 'base64')), hash(Buffer.from(repeated.images[file], 'base64')));
        const folder = path.join(output, item.caseId, trial.mutation);
        assert.ok(folder.startsWith(output + path.sep), 'Border PDF trial escapes its artifact directory.');
        await rm(folder, { recursive: true, force: true }); await mkdir(folder, { recursive: true });
        await writeFile(path.join(folder, 'actual.svg'), svg); await writeFile(path.join(folder, 'source.tikz'), source);
        await writeFile(path.join(folder, 'actual-scene.json'), await readFile(path.join(sourceFolder, 'actual-scene.json')));
        await writeFile(path.join(folder, 'comparison-input.json'), JSON.stringify({ schemaVersion: 1,
          caseId: item.caseId, mutation: trial.mutation, units: input.units, svgOriginBp: input.svgOriginBp,
          pdfOriginPixels: input.pdfOriginPixels, regions: input.regions, renderMode: input.renderMode,
          numericBypassed: true, approvedPolicy: false, actualSha256: trial.actualSha256,
          traceScope: 'Original candidate source trace; controlled image mutation does not change the trace',
          pdfPageHashes: Object.fromEntries([1, 4].map(scale => [scale, item.originalProvenance.artifacts['pdf-page-' + scale + 'x.png']]))
        }, null, 2) + '\n');
        const images = Object.keys(repeated.images);
        for (const [file, bytes] of Object.entries(repeated.images)) await writeFile(path.join(folder, file), Buffer.from(bytes, 'base64'));
        const inspectionFiles = [];
        for (const id of captures.filter(id => id !== 'whole-picture')) {
          const png = await renderer.page.evaluate(async ({ pngs }) => {
            const loaded = await Promise.all(pngs.map(async data => {
              const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode(); return image;
            }));
            const multiplier = Math.min(12, Math.max(1, Math.ceil(128 / Math.max(loaded[0].width, loaded[0].height))));
            const w = loaded[0].width * multiplier, h = loaded[0].height * multiplier, padding = 12;
            const canvas = document.createElement('canvas'); canvas.width = 3 * w + 4 * padding; canvas.height = h + 40;
            const context = canvas.getContext('2d'); context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
            context.imageSmoothingEnabled = false; context.font = '12px sans-serif'; context.fillStyle = 'black';
            for (const [index, image] of loaded.entries()) {
              context.fillText(['PDF (4x)', 'Candidate (4x)', 'Difference (16x gain)'][index], padding + index * (w + padding), 16, w);
              context.drawImage(image, padding + index * (w + padding), 28, w, h);
            }
            return canvas.toDataURL('image/png').split(',')[1];
          }, { pngs: ['pdf', 'svg', 'difference'].map(label => repeated.images[id + '-4x-' + label + '.png']) });
          const file = id + '-inspection.png'; inspectionFiles.push(file);
          await writeFile(path.join(folder, file), Buffer.from(png, 'base64'));
        }
        delete repeated.images; repeated.results = checks; repeated.regionDefinitions = item.regions;
        await writeFile(path.join(folder, 'measurements.json'), JSON.stringify(repeated, null, 2) + '\n');
        const viewer = pdfRegionViewer(item.caseId, trial.mutation, repeated, captures, source.toString('utf8'), {
          scope: 'Unapproved candidate image-only PDF trial. Native numeric gates are bypassed. Limits come from independent oracle evidence.',
          svgFile: 'actual.svg', svgLabel: 'Candidate SVG with controlled mutation'
        }).replace('<h1>', '<p><a href="actual-scene.json">Original candidate source trace</a> · Enlarged PNGs: '
          + inspectionFiles.map(file => '<a href="' + file + '">' + file + '</a>').join(' · ') + '</p><h1>');
        await writeFile(path.join(folder, 'index.html'), viewer);
        trials.push({ caseId: item.caseId, mutation: trial.mutation, expected, verdict: pdfPassed ? 'pass' : 'mismatch',
          requirementMet, targetedRegionRejected, numericBypassed: true,
          primaryPassed: trial.primary, dimensionsPassed: trial.dimensions, primaryNumericPassed: trial.numeric,
          pdfPassed, actualSha256: trial.actualSha256, sourceSha256: item.sourceSha256, repeatedMeasurements: true,
          checks, artifacts: Object.fromEntries(await Promise.all(['actual.svg', 'source.tikz', 'actual-scene.json', 'comparison-input.json', 'measurements.json', 'index.html',
            ...images, ...inspectionFiles].map(async file => [file, hash(await readFile(path.join(folder, file)))]))) });
        console.log(item.caseId + '/' + trial.mutation + ': PDF ' + (requirementMet ? 'expected ' : 'UNEXPECTED ') + (pdfPassed ? 'pass' : 'mismatch'));
      }
    }
    const passed = trials.every(t => t.requirementMet);
    const tools = ['tools/TikzVisual/trial-border-pdf-regions.mjs', 'tools/TikzVisual/compare.mjs', 'tools/TikzVisual/pdf-region-renderer.mjs', 'tools/TikzVisual/pdf-region-viewer.mjs'];
    await writeFile(path.join(output, 'suite.json'), JSON.stringify({ schemaVersion: 1, completed: true, passed,
      approvedPolicy: false, conformanceClaim: false, expectedCases: pdfEvidence.expectedCases,
      pdfCalibrationSha256: hash(pdfBytes), primaryTrialSha256: hash(primaryBytes), renderer: renderer.identity,
      scope: 'Independent ordinary PDF verdict for repeated unchanged candidates and image-only border defects; numeric gates bypassed; no policy admission',
      toolHashes: Object.fromEntries(await Promise.all(tools.map(async file => [file, hash(await readFile(path.join(root, file)))]))), trials }, null, 2) + '\n');
    console.log(JSON.stringify({ completed: true, passed, trials: trials.length, approvedPolicy: false }));
    process.exitCode = passed ? 0 : 1;
  } finally { await renderer.browser.close(); }
}
await main().catch(error => { console.error(error.stack ?? String(error)); process.exitCode = 2; });
