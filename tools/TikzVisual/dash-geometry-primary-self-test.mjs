import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { root, sha256, writeArtifact } from './shape-oracle-bundle.mjs';
import { createRenderer } from './compare.mjs';
import { installShapeMetrics } from './dash-geometry-image-pair.mjs';
import { shapeViews, evaluateShapeTrial } from './shape-primary-trial-policy.mjs';
import { captureDashPrimary, verifyDashAssets } from './dash-geometry-primary-common.mjs';
import { dashGeometryImageDefects, mutateDashGeometrySvg } from './dash-geometry-image-defects.mjs';
import { loadDashPrimaryPolicy, validateDashPrimaryCalibration, requireDashPrimaryRenderer, combineDashPrimary,
  dashPrimaryProfileFile, dashPrimaryCalibrationFile, dashPrimaryGuardTools } from './dash-geometry-primary-policy.mjs';

const base = path.join(root, 'artifacts/dash-geometry-primary-controls'), output = path.join(base, 'run-' + randomUUID()), artifacts = {}, results = [];
const save = (p, bytes) => writeArtifact(output, p, bytes, artifacts);
const relative = p => path.relative(root, p).split(path.sep).join('/');
async function main() {
  assert.equal(process.argv.length, 2); const renderer = await createRenderer();
  try {
    await installShapeMetrics(renderer); const evidence = await loadDashPrimaryPolicy(renderer);
    const rejected = async (name, fn, category) => {
      await assert.rejects(fn); results.push({ name, category, expected: 'rejected', passed: true });
    };
    for (const file of [dashPrimaryCalibrationFile, 'tests/Reference/DashGeometry/snapshot.json', 'tests/Reference/DashGeometry/native/reference.svg',
      'tests/Fixtures/Dashes/geometry.tikz', ...Object.keys(evidence.calibration.toolHashes), ...dashPrimaryGuardTools]) {
      await rejected('missing-' + file, () => loadDashPrimaryPolicy(renderer, async p => {
        if (relative(p) === file) throw new Error('Controlled missing evidence'); return readFile(p);
      }), 'missing evidence');
      await rejected('changed-' + file, () => loadDashPrimaryPolicy(renderer, async p => {
        const bytes = await readFile(p); return relative(p) === file ? Buffer.concat([bytes, Buffer.from(' ')]) : bytes;
      }), 'changed evidence');
    }
    for (const [name, change] of [
      ['borrowed-policy', p => { p.id = 'chromium-153-rectangle-borders-ink-pdf-v1'; }],
      ['borrowed-scope', p => { p.scope = 'All paths and TikZ libraries'; }],
      ['claimed-PDF-admission', p => { p.approvedPdfPolicy = true; }],
      ['claimed-overall-conformance', p => { p.overallVerdict = 'pass'; }],
      ['unapproved-primary', p => { p.approvedPrimaryPolicy = false; }],
      ['partial-native-count', p => { p.nativeChecks--; }],
      ['partial-frame-count', p => { p.frameChecks--; }],
      ['missing-required-view', p => { p.requiredViews.pop(); }],
      ['missing-guard', p => { delete p.guardToolHashes[dashPrimaryGuardTools[0]]; }],
      ['fitted-camera', p => { p.camera.x++; }],
      ['candidate-selected-region', p => { p.regions[0].rectangle.width++; }],
      ['widened-global-limit', p => { p.limits.rows[0].whole.maxRawChannelError = 255; }],
      ['widened-local-limit', p => { p.limits.rows[0].regions[0].limits.meanForegroundChannelError = 255; }]
    ]) {
      const profile = structuredClone(evidence.profile); change(profile);
      await rejected(name, () => loadDashPrimaryPolicy(renderer, p => relative(p) === dashPrimaryProfileFile ? Buffer.from(JSON.stringify(profile)) : readFile(p)), 'policy mutation');
    }
    const rehashed = structuredClone(evidence.calibration); rehashed.measurements[0].metrics.maxRawChannelError = 255;
    const changedBytes = Buffer.from(JSON.stringify(rehashed)), changedProfile = structuredClone(evidence.profile);
    changedProfile.calibration.sha256 = sha256(changedBytes);
    await rejected('consistently-rehashed-unreviewed-calibration', () => loadDashPrimaryPolicy(renderer, p => relative(p) === dashPrimaryProfileFile
      ? Buffer.from(JSON.stringify(changedProfile)) : relative(p) === dashPrimaryCalibrationFile ? changedBytes : readFile(p)), 'reviewed digest');
    // Check intrinsic validation separately from the immutable byte pin.
    for (const [name, change] of [
      ['candidate-contributed-calibration', c => { c.converterInvoked = true; }],
      ['candidate-contributed-observation', c => { c.measurements[0].converterInvoked = true; }],
      ['missing-observation', c => { c.measurements.pop(); }],
      ['duplicate-observation', c => { c.measurements[1] = structuredClone(c.measurements[0]); }],
      ['unrepeated-observation', c => { c.measurements[0].repeat.exactRgbaMatch = false; }],
      ['missing-local-region', c => { c.measurements[0].regions.pop(); }],
      ['nonfinite-local-error', c => { c.measurements[0].regions[0].meanForegroundChannelError = NaN; }],
      ['widened-derived-limit', c => { c.derived.policy.rows[0].whole.rawChangedPixels++; }],
      ['fitted-independent-camera', c => { c.geometry.camera.x++; }],
      ['widened-native-root-budget', c => { c.geometry.rootChecks[0].limit = 1; }],
      ['changed-independent-clip-binding', c => { c.geometry.styles[13].clips = [1]; }],
      ['changed-independent-SVG', c => { c.representations[0].svg += ' '; }],
      ['missing-replay', c => { c.replays.pop(); }],
      ['unrepeated-replay', c => { c.replays[0].comparisons[0].imageHashes.actual = '0'.repeat(64); }],
      ['missing-visible-defect', c => { c.defects.pop(); }],
      ['changed-defect-target', c => { c.defects[0].targetRegion = 'path-15'; }],
      ['untargeted-defect-rejection', c => { c.defects[0].comparisons[0].regions[0] = structuredClone(c.measurements.find(r => r.name === 'printed-pen-hull-driver-width-elements'
        && r.frame === 'natural' && r.scale === 1 && r.background === 'white').regions[0]); }],
      ['missing-visibility-control', c => { c.visibility.pop(); }],
      ['false-subpixel-visibility', c => { c.visibility[1].comparisons[0].imageHashes.actual = '0'.repeat(64); }]
    ]) {
      const calibration = structuredClone(evidence.calibration); change(calibration);
      await rejected(name, () => validateDashPrimaryCalibration(calibration, evidence.reconstruction, renderer), 'intrinsic evidence validation');
    }
    for (const key of ['profile', 'browser', 'browserSha256', 'node', 'os', 'architecture', 'headless', 'deviceScaleFactor', 'viewport', 'launchArguments']) {
      const identity = structuredClone(renderer.identity); identity[key] = 'controlled incompatible renderer';
      assert.throws(() => requireDashPrimaryRenderer(identity, evidence.calibration.renderer));
      results.push({ name: 'wrong-renderer-' + key, category: 'renderer contract', expected: 'rejected', passed: true });
    }
    const rows = evidence.calibration.measurements.filter(r => r.name === 'printed-pen-hull-driver-width-elements');
    const goodNumeric = { state: 'passed', executedChecks: 1090 }, goodFrame = { state: 'passed', executedChecks: 6 };
    assert.equal(combineDashPrimary(evidence, goodNumeric, goodFrame, rows).verdict, 'primary-pass');
    results.push({ name: 'unchanged-gate-positive-control', category: 'combined gate', expected: 'primary-pass', passed: true });
    for (const gate of ['numeric', 'frame']) {
      const verdict = combineDashPrimary(evidence, gate === 'numeric' ? { ...goodNumeric, state: 'failed' } : goodNumeric,
        gate === 'frame' ? { ...goodFrame, state: 'failed' } : goodFrame, rows);
      assert.equal(verdict.passed, false); assert.equal(verdict.firstFailedGate, gate);
      results.push({ name: 'matching-images-cannot-override-' + gate, category: 'combined gate', expected: 'mismatch', passed: true });
    }
    assert.throws(() => combineDashPrimary(evidence, goodNumeric, goodFrame, rows.slice(1)));
    assert.throws(() => combineDashPrimary(evidence, { ...goodNumeric, executedChecks: 1089 }, goodFrame, rows));
    results.push({ name: 'missing-image-or-native-coverage', category: 'combined gate', expected: 'rejected', passed: true });
    const pointer = JSON.parse(await readFile(path.join(root, 'artifacts/dash-geometry-primary/latest.json')));
    assert.equal(pointer.completed, true); const candidateFile = path.join(root, 'artifacts/dash-geometry-primary', pointer.report);
    const candidateBytes = await readFile(candidateFile), candidate = JSON.parse(candidateBytes);
    assert.equal(sha256(candidateBytes), pointer.sha256); assert.equal(candidate.verdict, 'primary-pass'); assert.equal(candidate.policySha256, evidence.profileSha256);
    for (const [p, h] of Object.entries(candidate.artifacts)) assert.equal(sha256(await readFile(path.join(path.dirname(candidateFile), p))), h);
    const actual = await readFile(path.join(path.dirname(candidateFile), 'candidate-evidence/actual.svg'), 'utf8');
    await save('candidate-input.svg', actual); await save('candidate-report.json', candidateBytes);
    const imageDefects = [];
    for (const defect of dashGeometryImageDefects) {
      const svg = await renderer.page.evaluate(mutateDashGeometrySvg, { actual, defect }); await save('defects/' + defect.name + '.svg', svg);
      const comparisons = await captureDashPrimary(renderer, { native: evidence.native, reconstruction: evidence.reconstruction,
        variant: { name: 'defect-' + defect.name, svg }, policy: evidence.policy, output, artifacts, cropIds: ['path-' + defect.pathIndex],
        views: shapeViews.filter(v => v.background === 'white' && (defect.name !== 'root-crop' || v.frame === 'natural')) });
      assert.ok(comparisons.every(r => !r.evaluation.passed && r.evaluation.checks.some(c => c.id === 'path-' + defect.pathIndex && !c.passed)));
      results.push({ name: 'visible-' + defect.name, category: 'candidate image-only defect', expected: 'mismatch in every target view', passed: true });
      imageDefects.push({ ...defect, numericGatesBypassed: true, comparisons });
    }
    await loadDashPrimaryPolicy(renderer); await verifyDashAssets(output, artifacts);
    await save('index.html', '<!doctype html><meta charset="utf-8"><h1>Dash primary policy controls</h1><a href="report.json">Report</a>'
      + imageDefects.flatMap(d => d.comparisons.filter(r => r.artifacts.comparison).map(r => '<h2>' + d.name + '</h2>'
        + r.regions.filter(r => r.crops).map(r => '<img style="max-width:100%" src="' + r.crops.sheet + '">').join(''))).join(''));
    const report = { completed: true, passed: true, policyId: evidence.profile.id, policySha256: evidence.profileSha256,
      controls: results, imageDefects, artifacts, overallVerdict: 'pending', pdf: { state: 'pending' } };
    await writeArtifact(output, 'report.json', JSON.stringify(report, null, 2) + '\n');
    await writeArtifact(base, 'latest.json', JSON.stringify({ completed: true, report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'),
      sha256: sha256(await readFile(path.join(output, 'report.json'))) }, null, 2) + '\n');
    console.log('Dash primary policy controls: ' + results.length + ' pass, including nineteen image-only defects with numeric gates bypassed.');
  } finally { await renderer.browser.close(); }
}
await main().catch(async error => { process.exitCode = 2; console.error(error.stack);
  await writeArtifact(output, 'report.json', JSON.stringify({ completed: false, passed: false, error: error.message, controls: results, artifacts }, null, 2) + '\n'); });
