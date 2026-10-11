// Exercise the real archive, its fixed proofs and historical/current source split.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {arrowCanonical} from './arrow-native-contract.mjs';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {arrowPublicCacheBounds,encodeArrowPublicArchive,decodeArrowPublicArchive,arrowPublicExternalPool,arrowPublicExternalRead} from './arrow-public-image-cache-codec.mjs';
import {arrowPublicImageCacheFile,arrowPublicImageCacheSha256,arrowPublicImageCacheDecodedSha256,loadArrowPublicImageCache,
  decodeArrowPublicImageCache,validateArrowPublicImageArchive,verifyArrowPublicImageSources} from './arrow-public-image-cache.mjs';

assert.equal(process.argv.length,2);
const output=path.join(root,'artifacts/arrow-public-image-cache-controls/run-'+randomUUID()),controls=[],ownSources={};let phase='codec';
const pass=name=>controls.push({name,passed:true});
async function reject(name,action){let rejection;await assert.rejects(async()=>action(),error=>{assert.ok(error instanceof assert.AssertionError);rejection=error.message.slice(0,500);return true;});controls.push({name,passed:true,rejection});}
async function publish(completed,details){
  const bytes=Buffer.from(JSON.stringify({schemaVersion:1,completed,phase,comparisonKind:'public-arrow-qualification-cache-controls',
    converterInvoked:false,nativeToolInvoked:false,browserInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',
    ownSources,controls,...details},null,2)+'\n');await writeArtifact(output,'report.json',bytes);
  console.log(JSON.stringify({completed,phase,controls:controls.length,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));
}
try{
  for(const file of ['arrow-public-image-cache-codec.mjs','arrow-public-image-cache-pin.mjs','arrow-public-image-cache.mjs','prepare-arrow-public-image-cache.mjs','arrow-public-image-cache-self-test.mjs']){
    const name='tools/TikzVisual/'+file,bytes=arrowCanonical(await readFile(path.join(root,name)));ownSources[name]=sha256(bytes);await writeArtifact(output,'source-captures/'+name,bytes);
  }
  const large=Buffer.alloc(arrowPublicCacheBounds.chunk+7,65),external=Buffer.from('fixed-external-native-bytes');
  const pool=new Map([[sha256(external),{role:'base',file:'fixed',bytes:external}]]),externalRead=(role,file)=>{assert.equal(role,'base');assert.equal(file,'fixed');return external;};
  const files=new Map([['large',large],['alias',large],['external',external],['empty',Buffer.alloc(0)],['__proto__',Buffer.from('name')]]);
  const encoded=encodeArrowPublicArchive({marker:'synthetic'},files,pool),small=decodeArrowPublicArchive(encoded,externalRead);
  assert.equal(small.logical.size,4);assert.equal(small.externalBlobs,1);assert.equal(small.header.logicalBlobs[sha256(large)].parts.length,2);
  for(const[file,bytes]of files)assert.ok(small.get(file).equals(bytes));pass('chunk boundary, alias, external bytes, empty file and prototype-like path');
  const body=encoded.subarray(12+encoded.readUInt32LE(8));
  const wire=header=>{const index=Buffer.from(JSON.stringify(header)+'\n'),prefix=Buffer.from(encoded.subarray(0,12));prefix.writeUInt32LE(index.length,8);return Buffer.concat([prefix,index,body]);};
  const corrupt=async(name,change)=>{const header=structuredClone(small.header);change(header);await reject(name,()=>decodeArrowPublicArchive(wire(header),externalRead));};
  const big=sha256(large),ext=sha256(external);
  await corrupt('missing internal chunk',h=>h.logicalBlobs[big].parts.pop());
  await corrupt('reordered internal chunks',h=>h.logicalBlobs[big].parts.reverse());
  await corrupt('changed logical length',h=>h.logicalBlobs[big].bytes--);
  await corrupt('oversized logical file',h=>h.logicalBlobs[big].bytes=arrowPublicCacheBounds.logicalFile+1);
  await corrupt('wrong external role',h=>h.logicalBlobs[ext].external.role='unknown');
  await corrupt('unsafe external path',h=>h.logicalBlobs[ext].external.file='../escape');
  await corrupt('mixed external/internal descriptor',h=>h.logicalBlobs[ext].parts=[]);
  await corrupt('missing logical blob',h=>delete h.logicalBlobs[ext]);
  await corrupt('unsafe logical path',h=>{h.logicalAssets['../escape']=h.logicalAssets.alias;delete h.logicalAssets.alias;h.logicalAssets=Object.fromEntries(Object.entries(h.logicalAssets).sort());});
  await corrupt('changed chunk contract',h=>h.chunkBytes++);
  await reject('external content hash checked independently',()=>decodeArrowPublicArchive(encoded,()=>Buffer.from('wrong-external-native-bytes')));
  await reject('reserved archive metadata',()=>encodeArrowPublicArchive({logicalAssets:{}},files,pool));
  await reject('missing logical lookup',()=>small.get('missing'));

  phase='pinned-qualified-input';const e=await loadArrowPublicImageCache();
  assertNativeEqual([e.files.size,e.primaryRecords.length,e.pdfRecords.length],[18437,306,396]);
  assertNativeEqual([e.sourcePolicy.historicalProduction.length,e.sourcePolicy.currentGuards.length],[58,8]);
  pass('fixed archive, complete proofs, source guards and both rederived control models');
  const{chunkBytes,logicalAssets,logicalBlobs,assets,blobs,...metadata}=e.header;
  const alter=async(name,change)=>{const altered=structuredClone(metadata);change(altered);await reject(name,()=>validateArrowPublicImageArchive({...e,header:{...e.header,...altered}}));};
  for(const[key,value]of Object.entries({completed:false,converterInvoked:true,nativeToolInvoked:true,browserInvoked:true,approvedImagePolicy:true,imageConformanceClaim:true,imageAdmission:'passed'}))
    await alter('identity/'+key,m=>m[key]=value);
  await alter('changed qualification commit',m=>m.qualification.commit='0'.repeat(40));
  await alter('changed qualification tree',m=>m.qualification.tree='0'.repeat(40));
  await alter('changed native base pin',m=>m.native.baseSha256='0'.repeat(64));
  await alter('changed native meet pin',m=>m.native.meetSha256='0'.repeat(64));
  await alter('weakened source contract',m=>m.sourceContract='unguarded');
  await alter('lost combined admission gate',m=>m.pendingGates.pop());
  for(const role of Object.keys(metadata.reports))await alter('changed proof pin/'+role,m=>m.reports[role].sha256='0'.repeat(64));

  phase='rehashed-substitutions';const nativePool=arrowPublicExternalPool(e.native),readNative=arrowPublicExternalRead(e.native);
  const forge=async(name,change)=>{
    const mutated=new Map(e.files);change(mutated);
    // Successful encoding/decoding is required before the fixed-proof rejection.
    const forged=decodeArrowPublicArchive(encodeArrowPublicArchive(metadata,mutated,nativePool),readNative);
    await reject(name,()=>validateArrowPublicImageArchive(forged));
  };
  await forge('missing independent reader proof',f=>f.delete('proofs/pdf-reader.json'));
  await forge('missing fresh export proof',f=>f.delete('proofs/pdf-fresh.json'));
  await forge('missing commit audit proof',f=>f.delete('proofs/pdf-postcommit.json'));
  await forge('missing first-moment-only proof',f=>f.delete('proofs/first-moments.json'));
  const defect=e.pdfRecords.find(r=>r.view.kind==='defect'&&r.sourceDelta.rawChangedPixels>0);assert.ok(defect);
  await forge('fully rehashed public PNG substitution',f=>f.set(defect.files.source.images['svg-page'],f.get(defect.files.pdf)));
  await forge('fully rehashed historical production source replacement',f=>f.set('primary/baseline/numeric/source-captures/'+e.sourcePolicy.historicalProduction[0],Buffer.from('replaced history')));
  await forge('fully rehashed weakened native policy and manifest',f=>{
    const binding=JSON.parse(f.get('native-limit-bindings.json'));binding.pdfPolicies.pop();const bytes=Buffer.from(JSON.stringify(binding)+'\n');f.set('native-limit-bindings.json',bytes);
    const manifest=JSON.parse(f.get('manifest.json'));manifest.artifacts['native-limit-bindings.json']=sha256(bytes);const mb=Buffer.from(JSON.stringify(manifest,null,2)+'\n');f.set('manifest.json',mb);
    const report=JSON.parse(f.get('report.json'));report.manifest.sha256=sha256(mb);f.set('report.json',Buffer.from(JSON.stringify(report,null,2)+'\n'));
  });

  phase='historical-current-separation';let productionReads=0;
  const changedProduction=async file=>{const relative=path.relative(root,file).split(path.sep).join('/');if(relative.startsWith('src/Lokad.TikZ/')){productionReads++;return Buffer.from('different current production source');}return readFile(file);};
  const split=await verifyArrowPublicImageSources(e,changedProduction);assert.equal(productionReads,0);assert.equal(split.historicalProduction.length,58);
  pass('current production changes do not replace or invalidate historical qualification');
  const substitute=target=>async file=>path.relative(root,file).split(path.sep).join('/')===target?Buffer.from('changed current guarded input'):readFile(file);
  await reject('changed current native fixture remains guarded',()=>verifyArrowPublicImageSources(e,substitute('tests/Reference/Arrows/meta-defaults/source.tikz')));
  const changedCompressed=Buffer.from(e.compressed);changedCompressed[changedCompressed.length-1]^=1;
  await reject('changed compressed archive through pinned decoder',()=>decodeArrowPublicImageCache(changedCompressed,e.native));
  await reject('empty compressed archive',()=>decodeArrowPublicImageCache(Buffer.alloc(0),e.native));
  for(const[file,hash]of Object.entries(ownSources))assert.equal(sha256(arrowCanonical(await readFile(path.join(root,file)))),hash);
  assert.ok(controls.every(c=>c.passed));phase='complete';await publish(true,{cache:arrowPublicImageCacheFile,cacheSha256:arrowPublicImageCacheSha256,
    decodedSha256:arrowPublicImageCacheDecodedSha256,logicalArtifacts:e.files.size,logicalBytes:e.logicalBytes,externalBlobs:e.externalBlobs,
    historicalProductionSources:58,currentNumericGuards:8,producerSourceGuards:112,checkerSourceGuards:1,productionReads,
    primaryViews:e.primaryRecords.length,pdfViews:e.pdfRecords.length,pngs:[...e.files.keys()].filter(file=>file.endsWith('.png')).length});
}catch(error){process.exitCode=2;await publish(false,{error:error.message.slice(0,1000).replaceAll(root,'<repo>')});console.error(error.stack);}
