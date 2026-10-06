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

const base = path.join(root, 'artifacts/dash-geometry-primary-trial'), output = path.join(base, 'run-' + randomUUID()), artifacts = {};
const folder = path.join(root, 'tests/Reference/DashGeometry/native');
const files = ['trial-dash-geometry-primary.mjs', 'compare.mjs', 'browser-profile.json', 'package.json', 'package-lock.json', 'shape-oracle-bundle.mjs',
  'dash-geometry-image-pair.mjs', 'dash-geometry-image-defects.mjs', 'shape-raster-metrics.mjs', 'shape-primary-trial-policy.mjs'].map(p => 'tools/TikzVisual/' + p);
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
    const styles = await renderer.page.evaluate(reference => {
      const doc = new DOMParser().parseFromString(reference, 'image/svg+xml'), paths = [...doc.querySelectorAll('path')].filter(p => !p.closest('defs,clipPath'));
      const clips = [...doc.querySelectorAll('clipPath')]; if (paths.length !== 16 || clips.length !== 3) throw new Error('Incomplete source paint/clip coverage.');
      const attr = (p, k, fallback) => { for (let e = p; e; e = e.parentElement) if (e.hasAttribute(k)) return e.getAttribute(k); return fallback; };
      return paths.map(p => ({ widthPt: Number(attr(p, 'stroke-width', '1')), cap: attr(p, 'stroke-linecap', 'butt'), join: attr(p, 'stroke-linejoin', 'miter'),
        stroke: attr(p, 'stroke', '#000'), fill: attr(p, 'fill', '#000'), miter: Number(attr(p, 'stroke-miterlimit', '4')),
        strokeOpacity: Number(attr(p, 'stroke-opacity', '1')), fillOpacity: Number(attr(p, 'fill-opacity', '1')),
        rule: attr(p, 'fill-rule', 'nonzero'), clips: [...(function* () { for (let e = p; e; e = e.parentElement) yield e; })()].reverse()
          .filter(e => e.hasAttribute('clip-path')).map(e => {
            const m = /^url\(#([-\w]+)\)$/.exec(e.getAttribute('clip-path')); if (!m) throw new Error('Unexpected source clip.');
            const i = clips.findIndex(c => c.id === m[1]); if (i < 0) throw new Error('Unknown source clip.'); return i;
          }) }));
    }, reference);
    const spToCss = 96 / (72.27 * 65536), b = metrics.svg.bounds;
    const picture = { minX: b.minX * spToCss, minY: -b.maxY * spToCss, maxX: b.maxX * spToCss, maxY: -b.minY * spToCss };
    const camera = { x: Math.floor(picture.minX - 4), y: Math.floor(picture.minY - 4), width: 0, height: 0 };
    camera.width = Math.ceil(picture.maxX + 4) - camera.x; camera.height = Math.ceil(picture.maxY + 4) - camera.y;
    const n = x => Number(x.toFixed(6));
    function bounds(r) {
      const points = r.segments.flatMap(s => s.kind === 'Cubic' ? [s.end, s.a, s.b] : [s.end]);
      return { minX: Math.min(...points.map(p => p.x * spToCss)), maxX: Math.max(...points.map(p => p.x * spToCss)),
        minY: Math.min(...points.map(p => -p.y * spToCss)), maxY: Math.max(...points.map(p => -p.y * spToCss)) };
    }
    const regions = paints.map((p, i) => {
      const box = bounds(p), radius = Math.max(p.widthSp * spToCss, styles[i].widthPt * 96 / 72.27) / 2;
      box.minX -= radius; box.maxX += radius; box.minY -= radius; box.maxY += radius;
      for (const j of styles[i].clips) { const c = bounds(clips[j]); box.minX = Math.max(box.minX, c.minX); box.maxX = Math.min(box.maxX, c.maxX);
        box.minY = Math.max(box.minY, c.minY); box.maxY = Math.min(box.maxY, c.maxY); }
      const x = Math.max(0, Math.floor(box.minX - camera.x - 3)), y = Math.max(0, Math.floor(box.minY - camera.y - 3));
      return { id: 'path-' + i, nodeId: null, kind: 'path', caseId: p.id, rectangle: { x, y, width: Math.min(camera.width, Math.ceil(box.maxX - camera.x + 3)) - x,
        height: Math.min(camera.height, Math.ceil(box.maxY - camera.y + 3)) - y } };
    });
    assert.ok(regions.every(r => r.rectangle.width > 0 && r.rectangle.height > 0));
    // Picture registration comes from native PGF bounds. The second root is
    // independently reconstructed from native control hulls and original
    // printed pen widths, excluding paints suppressed by native clipping.
    const contributors = paints.map((p, i) => ({ p, i })).filter(({ i }) => styles[i].clips.length === 0);
    const envelopes = contributors.map(({ p, i }) => {
      const h = bounds(p), r = styles[i].widthPt * 96 / 72.27 / 2;
      return { minX: h.minX - r, minY: h.minY - r, maxX: h.maxX + r, maxY: h.maxY + r };
    });
    const printedPicture = { minX: Math.min(...envelopes.map(b => b.minX)), minY: Math.min(...envelopes.map(b => b.minY)),
      maxX: Math.max(...envelopes.map(b => b.maxX)), maxY: Math.max(...envelopes.map(b => b.maxY)) };
    const rootChecks = Object.keys(picture).map(k => ({ quantity: k, native: picture[k], printedPen: printedPicture[k],
      error: Math.abs(picture[k] - printedPicture[k]), limit: .5 * spToCss, passed: Math.abs(picture[k] - printedPicture[k]) <= .5 * spToCss }));
    for (const [quantity, lo, hi] of [['width', 'minX', 'maxX'], ['height', 'minY', 'maxY']]) {
      const native = picture[hi] - picture[lo], printedPen = printedPicture[hi] - printedPicture[lo], error = Math.abs(native - printedPen);
      rootChecks.push({ quantity, native, printedPen, error, limit: .5 * spToCss, passed: error <= .5 * spToCss });
    }
    assert.ok(rootChecks.every(c => c.passed));
    const roots = [{ name: 'native-box', picture }, { name: 'printed-pen-hull', picture: printedPicture }], serialization = [], representations = [];
    for (const declared of roots) for (const widthSource of ['driver', 'native']) for (const transformPlacement of ['group', 'elements']) {
      const digits = 'short', name = declared.name + '-' + widthSource + '-width-' + transformPlacement;
      const physicalScale = transformPlacement === 'group' ? 96 / 72.27 : Number((96 / 72.27).toPrecision(15));
      assert.ok(Math.abs(physicalScale - 96 / 72.27) <= 1e-14);
      const physicalTransform = 'scale(' + physicalScale + ' ' + -physicalScale + ')';
      const elementTransform = transformPlacement === 'elements' ? ' transform="' + physicalTransform + '"' : '';
      const numeric = (value, id) => {
        let serialized;
        if (digits === 'short') {
          const sp = Math.round(value * 65536);
          for (let places = 0; places <= 5; places++) {
            const candidate = Number(value.toFixed(places));
            if (Math.round(candidate * 65536) === sp) { serialized = candidate; break; }
          }
          assert.notEqual(serialized, undefined, 'No decimal recovering the native scaled point.');
        } else serialized = Number(value.toFixed(digits));
        const error = Math.abs(value - serialized), limit = (digits === 'short' ? .5 / 65536 : .5 * 10 ** -digits) + 1e-10;
        serialization.push({ representation: name, id, expected: value, serialized, units: 'TeX points', error, limit, passed: Number.isFinite(error) && error <= limit });
        assert.ok(Number.isFinite(serialized) && error <= limit); return serialized;
      };
      const nativePoint = (p, id) => {
        for (const coordinate of ['x', 'y']) {
          assert.ok(Number.isSafeInteger(p[coordinate]));
          assert.equal(Math.round(numeric(p[coordinate] / 65536, id + '.' + coordinate) * 65536), p[coordinate]);
        }
        return numeric(p.x / 65536, id + '.x.emit') + ' ' + numeric(p.y / 65536, id + '.y.emit');
      };
      const nativeData = r => r.segments.map((s, i) => ({ Move: 'M', Line: 'L', Cubic: 'C', Close: 'Z' }[s.kind])
        + (s.kind === 'Close' ? '' : s.kind === 'Cubic' ? nativePoint(s.a, r.id + '.' + i + '.a') + ' ' + nativePoint(s.b, r.id + '.' + i + '.b')
          + ' ' + nativePoint(s.end, r.id + '.' + i + '.end') : nativePoint(s.end, r.id + '.' + i + '.end'))).join(' ');
      const nativeDefs = '<defs>' + clips.map((r, i) => '<clipPath id="native-clip' + i + '" clipPathUnits="userSpaceOnUse"><path' + elementTransform + ' d="' + nativeData(r) + '"/></clipPath>').join('') + '</defs>';
      const nativeBody = paints.map((r, i) => {
        const s = styles[i], width = widthSource === 'driver' ? s.widthPt : r.widthSp / 65536;
        let item = '<path id="native-p' + i + '"' + elementTransform + ' d="' + nativeData(r) + '" stroke="' + s.stroke + '" fill="' + s.fill + '" stroke-width="' + numeric(width, r.id + '.width')
          + '" stroke-linecap="' + s.cap + '" stroke-linejoin="' + s.join + '" stroke-opacity="' + s.strokeOpacity + '" fill-opacity="' + s.fillOpacity + '" fill-rule="' + s.rule + '"'
          + ' stroke-miterlimit="' + s.miter + '"'
          + (r.lengthsSp.length ? ' stroke-dasharray="' + r.lengthsSp.map((x, j) => numeric(x / 65536, r.id + '.dash.' + j)).join(' ')
            + '" stroke-dashoffset="' + numeric(r.phaseSp / 65536, r.id + '.phase') + '"' : '') + '/>';
        for (const j of [...s.clips].reverse()) item = '<g clip-path="url(#native-clip' + j + ')">' + item + '</g>'; return item;
      }).join('');
      const frame = declared.picture;
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + n(frame.maxX - frame.minX) + 'px" height="' + n(frame.maxY - frame.minY)
        + 'px" viewBox="' + [frame.minX, frame.minY, frame.maxX - frame.minX, frame.maxY - frame.minY].map(n).join(' ') + '">'
        + nativeDefs + (transformPlacement === 'group' ? '<g transform="' + physicalTransform + '">' + nativeBody + '</g>' : nativeBody) + '</svg>';
      representations.push({ name, svg, converterInvoked: false, units: 'TeX points under physical scale', precision: digits, widthSource,
        transformPlacement, physicalScale, frame: declared.name });
    }
    assert.ok(serialization.length > 1000 && serialization.every(c => c.passed));
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
      roots, rootChecks, rootContributors: contributors.map(({ p }) => p.id), oracleMeasurements, policy: 'prospective-policy.json', controls, candidate, combined,
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
