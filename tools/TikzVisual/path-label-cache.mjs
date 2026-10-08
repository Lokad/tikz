// Read the pinned native archive using existing blob, path, size and canonical-index checks.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {calcHash,calcEqual} from './calc-saved-images.mjs';
import {decodePathLabelCache,pathLabelCacheBounds} from './path-label-cache-codec.mjs';

export async function loadPathLabelCache(repositoryRoot,fixture,read=readFile){
 assert.ok(['placement','interactions'].includes(fixture));
 const profile=JSON.parse(await read(path.join(repositoryRoot,'tests/Reference/PathLabels/image-profile.json')));
 assert.equal(profile.schemaVersion,1);assert.equal(profile.role,'path-label-frozen-image-profile');
 calcEqual(Object.keys(profile.fixtures).sort(),['interactions','placement']);
 const entry=profile.fixtures[fixture],manifest=entry.manifest;
 assert.equal(entry.file,'tests/Reference/PathLabels/'+fixture+'.images.cache.gz');assert.equal(manifest.fixture,fixture);
 assert.equal(manifest.converterInvoked,false);assert.equal(manifest.imageConformanceClaim,false);
 for(const[file,digest]of Object.entries(profile.transportSources))assert.equal(calcHash(await read(path.join(repositoryRoot,file))),digest,'Changed archive transport dependency.');
 const compressed=await read(path.join(repositoryRoot,entry.file));assert.ok(compressed.length<=pathLabelCacheBounds.compressed);assert.equal(compressed.length,manifest.compressedBytes);
 assert.equal(calcHash(compressed),manifest.compressedSha256,'Unreviewed path-label archive bytes.');
 const bytes=gunzipSync(compressed,{maxOutputLength:pathLabelCacheBounds.decoded});assert.equal(bytes.length,manifest.decodedBytes);assert.equal(calcHash(bytes),manifest.decodedSha256);
 const cache=decodePathLabelCache(bytes,fixture);assert.equal(cache.files.size,manifest.logicalFiles);assert.equal(cache.blobs.size,manifest.uniqueBlobs);assert.equal(cache.logicalBytes,manifest.logicalBytes);
 const roles=['path-label-native-primary-calibration','path-label-independent-primary-check','path-label-native-pdf-calibration',
  'path-label-independent-pdf-check','path-label-complete-text-sensitivity','path-label-independent-text-check'];
 calcEqual(manifest.reports.map(r=>r.role),roles);const expected=new Set();
 for(const descriptor of manifest.reports){
  assert.match(descriptor.file,/^artifacts\/path-label-[a-z-]+\/run-[a-f0-9-]+\/report\.json$/);const reportBytes=cache.files.get(descriptor.file);
  assert.ok(reportBytes);assert.equal(calcHash(reportBytes),descriptor.sha256);const report=JSON.parse(reportBytes);
  assert.equal(report.schemaVersion,1);assert.equal(report.role,descriptor.role);assert.equal(report.completed,true);assert.equal(report.phase,'complete');
  assert.equal(report.converterInvoked,false);assert.equal(report.nativeToolInvoked,false);assert.equal(report.approvedImagePolicy,false);assert.equal(report.imageConformanceClaim,false);assert.equal(report.imageAdmission,'pending');
  const entries=Object.entries(report.artifacts);assert.ok(entries.length>0&&entries.length<=4096);expected.add(descriptor.file);let total=0;
  for(const[file,digest]of entries){const target=path.posix.dirname(descriptor.file)+'/'+file,item=cache.files.get(target);assert.ok(item,'Missing owned native archive artifact.');
   assert.equal(calcHash(item),digest);total+=item.length;assert.ok(item.length<=100000000&&total<=1000000000);expected.add(target);}
 }
 calcEqual([...expected].sort(),[...cache.files.keys()].sort(),'Archive contains missing or unowned assets.');return{cache,manifest};
}
