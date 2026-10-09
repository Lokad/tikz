// Reuse existing codec controls; verify that metadata adaptation and pinned archive ownership preserve them.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {root} from './shape-oracle-bundle.mjs';
import {calcHash} from './calc-saved-images.mjs';
import {loadPathLabelCache,pathLabelCacheDefinition} from './path-label-cache.mjs';
import {encodePathLabelCache,decodePathLabelCache,pathLabelCacheBounds} from './path-label-cache-codec.mjs';
import {encodeCalcTrialCache} from './calc-trial-cache-codec.mjs';

assert.equal(process.argv.length,2,'Usage: node tools/TikzVisual/path-label-cache-self-test.mjs');
const small=encodePathLabelCache(new Map([['a',Buffer.from('same')],['b',Buffer.from('same')],['empty',Buffer.alloc(0)]]),'placement'),decoded=decodePathLabelCache(small,'placement');
assert.equal(decoded.blobs.size,2);assert.ok(decoded.files.get('a').equals(decoded.files.get('b')));assert.ok(encodePathLabelCache(new Map([...decoded.files].reverse()),'placement').equals(small));
const controls=[
 ['unsafe-input-path',()=>encodePathLabelCache(new Map([['../escape',Buffer.from('x')]]),'placement')],
 ['wrong-native-fixture',()=>decodePathLabelCache(small,'interactions')],
 ['trailing-bytes',()=>decodePathLabelCache(Buffer.concat([small,Buffer.from('x')]),'placement')],
 ['changed-blob',()=>{const b=Buffer.from(small);b[b.length-1]^=1;decodePathLabelCache(b,'placement');}],
 ['unapproved-claim-changed',()=>{const size=small.readUInt32LE(8),h=JSON.parse(small.subarray(12,12+size));h.imageConformanceClaim=true;
  const index=Buffer.from(JSON.stringify(h)+'\n'),prefix=Buffer.from(small.subarray(0,12));prefix.writeUInt32LE(index.length,8);decodePathLabelCache(Buffer.concat([prefix,index,small.subarray(12+size)]),'placement');}]
];
// Exercise packed records after valid rehashed shared-codec blobs.
const packedFixture='math-functions-contract',record='artifacts/native/controls/node/missing/record.json';
const packedSample=encodePathLabelCache(new Map([[record,Buffer.from('{}\n')]]),packedFixture);
assert.ok(decodePathLabelCache(packedSample,packedFixture).files.get(record).equals(Buffer.from('{}\n')));
function packedCarrier(payload){
 const carrier=encodeCalcTrialCache(new Map([[record,payload]])),size=carrier.readUInt32LE(8),header=JSON.parse(carrier.subarray(12,12+size));
 const nativeSize=packedSample.readUInt32LE(8),native=JSON.parse(packedSample.subarray(12,12+nativeSize));
 const index=Buffer.from(JSON.stringify({...native,assets:header.assets,blobs:header.blobs})+'\n'),prefix=Buffer.from(packedSample.subarray(0,12));prefix.writeUInt32LE(index.length,8);
 return Buffer.concat([prefix,index,carrier.subarray(12+size)]);
}
controls.push(
 ['packed-record-source-bound',()=>encodePathLabelCache(new Map([[record,Buffer.alloc(pathLabelCacheBounds.file+1)]]),packedFixture)],
 ['packed-record-malformed-gzip',()=>decodePathLabelCache(packedCarrier(Buffer.from('not gzip')),packedFixture)],
 ['packed-record-inflation-bound',()=>decodePathLabelCache(packedCarrier(gzipSync(Buffer.alloc(pathLabelCacheBounds.file+1),{level:9})),packedFixture)]
);
for(const[name,run]of controls)assert.throws(run,undefined,'Accepted '+name);
const fixtures=[];
for(const fixture of['placement','interactions','flowchart-basic','network-bent','flowchart-transformed','flowchart-parameterized','style-contract','flowchart-foreach','foreach-contract','flowchart-math-macros','math-macro-contract','network-math-functions','math-functions-contract']){
 const loaded=await loadPathLabelCache(root,fixture);assert.equal(calcHash(encodePathLabelCache(loaded.cache.files,fixture)),loaded.manifest.decodedSha256);
 const archive=path.resolve(root,pathLabelCacheDefinition(fixture).directory+'/'+fixture+'.images.cache.gz');
 const original=await readFile(archive),corrupt=Buffer.from(original);corrupt[corrupt.length-1]^=1;
 await assert.rejects(loadPathLabelCache(root,fixture,f=>path.resolve(f)===archive?Promise.resolve(corrupt):readFile(f)),/Unreviewed path-label archive bytes/);
 const changed=new Map(loaded.cache.files),first=[...changed.keys()].find(f=>f.endsWith('.png'));assert.ok(first);changed.set(first,Buffer.from('rehashed false image'));
 const rehashed=gzipSync(encodePathLabelCache(changed,fixture),{level:9});
 await assert.rejects(loadPathLabelCache(root,fixture,f=>path.resolve(f)===archive?Promise.resolve(rehashed):readFile(f)));
 const raw=gunzipSync(original,{maxOutputLength:pathLabelCacheBounds.decoded});assert.equal(calcHash(raw),loaded.manifest.decodedSha256);
 fixtures.push({fixture,logicalFiles:loaded.cache.files.size,uniqueBlobs:loaded.cache.blobs.size});
}console.log(JSON.stringify({validated:true,controls:[...controls.map(([name])=>name),'corrupt-pinned-archive','rehashed-unreviewed-archive'],fixtures}));
