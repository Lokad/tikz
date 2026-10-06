// Integrity and numeric controls for oracle-only forty-line diagnostics.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { root, sha256, writeArtifact } from './shape-oracle-bundle.mjs';
import { createRenderer } from './compare.mjs';
import { readDashLinesNative, reconstructDashLines, verifyDashLinesPdf, dashLinesPdfCamera } from './dash-lines-oracle.mjs';
import { parseDashPdf } from './dash-pdf-vector.mjs';
import { dashLinesPdfDiagnostics } from './dash-lines-pdf-evidence.mjs';
import { writeFixedDiagnosticPdf } from './fixed-pdf-diagnostics.mjs';

const output = path.join(root, 'artifacts/dash-lines-oracle-controls/run-' + randomUUID()), artifacts = {}, controls = [];
const save = (p, b) => writeArtifact(output, p, b, artifacts);
const reject = async (name, action) => {
  let error; try { await action(); } catch (e) { error = e; }
  assert.ok(error, 'Control was accepted: ' + name); controls.push({ name, rejected: true, error: error.message });
};
async function main() {
  assert.equal(process.argv.length, 2);
  const sources = ['dash-lines-oracle-self-test.mjs', 'dash-lines-oracle.mjs', 'dash-lines-pdf-evidence.mjs', 'fixed-pdf-diagnostics.mjs', 'dash-pdf-vector.mjs'];
  for (const p of sources) await save('tool-sources/' + p, await readFile(path.join(root, 'tools/TikzVisual', p)));
  const native = await readDashLinesNative(), renderer = await createRenderer();
  try {
    const reconstruction = await reconstructDashLines(renderer, native), parsed = parseDashPdf(await readFile(path.join(root, 'tests/Reference/Dashes/native/reference.pdf')));
    const original = verifyDashLinesPdf(parsed, native, reconstruction.lines); assert.ok(original.passed);
    assert.equal(dashLinesPdfCamera(native, reconstruction).regions.length, 41);
    const diagnostics = dashLinesPdfDiagnostics(parsed);
    assert.equal(diagnostics.length, 5); assert.equal(diagnostics.reduce((n, d) => n + d.intervalChecks.length, 0), 200);
    controls.push({ name: 'unchanged-oracle-and-exact-equivalent-instructions', passed: true, numericChecks: original.checks.length, intervalChecks: 200 });
    for (const p of [...Object.keys(native.snapshot.sourceHashes), ...Object.keys(native.snapshot.artifacts).map(p => 'tests/Reference/Dashes/native/' + p)]) {
      const target = path.join(root, p), originalBytes = await readFile(target);
      await reject('hash:' + p, () => readDashLinesNative(async file => path.resolve(file) === target ? Buffer.concat([originalBytes, Buffer.from('\n')]) : readFile(file)));
    }
    await reject('wrong-snapshot-id', () => readDashLinesNative(async file => path.resolve(file) === path.join(root, 'tests/Reference/Dashes/snapshot.json')
      ? Buffer.from(JSON.stringify({ ...native.snapshot, id: 'unreviewed' })) : readFile(file)));
    for (let i = 0; i < 40; i++) {
      const altered = structuredClone(parsed); altered.records[i].start.y += .25;
      const measured = verifyDashLinesPdf(altered, native, reconstruction.lines);
      assert.equal(measured.passed, false); assert.ok(measured.checks.some(c => !c.passed && c.id === native.metrics.pdf.records[i].id));
      controls.push({ name: 'native-region-' + i + '-coordinate', rejected: true });
    }
    for (const [name, mutate] of [
      ['width', p => { p.records[19].width += .1; }], ['phase', p => { p.records[31].phase = 1; }],
      ['odd-array', p => { p.records[28].dash.pop(); }], ['single-array', p => { p.records[29].dash = []; }],
      ['zero-on-cap', p => { p.records[30].cap = 0; }], ['physical-one-sp', p => { p.records[31].dash[2] = .1; }],
      ['page-width', p => { p.mediaBox[2] += .1; }], ['page-origin', p => { p.origin.y += .1; }]
    ]) {
      const altered = structuredClone(parsed); mutate(altered); assert.equal(verifyDashLinesPdf(altered, native, reconstruction.lines).passed, false);
      controls.push({ name: 'numeric:' + name, rejected: true });
    }
    for (const [name, box, content] of [['negative-box', [0, 0, -1, 800], parsed.content], ['nonzero-origin', [1, 0, 600, 800], parsed.content],
      ['unbounded-page', [0, 0, 10001, 800], parsed.content], ['nonfinite-page', [0, 0, Infinity, 800], parsed.content],
      ['nonascii-instruction', parsed.mediaBox, '\u00e9'], ['instruction-budget', parsed.mediaBox, ' '.repeat(1000001)]]) {
      await reject('wrapper:' + name, () => writeFixedDiagnosticPdf(box, content));
    }
    await reject('dash-text-does-not-match-decoded-state', () => dashLinesPdfDiagnostics({ ...parsed, content: parsed.content.replaceAll('[ 0.99628 1.99255 2.98883 ] 0.0 d', '[ 0.99628 1.99255 ] 0.0 d') }));
    for (const p of sources) assert.equal(sha256(await readFile(path.join(root, 'tools/TikzVisual', p))), artifacts['tool-sources/' + p], 'Control source changed during run.');
    assert.equal((await readDashLinesNative()).snapshotSha256, native.snapshotSha256);
    await save('report.json', JSON.stringify({ completed: true, passed: true, converterInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false,
      nativeSnapshotSha256: native.snapshotSha256, renderer: renderer.identity, controls, artifacts: { ...artifacts } }, null, 2) + '\n');
    console.log('Passed ' + controls.length + ' oracle controls: ' + path.relative(root, path.join(output, 'report.json')));
  } finally { await renderer.browser.close(); }
}
await main().catch(async error => { process.exitCode = 2; console.error(error.stack);
  await save('report.json', JSON.stringify({ completed: false, converterInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false,
    error: error.message, controls, artifacts: { ...artifacts } }, null, 2) + '\n'); });
