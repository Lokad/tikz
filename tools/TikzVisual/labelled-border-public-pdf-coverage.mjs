// Frozen independent image controls, applied to fresh actual public SVGs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root,sha256,outputPath} from './shape-oracle-bundle.mjs';
import {labelledCombinedInputs,verifyLabelledSourceHashes} from './labelled-border-combined-common.mjs';
import {validateLabelledCombinedTrial} from './labelled-border-combined-coverage.mjs';
import {labelledPdfDefects,labelledPdfView,labelledPdfViewKey,labelledPdfExpectedOutcome} from './labelled-border-pdf-calibration-common.mjs';
import {validateLabelledPdfSensitivity} from './labelled-border-pdf-calibration-coverage.mjs';
import {labelledPdfFailedTrial,validateLabelledPdfPageGuard} from './labelled-border-pdf-page-guard-coverage.mjs';
import {shapePdfViews,evaluateShapePdfTrial,shapePdfMetricRecord} from './shape-pdf-trial-policy.mjs';
import {evaluateLabelledPdfPageGuard,labelledPdfGuardExpectation} from './labelled-border-pdf-page-guard.mjs';

export const labelledPublicPdfEvidence={
  source:{file:labelledPdfFailedTrial.file,sha256:labelledPdfFailedTrial.sha256},
  guard:{file:'artifacts/labelled-border-pdf-page-guard/run-545530c3-a77a-4b9c-9cb2-bf0072aeca2a/report.json',
    sha256:'9c5b8c707f4f1053e169bc919e3400bd2b1e50f3f137ec7db2e61862b3ba35ee'}
};
export async function loadLabelledPublicPdfEvidence(inputs){
  const loaded={};
  for(const[key,pin]of Object.entries(labelledPublicPdfEvidence)){
    const bytes=await readFile(path.join(root,pin.file));assert.equal(sha256(bytes),pin.sha256);
    const report=JSON.parse(bytes),folder=path.dirname(path.join(root,pin.file));
    const read=async p=>readFile(await outputPath(folder,p));
    for(const[p,h]of Object.entries(report.artifacts))assert.equal(sha256(await read(p)),h,p);
    await verifyLabelledSourceHashes(report.toolHashes);loaded[key]={bytes,report,folder,read};
  }
  validateLabelledPdfSensitivity(loaded.source.report,inputs.pdf.report);
  validateLabelledPdfPageGuard(loaded.guard.report,loaded.source.report,inputs.pdf.report);
  assert.equal(loaded.guard.report.guardPassed,true);assert.equal(loaded.source.report.sensitivityPassed,false);
  return loaded;
}
function link(r,p){
  assert.ok(typeof p==='string'&&p.length&&!p.startsWith('/')&&!p.includes('\\')&&!p.includes(':')
    &&!p.split('/').some(s=>['..','.',''].includes(s)));assert.match(r.artifacts[p]??'',/^[a-f0-9]{64}$/);
}
export function validateLabelledPublicPdfSensitivity(r,inputs,independent,baseline,numeric){
  assert.deepEqual([r.schemaVersion,r.comparisonKind,r.completed],[1,'public-labelled-border-pdf-image-sensitivity',true]);
  assert.deepEqual([r.converterInvoked,r.numericGatesBypassed,r.approvedImagePolicy,r.imageConformanceClaim,r.overallVerdict],
    [true,true,false,false,'pending']);
  assert.deepEqual(r.inputs,labelledCombinedInputs);assert.deepEqual(r.independentInputs,labelledPublicPdfEvidence);
  assert.equal(r.snapshotSha256,baseline.snapshotSha256);assert.deepEqual(r.renderer,baseline.renderer);
  for(const[p,h]of Object.entries(r.artifacts)){link(r,p);assert.match(h,/^[a-f0-9]{64}$/);}
  for(const[p,h]of Object.entries(r.toolHashes)){
    assert.ok(p.startsWith('tools/TikzVisual/')&&!p.includes('..'));link(r,'tool-sources/'+p);
    assert.equal(r.artifacts['tool-sources/'+p],h);
  }
  assert.ok(Object.keys(r.toolHashes).length>=26);
  for(const key of ['source','guard']){
    link(r,'independent/'+key+'-report.json');
    assert.equal(r.artifacts['independent/'+key+'-report.json'],labelledPublicPdfEvidence[key].sha256);
  }
  link(r,r.baseline.report);assert.equal(r.baseline.report,'baseline/report.json');
  assert.match(r.baseline.sourceFile,/^artifacts\/labelled-border-combined-trial\/run-[a-f0-9-]+\/report.json$/);
  assert.equal(r.artifacts[r.baseline.report],r.baseline.sha256);
  assert.equal(r.baseline.completed,true);assert.equal(r.baseline.trialPassed,true);
  validateLabelledCombinedTrial(baseline,inputs,numeric);assert.equal(baseline.trialPassed,true);
  for(const[p,h]of Object.entries(baseline.artifacts))assert.equal(r.artifacts['baseline/'+p],h);
  const defects=labelledPdfDefects();
  assert.deepEqual(r.controls.map(c=>c.caseId+'/'+c.name),defects.map(c=>c.caseId+'/'+c.name));
  let views=0,measurements=0,visible=0,exact=0,blind=0;
  for(let i=0;i<defects.length;i++){
    const d=defects[i],c=r.controls[i],before=independent.source.report.controls[i],oldGuard=independent.guard.report.controls[i];
    for(const[k,v]of Object.entries(d))assert.deepEqual(c[k],v);
    assert.equal(c.numericGatesBypassed,true);link(r,c.svg);assert.equal(c.svg,d.caseId+'/'+d.name+'.svg');
    const base=baseline.cases.find(c=>c.caseId===d.caseId),pdf=inputs.pdf.report.cases.find(c=>c.caseId===d.caseId);
    const source=base.sources.find(q=>q.regionId===d.target)??null;
    assert.deepEqual(c.targetSource,source);
    assert.deepEqual(c.views.map(labelledPdfView),shapePdfViews.filter(v=>!d.naturalOnly||v.frame==='natural'));
    for(let j=0;j<c.views.length;j++){
      const o=c.views[j],b=before.views[j],g=oldGuard.views[j];
      assert.deepEqual(labelledPdfView(o),labelledPdfView(b));
      const expected=evaluateShapePdfTrial(pdf.policies.native,labelledPdfView(o),o);
      assert.deepEqual(o.evaluation,expected);
      // Public mutations must preserve the independent control's entire pixel pattern.
      assert.equal(r.artifacts[o.artifacts['svg-page']],independent.source.report.artifacts[b.artifacts['svg-page']]);
      for(const k of ['sourceFrame','clipFrame','pageSize','repeat','fullPage','outsideWholeChangedPixels'])assert.deepEqual(o[k],b[k]);
      assert.deepEqual(shapePdfMetricRecord(o.whole),shapePdfMetricRecord(b.whole));
      assert.equal(o.regions.length,b.regions.length);
      for(let k=0;k<o.regions.length;k++)assert.deepEqual(shapePdfMetricRecord(o.regions[k]),shapePdfMetricRecord(b.regions[k]));
      const m=o.guard.measurement;assert.deepEqual(JSON.parse(JSON.stringify(m)),g.measurement);
      assert.deepEqual(o.guard.evaluation,evaluateLabelledPdfPageGuard(m,expected));
      const anchor=pdf.observations.find(q=>q.mode==='native-ink'&&labelledPdfViewKey(q)===labelledPdfViewKey(o));
      assert.equal(o.guard.referencePage,'baseline/calibration/pdf/'+anchor.artifacts['svg-page']);
      assert.equal(o.guard.actualPage,o.artifacts['svg-page']);link(r,o.guard.referencePage);link(r,o.guard.actualPage);
      for(const p of Object.values(o.artifacts))link(r,p);
      const crops=o.regions.filter(q=>q.crops);assert.equal(crops.length,d.target?1:0);
      for(const q of crops){assert.equal(q.id,d.target);
        assert.deepEqual(q.crops.presentation,{background:'white',integerEnlargement:o.scale===1?4:1,
          rawDifferenceAmplification:16,rasterRectangle:q.rasterRectangles[o.scale+'x']});
        for(const[k,p]of Object.entries(q.crops))if(k!=='presentation')link(r,p);
      }
      const evaluation=o.guard.evaluation,target=evaluation.checks.find(q=>q.id===(d.target??'whole-picture'));assert.ok(target);
      assert.equal(o.targetRejected,!target.passed);assert.equal(o.exactBaselinePixels,m.fullPage.exactRgbaMatch);
      const outcome=labelledPdfGuardExpectation(d,o);assert.equal(o.expectedImageOutcome,outcome);
      const passed=outcome==='pixel-identical'?evaluation.passed&&o.exactBaselinePixels
        :!evaluation.passed&&!target.passed&&!o.exactBaselinePixels;
      assert.equal(o.expectedOutcomePassed,passed);
      const pdfTarget=expected.checks.find(q=>q.id===(d.target??'whole-picture'));
      const pdfOnlyOutcome=labelledPdfExpectedOutcome(d,o);
      assert.equal(o.pdfOnlyExpectedOutcomePassed,pdfOnlyOutcome==='pixel-identical'?expected.passed&&o.exactBaselinePixels
        :!expected.passed&&!pdfTarget.passed&&!o.exactBaselinePixels);
      const sheet=o.scale===1&&['paths/faint-glyph-loss','transforms/faint-period-loss'].includes(d.caseId+'/'+d.name)
        ?d.caseId+'/'+d.name+'/'+labelledPdfViewKey(o)+'-native-sheet.png':null;
      assert.equal(o.guard.sheet,sheet);if(sheet)link(r,sheet);
      views++;measurements+=o.regions.length+1;
      if(outcome==='pixel-identical')exact++;else{visible++;if(expected.passed)blind++;}
    }
    assert.equal(c.passed,c.views.every(o=>o.expectedOutcomePassed));
    assert.equal(c.pdfOnlyPassed,c.views.every(o=>o.pdfOnlyExpectedOutcomePassed));
    assert.equal(c.pdfOnlyPassed,before.passed);
  }
  assert.deepEqual([views,measurements,visible,exact,blind],[126,6732,114,12,4]);
  assert.equal(r.sensitivityPassed,r.controls.every(c=>c.passed));
  assert.equal(r.pdfOnlySensitivityPassed,r.controls.every(c=>c.pdfOnlyPassed));assert.equal(r.pdfOnlySensitivityPassed,false);
  assert.deepEqual(r.coverage,{baselineCases:3,baselineGates:18,controls:32,views:126,localObservations:6606,
    visibleRejections:114,exactVisibilityControls:12,pdfOnlyBlindSpotViews:4,independentControlPixelMatches:126});
  link(r,r.agent.viewer);assert.equal(r.agent.command,'node tools/TikzVisual/check-labelled-border-public-pdf-sensitivity.mjs');
  const firstUnexpected=r.controls.find(c=>!c.passed);
  assert.equal(r.agent.firstUnexpectedControl,firstUnexpected?firstUnexpected.caseId+'/'+firstUnexpected.name:null);
  return r.coverage;
}
