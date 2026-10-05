// Oracle-only viewport invariance at measured page registration. Changing a
// padded viewport must not move unchanged content or alter its raster samples.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer } from './compare.mjs';
import { measurePdfRegions } from './pdf-region-renderer.mjs';

assert.equal(process.argv.length, 2);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'artifacts/pdf-viewport-probe');
await mkdir(output, { recursive: true }); await rm(path.join(output, 'probe-evidence.json'), { force: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const snapshotBytes = await readFile(path.join(root, 'tests/Reference/NodeInteractionsRgb/pdf-calibration.json'));
const snapshot = JSON.parse(snapshotBytes), cases = [];
assert.equal(snapshot.completed, true); assert.equal(snapshot.converterInvoked, false); assert.equal(snapshot.approvedPolicy, false);
assert.deepEqual(snapshot.expectedCases, ['state-paint', 'transforms', 'colors']);
assert.deepEqual(snapshot.cases.map(c => c.caseId), snapshot.expectedCases);
const renderer = await createRenderer();
const delta = 4 / 65536 * 96 / 72.27;
try {
  for (const key of ['profile', 'playwright', 'browser', 'browserSha256', 'profileSha256', 'os', 'architecture', 'node'])
    assert.equal(renderer.identity[key], snapshot.renderer[key]);
  for (const c of snapshot.cases) {
    const svgBytes = await readFile(path.join(root, 'tests/Reference/NodeInteractionsRgb', c.caseId, 'native-css.svg'));
    assert.equal(hash(svgBytes), c.variants[0].svgSha256);
    const pdfPages = {};
    for (const scale of [1, 4]) {
      const bytes = await readFile(path.join(root, 'tests/Reference/NodeInteractionsRgb', c.caseId, 'pdf-page-' + scale + 'x.png'));
      assert.equal(hash(bytes), c.originalProvenance.artifacts['pdf-page-' + scale + 'x.png']);
      pdfPages[scale] = 'data:image/png;base64,' + bytes.toString('base64');
    }
    const regions = c.regions, controls = [];
    for (const renderMode of ['picture-image', 'page-svg', 'page-coordinates']) {
      const variants = [{ name: 'padded', side: null, amount: 0 }, ...['left', 'right', 'top', 'bottom']
        .flatMap(side => [-1, 1].map(sign => ({ name: side + (sign > 0 ? '-plus' : '-minus'), side, amount: sign * delta })))];
      let basePages;
      for (const v of variants) {
        const svg = await renderer.page.evaluate(({ svg, side, amount }) => {
          const doc = new DOMParser().parseFromString(svg, 'image/svg+xml'), root = doc.documentElement;
          const b = root.getAttribute('viewBox').split(/\s+/).map(Number);
          b[0] -= 8; b[1] -= 8; b[2] += 16; b[3] += 16;
          if (side === 'left') { b[0] -= amount; b[2] += amount; }
          if (side === 'right') b[2] += amount;
          if (side === 'top') { b[1] -= amount; b[3] += amount; }
          if (side === 'bottom') b[3] += amount;
          root.setAttribute('viewBox', b.join(' ')); root.setAttribute('width', b[2] + 'px'); root.setAttribute('height', b[3] + 'px');
          return new XMLSerializer().serializeToString(doc);
        }, { svg: svgBytes.toString('utf8'), side: v.side, amount: v.amount });
        const input = { svg, units: 'cssPixels', pdfPages: basePages ?? pdfPages,
          pdfOriginPixels: c.pdfOriginPixels, regions, renderMode, capturePage: !basePages, captureIds: ['whole-picture'] };
        const measured = await measurePdfRegions(renderer.page, input);
        if (!basePages) basePages = Object.fromEntries([1, 4].map(scale => [scale,
          'data:image/png;base64,' + measured.images['page-' + scale + 'x-svg.png']]));
        const repeated = await measurePdfRegions(renderer.page, { ...input, pdfPages: basePages, capturePage: false });
        const invariance = v.side === null ? repeated.results : measured.results;
        if (v.side !== null) assert.deepEqual(repeated.results, measured.results);
        const folder = path.join(output, c.caseId, renderMode, v.name);
        assert.ok(folder.startsWith(output + path.sep)); await rm(folder, { recursive: true, force: true }); await mkdir(folder, { recursive: true });
        await writeFile(path.join(folder, 'oracle.svg'), svg);
        for (const [file, bytes] of Object.entries(measured.images)) await writeFile(path.join(folder, file), Buffer.from(bytes, 'base64'));
        const report = { name: v.name, renderMode, boundaryChangePixels: v.amount,
          comparedWith: 'Same oracle ink on the padded baseline page; no ordinary PDF claim for these invariance measurements',
          exactMatch: invariance.every(r => r.exactMatch), checks: invariance,
          baselinePdfChecks: v.side === null ? measured.results : undefined };
        await writeFile(path.join(folder, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        const files = ['oracle.svg', 'report.json', ...Object.keys(measured.images)];
        controls.push({ name: v.name, renderMode, exactMatch: report.exactMatch,
          changedRegions: invariance.filter(r => !r.exactMatch).map(r => ({ id: r.id, scale: r.scale, maxChannelError: r.maxChannelError, changedPixels: r.changedPixels })),
          artifactHashes: Object.fromEntries(await Promise.all(files.map(async f => [f, hash(await readFile(path.join(folder, f)))]))) });
        console.log(c.caseId + '/' + renderMode + '/' + v.name + ': ' + (report.exactMatch ? 'exact' : 'viewport-dependent'));
      }
    }
    cases.push({ caseId: c.caseId, sourceSha256: hash(svgBytes), controls });
  }
  const files = ['tools/TikzVisual/pdf-viewport-probe.mjs', 'tools/TikzVisual/pdf-region-renderer.mjs', 'tools/TikzVisual/compare.mjs'];
  await writeFile(path.join(output, 'probe-evidence.json'), JSON.stringify({ schemaVersion: 1, completed: true,
    converterInvoked: false, approvedPolicy: false, conformanceClaim: false,
    expectedCases: snapshot.expectedCases, pageCoordinateControlsPassed: cases.every(c => c.controls.filter(r => r.renderMode === 'page-coordinates').every(r => r.exactMatch)),
    originalSnapshotSha256: hash(snapshotBytes), paddingPixels: 8, boundaryDeltaPixels: delta,
    scope: 'Independent padded oracle viewport invariance; fixed physical page camera; no candidate images or limits',
    renderer: renderer.identity, toolHashes: Object.fromEntries(await Promise.all(files.map(async f => [f, hash(await readFile(path.join(root, f)))]))), cases }, null, 2) + '\n');
  if (cases.some(c => c.controls.some(r => r.renderMode === 'page-coordinates' && !r.exactMatch))) process.exitCode = 1;
} finally { await renderer.browser.close(); }
