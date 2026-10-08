import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {root,sha256,outputPath} from './shape-oracle-bundle.mjs';
import {arrowCachePath} from './arrow-image-cache-codec.mjs';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {loadArrowPublicPrimaryOwned,validateArrowPublicPrimaryBundle} from './arrow-public-primary-reader.mjs';
import {arrowPublicControlSources} from './arrow-public-controls-contract.mjs';
import {arrowPublicPdfQualification,arrowPublicPdfReports} from './arrow-public-pdf-controls-pin.mjs';

export {arrowPublicPdfQualification,arrowPublicPdfReports};
export const arrowPublicPdfPending=['independent-public-PDF-control-reader','public-combined-admission'];
export const arrowPublicPdfSourceEntries=['trial-arrow-pdf-controls.mjs','arrow-public-pdf-contract.mjs','arrow-public-pdf-primary-binding.mjs'];
export const arrowPublicPdfSources=e=>arrowPublicControlSources(e,arrowPublicPdfSourceEntries);

export async function loadArrowPublicPdfInput(e,readOverride){
  const files=new Map(),reports={};
  for(const [role,pin]of Object.entries(arrowPublicPdfReports)){
    let bytes;
    if(readOverride)bytes=await readOverride(pin.file);
    else{const origin=path.join(root,pin.origin),full=await outputPath(path.dirname(origin),path.basename(origin));assert.ok((await stat(full)).size<=100000);bytes=await readFile(full);}
    assert.ok(Buffer.isBuffer(bytes)&&bytes.length<=100000);assert.equal(sha256(bytes),pin.sha256,'Changed public primary qualification: '+role);
    reports[role]=JSON.parse(bytes);assert.equal(reports[role].completed,true);files.set(pin.file,bytes);
  }
  let primary;
  if(readOverride){
    const mb=await readOverride('primary/manifest.json');assert.ok(Buffer.isBuffer(mb)&&mb.length<=3000000);const manifest=JSON.parse(mb),assets=new Map();
    assert.equal(Object.keys(manifest.artifacts).length,8689);let total=0;
    for(const name of Object.keys(manifest.artifacts)){arrowCachePath(name);const bytes=await readOverride('primary/'+name);assert.ok(Buffer.isBuffer(bytes)&&bytes.length<=64000000);total+=bytes.length;assert.ok(total<=512000000);assets.set(name,bytes);}
    primary=await validateArrowPublicPrimaryBundle(files.get('primary/report.json'),mb,assets,e);primary={...primary,reportBytes:files.get('primary/report.json'),manifestBytes:mb};
  }else primary=await loadArrowPublicPrimaryOwned(arrowPublicPdfReports.producer.origin,e);
  files.set('primary/manifest.json',primary.manifestBytes);for(const [name,bytes]of primary.assets)files.set('primary/'+name,bytes);
  const{reader,fresh,postcommit}=reports;
  assertNativeEqual([reader.phase,reader.inputReport,reader.inputReportSha256],['complete',arrowPublicPdfReports.producer.origin,arrowPublicPdfReports.producer.sha256]);
  assertNativeEqual([reader.views,reader.measurements,reader.images,reader.deltas],[306,39528,3057,210]);assertNativeEqual(reader.summary,primary.report.summary);
  assert.equal(reader.controls.length,17);assert.ok(reader.controls.every(c=>c.passed===true));assertNativeEqual(reader.controls,fresh.controls);
  assertNativeEqual([fresh.expectedTree,fresh.trackedFiles,fresh.ordinaryTests,fresh.equalArtifacts,fresh.equalPngs,fresh.sourceGuards],
    [arrowPublicPdfQualification.tree,1463,389,8689,5709,107]);
  assert.equal(fresh.originalProducer,arrowPublicPdfReports.producer.origin);assert.equal(fresh.originalProducerSha256,arrowPublicPdfReports.producer.sha256);
  assert.equal(fresh.originalReader,arrowPublicPdfReports.reader.origin);assert.equal(fresh.originalReaderSha256,arrowPublicPdfReports.reader.sha256);
  assertNativeEqual([postcommit.commit,postcommit.tree,postcommit.trackedWorktreeClean,postcommit.planIgnoredAndUntracked],
    [arrowPublicPdfQualification.commit,arrowPublicPdfQualification.tree,true,true]);
  assertNativeEqual(postcommit.producer,{report:arrowPublicPdfReports.producer.origin,sha256:arrowPublicPdfReports.producer.sha256});
  assertNativeEqual(postcommit.reader,{report:arrowPublicPdfReports.reader.origin,sha256:arrowPublicPdfReports.reader.sha256});
  assertNativeEqual(postcommit.fresh,{receipt:arrowPublicPdfReports.fresh.origin,sha256:arrowPublicPdfReports.fresh.sha256});
  assertNativeEqual(postcommit.summary,primary.report.summary);assertNativeEqual(postcommit.controls,reader.controls);
  assertNativeEqual([postcommit.approvedImagePolicy,postcommit.imageConformanceClaim,postcommit.imageAdmission],[false,false,'pending']);
  return{primary,input:primary.input,reports,files,bindings:{qualification:arrowPublicPdfQualification,reports:arrowPublicPdfReports}};
}
