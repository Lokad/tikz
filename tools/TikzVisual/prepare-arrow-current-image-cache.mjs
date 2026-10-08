// Preserve complete qualified evidence; this command never changes a tracked pin.
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {arrowCachePath} from './arrow-image-cache-codec.mjs';
import {loadArrowPublicImageCache} from './arrow-public-image-cache.mjs';
import {arrowCurrentCacheBounds,encodeArrowCurrentArchive,decodeArrowCurrentArchive,arrowCurrentExternalPool,arrowCurrentExternalRead} from './arrow-current-image-cache-codec.mjs';
import {arrowCurrentImageCacheMetadata,validateArrowCurrentImageArchive,verifyArrowCurrentImageSources,buildArrowCurrentImageModel,loadArrowCurrentImageCache} from './arrow-current-image-cache.mjs';
import {arrowCurrentImageProofs,arrowCurrentImageFreshCheckout} from './arrow-current-image-cache-pin.mjs';

const output=await outputPath(path.join(root,'artifacts/arrow-current-image-cache-preparation/run-'+randomUUID()));let phase='arguments';
async function publish(completed,details){
  const bytes=Buffer.from(JSON.stringify({schemaVersion:1,completed,phase,comparisonKind:'current-arrow-combined-qualification-cache-preparation',
    converterInvoked:false,nativeToolInvoked:false,browserInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',...details},null,2)+'\n');
  await writeArtifact(output,'report.json',bytes);console.log(JSON.stringify({completed,phase,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));
}
try{
  const args=process.argv.slice(2);assert.ok(args.length===0||args.length===1&&args[0]==='--replay');
  phase='qualified-input';const publicCache=await loadArrowPublicImageCache();let files;
  if(args.length)files=(await loadArrowCurrentImageCache()).files;
  else{
    files=new Map();
    async function add(file,origin,hash,bound=arrowCurrentCacheBounds.logicalFile){
      arrowCachePath(file);const input=await outputPath(path.join(root,origin));assert.ok((await stat(input)).size<=bound);
      const bytes=await readFile(input);assert.equal(sha256(bytes),hash,'Changed saved combined evidence: '+file);assert.ok(!files.has(file));files.set(file,bytes);
    }
    for(const pin of Object.values(arrowCurrentImageProofs))await add(pin.file,(pin.inFresh?arrowCurrentImageFreshCheckout+'/':'')+pin.origin,pin.sha256);
    const producer=JSON.parse(files.get('report.json')),folder=path.posix.dirname(arrowCurrentImageProofs.producer.origin);
    await add('manifest.json',folder+'/manifest.json',producer.manifest.sha256,5000000);
    for(const[file,hash]of Object.entries(JSON.parse(files.get('manifest.json')).artifacts))await add(file,folder+'/'+file,hash);
    for(const role of ['reader','freshReader']){
      const pin=arrowCurrentImageProofs[role],prefix=path.posix.dirname(pin.file)+'/',check=JSON.parse(files.get(pin.file));
      const origin=(pin.inFresh?arrowCurrentImageFreshCheckout+'/':'')+path.posix.dirname(pin.origin)+'/';
      for(const[file,hash]of Object.entries(check.artifacts))await add(prefix+file,origin+file,hash);
    }
    const fresh=JSON.parse(files.get(arrowCurrentImageProofs.fresh.file)),fm=JSON.parse(files.get(arrowCurrentImageProofs.freshManifest.file));
    for(const d of fresh.differences)await add('proofs/fresh-producer/'+d.file,arrowCurrentImageFreshCheckout+'/'+path.posix.dirname(arrowCurrentImageProofs.freshProducer.origin)+'/'+d.file,fm.artifacts[d.file]);
  }
  phase='encode';const bytes=encodeArrowCurrentArchive(arrowCurrentImageCacheMetadata(),files,arrowCurrentExternalPool(publicCache));
  const cache=decodeArrowCurrentArchive(bytes,arrowCurrentExternalRead(publicCache));Object.assign(cache,validateArrowCurrentImageArchive(cache),{publicCache});
  const sourcePolicy=await verifyArrowCurrentImageSources(cache),model=await buildArrowCurrentImageModel(cache);
  for(const[file,original]of files)assert.ok(cache.get(file).equals(original),file);
  phase='compress';const compressed=gzipSync(bytes,{level:9});assert.ok(compressed.length<=arrowCurrentCacheBounds.compressed);
  await writeArtifact(output,'current-combined.bin.gz',compressed);phase='complete';
  await publish(true,{compressedSha256:sha256(compressed),decodedSha256:sha256(bytes),compressedBytes:compressed.length,decodedBytes:bytes.length,
    logicalArtifacts:files.size,logicalBytes:cache.logicalBytes,distinctLogicalBlobs:cache.logical.size,externalBlobs:cache.externalBlobs,
    physicalChunks:Object.keys(cache.header.assets).length,pngs:[...files.keys()].filter(file=>file.endsWith('.png')).length,
    historicalProductionSources:sourcePolicy.historicalProduction.length,currentNumericGuards:sourcePolicy.currentGuards.length,comparisonSources:model.sources.size,
    primaryViews:model.primary.records.length,pdfViews:model.pdf.records.length,focusSelections:model.pdf.focus.length,independentControls:cache.reports.reader.controls.length,
    proofs:arrowCurrentImageProofs,cache:path.relative(root,path.join(output,'current-combined.bin.gz')).split(path.sep).join('/')});
}catch(error){process.exitCode=2;await publish(false,{error:error.message.slice(0,1000).replaceAll(root,'<repo>')});console.error(error.stack);}
