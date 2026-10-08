// Full native images, independent recaptures and actual corruption overlays.
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {calcHash,calcEqual} from './calc-saved-images.mjs';
import {decodeCalcPng} from './calc-png.mjs';
import {calcTrialCachePath} from './calc-trial-cache-codec.mjs';
import {readCalcLayoutEvidence} from './calc-layout-evidence.mjs';
import {verifyCalcCalibrationPixels,verifyCalcCalibrationRecapture} from './calc-primary-saved.mjs';
import {verifyCalcPdfCalibrationPixels,verifyCalcPdfCalibrationRecapture} from './calc-pdf-saved.mjs';
import {decodeCalcNativeCache,calcNativeCacheBounds} from './calc-native-cache-codec.mjs';
import {calcNativeCacheFile,calcNativeCacheSha256,calcNativeCacheDecodedSha256,calcNativeCacheProofs} from './calc-native-cache-pin.mjs';
const own=['calc-native-cache-codec.mjs','calc-native-cache.mjs','prepare-calc-native-cache.mjs','calc-native-cache-self-test.mjs'].map(f=>'tools/TikzVisual/'+f);
const pinFile='tools/TikzVisual/calc-native-cache-pin.mjs';
export const calcNativeControlNames={
  primary:['unchanged-source-recapture','policy-json-and-compact-gates','missing-native-view','duplicate-native-view','candidate-fed-calibration','changed-native-region','false-native-pixel-metric',
    'rehashed-changed-native-png','rehashed-weakened-policy','rehashed-changed-camera','rehashed-native-png-metrics-policy'],
  pdf:['unchanged-source-recapture','equal-mass-axis-shifts-below-edge-threshold','policy-json-and-compact-gates','missing-native-view','duplicate-native-view','candidate-fed-calibration','changed-native-region',
    'false-native-pixel-metric','false-native-ink-mass','false-native-ink-x','false-native-ink-y','rehashed-changed-native-png','rehashed-weakened-ink-policy','rehashed-changed-camera','false-defect-summary','rehashed-native-png-metrics-policy']};
export function calcNativeCacheBundle(cache,prefix,role){
  const files=new Map([...cache.files].filter(([f])=>f.startsWith(prefix+'/')).map(([f,b])=>[f.slice(prefix.length+1),b])),bytes=files.get('report.json');files.delete('report.json');
  assert.ok(Buffer.isBuffer(bytes)&&bytes.length<=16000000);const report=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  calcEqual([report.schemaVersion,report.role,report.completed,report.phase,report.approvedImagePolicy,report.imageConformanceClaim,report.imageAdmission],[1,role,true,'complete',false,false,'pending'],'Native cached report role/claim differs');
  assert.ok(report.artifacts&&Object.keys(report.artifacts).length>0);calcEqual([...files.keys()].sort(),Object.keys(report.artifacts).sort(),'Native cached report coverage differs');
  for(const[f,h]of Object.entries(report.artifacts)){calcTrialCachePath(f);assert.match(h,/^[a-f0-9]{64}$/);assert.equal(calcHash(files.get(f)),h,'Native cached report artifact differs: '+f);}
  const pngs=new Map();let decoded=0;
  const png=f=>{const hash=report.artifacts[f];assert.ok(hash);if(pngs.has(hash)){const p=pngs.get(hash);pngs.delete(hash);pngs.set(hash,p);return p;}
    const p=decodeCalcPng(files.get(f));while(pngs.size&&decoded+p.rgba.length>128000000){const oldest=pngs.keys().next().value;decoded-=pngs.get(oldest).rgba.length;pngs.delete(oldest);}
    pngs.set(hash,p);decoded+=p.rgba.length;return p;};
  return{bytes,sha256:calcHash(bytes),report,files,json:f=>JSON.parse(files.get(f)),png};
}
export async function collectCalcNativeSources(proofs,read){
  const sources={};const add=(file,bytes)=>{calcTrialCachePath(file);const h=calcHash(bytes);assert.ok(!Object.hasOwn(sources,file)||sources[file]===h,'Conflicting native source capture');sources[file]=h;};
  for(const proof of Object.values(proofs))for(const[file,h]of Object.entries(proof.report.sourceHashes??{})){const b=await read(file);assert.equal(calcHash(b),h,'Native proof source differs: '+file);add(file,b);}
  for(const kind of ['primary','pdf'])for(const[f,b]of proofs[kind+'Controls'].files)if(f.startsWith('source-captures/'))add('tools/TikzVisual/'+f.slice(16),b);
  const queue=[...own,pinFile];const traversed=new Set();
  for(let i=0;i<queue.length;i++){const file=queue[i];if(traversed.has(file))continue;traversed.add(file);assert.match(file,/^tools\/TikzVisual\/[a-z0-9.-]+\.mjs$/);
    const bytes=await read(file);if(file!==pinFile)add(file,bytes);
    for(const m of bytes.toString().matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g))queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(file),m[1])));
  }
  assert.ok(!Object.keys(sources).some(f=>f.startsWith('src/')),'Native calibration cannot capture production sources');
  return Object.fromEntries(Object.entries(sources).sort(([a],[b])=>a<b?-1:a>b?1:0));
}
export async function validateCalcNativeCache(cache){
  const expected=new Set(),proofs={};for(const[k,pin]of Object.entries(calcNativeCacheProofs)){
    const b=calcNativeCacheBundle(cache,k,pin.role);assert.equal(b.sha256,pin.sha256,'Frozen native proof pin differs: '+k);proofs[k]=b;
    expected.add(k+'/report.json');for(const f of b.files.keys())expected.add(k+'/'+f);
  }
  calcEqual(proofs.primary.report.renderer,proofs.pdf.report.renderer,'Native calibration renderers differ');
  const reproductions={};for(const kind of ['primary','pdf']){
    const original=proofs[kind],check=proofs[kind+'Check'],recaptured=proofs[kind+'Recaptured'],controls=proofs[kind+'Controls'];
    calcEqual([check.report.converterInvoked,check.report.nativeToolInvoked,check.report.rendererRecaptured],[false,false,true]);
    calcEqual(check.report.input,{file:calcNativeCacheProofs[kind].origin,sha256:original.sha256});
    assert.equal(calcHash(check.files.get('input-report.json')),original.sha256);assert.equal(calcHash(check.files.get('recapture-report.json')),recaptured.sha256);
    assert.equal(controls.report.input,calcNativeCacheProofs[kind+'Check'].origin);assert.equal(calcHash(controls.files.get('input-check-report.json')),check.sha256);
    const log=check.files.get('recapture-command.log').toString(),handle=JSON.parse(log.trim().split(/\r?\n/).at(-1));
    calcEqual(handle,{completed:true,phase:'complete',report:calcNativeCacheProofs[kind+'Recaptured'].origin,sha256:recaptured.sha256});
    const nativeArgument=path.posix.dirname(calcNativeCacheProofs[kind+'Check'].origin)+'/bound-native/report.json';assert.equal(recaptured.report.input.file,nativeArgument);
    const verification=kind==='primary'?verifyCalcCalibrationRecapture:verifyCalcPdfCalibrationRecapture;
    const reproduction=verification(original,recaptured,nativeArgument);calcEqual(reproduction,check.report.reproduction);calcEqual(reproduction,check.json('source-binding.json'));reproductions[kind]=reproduction;
    calcEqual(controls.report.controls.map(c=>c.name),calcNativeControlNames[kind],'Native corruption coverage differs');assert.ok(controls.report.controls.every(c=>c.passed===true));
    assert.equal(controls.report.controls.at(-1).independentDecodedMetricsAccepted,true);
    const native=new Map([...original.files].filter(([f])=>f.startsWith('native/')).map(([f,b])=>[f.slice(7),b])),points=original.json('points.json'),pin=original.json('pdf-pin.json');
    assert.equal(calcHash(native.get('report.json')),pin.nativeReportSha256);assert.equal(calcHash(native.get('pdf-plain/case.pdf')),pin.pdfSha256);
    for(const scale of [1,4])assert.equal(calcHash(native.get('pdf-plain/page-'+scale+'x.png')),pin.rasterSha256[scale+'x']);
    readCalcLayoutEvidence(Object.fromEntries(native),points);
    for(const[f,b]of native)assert.ok(b.equals(proofs[kind==='primary'?'pdf':'primary'].files.get('native/'+f)),'Native inputs differ across calibration routes');
  }
  const sources=await collectCalcNativeSources(proofs,async file=>file===pinFile?Buffer.from("import {calcTrialPins} from './calc-trial-reference.mjs';"):cache.files.get('sources/'+file));
  for(const f of Object.keys(sources))expected.add('sources/'+f);calcEqual([...cache.files.keys()].sort(),[...expected].sort(),'Unexpected/missing native cache asset');
  return{...proofs,reproductions,sources};
}
export function verifyCalcNativeCachePixels(evidence,{progress=()=>{}}={}){
  const metrics={};for(const[k,verify]of [['primary',verifyCalcCalibrationPixels],['pdf',verifyCalcPdfCalibrationPixels]]){
    progress(k);metrics[k]=verify(evidence[k]);calcEqual(metrics[k],evidence[k+'Check'].report.metrics,'Native decoded metrics differ: '+k);
    calcEqual(metrics[k],evidence[k+'Check'].json('decoded-metrics.json'));}
  return metrics;
}
export function replayCalcNativeCacheControls(evidence,{progress=()=>{}}={}){
  const results=[];for(const kind of ['primary','pdf']){const original=evidence[kind],recaptured=evidence[kind+'Recaptured'],controls=evidence[kind+'Controls'];
    const pixels=kind==='primary'?verifyCalcCalibrationPixels:verifyCalcPdfCalibrationPixels,recapture=kind==='primary'?verifyCalcCalibrationRecapture:verifyCalcPdfCalibrationRecapture;
    for(const record of controls.report.controls.filter(c=>c.overlay)){
      progress(kind+'/'+record.name);assert.equal(record.hashesRecomputed,true);assert.equal(record.baseReport,calcNativeCacheProofs[kind].origin);
      const prefix='mutations/'+record.name+'/',bytes=controls.files.get(prefix+'report.json'),report=JSON.parse(bytes),files=new Map(original.files);
      for(const[f,b]of controls.files)if(f.startsWith(prefix)&&f!==prefix+'report.json')files.set(f.slice(prefix.length),b);
      for(const[f,h]of Object.entries(report.artifacts))assert.equal(calcHash(files.get(f)),h,'Invalid constructed native overlay');
      const changed={...original,bytes,sha256:calcHash(bytes),report,files,json:f=>JSON.parse(files.get(f)),png:f=>decodeCalcPng(files.get(f))};
      const sourceCheck=['rehashed-weakened-policy','rehashed-weakened-ink-policy','false-defect-summary','rehashed-native-png-metrics-policy'].includes(record.name)
        ||kind==='primary'&&record.name==='rehashed-changed-camera';
      if(record.independentDecodedMetricsAccepted) pixels(changed);
      let error;try{if(sourceCheck)recapture(changed,recaptured,recaptured.report.input.file);else pixels(changed);}catch(e){error=e;}
      assert.ok(error instanceof assert.AssertionError,'Native corruption accepted: '+record.name);assert.equal(error.message.slice(0,500),record.rejection,'Native corruption rejected for a different reason');
      results.push({name:kind+'/'+record.name,passed:true,rejection:record.rejection});
    }
  }assert.equal(results.length,22);return results;
}
export async function verifyCalcNativeCacheSources(evidence,root,{read=readFile}={}){
  for(const[f,h]of Object.entries(evidence.sources))assert.equal(calcHash(await read(path.join(root,f))),h,'Current native evidence tool differs: '+f);
  const original=evidence.primary;for(const[f,bytes]of [['tests/Fixtures/calc-coordinates.tikz',original.files.get('native/case.tikz')],
    ['tests/Reference/CalcCoordinates/points.json',original.files.get('points.json')],['tests/Reference/CalcCoordinates/pdf-pin.json',original.files.get('pdf-pin.json')]]){
    assert.ok(bytes);const current=await read(path.join(root,f));
    // Only the repository's declared JSON CRLF-to-LF text filter is permitted.
    const canonical=b=>f.endsWith('.json')?Buffer.from(b.toString().replaceAll('\r\n','\n')):b;
    assert.equal(calcHash(canonical(current)),calcHash(canonical(bytes)),'Current native input differs: '+f);}
  return{sources:Object.keys(evidence.sources).length,inputs:3,productionSources:0};
}
export async function loadCalcNativeCache(root,{read=readFile,pixels=true,progress=()=>{}}={}){
  const file=path.join(root,calcNativeCacheFile);if(read===readFile)assert.ok((await stat(file)).size<=calcNativeCacheBounds.compressed);
  const compressed=await read(file);assert.ok(Buffer.isBuffer(compressed)&&compressed.length<=calcNativeCacheBounds.compressed);assert.equal(calcHash(compressed),calcNativeCacheSha256,'Unreviewed native cache bytes');
  const bytes=gunzipSync(compressed,{maxOutputLength:calcNativeCacheBounds.decoded});assert.equal(calcHash(bytes),calcNativeCacheDecodedSha256,'Unreviewed decoded native cache');
  const cache=decodeCalcNativeCache(bytes),evidence=await validateCalcNativeCache(cache),sourceGuards=await verifyCalcNativeCacheSources(evidence,root,{read});
  const metrics=pixels?verifyCalcNativeCachePixels(evidence,{progress}):null;
  return{cache,evidence,metrics,sourceGuards,compressed,pixelsVerified:pixels};
}
