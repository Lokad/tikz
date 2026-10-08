// Acceptance gap: portable, lossless ownership of the six already-qualified native bundles.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {root,writeArtifact,sha256} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport,calcEqual} from './calc-saved-images.mjs';
import {loadQualifiedPathLabelPrimary} from './path-label-qualified-primary.mjs';
import {encodePathLabelCache,decodePathLabelCache,pathLabelCacheBounds} from './path-label-cache-codec.mjs';

assert.equal(process.argv.length,9,'Usage: node tools/TikzVisual/prepare-path-label-cache.mjs <placement|interactions> <primary-calibration> <primary-check> <PDF-calibration> <PDF-check> <text-sensitivity> <text-check>');
const fixture=process.argv[2],roles=['path-label-native-primary-calibration','path-label-independent-primary-check','path-label-native-pdf-calibration',
 'path-label-independent-pdf-check','path-label-complete-text-sensitivity','path-label-independent-text-check'];
const output=path.join(root,'artifacts/path-label-cache/run-'+randomUUID()),artifacts={},save=(p,b)=>writeArtifact(output,p,b,artifacts);let phase='inputs';
async function publish(completed,extra={}){const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'path-label-portable-cache-preparation',completed,phase:completed?'complete':phase,
 converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',fixture,artifacts,...extra},null,2)+'\n');
 await writeArtifact(output,'report.json',bytes);console.log(JSON.stringify({completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));}
await publish(false);
try{
 const args=process.argv.slice(3),bundles=[];for(let i=0;i<roles.length;i++)bundles.push(await loadCalcSavedReport(path.resolve(root,args[i]),roles[i]));
 const [primary,primaryCheck,pdf,pdfCheck,text,textCheck]=bundles;
 const qualified=await loadQualifiedPathLabelPrimary(args[0],args[1]);assert.equal(qualified.calibration.sha256,primary.sha256);assert.equal(primary.report.fixture,fixture);
 assert.equal(pdf.report.fixture,fixture);assert.equal(text.report.fixture,fixture);
 assert.equal(pdf.report.inputs.primarySha256,primary.sha256);assert.equal(pdf.report.inputs.checkedSha256,primaryCheck.sha256);assert.equal(pdfCheck.report.inputSha256,pdf.sha256);assert.equal(pdfCheck.report.sourceRecaptures,12);
 assert.equal(text.report.inputs.calibrationSha256,primary.sha256);assert.equal(text.report.inputs.checkedSha256,primaryCheck.sha256);assert.equal(textCheck.report.inputSha256,text.sha256);assert.equal(textCheck.report.sourceRecaptures,text.report.coverage.views);
 for(const bundle of bundles){assert.equal(bundle.report.converterInvoked,false);assert.equal(bundle.report.nativeToolInvoked,false);
  for(const[f,b]of bundle.files)if(f.startsWith('source-captures/'))assert.ok(b.equals(await readFile(path.join(root,f.slice(16)))),'Changed frozen evidence dependency: '+f);}
 const files=new Map(),reports=[];
 for(let i=0;i<bundles.length;i++){
  const file=path.relative(root,path.resolve(root,args[i])).split(path.sep).join('/');assert.match(file,/^artifacts\/path-label-[a-z-]+\/run-[a-f0-9-]+\/report\.json$/,'Cache input must be a repository-owned artifact report.');
  const prefix=path.posix.dirname(file),bundle=bundles[i];reports.push({role:roles[i],file,sha256:bundle.sha256});files.set(file,bundle.bytes);
  for(const[f,b]of bundle.files){const target=prefix+'/'+f;if(files.has(target))assert.ok(files.get(target).equals(b));else files.set(target,b);}
 }
 phase='lossless-archive';const bytes=encodePathLabelCache(files,fixture),compressed=gzipSync(bytes,{level:9});assert.ok(compressed.length<=pathLabelCacheBounds.compressed);
 const decoded=decodePathLabelCache(gunzipSync(compressed,{maxOutputLength:pathLabelCacheBounds.decoded}),fixture);
 calcEqual([...decoded.files.keys()],[...files.keys()].sort());for(const[f,b]of files)assert.ok(decoded.files.get(f).equals(b),'Archive roundtrip changed bytes.');
 assert.ok(encodePathLabelCache(new Map([...decoded.files].reverse()),fixture).equals(bytes),'Archive order is not deterministic.');
 await save('evidence.cache.gz',compressed);
 const manifest={schemaVersion:1,fixture,reports,compressedSha256:sha256(compressed),decodedSha256:sha256(bytes),compressedBytes:compressed.length,
  decodedBytes:bytes.length,logicalFiles:decoded.files.size,uniqueBlobs:decoded.blobs.size,logicalBytes:decoded.logicalBytes,converterInvoked:false,imageConformanceClaim:false};
 await save('manifest.json',JSON.stringify(manifest,null,2)+'\n');
 for(const f of['prepare-path-label-cache.mjs','path-label-cache-codec.mjs','calc-trial-cache-codec.mjs'])await save('source-captures/tools/TikzVisual/'+f,await readFile(path.join(root,'tools/TikzVisual/'+f)));
 await publish(true,{manifest,scope:'Byte-preserving native evidence archive. Fresh-export materialization and final feature acceptance remain separate.'});
}catch(error){await save('failure.log',String(error.stack??error).replaceAll(root,'<repo>'));await publish(false,{error:error.message});process.exitCode=1;}
