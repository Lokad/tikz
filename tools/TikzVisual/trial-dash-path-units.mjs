// Oracle-only path-unit variants are established before public conversion.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRenderer } from './compare.mjs';
import { root, sha256, outputPath, writeArtifact } from './shape-oracle-bundle.mjs';
import { installShapeMetrics, measureDashGeometryPair } from './dash-geometry-image-pair.mjs';
import { shapeViews } from './shape-primary-trial-policy.mjs';

const base = path.join(root, 'artifacts/dash-path-units'), output = path.join(base, 'run-' + randomUUID()), artifacts = {};
const folder = path.join(root, 'tests/Reference/DashGeometry/native');
const files = ['trial-dash-path-units.mjs', 'compare.mjs', 'browser-profile.json', 'package.json', 'package-lock.json', 'shape-oracle-bundle.mjs',
  'dash-geometry-image-pair.mjs', 'shape-raster-metrics.mjs', 'shape-primary-trial-policy.mjs'].map(p => 'tools/TikzVisual/' + p);
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
  console.log('Fresh dash path-unit experiment: ' + path.relative(root, output).split(path.sep).join('/'));
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
        stroke: attr(p, 'stroke', '#000'), fill: attr(p, 'fill', '#000'), strokeOpacity: Number(attr(p, 'stroke-opacity', '1')), fillOpacity: Number(attr(p, 'fill-opacity', '1')),
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
    const n = x => Number(x.toFixed(6)), point = p => n(p.x * spToCss) + ' ' + n(-p.y * spToCss);
    const data = r => r.segments.map(s => ({ Move: 'M', Line: 'L', Cubic: 'C', Close: 'Z' }[s.kind])
      + (s.kind === 'Close' ? '' : s.kind === 'Cubic' ? point(s.a) + ' ' + point(s.b) + ' ' + point(s.end) : point(s.end))).join(' ');
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
    const defs = '<defs>' + clips.map((p, i) => '<clipPath id="native-clip' + i + '"><path d="' + data(p) + '"/></clipPath>').join('') + '</defs>';
    const body = paints.map((p, i) => {
      const s = styles[i]; let item = '<path id="native-p' + i + '" d="' + data(p) + '" stroke="' + s.stroke + '" fill="' + s.fill
        + '" stroke-width="' + n(s.widthPt * 96 / 72.27) + '" stroke-linecap="' + s.cap + '" stroke-linejoin="' + s.join
        + '" stroke-opacity="' + s.strokeOpacity + '" fill-opacity="' + s.fillOpacity + '" fill-rule="' + s.rule + '"'
        + (p.lengthsSp.length ? ' stroke-dasharray="' + p.lengthsSp.map(x => n(x * spToCss)).join(' ') + '" stroke-dashoffset="' + n(p.phaseSp * spToCss) + '"' : '') + '/>';
      for (const j of [...s.clips].reverse()) item = '<g clip-path="url(#native-clip' + j + ')">' + item + '</g>'; return item;
    }).join('');
    const independent = '<svg xmlns="http://www.w3.org/2000/svg" width="' + n(picture.maxX - picture.minX) + 'px" height="' + n(picture.maxY - picture.minY)
      + 'px" viewBox="' + [picture.minX, picture.minY, picture.maxX - picture.minX, picture.maxY - picture.minY].map(n).join(' ') + '">' + defs + body + '</svg>';
    const serialization = [], representations = [{ name: 'css-6-driver-width', svg: independent, converterInvoked: false,
      units: 'CSS pixels', precision: 6, widthSource: 'Original printed driver width' }];
    for (const digits of [6, 12, 'short']) for (const widthSource of ['driver', 'native']) {
      const name = 'pt-' + digits + '-' + widthSource + '-width';
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
      const nativeDefs = '<defs>' + clips.map((r, i) => '<clipPath id="native-clip' + i + '" clipPathUnits="userSpaceOnUse"><path d="' + nativeData(r) + '"/></clipPath>').join('') + '</defs>';
      const nativeBody = paints.map((r, i) => {
        const s = styles[i], width = widthSource === 'driver' ? s.widthPt : r.widthSp / 65536;
        let item = '<path id="native-p' + i + '" d="' + nativeData(r) + '" stroke="' + s.stroke + '" fill="' + s.fill + '" stroke-width="' + numeric(width, r.id + '.width')
          + '" stroke-linecap="' + s.cap + '" stroke-linejoin="' + s.join + '" stroke-opacity="' + s.strokeOpacity + '" fill-opacity="' + s.fillOpacity + '" fill-rule="' + s.rule + '"'
          + (r.lengthsSp.length ? ' stroke-dasharray="' + r.lengthsSp.map((x, j) => numeric(x / 65536, r.id + '.dash.' + j)).join(' ')
            + '" stroke-dashoffset="' + numeric(r.phaseSp / 65536, r.id + '.phase') + '"' : '') + '/>';
        for (const j of [...s.clips].reverse()) item = '<g clip-path="url(#native-clip' + j + ')">' + item + '</g>'; return item;
      }).join('');
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + n(picture.maxX - picture.minX) + 'px" height="' + n(picture.maxY - picture.minY)
        + 'px" viewBox="' + [picture.minX, picture.minY, picture.maxX - picture.minX, picture.maxY - picture.minY].map(n).join(' ') + '">'
        + nativeDefs + '<g transform="scale(' + 96 / 72.27 + ',' + -96 / 72.27 + ')">' + nativeBody + '</g></svg>';
      representations.push({ name, svg, converterInvoked: false, units: 'TeX points under physical scale', precision: digits, widthSource });
    }
    assert.ok(serialization.length > 1000 && serialization.every(c => c.passed));
    for (const r of representations) await save(r.name + '.svg', r.svg);
    await save('reference.svg', reference);
    await save('reference-snapshot.json', snapshotBytes); await save('native-metrics.json', metricsBytes);
    phase = 'public-numeric'; const numericProcess = spawnSync('dotnet', ['run', '--project', 'tools/TikzDashComparison', '-c', 'Release', '--no-build', '--no-restore', '--', 'geometry'],
      { cwd: root, windowsHide: true, timeout: 180000, maxBuffer: 1000000 });
    await save('candidate-command.txt', Buffer.concat([numericProcess.stdout ?? Buffer.alloc(0), numericProcess.stderr ?? Buffer.alloc(0)]));
    assert.equal(numericProcess.status, 0, 'Public geometry numeric checks failed.');
    const pointer = JSON.parse(await readFile(path.join(root, 'artifacts/dash-geometry-comparisons/latest.json')));
    const numericFile = path.join(root, 'artifacts/dash-geometry-comparisons', pointer.report), numericBytes = await readFile(numericFile);
    assert.equal(sha256(numericBytes), pointer.sha256); const numeric = JSON.parse(numericBytes);
    assert.equal(numeric.numeric.passed, true); assert.equal(numeric.numeric.checks.length, 1090);
    assert.equal(numeric.referenceSnapshotSha256, sha256(snapshotBytes));
    for (const [p, h] of Object.entries(numeric.artifacts)) {
      const bytes = await readFile(path.join(path.dirname(numericFile), p)); assert.equal(sha256(bytes), h, p); await save('candidate-evidence/' + p, bytes);
    }
    await save('candidate-numeric-report.json', numericBytes); const actual = await readFile(path.join(path.dirname(numericFile), 'actual.svg'), 'utf8');
    phase = 'raw-primary'; const observations = [];
    for (const variant of [...representations, { name: 'candidate', svg: actual, converterInvoked: true }]) {
      for (const view of shapeViews) {
        const result = await measureDashGeometryPair(renderer, { reference, actual: variant.svg, leftIsDriver: true, origin: metrics.driverOriginBp, camera, regions,
          ...view, rightLabel: variant.name, cropLimit: 3, cropRegionIds: ['path-6', 'path-7', 'path-11'] });
        assert.equal(result.repeat.exactRgbaMatch, true);
        const prefix = variant.name + '/' + view.frame + '-' + view.scale + 'x-' + view.background, links = {}, crops = new Map();
        for (const [kind, png] of Object.entries(result.images)) { links[kind] = prefix + '-' + kind + '.png'; await save(links[kind], Buffer.from(png, 'base64')); }
        for (const crop of result.crops) { const links = {}; for (const [kind, png] of Object.entries({ ...crop.paired, sheet: crop.sheet })) {
          links[kind] = prefix + '-' + crop.id + '-' + kind + '.png'; await save(links[kind], Buffer.from(png, 'base64'));
        } crops.set(crop.id, links); }
        observations.push({ name: variant.name, converterInvoked: variant.converterInvoked, ...view, ...result, images: undefined, crops: undefined,
          artifacts: links, regions: result.regions.map(r => ({ ...r, crops: crops.get(r.id) ?? null })) });
      }
    }
    await verify(); for (const [p, h] of Object.entries(artifacts)) assert.equal(sha256(await readFile(await outputPath(output, p))), h);
    await save('index.html', '<!doctype html><meta charset="utf-8"><title>Dash path units</title><h1>Path-unit experiment; admission pending</h1>'
      + '<p><a href="report.json">Report</a> · <a href="candidate-evidence/source.tikz">Source</a> · <a href="candidate-evidence/actual-scene.json">Scene</a></p>'
      + observations.map(o => '<h2>' + o.name + ' / ' + o.frame + ' / ' + o.scale + 'x / ' + o.background + '</h2><img style="max-width:100%" src="' + o.artifacts.comparison + '">').join(''));
    await publish({ schemaVersion: 1, comparisonKind: 'dash-path-unit-experiment', completed: true, verdict: 'observations-complete',
      overallVerdict: 'pending', approvedImagePolicy: false, imageConformanceClaim: false, referenceSnapshotSha256: sha256(snapshotBytes), toolHashes,
      renderer: renderer.identity, camera, regions, numeric: { passed: true, checks: 1090, evidence: 'candidate-numeric-report.json' },
      independentRepresentations: representations.map(({ svg, ...r }) => ({ ...r, source: r.name + '.svg', sha256: sha256(svg) })), serialization: { passed: true, checks: serialization },
      observations, artifacts, agent: { viewer: 'index.html', scene: 'candidate-evidence/actual-scene.json', focusedRerun: 'node tools/TikzVisual/trial-dash-path-units.mjs' },
      remaining: ['Reviewed primary policy and image-only defects.', 'Independent PDF image checks and policy.', 'Labels and node dash interactions.'] });
    console.log('Dash path units: 1090 public checks, ' + serialization.length + ' serialization checks, ' + observations.length + ' primary views; no image allowance or admission.');
  } finally { await renderer.browser.close(); }
}
try { await main(); } catch (error) {
  await publish({ completed: false, verdict: 'infrastructure-error', phase, toolHashes, approvedImagePolicy: false, error: error.message, artifacts });
  console.error(error.stack); process.exitCode = 2;
}
