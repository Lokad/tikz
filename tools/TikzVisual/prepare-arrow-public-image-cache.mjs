// Preparation preserves the completed public qualification under new owned paths.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadArrowMeetImageCache} from './arrow-meet-image-cache.mjs';
import {loadArrowPublicPdfOwned} from './arrow-public-pdf-reader.mjs';
import {arrowPublicCacheBounds,encodeArrowPublicArchive,decodeArrowPublicArchive,arrowPublicExternalPool,arrowPublicExternalRead} from './arrow-public-image-cache-codec.mjs';
import {arrowPublicImageCacheMetadata,validateArrowPublicImageArchive,verifyArrowPublicImageSources,buildArrowPublicImageModels,loadArrowPublicImageCache} from './arrow-public-image-cache.mjs';
import {arrowPublicImageReports,arrowPublicImageFreshCheckout} from './arrow-public-image-cache-pin.mjs';

const output=await outputPath(path.join(root,'artifacts/arrow-public-image-cache-preparation/run-'+randomUUID()));let phase='arguments';
async function publish(completed,details){
  const bytes=Buffer.from(JSON.stringify({schemaVersion:1,completed,phase,comparisonKind:'public-arrow-qualification-cache-preparation',
    converterInvoked:false,nativeToolInvoked:false,browserInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',...details},null,2)+'\n');
  await writeArtifact(output,'report.json',bytes);console.log(JSON.stringify({completed,phase,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));
}
try{
  const args=process.argv.slice(2);assert.ok(args.length===0||args.length===1&&args[0]==='--replay');
  phase='qualified-input';const e=await loadArrowMeetImageCache();let files;
  if(args.length)files=(await loadArrowPublicImageCache()).files;
  else{
    const owned=await loadArrowPublicPdfOwned(arrowPublicImageReports.producer.origin,e);assert.equal(owned.inputReportSha256,arrowPublicImageReports.producer.sha256);
    files=new Map(owned.assets);files.set('report.json',owned.reportBytes);files.set('manifest.json',owned.manifestBytes);
    for(const[role,pin]of Object.entries(arrowPublicImageReports)){
      if(files.has(pin.file)){assert.equal(sha256(files.get(pin.file)),pin.sha256);continue;}
      const bytes=await readFile(path.join(root,role==='freshReader'?arrowPublicImageFreshCheckout:'',pin.origin));assert.ok(bytes.length<=100000);assert.equal(sha256(bytes),pin.sha256);files.set(pin.file,bytes);
    }
  }
  phase='encode';const pool=arrowPublicExternalPool(e),bytes=encodeArrowPublicArchive(arrowPublicImageCacheMetadata(),files,pool);
  const cache=decodeArrowPublicArchive(bytes,arrowPublicExternalRead(e));Object.assign(cache,validateArrowPublicImageArchive(cache));
  const sourcePolicy=await verifyArrowPublicImageSources(cache),models=buildArrowPublicImageModels(cache,e);
  for(const[file,original]of files)assert.ok(cache.get(file).equals(original),file);
  phase='compress';const compressed=gzipSync(bytes,{level:9});assert.ok(compressed.length<=arrowPublicCacheBounds.compressed);
  await writeArtifact(output,'public-controls.bin.gz',compressed);phase='complete';
  await publish(true,{compressedSha256:sha256(compressed),decodedSha256:sha256(bytes),compressedBytes:compressed.length,decodedBytes:bytes.length,
    logicalArtifacts:files.size,logicalBytes:cache.logicalBytes,distinctLogicalBlobs:cache.logical.size,externalBlobs:cache.externalBlobs,
    physicalChunks:Object.keys(cache.header.assets).length,pngs:[...files.keys()].filter(file=>file.endsWith('.png')).length,
    historicalProductionSources:sourcePolicy.historicalProduction.length,currentNumericGuards:sourcePolicy.currentGuards.length,
    primaryViews:models.primaryRecords.length,pdfViews:models.pdfRecords.length,reports:arrowPublicImageReports,
    cache:path.relative(root,path.join(output,'public-controls.bin.gz')).split(path.sep).join('/')});
}catch(error){process.exitCode=2;await publish(false,{error:error.message.slice(0,1000).replaceAll(root,'<repo>')});console.error(error.stack);}
