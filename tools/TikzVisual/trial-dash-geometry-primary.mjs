// Oracle-only registration/serialization variants precede public conversion.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRenderer } from './compare.mjs';
import { root, sha256, outputPath, writeArtifact } from './shape-oracle-bundle.mjs';
import { installShapeMetrics, measureDashGeometryPair } from './dash-geometry-image-pair.mjs';
import { shapeViews, deriveShapeTrialPolicy, evaluateShapeTrial, combineShapeTrial } from './shape-primary-trial-policy.mjs';
import { dashGeometryImageDefects, mutateDashGeometrySvg } from './dash-geometry-image-defects.mjs';
import { reconstructDashGeometryPrimary } from './dash-geometry-primary-reconstruction.mjs';

const base = path.join(root, 'artifacts/dash-geometry-primary-trial'), output = path.join(base, 'run-' + randomUUID()), artifacts = {};
const folder = path.join(root, 'tests/Reference/DashGeometry/native');
const files = ['trial-dash-geometry-primary.mjs', 'compare.mjs', 'browser-profile.json', 'package.json', 'package-lock.json', 'shape-oracle-bundle.mjs',
  'dash-geometry-image-pair.mjs', 'dash-geometry-primary-reconstruction.mjs', 'dash-geometry-image-defects.mjs', 'shape-raster-metrics.mjs', 'shape-primary-trial-policy.mjs'].map(p => 'tools/TikzVisual/' + p);
files.push('tools/TikzDashComparison/Program.cs', 'tools/TikzDashComparison/DashGeometryComparison.cs', 'tools/TikzDashComparison/TikzDashComparison.csproj',
  'tools/TikzDashComparison/packages.lock.json', 'tools/TikzDashGeometryReference/DashGeometryEvidence.cs', 'tools/TikzDashComparison/EmittedSvgEvidence.cs', 'src/Lokad.TikZ/Svg/SvgWriter.cs');
const save = (p, b) => writeArtifact(output, p, b, artifacts);
let toolHashes = {}, phase = 'independent-inputs';
async function publish(report) {
  await writeArtifact(output, 'report.json', JSON.stringify(report, null, 2) + '\n');
  await writeArtifact(base, 'latest.json', JSON.stringify({ completed: report.completed,
    report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'), sha256: sha256(await readFile(path.join(output, 'report.json'))),
    approvedImagePolicy: false }, null, 2) + '\n');
}
async function main() {
  assert.equal(process.argv.length, 2); await outputPath(output);
  for (const p of files) { const b = await readFile(path.join(root, p)); toolHashes[p] = sha256(b); await save('tool-sources/' + p, b); }
  await publish({ completed: false, phase, toolHashes, verdict: 'in-progress', approvedImagePolicy: false });
  console.log('Fresh dash geometry primary trial: ' + path.relative(root, output).split(path.sep).join('/'));
  const snapshotBytes = await readFile(path.join(root, 'tests/Reference/DashGeometry/snapshot.json')), snapshot = JSON.parse(snapshotBytes);
  const metricsBytes = await readFile(path.join(folder, 'metrics.json')), metrics = JSON.parse(metricsBytes);
  const reference = await readFile(path.join(folder, 'reference.svg'), 'utf8');
  assert.equal(metrics.converterInvoked, false); assert.equal(metrics.approvedImagePolicy, false); assert.deepEqual(metrics.svg.records, metrics.pdf.records);
  const paints = metrics.svg.records.filter(r => r.actions !== 'clip'), clips = metrics.svg.records.filter(r => r.actions === 'clip');
  assert.equal(paints.length, 16); assert.equal(clips.length, 3);
  async function verify() {
    assert.equal(sha256(await readFile(path.join(root, 'tests/Reference/DashGeometry/snapshot.json'))), sha256(snapshotBytes));
    for (const [p, h] of Object.entries(snapshot.artifacts)) assert.equal(sha256(await readFile(path.join(folder, p))), h, p);
    for (const [p, h] of Object.entries({ ...snapshot.sourceHashes, ...toolHashes })) assert.equal(sha256(await readFile(path.join(root, p))), h, p);
  }
  await verify(); const renderer = await createRenderer();
  try {
    await installShapeMetrics(renderer);
    const { camera, regions, roots, rootChecks, representations, serialization, rootContributors }
      = await reconstructDashGeometryPrimary(renderer, { metrics, reference });
    for (const r of representations) await save(r.name + '.svg', r.svg);
    await save('reference.svg', reference);
    await save('reference-snapshot.json', snapshotBytes); await save('native-metrics.json', metricsBytes);
    phase = 'independent-calibration'; const observations = [];
    async function pairs(variant, activePolicy, views = shapeViews, expectedPassed = null, cropIds = ['path-6', 'path-7', 'path-11']) {
      const rows = [];
      for (const view of views) {
        const result = await measureDashGeometryPair(renderer, { reference, actual: variant.svg, leftIsDriver: true, origin: metrics.driverOriginBp, camera, regions,
          ...view, rightLabel: variant.name, cropLimit: 3, cropRegionIds: cropIds });
        assert.equal(result.repeat.exactRgbaMatch, true);
        const prefix = variant.name + '/' + view.frame + '-' + view.scale + 'x-' + view.background, links = {}, crops = new Map();
        for (const [kind, png] of Object.entries(result.images)) { links[kind] = prefix + '-' + kind + '.png'; await save(links[kind], Buffer.from(png, 'base64')); }
        for (const crop of result.crops) { const links = {}; for (const [kind, png] of Object.entries({ ...crop.paired, sheet: crop.sheet })) {
          links[kind] = prefix + '-' + crop.id + '-' + kind + '.png'; await save(links[kind], Buffer.from(png, 'base64'));
        } crops.set(crop.id, links); }
        const row = { name: variant.name, converterInvoked: variant.converterInvoked, ...view, ...result, images: undefined, crops: undefined,
          artifacts: links, regions: result.regions.map(r => ({ ...r, crops: crops.get(r.id) ?? null })),
          evaluation: activePolicy ? evaluateShapeTrial(activePolicy, view, result) : null };
        rows.push(row); observations.push(row);
      }
      const passed = activePolicy ? rows.every(r => r.evaluation.passed) : null;
      return { name: variant.name, expectedPassed, passed,
        expectedOutcomeSatisfied: expectedPassed === null || rows.every(r => r.evaluation.passed === expectedPassed), comparisons: rows };
    }
    for (const r of representations) await pairs(r, null);
    // Use component-wise maxima of independently measured rows. No candidate
    // pixels participate in this policy and no failed control adds a margin.
    const oracleMeasurements = shapeViews.map(view => {
      const rows = observations.filter(o => o.frame === view.frame && o.scale === view.scale && o.background === view.background);
      const merge = items => {
        const fields = ['rawChangedPixels', 'maxRawChannelError', 'premultipliedChangedPixels', 'maxPremultipliedChannelError', 'meanForegroundChannelError'];
        assert.ok(items.every(m => m.topology.componentDifference === 0));
        return { ...Object.fromEntries(fields.map(k => [k, Math.max(...items.map(m => m[k]))])), topology: { ...items[0].topology,
          maxEdgeDisplacementRasterPixels: Math.max(...items.map(m => m.topology.maxEdgeDisplacementRasterPixels)), componentDifference: 0 } };
      };
      return { ...view, ...merge(rows.map(r => r.metrics)), regions: regions.map((r, i) => ({ ...r, ...merge(rows.map(v => v.regions[i])) })) };
    });
    const policy = deriveShapeTrialPolicy(oracleMeasurements, 'Sixteen geometry dash paints and three clips; native-box/printed-pen roots; independent short native-point SVGs; group/element physical transforms.');
    await save('prospective-policy.json', JSON.stringify(policy, null, 2) + '\n');
    const controls = [];
    for (const r of representations) controls.push(await pairs({ ...r, name: r.name + '-replay' }, policy, shapeViews, true));
    // Some semantic changes have no pixels at a given resolution. Demonstrate
    // this from independent geometry before conversion, rather than asking a
    // raster gate to distinguish byte-identical images or changing its limits.
    phase = 'independent-raster-visibility'; const visibilityControls = [];
    const visibilitySource = representations.find(r => r.name === 'printed-pen-hull-driver-width-elements');
    const visibilityReplay = controls.find(c => c.name === visibilitySource.name + '-replay');
    for (const control of [{ name: 'unpainted-join', pathIndex: 6, scales: [1, 4], expectedPassed: true },
      { name: 'subpixel-faint-content', pathIndex: 0, scales: [1], expectedPassed: true },
      { name: 'subpixel-faint-content', pathIndex: 0, scales: [4], expectedPassed: false }]) {
      const svg = await renderer.page.evaluate(mutateDashGeometrySvg, { actual: visibilitySource.svg, defect: control, pathPrefix: 'native-p', clipPrefix: 'native-clip' });
      const name = 'visibility-' + control.name + '-' + control.scales.join('-') + 'x';
      await save(name + '.svg', svg);
      const result = await pairs({ name, svg, converterInvoked: false }, policy,
        shapeViews.filter(v => v.background === 'white' && control.scales.includes(v.scale)), control.expectedPassed, ['path-' + control.pathIndex]);
      const pixelChecks = result.comparisons.map(v => {
        const baseline = visibilityReplay.comparisons.find(b => b.frame === v.frame && b.scale === v.scale && b.background === v.background);
        const identicalEncodedCanvasPng = artifacts[v.artifacts.actual] === artifacts[baseline.artifacts.actual];
        assert.equal(identicalEncodedCanvasPng, control.expectedPassed);
        return { frame: v.frame, scale: v.scale, identicalEncodedCanvasPng, baseline: baseline.artifacts.actual, changed: v.artifacts.actual };
      });
      visibilityControls.push({ ...result, control: control.name, targetRegion: 'path-' + control.pathIndex, converterInvoked: false,
        numericGatesBypassed: true, semanticChange: control.name === 'unpainted-join' ? 'round to miter join' : 'additional one-percent-opacity 0.4pt-wide 4pt-long stroke', pixelChecks });
    }
    phase = 'public-numeric'; const numericProcess = spawnSync('dotnet', ['run', '--project', 'tools/TikzDashComparison', '-c', 'Release', '--no-restore', '--', 'geometry'],
      { cwd: root, windowsHide: true, timeout: 180000, maxBuffer: 1000000 });
    await save('candidate-command.txt', Buffer.concat([numericProcess.stdout ?? Buffer.alloc(0), numericProcess.stderr ?? Buffer.alloc(0)]));
    assert.equal(numericProcess.status, 0, 'Public geometry numeric checks failed.');
    const pointer = JSON.parse(await readFile(path.join(root, 'artifacts/dash-geometry-comparisons/latest.json')));
    const numericFile = path.join(root, 'artifacts/dash-geometry-comparisons', pointer.report), numericBytes = await readFile(numericFile);
    assert.equal(sha256(numericBytes), pointer.sha256); const numeric = JSON.parse(numericBytes);
    assert.equal(numeric.numeric.passed, true); assert.equal(numeric.numeric.checks.length, 1090);
    assert.ok(numeric.numeric.checks.every(c => c.passed));
    assert.equal(numeric.referenceSnapshotSha256, sha256(snapshotBytes));
    for (const [p, h] of Object.entries(numeric.toolHashes)) assert.equal(sha256(await readFile(path.join(root, p))), h, p);
    assert.equal(numeric.compiler.sha256, sha256(await readFile(path.join(root, 'src/Lokad.TikZ/bin/Release/net10.0/Lokad.TikZ.dll'))));
    for (const [p, h] of Object.entries(numeric.artifacts)) {
      const bytes = await readFile(path.join(path.dirname(numericFile), p)); assert.equal(sha256(bytes), h, p); await save('candidate-evidence/' + p, bytes);
    }
    await save('candidate-numeric-report.json', numericBytes); const actual = await readFile(path.join(path.dirname(numericFile), 'actual.svg'), 'utf8');
    const scene = JSON.parse(await readFile(path.join(path.dirname(numericFile), 'actual-scene.json')));
    assert.equal(scene.paths.length, 16); assert.equal(scene.clips.length, 3);
    const sourceLinks = regions.map((r, i) => {
      assert.equal(scene.paths[i].id, r.caseId); assert.equal(scene.paths[i].svgElementId, 'geometry-p' + i);
      return { regionId: r.id, caseId: r.caseId, source: scene.paths[i].source, svgElementId: scene.paths[i].svgElementId };
    });
    phase = 'candidate-primary'; const candidate = await pairs({ name: 'candidate', svg: actual, converterInvoked: true }, policy, shapeViews, true);
    const combined = combineShapeTrial({ state: 'passed', executedChecks: 1090 }, { state: 'passed', executedChecks: rootChecks.length }, candidate.comparisons);
    phase = 'image-only-defects'; const defects = [];
    for (const defect of dashGeometryImageDefects) {
      const svg = await renderer.page.evaluate(mutateDashGeometrySvg, { actual, defect });
      const file = 'defects/' + defect.name + '.svg'; await save(file, svg);
      const views = shapeViews.filter(v => v.background === 'white' && (defect.name !== 'root-crop' || v.frame === 'natural'));
      const control = await pairs({ name: 'defect-' + defect.name, svg, converterInvoked: false }, policy, views, false, ['path-' + defect.pathIndex]);
      const targetRegion = 'path-' + defect.pathIndex;
      const targetRejectedInEveryView = control.comparisons.every(v => v.evaluation.checks.some(c => c.id === targetRegion && !c.passed));
      defects.push({ ...control, defect: defect.name, targetRegion, source: sourceLinks[defect.pathIndex], inputSvg: file,
        inputSha256: sha256(svg), numericGatesBypassed: true, targetRejectedInEveryView });
    }
    const coverageControls = [];
    const rejects = (name, fn, message) => { assert.throws(fn, message); coverageControls.push({ name, expected: 'rejected', passed: true }); };
    rejects('missing-oracle-view', () => deriveShapeTrialPolicy(oracleMeasurements.slice(1)), /Incomplete oracle measurement/);
    rejects('duplicate-oracle-view', () => deriveShapeTrialPolicy([oracleMeasurements[0], ...oracleMeasurements.slice(0, -1)]), /Duplicate oracle measurement/);
    const incompleteRegions = structuredClone(oracleMeasurements); incompleteRegions[1].regions.pop();
    rejects('missing-oracle-region', () => deriveShapeTrialPolicy(incompleteRegions), /Regions changed/);
    const badMetric = structuredClone(oracleMeasurements); badMetric[0].regions[0].rawChangedPixels = NaN;
    rejects('nonfinite-oracle-metric', () => deriveShapeTrialPolicy(badMetric), /Invalid oracle metric/);
    const lostComponents = structuredClone(oracleMeasurements); lostComponents[0].regions[0].topology.componentDifference = 1;
    rejects('lost-oracle-component', () => deriveShapeTrialPolicy(lostComponents), /changed component counts/);
    const first = candidate.comparisons[0];
    rejects('missing-candidate-region', () => evaluateShapeTrial(policy, first, { ...first, regions: first.regions.slice(1) }), /Incomplete candidate regions/);
    const shiftedRegion = structuredClone(first); shiftedRegion.regions[0].rectangle.x++;
    rejects('candidate-chosen-region', () => evaluateShapeTrial(policy, first, shiftedRegion), /Candidate supplied different regions/);
    const numericPassed = { state: 'passed', executedChecks: 1090 }, framePassed = { state: 'passed', executedChecks: rootChecks.length };
    rejects('missing-image-view', () => combineShapeTrial(numericPassed, framePassed, candidate.comparisons.slice(1)), /Incomplete required image/);
    rejects('duplicate-image-view', () => combineShapeTrial(numericPassed, framePassed, [first, ...candidate.comparisons.slice(0, -1)]), /Duplicate required image/);
    rejects('missing-numeric-evidence', () => combineShapeTrial({ state: 'passed', executedChecks: 0 }, framePassed, candidate.comparisons), /Empty required numeric/);
    const contradictory = structuredClone(candidate.comparisons); contradictory[0].evaluation.passed = !contradictory[0].evaluation.passed;
    rejects('contradictory-image-summary', () => combineShapeTrial(numericPassed, framePassed, contradictory), /Image gate summary contradicts/);
    for (const gate of ['numeric', 'frame']) {
      const result = combineShapeTrial(gate === 'numeric' ? { ...numericPassed, state: 'failed' } : numericPassed,
        gate === 'frame' ? { ...framePassed, state: 'failed' } : framePassed, candidate.comparisons);
      assert.equal(result.passed, false); assert.equal(result.firstFailedGate, gate);
      coverageControls.push({ name: gate + '-failure-cannot-be-overridden-by-images', expected: 'rejected', passed: true });
    }
    const successful = combined.passed && controls.every(c => c.expectedOutcomeSatisfied)
      && defects.every(c => c.expectedOutcomeSatisfied && c.targetRejectedInEveryView)
      && visibilityControls.every(c => c.expectedOutcomeSatisfied);
    await verify(); for (const [p, h] of Object.entries(artifacts)) assert.equal(sha256(await readFile(await outputPath(output, p))), h);
    await save('index.html', '<!doctype html><meta charset="utf-8"><title>Dash geometry primary</title><h1>Prospective primary policy; admission pending</h1>'
      + '<p><a href="report.json">Report</a> · <a href="candidate-evidence/source.tikz">Source</a> · <a href="candidate-evidence/actual-scene.json">Scene</a></p>'
      + observations.filter(o => o.artifacts.comparison).map(o => '<h2>' + o.name + ' / ' + o.frame + ' / ' + o.scale + 'x / ' + o.background + '</h2><img style="max-width:100%" src="' + o.artifacts.comparison + '">'
        + o.regions.filter(r => r.crops).map(r => '<p>' + r.id + ' / ' + r.caseId + '</p><img style="max-width:100%" src="' + r.crops.sheet + '">').join('')).join(''));
    await publish({ schemaVersion: 1, comparisonKind: 'dash-geometry-primary-trial', completed: true, verdict: successful ? 'trial-pass' : 'trial-failed',
      overallVerdict: 'pending', approvedImagePolicy: false, imageConformanceClaim: false, referenceSnapshotSha256: sha256(snapshotBytes), toolHashes,
      renderer: renderer.identity, camera, regions, numeric: { passed: true, checks: 1090, evidence: 'candidate-numeric-report.json' },
      independentRepresentations: representations.map(({ svg, ...r }) => ({ ...r, source: r.name + '.svg', sha256: sha256(svg) })), serialization: { passed: true, checks: serialization },
      roots, rootChecks, rootContributors, oracleMeasurements, policy: 'prospective-policy.json', controls, candidate, combined,
      sourceLinks, defects, coverageControls, visibilityControls,
      firstFailedGate: combined.firstFailedGate ?? (!successful ? 'comparator-controls' : null),
      failedControls: [...controls, ...defects, ...visibilityControls].filter(c => !c.expectedOutcomeSatisfied || c.targetRejectedInEveryView === false).map(c => c.name),
      observations, artifacts, agent: { viewer: 'index.html', scene: 'candidate-evidence/actual-scene.json', focusedRerun: 'node tools/TikzVisual/trial-dash-geometry-primary.mjs' },
      remaining: ['Reviewed immutable primary policy with provenance controls.', 'Independent PDF image checks and policy.', 'Labels and node dash interactions.'] });
    console.log('Dash geometry primary: ' + (successful ? 'trial-pass' : 'trial-failed') + '; 1090 public checks, ' + serialization.length + ' serialization checks, ' + observations.length + ' views; admission pending.');
    process.exitCode = successful ? 0 : 1;
  } finally { await renderer.browser.close(); }
}
try { await main(); } catch (error) {
  await publish({ completed: false, verdict: 'infrastructure-error', phase, toolHashes, approvedImagePolicy: false, error: error.message, artifacts });
  console.error(error.stack); process.exitCode = 2;
}
