// Acceptance gap: only reviewed current/historical source pairs may bridge the frozen proofs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root} from './shape-oracle-bundle.mjs';
import {calcHash} from './calc-saved-images.mjs';
import {calcNativeCacheFile} from './calc-native-cache-pin.mjs';
import {calcCaptureCompatibility,calcCurrentCaptureHash,calcHistoricalToolRead} from './calc-capture-compatibility.mjs';
assert.equal(process.argv.length,2);
const historicalRead=calcHistoricalToolRead(root);let acceptedVersions=0;
for(const[file,pair]of Object.entries(calcCaptureCompatibility)){
 const current=await readFile(path.join(root,file)),historical=await historicalRead(path.join(root,file));
 assert.equal(calcCurrentCaptureHash(file,pair.historical,current),pair.current);assert.equal(calcHash(historical),pair.historical);
 const originalRead=calcHistoricalToolRead(root,f=>path.resolve(f)===path.resolve(root,file)?Promise.resolve(historical):readFile(f));
 assert.ok((await originalRead(path.join(root,file))).equals(historical));assert.equal(calcCurrentCaptureHash(file,pair.historical,historical),pair.historical);acceptedVersions+=2;
}
const file='tools/TikzVisual/arrow-vector-pair.mjs',current=await readFile(path.join(root,file)),pair=calcCaptureCompatibility[file];
assert.throws(()=>calcCurrentCaptureHash(file,pair.historical,Buffer.concat([current,Buffer.from('\n// unreviewed')])),/Unreviewed current calc capture dependency/);
assert.throws(()=>calcCurrentCaptureHash(file,'0'.repeat(64),current),/Unreviewed current calc capture dependency/);
const corrupted=calcHistoricalToolRead(root,async f=>{const b=await readFile(f);if(path.resolve(f)!==path.resolve(root,calcNativeCacheFile))return b;
 const changed=Buffer.from(b);changed[changed.length-1]^=1;return changed;});
await assert.rejects(corrupted(path.join(root,file)),/Unreviewed native cache bytes/);
console.log(JSON.stringify({validated:true,reviewedTools:Object.keys(calcCaptureCompatibility).length,acceptedVersions,controls:['unknown-current-version','wrong-historical-source','changed-frozen-container']}));
