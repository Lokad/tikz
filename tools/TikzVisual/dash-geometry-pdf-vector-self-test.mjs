import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { root, sha256, writeArtifact } from './shape-oracle-bundle.mjs';
import { createRenderer } from './compare.mjs';
import { readDashGeometryNative } from './dash-geometry-primary-common.mjs';
import { reconstructDashGeometryPrimary } from './dash-geometry-primary-reconstruction.mjs';
import { parseDashGeometryPdf, parseDashGeometryPdfContent, verifyDashGeometryPdf,
  normalizeDashGeometryPdfSegments, reconstructDashGeometryPdf } from './dash-geometry-pdf-vector.mjs';

assert.equal(process.argv.length, 2);
const base = path.join(root, 'artifacts/dash-geometry-pdf-vector-controls'), output = path.join(base, 'run-' + randomUUID()), artifacts = {}, controls = [];
const save = (p, b) => writeArtifact(output, p, b, artifacts);
const native = await readDashGeometryNative(), pdfBytes = await readFile(path.join(root, 'tests/Reference/DashGeometry/native/reference.pdf'));
const parsed = parseDashGeometryPdf(pdfBytes), renderer = await createRenderer();
try {
  const reconstruction = await reconstructDashGeometryPrimary(renderer, native);
  const numeric = verifyDashGeometryPdf(parsed, native, reconstruction.styles); assert.equal(numeric.passed, true);
  controls.push({ name: 'original-pdf-native-conversion', passed: true, executedChecks: numeric.checks.length });
  await save('pdf-content.txt', parsed.content); await save('pdf-native-checks.json', JSON.stringify(numeric, null, 2) + '\n');
  const mutate = (from, to) => { assert.ok(parsed.content.includes(from), 'Missing control input.'); return parsed.content.replace(from, to); };
  const originLine = parsed.content.split('\n').find(s => s.endsWith(' cm'));
  for (const [name, content] of [
    ['unsupported-operator', parsed.content + '\nBT\n'],
    ['restore-without-save', 'Q\n' + parsed.content],
    ['unclosed-save', parsed.content + '\nq\n'],
    ['multiple-origins', mutate(originLine, originLine + '\n' + originLine)],
    ['missing-origin', mutate(originLine, '')],
    ['negative-width', mutate('0.3985 w', '-0.3985 w')],
    ['zero-width', mutate('0.3985 w', '0 w')],
    ['all-zero-dash', mutate('[ 2.98883 2.98883 ] 0.0 d', '[ 0 0 ] 0 d')],
    ['negative-dash', mutate('[ 2.98883 2.98883 ] 0.0 d', '[ 1 -1 ] 0 d')],
    ['malformed-cubic', mutate('59.77661 19.92554 59.77661 0.0 c', '59.77661 19.92554 59.77661 c')],
    ['line-without-move', mutate('0.0 0.0 m', '0.0 0.0 l')],
    ['state-inside-path', mutate('0.0 0.0 m', '0.0 0.0 m\n1 w')],
    ['missing-clip-completion', mutate('W \nn ', 'W \n')],
    ['unknown-graphics-resource', mutate('/pgf@ca.1 gs', '/unknown gs')],
    ['invalid-cap', mutate('1 J', '3 J')],
    ['invalid-join', mutate('1 j', '3 j')],
    ['unsupported-color', mutate('0 g 0 G', '1 0 0 rg')],
    ['coordinate-budget', mutate('0.0 0.0 m', '10001 0 m')],
    ['graphics-stack-budget', mutate(originLine, originLine + '\n' + 'q\n'.repeat(65))]
  ]) {
    assert.notEqual(content, parsed.content); assert.throws(() => parseDashGeometryPdfContent(content, parsed.resources));
    controls.push({ name, passed: true, category: 'malformed PDF rejection' });
  }
  const nodes = [{ kind: 'Move', end: { x: 0, y: 0 } }, { kind: 'Move', end: { x: 2, y: 2 } },
    { kind: 'Line', end: { x: 2, y: 2 } }, { kind: 'Move', end: { x: 9, y: 9 } }];
  assert.deepEqual(normalizeDashGeometryPdfSegments(nodes), nodes.slice(1, 3));
  controls.push({ name: 'normalize-only-unpainted-moves-retain-zero-length-line', passed: true });
  for (const [name, change] of [
    ['wrong-cubic-control', p => { p.paints[0].segments[1].a.y += .001; }],
    ['wrong-width', p => { p.paints[14].state.width *= 1.5; }],
    ['wrong-phase', p => { p.paints[3].state.phase += 1; }],
    ['late-captured-pattern', p => { p.paints[2].state.dash[2] = p.paints[2].state.width; }],
    ['wrong-opacity', p => { p.paints[6].state.fillOpacity = .2; }],
    ['wrong-cap', p => { p.paints[8].state.cap = 1; }],
    ['wrong-join', p => { p.paints[5].state.join = 0; }],
    ['missing-closure', p => { p.paints[5].segments.pop(); }],
    ['missing-inner-clip', p => { p.paints[13].state.clips.pop(); }],
    ['wrong-clip-binding', p => { p.paints[12].state.clips = [2]; }],
    ['wrong-clip-rule', p => { p.clips[0].rule = 'evenodd'; }],
    ['shifted-page-origin', p => { p.origin.x += .01; }],
    ['wrong-page-size', p => { p.mediaBox[2] += .01; }]
  ]) {
    const wrong = structuredClone(parsed); change(wrong); let rejected = false;
    try { rejected = !verifyDashGeometryPdf(wrong, native, reconstruction.styles).passed; } catch { rejected = true; }
    assert.equal(rejected, true, name); controls.push({ name, passed: true, category: 'independent native mismatch' });
  }
  const svg = reconstructDashGeometryPdf(parsed, reconstruction.roots[0].picture, native.metrics.pdfOriginCss);
  assert.equal((svg.svg.match(/id="pdf-p\d+"/g) ?? []).length, 16); assert.equal((svg.svg.match(/<clipPath/g) ?? []).length, 3);
  controls.push({ name: 'preserve-all-paints-and-clips-in-reconstruction', passed: true });
  await save('pdf-instructions.svg', svg.svg);
  for (const p of ['dash-geometry-pdf-vector-self-test.mjs', 'dash-geometry-pdf-vector.mjs']) {
    const bytes = await readFile(path.join(root, 'tools/TikzVisual', p)); await save('tool-sources/' + p, bytes);
  }
  const report = { completed: true, passed: true, converterInvoked: false, approvedImagePolicy: false, nativeSnapshotSha256: native.snapshotSha256, controls, artifacts };
  await writeArtifact(output, 'report.json', JSON.stringify(report, null, 2) + '\n');
  await writeArtifact(base, 'latest.json', JSON.stringify({ completed: true, report: path.relative(base, path.join(output, 'report.json')).split(path.sep).join('/'),
    sha256: sha256(await readFile(path.join(output, 'report.json'))) }, null, 2) + '\n');
  console.log('Dash geometry PDF vector controls: ' + controls.length + ' pass; ' + numeric.checks.length + ' native checks; image policy pending.');
} finally { await renderer.browser.close(); }
