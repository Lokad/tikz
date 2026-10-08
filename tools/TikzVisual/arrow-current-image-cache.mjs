// Portable historical qualification is evidence; every admission candidate is fresh.
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {root,sha256} from './shape-oracle-bundle.mjs';
import {arrowCanonical} from './arrow-native-contract.mjs';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {arrowCacheBounds,arrowCachePath} from './arrow-image-cache-codec.mjs';
import {arrowImageCacheSha256} from './arrow-image-cache.mjs';
import {arrowMeetImageCacheSha256} from './arrow-meet-image-cache-pin.mjs';
import {arrowPublicImageCacheSha256,loadArrowPublicImageCache,verifyArrowPublicHistoricalNumeric} from './arrow-public-image-cache.mjs';
import {arrowCurrentTrialPending,arrowCurrentNumericParity} from './arrow-current-trial-contract.mjs';
import {validateArrowQualifiedCurrentTrial} from './arrow-qualified-current-reader.mjs';
import {arrowCurrentCacheBounds,decodeArrowCurrentArchive,arrowCurrentExternalRead} from './arrow-current-image-cache-codec.mjs';
import {arrowCurrentImageCacheFile,arrowCurrentImageCacheSha256,arrowCurrentImageCacheDecodedSha256,
  arrowCurrentImageQualification,arrowCurrentImageManifestSha256,arrowCurrentImageProofs} from './arrow-current-image-cache-pin.mjs';

export {arrowCurrentImageCacheFile,arrowCurrentImageCacheSha256,arrowCurrentImageCacheDecodedSha256,arrowCurrentImageProofs};
const sort=entries=>[...entries].sort(([a],[b])=>a<b?-1:a>b?1:0);
const encode=value=>Buffer.from(JSON.stringify(value)+'\n');
const baselineFields=['primaryRegions','pdfRegions','momentRegions','exactRegions','fullPages','panels','recapturedPrimaryImages','recapturedPdfImages'];
const pdfFields=['views','measurements','moments','fullPages','images','deltas','panels','focusPanels'];
const normalizeLog=bytes=>bytes.toString().replaceAll('\\','/').replace(/artifacts\/arrow-current-(trials|checks)\/run-[a-f0-9-]+/g,'artifacts/arrow-current-$1/<owned>');

export function arrowCurrentImageCacheMetadata(){
  return{schemaVersion:1,comparisonKind:'portable-qualified-current-arrow-combined-trial',completed:true,
    converterInvoked:false,nativeToolInvoked:false,browserInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',
    qualification:arrowCurrentImageQualification,proofs:arrowCurrentImageProofs,
    dependencies:{publicSha256:arrowPublicImageCacheSha256,meetSha256:arrowMeetImageCacheSha256,baseSha256:arrowImageCacheSha256},
    sourceContract:'captured-production/current-comparison-tools-and-fixtures',pendingGates:['immutable-fixed-family-image-admission']};
}

export function validateArrowCurrentImageArchive(cache){
  const{chunkBytes,logicalAssets,logicalBlobs,assets,blobs,...metadata}=cache.header;
  assertNativeEqual(metadata,arrowCurrentImageCacheMetadata(),'Changed combined qualification identity.');
  const reports={};
  for(const[role,pin]of Object.entries(arrowCurrentImageProofs)){
    const bytes=cache.get(pin.file);assert.ok(bytes.length<= (role==='freshManifest'?5000000:200000));
    assert.equal(sha256(bytes),pin.sha256,'Changed combined qualification proof: '+role);
    if(!role.endsWith('Helper'))reports[role]=JSON.parse(bytes);
  }
  const{producer,reader,freshReader,freshProducer,fresh,postcommit,freshManifest,interruption}=reports;
  for(const report of [producer,reader,freshReader,freshProducer,fresh,postcommit]){
    assert.equal(report.completed,true);assertNativeEqual([report.approvedImagePolicy,report.imageConformanceClaim,report.imageAdmission],[false,false,'pending']);
  }
  assertNativeEqual([interruption.completed,interruption.phase],[false,'interrupted-before-qualification']);
  const manifestBytes=cache.get('manifest.json');assert.equal(sha256(manifestBytes),arrowCurrentImageManifestSha256);
  const manifest=JSON.parse(manifestBytes);assert.equal(manifest.schemaVersion,1);assert.equal(Object.keys(manifest.artifacts).length,18214);
  assertNativeEqual(producer.manifest,{file:'manifest.json',sha256:arrowCurrentImageManifestSha256,files:18214});
  assertNativeEqual(producer.pendingGates,arrowCurrentTrialPending);assert.equal(Object.keys(producer.sourceHashes).length,117);
  const expected={...manifest.artifacts,'manifest.json':arrowCurrentImageManifestSha256};
  for(const pin of Object.values(arrowCurrentImageProofs))expected[pin.file]=pin.sha256;
  for(const[role,check]of [['reader',reader],['fresh-reader',freshReader]]){
    assertNativeEqual([check.phase,check.comparisonKind],['complete','independent-current-public-arrow-combined-check']);
    assertNativeEqual([check.converterInvoked,check.nativeToolInvoked],[true,false]);assertNativeEqual(check.renderer,producer.renderer);
    assertNativeEqual(check.sourceHashes,producer.sourceHashes);
    assertNativeEqual(baselineFields.map(k=>check.baseline[k]),[17928,24000,24000,24192,384,2136,1368,1248]);
    assertNativeEqual(check.baseline.combined,JSON.parse(cache.get('baseline/combined.json')));
    assertNativeEqual(check.primary,{views:306,measurements:39528,images:3057,deltas:210});
    assertNativeEqual(pdfFields.map(k=>check.pdf[k]),[396,100908,100908,792,7228,568,4356,2080]);assertNativeEqual(check.pdf.summary,producer.pdfSummary);
    assert.equal(check.controls.length,40);assert.ok(check.controls.every(c=>c.passed===true));
    const moments=check.controls.filter(c=>Object.hasOwn(c,'axis'));assertNativeEqual(moments.map(c=>c.axis),['mass','x','y']);
    assert.ok(moments.every(c=>c.structurallyAccepted===true&&c.unchangedMassAndCoverage===(c.axis!=='mass')&&c.rejection==='Changed decoded PDF RGB '+(c.axis==='mass'?'mass.':'moments.')));
    assert.equal(Object.keys(check.artifacts).length,311);
    for(const[file,hash]of Object.entries(check.artifacts)){arrowCachePath(file);expected['proofs/'+role+'/'+file]=hash;}
  }
  assert.equal(reader.inputReport,arrowCurrentImageProofs.producer.origin);assert.equal(reader.inputReportSha256,arrowCurrentImageProofs.producer.sha256);
  assert.equal(freshReader.inputReport,arrowCurrentImageProofs.freshProducer.origin);assert.equal(freshReader.inputReportSha256,arrowCurrentImageProofs.freshProducer.sha256);
  assertNativeEqual({...producer,manifest:{...producer.manifest,sha256:null}},{...freshProducer,manifest:{...freshProducer.manifest,sha256:null}});
  assertNativeEqual({...manifest,artifacts:{...manifest.artifacts,'baseline/numeric/report.json':null,'numeric-command.log':null}},
    {...freshManifest,artifacts:{...freshManifest.artifacts,'baseline/numeric/report.json':null,'numeric-command.log':null}});
  assert.equal(freshProducer.manifest.sha256,arrowCurrentImageProofs.freshManifest.sha256);
  const producerDifferences=[];
  for(const file of Object.keys(manifest.artifacts)){
    const original=cache.get(file);assert.equal(sha256(original),manifest.artifacts[file]);
    if(manifest.artifacts[file]===freshManifest.artifacts[file])continue;
    assert.ok(['numeric-command.log','baseline/numeric/report.json'].includes(file));
    expected['proofs/fresh-producer/'+file]=freshManifest.artifacts[file];const current=cache.get('proofs/fresh-producer/'+file);
    const d={file,reason:file==='numeric-command.log'?'Owned numeric command output directory only':'Current build assembly identity only',rootSha256:sha256(original),freshSha256:sha256(current)};
    if(file==='numeric-command.log')assert.equal(normalizeLog(original),normalizeLog(current));
    else{const a=JSON.parse(original),b=JSON.parse(current);arrowCurrentNumericParity(a,b);Object.assign(d,{rootAssemblySha256:a.assemblySha256,freshAssemblySha256:b.assemblySha256});}
    producerDifferences.push(d);
  }
  assert.equal(producerDifferences.length,2);assertNativeEqual(producerDifferences,fresh.differences);
  const normalizeReader=r=>({...r,inputReport:null,inputReportSha256:null,numericBuildIdentity:null,artifacts:{...r.artifacts,'numeric/report.json':null,'numeric-command.log':null}});
  assertNativeEqual(normalizeReader(reader),normalizeReader(freshReader));
  const readerDifferences=[];
  for(const[file,hash]of Object.entries(reader.artifacts)){
    const a=cache.get('proofs/reader/'+file),b=cache.get('proofs/fresh-reader/'+file);
    assert.equal(sha256(a),hash);assert.equal(sha256(b),freshReader.artifacts[file]);
    if(a.equals(b))continue;assert.ok(['numeric-command.log','numeric/report.json'].includes(file));
    if(file==='numeric-command.log')assert.equal(normalizeLog(a),normalizeLog(b));else arrowCurrentNumericParity(JSON.parse(a),JSON.parse(b));
    readerDifferences.push({file,rootSha256:sha256(a),freshSha256:sha256(b),reason:file==='numeric-command.log'?'Owned numeric command output directory only':'Current build assembly identity only'});
  }
  assert.equal(readerDifferences.length,2);assertNativeEqual(readerDifferences,fresh.readerDifferences);
  assertNativeEqual(logicalAssets,Object.fromEntries(sort(Object.entries(expected))),'Missing or replaced qualified combined artifact.');
  assert.equal(cache.files.size,18849);
  assert.equal(Object.keys(manifest.artifacts).filter(file=>file.endsWith('.png')).length,12949);
  assert.equal([...cache.files.keys()].filter(file=>file.endsWith('.png')).length,12997);
  assertNativeEqual([fresh.phase,fresh.expectedTree,fresh.trackedFiles,fresh.ordinaryTests,fresh.equalArtifacts,fresh.equalPngs,fresh.artifactCount,fresh.rootArtifactBytes,fresh.sourceGuards,fresh.exactReaderArtifacts],
    ['complete',arrowCurrentImageQualification.tree,1482,389,18212,12949,18214,969870663,117,309]);
  assertNativeEqual([fresh.originalProducerSha256,fresh.originalReaderSha256,fresh.freshProducer.sha256,fresh.freshReader.sha256],
    [arrowCurrentImageProofs.producer.sha256,arrowCurrentImageProofs.reader.sha256,arrowCurrentImageProofs.freshProducer.sha256,arrowCurrentImageProofs.freshReader.sha256]);
  assert.equal(fresh.verificationSourceSha256,arrowCurrentImageProofs.freshHelper.sha256);
  assertNativeEqual(fresh.excludedBeforeRestore,['PLAN.md','artifacts','external','tools/TikzVisual/node_modules']);
  assertNativeEqual(fresh.nativeExecutablesAbsent,['latex','pdflatex','lualatex','xelatex','dvisvgm','dvitype','pdftoppm','pdftocairo']);
  assertNativeEqual([postcommit.commit,postcommit.tree,postcommit.trackedWorktreeClean,postcommit.planIgnoredAndUntracked,postcommit.freshGitBlobsExact],
    [arrowCurrentImageQualification.commit,arrowCurrentImageQualification.tree,true,true,1482]);
  assert.equal(postcommit.auditSourceSha256,arrowCurrentImageProofs.auditHelper.sha256);
  for(const r of [fresh,postcommit]){
    assertNativeEqual(r.baseline,reader.baseline);assertNativeEqual(r.primary,reader.primary);assertNativeEqual(r.pdf,reader.pdf);assertNativeEqual(r.controls,reader.controls);
    assertNativeEqual(r.differences,producerDifferences);assertNativeEqual(r.readerDifferences,readerDifferences);
    assertNativeEqual(r.rootNumericBuildIdentity,reader.numericBuildIdentity);assertNativeEqual(r.freshNumericBuildIdentity,freshReader.numericBuildIdentity);
  }
  return{reports,manifest,manifestBytes};
}

export async function verifyArrowCurrentImageSources(cache,readCurrent=readFile){
  for(const[file,hash]of Object.entries(cache.reports.producer.sourceHashes)){
    assert.equal(sha256(cache.get('source-captures/'+file)),hash,'Changed captured combined comparison source: '+file);
    assert.equal(sha256(arrowCanonical(await readCurrent(path.join(root,file)))),hash,'Changed current combined comparison source: '+file);
  }
  const policies=[];
  for(const prefix of ['baseline/numeric/','proofs/reader/numeric/','proofs/fresh-reader/numeric/']){
    policies.push(await verifyArrowPublicHistoricalNumeric(JSON.parse(cache.get(prefix+'report.json')),file=>cache.get(prefix+file),readCurrent));
  }
  const oldNumeric=JSON.parse(cache.get('baseline/numeric/report.json')),freshNumeric=JSON.parse(cache.get('proofs/fresh-producer/baseline/numeric/report.json'));
  assertNativeEqual(arrowCurrentNumericParity(oldNumeric,JSON.parse(cache.get('proofs/reader/numeric/report.json'))),cache.reports.reader.numericBuildIdentity);
  assertNativeEqual(arrowCurrentNumericParity(freshNumeric,JSON.parse(cache.get('proofs/fresh-reader/numeric/report.json'))),cache.reports.freshReader.numericBuildIdentity);
  assertNativeEqual(policies[0],policies[1]);assertNativeEqual(policies[0],policies[2]);return policies[0];
}

export function decodeArrowCurrentImageCache(compressed,publicCache){
  assert.ok(Buffer.isBuffer(compressed)&&compressed.length>0&&compressed.length<=arrowCurrentCacheBounds.compressed);
  assert.equal(sha256(compressed),arrowCurrentImageCacheSha256,'Changed combined qualification cache.');
  const bytes=gunzipSync(compressed,{maxOutputLength:arrowCacheBounds.decoded});
  assert.equal(sha256(bytes),arrowCurrentImageCacheDecodedSha256,'Changed decoded combined qualification cache.');
  const cache=decodeArrowCurrentArchive(bytes,arrowCurrentExternalRead(publicCache));
  return{...cache,...validateArrowCurrentImageArchive(cache),compressed,publicCache};
}

export async function buildArrowCurrentImageModel(cache){
  const assets=new Map(Object.keys(cache.manifest.artifacts).map(file=>[file,cache.get(file)]));
  return validateArrowQualifiedCurrentTrial(cache.get('report.json'),cache.manifestBytes,assets,cache.publicCache.native);
}

export async function loadArrowCurrentImageCache(readCurrent=readFile){
  const publicCache=await loadArrowPublicImageCache(readCurrent),file=path.join(root,arrowCurrentImageCacheFile);
  if(readCurrent===readFile)assert.ok((await stat(file)).size<=arrowCurrentCacheBounds.compressed);
  const cache=decodeArrowCurrentImageCache(await readCurrent(file),publicCache);
  const sourcePolicy=await verifyArrowCurrentImageSources(cache,readCurrent),model=await buildArrowCurrentImageModel(cache);
  return{...cache,sourcePolicy,model};
}
