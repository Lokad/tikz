import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { root, sha256, outputPath, writeArtifact } from './shape-oracle-bundle.mjs';
import { createRenderer } from './compare.mjs';
import { installShapeMetrics } from './dash-geometry-image-pair.mjs';
import { captureDashLinesPrimary, verifyDashLinesAssets, dashLinesViewKey } from './dash-lines-primary-common.mjs';
import { shapeViews } from './shape-primary-trial-policy.mjs';
import { shapePdfViews } from './shape-pdf-trial-policy.mjs';
import { measureDashLinesPdfPair } from './dash-lines-pdf-image-pair.mjs';
import { evaluateDashLinesPdfTrial, classifyDashLinesPdfDefect, dashLinesPdfViewKey } from './dash-lines-pdf-trial-policy.mjs';
import { dashLinesImageDefects, dashLinesVisibilityControls, mutateDashLinesSvg } from './dash-lines-image-defects.mjs';
import { loadDashLinesPolicy, validateDashLinesCalibration, combineDashLines, requireDashLinesRenderer,
  dashLinesProfileFile, dashLinesCalibrationFile, dashLinesGuardTools } from './dash-lines-policy.mjs';

const base = path.join(root, 'artifacts/dash-lines-policy-controls'), output = path.join(base, 'run-' + randomUUID()), artifacts = {}, controls = [];
const save = (p, b) => writeArtifact(output, p, b, artifacts), relative = p => path.relative(root, p).split(path.sep).join('/');
let phase = 'immutable-evidence';
async function publish(report) {
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n'); await writeArtifact(output, 'report.json', bytes);
  await writeArtifact(base, 'latest.json', JSON.stringify({ completed: report.completed,
    report: relative(path.join(output, 'report.json')).slice('artifacts/dash-lines-policy-controls/'.length), sha256: sha256(bytes) }, null, 2) + '\n');
}
async function main() {
  assert.equal(process.argv.length, 2); const renderer = await createRenderer();
  try {
    await installShapeMetrics(renderer); const e = await loadDashLinesPolicy(renderer);
    const reject = async (name, fn, category) => { await assert.rejects(fn); controls.push({ name, category, passed: true }); };
    const pass = (name, category) => controls.push({ name, category, passed: true });
    const files = [...new Set([dashLinesProfileFile, dashLinesCalibrationFile,
      ...Object.values(e.calibration.pages).map(p => p.file), 'tests/Reference/Dashes/snapshot.json',
      ...Object.keys(e.native.snapshot.artifacts).map(p => 'tests/Reference/Dashes/native/' + p),
      ...Object.keys(e.calibration.toolHashes), ...dashLinesGuardTools])];
    for (const file of files) {
      await reject('missing-' + file, () => loadDashLinesPolicy(renderer, p => relative(p) === file ? Promise.reject(new Error('Controlled missing evidence')) : readFile(p)), 'missing evidence');
      await reject('changed-' + file, () => loadDashLinesPolicy(renderer, async p => {
        const b = await readFile(p); return relative(p) === file ? Buffer.concat([b, Buffer.from(file === dashLinesProfileFile ? '\0' : ' ')]) : b;
      }), 'changed evidence');
    }
    console.log('Missing/changed evidence controls passed: ' + controls.length);
    const changedTools = Object.entries(e.calibration.toolHashes).filter(([file, h]) => h !== e.profile.guardToolHashes[file]);
    assert.equal(changedTools.length, 3, 'Review changed original/current dash-line identities.');
    for (const [file, historical] of changedTools) {
      const profile = structuredClone(e.profile); profile.guardToolHashes[file] = historical;
      await reject('historical-guard-substitution/' + file, () => loadDashLinesPolicy(renderer,
        p => relative(p) === dashLinesProfileFile ? Buffer.from(JSON.stringify(profile)) : readFile(p)), 'historical/current sources');
    }
    for (const [name, change] of [
      ['borrowed-policy', p => p.id = 'different-fixture-policy'], ['borrowed-scope', p => p.scope = 'All TikZ'],
      ['unapproved-images', p => p.approvedImagePolicy = false], ['partial-native', p => p.counts.native--],
      ['partial-frame', p => p.counts.frame--], ['partial-primary', p => p.counts.primary--],
      ['partial-PDF', p => p.counts.pdfPerRoute--], ['partial-PDF-instructions', p => p.counts.pdfInstructions--],
      ['missing-primary-view', p => p.requiredViews.primary.pop()], ['missing-PDF-view', p => p.requiredViews.pdf.pop()],
      ['changed-reviewed-digest', p => p.calibration.sha256 = '0'.repeat(64)], ['changed-decoded-digest', p => p.calibration.decodedSha256 = '0'.repeat(64)],
      ['missing-guard', p => delete p.guardToolHashes[dashLinesGuardTools[0]]], ['changed-guard', p => p.guardToolHashes[dashLinesGuardTools[0]] = '0'.repeat(64)],
      ['fitted-primary-camera', p => p.camera.primary.x++], ['fitted-PDF-camera', p => p.camera.pdf.origin.x++],
      ['chosen-primary-region', p => p.regions.primary.pop()], ['chosen-PDF-region', p => p.regions.pdf.pop()],
      ['widened-primary-limit', p => p.limits.primary.rows[0].whole.rawChangedPixels++],
      ['widened-PDF-limit', p => p.limits.pdf.native.rows[0].regions[0].limits.rawChangedPixels++],
      ['widened-ink-range', p => p.limits.pdf.native.inkCoverageRows[0].regions[0].actualRanges[0].max++]
    ]) {
      const profile = structuredClone(e.profile); change(profile);
      await reject(name, () => loadDashLinesPolicy(renderer, p => relative(p) === dashLinesProfileFile ? Buffer.from(JSON.stringify(profile)) : readFile(p)), 'profile mutation');
    }
    const changed = Buffer.concat([e.compressed, Buffer.from(' ')]), rehashed = structuredClone(e.profile); rehashed.calibration.sha256 = sha256(changed);
    await reject('consistently-rehashed-unreviewed-calibration', () => loadDashLinesPolicy(renderer, p => relative(p) === dashLinesProfileFile
      ? Buffer.from(JSON.stringify(rehashed)) : relative(p) === dashLinesCalibrationFile ? changed : readFile(p)), 'reviewed digest');
    for (const key of ['profile', 'playwright', 'browser', 'browserSha256', 'profileSha256', 'os', 'architecture', 'node', 'headless', 'deviceScaleFactor', 'viewport', 'launchArguments']) {
      const identity = structuredClone(renderer.identity); identity[key] = null;
      assert.throws(() => requireDashLinesRenderer(identity, renderer.identity)); pass('different-renderer-' + key, 'renderer contract');
    }
    const release = { ...renderer.identity, osRelease: 'provenance-only' }; requireDashLinesRenderer(release, renderer.identity); pass('OS-release-provenance-only', 'renderer contract');
    for (const [name, change] of [
      ['candidate-calibration', c => c.converterInvoked = true], ['missing-source-tool', c => delete c.toolHashes[Object.keys(c.toolHashes)[0]]],
      ['false-source-report', c => c.sourceReports.primary = '0'.repeat(64)], ['changed-native-snapshot', c => c.native.snapshotSha256 = '0'.repeat(64)],
      ['unapproved-primary-evidence', c => c.primary.approvedImagePolicy = true], ['different-primary-renderer', c => c.primary.renderer.browserSha256 = '0'.repeat(64)],
      ['changed-primary-geometry', c => c.primary.geometry.camera.x++], ['changed-independent-primary-SVG', c => c.primary.representations[0].svg += ' '],
      ['missing-primary-observation', c => c.primary.measurements.pop()], ['duplicate-primary-observation', c => c.primary.measurements[0] = c.primary.measurements[1]],
      ['primary-candidate-observation', c => c.primary.measurements[0].converterInvoked = true], ['missing-primary-region', c => c.primary.measurements[0].regions.pop()],
      ['nonfinite-primary-metric', c => c.primary.measurements[0].metrics.meanForegroundChannelError = NaN],
      ['widened-primary-envelope', c => c.primary.derived.policy.rows[0].whole.rawChangedPixels++], ['missing-primary-replay', c => c.primary.replays.pop()],
      ['false-primary-replay', c => c.primary.replays[0].comparisons[0].imageHashes.actual = '0'.repeat(64)],
      ['missing-primary-defect', c => c.primary.defects.pop()], ['changed-primary-defect', c => c.primary.defects[0].inputSvg += ' '],
      ['missing-primary-visibility-control', c => c.primary.visibility.pop()],
      ['different-PDF-renderer', c => c.pdf.pdfRenderer.sha256 = '0'.repeat(64)], ['changed-PDF-instructions', c => c.pdf.numeric.checks[0].observed++],
      ['fitted-PDF-origin', c => c.pdf.camera.origin.x++], ['chosen-PDF-region', c => c.pdf.regions.pop()],
      ['missing-qualification', c => c.qualification.equivalenceControls.pop()], ['false-equivalence', c => c.qualification.equivalenceControls[0].exactPngMatch = false],
      ['unrepeated-page', c => c.qualification.commands[0].exactRepeat = false], ['different-DPI', c => c.qualification.commands[0].args[2] = '100'],
      ['changed-page-repeat', c => c.qualification.pageHashes['pdftocairo/original-1x-repeat.png'] = '0'.repeat(64)],
      ['changed-independent-PDF-SVG', c => c.pdf.representations[0].svg += ' '], ['missing-PDF-observation', c => c.pdf.observations.pop()],
      ['duplicate-PDF-observation', c => c.pdf.observations[0] = c.pdf.observations[1]], ['missing-PDF-region', c => c.pdf.observations[0].regions.pop()],
      ['nonfinite-PDF-error', c => c.pdf.observations[0].whole.meanForegroundChannelError = NaN], ['nonfinite-ink-coverage', c => c.pdf.observations[0].whole.inkCoverage.actual[0] = NaN],
      ['missing-ink-coverage', c => delete c.pdf.observations[0].whole.inkCoverage],
      ['widened-PDF-envelope', c => c.pdf.derived.policies.native.rows[0].regions[0].limits.rawChangedPixels++],
      ['widened-ink-envelope', c => c.pdf.derived.policies.native.inkCoverageRows[0].regions[0].actualRanges[0].max++],
      ['missing-PDF-replay', c => c.pdf.replays.pop()], ['false-PDF-replay', c => c.pdf.replays[0].imageHashes['svg-page'] = '0'.repeat(64)],
      ['unverified-viewport', c => c.qualification.viewport.controls[0].exactRgbaMatch = false], ['missing-viewport', c => c.qualification.viewport.controls.pop()],
      ['missing-PDF-defect', c => c.pdf.defects.pop()], ['changed-PDF-defect', c => c.pdf.defects[0].inputSvg += ' '],
      ['false-target-rejection', c => c.pdf.defects[0].views[0].targetRejected = false], ['missing-PDF-visibility-control', c => c.pdf.visibility.pop()]
    ]) {
      const c = structuredClone(e.calibration); change(c);
      await reject(name, () => validateDashLinesCalibration(c, e.native, e.reconstruction, renderer), 'intrinsic evidence');
    }
    console.log('Profile and intrinsic evidence controls passed: ' + controls.length);
    const primaryRows = e.calibration.primary.measurements.filter(r => r.name === 'printed-pen-hull-driver-width-elements'),
      originalRows = e.calibration.pdf.observations.filter(r => r.mode === 'original-svg'), nativeRows = e.calibration.pdf.observations.filter(r => r.mode === 'printed-pen-hull-driver-width-elements');
    const numeric = { state: 'passed', executedChecks: 927 }, frame = { state: 'passed', executedChecks: 6 };
    assert.equal(combineDashLines(e, numeric, frame, primaryRows, originalRows, nativeRows).passed, true); pass('unchanged-combined-positive', 'combined gates');
    for (const gate of ['numeric', 'frame']) {
      const result = combineDashLines(e, gate === 'numeric' ? { ...numeric, state: 'failed' } : numeric,
        gate === 'frame' ? { ...frame, state: 'failed' } : frame, primaryRows, originalRows, nativeRows);
      assert.equal(result.passed, false); assert.equal(result.firstFailedGate, gate); pass('matching-images-cannot-override-' + gate, 'combined gates');
    }
    for (const [name, rows] of [['primary', primaryRows], ['original-PDF', originalRows], ['candidate-PDF', nativeRows]]) {
      for (const defect of ['missing', 'duplicate']) {
        const bad = defect === 'missing' ? rows.slice(1) : [rows[1], ...rows.slice(1)];
        assert.throws(() => combineDashLines(e, numeric, frame, name === 'primary' ? bad : primaryRows,
          name === 'original-PDF' ? bad : originalRows, name === 'candidate-PDF' ? bad : nativeRows)); pass(defect + '-' + name + '-view', 'combined gates');
      }
    }
    phase = 'fresh-public-candidate';
    const result = spawnSync('dotnet', ['run', '--project', 'tools/TikzDashComparison', '-c', 'Release', '--no-restore'],
      { cwd: root, windowsHide: true, timeout: 180000, maxBuffer: 1000000 });
    await save('candidate-command.txt', Buffer.concat([result.stdout ?? Buffer.alloc(0), result.stderr ?? Buffer.alloc(0)])); assert.equal(result.error, undefined); assert.equal(result.status, 0);
    const nBase = path.join(root, 'artifacts/dash-comparisons'), pointer = JSON.parse(await readFile(path.join(nBase, 'latest.json')));
    assert.equal(pointer.completed, true); assert.match(pointer.report, /^run-[\da-f-]+\/report\.json$/);
    const nFile = await outputPath(nBase, pointer.report), nBytes = await readFile(nFile), n = JSON.parse(nBytes); assert.equal(sha256(nBytes), pointer.sha256);
    assert.equal(n.completed, true); assert.equal(n.referenceSnapshotSha256, e.native.snapshotSha256); assert.equal(n.executedCases, 40);
    assert.equal(n.numeric.checks.length, 927); assert.ok(n.numeric.checks.every(c => c.passed));
    assert.equal(n.compiler.sha256, sha256(await readFile(path.join(root, 'src/Lokad.TikZ/bin/Release/net10.0/Lokad.TikZ.dll'))));
    await save('candidate-numeric-report.json', nBytes);
    for (const [p, h] of Object.entries(n.artifacts)) { const b = await readFile(await outputPath(path.dirname(nFile), p)); assert.equal(sha256(b), h); await save('candidate-evidence/' + p, b); }
    const candidate = await readFile(path.join(path.dirname(nFile), 'actual.svg'), 'utf8');
    const pdfCapture = async (d, svg) => {
      const rows = [];
      for (const view of shapePdfViews.filter(v => d.name !== 'root-crop' || v.frame === 'natural')) {
        const measured = await measureDashLinesPdfPair(renderer, { svg, units: 'cssPixels', svgOriginBp: { x: 0, y: 0 }, camera: e.registered.camera,
          regions: e.registered.regions, ...view, pdfPage: e.pdfPages[view.scale], cropLimit: 1, cropRegionIds: ['path-' + d.pathIndex] });
        const links = {}, imageHashes = {}, stem = 'defects/' + d.name + '/PDF/' + dashLinesPdfViewKey(view);
        for (const [k, png] of Object.entries(measured.images)) { const bytes = Buffer.from(png, 'base64'); links[k] = stem + '-' + k + '.png'; imageHashes[k] = sha256(bytes); await save(links[k], bytes); }
        const crops = {}; for (const [k, png] of Object.entries(measured.crops[0].images)) { crops[k] = stem + '-path-' + d.pathIndex + '-' + k + '.png'; await save(crops[k], Buffer.from(png, 'base64')); }
        rows.push({ ...measured, images: undefined, crops: undefined, artifacts: links, imageHashes,
          regions: measured.regions.map(r => ({ ...r, crops: r.id === 'path-' + d.pathIndex ? crops : null })), evaluation: evaluateDashLinesPdfTrial(e.pdf.native, view, measured) });
      }
      return rows;
    };
    for (const d of [...dashLinesImageDefects, ...dashLinesVisibilityControls]) {
      phase = 'fresh-image-control/' + d.name;
      const svg = await renderer.page.evaluate(mutateDashLinesSvg, { actual: candidate, defect: d }); await save('defects/' + d.name + '.svg', svg);
      const pRows = await captureDashLinesPrimary(renderer, { native: e.native, reconstruction: e.reconstruction,
        variant: { name: 'defects/' + d.name + '/primary', svg, converterInvoked: true }, policy: e.primary, output, artifacts, cropIds: ['path-' + d.pathIndex],
        views: shapeViews.filter(v => v.background === 'white' && (d.name !== 'root-crop' || v.frame === 'natural')) });
      const fRows = await pdfCapture(d, svg), visibility = dashLinesVisibilityControls.some(v => v.name === d.name);
      if (visibility) {
        for (const row of pRows) { assert.equal(row.evaluation.passed, true); const old = primaryRows.find(r => dashLinesViewKey(r) === dashLinesViewKey(row)); assert.equal(row.imageHashes.actual, old.imageHashes.actual); }
        for (const row of fRows) { assert.equal(row.evaluation.passed, true); const old = nativeRows.find(r => dashLinesPdfViewKey(r) === dashLinesPdfViewKey(row)); assert.equal(row.imageHashes['svg-page'], old.imageHashes['svg-page']); }
      } else {
        assert.ok(pRows.every(r => !r.evaluation.passed && r.evaluation.checks.some(c => c.id === 'path-' + d.pathIndex && !c.passed)), 'Accepted primary defect: ' + d.name);
        assert.equal(classifyDashLinesPdfDefect(d, fRows).allRequiredViewsRejected, true, 'Accepted PDF defect: ' + d.name);
      }
      controls.push({ ...d, passed: true, category: visibility ? 'fresh candidate visibility' : 'fresh candidate image-only defects',
        converterInvoked: true, numericGatesBypassed: true, inputSha256: sha256(svg), input: 'defects/' + d.name + '.svg', primaryComparisons: pRows, pdfComparisons: fRows });
      console.log('Fresh primary/PDF control passed: ' + d.name);
    }
    for (const [p, h] of Object.entries({ ...e.calibration.toolHashes, ...e.profile.guardToolHashes, ...n.toolHashes })) {
      const b = await readFile(path.join(root, p)); assert.equal(sha256(b), h); await save('tool-sources/' + p, b);
    }
    await verifyDashLinesAssets(output, artifacts);
    await publish({ completed: true, passed: true, approvedImagePolicy: true, policyId: e.profile.id, policySha256: e.profileSha256,
      calibrationSha256: e.profile.calibration.sha256, candidateReportSha256: sha256(nBytes), compiler: n.compiler, renderer: renderer.identity, controls, artifacts });
    console.log('Forty-line immutable policy controls: ' + controls.length + ' pass.');
  } finally { await renderer.browser.close(); }
}
await main().catch(async error => { process.exitCode = 2; console.error(error.stack);
  await publish({ completed: false, passed: false, phase, error: error.message, controls, artifacts }); });
