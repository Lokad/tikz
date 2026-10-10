// Acceptance gaps: split output provenance, omitted gates and rehashed current metrics/verdicts.
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {root} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport} from './calc-saved-images.mjs';
import {verifyPathLabelCurrentPixels} from './check-path-label-current.mjs';
import {runPrimaryReportControls} from './primary-report-controls.mjs';

export function pathLabelCurrentDefects(primary,pdf){
const defects=[
 ['missing-primary-view','primary',r=>r.records.pop()],
 ['duplicate-PDF-route','pdf',r=>r.records[4]=structuredClone(r.records[0])],
 ['split-numeric-output','pdf',r=>r.inputs.numericSha256='0'.repeat(64)],
 ['forged-PDF-summary','pdf',r=>r.gates.candidate.passed=!r.gates.candidate.passed],
 ['rehashed-wrong-intrinsic-frame','pdf',(r,json)=>json('views/candidate/natural/1x/record.json',v=>v.sourceFrame.x+=.25)],
 ['rehashed-primary-pixels','primary',(r,json)=>json(r.records[0].file,v=>v.metrics.rawChangedPixels++)],
 ['rehashed-PDF-pixels','pdf',(r,json)=>json(r.records[0].file,v=>v.fullPage.rawChangedPixels++)],
 ['rehashed-current-verdict','primary',(r,json)=>json(r.records[0].file,v=>v.evaluation.passed=!v.evaluation.passed)]
];
 if(primary.report.verificationMode==='iteration')defects.push(
  ['iteration-cannot-claim-qualification','primary',r=>r.verificationMode='qualification'],
  ['missing-iteration-mode','primary',r=>delete r.verificationMode],
  ['unreviewed-reference-reuse','pdf',r=>r.reusedOriginalReference=false],
  ['rehashed-reused-reference','pdf',(r,json)=>json(r.records[0].file,v=>v.sourceFrame.x+=.25)]
 );
 return defects;
}
export function runPathLabelCurrentControls(primary,pdf){
 const defects=pathLabelCurrentDefects(primary,pdf),controls=[];
 for(const which of ['primary','pdf'])controls.push(...runPrimaryReportControls(which==='primary'?primary:pdf,
  changed=>verifyPathLabelCurrentPixels(which==='primary'?changed:primary,which==='pdf'?changed:pdf),
  defects.filter(([,owner])=>owner===which).map(([name,,edit])=>[name,edit])));
 return controls;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,4,'Usage: path-label-current-self-test.mjs <current-primary-report> <current-PDF-report>');
 const primary=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'path-label-current-primary-iteration'),pdf=await loadCalcSavedReport(path.resolve(root,process.argv[3]),'path-label-current-pdf-iteration');
 console.log(JSON.stringify({validated:true,controls:runPathLabelCurrentControls(primary,pdf)}));
}
