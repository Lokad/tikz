// Checked qualification must be selected before a public converter is invoked.
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {root, sha256, outputPath} from './shape-oracle-bundle.mjs';
import {edgeCanonical} from './edge-log.mjs';
import {edgePrimaryContract} from './edge-primary-reference.mjs';
import {deriveEdgePrimaryPolicy} from './edge-primary-policy.mjs';
import {edgePdfCalibratedRoutes, deriveEdgePdfPolicy} from './edge-pdf-policy.mjs';

export async function loadEdgeTrialInputs(files, save) {
  assert.deepEqual(Object.keys(files), ['primary', 'primaryCheck', 'pdf', 'pdfCheck']);
  const expected = {primary: ['edge-primary-calibration', 'oracle-only-edge-primary-calibration'], primaryCheck: ['edge-primary-checks', 'independent-edge-primary-check'],
    pdf: ['edge-pdf-calibration', 'oracle-only-edge-pdf-calibration'], pdfCheck: ['edge-pdf-checks', 'independent-edge-pdf-check']};
  const inputs = {}, records = [];
  for (const [role, file] of Object.entries(files)) {
    const [base, kind] = expected[role]; assert.match(file, new RegExp('^artifacts/' + base + '/run-[a-f0-9-]+/report\\.json$'));
    const directory = path.dirname(path.join(root, file)), read = p => readFile(outputPathSync(p));
    function outputPathSync(p) { assert.ok(typeof p === 'string' && !path.isAbsolute(p) && !p.includes('\\') && !p.split('/').includes('..')); return path.join(directory, p); }
    assert.ok((await stat(await outputPath(directory, 'report.json'))).size <= 150000000);
    const bytes = await read('report.json'), report = JSON.parse(bytes);
    assert.equal(report.completed, true); assert.equal(report.comparisonKind, kind);
    for (const k of ['converterInvoked', 'approvedImagePolicy', 'imageConformanceClaim']) assert.equal(report[k], false);
    if (role.endsWith('Check')) {
      const count = role === 'primaryCheck' ? 21 : 23; assert.equal(report.controls.length, count);
      assert.equal(new Set(report.controls.map(c => c.name)).size, count); assert.ok(report.controls.every(c => c.passed === true));
      assert.equal(report.svgsReconstructed, role === 'primaryCheck' ? 37 : 163);
      assert.equal(report.metricsRecomputed, role === 'primaryCheck' ? 23934 : 9958);
      if (role === 'pdfCheck') { assert.equal(report.pagesRecomputed, 150); assert.equal(report.viewportControlsReplayed, 270); assert.equal(report.inkSumsRecomputed, 59748); }
    } else {
      assert.equal(report.overallVerdict, 'pending'); assert.deepEqual(report.contract, edgePrimaryContract);
      assert.deepEqual(report.cases.map(c => c.id), ['continuation', 'styles', 'coordinates', 'nodes', 'clipping']);
      for (const [p, h] of Object.entries(report.sourceHashes)) assert.equal(sha256(edgeCanonical(await readFile(path.join(root, p)))), h, 'Qualification source changed: ' + p);
      if (role === 'primary') assert.deepEqual(report.policy, deriveEdgePrimaryPolicy(report.cases));
      else for (const c of report.cases) for (const route of edgePdfCalibratedRoutes)
        assert.deepEqual(c.policies[route], deriveEdgePdfPolicy(c.measurements.filter(o => o.route === route), c.camera, c.regions, c.id + '/' + route));
    }
    const prefix = 'qualification/' + role;
    for (const [p, h] of Object.entries(report.artifacts)) {
      const b = await readFile(await outputPath(directory, p)); assert.equal(sha256(b), h, 'Qualification artifact changed: ' + p); await save(prefix + '/' + p, b);
      if (p.startsWith('source-captures/')) assert.equal(sha256(edgeCanonical(await readFile(path.join(root, p.slice(16))))), h, 'Checker/source capture changed: ' + p);
    }
    await save(prefix + '/report.json', bytes); inputs[role] = {directory, prefix, bytes, report, read};
    records.push({role, input: file, sha256: sha256(bytes), copiedReport: prefix + '/report.json'});
  }
  for (const role of ['primary', 'pdf']) {
    assert.equal(inputs[role + 'Check'].report.inputReportSha256, sha256(inputs[role].bytes), 'Checker is bound to another qualification.');
    assert.deepEqual(inputs[role].report.renderer, inputs[role + 'Check'].report.renderer);
  }
  assert.equal(inputs.primary.report.snapshotSha256, inputs.pdf.report.snapshotSha256);
  assert.deepEqual(inputs.primary.report.renderer, inputs.pdf.report.renderer);
  return {...inputs, records};
}
