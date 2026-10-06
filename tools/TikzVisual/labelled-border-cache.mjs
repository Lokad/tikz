// Portable independent evidence. No converter or native reference process.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {root,sha256} from './shape-oracle-bundle.mjs';
import {canonical,labelledCombinedInputs,verifyLabelledSourceHashes} from './labelled-border-combined-common.mjs';
import {labelledPublicPdfEvidence} from './labelled-border-public-pdf-coverage.mjs';
import {labelledPdfQualification} from './labelled-border-pdf-calibration-common.mjs';
import {validateLabelledInkCalibration} from './labelled-border-coverage.mjs';
import {validateLabelledPdfCalibration,validateLabelledPdfSensitivity} from './labelled-border-pdf-calibration-coverage.mjs';
import {validateLabelledPdfPageGuard} from './labelled-border-pdf-page-guard-coverage.mjs';
import {loadLabelledBorderEvidence,labelledBorderSnapshotSha256} from './labelled-border-evidence.mjs';

export const labelledCacheFile='tests/Reference/LabelledBorders/conformance/calibration.json.gz';
export const labelledCacheSha256='f696141b6a17ee0d17d9c6fa1e176cd456a165f775febeec6d8c7dcae921ca8f';
export const labelledCacheDecodedSha256='3d4253d6c9fe09b1d099bf33b1b2f72ab815cd4a9f59df708e2d177d304a9b28';
export const labelledCacheReports={...labelledCombinedInputs,
  pdfOnly:labelledPublicPdfEvidence.source,guard:labelledPublicPdfEvidence.guard};
const digest=/^[a-f0-9]{64}$/;
const relative=p=>assert.ok(typeof p==='string'&&/^[\w./-]+$/.test(p)&&!p.startsWith('/')
  &&!p.split('/').some(s=>['..','.',''].includes(s)),'Invalid cache asset path.');
const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'
  ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
export const labelledSame=(a,b,message)=>assert.equal(sha256(JSON.stringify(ordered(a))),sha256(JSON.stringify(ordered(b))),message);

// Exactly the assets needed to reproduce the baseline and independent controls.
export function selectLabelledCacheAssets(reports){
  const assets={};
  const take=(key,p)=>{relative(p);const h=reports[key].artifacts[p];assert.match(h??'',digest);assets[key+'/'+p]=h;};
  for(const c of reports.primary.cases){take('primary',c.svg);
    for(const o of c.observations)for(const k of ['reference','actual'])take('primary',o.images[k]);}
  for(const c of reports.pdf.cases){
    for(const p of Object.values(c.svg))take('pdf',p);
    for(const p of Object.values(c.pdfPages))take('pdf',p);
    for(const o of c.observations)for(const k of ['pdf','svg','svg-page'])take('pdf',o.artifacts[k]);
  }
  for(const c of reports.pdfOnly.baselines)for(const o of c.views)
    for(const k of ['pdf','svg','svg-page'])take('pdfOnly',o.artifacts[k]);
  // Control pages are reproduced from these independent SVGs and required to
  // match every original PNG digest before use. Do not cache 126 duplicate pages.
  for(const c of reports.pdfOnly.controls)take('pdfOnly',c.caseId+'/'+c.name+'.svg');
  return Object.fromEntries(Object.entries(assets).sort(([a],[b])=>a.localeCompare(b)));
}
export function projectLabelledQualification(q){
  // Rasterizer commands retain absolute local working paths in the original
  // investigation. Preserve measurements and identities, with explicit lineage.
  return {source:labelledPdfQualification,renderer:q.renderer,
    tools:{pdftocairo:{sha256:q.tools.pdftocairo.sha256,version:q.tools.pdftocairo.version}},
    coverage:q.coverage,wrapperControls:q.wrapperControls,cacheControls:q.cacheControls,
    artifacts:Object.fromEntries(q.cases.flatMap(c=>[
      ...['original-svg','native-ink'].map(k=>['prerequisite/'+c.caseId+'/'+k+'.svg',q.artifacts['prerequisite/'+c.caseId+'/'+k+'.svg']]),
      ...[1,4].map(s=>[c.caseId+'/pdftocairo/original-'+s+'x.png',q.artifacts[c.caseId+'/pdftocairo/original-'+s+'x.png']])])),
    cases:q.cases.map(c=>({caseId:c.caseId,frame:c.frame,camera:c.camera,regions:c.regions,
      observations:c.observations.filter(o=>o.rasterizer==='pdftocairo'&&o.document==='original')}))};
}
export function validateLabelledCache(c){
  assert.deepEqual([c.schemaVersion,c.comparisonKind,c.completed,c.converterInvoked,
    c.approvedImagePolicy,c.imageConformanceClaim,c.overallVerdict],
    [1,'portable-independent-labelled-border-calibration',true,false,false,false,'pending']);
  assert.equal(c.snapshotSha256,labelledBorderSnapshotSha256);
  assert.deepEqual(c.sourceReports,labelledCacheReports);assert.deepEqual(c.qualification.source,labelledPdfQualification);
  assert.deepEqual(Object.keys(c.reports),Object.keys(labelledCacheReports));const reports={};
  for(const [key,pin]of Object.entries(labelledCacheReports)){
    assert.equal(typeof c.reports[key],'string');assert.equal(sha256(c.reports[key]),pin.sha256,key);
    reports[key]=JSON.parse(c.reports[key]);
    for(const[p,h]of Object.entries(reports[key].toolHashes))assert.equal(c.toolHashes[p],h,p);
  }
  validateLabelledInkCalibration(reports.primary,reports.pdf.cases.map(c=>c.frame));
  validateLabelledPdfCalibration(reports.pdf,c.qualification);
  validateLabelledPdfSensitivity(reports.pdfOnly,reports.pdf);
  validateLabelledPdfPageGuard(reports.guard,reports.pdfOnly,reports.pdf);
  assert.equal(reports.pdfOnly.sensitivityPassed,false);assert.equal(reports.guard.guardPassed,true);
  assert.deepEqual(reports.primary.renderer,reports.pdf.renderer);assert.deepEqual(c.renderer,reports.pdf.renderer);
  const proof=reports.guardChecks;
  assert.deepEqual([proof.completed,proof.passed,proof.converterInvoked,proof.approvedImagePolicy,
    proof.imageConformanceClaim,proof.overallVerdict],[true,true,false,false,false,'pending']);
  assert.deepEqual([proof.controls.length,proof.metricsRecomputed,proof.pagesRecomputed],[52,7392,138]);
  assert.ok(proof.controls.every(q=>q.passed));assert.equal(proof.calibrationSha256,labelledCombinedInputs.pdf.sha256);
  assert.equal(proof.sourceSha256,labelledPublicPdfEvidence.source.sha256);
  assert.equal(proof.inputReportSha256,labelledPublicPdfEvidence.guard.sha256);
  assert.equal(c.qualification.tools.pdftocairo.sha256,reports.pdf.rasterizerSha256);
  assert.equal(c.qualification.wrapperControls.length,12);assert.ok(c.qualification.wrapperControls.every(q=>q.exactPngMatch));
  assert.equal(c.qualification.cacheControls.length,6);assert.ok(c.qualification.cacheControls.every(q=>q.exactPngMatch));
  labelledSame(c.assets,selectLabelledCacheAssets(reports),'Changed cache asset coverage.');
  assert.deepEqual(Object.keys(c.blobs).sort(),[...new Set(Object.values(c.assets))].sort());
  for(const[h,s]of Object.entries(c.blobs)){
    assert.match(h,digest);assert.equal(typeof s,'string');assert.ok(s.length<=16000000);
    const b=Buffer.from(s,'base64');assert.equal(b.toString('base64'),s);assert.equal(sha256(b),h);
    assert.ok(b.length>0&&b.length<=12000000);
  }
  for(let i=0;i<3;i++){
    const p=reports.primary.cases[i],pdf=reports.pdf.cases[i];
    labelledSame(p.ink,pdf.ink);labelledSame(p.rootChecks,pdf.rootChecks);
    assert.equal(c.assets['primary/'+p.svg],c.assets['pdf/'+pdf.svg.native]);
  }
  assert.ok(Object.keys(c.inputs).length>69);
  for(const[p,d]of Object.entries(c.inputs)){relative(p);assert.match(d.sha256,digest);assert.ok(['raw','utf8-lf'].includes(d.encoding));}
  assert.ok(Object.keys(c.toolHashes).length>=26);
  for(const[p,h]of Object.entries(c.toolHashes)){relative(p);assert.ok(p.startsWith('tools/'));assert.match(h,digest);}
  const get=(key,p)=>{relative(p);const h=c.assets[key+'/'+p];assert.match(h??'',digest,'Uncached independent asset: '+key+'/'+p);return Buffer.from(c.blobs[h],'base64');};
  return {reports,get};
}
export function decodeLabelledCache(compressed){
  assert.ok(Buffer.isBuffer(compressed)&&compressed.length<=16000000);
  assert.equal(sha256(compressed),labelledCacheSha256,'Unreviewed labeled-border cache.');
  const bytes=gunzipSync(compressed,{maxOutputLength:160000000});assert.equal(sha256(bytes),labelledCacheDecodedSha256);
  const calibration=JSON.parse(bytes);return {calibration,bytes,compressed};
}
export async function loadLabelledCache(read=readFile){
  const e=decodeLabelledCache(await read(path.join(root,labelledCacheFile))),c=e.calibration;
  const {reports,get}=validateLabelledCache(c);
  for(const[p,d]of Object.entries(c.inputs)){
    const raw=await read(path.join(root,p)),b=d.encoding==='raw'?raw:canonical(raw);
    assert.equal(sha256(b),d.sha256,'Changed independent input: '+p);
  }
  await verifyLabelledSourceHashes(c.toolHashes);const native=await loadLabelledBorderEvidence();
  assert.equal(native.snapshotSha256,c.snapshotSha256);
  return {...e,reports,get,native};
}
export function requireLabelledRenderer(actual,expected){
  assert.deepEqual(Object.keys(actual).sort(),Object.keys(expected).sort());
  for(const k of Object.keys(expected))if(k!=='osRelease')assert.deepEqual(actual[k],expected[k],'Changed renderer: '+k);
  assert.equal(typeof actual.osRelease,'string');
}
