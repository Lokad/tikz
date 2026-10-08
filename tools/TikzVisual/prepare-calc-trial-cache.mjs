// Preparation preserves original research bytes and never changes a tracked pin.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {loadCalcSavedReport,calcHash} from './calc-saved-images.mjs';
import {calcTrialOwned} from './calc-trial-saved.mjs';
import {readCalcTrialReference} from './calc-trial-reference.mjs';
import {calcTrialCacheBounds,encodeCalcTrialCache,decodeCalcTrialCache} from './calc-trial-cache-codec.mjs';
import {calcTrialCacheProofs} from './calc-trial-cache-pin.mjs';
import {calcTrialCacheOwnSources,verifyCalcTrialCache,verifyCalcTrialCacheSources,loadCalcTrialCache} from './calc-trial-cache.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),args=process.argv.slice(2);
assert.ok(args.length===0||args.length===1&&args[0]==='--replay','Usage: node tools/TikzVisual/prepare-calc-trial-cache.mjs [--replay]');
const output=path.join(root,'artifacts/calc-trial-cache-preparation/run-'+randomUUID());await mkdir(output,{recursive:true});let phase='inputs';
const relative=f=>path.relative(root,f).split(path.sep).join('/');
async function publish(completed,details={}){const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'calc-trial-cache-preparation',completed,phase,converterInvoked:false,
  nativeToolInvoked:false,browserInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',...details},null,2)+'\n');
  await writeFile(path.join(output,'report.json'),bytes);console.log(JSON.stringify({completed,phase,report:relative(path.join(output,'report.json')),sha256:calcHash(bytes)}));}
await publish(false);
try{
  let files;if(args.length)files=(await loadCalcTrialCache(root,{pixels:false})).cache.files;
  else{
    files=new Map();const proofs={};for(const[key,pin]of Object.entries(calcTrialCacheProofs)){
      const proof=await loadCalcSavedReport(path.join(root,pin.origin),pin.role);assert.equal(proof.sha256,pin.sha256,'Changed preparation proof: '+key);proofs[key]=proof;
      files.set(key+'/report.json',proof.bytes);for(const[f,b]of proof.files)files.set(key+'/'+f,b);
    }
    const trial=proofs.trial,referenceBundle=calcTrialOwned(trial,'reference'),reference=readCalcTrialReference(referenceBundle),candidate=calcTrialOwned(trial,'candidate');
    const sources={};for(const hashes of [reference.nativeSourceHashes,referenceBundle.report.sourceHashes,trial.report.sourceHashes,proofs.checker.report.sourceHashes,candidate.json('candidate-source-hashes.json')])
      for(const[f,h]of Object.entries(hashes)){assert.ok(!Object.hasOwn(sources,f)||sources[f]===h,'Conflicting preparation source');sources[f]=h;}
    for(const file of [...new Set([...Object.keys(sources),...calcTrialCacheOwnSources])].sort()){
      const b=await readFile(path.join(root,file));if(Object.hasOwn(sources,file))assert.equal(calcHash(b),sources[file],'Changed preparation source: '+file);files.set('sources/'+file,b);
    }
  }
  phase='independent-saved-metrics';console.log(JSON.stringify({phase,logicalArtifacts:files.size}));
  const bytes=encodeCalcTrialCache(files),cache=decodeCalcTrialCache(bytes),evidence=verifyCalcTrialCache(cache);
  const currentSources=await verifyCalcTrialCacheSources(evidence,root,{currentProduction:true});
  for(const[file,b]of files)assert.ok(cache.files.get(file).equals(b),'Lossy calc archive: '+file);
  phase='compress';const compressed=gzipSync(bytes,{level:9});assert.ok(compressed.length<=calcTrialCacheBounds.compressed);await writeFile(path.join(output,'public-trial.bin.gz'),compressed);
  phase='complete';await publish(true,{compressedSha256:calcHash(compressed),decodedSha256:calcHash(bytes),compressedBytes:compressed.length,decodedBytes:bytes.length,
    logicalArtifacts:files.size,logicalBytes:cache.logicalBytes,distinctBlobs:cache.blobs.size,pngs:[...files.keys()].filter(f=>f.endsWith('.png')).length,
    metrics:evidence.metrics,reproduction:evidence.reproduction,currentSources,proofs:calcTrialCacheProofs,cache:relative(path.join(output,'public-trial.bin.gz')),
    remaining:['reviewed combined image profile','fresh current-candidate conformance consumer','broader interactions','root integration']});
}catch(error){process.exitCode=1;await publish(false,{error:error.message.replaceAll(root,'<repo>').slice(0,2000)});console.error(error.stack);}
