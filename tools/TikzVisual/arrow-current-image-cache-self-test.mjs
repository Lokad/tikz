// Exercise complete fixed qualification and the historical/current source boundary.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {arrowCanonical} from './arrow-native-contract.mjs';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {arrowCurrentCacheBounds,encodeArrowCurrentArchive,decodeArrowCurrentArchive,arrowCurrentExternalPool,arrowCurrentExternalRead} from './arrow-current-image-cache-codec.mjs';
import {arrowCurrentImageCacheFile,arrowCurrentImageCacheSha256,arrowCurrentImageCacheDecodedSha256,arrowCurrentImageProofs,
  loadArrowCurrentImageCache,decodeArrowCurrentImageCache,validateArrowCurrentImageArchive,verifyArrowCurrentImageSources} from './arrow-current-image-cache.mjs';

assert.equal(process.argv.length,2);
const output=path.join(root,'artifacts/arrow-current-image-cache-controls/run-'+randomUUID()),controls=[],ownSources={};let phase='codec';
const pass=name=>controls.push({name,passed:true});
async function reject(name,action){let rejection;await assert.rejects(async()=>action(),error=>{assert.ok(error instanceof assert.AssertionError);rejection=error.message.slice(0,500);return true;});controls.push({name,passed:true,rejection});}
async function publish(completed,details){
  const bytes=Buffer.from(JSON.stringify({schemaVersion:1,completed,phase,comparisonKind:'current-arrow-combined-qualification-cache-controls',
    converterInvoked:false,nativeToolInvoked:false,browserInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',
    ownSources,controls,...details},null,2)+'\n');await writeArtifact(output,'report.json',bytes);
  console.log(JSON.stringify({completed,phase,controls:controls.length,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));
}
try{
  for(const file of ['arrow-current-image-cache-codec.mjs','arrow-current-image-cache-pin.mjs','arrow-current-image-cache.mjs',
    'arrow-qualified-current-reader.mjs','prepare-arrow-current-image-cache.mjs','arrow-current-image-cache-self-test.mjs']){
    const name='tools/TikzVisual/'+file,bytes=arrowCanonical(await readFile(path.join(root,name)));ownSources[name]=sha256(bytes);await writeArtifact(output,'source-captures/'+name,bytes);
  }
  const roles=['base','meet','public','base-container','meet-container','public-container'];
  const externals=roles.map((role,i)=>({role,file:role.endsWith('-container')?'archive':'fixed/'+i,bytes:Buffer.from('external-role-'+role)}));
  const pool=new Map(externals.map(item=>[sha256(item.bytes),item]));
  const externalRead=(role,file)=>{const item=externals.find(item=>item.role===role&&item.file===file);assert.ok(item);return item.bytes;};
  const large=Buffer.alloc(arrowCurrentCacheBounds.chunk+7,65),files=new Map([['large',large],['alias',large],['empty',Buffer.alloc(0)],['__proto__',Buffer.from('name')],...externals.map((item,i)=>['external/'+i,item.bytes])]);
  const encoded=encodeArrowCurrentArchive({marker:'synthetic'},files,pool),small=decodeArrowCurrentArchive(encoded,externalRead);
  assert.equal(small.logical.size,9);assert.equal(small.externalBlobs,6);assert.equal(small.header.logicalBlobs[sha256(large)].parts.length,2);
  for(const[file,bytes]of files)assert.ok(small.get(file).equals(bytes));pass('chunk boundary, alias, all six external roles, empty file and prototype-like path');
  const body=encoded.subarray(12+encoded.readUInt32LE(8));
  const wire=header=>{const index=Buffer.from(JSON.stringify(header)+'\n'),prefix=Buffer.from(encoded.subarray(0,12));prefix.writeUInt32LE(index.length,8);return Buffer.concat([prefix,index,body]);};
  const corrupt=async(name,change)=>{const header=structuredClone(small.header);change(header);await reject(name,()=>decodeArrowCurrentArchive(wire(header),externalRead));};
  const big=sha256(large),ext=sha256(externals[2].bytes),container=sha256(externals[5].bytes);
  await corrupt('missing internal chunk',h=>h.logicalBlobs[big].parts.pop());
  await corrupt('reordered internal chunks',h=>h.logicalBlobs[big].parts.reverse());
  await corrupt('changed logical length',h=>h.logicalBlobs[big].bytes--);
  await corrupt('oversized logical file',h=>h.logicalBlobs[big].bytes=arrowCurrentCacheBounds.logicalFile+1);
  await corrupt('wrong external role',h=>h.logicalBlobs[ext].external.role='unknown');
  await corrupt('unsafe external path',h=>h.logicalBlobs[ext].external.file='../escape');
  await corrupt('external container path must be archive',h=>h.logicalBlobs[container].external.file='other');
  await corrupt('mixed external/internal descriptor',h=>h.logicalBlobs[ext].parts=[]);
  await corrupt('missing logical blob',h=>delete h.logicalBlobs[ext]);
  await corrupt('unsafe logical path',h=>{h.logicalAssets['../escape']=h.logicalAssets.alias;delete h.logicalAssets.alias;h.logicalAssets=Object.fromEntries(Object.entries(h.logicalAssets).sort());});
  await corrupt('changed chunk contract',h=>h.chunkBytes++);
  await reject('external content hash checked independently',()=>decodeArrowCurrentArchive(encoded,(role,file)=>{const b=Buffer.from(externalRead(role,file));b[0]^=1;return b;}));
  await reject('reserved archive metadata',()=>encodeArrowCurrentArchive({logicalAssets:{}},files,pool));
  await reject('missing logical lookup',()=>small.get('missing'));

  phase='pinned-qualified-input';const e=await loadArrowCurrentImageCache();
  assertNativeEqual([e.files.size,e.model.primary.records.length,e.model.pdf.records.length,e.model.pdf.focus.length],[18849,306,396,520]);
  assertNativeEqual([e.sourcePolicy.historicalProduction.length,e.sourcePolicy.currentGuards.length,e.model.sources.size],[58,8,117]);
  assert.equal(Object.keys(e.model.baseline.combined.gates).length,13);assert.equal(e.model.baseline.combined.passed,true);
  pass('complete archive, proofs, baselines, control models, focus and source attribution');
  assertNativeEqual(e.reports.reader.controls.filter(c=>Object.hasOwn(c,'axis')).map(c=>[c.axis,c.structurallyAccepted,c.unchangedMassAndCoverage]),[['mass',true,false],['x',true,true],['y',true,true]]);
  pass('independent decoded mass and first-moment corruption evidence retained');
  const{chunkBytes,logicalAssets,logicalBlobs,assets,blobs,...metadata}=e.header;
  const alter=async(name,change)=>{const altered=structuredClone(metadata);change(altered);await reject(name,()=>validateArrowCurrentImageArchive({...e,header:{...e.header,...altered}}));};
  for(const[key,value]of Object.entries({completed:false,converterInvoked:true,nativeToolInvoked:true,browserInvoked:true,approvedImagePolicy:true,imageConformanceClaim:true,imageAdmission:'passed'}))
    await alter('identity/'+key,m=>m[key]=value);
  await alter('changed qualification commit',m=>m.qualification.commit='0'.repeat(40));
  await alter('changed qualification tree',m=>m.qualification.tree='0'.repeat(40));
  for(const key of ['publicSha256','meetSha256','baseSha256'])await alter('changed dependency/'+key,m=>m.dependencies[key]='0'.repeat(64));
  await alter('weakened source contract',m=>m.sourceContract='unguarded');
  await alter('lost immutable admission gate',m=>m.pendingGates.pop());
  for(const role of Object.keys(metadata.proofs))await alter('changed proof pin/'+role,m=>m.proofs[role].sha256='0'.repeat(64));

  phase='rehashed-substitutions';const realPool=arrowCurrentExternalPool(e.publicCache),readExternal=arrowCurrentExternalRead(e.publicCache);
  const forge=async(name,change)=>{
    const mutated=new Map(e.files);change(mutated);
    const forged=decodeArrowCurrentArchive(encodeArrowCurrentArchive(metadata,mutated,realPool),readExternal);
    await reject(name,()=>validateArrowCurrentImageArchive(forged));
  };
  for(const role of ['reader','freshReader','fresh','postcommit','interruption'])await forge('missing proof/'+role,f=>f.delete(arrowCurrentImageProofs[role].file));
  await forge('missing fresh checker numeric provenance',f=>f.delete('proofs/fresh-reader/numeric/report.json'));
  await forge('missing fresh producer numeric provenance',f=>f.delete('proofs/fresh-producer/baseline/numeric/report.json'));
  const defect=e.model.pdf.records.find(r=>r.view.kind==='defect'&&r.sourceDelta.rawChangedPixels>0);assert.ok(defect);
  await forge('fully rehashed public PNG substitution',f=>f.set('pdf/'+defect.files.source.images['svg-page'],f.get('pdf/'+defect.files.pdf)));
  await forge('fully rehashed historical production source replacement',f=>f.set('baseline/numeric/source-captures/'+e.sourcePolicy.historicalProduction[0],Buffer.from('replaced history')));
  await forge('fully rehashed weakened native policy and manifests',f=>{
    const binding=JSON.parse(f.get('native-limit-bindings.json'));binding.pdfPolicies.pop();const bytes=Buffer.from(JSON.stringify(binding)+'\n');f.set('native-limit-bindings.json',bytes);
    const manifest=JSON.parse(f.get('manifest.json'));manifest.artifacts['native-limit-bindings.json']=sha256(bytes);const mb=Buffer.from(JSON.stringify(manifest,null,2)+'\n');f.set('manifest.json',mb);
    const report=JSON.parse(f.get('report.json'));report.manifest.sha256=sha256(mb);f.set('report.json',Buffer.from(JSON.stringify(report,null,2)+'\n'));
  });

  phase='historical-current-separation';let productionReads=0;
  const changedProduction=async file=>{const relative=path.relative(root,file).split(path.sep).join('/');if(relative.startsWith('src/Lokad.TikZ/')){productionReads++;return Buffer.from('different current production source');}return readFile(file);};
  const split=await verifyArrowCurrentImageSources(e,changedProduction);assert.equal(productionReads,0);assert.equal(split.historicalProduction.length,58);
  pass('no current production reads while validating all three captured numeric runs');
  const substitute=target=>async file=>path.relative(root,file).split(path.sep).join('/')===target?Buffer.from('changed current guarded input'):readFile(file);
  await reject('changed current numeric comparator remains guarded',()=>verifyArrowCurrentImageSources(e,substitute('tools/TikzArrowComparison/NativeArrowComparison.cs')));
  await reject('changed current native fixture remains guarded',()=>verifyArrowCurrentImageSources(e,substitute('tests/Reference/Arrows/meta-defaults/source.tikz')));
  await reject('changed current combined checker remains guarded',()=>verifyArrowCurrentImageSources(e,substitute('tools/TikzVisual/check-arrow-current.mjs')));
  const changedCompressed=Buffer.from(e.compressed);changedCompressed[changedCompressed.length-1]^=1;
  await reject('changed compressed archive through pinned decoder',()=>decodeArrowCurrentImageCache(changedCompressed,e.publicCache));
  await reject('empty compressed archive',()=>decodeArrowCurrentImageCache(Buffer.alloc(0),e.publicCache));
  for(const[file,hash]of Object.entries(ownSources))assert.equal(sha256(arrowCanonical(await readFile(path.join(root,file)))),hash);
  assert.ok(controls.every(c=>c.passed));phase='complete';await publish(true,{cache:arrowCurrentImageCacheFile,cacheSha256:arrowCurrentImageCacheSha256,
    decodedSha256:arrowCurrentImageCacheDecodedSha256,logicalArtifacts:e.files.size,logicalBytes:e.logicalBytes,externalBlobs:e.externalBlobs,
    historicalProductionSources:58,currentNumericGuards:8,comparisonSourceGuards:117,productionReads,
    primaryViews:e.model.primary.records.length,pdfViews:e.model.pdf.records.length,focusSelections:e.model.pdf.focus.length,
    independentControls:e.reports.reader.controls.length,pngs:[...e.files.keys()].filter(file=>file.endsWith('.png')).length});
}catch(error){process.exitCode=2;await publish(false,{error:error.message.slice(0,1000).replaceAll(root,'<repo>')});console.error(error.stack);}
