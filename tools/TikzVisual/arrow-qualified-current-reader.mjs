import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Historical structure uses captured production sources; fresh admission keeps the original current reader.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sha256} from './shape-oracle-bundle.mjs';
import {arrowCachePath} from './arrow-image-cache-codec.mjs';
import {arrowQualifiedSources} from './arrow-qualified-sources.mjs';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {verifyArrowPublicHistoricalNumeric} from './arrow-public-image-cache.mjs';
import {arrowPublicImageCacheFile,arrowPublicImageCacheSha256} from './arrow-public-image-cache-pin.mjs';
import {arrowMeetImageCacheFile,arrowMeetImageCacheSha256} from './arrow-meet-image-cache-pin.mjs';
import {arrowImageCacheFile,arrowImageCacheSha256} from './arrow-image-cache.mjs';
import {arrowPublicMeetSources,arrowPublicMeetBindings} from './arrow-public-meet-contract.mjs';
import {validateArrowPublicMeetBaselineBundle} from './arrow-public-meet-reader.mjs';
import {arrowCurrentTrialSources,arrowCurrentCandidateInput,arrowCurrentTrialPending,arrowCurrentIndex} from './arrow-current-trial-contract.mjs';
import {arrowPublicPrimaryControlPlan,arrowPublicPrimaryExpected,summarizeArrowPublicPrimaryControls} from './arrow-public-primary-controls.mjs';
import {arrowMeetFiles} from './arrow-meet-source-contract.mjs';
import {arrowPrimaryRegions} from './arrow-primary-contract.mjs';
import {arrowPublicPdfControlPlan,arrowPublicPdfFocus,arrowPublicPdfIndex,summarizeArrowPublicPdfControls} from './arrow-public-pdf-controls.mjs';
import {arrowPublicControlCase,arrowPublicControlAttribution} from './arrow-public-control-svg.mjs';
import {arrowSourcePdfControl} from './arrow-source-pdf-model.mjs';
import {arrowPrimaryVisibility} from './arrow-primary-defects.mjs';

const encode=value=>Buffer.from(JSON.stringify(value)+'\n');
export async function validateArrowQualifiedCurrentTrial(reportBytes,manifestBytes,assets,e,readCurrent=readFile,qualification){
  assert.ok(reportBytes.length<=200000&&manifestBytes.length<=5000000);
  const report=JSON.parse(reportBytes),manifest=JSON.parse(manifestBytes);
  assertNativeEqual(Object.keys(report).sort(),['schemaVersion','comparisonKind','completed','phase','converterInvoked','nativeToolInvoked','numericGatesBypassedForMutations','approvedImagePolicy','imageConformanceClaim','imageAdmission','renderer','qualification','sourceHashes','numericReport','baseline','primary','pdf','focus','inspection','viewer','baselinePassed','primarySummary','pdfSummary','pendingGates','manifest'].sort());
  assertNativeEqual([report.schemaVersion,report.comparisonKind,report.completed,report.phase],[1,'current-public-arrow-combined-trial',true,'complete']);
  assertNativeEqual([report.converterInvoked,report.nativeToolInvoked,report.numericGatesBypassedForMutations,report.approvedImagePolicy,report.imageConformanceClaim,report.imageAdmission],[true,false,true,false,false,'pending']);
  assertNativeEqual(report.pendingGates,arrowCurrentTrialPending);assert.equal(report.baselinePassed,true);
  requireRenderer(report.renderer, e.reports.primary.renderer);
  assertNativeEqual(report.qualification,{publicCacheSha256:arrowPublicImageCacheSha256,nativeMeetCacheSha256:arrowMeetImageCacheSha256,nativeBaseCacheSha256:arrowImageCacheSha256});
  assertNativeEqual([report.numericReport,report.baseline,report.primary,report.pdf,report.focus,report.inspection,report.viewer],['baseline/numeric/report.json','baseline/combined.json','primary/summary.json','pdf/summary.json','pdf/focus.json','agent-inspection.json','index.html']);
  assertNativeEqual(report.manifest,{file:'manifest.json',sha256:sha256(manifestBytes),files:assets.size});
  assertNativeEqual(Object.keys(manifest).sort(),['artifacts','schemaVersion']);assert.equal(manifest.schemaVersion,1);
  assertNativeEqual(Object.keys(manifest.artifacts),[...assets.keys()]);
  for(const[file,hash]of Object.entries(manifest.artifacts)){arrowCachePath(file);assert.match(hash,/^[a-f0-9]{64}$/);assert.equal(sha256(assets.get(file)),hash,'Changed current trial artifact: '+file);}
  const expected=new Set(),read=file=>{arrowCachePath(file);assert.ok(assets.has(file),'Missing current trial artifact: '+file);expected.add(file);return assets.get(file);},json=file=>JSON.parse(read(file));
  const sources=qualification?await arrowQualifiedSources(reportBytes,qualification.pin,read):await arrowCurrentTrialSources(e);
  assertNativeEqual(report.sourceHashes,Object.fromEntries([...sources].map(([p,s])=>[p,s.sha256])));
  for(const[file,s]of sources)assert.ok(read('source-captures/'+file).equals(s.bytes),'Changed current comparison source: '+file);
  for(const[file,hash]of [['qualification/public-controls.bin.gz',arrowPublicImageCacheSha256],['qualification/native-meet.bin.gz',arrowMeetImageCacheSha256],['qualification/native-source.bin.gz',arrowImageCacheSha256]])assert.equal(sha256(read(file)),hash);
  assertNativeEqual(json('native-limit-bindings.json'),arrowPublicMeetBindings(e));read('numeric-command.log');
  // Adapt the current baseline into the unchanged baseline shape validator. These
  // metadata are derived from current records; no historical public report is read.
  const ba=new Map([...assets].filter(([p])=>p.startsWith('baseline/')).map(([p,b])=>[p.slice(9),b]));
  for(const file of ba.keys())read('baseline/'+file);
  ba.set('native-meet-cache.bin.gz',read('qualification/native-meet.bin.gz'));ba.set('native-base-cache.bin.gz',read('qualification/native-source.bin.gz'));
  ba.set('native-limit-bindings.json',read('native-limit-bindings.json'));ba.set('numeric-command.log',read('numeric-command.log'));ba.set('index.html',Buffer.alloc(0));
  const bs=qualification?qualification.baselineSources:await arrowPublicMeetSources(e);
  for(const[file,s]of bs)ba.set('source-captures/'+file,read('source-captures/'+file));
  const bm=encode({schemaVersion:1,artifacts:Object.fromEntries([...ba].map(([p,b])=>[p,sha256(b)]))});
  const br={schemaVersion:1,comparisonKind:'public-arrow-meet-baseline-trial',completed:true,phase:'complete',converterInvoked:true,approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',
    cache:{file:'native-meet-cache.bin.gz',sha256:arrowMeetImageCacheSha256},baseCache:{file:'native-base-cache.bin.gz',sha256:arrowImageCacheSha256},renderer:report.renderer,sourceHashes:Object.fromEntries([...bs].map(([p,s])=>[p,s.sha256])),
    numericReport:'numeric/report.json',frames:'frames.json',primary:'primary.json',pdf:'pdf.json',combined:json(report.baseline),
    pendingGates:['public-image-only-defect-and-visibility-controls','independent-public-trial-reader','fixed-family-image-admission'],viewer:'index.html',manifest:{file:'manifest.json',sha256:sha256(bm),files:ba.size}};
  const baseline=validateArrowPublicMeetBaselineBundle(encode(br),bm,ba,e,bs);assert.equal(baseline.combined.passed,true);
  const sourcePolicy=await verifyArrowPublicHistoricalNumeric(baseline.numeric,p=>baseline.read('numeric/'+p),readCurrent);
  for(const[file,hash]of Object.entries(baseline.numeric.sources))assert.equal(sha256(baseline.read('numeric/source-captures/'+file)),hash);
  const input=arrowCurrentCandidateInput(baseline.read,baseline.pdf),primaryRead=p=>read('primary/'+p),primaryJson=p=>JSON.parse(primaryRead(p)),primary=[];
  assertNativeEqual(primaryJson('record-index.json'),arrowPublicPrimaryControlPlan().map(v=>'views/'+v.id+'/record.json'));
  for(const view of arrowPublicPrimaryControlPlan()){
    const record=primaryJson('views/'+view.id+'/record.json');assertNativeEqual(Object.keys(record).sort(),['view','files','sourceFrame','attribution','delta'].sort());assertNativeEqual(record.view,view);
    const f=e.frames.find(f=>f.caseId===view.caseId),files=arrowMeetFiles(view,arrowPrimaryRegions(f));assertNativeEqual(record.files,files);
    const svg=arrowPublicPrimaryExpected(e,input,view);assert.equal(primaryRead(files.reference).toString(),svg.reference);assert.equal(primaryRead(files.actual).toString(),svg.actual);assertNativeEqual(record.attribution,svg.attribution);
    assert.equal(['defect','visibility-missing'].includes(view.kind),record.delta!==null);
    for(const file of [files.record,files.reference,files.actual,files.numbers,...Object.values(files.images),...files.crops.flatMap(c=>Object.values(c.images))])primaryRead(file);
    primary.push({...record,numbers:primaryJson(files.numbers)});
  }
  const pm=summarizeArrowPublicPrimaryControls(e,primary);assertNativeEqual(report.primarySummary,pm.summary);assertNativeEqual(primaryJson('summary.json'),pm.summary);
  for(const row of pm.evaluations)assertNativeEqual(primaryJson('views/'+row.view.id+'/gates.json'),row);
  const pdfRead=p=>read('pdf/'+p),pdfJson=p=>JSON.parse(pdfRead(p)),pdf=[];
  assertNativeEqual(pdfJson('record-index.json'),arrowPublicPdfControlPlan().map(v=>'views/'+v.id+'/record.json'));
  for(const view of arrowPublicPdfControlPlan()){
    const record=pdfJson('views/'+view.id+'/record.json'),native=e.pdfRecords.find(r=>r.view.id===view.id);assert.ok(native);
    assertNativeEqual(Object.keys(record).sort(),['view','publicSource','sourceFrame','normalization','extra','attribution','files','sourceDelta','sceneDelta'].sort());
    assertNativeEqual(record.view,view);assert.equal(record.publicSource,view.route==='native-source');assertNativeEqual(record.files,native.files);assertNativeEqual(record.extra,native.extra);
    const control=arrowSourcePdfControl(view)??(view.kind==='visibility-calibration'?arrowPrimaryVisibility.find(c=>c.name===view.name):null);
    assertNativeEqual(record.attribution,record.publicSource&&control?.target.startsWith('paint-')?arrowPublicControlAttribution(arrowPublicControlCase(input,view.caseId),control):null);
    assert.ok(pdfRead(record.files.pdf).equals(e.getRole('pdf',native.files.pdf)));
    for(const type of ['source','scene']){
      const files=record.files[type];assert.equal(!['calibration','visibility-calibration'].includes(view.kind),record[type+'Delta']!==null);
      for(const file of [files.svg,files.numbers,...Object.values(files.images)])pdfRead(file);record[type]=pdfJson(files.numbers);
    }
    pdf.push(record);
  }
  const qm=summarizeArrowPublicPdfControls(e,pdf);assertNativeEqual(report.pdfSummary,qm.summary);assertNativeEqual(pdfJson('summary.json'),qm.summary);
  for(const row of qm.evaluations)assertNativeEqual(pdfJson('views/'+row.view.id+'/gates.json'),row);
  const focus=arrowPublicPdfFocus(e,input,pdf);assertNativeEqual(pdfJson('focus.json'),focus);assert.equal(pdfRead('index.html').toString(),arrowPublicPdfIndex(qm.summary,pdf,focus));
  for(const p of focus)for(const file of Object.values(p.images))pdfRead(file);
  const inspection=json(report.inspection);assertNativeEqual(inspection.coverage,{cases:6,primaryBaselines:144,pdfBaselines:96,qualifiedNativePageChecks:192,primaryControls:306,pdfControls:396,pdfControlCaptures:792,focusSelections:focus.length});
  assertNativeEqual(Object.keys(inspection).sort(),['schemaVersion','role','numeric','baseline','coverage','primary','pdf','focus'].sort());
  assertNativeEqual([inspection.schemaVersion,inspection.role,inspection.numeric,inspection.baseline],[1,'current-candidate-inspection','baseline/numeric/report.json','baseline/combined.json']);
  assertNativeEqual(inspection.primary,primary.map(r=>({view:r.view.id,record:'primary/'+r.files.record,pair:'primary/'+(r.files.images.comparison??r.files.images.actual),images:Object.fromEntries(Object.entries(r.files.images).map(([k,p])=>[k,'primary/'+p])),crops:r.files.crops.map(c=>'primary/'+c.images.sheet),attribution:r.attribution})));
  assertNativeEqual(inspection.pdf,pdf.map(r=>({view:r.view.id,record:'pdf/views/'+r.view.id+'/record.json',source:'pdf/'+(r.files.source.images.sheet??r.files.source.images['svg-page']),scene:'pdf/'+(r.files.scene.images.sheet??r.files.scene.images['svg-page']),attribution:r.attribution})));
  assertNativeEqual(inspection.focus,focus.map(p=>({view:p.viewId,type:p.type,region:p.regionId,sheet:'pdf/'+p.images.sheet,attribution:p.attribution})));assert.equal(read(report.viewer).toString(),arrowCurrentIndex(inspection));
  assertNativeEqual([...assets.keys()].sort(),[...expected].sort(),'Incomplete current trial coverage.');
  return{report,manifest,assets,read,json,sources,sourcePolicy,baseline,input,primary:{records:primary,read:primaryRead,input,report:{summary:pm.summary}},pdf:{records:pdf,read:pdfRead,json:pdfJson,report:{summary:qm.summary},focus},e};
}
