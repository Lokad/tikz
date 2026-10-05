// The approved primary route always installs every independently calibrated
// region. Caller-supplied thresholds cannot replace this evidence. The older
// exact experiments and their snapshots remain unchanged.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareBundle, profile } from './compare.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const ids = ['state-paint', 'transforms', 'colors'];
const modes = ['native-css', 'sp-plus', 'sp-minus'];
const roundedMean = checks => Math.ceil(Math.max(...checks.map(c => c.meanForegroundError)) * 1e6) / 1e6;

export async function loadInteractionPolicy(read = readFile) {
  const bytes = await read(path.join(directory, 'interaction-profile.json'));
  const declared = JSON.parse(bytes);
  assert.equal(declared.schemaVersion, 1); assert.equal(declared.approvedPrimaryPolicy, true);
  assert.equal(declared.id, 'chromium-153-node-interactions-rgb-ink-v1');
  assert.equal(declared.calibrationFile, '../../tests/Reference/NodeInteractionsRgb/calibration-ink.json');
  assert.equal(declared.regionalFile, '../../tests/Reference/NodeInteractionsRgb/calibration-regions.json');
  assert.deepEqual(Object.keys(declared.cases), ids);
  const calibrationBytes = await read(path.resolve(directory, declared.calibrationFile));
  const regionalBytes = await read(path.resolve(directory, declared.regionalFile));
  assert.equal(hash(calibrationBytes), declared.calibrationSha256, 'Primary evidence hash differs from policy.');
  assert.equal(hash(regionalBytes), declared.regionalSha256, 'Regional evidence hash differs from policy.');
  const calibration = JSON.parse(calibrationBytes), regional = JSON.parse(regionalBytes);
  for (const evidence of [calibration, regional]) {
    assert.equal(evidence.schemaVersion, 1); assert.equal(evidence.completed, true);
    assert.equal(evidence.converterInvoked, false); assert.equal(evidence.conformanceClaim, false);
    assert.deepEqual(evidence.expectedCases, ids); assert.deepEqual(evidence.cases.map(c => c.caseId), ids);
  }
  assert.equal(regional.baseCalibrationSha256, declared.calibrationSha256);
  assert.deepEqual(regional.scales, profile.scales); assert.deepEqual(regional.backgrounds, ['transparent', 'white', 'black']);
  assert.equal(regional.paddingPixels, 1);
  // Pin the unchanged comparator/region construction used for these raw
  // measurements. A future harness change needs an explicit evidence review.
  for (const [file, sha256] of Object.entries(regional.toolHashes))
    assert.equal(hash(await read(path.join(root, file))), sha256, 'Regional calibration tool changed: ' + file);
  for (const id of ids) {
    const native = calibration.cases.find(c => c.caseId === id);
    const local = regional.cases.find(c => c.caseId === id);
    assert.deepEqual(native.variants.map(v => v.mode), modes); assert.deepEqual(local.variants.map(v => v.mode), modes);
    assert.ok(native.variants.every(v => v.numeric.passed && v.dimensions.passed && v.outlineContainment.passed));
    assert.equal(declared.cases[id].maxDimensionErrorPixels,
      Math.ceil(Math.max(...native.variants.map(v => v.dimensions.maxErrorPixels)) * 1e4) / 1e4,
      'Natural-dimension limits must come from the independent frame experiment.');
    const checks = native.variants.flatMap(v => v.primary.checks);
    assert.equal(checks.length, 18);
    assert.ok(checks.every(c => c.maxEdgeDisplacementPixels !== null && c.referenceComponents === c.actualComponents));
    assert.deepEqual(declared.cases[id].primary, {
      maxChannelError: Math.max(...checks.map(c => c.maxChannelError)), maxMeanForegroundError: roundedMean(checks),
      maxEdgeDisplacementRasterPixels: Math.max(...checks.map(c => c.maxEdgeDisplacementPixels * c.scale)), maxComponentDifference: 0
    }, 'Global limits must be derived only from independent measurements.');
    assert.equal(local.regions.length, declared.cases[id].regions);
    assert.equal(new Set(local.regions.map(r => r.id)).size, local.regions.length);
    for (const region of local.regions) {
      assert.equal(region.limits.length, 6);
      for (const limit of region.limits) {
        const measurements = local.variants.flatMap(v => v.checks).filter(c => c.id === region.id
          && c.scale === limit.scale && c.background === limit.background);
        assert.equal(measurements.length, 3);
        assert.ok(measurements.every(c => c.maxEdgeDisplacementPixels !== null));
        assert.deepEqual(limit, { scale: limit.scale, background: limit.background,
          maxChannelError: Math.max(...measurements.map(c => c.maxChannelError)), maxMeanForegroundError: roundedMean(measurements),
          maxEdgeDisplacementPixels: Math.max(...measurements.map(c => c.maxEdgeDisplacementPixels)),
          maxComponentDifference: Math.max(...measurements.map(c => Math.abs(c.referenceComponents - c.actualComponents))) });
      }
    }
  }
  return { declared, sha256: hash(bytes), calibration, regional };
}

export async function compareInteractionPrimary(bundle, renderer, options = {}) {
  const evidence = await loadInteractionPolicy();
  const { declared, calibration, regional } = evidence;
  // Windows x64 is the calibrated browser distribution. Windows version is
  // recorded in every report; hosted execution still needs verification.
  for (const key of ['profile', 'playwright', 'browser', 'browserSha256', 'profileSha256', 'os', 'architecture', 'node'])
    assert.equal(renderer.identity[key], regional.renderer[key], 'Interaction policy renderer differs: ' + key);
  const input = JSON.parse(await readFile(path.join(bundle, 'comparison-input.json')));
  const id = options.caseId ?? input.caseId.replace(/^node-/, '');
  assert.ok(ids.includes(id), 'No calibrated interaction case.');
  assert.equal(input.pdf, undefined, 'Interaction PDF policy has not been independently calibrated.');
  assert.equal(input.rasterProfile, undefined, 'Interaction policy cannot inherit another text/node profile.');
  assert.ok(input.actualUnits === undefined || input.actualUnits === 'cssPixels', 'Candidate coordinates must retain CSS units.');
  const native = calibration.cases.find(c => c.caseId === id), local = regional.cases.find(c => c.caseId === id);
  const provenance = native.originalProvenance;
  const pins = { 'source.tikz': provenance.sourceHashes['tests/Fixtures/Nodes/' + id + '.tikz'],
    'original-driver.svg': provenance.artifacts['reference.svg'], 'metrics.json': local.metricsSha256,
    'native-positions.log': local.nativePositionsSha256 };
  if (!options.imageOnlyExperiment) pins['reference.svg'] = native.variants[0].referenceSha256;
  for (const [file, sha256] of Object.entries(pins))
    assert.equal(hash(await readFile(path.join(bundle, file))), sha256, 'Interaction fixture artifact differs: ' + file);
  const metrics = JSON.parse(await readFile(path.join(bundle, 'metrics.json')));
  assert.deepEqual(input.referenceOriginBp, metrics.geometry.svgOriginBp, 'Physical registration cannot be fitted.');
  assert.equal(input.referenceMode, 'derived-ink-reference; original-driver.svg retained');
  assert.ok(input.numeric && Array.isArray(input.numeric.checks));
  if (!options.imageOnlyExperiment) {
    assert.equal(input.numeric.checks.length, declared.cases[id].numericChecks);
    assert.equal(input.numeric.passed, input.numeric.checks.every(c => c.passed), 'Inconsistent numeric verdict.');
  } else input.numeric = { passed: true, checks: [], note: 'Controlled image-only experiment; no semantic conformance claim.' };
  const key = declared.id + '-' + id;
  profile.cases[key] = { primary: declared.cases[id].primary };
  input.toleranceProfile = key; input.exactPrimary = false;
  input.numericTolerancePixels = declared.cases[id].maxDimensionErrorPixels;
  input.regionalChecks = structuredClone(local.regions);
  if (options.imageOnlyExperiment && options.syntheticRegions) input.regionalChecks.push(...options.syntheticRegions);
  input.scope = declared.scope + '; required global AND all regional gates; '
    + (options.imageOnlyExperiment ? 'IMAGE-ONLY EXPERIMENT; numeric bypass; no conformance claim' : 'native numeric gates; independent PDF gate pending');
  await writeFile(path.join(bundle, 'comparison-input.json'), JSON.stringify(input, null, 2) + '\n');
  const report = await compareBundle(bundle, renderer);
  assert.equal(report.primary.regionalChecks.length, input.regionalChecks.length * 6);
  const originalEmbedded = JSON.stringify(report).replaceAll('<', '\\u003c');
  report.rasterPolicy = { id: declared.id, sha256: evidence.sha256, approvedPrimaryPolicy: !options.imageOnlyExperiment,
    calibrationSha256: declared.calibrationSha256, regionalSha256: declared.regionalSha256, scope: declared.scope };
  report.toolHashes = Object.fromEntries(await Promise.all(['interaction-primary.mjs', 'compare-interaction-primary.mjs', 'compare.mjs']
    .map(async file => ['tools/TikzVisual/' + file, hash(await readFile(path.join(directory, file)))])));
  await writeFile(path.join(bundle, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  const viewer = await readFile(path.join(bundle, 'index.html'), 'utf8');
  const marker = '<script>const report=' + originalEmbedded + ';';
  assert.ok(viewer.includes(marker), 'Inspection viewer report binding changed.');
  const label = options.imageOnlyExperiment ? 'Controlled image-only experiment; numeric gates bypassed.'
    : 'Calibrated primary match policy; independent PDF gate pending.';
  await writeFile(path.join(bundle, 'index.html'), viewer.replace(marker,
    '<script>const report=' + JSON.stringify(report).replaceAll('<', '\\u003c') + ';')
    .replace('<pre id="metrics">', '<p>Policy: <code>' + declared.id + '</code>. ' + label + '</p><pre id="metrics">'));
  return report;
}
