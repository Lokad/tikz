// Own one cached command and bind its stdout to the exact saved report.
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {captureProcess} from './qualification-process.mjs';
import path from 'node:path';
import {root, sha256, outputPath} from './shape-oracle-bundle.mjs';

export async function readEdgeAdmissionChild(reportPath, expectedSha256) {
  assert.match(reportPath, /^artifacts\/curved-edge-(?:cached-trial|public-trial|public-checks)\/run-[a-f0-9-]+\/report\.json$/);
  assert.match(expectedSha256, /^[a-f0-9]{64}$/);
  const folder = path.dirname(path.join(root, reportPath)), file = await outputPath(folder, 'report.json');
  assert.ok((await stat(file)).size <= 150000000);
  const bytes = await readFile(file); assert.equal(sha256(bytes), expectedSha256);
  return {reportPath, sha256: expectedSha256, folder, bytes, report: JSON.parse(bytes)};
}
export async function runOwnedEdgeCached(save) {
  const result = await captureProcess(process.execPath, ['tools/TikzVisual/trial-curved-edge-cached.mjs'], {cwd: root, timeout: 3600000});
  const status = result.exitCode;
  await save('cached-command.log', result.output.replaceAll(root, '<repo>'));
  if (result.failure !== null) throw Error('Owned cached edge command failed: ' + result.failure);
  const markers = result.stdout.split(/\r?\n/).filter(s => s.startsWith('{')).map(s => JSON.parse(s)).filter(m => m.kind === 'curved-edge-cached-trial');
  assert.equal(markers.filter(m => m.final === true).length, 1); assert.equal(markers.length, 2);
  assert.equal(new Set(markers.map(m => m.report)).size, 1); const marker = markers.at(-1);
  assert.equal(marker.final, true);
  const cached = await readEdgeAdmissionChild(marker.report, marker.sha256);
  assert.equal(marker.completed, cached.report.completed); assert.equal(marker.passed, cached.report.passed);
  assert.equal(status === 0, cached.report.completed === true && cached.report.passed === true);
  assert.ok([0, 2].includes(status)); return {...cached, status};
}
export async function copyEdgeAdmissionChild(child, prefix, save) {
  await save(prefix + '/report.json', child.bytes);
  for (const [p, h] of Object.entries(child.report.artifacts)) {
    const b = await readFile(await outputPath(child.folder, p)); assert.equal(sha256(b), h, p); await save(prefix + '/' + p, b);
  }
}
