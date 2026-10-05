import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer } from './compare.mjs';
import { loadBorderPolicy, borderIds } from './border-policy.mjs';
import { compareBorderConformance } from './border-conformance.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'artifacts/border-conformance');
async function main() {
  assert.equal(process.argv.length, 2, 'Usage: node tools/TikzVisual/compare-border-conformance.mjs');
  assert.ok(output.startsWith(path.join(root, 'artifacts') + path.sep));
  await rm(output, { recursive: true, force: true }); await mkdir(output, { recursive: true });
  const evidence = await loadBorderPolicy();
  const raw = await new Promise((resolve, reject) => {
    const child = spawn('dotnet', ['run', '--project', 'tools/TikzReference', '-c', 'Release', '--',
      'compare-border-paths', '--out', 'artifacts/border-conformance/original'], { cwd: root, windowsHide: true, shell: false });
    let text = ''; const timer = setTimeout(() => { child.kill(); reject(new Error('Fresh reference/candidate runner timed out.')); }, 180000);
    const collect = bytes => { text += bytes.toString(); if (text.length > 1048576) { child.kill(); reject(new Error('Reference runner output exceeded its limit.')); } };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, text }); });
  });
  process.stdout.write(raw.text);
  if (raw.code === 3) {
    await writeFile(path.join(output, 'suite.json'), JSON.stringify({ schemaVersion: 1, completed: false, passed: false,
      expectedCases: borderIds, verdict: 'unsupported-or-candidate-error', originalSuite: 'original/suite.json' }, null, 2) + '\n');
    process.exitCode = 3; return;
  }
  assert.ok([0, 1].includes(raw.code), 'Fresh public-conversion runner failed: ' + raw.text);
  const originalSuite = JSON.parse(await readFile(path.join(output, 'original/suite.json')));
  assert.deepEqual(originalSuite.expectedCases, borderIds);
  assert.deepEqual(originalSuite.executedCases.map(c => c.caseId), borderIds);
  assert.ok(originalSuite.executedCases.every(c => [0, 1].includes(c.exitCode)));
  const renderer = await createRenderer(), cases = [];
  try {
    for (const id of borderIds) {
      const original = path.join(output, 'original', id), folder = path.join(output, id);
      assert.ok(folder.startsWith(output + path.sep)); await mkdir(folder);
      for (const file of ['source.tikz', 'actual.svg', 'actual-scene.json', 'reference-metrics.json', 'provenance.json',
        'candidate-provenance.json', 'oracle.log', 'reference.pdf', 'pdf-page-1x.png', 'pdf-page-4x.png'])
        await copyFile(path.join(original, file), path.join(folder, file));
      await copyFile(path.join(original, 'reference.svg'), path.join(folder, 'original-driver.svg'));
      const p = evidence.primary.cases.find(c => c.caseId === id);
      await writeFile(path.join(folder, 'reference.svg'), p.referenceSvg);
      await writeFile(path.join(folder, 'reference-frame.json'), JSON.stringify(p.frame, null, 2) + '\n');
      const input = JSON.parse(await readFile(path.join(original, 'comparison-input.json')));
      delete input.pdf; delete input.toleranceProfile;
      input.actualUnits = 'cssPixels'; input.referenceOriginBp = { x: 0, y: 0 };
      input.referenceMode = 'derived-native-stroke-frame; original-driver.svg retained';
      await writeFile(path.join(folder, 'comparison-input.json'), JSON.stringify(input, null, 2) + '\n');
      const report = await compareBorderConformance(folder, renderer);
      cases.push({ caseId: id, verdict: report.verdict, report: id + '/report.json', originalReport: 'original/' + id + '/report.json',
        numericChecks: report.numeric.checks.length, primaryRegions: report.primary.regionalChecks.length,
        oraclePdfRegions: report.pdf.oracle.checks.length, candidatePdfRegions: report.pdf.candidate.checks.length });
      console.log(id + ': ' + report.verdict + '; native/ink/frame, primary and both PDF gates required');
    }
    const passed = cases.every(c => c.verdict === 'pass');
    await writeFile(path.join(output, 'suite.json'), JSON.stringify({ schemaVersion: 1, completed: cases.length === borderIds.length,
      passed, command: 'compare-border-conformance', policyId: evidence.declared.id, policySha256: evidence.sha256,
      scope: evidence.declared.scope, expectedCases: borderIds, cases }, null, 2) + '\n');
    await writeFile(path.join(output, 'index.html'), '<!doctype html><meta charset="utf-8"><h1>Rectangle border conformance: '
      + (passed ? 'pass' : 'mismatch') + '</h1><p>' + evidence.declared.scope + '</p><ul>' + cases.map(c =>
        '<li>' + c.caseId + ': <a href="' + c.caseId + '/index.html">combined gates</a> · <a href="original/' + c.caseId
        + '/index.html">original driver comparison</a></li>').join('') + '</ul><a href="suite.json">suite</a>');
    process.exitCode = passed ? 0 : 1;
  } finally { await renderer.browser.close(); }
}
await main().catch(async error => {
  console.error(error.stack ?? String(error)); process.exitCode = 2;
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'suite.json'), JSON.stringify({ schemaVersion: 1, completed: false, passed: false,
    verdict: 'infrastructure-error', expectedCases: borderIds, error: String(error.message) }, null, 2) + '\n');
});
