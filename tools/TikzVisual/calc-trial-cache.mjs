// Historical trial evidence stays pending; a current public build needs a new trial.
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {calcHash,calcEqual} from './calc-saved-images.mjs';
import {decodeCalcPng} from './calc-png.mjs';
import {calcTrialOwned,verifyCalcTrialPixels,verifyCalcTrialRecapture} from './calc-trial-saved.mjs';
import {readCalcTrialReference} from './calc-trial-reference.mjs';
import {readCalcTrialCandidate} from './calc-trial-candidate.mjs';
import {calcTrialCacheBounds,calcTrialCachePath,decodeCalcTrialCache} from './calc-trial-cache-codec.mjs';
import {calcTrialCacheFile,calcTrialCacheSha256,calcTrialCacheDecodedSha256,calcTrialCacheProofs} from './calc-trial-cache-pin.mjs';
export const calcTrialCacheOwnSources=['calc-trial-cache-codec.mjs','calc-trial-cache.mjs','prepare-calc-trial-cache.mjs','calc-trial-cache-self-test.mjs'].map(f=>'tools/TikzVisual/'+f);
export const calcTrialCacheControlNames=['unchanged-owned-source-recapture','frozen-policy-json-and-compact-gates','missing-artifact-manifest','incomplete-trial','missing-primary-view','duplicate-primary-view',
  'missing-pdf-view','rehashed-candidate-anchor','rehashed-native-policy','rehashed-native-camera','false-primary-pixel-count','contradictory-primary-repeat','rehashed-changed-primary-png',
  'false-pdf-ink-mass','false-pdf-ink-x','false-pdf-ink-y','missing-defect-family','false-combined-gate-summary','false-agent-source-attribution','rehashed-primary-png-metrics-verdicts'];
function bundle(bytes,files,role,file){
  assert.ok(Buffer.isBuffer(bytes)&&bytes.length<=16000000);const report=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  calcEqual([report.schemaVersion,report.role,report.completed,report.phase,report.approvedImagePolicy,report.imageConformanceClaim,report.imageAdmission],
    [1,role,true,'complete',false,false,'pending'],'Calc cache report role/claim differs');
  assert.ok(report.artifacts&&typeof report.artifacts==='object'&&!Array.isArray(report.artifacts));const entries=Object.entries(report.artifacts);
  assert.ok(entries.length>0&&entries.length<=4096);calcEqual([...files.keys()].sort(),entries.map(([f])=>f).sort(),'Calc cache report artifact coverage differs');
  for(const[name,digest]of entries){calcTrialCachePath(name);assert.match(digest,/^[a-f0-9]{64}$/);assert.equal(calcHash(files.get(name)),digest,'Calc cache report artifact differs: '+name);}
  return{file,bytes,sha256:calcHash(bytes),report,files,json:f=>JSON.parse(files.get(f)),png:f=>decodeCalcPng(files.get(f))};
}
export function calcTrialCacheBundle(cache,prefix,role){
  const files=new Map([...cache.files].filter(([f])=>f.startsWith(prefix+'/')).map(([f,b])=>[f.slice(prefix.length+1),b]));
  const bytes=files.get('report.json');files.delete('report.json');return bundle(bytes,files,role,prefix+'/report.json');
}
function mergeSources(groups){const result={};for(const hashes of groups)for(const[file,digest]of Object.entries(hashes)){
  calcTrialCachePath(file);assert.match(digest,/^[a-f0-9]{64}$/);assert.ok(!Object.hasOwn(result,file)||result[file]===digest,'Conflicting captured calc source');result[file]=digest;
}return Object.fromEntries(Object.entries(result).sort(([a],[b])=>a<b?-1:a>b?1:0));}
export function validateCalcTrialCache(cache){
  const expected=new Set(),proofs={};for(const[key,pin]of Object.entries(calcTrialCacheProofs)){
    const proof=calcTrialCacheBundle(cache,key,pin.role);assert.equal(proof.sha256,pin.sha256,'Frozen calc proof pin differs: '+key);proofs[key]=proof;
    expected.add(key+'/report.json');for(const f of proof.files.keys())expected.add(key+'/'+f);
  }
  const{trial,checker,recaptured,fresh,controls}=proofs,reference=readCalcTrialReference(calcTrialOwned(trial,'reference')),candidate=calcTrialOwned(trial,'candidate');
  calcEqual([checker.report.converterInvoked,checker.report.nativeToolInvoked,checker.report.rendererRecaptured],[true,false,true]);
  calcEqual(checker.report.input,{file:calcTrialCacheProofs.trial.origin,sha256:trial.sha256});
  assert.equal(controls.report.input,calcTrialCacheProofs.checker.origin);assert.equal(calcHash(controls.files.get('input-check-report.json')),checker.sha256);
  assert.equal(calcHash(checker.files.get('input-report.json')),trial.sha256);assert.equal(calcHash(checker.files.get('recapture-report.json')),recaptured.sha256);
  assert.equal(calcHash(checker.files.get('fresh-public-report.json')),fresh.sha256);assert.equal(calcHash(checker.files.get('fresh-public-provenance.json')),calcHash(fresh.files.get('candidate-provenance.json')));
  calcEqual(checker.report.freshPublic,{completed:true,report:calcTrialCacheProofs.fresh.origin,sha256:fresh.sha256});
  for(const f of Object.keys(candidate.report.artifacts).filter(f=>f!=='candidate-provenance.json'))assert.ok(candidate.files.get(f).equals(fresh.files.get(f)),'Cached fresh functional export differs: '+f);
  readCalcTrialCandidate(fresh,reference);calcEqual(trial.report.renderer,recaptured.report.renderer,'Cached renderer differs');
  const command=checker.report.commands.find(c=>c.log==='source-recapture-command.log');assert.ok(command&&command.exitCode===0&&command.executable==='node');
  assert.equal(command.arguments[0],'tools/TikzVisual/trial-calc.mjs');assert.equal(command.arguments.length,3);const args=command.arguments.slice(1);
  const log=checker.files.get(command.log).toString(),handle=JSON.parse(log.slice(log.lastIndexOf('{"completed":')).trim());
  calcEqual(handle,{completed:true,phase:'complete',report:calcTrialCacheProofs.recaptured.origin,sha256:recaptured.sha256});
  const reproduction=verifyCalcTrialRecapture(trial,recaptured,args);calcEqual(reproduction,checker.report.reproduction);calcEqual(reproduction,checker.json('source-binding.json'));
  calcEqual(controls.report.controls.map(c=>c.name),calcTrialCacheControlNames,'Cached corruption coverage differs');assert.ok(controls.report.controls.every(c=>c.passed===true));
  assert.equal(controls.report.controls.at(-1).independentDecodedMetricsAccepted,true);
  const sources=mergeSources([reference.nativeSourceHashes,calcTrialOwned(trial,'reference').report.sourceHashes,trial.report.sourceHashes,checker.report.sourceHashes,candidate.json('candidate-source-hashes.json')]);
  for(const file of calcTrialCacheOwnSources){const bytes=cache.files.get('sources/'+file);assert.ok(bytes,'Missing cache verifier source');sources[file]=calcHash(bytes);}
  for(const[file,digest]of Object.entries(sources)){expected.add('sources/'+file);assert.equal(calcHash(cache.files.get('sources/'+file)),digest,'Captured calc source differs: '+file);}
  calcEqual([...cache.files.keys()].sort(),[...expected].sort(),'Unexpected/missing calc cache asset');
  return{...proofs,reference,candidate,sources,args,reproduction};
}
export function verifyCalcTrialCache(cache){
  const evidence=validateCalcTrialCache(cache),metrics=verifyCalcTrialPixels(evidence.trial);calcEqual(metrics,evidence.checker.report.metrics,'Cached independent metrics differ');
  calcEqual(metrics,evidence.checker.json('decoded-metrics.json'));
  return{...evidence,metrics};
}
export function replayCalcTrialCacheControls(evidence){
  const{trial,recaptured,controls,args}=evidence,results=[];
  for(const record of controls.report.controls.slice(2)){
    assert.equal(record.overlay,true);assert.equal(record.hashesRecomputed,true);assert.equal(record.baseReport,calcTrialCacheProofs.trial.origin);
    const prefix='mutations/'+record.name+'/',bytes=controls.files.get(prefix+'report.json');assert.ok(bytes);const report=JSON.parse(bytes),files=new Map(trial.files);
    for(const[file,item]of controls.files)if(file.startsWith(prefix)&&file!==prefix+'report.json')files.set(file.slice(prefix.length),item);
    if(report.artifacts)for(const[file,digest]of Object.entries(report.artifacts))assert.equal(calcHash(files.get(file)),digest,'Invalid constructed corruption overlay');
    const altered={...trial,bytes,sha256:calcHash(bytes),report,files,json:f=>JSON.parse(files.get(f)),png:f=>decodeCalcPng(files.get(f))};
    const sourceCheck=['false-combined-gate-summary','false-agent-source-attribution','rehashed-primary-png-metrics-verdicts'].includes(record.name);
    if(record.name==='rehashed-primary-png-metrics-verdicts')verifyCalcTrialPixels(altered);
    let error;try{if(sourceCheck)verifyCalcTrialRecapture(altered,recaptured,args);else verifyCalcTrialPixels(altered);}catch(e){error=e;}
    assert.ok(error instanceof assert.AssertionError,'Cached corruption was accepted: '+record.name);assert.equal(error.message.slice(0,500),record.rejection,'Cached corruption rejected for a different reason');
    results.push({name:record.name,passed:true,rejection:record.rejection});
  }
  assert.equal(results.length,18);return results;
}
export async function verifyCalcTrialCacheSources(evidence,root,{currentProduction=false,read=readFile}={}){
  let checked=0,historicalProduction=0;for(const[file,digest]of Object.entries(evidence.sources)){
    if(file.startsWith('src/Lokad.TikZ/')&&!currentProduction){historicalProduction++;continue;}
    assert.equal(calcHash(await read(path.join(root,file))),digest,'Current calc evidence tool/source differs: '+file);checked++;
  }return{checked,historicalProduction,currentProduction};
}
export async function loadCalcTrialCache(root,{read=readFile,pixels=true}={}){
  const file=path.join(root,calcTrialCacheFile);if(read===readFile)assert.ok((await stat(file)).size<=calcTrialCacheBounds.compressed);
  const compressed=await read(file);assert.ok(Buffer.isBuffer(compressed)&&compressed.length<=calcTrialCacheBounds.compressed);
  assert.equal(calcHash(compressed),calcTrialCacheSha256,'Unreviewed calc cache bytes');
  const bytes=gunzipSync(compressed,{maxOutputLength:calcTrialCacheBounds.decoded});assert.equal(calcHash(bytes),calcTrialCacheDecodedSha256,'Unreviewed decoded calc cache');
  const cache=decodeCalcTrialCache(bytes),evidence=pixels?verifyCalcTrialCache(cache):validateCalcTrialCache(cache);
  return{cache,evidence,compressed,pixelsVerified:pixels};
}
