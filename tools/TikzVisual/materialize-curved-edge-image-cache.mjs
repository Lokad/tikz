// Complete original qualifications in fresh folders, without reference tools.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root, sha256, writeArtifact} from './shape-oracle-bundle.mjs';
import {edgeImageCacheReports} from './curved-edge-image-cache.mjs';

export async function materializeEdgeImageCache(e) {
  const bases = {primary: 'curved-edge-primary-calibration', primaryCheck: 'curved-edge-primary-checks', pdf: 'curved-edge-pdf-calibration', pdfCheck: 'curved-edge-pdf-checks'};
  const inputs = {}, bindings = [];
  for (const [role, original] of Object.entries(edgeImageCacheReports)) {
    const folder = path.join(root, 'artifacts', bases[role], 'run-' + randomUUID());
    for (const [p, h] of Object.entries(e.reports[role].artifacts)) {
      const bytes = e.get(role, p); assert.equal(sha256(bytes), h); await writeArtifact(folder, p, bytes);
    }
    const bytes = Buffer.from(e.calibration.reports[role]); assert.equal(sha256(bytes), original.sha256);
    await writeArtifact(folder, 'report.json', bytes);
    inputs[role] = path.relative(root, path.join(folder, 'report.json')).split(path.sep).join('/');
    bindings.push({role, materializedReport: inputs[role], sha256: sha256(bytes), original});
  }
  return {inputs, bindings};
}
