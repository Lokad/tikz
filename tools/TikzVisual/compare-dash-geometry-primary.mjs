import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { root, sha256, writeArtifact } from './shape-oracle-bundle.mjs';
import { createRenderer } from './compare.mjs';
import { installShapeMetrics } from './dash-geometry-image-pair.mjs';
import { captureDashPrimary, verifyDashAssets, dashViewKey } from './dash-geometry-primary-common.mjs';
import { loadDashPrimaryPolicy, combineDashPrimary } from './dash-geometry-primary-policy.mjs';

const base = path.join(root, 'artifacts/dash-geometry-primary'), output = path.join(base, 'run-' + randomUUID()), artifacts = {};
const save = (p, bytes) => writeArtifact(output, p, bytes, artifacts);
let phase = 'immutable-policy';
async function publish(report) {
  await writeArtifact(output, 'report.json', JSON.stringify(report, null, 2) + '\n');
  await writeArtifact(base, 'latest.json', JSON.stringify({ completed: report.completed, report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'),
    sha256: sha256(await readFile(path.join(output, 'report.json'))) }, null, 2) + '\n');
}
async function main() {
  assert.equal(process.argv.length, 2);
  await publish({ completed: false, phase, verdict: 'in-progress', overallVerdict: 'pending' });
  console.log('Immutable dash primary comparison: ' + path.relative(root, output));
  const renderer = await createRenderer();
  try {
    await installShapeMetrics(renderer);
    const evidence = await loadDashPrimaryPolicy(renderer);
    await save('primary-profile.json', evidence.profileBytes); await save('independent-calibration.json', evidence.calibrationBytes);
    await save('reference.svg', evidence.native.referenceBytes); await save('native-snapshot.json', evidence.native.snapshotBytes);
    for (const [p, h] of Object.entries({ ...evidence.calibration.toolHashes, ...evidence.profile.guardToolHashes })) {
      const bytes = await readFile(path.join(root, p)); assert.equal(sha256(bytes), h); await save('tool-sources/' + p, bytes);
    }
    phase = 'public-numeric';
    const numericProcess = spawnSync('dotnet', ['run', '--project', 'tools/TikzDashComparison', '-c', 'Release', '--no-restore', '--', 'geometry'],
      { cwd: root, windowsHide: true, timeout: 180000, maxBuffer: 1000000 });
    await save('candidate-command.txt', Buffer.concat([numericProcess.stdout ?? Buffer.alloc(0), numericProcess.stderr ?? Buffer.alloc(0)]));
    assert.equal(numericProcess.status, 0, 'Public native comparison failed.');
    const pointer = JSON.parse(await readFile(path.join(root, 'artifacts/dash-geometry-comparisons/latest.json')));
    const numericFile = path.join(root, 'artifacts/dash-geometry-comparisons', pointer.report), numericBytes = await readFile(numericFile), numeric = JSON.parse(numericBytes);
    assert.equal(sha256(numericBytes), pointer.sha256); assert.equal(numeric.completed, true);
    assert.equal(numeric.numeric.passed, true); assert.equal(numeric.numeric.checks.length, 1090); assert.ok(numeric.numeric.checks.every(c => c.passed));
    assert.equal(numeric.expectedPaints, 16); assert.equal(numeric.expectedClips, 3);
    assert.equal(numeric.referenceSnapshotSha256, evidence.native.snapshotSha256);
    assert.equal(numeric.compiler.sha256, sha256(await readFile(path.join(root, 'src/Lokad.TikZ/bin/Release/net10.0/Lokad.TikZ.dll'))));
    for (const [p, h] of Object.entries(numeric.toolHashes)) assert.equal(sha256(await readFile(path.join(root, p))), h);
    for (const [p, h] of Object.entries(numeric.artifacts)) {
      const bytes = await readFile(path.join(path.dirname(numericFile), p)); assert.equal(sha256(bytes), h); await save('candidate-evidence/' + p, bytes);
    }
    await save('candidate-numeric-report.json', numericBytes);
    const actual = await readFile(path.join(path.dirname(numericFile), 'actual.svg'), 'utf8');
    const scene = JSON.parse(await readFile(path.join(path.dirname(numericFile), 'actual-scene.json')));
    assert.equal(scene.paths.length, 16); assert.equal(scene.clips.length, 3);
    const sourceLinks = evidence.reconstruction.regions.map((r, i) => {
      assert.equal(scene.paths[i].id, r.caseId); assert.equal(scene.paths[i].svgElementId, 'geometry-p' + i);
      return { regionId: r.id, caseId: r.caseId, source: scene.paths[i].source, svgElementId: scene.paths[i].svgElementId };
    });
    phase = 'primary';
    const rows = await captureDashPrimary(renderer, { native: evidence.native, reconstruction: evidence.reconstruction,
      variant: { name: 'candidate', svg: actual, converterInvoked: true }, policy: evidence.policy, output, artifacts });
    const combined = combineDashPrimary(evidence, { state: 'passed', executedChecks: 1090 }, { state: 'passed', executedChecks: 6 }, rows);
    const representationControls = rows.map(row => {
      const independent = evidence.calibration.measurements.find(r => r.name === 'printed-pen-hull-driver-width-elements' && dashViewKey(r) === dashViewKey(row));
      return { ...Object.fromEntries(['frame', 'scale', 'background'].map(k => [k, row[k]])),
        identicalIndependentPng: row.imageHashes.actual === independent.imageHashes.actual, candidate: row.artifacts.actual, independentSha256: independent.imageHashes.actual };
    });
    const current = await loadDashPrimaryPolicy(renderer); assert.equal(current.profileSha256, evidence.profileSha256);
    await save('index.html', '<!doctype html><meta charset="utf-8"><h1>Dash geometry: ' + combined.verdict + '</h1><p>Primary SVG policy only; PDF admission pending.</p>'
      + '<p><a href="report.json">Report</a> · <a href="candidate-evidence/source.tikz">Source</a> · <a href="candidate-evidence/actual-scene.json">Scene</a></p>'
      + rows.filter(r => r.artifacts.comparison).map(r => '<h2>' + dashViewKey(r) + '</h2><img style="max-width:100%" src="' + r.artifacts.comparison + '">'
        + r.regions.filter(r => r.crops).map(r => '<p>' + r.id + ' / ' + r.caseId + '</p><img style="max-width:100%" src="' + r.crops.sheet + '">').join('')).join(''));
    await verifyDashAssets(output, artifacts);
    await publish({ schemaVersion: 1, comparisonKind: 'dash-geometry-primary-admission', completed: true, ...combined,
      policyId: evidence.profile.id, policySha256: evidence.profileSha256, calibrationSha256: evidence.profile.calibration.sha256,
      renderer: renderer.identity, camera: evidence.reconstruction.camera, regions: evidence.reconstruction.regions,
      numericEvidence: 'candidate-numeric-report.json', sourceLinks, comparisons: rows, representationControls, artifacts,
      agent: { viewer: 'index.html', source: 'candidate-evidence/source.tikz', scene: 'candidate-evidence/actual-scene.json',
        focusedRerun: 'node tools/TikzVisual/compare-dash-geometry-primary.mjs' } });
    console.log('Dash geometry ' + combined.verdict + ': 1090 native checks, 12 primary views, 192 local regions; ordinary PDF pending.');
    process.exitCode = combined.passed ? 0 : 1;
  } finally { await renderer.browser.close(); }
}
await main().catch(async error => { process.exitCode = 2; console.error(error.stack);
  await publish({ completed: false, verdict: 'infrastructure-error', phase, error: error.message, overallVerdict: 'pending', artifacts }); });
