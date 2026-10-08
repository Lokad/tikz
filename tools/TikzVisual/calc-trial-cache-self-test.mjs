import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {calcHash,calcEqual} from './calc-saved-images.mjs';
import {encodeCalcTrialCache,decodeCalcTrialCache,calcTrialCacheBounds} from './calc-trial-cache-codec.mjs';
import {calcTrialCacheFile,calcTrialCacheSha256,calcTrialCacheDecodedSha256} from './calc-trial-cache-pin.mjs';
import {loadCalcTrialCache,validateCalcTrialCache,replayCalcTrialCacheControls,verifyCalcTrialCacheSources} from './calc-trial-cache.mjs';
assert.equal(process.argv.length,2,'Usage: node tools/TikzVisual/calc-trial-cache-self-test.mjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.join(root,'artifacts/calc-trial-cache-controls/run-'+randomUUID());
await mkdir(output,{recursive:true});const controls=[],artifacts={};let phase='codec';
async function save(file,bytes){await mkdir(path.dirname(path.join(output,file)),{recursive:true});await writeFile(path.join(output,file),bytes);artifacts[file]=calcHash(bytes);}
async function reject(name,action,pattern,mutation){let error;try{await action();}catch(e){error=e;}assert.ok(error,'Accepted calc cache corruption: '+name);
  if(pattern)assert.match(error.message,pattern,'Wrong cache rejection');controls.push({name,passed:true,rejection:error.message.slice(0,500)});
  if(mutation)await save('mutations/'+name,mutation);}
async function publish(completed,details={}){const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'calc-trial-cache-controls',completed,phase,converterInvoked:false,
  nativeToolInvoked:false,browserInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',artifacts,controls,...details},null,2)+'\n');
  await writeFile(path.join(output,'report.json'),bytes);console.log(JSON.stringify({completed,phase,controls:controls.length,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:calcHash(bytes)}));}
function headerMutation(bytes,change){const length=bytes.readUInt32LE(8),header=JSON.parse(bytes.subarray(12,12+length));change(header);const index=Buffer.from(JSON.stringify(header)+'\n'),prefix=Buffer.from(bytes.subarray(0,12));prefix.writeUInt32LE(index.length,8);return Buffer.concat([prefix,index,bytes.subarray(12+length)]);}
await publish(false);
try{
  const small=encodeCalcTrialCache(new Map([['a.txt',Buffer.from('same')],['b.txt',Buffer.from('same')],['empty',Buffer.alloc(0)]])),decoded=decodeCalcTrialCache(small);
  assert.equal(decoded.blobs.size,2);assert.ok(decoded.files.get('a.txt').equals(decoded.files.get('b.txt')));assert.ok(encodeCalcTrialCache(new Map([...decoded.files].reverse())).equals(small));
  controls.push({name:'lossless-empty-deduplicated-canonical-roundtrip',passed:true});
  await reject('unsafe-input-path',()=>encodeCalcTrialCache(new Map([['../escape',Buffer.from('x')]])),/Unsafe calc cache path/);
  await reject('truncated-body',()=>decodeCalcTrialCache(small.subarray(0,-1)),/assert|false|true/);
  await reject('trailing-body',()=>decodeCalcTrialCache(Buffer.concat([small,Buffer.from('x')])),/Trailing calc cache bytes/);
  const badMagic=Buffer.from(small);badMagic[0]^=1;await reject('bad-magic',()=>decodeCalcTrialCache(badMagic),/Unknown calc cache format/,badMagic);
  const oversized=Buffer.from(small);oversized.writeUInt32LE(calcTrialCacheBounds.index+1,8);await reject('oversized-index',()=>decodeCalcTrialCache(oversized),/index bound/);
  const changedByte=Buffer.from(small);changedByte[changedByte.length-1]^=1;await reject('changed-body',()=>decodeCalcTrialCache(changedByte),/Changed calc cache artifact/,changedByte);
  for(const[name,change]of [
    ['widened-scope',h=>h.scope='all TikZ'],['false-image-claim',h=>h.imageConformanceClaim=true],['false-policy-approval',h=>h.approvedImagePolicy=true],
    ['unsafe-decoded-path',h=>{h.assets['../escape']=h.assets['a.txt'];delete h.assets['a.txt'];h.assets=Object.fromEntries(Object.entries(h.assets).sort(([a],[b])=>a<b?-1:a>b?1:0));}],
    ['missing-blob',h=>h.blobs.pop()],['repeated-blob',h=>h.blobs.push(h.blobs[0])],['oversized-blob',h=>h.blobs[0].bytes=calcTrialCacheBounds.file+1],
    ['unbound-extra-metadata',h=>h.currentCompilerPassed=true]]){
    const altered=headerMutation(small,change);await reject(name,()=>decodeCalcTrialCache(altered),name==='unsafe-decoded-path'?/Unsafe calc cache path/:undefined,altered);
  }
  phase='saved-evidence';console.log(JSON.stringify({phase,controls:controls.length}));const loaded=await loadCalcTrialCache(root),{cache,evidence,compressed}=loaded;
  assert.equal(loaded.pixelsVerified,true);assert.equal(calcHash(encodeCalcTrialCache(cache.files)),calcTrialCacheDecodedSha256);
  assert.equal(calcHash(gzipSync(cache.bytes,{level:9})),calcTrialCacheSha256);controls.push({name:'complete-pinned-evidence-and-byte-identical-reencoding',passed:true});
  const guards=await verifyCalcTrialCacheSources(evidence,root);assert.ok(guards.checked>0&&guards.historicalProduction>0);
  let productionReads=0;await verifyCalcTrialCacheSources(evidence,root,{read:async file=>{if(path.relative(root,file).split(path.sep).join('/').startsWith('src/Lokad.TikZ/'))productionReads++;return readFile(file);}});
  assert.equal(productionReads,0);controls.push({name:'historical-production-does-not-claim-current-production',passed:true});
  const files=new Map(cache.files);files.delete('trial/report.json');await reject('missing-trial-report',()=>validateCalcTrialCache({...cache,files}));
  const more=new Map(cache.files);more.set('unexpected.txt',Buffer.from('extra'));await reject('extra-evidence-artifact',()=>validateCalcTrialCache({...cache,files:more}),/Unexpected\/missing calc cache asset/);
  const altered=new Map(cache.files),header=structuredClone(evidence.trial.report);header.gates.primary.views--;
  const changed=Buffer.from(JSON.stringify(header,null,2)+'\n');altered.set('trial/report.json',changed);
  await reject('fully-rehashed-changed-trial',()=>validateCalcTrialCache({...cache,files:altered}),/Frozen calc proof pin differs/,changed);
  const rehashed=gzipSync(encodeCalcTrialCache(altered),{level:9});await reject('fully-rehashed-unreviewed-container',()=>loadCalcTrialCache(root,{pixels:false,read:async()=>rehashed}),/Unreviewed calc cache bytes/);
  const damaged=Buffer.from(compressed);damaged[damaged.length-1]^=1;await reject('changed-compressed-container',()=>loadCalcTrialCache(root,{pixels:false,read:async()=>damaged}),/Unreviewed calc cache bytes/);
  await reject('changed-current-evidence-tool',()=>verifyCalcTrialCacheSources(evidence,root,{read:async file=>file.endsWith('calc-trial-cache.mjs')?Buffer.from('changed'):readFile(file)}),/Current calc evidence tool\/source differs/);
  phase='actual-saved-corruptions';console.log(JSON.stringify({phase,controls:controls.length}));const replayed=replayCalcTrialCacheControls(evidence);
  controls.push(...replayed.map(c=>({...c,name:'replayed/'+c.name})));assert.equal(replayed.length,18);
  for(const[f,h]of Object.entries(artifacts))assert.equal(calcHash(await readFile(path.join(output,f))),h);phase='complete';
  await publish(true,{cache:{file:calcTrialCacheFile,sha256:calcTrialCacheSha256,decodedSha256:calcTrialCacheDecodedSha256},metrics:evidence.metrics,
    sourceGuards:guards,replayedCorruptions:replayed.length,structuralOnlyLoadingIsNotPixelQualification:true});
}catch(error){process.exitCode=1;await publish(false,{error:error.message.replaceAll(root,'<repo>').slice(0,2000)});console.error(error.stack);}
