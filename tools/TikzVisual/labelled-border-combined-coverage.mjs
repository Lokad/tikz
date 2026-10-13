import {requireRenderer} from './shape-primary-trial-policy.mjs';
// All public gates are mandatory. These reports still grant no admission.
import assert from 'node:assert/strict';
import {labelledBorderSnapshotSha256} from './labelled-border-evidence.mjs';
import {labelledCombinedInputs} from './labelled-border-combined-common.mjs';
import {labelledPdfView,labelledPdfViewKey} from './labelled-border-pdf-calibration-common.mjs';
import {shapeViews,evaluateShapeTrial} from './shape-primary-trial-policy.mjs';
import {shapePdfViews,evaluateShapePdfTrial} from './shape-pdf-trial-policy.mjs';
import {evaluateLabelledPdfPageGuard} from './labelled-border-pdf-page-guard.mjs';

const ids=['lines','paths','transforms'],numericCounts=[512,578,534],bounds=['minX','minY','maxX','maxY'];
export function labelledCombinedGateReport(numeric,inkRoot,primary,originalPdf,candidatePdf,nativePage){
  const gates={numeric:{state:numeric?'passed':'failed',executedChecks:0},
    inkRoot:{state:inkRoot.every(c=>c.passed)?'passed':'failed',executedChecks:inkRoot.length}};
  for(const[key,rows]of Object.entries({primary,originalPdf,candidatePdf,nativePage})){
    assert.ok(rows.length>0);assert.ok(rows.every(r=>r.evaluation?.checks?.length>0));
    gates[key]={state:rows.every(r=>r.evaluation.passed)?'passed':'failed',executedViews:rows.length,
      executedChecks:rows.reduce((n,r)=>n+r.evaluation.checks.length+(key==='nativePage'?1:0),0)};
  }
  return gates;
}
export function finishLabelledCombinedGates(gates){
  assert.deepEqual(Object.keys(gates),['numeric','inkRoot','primary','originalPdf','candidatePdf','nativePage']);
  for(const g of Object.values(gates)){
    assert.ok(['passed','failed'].includes(g.state));assert.ok(Number.isSafeInteger(g.executedChecks)&&g.executedChecks>0);
  }
  const firstFailedGate=Object.keys(gates).find(k=>gates[k].state==='failed')??null;
  return {passed:firstFailedGate===null,verdict:firstFailedGate?'trial-failed':'trial-pass',firstFailedGate,gates,
    overallVerdict:'pending',approvedImagePolicy:false,imageConformanceClaim:false};
}
function link(r,p){
  assert.ok(typeof p==='string'&&p.length&&!p.startsWith('/')&&!p.includes(':')&&!p.includes('\\')
    &&!p.split('/').some(s=>['..','.',''].includes(s)));assert.match(r.artifacts[p]??'',/^[a-f0-9]{64}$/);
}
export function validateLabelledCombinedRole(r,kind,inputs){
  assert.deepEqual([r.schemaVersion,r.comparisonKind,r.completed],[1,kind,true]);
  assert.deepEqual([r.converterInvoked,r.approvedImagePolicy,r.imageConformanceClaim,r.overallVerdict],
    [true,false,false,'pending']);
  assert.equal(r.snapshotSha256,labelledBorderSnapshotSha256);assert.deepEqual(r.inputs,labelledCombinedInputs);
  requireRenderer(r.renderer, inputs.primary.report.renderer);requireRenderer(r.renderer, inputs.pdf.report.renderer);
  for(const[p,h]of Object.entries(r.artifacts)){link(r,p);assert.match(h,/^[a-f0-9]{64}$/);}
  for(const[p,h]of Object.entries(r.toolHashes)){
    assert.ok(p.startsWith('tools/TikzVisual/')&&!p.includes('..'));link(r,'tool-sources/'+p);
    assert.equal(r.artifacts['tool-sources/'+p],h);
  }
  assert.ok(Object.keys(r.toolHashes).length>=24);
  for(const[key,pin]of Object.entries(labelledCombinedInputs)){
    link(r,'calibration/'+key+'/report.json');assert.equal(r.artifacts['calibration/'+key+'/report.json'],pin.sha256);
    for(const[p,h]of Object.entries(inputs[key].report.artifacts))assert.equal(r.artifacts['calibration/'+key+'/'+p],h);
  }
  link(r,'candidate/report.json');link(r,r.agent.viewer);
}
export function validateLabelledCombinedTrial(r,inputs,numeric){
  validateLabelledCombinedRole(r,'public-labelled-border-combined-trial',inputs);
  assert.deepEqual(r.cases.map(c=>c.caseId),ids);assert.equal(numeric.completed,true);
  assert.equal(numeric.comparisonKind,'public-labelled-border-numeric');
  assert.equal(numeric.checks,1624);assert.deepEqual(numeric.cases.map(c=>c.caseId),ids);
  assert.deepEqual(numeric.cases.map(c=>c.checks),numericCounts);
  assert.equal(numeric.approvedImagePolicy,false);assert.equal(numeric.imageConformanceClaim,false);
  assert.ok(numeric.converterAssemblyReferences.length>0&&numeric.converterAssemblyReferences.every(n=>n==='System'||n.startsWith('System.')));
  for(const[p,h]of Object.entries(numeric.artifacts))assert.equal(r.artifacts['candidate/'+p],h);
  assert.deepEqual(r.numeric,{passed:numeric.numericPassed,checks:1624,report:'candidate/report.json',
    assemblySha256:numeric.converterAssemblySha256,assemblyReferences:numeric.converterAssemblyReferences,
    converterSources:numeric.converterSources,toolHashes:numeric.toolHashes});
  let inkChecks=0,primaryChecks=0,pdfChecks=0,nativeChecks=0;
  for(let i=0;i<3;i++){
    const c=r.cases[i],p=inputs.primary.report.cases[i],pdf=inputs.pdf.report.cases[i];
    assert.equal(c.numericPassed,numeric.cases[i].numericPassed);
    const expected=p.ink.records.flatMap(q=>bounds.map(k=>({quantity:q.id+'.'+k,expected:q.bound[k],limit:1e-8})))
      .concat(p.rootChecks.map(q=>({quantity:'root.'+q.quantity,expected:q.serialized,limit:.000001})));
    assert.equal(c.inkRoot.length,expected.length);
    for(let j=0;j<expected.length;j++){
      const a=c.inkRoot[j],e=expected[j];for(const[k,v]of Object.entries(e))assert.equal(a[k],v);
      assert.ok(Number.isFinite(a.observed));assert.equal(a.delta,Math.abs(a.observed-a.expected));
      assert.equal(a.passed,a.delta<=a.limit);
    }
    inkChecks+=expected.length;
    assert.deepEqual(c.primary.map(labelledPdfView),shapeViews);
    for(const o of c.primary){
      assert.deepEqual(o.evaluation,evaluateShapeTrial(p.policy,labelledPdfView(o),o));
      assert.equal(o.repeat.rawChangedPixels,0);assert.equal(o.repeat.exactRgbaMatch,true);
      assert.deepEqual(o.regions.map(q=>q.id),p.frame.regions.map(q=>q.id));
      for(let j=0;j<o.regions.length;j++)for(const[k,v]of Object.entries(p.frame.regions[j]))assert.deepEqual(o.regions[j][k],v);
      for(const file of Object.values(o.images))link(r,file);primaryChecks+=o.evaluation.checks.length;
    }
    for(const[key,policyKey]of [['originalPdf','original'],['candidatePdf','native']]){
      assert.deepEqual(c[key].map(labelledPdfView),shapePdfViews);
      for(const o of c[key]){
        assert.deepEqual(o.evaluation,evaluateShapePdfTrial(pdf.policies[policyKey],labelledPdfView(o),o));
        for(const file of Object.values(o.artifacts))link(r,file);pdfChecks+=o.evaluation.checks.length;
        const reference=pdf.observations.find(q=>q.mode===(policyKey==='original'?'original-svg':'native-ink')
          &&labelledPdfViewKey(q)===labelledPdfViewKey(o));
        assert.deepEqual(o.sourceFrame,reference.sourceFrame);assert.deepEqual(o.clipFrame,reference.clipFrame);
      }
    }
    assert.deepEqual(c.nativePage.map(labelledPdfView),shapePdfViews);
    for(let j=0;j<c.nativePage.length;j++){
      const o=c.nativePage[j],candidate=c.candidatePdf[j];
      assert.deepEqual(o.evaluation,evaluateLabelledPdfPageGuard(o.measurement,candidate.evaluation));
      assert.deepEqual(o.measurement.whole.rectangle,pdf.regions[0].rectangle);
      assert.deepEqual(o.measurement.regions.map(q=>q.id),pdf.regions.slice(1).map(q=>q.id));
      for(let k=0;k<pdf.regions.length;k++)for(const[key,value]of Object.entries(pdf.regions[k]))
        assert.deepEqual((k===0?o.measurement.whole:o.measurement.regions[k-1])[key],value);
      assert.equal(o.actualPage,candidate.artifacts['svg-page']);link(r,o.actualPage);link(r,o.referencePage);
      const anchor=pdf.observations.find(q=>q.mode==='native-ink'&&labelledPdfViewKey(q)===labelledPdfViewKey(o));
      assert.equal(o.referencePage,'calibration/pdf/'+anchor.artifacts['svg-page']);
      if(o.sheet)link(r,o.sheet);nativeChecks+=o.evaluation.checks.length+1;
    }
    const gates=labelledCombinedGateReport(c.numericPassed,c.inkRoot,c.primary,c.originalPdf,c.candidatePdf,c.nativePage);
    gates.numeric.executedChecks=numericCounts[i];assert.deepEqual(c.combined,finishLabelledCombinedGates(gates));
    assert.deepEqual(c.sources.map(q=>q.regionId),p.frame.regions.map(q=>q.id));
    for(const source of c.sources){
      assert.ok(source.semanticId&&source.svgElementId&&source.source);
      for(const k of ['offset','length','line','column'])assert.ok(Number.isSafeInteger(source.source[k])&&source.source[k]>=0);
    }
    link(r,c.source);link(r,c.scene);link(r,c.svg);
    assert.equal(c.source,'candidate/'+c.caseId+'/source.tikz');
    assert.equal(c.scene,'candidate/'+c.caseId+'/actual-scene.json');assert.equal(c.svg,'candidate/'+c.caseId+'/actual.svg');
  }
  assert.equal(r.trialPassed,r.cases.every(c=>c.combined.passed));
  assert.equal(numeric.numericPassed,r.cases.every(c=>c.numericPassed));
  assert.deepEqual(r.coverage,{cases:3,numericChecks:1624,inkRootChecks:276,primaryViews:36,primaryLocalObservations:1944,
    primaryChecks:1980,pdfViews:24,pdfLocalObservations:1296,pdfChecks:1392,nativePageViews:12,nativePageLocalObservations:648,nativePageChecks:672});
  assert.deepEqual([inkChecks,primaryChecks,pdfChecks,nativeChecks],[276,1980,1392,672]);
  assert.equal(r.agent.command,'node tools/TikzVisual/trial-labelled-border-combined.mjs');
  assert.equal(r.agent.firstFailedGate,r.cases.find(c=>!c.combined.passed)?.combined.firstFailedGate??null);
  return r.coverage;
}
