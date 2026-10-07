// Recreate complete immutable producer inputs in fresh ignored folders.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root, sha256, writeArtifact} from './shape-oracle-bundle.mjs';
import {arrowImageCacheReports, loadArrowImageCache} from './arrow-image-cache.mjs';

export async function materializeArrowImageCache(e) {
  const bases = {primary: 'arrow-source-primary-calibration', primaryCheck: 'arrow-source-primary-checks',
    pdf: 'arrow-source-pdf-calibration', pdfCheck: 'arrow-source-pdf-checks'};
  const inputs = {}, bindings = [];
  for (const [role, original] of Object.entries(arrowImageCacheReports)) {
    const folder = path.join(root, 'artifacts', bases[role], 'run-' + randomUUID());
    if (!role.endsWith('Check')) {
      const manifest = role === 'primary' ? e.primaryManifest : e.manifest;
      for (const [p, h] of Object.entries(manifest.artifacts)) {
        const bytes = e.getRole(role, p); assert.equal(sha256(bytes), h); await writeArtifact(folder, p, bytes);
      }
      await writeArtifact(folder, 'manifest.json', e.getRole(role, 'manifest.json'));
    }
    const bytes = e.getRole(role, 'report.json'); assert.equal(sha256(bytes), original.sha256);
    await writeArtifact(folder, 'report.json', bytes);
    inputs[role] = path.relative(root, path.join(folder, 'report.json')).split(path.sep).join('/');
    bindings.push({role, materializedReport: inputs[role], sha256: original.sha256, original});
  }
  return {inputs, bindings};
}

if (path.basename(process.argv[1] ?? '') === 'materialize-arrow-image-cache.mjs') {
  assert.equal(process.argv.length, 2); const e = await loadArrowImageCache(), result = await materializeArrowImageCache(e);
  console.log(JSON.stringify({completed: true, converterInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false, ...result}));
}
