// Cached immutable admission. Validate independent evidence before invoking the converter.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { root, sha256, outputPath, writeArtifact } from './shape-oracle-bundle.mjs';
import { createRenderer } from './compare.mjs';
import { installShapeMetrics } from './dash-geometry-image-pair.mjs';
import { readDashLinesNative } from './dash-lines-oracle.mjs';
import { captureDashLinesPrimary, verifyDashLinesAssets, dashLinesViewKey } from './dash-lines-primary-common.mjs';
import { evaluateDashLinesPdfTrial, dashLinesPdfViewKey } from './dash-lines-pdf-trial-policy.mjs';
import { measureDashLinesPdfPair } from './dash-lines-pdf-image-pair.mjs';
import { shapePdfViews } from './shape-pdf-trial-policy.mjs';

import { loadDashLinesPolicy, combineDashLines } from './dash-lines-policy.mjs';

const base = path.join(root, 'artifacts/dash-lines-conformance'), output = path.join(base, 'run-' + randomUUID()), artifacts = {}, toolHashes = {};
const save = (p, b) => writeArtifact(output, p, b, artifacts);
let phase = 'independent-inputs';
async function publish(report) {
  const b = Buffer.from(JSON.stringify(report, null, 2) + '\n'); await writeArtifact(output, 'report.json', b);
  await writeArtifact(base, 'latest.json', JSON.stringify({ completed: report.completed,
    report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'), sha256: sha256(b) }, null, 2) + '\n');
}
async function main() {
  assert.equal(process.argv.length, 2); const renderer = await createRenderer();
  try {
    await installShapeMetrics(renderer); const e = await loadDashLinesPolicy(renderer), { native, reconstruction } = e;
    const primary = e.calibration.primary, primaryDerived = { policy: e.primary }, pdf = { camera: e.registered.camera, regions: e.registered.regions }, pdfDerived = { policies: e.pdf };
    for (const [p, h] of Object.entries({ ...e.calibration.toolHashes, ...e.profile.guardToolHashes })) {
      const b = await readFile(path.join(root, p)); assert.equal(sha256(b), h); toolHashes[p] = h; await save('tool-sources/' + p, b);
    }
    await save('independent/calibration.json.gz', e.compressed); await save('independent/profile.json', e.profileBytes);
    await save('reference.svg', native.referenceBytes); await save('native-snapshot.json', native.snapshotBytes);
    phase = 'public-candidate'; const command = ['run', '--project', 'tools/TikzDashComparison', '-c', 'Release', '--no-restore'];
    const result = spawnSync('dotnet', command, { cwd: root, windowsHide: true, timeout: 180000, maxBuffer: 1000000 });
    await save('candidate-command.txt', Buffer.concat([result.stdout ?? Buffer.alloc(0), result.stderr ?? Buffer.alloc(0)]));
    assert.equal(result.error, undefined); assert.ok([0, 1].includes(result.status), 'Candidate conversion/tool failed.');
    const nBase = path.join(root, 'artifacts/dash-comparisons'), nPointer = JSON.parse(await readFile(path.join(nBase, 'latest.json')));
    assert.equal(nPointer.completed, true); assert.match(nPointer.report, /^run-[\da-f-]+\/report\.json$/);
    const nFilename = await outputPath(nBase, nPointer.report), nBytes = await readFile(nFilename), numeric = JSON.parse(nBytes);
    assert.equal(sha256(nBytes), nPointer.sha256); assert.equal(numeric.completed, true); assert.equal(numeric.referenceSnapshotSha256, native.snapshotSha256);
    assert.equal(numeric.expectedCases, 40); assert.equal(numeric.executedCases, 40); assert.equal(numeric.numeric.checks.length, 927);
    assert.equal(numeric.compiler.sha256, sha256(await readFile(path.join(root, 'src/Lokad.TikZ/bin/Release/net10.0/Lokad.TikZ.dll'))));
    assert.ok(numeric.compiler.frameworkReferences.every(n => n === 'System' || n.startsWith('System.')));
    for (const [p, h] of Object.entries(numeric.toolHashes)) { const b = await readFile(path.join(root, p)); assert.equal(sha256(b), h); toolHashes[p] = h; await save('tool-sources/' + p, b); }
    for (const [p, h] of Object.entries(numeric.artifacts)) { const b = await readFile(await outputPath(path.dirname(nFilename), p)); assert.equal(sha256(b), h); await save('candidate-evidence/' + p, b); }
    await save('candidate-numeric-report.json', nBytes);
    const actual = await readFile(path.join(path.dirname(nFilename), 'actual.svg'), 'utf8'), scene = JSON.parse(await readFile(path.join(path.dirname(nFilename), 'actual-scene.json')));
    assert.equal(scene.paths.length, 40);
    const sourceLinks = reconstruction.regions.map((r, i) => { assert.equal(scene.paths[i].id, r.caseId); assert.equal(scene.paths[i].svgElementId, 'candidate-p' + i);
      return { regionId: r.id, caseId: r.caseId, source: scene.paths[i].source, svgElementId: scene.paths[i].svgElementId }; });
    phase = 'primary'; const primaryRows = await captureDashLinesPrimary(renderer, { native, reconstruction,
      variant: { name: 'candidate', svg: actual, converterInvoked: true }, policy: primaryDerived.policy, output, artifacts });
    assert.ok(primaryRows.every(r => r.regions.every(q => q.crops)), 'Missing candidate primary crops.');
    const representationControls = primaryRows.map(r => { const original = primary.measurements.find(o => o.name === 'printed-pen-hull-driver-width-elements' && dashLinesViewKey(o) === dashLinesViewKey(r));
      return { ...Object.fromEntries(['frame', 'scale', 'background'].map(k => [k, r[k]])), identicalIndependentPng: r.imageHashes.actual === original.imageHashes.actual }; });
    phase = 'PDF'; const pdfRows = [], pages = {};
    for (const scale of [1, 4]) { const p = e.calibration.pages[scale + 'x'], b = await readFile(path.join(root, p.file)); assert.equal(sha256(b), p.sha256); await save('pdf-page-' + scale + 'x.png', b); pages[scale] = e.pdfPages[scale]; }
    for (const variant of [{ mode: 'original-svg', svg: native.reference, units: 'bp', origin: native.metrics.driverOriginBp, policy: pdfDerived.policies.original },
      { mode: 'candidate', svg: actual, units: 'cssPixels', origin: { x: 0, y: 0 }, policy: pdfDerived.policies.native }]) for (const view of shapePdfViews) {
      const prefix = variant.mode + '-PDF/' + dashLinesPdfViewKey(view), crops = new Map(), links = {}; let measured;
      for (let offset = 0; offset < 40; offset += 16) {
        const ids = pdf.regions.slice(1 + offset, 1 + Math.min(40, offset + 16)).map(r => r.id);
        const row = await measureDashLinesPdfPair(renderer, { svg: variant.svg, units: variant.units, svgOriginBp: variant.origin, camera: pdf.camera, regions: pdf.regions,
          ...view, pdfPage: pages[view.scale], rightLabel: variant.mode, cropLimit: ids.length, cropRegionIds: ids });
        const summarize = r => ({ ...r, images: undefined, crops: undefined });
        if (measured) assert.deepEqual(summarize(row), summarize(measured), 'PDF crop batches changed measurements.');
        else { measured = row; for (const [k, png] of Object.entries(row.images)) { links[k] = prefix + '-' + k + '.png'; await save(links[k], Buffer.from(png, 'base64')); } }
        assert.deepEqual(row.crops.map(c => c.id).sort(), [...ids].sort());
        for (const crop of row.crops) { assert.ok(!crops.has(crop.id)); const images = {};
          for (const [k, png] of Object.entries(crop.images)) { images[k] = prefix + '-' + crop.id + '-' + k + '.png'; await save(images[k], Buffer.from(png, 'base64')); } crops.set(crop.id, images); }
      }
      assert.equal(crops.size, 40);
      pdfRows.push({ mode: variant.mode, ...measured, images: undefined, crops: undefined, artifacts: links,
        regions: measured.regions.map(r => ({ ...r, crops: crops.get(r.id) })), evaluation: evaluateDashLinesPdfTrial(variant.policy, view, measured) });
    }
    const frames = numeric.numeric.checks.filter(c => c.quantity.startsWith('svg.root.')); assert.equal(frames.length, 6);
    const originalPdf = pdfRows.filter(r => r.mode === 'original-svg'), candidatePdf = pdfRows.filter(r => r.mode === 'candidate');
    assert.equal(primaryRows.length, 12); assert.equal(originalPdf.length, 4); assert.equal(candidatePdf.length, 4);
    const gate = (passed, executedChecks) => ({ state: passed ? 'passed' : 'failed', executedChecks });
    const combined = combineDashLines(e, gate(numeric.numeric.checks.every(c => c.passed), 927), gate(frames.every(c => c.passed), 6), primaryRows, originalPdf, candidatePdf);
    const { firstFailedGate, gates } = combined;
    await save('index.html', '<!doctype html><meta charset="utf-8"><h1>Forty-line combined conformance</h1><p>Fixed corpus with immutable independent primary and Cairo limits.</p>'
      + '<a href="report.json">Report</a> · <a href="candidate-evidence/source.tikz">Source</a> · <a href="candidate-evidence/actual-scene.json">Scene</a>'
      + primaryRows.map(r => '<h2>Primary / ' + dashLinesViewKey(r) + '</h2>' + (r.artifacts.comparison ? '<img loading="lazy" src="' + r.artifacts.comparison + '">' : '')
        + r.regions.map(q => '<p>' + q.id + ' / ' + q.caseId + '</p><img loading="lazy" src="' + q.crops.sheet + '">').join('')).join('')
      + pdfRows.map(r => '<h2>' + r.mode + ' / PDF / ' + dashLinesPdfViewKey(r) + '</h2>'
        + r.regions.map(q => '<p>' + q.id + ' / ' + q.caseId + '</p><img loading="lazy" src="' + q.crops.sheet + '">').join('')).join(''));
    for (const [p, h] of Object.entries(toolHashes)) assert.equal(sha256(await readFile(path.join(root, p))), h);
    assert.equal((await readDashLinesNative()).snapshotSha256, native.snapshotSha256); await verifyDashLinesAssets(output, artifacts);
    const rankedRegions = [...primaryRows.map(r => ({ route: 'primary', row: r })), ...pdfRows.map(r => ({ route: r.mode + '-PDF', row: r }))]
      .flatMap(({ route, row }) => row.regions.map(q => ({ route, view: dashLinesViewKey(row), regionId: q.id, caseId: q.caseId,
        rawChangedPixels: q.rawChangedPixels, passed: row.evaluation.checks.find(c => c.id === q.id).passed,
        source: sourceLinks.find(s => s.regionId === q.id).source, crops: q.crops })))
      .sort((a, b) => Number(a.passed) - Number(b.passed) || b.rawChangedPixels - a.rawChangedPixels || a.route.localeCompare(b.route) || a.view.localeCompare(b.view) || a.regionId.localeCompare(b.regionId));
    await publish({ schemaVersion: 1, comparisonKind: 'immutable-public-dash-lines-primary-and-PDF-conformance', completed: true,
      ...combined, policyId: e.profile.id, policySha256: e.profileSha256, calibrationSha256: e.profile.calibration.sha256, toolHashes, renderer: renderer.identity, compiler: numeric.compiler,
      camera: reconstruction.camera, regions: reconstruction.regions, numericEvidence: 'candidate-numeric-report.json', gates, sourceLinks,
      primaryComparisons: primaryRows, pdfComparisons: pdfRows, representationControls, artifacts,
      agent: { viewer: 'index.html', source: 'candidate-evidence/source.tikz', scene: 'candidate-evidence/actual-scene.json',
        firstFailedGate, rankedRegions, rerun: 'node tools/TikzVisual/compare-dash-lines-conformance.mjs',
        followUp: ['node tools/TikzVisual/dash-lines-policy-self-test.mjs', 'dotnet test Lokad.TikZ.slnx'] } });
    process.exitCode = firstFailedGate ? 1 : 0; console.log('Combined line conformance: ' + (firstFailedGate ?? 'all gates pass') + '; report ' + path.relative(root, path.join(output, 'report.json')));
  } finally { await renderer.browser.close(); }
}
await main().catch(async error => { process.exitCode = 2; console.error(error.stack);
  await publish({ completed: false, phase, verdict: 'infrastructure-error', overallVerdict: 'pending', approvedImagePolicy: false, imageConformanceClaim: false, error: error.message, toolHashes, artifacts }); });
