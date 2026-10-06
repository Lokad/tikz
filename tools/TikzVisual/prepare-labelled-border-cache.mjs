// Explicit preparation from pinned independent investigations; ignored output.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {canonical,loadLabelledCombinedInputs,verifyLabelledSourceHashes} from './labelled-border-combined-common.mjs';
import {loadLabelledPublicPdfEvidence} from './labelled-border-public-pdf-coverage.mjs';
import {loadLabelledPdfQualification} from './labelled-border-pdf-calibration-common.mjs';
import {loadLabelledBorderEvidence} from './labelled-border-evidence.mjs';
import {labelledCacheReports,selectLabelledCacheAssets,projectLabelledQualification,validateLabelledCache} from './labelled-border-cache.mjs';

const base=path.join(root,'artifacts/labelled-border-cache-preparation'),output=path.join(base,'run-'+randomUUID());
const artifacts={};const save=(p,b)=>writeArtifact(output,p,b,artifacts);
async function publish(r){const b=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(output,'report.json',b);
  await writeArtifact(base,'latest.json',JSON.stringify({completed:r.completed,
    report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');}
try{
  await publish({completed:false,converterInvoked:false,approvedImagePolicy:false,artifacts});assert.equal(process.argv.length,2);
  const inputs=await loadLabelledCombinedInputs(),independent=await loadLabelledPublicPdfEvidence(inputs);
  const qualification=await loadLabelledPdfQualification(),native=await loadLabelledBorderEvidence();
  const loaded={...inputs,pdfOnly:independent.source,guard:independent.guard};
  const reports=Object.fromEntries(Object.entries(loaded).map(([k,v])=>[k,v.report]));
  const toolHashes={};for(const r of Object.values(reports))for(const[p,h]of Object.entries(r.toolHashes)){
    assert.ok(!toolHashes[p]||toolHashes[p]===h);toolHashes[p]=h;
  }
  Object.assign(toolHashes,qualification.report.toolHashes);
  const own='tools/TikzVisual/prepare-labelled-border-cache.mjs';toolHashes[own]=sha256(canonical(await readFile(path.join(root,own))));
  const assets=selectLabelledCacheAssets(reports),blobs={};
  for(const[p,h]of Object.entries(assets))if(!blobs[h]){
    const split=p.indexOf('/'),key=p.slice(0,split),file=p.slice(split+1),b=await loaded[key].read(file);
    assert.equal(sha256(b),h,p);blobs[h]=b.toString('base64');
  }
  const sourceInputs={};
  for(const[p,raw]of native.files){
    const encoding=/\.(svg|log|tfm|pdf|png)$/.test(p)?'raw':'utf8-lf',b=encoding==='raw'?raw:canonical(raw);
    sourceInputs[p]={sha256:sha256(b),encoding};
  }
  const calibration={schemaVersion:1,comparisonKind:'portable-independent-labelled-border-calibration',completed:true,
    converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',
    snapshotSha256:native.snapshotSha256,sourceReports:labelledCacheReports,renderer:reports.pdf.renderer,
    reports:Object.fromEntries(Object.entries(loaded).map(([k,v])=>[k,v.bytes.toString('utf8')])),
    qualification:projectLabelledQualification(qualification.report),inputs:sourceInputs,toolHashes,assets,blobs};
  validateLabelledCache(calibration);await verifyLabelledSourceHashes(toolHashes);
  for(const[p,h]of Object.entries(toolHashes))await save('tool-sources/'+p,canonical(await readFile(path.join(root,p))));
  const bytes=Buffer.from(JSON.stringify(calibration)+'\n');
  assert.ok(!/(?:[A-Z]:(?:\\\\|\\)Users|JoannesVermorel|ATHENA|Studio)/.test(bytes.toString('utf8')),'Private path in portable evidence.');
  const compressed=gzipSync(bytes,{level:9});await save('calibration.json',bytes);await save('calibration.json.gz',compressed);
  const r={completed:true,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',
    sourceReports:labelledCacheReports,qualification:calibration.qualification.source,
    compressedSha256:sha256(compressed),decodedSha256:sha256(bytes),compressedBytes:compressed.length,decodedBytes:bytes.length,
    assets:Object.keys(assets).length,blobs:Object.keys(blobs).length,inputs:Object.keys(sourceInputs).length,toolHashes,artifacts};
  await publish(r);console.log(JSON.stringify({prepared:path.relative(root,output),...r,artifacts:undefined,toolHashes:undefined}));
}catch(error){process.exitCode=2;console.error(error.stack);await publish({completed:false,converterInvoked:false,
  approvedImagePolicy:false,error:error.message.replaceAll(root,'<repo>'),artifacts});}
