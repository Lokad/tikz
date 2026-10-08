import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {root,sha256} from './shape-oracle-bundle.mjs';
import {arrowCanonical} from './arrow-native-contract.mjs';
import {arrowCachePath} from './arrow-image-cache-codec.mjs';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {arrowPublicMeetSources} from './arrow-public-meet-contract.mjs';
import {loadArrowPublicMeetBaseline,validateArrowPublicMeetBaselineBundle} from './arrow-public-meet-reader.mjs';
import {validateArrowPublicNumeric} from './arrow-public-source-contract.mjs';
import {arrowPublicControlQualification,arrowPublicControlReports} from './arrow-public-controls-pin.mjs';

export {arrowPublicControlQualification,arrowPublicControlReports};
export const arrowPublicPrimaryPending = ['independent-public-primary-control-reader','public-PDF-controls','public-combined-admission'];

export async function loadArrowPublicControlInput(e,readOverride) {
  const files=new Map(),reports={};let bundle;
  const read=async(file,bound)=>{
    arrowCachePath(file);
    if(readOverride){const bytes=await readOverride(file);assert.ok(Buffer.isBuffer(bytes)&&bytes.length<=bound);return bytes;}
    const pin=Object.values(arrowPublicControlReports).find(p=>p.file===file);assert.ok(pin);
    const full=path.join(root,pin.origin);assert.ok((await stat(full)).size<=bound);return readFile(full);
  };
  for(const [role,pin]of Object.entries(arrowPublicControlReports)){
    const bytes=await read(pin.file,100000);assert.equal(sha256(bytes),pin.sha256,'Changed qualified public proof: '+role);
    const report=JSON.parse(bytes);assert.equal(report.completed,true);reports[role]=report;files.set(pin.file,bytes);
  }
  if(readOverride){
    const mb=await readOverride('baseline/manifest.json');assert.ok(Buffer.isBuffer(mb)&&mb.length<=2000000);
    const manifest=JSON.parse(mb),assets=new Map();assert.equal(Object.keys(manifest.artifacts).length,3986);
    let total=0;
    for(const name of Object.keys(manifest.artifacts)){arrowCachePath(name);const bytes=await readOverride('baseline/'+name);assert.ok(Buffer.isBuffer(bytes)&&bytes.length<=64000000);total+=bytes.length;assert.ok(total<=512000000);assets.set(name,bytes);}
    const sources=await arrowPublicMeetSources(e);
    bundle=validateArrowPublicMeetBaselineBundle(files.get('baseline/report.json'),mb,assets,e,sources);
    await validateArrowPublicNumeric(bundle.numeric,p=>bundle.read('numeric/'+p));bundle={...bundle,manifestBytes:mb,sources};
  }else bundle=await loadArrowPublicMeetBaseline(arrowPublicControlReports.producer.origin,e);
  assert.equal(bundle.report.combined.passed,true);assert.equal(bundle.report.manifest.files,3986);
  assert.equal(Object.keys(bundle.report.sourceHashes).length,100);
  files.set('baseline/manifest.json',bundle.manifestBytes);
  for(const [name,bytes]of bundle.assets)files.set('baseline/'+name,bytes);
  const {reader,fresh,postcommit}=reports;
  assertNativeEqual([reader.completed,reader.phase,reader.inputReport,reader.inputReportSha256],[true,'complete',arrowPublicControlReports.producer.origin,arrowPublicControlReports.producer.sha256]);
  assertNativeEqual(reader.combined,bundle.combined);assertNativeEqual(reader.controls,fresh.controls);
  assertNativeEqual([reader.primaryRegions,reader.pdfRegions,reader.momentRegions,reader.exactRegions,reader.fullPages,reader.panels,reader.recapturedPrimaryImages,reader.recapturedPdfImages],
    [17928,24000,24000,24192,384,2136,1368,1248]);
  assert.equal(reader.controls.length,22);assert.ok(reader.controls.every(c=>c.passed===true));
  assertNativeEqual([fresh.expectedTree,fresh.trackedFiles,fresh.ordinaryTests,fresh.artifactCount,fresh.equalArtifacts,fresh.equalPngs],
    [arrowPublicControlQualification.tree,1456,389,3986,3984,2652]);
  assert.equal(fresh.originalProducer,arrowPublicControlReports.producer.origin);assert.equal(fresh.originalProducerSha256,arrowPublicControlReports.producer.sha256);
  assert.equal(fresh.originalReader,arrowPublicControlReports.reader.origin);assert.equal(fresh.originalReaderSha256,arrowPublicControlReports.reader.sha256);
  assertNativeEqual([postcommit.commit,postcommit.tree,postcommit.trackedWorktreeClean,postcommit.planIgnoredAndUntracked],
    [arrowPublicControlQualification.commit,arrowPublicControlQualification.tree,true,true]);
  assertNativeEqual(postcommit.producer,{report:arrowPublicControlReports.producer.origin,sha256:arrowPublicControlReports.producer.sha256});
  assertNativeEqual(postcommit.reader,{report:arrowPublicControlReports.reader.origin,sha256:arrowPublicControlReports.reader.sha256});
  assertNativeEqual(postcommit.fresh,{receipt:arrowPublicControlReports.fresh.origin,sha256:arrowPublicControlReports.fresh.sha256});
  assertNativeEqual(postcommit.combined,bundle.combined);
  assertNativeEqual([postcommit.approvedImagePolicy,postcommit.imageConformanceClaim,postcommit.imageAdmission],[false,false,'pending']);
  return {bundle,reports,files,bindings:{qualification:arrowPublicControlQualification,reports:arrowPublicControlReports}};
}

export async function arrowPublicControlSources(e,entries) {
  const sources=await arrowPublicMeetSources(e),queue=entries.map(name=>'tools/TikzVisual/'+name);
  for(let i=0;i<queue.length;i++){
    const name=queue[i];if(sources.has(name))continue;assert.match(name,/^tools\/TikzVisual\/[a-z0-9.-]+\.mjs$/);
    const bytes=arrowCanonical(await readFile(path.join(root,name)));sources.set(name,{bytes,sha256:sha256(bytes)});
    for(const m of bytes.toString().matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g))queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(name),m[1])));
  }
  return new Map([...sources].sort(([a],[b])=>a<b?-1:a>b?1:0));
}
