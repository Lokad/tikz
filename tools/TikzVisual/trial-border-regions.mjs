// Unapproved border policy trial. Every prospective limit comes from the
// oracle-only experiment; image defects bypass all native numeric gates.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer, compareBundle, profile } from './compare.mjs';

async function main() {
  assert.equal(process.argv.length, 2, 'The trusted border trial accepts no arguments.');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const output = path.join(root, 'artifacts/border-region-trial');
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const evidenceBytes = await readFile(path.join(root, 'artifacts/border-region-calibration/evidence.json'));
  const evidence = JSON.parse(evidenceBytes);
  const ids = ['node-border-lines', 'node-border-paths', 'node-border-transforms'];
  assert.equal(evidence.completed, true); assert.equal(evidence.converterInvoked, false);
  assert.equal(evidence.approvedPolicy, false); assert.deepEqual(evidence.expectedCases, ids);
  assert.deepEqual(evidence.cases.map(c => c.caseId), ids);
  for (const [file, sha256] of Object.entries(evidence.toolHashes))
    assert.equal(hash(await readFile(path.join(root, file))), sha256, 'Independent border calibration changed: ' + file);
  assert.equal(hash(await readFile(path.join(root, 'tests/Reference/NodeBorders/framing.json'))), evidence.nativeFrameSnapshotSha256);
  await mkdir(output, { recursive: true }); await rm(path.join(output, 'suite.json'), { force: true });
  const renderer = await createRenderer();
  const trials = [];
  try {
    for (const key of ['profile', 'playwright', 'browser', 'browserSha256', 'profileSha256', 'os', 'osRelease', 'architecture', 'node'])
      assert.equal(renderer.identity[key], evidence.renderer[key], 'Border trial renderer differs: ' + key);
    for (const item of evidence.cases) {
      assert.equal(hash(item.referenceSvg), item.referenceSha256);
      const baseline = path.join(root, 'artifacts/border-framed-candidates', item.caseId);
      const actual = await readFile(path.join(baseline, 'actual.svg'), 'utf8');
      const source = await readFile(path.join(baseline, 'source.tikz'));
      assert.equal(hash(source), item.sourceSha256);
      assert.equal(hash(await readFile(path.join(baseline, 'original-driver.svg'))), item.originalProvenance.artifacts['reference.svg']);
      const oldInput = JSON.parse(await readFile(path.join(baseline, 'comparison-input.json')));
      assert.equal(oldInput.numeric.passed, true); assert.ok(oldInput.numeric.checks.length > 0);
      const primary = item.variants.flatMap(v => v.primary);
      assert.ok(primary.every(c => c.maxEdgeDisplacementPixels !== null));
      const key = 'border-trial-' + item.caseId;
      profile.cases[key] = { primary: {
        maxChannelError: Math.max(...primary.map(c => c.maxChannelError)),
        maxMeanForegroundError: Math.ceil(Math.max(...primary.map(c => c.meanForegroundError)) * 1e6) / 1e6,
        maxEdgeDisplacementRasterPixels: Math.max(...primary.map(c => c.maxEdgeDisplacementPixels * c.scale)),
        maxComponentDifference: Math.max(...primary.map(c => Math.abs(c.referenceComponents - c.actualComponents)))
      } };
      const mutations = ['unchanged-1', 'unchanged-2', 'missing-border', 'quarter-pixel-shift', 'double-stroke', 'half-opacity', 'round-caps'];
      if (item.caseId === 'node-border-lines') mutations.push('joined-border-gap', 'missing-short-line');
      if (item.caseId === 'node-border-paths') mutations.push('bevel-triangle', 'open-triangle', 'height-crop', 'numeric-failure');
      for (const mutation of mutations) {
        const folder = path.join(output, item.caseId, mutation);
        assert.ok(folder.startsWith(output + path.sep), 'Border trial output escapes its artifact directory.');
        await rm(folder, { recursive: true, force: true }); await mkdir(folder, { recursive: true });
        const changed = await renderer.page.evaluate(({ svg, mutation }) => {
          const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
          if (doc.querySelector('parsererror')) throw new Error('Invalid candidate border SVG.');
          const paths = [...doc.querySelectorAll('path')].filter(p => !p.closest('defs,clipPath'));
          const selected = id => { const p = doc.getElementById('candidate-p' + id); if (!p) throw new Error('Missing mutation path.'); return p; };
          if (mutation === 'missing-border') selected(0).remove();
          if (mutation === 'quarter-pixel-shift') {
            const group = doc.createElementNS('http://www.w3.org/2000/svg', 'g'); group.setAttribute('transform', 'translate(0.25,0.125)');
            while (doc.documentElement.firstChild) group.appendChild(doc.documentElement.firstChild);
            doc.documentElement.appendChild(group);
          }
          if (mutation === 'double-stroke') for (const p of paths) p.setAttribute('stroke-width', String(Number(p.getAttribute('stroke-width')) * 2));
          if (mutation === 'half-opacity') for (const p of paths) p.setAttribute('stroke-opacity', '0.5');
          if (mutation === 'round-caps') for (const p of paths) p.setAttribute('stroke-linecap', 'round');
          if (mutation === 'joined-border-gap') {
            const p = selected(3), old = p.getAttribute('d'); let moves = 0;
            const data = old.replace(/M/g, token => ++moves === 1 ? token : 'L');
            if (data === old) throw new Error('Border-gap mutation changed nothing.'); p.setAttribute('d', data);
          }
          if (mutation === 'missing-short-line') selected(9).remove();
          if (mutation === 'bevel-triangle') selected(8).setAttribute('stroke-linejoin', 'bevel');
          if (mutation === 'open-triangle') {
            const p = selected(8), old = p.getAttribute('d'), data = old.replace(/Z\s*$/, '');
            if (old === data) throw new Error('Closing-join mutation changed nothing.'); p.setAttribute('d', data);
          }
          if (mutation === 'height-crop') {
            const root = doc.documentElement, view = root.getAttribute('viewBox').split(' ').map(Number);
            view[3] -= 1; root.setAttribute('viewBox', view.join(' ')); root.setAttribute('height', view[3] + 'px');
          }
          return mutation.startsWith('unchanged') || mutation === 'numeric-failure' ? svg : new XMLSerializer().serializeToString(doc);
        }, { svg: actual, mutation });
        assert.equal(changed === actual, mutation.startsWith('unchanged') || mutation === 'numeric-failure');
        for (const [file, bytes] of Object.entries({ 'reference.svg': item.referenceSvg, 'actual.svg': changed,
          'source.tikz': source, 'actual-scene.json': await readFile(path.join(baseline, 'actual-scene.json')) }))
          await writeFile(path.join(folder, file), bytes);
        const numeric = mutation === 'numeric-failure'
          ? { passed: false, checks: [{ name: 'controlled-native-failure', passed: false }], note: 'Correct pixels with a deliberate numeric failure.' }
          : { passed: true, checks: [], note: 'Controlled image-only trial; numeric gates bypassed; no conformance claim.' };
        await writeFile(path.join(folder, 'comparison-input.json'), JSON.stringify({
          schemaVersion: 1, caseId: item.caseId + '-' + mutation, toleranceProfile: key,
          actualUnits: 'cssPixels', referenceOriginBp: { x: 0, y: 0 }, numericTolerancePixels: 0.00004,
          referenceMode: 'independent-native-stroke-frame; original retained in source bundle', numeric,
          regionalChecks: item.regions, scope: 'Unapproved independent border policy trial; IMAGE-ONLY except explicit numeric-failure control'
        }, null, 2) + '\n');
        const report = await compareBundle(folder, renderer);
        const expected = mutation.startsWith('unchanged') ? 'pass' : 'mismatch';
        const imageRejection = !report.primary.passed;
        const targetPrefix = mutation === 'missing-border' ? 'path-0'
          : mutation === 'joined-border-gap' ? 'path-3' : mutation === 'missing-short-line' ? 'path-9'
          : ['bevel-triangle', 'open-triangle'].includes(mutation) ? 'path-8-miter-' : null;
        const targetedRegionRejected = targetPrefix === null || report.primary.regionalChecks.some(c => !c.passed
          && (targetPrefix.endsWith('-') ? c.id.startsWith(targetPrefix) : c.id === targetPrefix));
        const requirementMet = report.verdict === expected && targetedRegionRejected
          && (expected === 'pass' || ['numeric-failure', 'height-crop'].includes(mutation) || imageRejection);
        trials.push({ caseId: item.caseId, mutation, expected, verdict: report.verdict, requirementMet,
          numericBypassed: mutation !== 'numeric-failure', numeric: report.numeric.passed, dimensions: report.dimensions.passed,
          globalOnlyPrimaryPassed: report.primary.checks.every(c => c.passed), primary: report.primary.passed,
          targetPrefix, targetedRegionRejected,
          failedRegions: report.primary.regionalChecks.filter(c => !c.passed).map(c => ({ id: c.id, scale: c.scale, background: c.background })),
          actualSha256: hash(changed), originalCandidateSha256: hash(actual), sourceSha256: hash(source),
          report: item.caseId + '/' + mutation + '/report.json', artifacts: report.artifacts });
        console.log(item.caseId + '/' + mutation + ': ' + (requirementMet ? 'expected ' : 'UNEXPECTED ') + report.verdict);
      }
    }
    const tools = ['tools/TikzVisual/trial-border-regions.mjs', 'tools/TikzVisual/compare.mjs'];
    const passed = trials.every(t => t.requirementMet);
    await writeFile(path.join(output, 'suite.json'), JSON.stringify({ schemaVersion: 1, completed: true, passed,
      approvedPolicy: false, conformanceClaim: false, expectedCases: ids, calibrationSha256: hash(evidenceBytes), renderer: renderer.identity,
      scope: 'Unchanged public-conversion controls and image-only defects under oracle-only prospective global plus local limits; no policy admission',
      toolHashes: Object.fromEntries(await Promise.all(tools.map(async file => [file, hash(await readFile(path.join(root, file)))]))), trials }, null, 2) + '\n');
    console.log(JSON.stringify({ completed: true, passed, trials: trials.length, approvedPolicy: false }));
    process.exitCode = passed ? 0 : 1;
  } finally { await renderer.browser.close(); }
}
await main().catch(error => { console.error(error.stack ?? String(error)); process.exitCode = 2; });
