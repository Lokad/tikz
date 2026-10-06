// Six baseline gates and separate fresh public primary/PDF sensitivity gates.
import assert from 'node:assert/strict';
import {labelledCacheSha256,labelledCacheDecodedSha256,labelledSame} from './labelled-border-cache.mjs';
import {labelledCombinedGateReport,finishLabelledCombinedGates} from './labelled-border-combined-coverage.mjs';
import {shapeViews,evaluateShapeTrial} from './shape-primary-trial-policy.mjs';
import {shapePdfViews,evaluateShapePdfTrial,shapePdfMetricRecord} from './shape-pdf-trial-policy.mjs';
import {labelledPdfDefects,labelledPdfView,labelledPdfViewKey} from './labelled-border-pdf-calibration-common.mjs';
import {labelledBorderDefects,labelledDefectExpectation} from './labelled-border-image-defects.mjs';
import {evaluateLabelledPdfPageGuard,labelledPdfGuardExpectation} from './labelled-border-pdf-page-guard.mjs';

const ids=['lines','paths','transforms'],numericCounts=[512,578,534];
function link(r,p){assert.ok(typeof p==='string'&&/^[\w./-]+$/.test(p)&&!p.startsWith('/')
  &&!p.split('/').some(s=>['..','.',''].includes(s)));assert.match(r.artifacts[p]??'',/^[a-f0-9]{64}$/);}
export function finishLabelledCachedGates(cases,primary,pdf){
  const gates={};
  for(const key of ['numeric','inkRoot','primary','originalPdf','candidatePdf','nativePage']){
    const rows=cases.map(c=>c.combined.gates[key]);assert.equal(rows.length,3);
    gates[key]={state:rows.every(q=>q.state==='passed')?'passed':'failed',executedChecks:rows.reduce((n,q)=>n+q.executedChecks,0)};
  }
  for(const [key,controls,count]of [['freshPrimary',primary,102],['freshPdfNative',pdf,126]]){
    assert.equal(controls.reduce((n,c)=>n+c.views.length,0),count);
    gates[key]={state:controls.every(c=>c.passed)?'passed':'failed',executedChecks:count};
  }
  for(const g of Object.values(gates))assert.ok(g.executedChecks>0&&['passed','failed'].includes(g.state));
  const firstFailedGate=Object.keys(gates).find(k=>gates[k].state==='failed')??null;
  return {passed:firstFailedGate===null,firstFailedGate,gates};
}
export function validateLabelledCachedTrial(r,e,numeric){
  assert.deepEqual([r.schemaVersion,r.comparisonKind,r.completed,r.converterInvoked,r.approvedImagePolicy,
    r.imageConformanceClaim,r.overallVerdict],[1,'portable-public-labelled-border-trial',true,true,false,false,'pending']);
  assert.equal(r.cacheSha256,labelledCacheSha256);assert.equal(r.decodedSha256,labelledCacheDecodedSha256);
  assert.equal(r.snapshotSha256,e.calibration.snapshotSha256);labelledSame(r.independentQualification,
    {metricsRecomputed:17424,pagesRecomputed:138,controlPngsReproduced:126});
  assert.deepEqual(r.cases.map(c=>c.caseId),ids);assert.equal(numeric.completed,true);assert.equal(typeof numeric.numericPassed,'boolean');
  assert.equal(numeric.comparisonKind,'public-labelled-border-numeric');assert.equal(numeric.checks,1624);
  assert.deepEqual(numeric.cases.map(c=>c.checks),numericCounts);assert.deepEqual(numeric.cases.map(c=>c.caseId),ids);
  assert.equal(numeric.approvedImagePolicy,false);assert.equal(numeric.imageConformanceClaim,false);
  assert.ok(numeric.converterAssemblyReferences.every(n=>n.startsWith('System.')));
  for(const[p,h]of Object.entries(numeric.artifacts))assert.equal(r.artifacts['candidate/'+p],h);
  link(r,'candidate/report.json');link(r,'independent-calibration.json.gz');assert.equal(r.artifacts['independent-calibration.json.gz'],labelledCacheSha256);
  for(const p of Object.keys(r.artifacts))link(r,p);
  for(const[p,h]of Object.entries(r.toolHashes)){link(r,'tool-sources/'+p);assert.equal(r.artifacts['tool-sources/'+p],h);}
  for(let i=0;i<3;i++){
    const c=r.cases[i],p=e.reports.primary.cases[i],pdf=e.reports.pdf.cases[i];
    assert.equal(c.numericPassed,numeric.cases[i].numericPassed);
    const expected=p.ink.records.flatMap(q=>['minX','minY','maxX','maxY'].map(k=>({quantity:q.id+'.'+k,expected:q.bound[k],limit:1e-8})))
      .concat(p.rootChecks.map(q=>({quantity:'root.'+q.quantity,expected:q.serialized,limit:.000001})));
    assert.equal(c.inkRoot.length,expected.length);
    for(let j=0;j<expected.length;j++){const a=c.inkRoot[j],b=expected[j];
      for(const[k,v]of Object.entries(b))assert.equal(a[k],v);assert.ok(Number.isFinite(a.observed));
      assert.equal(a.delta,Math.abs(a.observed-a.expected));assert.equal(a.passed,a.delta<=a.limit);
    }
    assert.deepEqual(c.primary.map(labelledPdfView),shapeViews);
    for(const o of c.primary){labelledSame(o.evaluation,evaluateShapeTrial(p.policy,labelledPdfView(o),o));
      assert.equal(o.repeat.rawChangedPixels,0);assert.deepEqual(o.regions.map(q=>q.id),p.frame.regions.map(q=>q.id));
      for(let j=0;j<o.regions.length;j++)for(const[k,v]of Object.entries(p.frame.regions[j]))labelledSame(o.regions[j][k],v);
      for(const p of Object.values(o.images))link(r,p);
    }
    for(const[key,mode]of [['originalPdf','original'],['candidatePdf','native']]){
      assert.deepEqual(c[key].map(labelledPdfView),shapePdfViews);
      for(const o of c[key]){
        labelledSame(o.evaluation,evaluateShapePdfTrial(pdf.policies[mode],labelledPdfView(o),o));
        const old=pdf.observations.find(q=>q.mode===(mode==='original'?'original-svg':'native-ink')&&labelledPdfViewKey(q)===labelledPdfViewKey(o));
        for(const k of ['sourceFrame','clipFrame','pageSize'])labelledSame(o[k],old[k]);
        for(const p of Object.values(o.artifacts))link(r,p);
      }
    }
    assert.deepEqual(c.nativePage.map(labelledPdfView),shapePdfViews);
    for(let j=0;j<c.nativePage.length;j++){
      const o=c.nativePage[j],candidate=c.candidatePdf[j];
      labelledSame(o.evaluation,evaluateLabelledPdfPageGuard(o.measurement,candidate.evaluation));
      assert.equal(o.actualPage,candidate.artifacts['svg-page']);link(r,o.referencePage);link(r,o.actualPage);link(r,o.sheet);
      assert.equal(o.referencePage,'reference-pages/'+c.caseId+'/'+labelledPdfViewKey(o)+'.png');
      const anchor=pdf.observations.find(q=>q.mode==='native-ink'&&labelledPdfViewKey(q)===labelledPdfViewKey(o));
      assert.equal(r.artifacts[o.referencePage],e.reports.pdf.artifacts[anchor.artifacts['svg-page']]);
    }
    const gates=labelledCombinedGateReport(c.numericPassed,c.inkRoot,c.primary,c.originalPdf,c.candidatePdf,c.nativePage);
    gates.numeric.executedChecks=numericCounts[i];labelledSame(c.combined,finishLabelledCombinedGates(gates));
    assert.deepEqual(c.sources.map(q=>q.regionId),p.frame.regions.map(q=>q.id));
    for(const q of c.sources){assert.ok(q.semanticId&&q.svgElementId&&q.source);
      for(const k of ['offset','length','line','column'])assert.ok(Number.isSafeInteger(q.source[k])&&q.source[k]>=0);}
    for(const k of ['source','scene','svg'])link(r,c[k]);
    assert.deepEqual([c.source,c.scene,c.svg],['source.tikz','actual-scene.json','actual.svg'].map(p=>'candidate/'+c.caseId+'/'+p));
  }
  const defs=labelledBorderDefects();assert.equal(r.primaryControls.length,26);let primaryViews=0;
  for(let i=0;i<defs.length;i++){
    const d=defs[i],c=r.primaryControls[i],p=e.reports.primary.cases.find(c=>c.caseId===d.caseId),base=r.cases.find(c=>c.caseId===d.caseId);
    for(const[k,v]of Object.entries(d))labelledSame(c[k],v);assert.equal(c.numericGatesBypassed,true);link(r,c.svg);
    labelledSame(c.targetSource,base.sources.find(q=>q.regionId===d.target)??null);
    assert.deepEqual(c.views.map(labelledPdfView),shapeViews.filter(v=>v.background==='white'&&(!d.naturalOnly||v.frame==='natural')));
    for(const o of c.views){const verdict=evaluateShapeTrial(p.policy,labelledPdfView(o),o);labelledSame(o.evaluation,verdict);
      const b=base.primary.find(q=>labelledPdfViewKey(q)===labelledPdfViewKey(o)),exact=r.artifacts[o.images.actual]===r.artifacts[b.images.actual];
      assert.equal(o.exactBaselinePixels,exact);const target=verdict.checks.find(q=>q.id===(d.target??'whole-picture'));assert.ok(target);
      const expected=labelledDefectExpectation(d,o),passed=expected==='pixel-identical'?verdict.passed&&exact:!verdict.passed&&!target.passed&&!exact;
      assert.equal(o.expectedImageOutcome,expected);assert.equal(o.expectedOutcomePassed,passed);
      for(const p of Object.values(o.images))link(r,p);primaryViews++;
    }
    assert.equal(c.passed,c.views.every(o=>o.expectedOutcomePassed));
  }
  const pdfDefs=labelledPdfDefects();assert.equal(r.pdfControls.length,32);let pdfViews=0,visible=0,exact=0,blind=0;
  for(let i=0;i<pdfDefs.length;i++){
    const d=pdfDefs[i],c=r.pdfControls[i],p=e.reports.pdf.cases.find(c=>c.caseId===d.caseId),base=r.cases.find(c=>c.caseId===d.caseId);
    for(const[k,v]of Object.entries(d))labelledSame(c[k],v);assert.equal(c.numericGatesBypassed,true);link(r,c.svg);
    labelledSame(c.targetSource,base.sources.find(q=>q.regionId===d.target)??null);
    assert.deepEqual(c.views.map(labelledPdfView),shapePdfViews.filter(v=>!d.naturalOnly||v.frame==='natural'));
    for(let j=0;j<c.views.length;j++){
      const o=c.views[j],old=e.reports.pdfOnly.controls[i].views[j],guard=e.reports.guard.controls[i].views[j];
      const verdict=evaluateShapePdfTrial(p.policies.native,labelledPdfView(o),o);labelledSame(o.evaluation,verdict);
      assert.equal(r.artifacts[o.artifacts['svg-page']],e.reports.pdfOnly.artifacts[old.artifacts['svg-page']]);
      labelledSame(shapePdfMetricRecord(o.whole),shapePdfMetricRecord(old.whole));
      assert.equal(o.regions.length,old.regions.length);
      for(let k=0;k<o.regions.length;k++)labelledSame(shapePdfMetricRecord(o.regions[k]),shapePdfMetricRecord(old.regions[k]));
      labelledSame(o.guard.measurement,guard.measurement);labelledSame(o.guard.evaluation,evaluateLabelledPdfPageGuard(o.guard.measurement,verdict));
      const expected=labelledPdfGuardExpectation(d,o),target=o.guard.evaluation.checks.find(q=>q.id===(d.target??'whole-picture'));
      assert.ok(target);const isExact=o.guard.measurement.fullPage.exactRgbaMatch;
      const passed=expected==='pixel-identical'?o.guard.evaluation.passed&&isExact:!o.guard.evaluation.passed&&!target.passed&&!isExact;
      assert.equal(o.expectedImageOutcome,expected);assert.equal(o.expectedOutcomePassed,passed);
      for(const p of Object.values(o.artifacts))link(r,p);link(r,o.guard.referencePage);link(r,o.guard.actualPage);
      assert.equal(o.guard.actualPage,o.artifacts['svg-page']);
      assert.equal(o.guard.referencePage,base.nativePage.find(q=>labelledPdfViewKey(q)===labelledPdfViewKey(o)).referencePage);
      const anchor=p.observations.find(q=>q.mode==='native-ink'&&labelledPdfViewKey(q)===labelledPdfViewKey(o));
      assert.equal(r.artifacts[o.guard.referencePage],e.reports.pdf.artifacts[anchor.artifacts['svg-page']]);
      if(o.guard.sheet)link(r,o.guard.sheet);
      pdfViews++;if(expected==='pixel-identical')exact++;else{visible++;if(verdict.passed)blind++;}
    }
    assert.equal(c.passed,c.views.every(o=>o.expectedOutcomePassed));
  }
  assert.deepEqual([primaryViews,pdfViews,visible,exact,blind],[102,126,114,12,4]);
  labelledSame(r.combined,finishLabelledCachedGates(r.cases,r.primaryControls,r.pdfControls));
  assert.deepEqual(r.coverage,{cases:3,numericChecks:1624,inkRootChecks:276,primaryViews:36,pdfViews:24,nativePageViews:12,
    primaryControls:26,primaryControlViews:102,pdfControls:32,pdfControlViews:126,visiblePdfRejections:114,
    exactPdfVisibilityControls:12,pdfOnlyBlindSpotViews:4});
  link(r,r.agent.viewer);assert.equal(r.agent.firstFailedGate,r.combined.firstFailedGate);
  return r.coverage;
}
