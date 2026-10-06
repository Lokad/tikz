import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { root, sha256, writeArtifact } from './shape-oracle-bundle.mjs';
import { createRenderer } from './compare.mjs';
import { installShapeMetrics } from './dash-geometry-image-pair.mjs';
import { measureShapePdfPair } from './shape-pdf-image-pair.mjs';
import { shapePdfViews, evaluateShapePdfTrial } from './shape-pdf-trial-policy.mjs';
import { dashGeometryImageDefects, mutateDashGeometrySvg } from './dash-geometry-image-defects.mjs';
import { classifyDashPdfDefect, dashPdfViewKey } from './dash-geometry-pdf-trial-policy.mjs';
import { loadDashPdfPolicy, validateDashPdfCalibration, combineDashPdf, dashPdfProfileFile,
  dashPdfCalibrationFile, dashPdfGuardTools } from './dash-geometry-pdf-policy.mjs';

const base = path.join(root, 'artifacts/dash-geometry-pdf-policy-controls'), output = path.join(base, 'run-' + randomUUID()), artifacts = {}, controls = [];
const save = (p, b) => writeArtifact(output, p, b, artifacts), relative = p => path.relative(root, p).split(path.sep).join('/');
async function main() {
  assert.equal(process.argv.length, 2); const renderer = await createRenderer();
  try {
    await installShapeMetrics(renderer); const e = await loadDashPdfPolicy(renderer);
    const reject = async (name, fn, category) => { await assert.rejects(fn); controls.push({ name, category, passed: true }); };
    for (const file of [dashPdfCalibrationFile, 'tests/Reference/DashGeometry/pdf-cairo/pdf-page-1x.png',
      'tests/Reference/DashGeometry/pdf-cairo/pdf-page-4x.png', 'tests/Reference/DashGeometry/native/reference.pdf',
      ...Object.keys(e.calibration.toolHashes), ...dashPdfGuardTools]) {
      await reject('missing-' + file, () => loadDashPdfPolicy(renderer, p => relative(p) === file ? Promise.reject(new Error('Controlled missing evidence')) : readFile(p)), 'missing evidence');
      await reject('changed-' + file, () => loadDashPdfPolicy(renderer, async p => {
        const b = await readFile(p); return relative(p) === file ? Buffer.concat([b, Buffer.from(' ')]) : b;
      }), 'changed evidence');
    }
    for (const [name, change] of [
      ['borrowed-policy', p => p.id = 'different-fixture-policy'], ['borrowed-scope', p => p.scope = 'All TikZ'],
      ['unapproved-pdf', p => p.approvedPdfPolicy = false], ['partial-native', p => p.nativeChecks--],
      ['partial-frame', p => p.frameChecks--], ['partial-pdf-instructions', p => p.pdfInstructionChecks--],
      ['missing-required-view', p => p.requiredViews.pop()], ['changed-primary', p => p.primaryPolicySha256 = '0'.repeat(64)],
      ['missing-guard', p => delete p.guardToolHashes[dashPdfGuardTools[0]]], ['fitted-camera', p => p.camera.origin.x++],
      ['chosen-region', p => p.regions.pop()], ['widened-native-limit', p => p.limits.native.rows[0].regions[0].limits.rawChangedPixels++],
      ['widened-original-limit', p => p.limits.original.rows[0].regions[0].limits.meanForegroundChannelError = 255]
    ]) {
      const p = structuredClone(e.profile); change(p); await reject(name, () => loadDashPdfPolicy(renderer,
        file => relative(file) === dashPdfProfileFile ? Buffer.from(JSON.stringify(p)) : readFile(file)), 'profile mutation');
    }
    const changed = Buffer.concat([e.calibrationBytes, Buffer.from(' ')]), rehashed = structuredClone(e.profile); rehashed.calibration.sha256 = sha256(changed);
    await reject('consistently-rehashed-unreviewed-calibration', () => loadDashPdfPolicy(renderer, p => relative(p) === dashPdfProfileFile
      ? Buffer.from(JSON.stringify(rehashed)) : relative(p) === dashPdfCalibrationFile ? changed : readFile(p)), 'reviewed digest');
    for (const [name, change] of [
      ['candidate-calibration', c => c.converterInvoked = true], ['borrowed-calibration-scope', c => c.scope = 'All TikZ'],
      ['different-renderer', c => c.renderer.browserSha256 = '0'.repeat(64)], ['different-pdf-renderer', c => c.pdfRenderer.sha256 = '0'.repeat(64)],
      ['missing-qualification', c => c.qualification.equivalenceControls.pop()], ['false-equivalence', c => c.qualification.equivalenceControls[0].observedIdentical = false],
      ['unrepeated-pdf-raster', c => c.qualification.commands[0].exactRepeat = false], ['different-dpi', c => c.qualification.commands[0].args[2] = '100'],
      ['fitted-native-origin', c => c.camera.origin.x++], ['chosen-native-region', c => c.regions.pop()],
      ['changed-independent-svg', c => c.representations[1].svg += ' '], ['missing-observation', c => c.observations.pop()],
      ['duplicate-observation', c => c.observations[0] = c.observations[1]], ['missing-local-region', c => c.observations[0].regions.pop()],
      ['nonfinite-error', c => c.observations[0].whole.meanForegroundChannelError = NaN], ['widened-envelope', c => c.derived.policies.native.rows[0].regions[0].limits.rawChangedPixels++],
      ['missing-replay', c => c.replays.pop()], ['false-replay', c => c.replays[0].imageHashes['svg-page'] = '0'.repeat(64)],
      ['unverified-viewport', c => c.viewport.controls[0].exactRgbaMatch = false], ['missing-viewport', c => c.viewport.controls.pop()],
      ['changed-native-numeric', c => c.numeric.checks[0].observed++], ['missing-visible-defect', c => c.defects.pop()],
      ['changed-defect', c => c.defects[0].inputSvg += ' '], ['false-target-rejection', c => c.defects[0].views[0].targetRejected = false],
      ['untargeted-defect', c => { const d = c.defects[0], source = c.observations.find(r => r.mode === 'printed-pen-hull-driver-width-elements' && dashPdfViewKey(r) === dashPdfViewKey(d.comparisons[0]));
        d.comparisons[0] = structuredClone(source); }]
    ]) {
      const c = structuredClone(e.calibration); change(c);
      await reject(name, () => validateDashPdfCalibration(c, e.geometry, e.numeric, renderer), 'intrinsic evidence');
    }
    const primaryBase = path.join(root, 'artifacts/dash-geometry-primary'), pointer = JSON.parse(await readFile(path.join(primaryBase, 'latest.json')));
    assert.equal(pointer.completed, true); assert.match(pointer.report, /^run-[\da-f-]+\/report\.json$/);
    const primaryBytes = await readFile(path.join(primaryBase, pointer.report)); assert.equal(sha256(primaryBytes), pointer.sha256);
    const primary = JSON.parse(primaryBytes), original = e.calibration.observations.filter(r => r.mode === 'original-svg'), native = e.calibration.observations.filter(r => r.mode === 'printed-pen-hull-driver-width-elements');
    assert.equal(combineDashPdf(e, primary, original, native).passed, true); controls.push({ name: 'unchanged-combined-positive', passed: true });
    for (const gate of ['numeric', 'frame']) {
      const p = structuredClone(primary); p[gate].state = 'failed'; const result = combineDashPdf(e, p, original, native);
      assert.equal(result.passed, false); assert.equal(result.firstFailedGate, gate); controls.push({ name: 'matching-images-cannot-override-' + gate, passed: true });
    }
    assert.throws(() => combineDashPdf(e, primary, original.slice(1), native)); controls.push({ name: 'missing-original-PDF-view', passed: true });
    assert.throws(() => combineDashPdf(e, primary, original, native.slice(1))); controls.push({ name: 'missing-candidate-PDF-view', passed: true });
    const candidate = await readFile(path.join(path.dirname(path.join(primaryBase, pointer.report)), 'candidate-evidence/actual.svg'), 'utf8');
    for (const d of dashGeometryImageDefects) {
      const svg = await renderer.page.evaluate(mutateDashGeometrySvg, { actual: candidate, defect: d }); await save('defects/' + d.name + '.svg', svg);
      const rows = [];
      for (const view of shapePdfViews.filter(v => d.name !== 'root-crop' || v.frame === 'natural')) {
        const result = await measureShapePdfPair(renderer, { svg, units: 'cssPixels', svgOriginBp: { x: 0, y: 0 }, camera: e.geometry.camera, regions: e.geometry.regions,
          ...view, pdfPage: e.pdfPages[view.scale], cropLimit: 1, cropRegionIds: ['path-' + d.pathIndex] });
        const crop = result.crops[0], stem = 'defects/' + d.name + '/' + dashPdfViewKey(view), links = {};
        for (const [k, png] of Object.entries(crop.images)) { links[k] = stem + '-' + k + '.png'; await save(links[k], Buffer.from(png, 'base64')); }
        rows.push({ ...result, images: undefined, crops: undefined, artifacts: links, evaluation: evaluateShapePdfTrial(e.policies.native, view, result) });
      }
      const classified = classifyDashPdfDefect(d, rows); assert.equal(classified.allRequiredViewsRejected, true, 'Accepted candidate PDF defect: ' + d.name);
      controls.push({ ...classified, passed: true, category: 'fresh candidate image-only PDF defects', comparisons: rows });
    }
    for (const [p, h] of Object.entries(e.profile.guardToolHashes)) { const b = await readFile(path.join(root, p)); assert.equal(sha256(b), h); await save('tool-sources/' + p, b); }
    await writeArtifact(output, 'report.json', JSON.stringify({ completed: true, passed: true, approvedImagePolicy: true, policyId: e.profile.id,
      policySha256: e.profileSha256, controls, artifacts }, null, 2) + '\n');
    await writeArtifact(base, 'latest.json', JSON.stringify({ completed: true, report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'),
      sha256: sha256(await readFile(path.join(output, 'report.json'))) }, null, 2) + '\n');
    console.log('Dash PDF policy controls: ' + controls.length + ' pass, including nineteen fresh candidate image-only defects.');
  } finally { await renderer.browser.close(); }
}
await main().catch(async error => { process.exitCode = 2; console.error(error.stack);
  await writeArtifact(output, 'report.json', JSON.stringify({ completed: false, passed: false, error: error.message, controls, artifacts }, null, 2) + '\n'); });
