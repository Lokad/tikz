// Public meet trials consume the separately frozen native qualification.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root, sha256} from './shape-oracle-bundle.mjs';
import {arrowCanonical} from './arrow-native-contract.mjs';
import {arrowMeetPdfSources} from './arrow-meet-pdf-contract.mjs';
import {arrowMeetImageCacheSha256, arrowMeetImageCacheDecodedSha256, arrowMeetQualification} from './arrow-meet-image-cache-pin.mjs';
import {arrowImageCacheSha256} from './arrow-image-cache.mjs';

export async function arrowPublicMeetSources(evidence) {
  const sources = await arrowMeetPdfSources(evidence.base);
  const queue = ['trial-arrow-meet-baselines.mjs', 'arrow-public-meet-contract.mjs'].map(p => 'tools/TikzVisual/' + p);
  for (let i = 0; i < queue.length; i++) {
    const name = queue[i]; if (sources.has(name)) continue;
    assert.match(name, /^tools\/TikzVisual\/[a-z0-9.-]+\.mjs$/);
    const bytes = arrowCanonical(await readFile(path.join(root, name))); sources.set(name, {bytes, sha256: sha256(bytes)});
    for (const m of bytes.toString().matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g))
      queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(name), m[1])));
  }
  return new Map([...sources].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

export function arrowPublicMeetBindings(e) {
  return {qualification: arrowMeetQualification, cacheSha256: arrowMeetImageCacheSha256, decodedSha256: arrowMeetImageCacheDecodedSha256,
    baseCacheSha256: arrowImageCacheSha256, sourceReports: e.header.reports,
    sourceEnvelopes: e.frames.map(f => ({caseId: f.caseId, envelope: f.sourceEnvelope})),
    primaryPolicies: e.primary.policies.map(p => ({caseId: p.id, sha256: sha256(JSON.stringify(p.policy))})),
    pdfPolicies: e.pdf.policies.map(p => ({caseId: p.caseId, route: p.route, raster: p.raster, sha256: sha256(JSON.stringify(p))}))};
}
