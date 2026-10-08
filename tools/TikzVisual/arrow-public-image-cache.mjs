// Frozen public controls are qualification evidence, never candidate expectations.
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {root,sha256} from './shape-oracle-bundle.mjs';
import {arrowCanonical} from './arrow-native-contract.mjs';
import {arrowCacheBounds,arrowCachePath} from './arrow-image-cache-codec.mjs';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {loadArrowMeetImageCache,arrowMeetImageCacheSha256,arrowMeetImageCacheDecodedSha256} from './arrow-meet-image-cache.mjs';
import {arrowImageCacheSha256,arrowImageCacheDecodedSha256} from './arrow-image-cache.mjs';
import {arrowPublicMeetBindings} from './arrow-public-meet-contract.mjs';
import {validateArrowPublicMeetBaselineBundle} from './arrow-public-meet-reader.mjs';
import {arrowPublicControlReports} from './arrow-public-controls-pin.mjs';
import {arrowPublicPdfReports} from './arrow-public-pdf-controls-pin.mjs';
import {arrowPublicPrimaryControlPlan,summarizeArrowPublicPrimaryControls} from './arrow-public-primary-controls.mjs';
import {arrowPublicPdfControlPlan,arrowPublicPdfFocus,arrowPublicPdfIndex,summarizeArrowPublicPdfControls} from './arrow-public-pdf-controls.mjs';
import {arrowPublicCacheBounds,decodeArrowPublicArchive,arrowPublicExternalRead} from './arrow-public-image-cache-codec.mjs';
import {arrowPublicImageCacheFile,arrowPublicImageCacheSha256,arrowPublicImageCacheDecodedSha256,arrowPublicImageQualification,
  arrowPublicImageManifestSha256,arrowPublicImageReports} from './arrow-public-image-cache-pin.mjs';

export {arrowPublicImageCacheFile,arrowPublicImageCacheSha256,arrowPublicImageCacheDecodedSha256,arrowPublicImageReports};
const sort=entries=>[...entries].sort(([a],[b])=>a<b?-1:a>b?1:0);
const primaryCounts={views:306,measurements:39528,images:3057,deltas:210};
const pdfFields=['views','measurements','moments','fullPages','images','deltas','panels','focusPanels'];
const pdfCounts=[396,100908,100908,792,7228,568,4356,2080];

export function arrowPublicImageCacheMetadata(){
  return{schemaVersion:1,comparisonKind:'portable-qualified-public-arrow-controls',completed:true,
    converterInvoked:false,nativeToolInvoked:false,browserInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',
    qualification:arrowPublicImageQualification,reports:arrowPublicImageReports,
    native:{baseSha256:arrowImageCacheSha256,baseDecodedSha256:arrowImageCacheDecodedSha256,
      meetSha256:arrowMeetImageCacheSha256,meetDecodedSha256:arrowMeetImageCacheDecodedSha256},
    sourceContract:'captured-production/current-comparison-tools-and-fixtures',pendingGates:['public-combined-admission']};
}

export function validateArrowPublicImageArchive(cache){
  const{chunkBytes,logicalAssets,logicalBlobs,assets,blobs,...metadata}=cache.header;
  assertNativeEqual(metadata,arrowPublicImageCacheMetadata(),'Changed public qualification identity.');
  const reports={};
  for(const[role,pin]of Object.entries(arrowPublicImageReports)){
    const bytes=cache.get(pin.file);assert.ok(bytes.length<=100000);assert.equal(sha256(bytes),pin.sha256,'Changed public qualification proof: '+role);
    if(!role.endsWith('Helper')){reports[role]=JSON.parse(bytes);assert.equal(reports[role].completed,true);}
  }
  const{producer,reader,freshReader,fresh,postcommit,firstMoments}=reports;
  const manifestBytes=cache.get('manifest.json');assert.equal(sha256(manifestBytes),arrowPublicImageManifestSha256);
  const manifest=JSON.parse(manifestBytes);assert.equal(manifest.schemaVersion,1);assert.equal(Object.keys(manifest.artifacts).length,18427);
  assertNativeEqual(producer.manifest,{file:'manifest.json',sha256:arrowPublicImageManifestSha256,files:18427});
  const expected={...manifest.artifacts,'manifest.json':arrowPublicImageManifestSha256};for(const pin of Object.values(arrowPublicImageReports))expected[pin.file]=pin.sha256;
  assertNativeEqual(logicalAssets,Object.fromEntries(sort(Object.entries(expected))),'Missing or replaced qualified public artifact.');
  assert.equal(cache.files.size,18437);assert.equal(Object.keys(producer.sourceHashes).length,112);
  for(const[name,hash]of Object.entries(producer.sourceHashes))assert.equal(sha256(cache.get('source-captures/'+name)),hash);
  for(const check of [reader,freshReader]){
    assertNativeEqual([check.phase,check.comparisonKind],['complete','independent-public-arrow-PDF-control-check']);
    assertNativeEqual([check.converterInvoked,check.nativeToolInvoked,check.approvedImagePolicy,check.imageConformanceClaim,check.imageAdmission],[false,false,false,false,'pending']);
    assert.equal(check.inputReportSha256,arrowPublicImageReports.producer.sha256);assertNativeEqual(check.primary,primaryCounts);
    assertNativeEqual(pdfFields.map(k=>check[k]),pdfCounts);assertNativeEqual(check.summary,producer.summary);assertNativeEqual(check.renderer,producer.renderer);
    assert.equal(check.controls.length,25);assert.ok(check.controls.every(c=>c.passed===true&&typeof c.rejection==='string'&&c.rejection.length<=500));
  }
  assert.equal(reader.inputReport,arrowPublicImageReports.producer.origin);assert.equal(freshReader.inputReport,fresh.freshProducer.report);
  const withoutPath=value=>{const{inputReport,...body}=value;return body;};assertNativeEqual(withoutPath(reader),withoutPath(freshReader));
  assert.equal(fresh.phase,'complete');assert.equal(fresh.expectedTree,arrowPublicImageQualification.tree);
  assertNativeEqual([fresh.trackedFiles,fresh.ordinaryTests,fresh.equalArtifacts,fresh.equalPngs,fresh.equalArtifactBytes,fresh.sourceGuards,fresh.checkerSourceGuards],
    [1470,389,18427,12949,944421184,112,1]);
  assert.equal(fresh.originalProducerSha256,arrowPublicImageReports.producer.sha256);assert.equal(fresh.freshProducer.sha256,arrowPublicImageReports.producer.sha256);
  assert.equal(fresh.originalReaderSha256,arrowPublicImageReports.reader.sha256);assert.equal(fresh.freshReader.sha256,arrowPublicImageReports.freshReader.sha256);
  assert.equal(fresh.verificationSourceSha256,arrowPublicImageReports.freshHelper.sha256);assertNativeEqual(fresh.controls,reader.controls);
  assertNativeEqual(fresh.excludedBeforeRestore,['PLAN.md','artifacts','external','tools/TikzVisual/node_modules']);
  assertNativeEqual(fresh.nativeExecutablesAbsent,['latex','pdflatex','lualatex','xelatex','dvisvgm','dvitype','pdftoppm','pdftocairo']);
  assertNativeEqual([postcommit.commit,postcommit.tree,postcommit.trackedWorktreeClean,postcommit.planIgnoredAndUntracked],
    [arrowPublicImageQualification.commit,arrowPublicImageQualification.tree,true,true]);
  assertNativeEqual(postcommit.producer,{report:arrowPublicImageReports.producer.origin,sha256:arrowPublicImageReports.producer.sha256});
  assertNativeEqual(postcommit.reader,{report:arrowPublicImageReports.reader.origin,sha256:arrowPublicImageReports.reader.sha256});
  assertNativeEqual(postcommit.fresh,{receipt:arrowPublicImageReports.fresh.origin,sha256:arrowPublicImageReports.fresh.sha256});
  assert.equal(postcommit.auditSourceSha256,arrowPublicImageReports.auditHelper.sha256);assertNativeEqual(postcommit.controls,reader.controls);
  assertNativeEqual([postcommit.cacheSha256,postcommit.baseCacheSha256],[arrowMeetImageCacheSha256,arrowImageCacheSha256]);
  assert.equal(firstMoments.phase,'complete');assert.equal(firstMoments.inputReportSha256,arrowPublicImageReports.producer.sha256);
  assert.equal(firstMoments.sourceSha256,arrowPublicImageReports.firstMomentsHelper.sha256);
  assertNativeEqual(firstMoments.controls.map(c=>c.coordinate),['x','y']);
  assert.ok(firstMoments.controls.every(c=>c.structurallyAccepted===true&&c.unchangedImages===true&&c.unchangedMassAndCoverage===true&&c.independentlyDecodedRejection==='Changed decoded PDF RGB first moment.'));
  return{reports,manifest};
}

// Saved production sources establish historical provenance. Current numeric tools
// and fixtures stay guarded; fresh candidates must record their own build identity.
export async function verifyArrowPublicHistoricalNumeric(n,readCaptured,readCurrent=readFile){
  assertNativeEqual([n.completed,n.passed,n.phase,n.converterInvoked,n.numericConformanceClaim,n.approvedImagePolicy,n.imageConformanceClaim],
    [true,true,'complete',true,true,false,false]);assert.equal(n.checks,12062);assert.equal(n.cases.length,6);
  assert.ok(n.cases.every(c=>c.converted&&c.passed&&c.publicTraceParity));
  assert.ok(n.converterAssemblyReferences.length>0&&n.converterAssemblyReferences.every(s=>s==='System'||s.startsWith('System.')));
  const historicalProduction=[],currentGuards=[];assert.equal(Object.keys(n.sources).length,66);
  for(const[file,hash]of Object.entries(n.sources)){
    arrowCachePath(file);assert.equal(sha256(readCaptured('source-captures/'+file)),hash,'Changed historical numeric source: '+file);
    if(file.startsWith('src/Lokad.TikZ/'))historicalProduction.push(file);
    else{assert.equal(sha256(arrowCanonical(await readCurrent(path.join(root,file)))),hash,'Changed current numeric comparison source: '+file);currentGuards.push(file);}
  }
  assertNativeEqual([historicalProduction.length,currentGuards.length],[58,8]);
  for(const[file,hash]of Object.entries(n.artifacts)){arrowCachePath(file);assert.equal(sha256(readCaptured(file)),hash);}
  for(const[file,hash]of Object.entries(n.inputs)){
    arrowCachePath(file);const captured=readCaptured('input-captures/'+file);assert.equal(sha256(captured),hash);
    const current=await readCurrent(path.join(root,file));assert.ok(current.equals(captured)||arrowCanonical(current).equals(captured),'Changed current numeric fixture: '+file);
  }
  return{historicalProduction,currentGuards};
}

export async function verifyArrowPublicImageSources(cache,readCurrent=readFile){
  const report=cache.reports.producer;
  for(const[file,hash]of Object.entries(report.sourceHashes))assert.equal(sha256(arrowCanonical(await readCurrent(path.join(root,file)))),hash,'Changed public comparison source: '+file);
  for(const[file,hash]of Object.entries(cache.reports.reader.ownSources))assert.equal(sha256(arrowCanonical(await readCurrent(path.join(root,file)))),hash,'Changed qualified independent checker: '+file);
  const numeric=JSON.parse(cache.get('primary/baseline/numeric/report.json'));
  return verifyArrowPublicHistoricalNumeric(numeric,file=>cache.get('primary/baseline/numeric/'+file),readCurrent);
}

export function buildArrowPublicImageModels(cache,e){
  const json=file=>JSON.parse(cache.get(file));
  // The fixed outer manifest authenticates all nested historical manifests.
  for(const[role,pin]of Object.entries(arrowPublicPdfReports))assert.equal(sha256(cache.get(pin.file)),pin.sha256,'Changed nested primary proof: '+role);
  for(const[role,pin]of Object.entries(arrowPublicControlReports))assert.equal(sha256(cache.get('primary/'+pin.file)),pin.sha256,'Changed nested baseline proof: '+role);
  const baselineReport=json('primary/baseline/report.json'),baselineManifestBytes=cache.get('primary/baseline/manifest.json'),baselineManifest=JSON.parse(baselineManifestBytes);
  const baselineAssets=new Map(Object.keys(baselineManifest.artifacts).map(file=>[file,cache.get('primary/baseline/'+file)]));
  const sources=new Map(Object.entries(baselineReport.sourceHashes).map(([file,hash])=>[file,{bytes:cache.get('primary/baseline/source-captures/'+file),sha256:hash}]));
  const baseline=validateArrowPublicMeetBaselineBundle(cache.get('primary/baseline/report.json'),baselineManifestBytes,baselineAssets,e,sources);
  assert.equal(baseline.combined.passed,true);
  const input={bundle:baseline};assertNativeEqual(json('native-limit-bindings.json'),arrowPublicMeetBindings(e));
  const primaryRecords=arrowPublicPrimaryControlPlan().map(view=>{
    const record=json('primary/views/'+view.id+'/record.json');assertNativeEqual(record.view,view);
    return{...record,numbers:json('primary/'+record.files.numbers)};
  });
  const primary=summarizeArrowPublicPrimaryControls(e,primaryRecords);assertNativeEqual(primary.summary,json('primary/report.json').summary);
  for(const row of primary.evaluations)assertNativeEqual(json('primary/views/'+row.view.id+'/gates.json'),row);
  const pdfRecords=arrowPublicPdfControlPlan().map(view=>{
    const record=json('views/'+view.id+'/record.json');assertNativeEqual(record.view,view);
    return{...record,source:json(record.files.source.numbers),scene:json(record.files.scene.numbers)};
  });
  const pdf=summarizeArrowPublicPdfControls(e,pdfRecords);assertNativeEqual(pdf.summary,cache.reports.producer.summary);
  for(const row of pdf.evaluations)assertNativeEqual(json('views/'+row.view.id+'/gates.json'),row);
  const focus=arrowPublicPdfFocus(e,input,pdfRecords);assertNativeEqual(json('focus.json'),focus);
  assert.equal(cache.get('index.html').toString(),arrowPublicPdfIndex(pdf.summary,pdfRecords,focus));
  return{baseline,input,primaryRecords,primary,pdfRecords,pdf,focus};
}

export async function decodeArrowPublicImageCache(compressed,e,readCurrent=readFile){
  assert.ok(Buffer.isBuffer(compressed)&&compressed.length>0&&compressed.length<=arrowPublicCacheBounds.compressed);
  assert.equal(sha256(compressed),arrowPublicImageCacheSha256,'Changed pinned public qualification archive.');
  const bytes=gunzipSync(compressed,{maxOutputLength:arrowCacheBounds.decoded});assert.equal(sha256(bytes),arrowPublicImageCacheDecodedSha256);
  const cache=decodeArrowPublicArchive(bytes,arrowPublicExternalRead(e));Object.assign(cache,validateArrowPublicImageArchive(cache));
  const sourcePolicy=await verifyArrowPublicImageSources(cache,readCurrent);return{...cache,...buildArrowPublicImageModels(cache,e),sourcePolicy,compressed,native:e};
}
export async function loadArrowPublicImageCache(readCurrent=readFile){
  const file=path.join(root,arrowPublicImageCacheFile);if(readCurrent===readFile)assert.ok((await stat(file)).size<=arrowPublicCacheBounds.compressed);
  const e=await loadArrowMeetImageCache(readCurrent);return decodeArrowPublicImageCache(await readCurrent(file),e,readCurrent);
}
