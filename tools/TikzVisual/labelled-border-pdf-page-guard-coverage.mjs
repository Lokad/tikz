import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Research coverage for the exact native-page/PDF conjunction.
import assert from 'node:assert/strict';
import {labelledBorderSnapshotSha256} from './labelled-border-evidence.mjs';
import {labelledPdfDefects,labelledPdfViewKey,labelledPdfView} from './labelled-border-pdf-calibration-common.mjs';
import {validateLabelledPdfSensitivity} from './labelled-border-pdf-calibration-coverage.mjs';
import {shapePdfViews,evaluateShapePdfTrial} from './shape-pdf-trial-policy.mjs';

export const labelledPdfFailedTrial = {
  file: 'artifacts/labelled-border-pdf-sensitivity/run-1f51aff0-09e9-4eef-8d0e-bc44c1cb649c/report.json',
  sha256: 'd6eb185ef09b734f9bae67f84fad95e72b3d5f9b6bf4064ef40c1fa3c358c186',
  calibrationSha256: 'cca54b5e96f84dc4629917397a15bfa4e4311f06c65f8290815b0f2302fd33e5'
};

function link(r,p) {
  assert.equal(typeof p,'string');
  assert.ok(p.length&&!p.startsWith('/')&&!p.includes(':')&&!p.includes('\\')
    &&!p.split('/').some(s=>['..','.',''].includes(s)));
  assert.match(r.artifacts[p]??'',/^[a-f0-9]{64}$/);
}

function fullPage(m,area) {
  assert.deepEqual(Object.keys(m).sort(),['exactRgbaMatch','maxRawChannelError','rawChangedPixels']);
  assert.ok(Number.isSafeInteger(m.rawChangedPixels)&&m.rawChangedPixels>=0&&m.rawChangedPixels<=area);
  assert.ok(Number.isInteger(m.maxRawChannelError)&&m.maxRawChannelError>=0&&m.maxRawChannelError<=255);
  assert.equal(m.exactRgbaMatch,m.rawChangedPixels===0);
  assert.equal(m.maxRawChannelError===0,m.rawChangedPixels===0);
}

export function validateLabelledPdfPageGuard(r,source,calibration) {
  assert.deepEqual([r.schemaVersion,r.comparisonKind,r.completed],
    [1,'independent-labelled-border-pdf-page-guard',true]);
  assert.deepEqual([r.converterInvoked,r.approvedImagePolicy,r.imageConformanceClaim,r.overallVerdict],
    [false,false,false,'pending']);
  assert.equal(r.snapshotSha256,labelledBorderSnapshotSha256);
  assert.equal(r.sourceFile,labelledPdfFailedTrial.file);
  assert.equal(r.sourceSha256,labelledPdfFailedTrial.sha256);
  assert.equal(r.calibrationSha256,labelledPdfFailedTrial.calibrationSha256);
  assert.equal(r.calibrationSha256,source.calibrationSha256);
  requireRenderer(r.renderer, calibration.renderer);
  assert.deepEqual(r.renderer,source.renderer);
  for(const[p,h]of Object.entries(r.artifacts)){link(r,p);assert.match(h,/^[a-f0-9]{64}$/);}
  for(const[p,h]of Object.entries(r.toolHashes)){
    assert.ok(p.startsWith('tools/TikzVisual/')&&!p.includes('..'));
    assert.match(h,/^[a-f0-9]{64}$/);
    link(r,'tool-sources/'+p);
    assert.equal(r.artifacts['tool-sources/'+p],h);
  }
  assert.equal(Object.keys(r.toolHashes).length,11);
  for(const p of ['check-labelled-border-pdf-page-guard.mjs','labelled-border-pdf-page-guard.mjs'])
    assert.match(r.toolHashes['tools/TikzVisual/'+p]??'',/^[a-f0-9]{64}$/);
  link(r,'pdf-only-report.json');link(r,'calibration-report.json');link(r,'index.html');
  assert.equal(r.artifacts['pdf-only-report.json'],labelledPdfFailedTrial.sha256);
  assert.equal(r.artifacts['calibration-report.json'],labelledPdfFailedTrial.calibrationSha256);
  validateLabelledPdfSensitivity(source,calibration);
  assert.equal(source.sensitivityPassed,false);

  const defects=labelledPdfDefects();
  assert.deepEqual(r.controls.map(c=>c.caseId+'/'+c.name),defects.map(c=>c.caseId+'/'+c.name));
  let views=0,measurements=0,visibleRejections=0,exactControls=0,pdfBlindSpots=0;
  for(let i=0;i<defects.length;i++){
    const d=defects[i],control=r.controls[i],before=source.controls[i];
    const c=calibration.cases.find(c=>c.caseId===d.caseId);
    assert.equal(control.target,d.target);
    assert.equal(control.numericGatesBypassed,true);
    assert.equal(control.pdfOnlyPassed,before.passed);
    assert.deepEqual(control.views.map(labelledPdfViewKey),
      shapePdfViews.filter(v=>!d.naturalOnly||v.frame==='natural').map(labelledPdfViewKey));
    for(let j=0;j<control.views.length;j++){
      const o=control.views[j],old=before.views[j],m=o.measurement;
      assert.deepEqual(labelledPdfView(o),labelledPdfView(old));
      const rows=[m.whole,...m.regions],page=c.camera.rasterSizes[o.scale+'x'];
      assert.equal(rows.length,c.regions.length);
      fullPage(m.fullPage,page.width*page.height);
      assert.equal(m.outsideWholeChangedPixels,0);
      assert.equal(m.fullPage.rawChangedPixels-m.whole.rawChangedPixels,m.outsideWholeChangedPixels);
      const nativeChecks=rows.map((q,k)=>{
        for(const[key,value]of Object.entries(c.regions[k]))assert.deepEqual(q[key],value);
        const box=q.rasterRectangles[o.scale+'x'];
        fullPage({exactRgbaMatch:q.exactRgbaMatch,rawChangedPixels:q.rawChangedPixels,
          maxRawChannelError:q.maxRawChannelError},box.width*box.height);
        return {id:q.id,passed:q.rawChangedPixels===0&&q.maxRawChannelError===0&&q.exactRgbaMatch,
          rawChangedPixels:q.rawChangedPixels,maxRawChannelError:q.maxRawChannelError,limit:0};
      });
      // Recompute PDF verdicts against the unchanged independent policy, too.
      const pdf=evaluateShapePdfTrial(c.policies.native,labelledPdfView(old),old);
      assert.deepEqual(pdf,old.evaluation);
      const nativePassed=m.fullPage.exactRgbaMatch&&m.fullPage.maxRawChannelError===0
        &&nativeChecks.every(q=>q.passed);
      const checks=nativeChecks.map((q,k)=>({id:q.id,pdfPassed:pdf.checks[k].passed,
        nativePagePassed:q.passed,passed:pdf.checks[k].passed&&q.passed}));
      const expected={pdfOnlyPassed:pdf.passed,nativePagePassed:nativePassed,
        passed:pdf.passed&&nativePassed,checks,nativeChecks,fullPageLimit:0};
      assert.deepEqual(o.evaluation,expected);
      const target=checks.find(q=>q.id===(d.target??'whole-picture'));assert.ok(target);
      assert.equal(o.targetRejected,!target.passed);
      assert.equal(o.exactBaselinePixels,m.fullPage.exactRgbaMatch);
      // Independently scoped visibility: no blanket exemption for joins or 1x.
      const exact=d.exactVisibilityControl===true||o.scale===1
        &&['paths/changed-corner-join','transforms/changed-orthogonal-join'].includes(d.caseId+'/'+d.name);
      assert.equal(o.expectedImageOutcome,exact?'pixel-identical':'target-rejection');
      const passed=exact?expected.passed&&m.fullPage.exactRgbaMatch
        :!expected.passed&&!target.passed&&!m.fullPage.exactRgbaMatch;
      assert.equal(o.expectedOutcomePassed,passed);
      if(exact)exactControls++;else visibleRejections++;
      if(!exact&&pdf.passed)pdfBlindSpots++;
      const sheet=o.scale===1&&['paths/faint-glyph-loss','transforms/faint-period-loss']
        .includes(d.caseId+'/'+d.name)?d.caseId+'/'+d.name+'/'+labelledPdfViewKey(o)+'-native-sheet.png':null;
      assert.equal(o.sheet,sheet);if(sheet)link(r,sheet);
      views++;measurements+=rows.length;
    }
    assert.equal(control.passed,control.views.every(v=>v.expectedOutcomePassed));
  }
  assert.deepEqual([views,visibleRejections,exactControls,pdfBlindSpots],[126,114,12,4]);
  assert.deepEqual(r.coverage,{baselines:12,controls:32,views:126});
  assert.equal(r.guardPassed,r.controls.every(c=>c.passed));
  return {views,measurements,visibleRejections,exactControls,pdfBlindSpots};
}
