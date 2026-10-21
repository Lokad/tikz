// Exact owned report paths come from the child stdout, never mutable locators.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {captureProcess} from './qualification-process.mjs';
import path from 'node:path';
import {root, sha256, outputPath} from './shape-oracle-bundle.mjs';

export async function runOwnedEdgeImageChild(script, args, save, log) {
  const trial = script === 'trial-curved-edge-images.mjs'; assert.ok(trial || script === 'check-curved-edge-trial.mjs');
  assert.equal(args.length, trial ? 4 : 1);
  if (trial) for (const [i, base] of ['primary-calibration', 'primary-checks', 'pdf-calibration', 'pdf-checks'].entries())
    assert.match(args[i], new RegExp('^artifacts/curved-edge-' + base + '/run-[a-f0-9-]+/report\\.json$'));
  else assert.match(args[0], /^artifacts\/curved-edge-public-trial\/run-[a-f0-9-]+\/report\.json$/);
  const result = await captureProcess(process.execPath, ['tools/TikzVisual/' + script, ...args], {cwd: root, timeout: 1800000});
  const status = result.exitCode;
  await save(log, result.output.replaceAll(root, '<repo>'));
  if (result.failure !== null) throw Error('Owned edge command failed: ' + result.failure);
  const kind = trial ? 'curved-edge-public-trial' : 'curved-edge-public-check';
  const markers = result.stdout.split(/\r?\n/).filter(s => s.startsWith('{')).map(s => JSON.parse(s)).filter(m => m.kind === kind);
  assert.ok(markers.length >= 1 && markers.length <= 2); assert.equal(new Set(markers.map(m => m.report)).size, 1);
  const marker = markers.at(-1); assert.match(marker.report, new RegExp('^artifacts/curved-edge-public-' + (trial ? 'trial' : 'checks') + '/run-[a-f0-9-]+/report\\.json$'));
  assert.match(marker.sha256, /^[a-f0-9]{64}$/); const folder = path.dirname(path.join(root, marker.report)), bytes = await readFile(await outputPath(folder, 'report.json'));
  assert.equal(sha256(bytes), marker.sha256); const report = JSON.parse(bytes); assert.equal(marker.completed, report.completed);
  assert.deepEqual([report.schemaVersion, report.comparisonKind, report.approvedImagePolicy, report.imageConformanceClaim],
    [1, trial ? 'public-curved-edge-image-trial' : 'independent-public-curved-edge-trial-check', false, false]);
  const passed = report.completed && (trial ? report.combined?.passed === true : report.controls?.length === 19 && report.controls.every(c => c.passed === true));
  if (passed) {
    assert.equal(report.converterInvoked, true);
    if (trial) { assert.equal(report.overallVerdict, 'pending'); assert.equal(report.combined.verdict, 'trial-pass'); }
    else assert.deepEqual([report.primaryMetricsRecomputed, report.pdfMetricsRecomputed, report.nativeMetricsRecomputed, report.pagesRecomputed, report.numericChecksVerified, report.svgsReconstructed], [22254, 8994, 7418, 110, 2066, 23]);
  }
  assert.equal(status === 0, passed); assert.ok([0, 1, 2].includes(status));
  return {marker, report, folder, bytes, status, passed};
}
