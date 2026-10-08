import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {calcHash,calcEqual} from './calc-saved-images.mjs';
import {encodeCalcNativeCache,decodeCalcNativeCache} from './calc-native-cache-codec.mjs';
import {calcNativeCacheFile,calcNativeCacheSha256,calcNativeCacheDecodedSha256} from './calc-native-cache-pin.mjs';
import {loadCalcNativeCache,validateCalcNativeCache,verifyCalcNativeCacheSources,replayCalcNativeCacheControls} from './calc-native-cache.mjs';
assert.equal(process.argv.length,2);const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.join(root,'artifacts/calc-native-cache-controls/run-'+randomUUID());
await mkdir(output,{recursive:true});const controls=[],artifacts={};let phase='codec';
async function save(file,b){await mkdir(path.dirname(path.join(output,file)),{recursive:true});await writeFile(path.join(output,file),b);artifacts[file]=calcHash(b);}
async function reject(name,action,pattern,mutation){let error;try{await action();}catch(e){error=e;}assert.ok(error,'Accepted native cache corruption: '+name);
  if(pattern)assert.match(error.message,pattern);controls.push({name,passed:true,rejection:error.message.slice(0,500)});if(mutation)await save('mutations/'+name,mutation);}
async function publish(completed,details={}){const b=Buffer.from(JSON.stringify({schemaVersion:1,role:'calc-native-cache-controls',completed,phase,
  converterInvoked:false,nativeToolInvoked:false,browserInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',artifacts,controls,...details},null,2)+'\n');
  await writeFile(path.join(output,'report.json'),b);console.log(JSON.stringify({completed,phase,controls:controls.length,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:calcHash(b)}));}
function headerChange(bytes,change){const length=bytes.readUInt32LE(8),header=JSON.parse(bytes.subarray(12,12+length));change(header);const index=Buffer.from(JSON.stringify(header)+'\n'),prefix=Buffer.from(bytes.subarray(0,12));prefix.writeUInt32LE(index.length,8);return Buffer.concat([prefix,index,bytes.subarray(12+length)]);}
await publish(false);
try{
  const small=encodeCalcNativeCache(new Map([['a',Buffer.from('same')],['b',Buffer.from('same')]])),round=decodeCalcNativeCache(small);assert.equal(round.blobs.size,1);
  assert.ok(encodeCalcNativeCache(new Map([...round.files].reverse())).equals(small));controls.push({name:'canonical-native-only-deduplicated-roundtrip',passed:true});
  await reject('unsafe-path',()=>encodeCalcNativeCache(new Map([['../escape',Buffer.from('x')]])),/Unsafe arrow cache path/);
  await reject('trailing-bytes',()=>decodeCalcNativeCache(Buffer.concat([small,Buffer.from('x')])),/Trailing arrow archive bytes/);
  for(const[name,change]of [['candidate-fed-envelope',h=>h.converterInvoked=true],['false-image-approval',h=>h.approvedImagePolicy=true],
    ['false-image-claim',h=>h.imageConformanceClaim=true],['widened-native-scope',h=>h.scope='all TikZ'],['extra-acceptance-metadata',h=>h.currentCompilerPassed=true]]){
    const changed=headerChange(small,change);await reject(name,()=>decodeCalcNativeCache(changed),name==='extra-acceptance-metadata'?/Native cache metadata fields differ/:/Native cache scope\/claim differs/,changed);}
  phase='saved-images';const loaded=await loadCalcNativeCache(root,{progress:route=>console.log(JSON.stringify({phase,route}))}),{cache,evidence,metrics}=loaded;
  assert.equal(loaded.pixelsVerified,true);assert.equal(calcHash(encodeCalcNativeCache(cache.files)),calcNativeCacheDecodedSha256);
  assert.equal(calcHash(gzipSync(cache.bytes,{level:9})),calcNativeCacheSha256);controls.push({name:'full-native-images-policies-recaptures-and-exact-reencoding',passed:true});
  const guards=await verifyCalcNativeCacheSources(evidence,root);assert.equal(guards.productionSources,0);controls.push({name:'native-tool-and-fixture-guards-without-production',passed:true});
  calcEqual(guards,await verifyCalcNativeCacheSources(evidence,root,{read:async file=>{const b=await readFile(file);return /(?:points|pdf-pin)\.json$/.test(file)?Buffer.from(b.toString().replaceAll('\r\n','\n')):b;}}));
  controls.push({name:'declared-lf-native-json-inputs',passed:true});
  const missing=new Map(cache.files);missing.delete('pdf/report.json');await reject('missing-native-pdf-proof',()=>validateCalcNativeCache({...cache,files:missing}));
  const extra=new Map(cache.files);extra.set('candidate.svg',Buffer.from('candidate'));await reject('candidate-evidence-in-native-cache',()=>validateCalcNativeCache({...cache,files:extra}),/Unexpected\/missing native cache asset/);
  const altered=new Map(cache.files),report=structuredClone(evidence.primary.report);report.records.pop();const changed=Buffer.from(JSON.stringify(report,null,2)+'\n');altered.set('primary/report.json',changed);
  await reject('fully-rehashed-missing-native-view',()=>validateCalcNativeCache({...cache,files:altered}),/Frozen native proof pin differs/,changed);
  const rehashed=gzipSync(encodeCalcNativeCache(altered),{level:9});await reject('fully-rehashed-unreviewed-container',()=>loadCalcNativeCache(root,{pixels:false,read:async()=>rehashed}),/Unreviewed native cache bytes/);
  await reject('changed-current-native-tool',()=>verifyCalcNativeCacheSources(evidence,root,{read:async file=>file.endsWith('calc-native-cache.mjs')?Buffer.from('changed'):readFile(file)}),/Current native evidence tool differs/);
  await reject('changed-current-native-source',()=>verifyCalcNativeCacheSources(evidence,root,{read:async file=>file.endsWith('calc-coordinates.tikz')?Buffer.from('changed'):readFile(file)}),/Current native input differs/);
  phase='saved-corruptions';const replayed=replayCalcNativeCacheControls(evidence,{progress:name=>console.log(JSON.stringify({phase,control:name}))});controls.push(...replayed.map(c=>({...c,name:'replayed/'+c.name})));
  assert.equal(replayed.length,22);for(const[f,h]of Object.entries(artifacts))assert.equal(calcHash(await readFile(path.join(output,f))),h);
  phase='complete';await publish(true,{cache:{file:calcNativeCacheFile,sha256:calcNativeCacheSha256,decodedSha256:calcNativeCacheDecodedSha256},sourceGuards:guards,metrics,
    reproductions:evidence.reproductions,replayedCorruptions:22,structuralOnlyLoadingIsNotPixelQualification:true});
}catch(error){process.exitCode=1;await publish(false,{error:error.message.replaceAll(root,'<repo>').slice(0,2000)});console.error(error.stack);}
