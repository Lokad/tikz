// Explicit preservation or deterministic replay; never update tracked pins.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {loadCalcSavedReport,calcHash} from './calc-saved-images.mjs';
import {calcNativeCacheProofs} from './calc-native-cache-pin.mjs';
import {calcNativeCacheBounds,encodeCalcNativeCache,decodeCalcNativeCache} from './calc-native-cache-codec.mjs';
import {collectCalcNativeSources,validateCalcNativeCache,verifyCalcNativeCachePixels,verifyCalcNativeCacheSources,loadCalcNativeCache} from './calc-native-cache.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),args=process.argv.slice(2);assert.ok(args.length===0||args.length===1&&args[0]==='--replay');
const output=path.join(root,'artifacts/calc-native-cache-preparation/run-'+randomUUID());await mkdir(output,{recursive:true});let phase='inputs';
const relative=f=>path.relative(root,f).split(path.sep).join('/');
async function publish(completed,details={}){const b=Buffer.from(JSON.stringify({schemaVersion:1,role:'calc-native-cache-preparation',completed,phase,
  converterInvoked:false,nativeToolInvoked:false,browserInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',...details},null,2)+'\n');
  await writeFile(path.join(output,'report.json'),b);console.log(JSON.stringify({completed,phase,report:relative(path.join(output,'report.json')),sha256:calcHash(b)}));}
await publish(false);
try{
  let files;if(args.length)files=(await loadCalcNativeCache(root,{pixels:false})).cache.files;
  else{
    files=new Map();const proofs={};for(const[k,pin]of Object.entries(calcNativeCacheProofs)){
      const b=await loadCalcSavedReport(path.join(root,pin.origin),pin.role);assert.equal(b.sha256,pin.sha256,'Changed original native proof: '+k);proofs[k]=b;
      files.set(k+'/report.json',b.bytes);for(const[f,bytes]of b.files)files.set(k+'/'+f,bytes);
    }
    const captured=new Map(),sources=await collectCalcNativeSources(proofs,async file=>{const b=await readFile(path.join(root,file));captured.set(file,b);return b;});
    for(const[f,h]of Object.entries(sources)){const b=captured.get(f)??await readFile(path.join(root,f));assert.equal(calcHash(b),h);files.set('sources/'+f,b);}
  }
  phase='archive';const bytes=encodeCalcNativeCache(files),cache=decodeCalcNativeCache(bytes),evidence=await validateCalcNativeCache(cache);
  for(const[f,b]of files)assert.ok(cache.files.get(f).equals(b),'Lossy native archive: '+f);
  phase='source-guards';const sourceGuards=await verifyCalcNativeCacheSources(evidence,root);
  phase='saved-images';const metrics=verifyCalcNativeCachePixels(evidence,{progress:route=>console.log(JSON.stringify({phase,route,logicalArtifacts:files.size}))});
  await verifyCalcNativeCacheSources(evidence,root);phase='compress';const compressed=gzipSync(bytes,{level:9});assert.ok(compressed.length<=calcNativeCacheBounds.compressed);
  await writeFile(path.join(output,'native-calibration.bin.gz'),compressed);phase='complete';await publish(true,{compressedSha256:calcHash(compressed),decodedSha256:calcHash(bytes),
    compressedBytes:compressed.length,decodedBytes:bytes.length,logicalBytes:cache.logicalBytes,logicalArtifacts:files.size,distinctBlobs:cache.blobs.size,
    pngs:[...files.keys()].filter(f=>f.endsWith('.png')).length,sourceGuards,metrics,reproductions:evidence.reproductions,cache:relative(path.join(output,'native-calibration.bin.gz')),
    remaining:['combined profile admission','fresh current-candidate conformance consumer','broader interactions','root integration','hosted/release qualification']});
}catch(error){process.exitCode=1;await publish(false,{error:error.message.replaceAll(root,'<repo>').slice(0,2000)});console.error(error.stack);}
