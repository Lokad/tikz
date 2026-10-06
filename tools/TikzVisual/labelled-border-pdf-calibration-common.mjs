// Development-only immutable qualification inputs, not a production fallback.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root,sha256,outputPath} from './shape-oracle-bundle.mjs';
import {validateLabelledPdfRasterizers} from './labelled-border-pdf-rasterizer-coverage.mjs';
import {deriveShapePdfTrialPolicy,evaluateShapePdfTrial} from './shape-pdf-trial-policy.mjs';
import {labelledBorderDefects} from './labelled-border-image-defects.mjs';

export const labelledPdfQualification={file:'artifacts/labelled-border-pdf-rasterizers/run-afde7e30-f2e7-48fd-a960-edc06bf133f4/report.json',sha256:'3c3c27cfa1d9f39671f8be1a42d838839a47ee55d7f17782e6ffeab8be710e76'};
export const labelledPdfViewKey=v=>v.frame+'-'+v.scale+'x-'+v.background;
export const labelledPdfView=v=>({frame:v.frame,scale:v.scale,background:v.background});
export async function loadLabelledPdfQualification(){
  const bytes=await readFile(path.join(root,labelledPdfQualification.file));assert.equal(sha256(bytes),labelledPdfQualification.sha256);const report=JSON.parse(bytes),folder=path.dirname(path.join(root,labelledPdfQualification.file));
  for(const[p,h]of Object.entries(report.artifacts))assert.equal(sha256(await readFile(await outputPath(folder,p))),h,p);
  for(const[p,h]of Object.entries(report.toolHashes))assert.equal(sha256(Buffer.from((await readFile(path.join(root,p),'utf8')).replaceAll('\r\n','\n'))),h,p);
  const priorBytes=await readFile(await outputPath(folder,report.prerequisite.report));assert.equal(sha256(priorBytes),report.prerequisite.sha256);validateLabelledPdfRasterizers(report,JSON.parse(priorBytes));
  return {bytes,report,folder,read:p=>readFile(outputPathSync(p))};
  function outputPathSync(p){assert.ok(!path.isAbsolute(p)&&!p.includes('\\')&&!p.includes(':')&&!p.split('/').some(s=>['..','.',''].includes(s)));return path.join(folder,p);}
}
export function deriveLabelledPdfPolicies(rows,camera,regions){
  assert.equal(rows.length,8);assert.deepEqual([...new Set(rows.map(r=>r.mode))],['original-svg','native-ink']);
  const policies={original:deriveShapePdfTrialPolicy(rows.filter(r=>r.mode==='original-svg'),camera,regions,'original-svg'),native:deriveShapePdfTrialPolicy(rows.filter(r=>r.mode==='native-ink'),camera,regions,'native-ink')};
  for(const r of rows)assert.equal(evaluateShapePdfTrial(policies[r.mode==='original-svg'?'original':'native'],labelledPdfView(r),r).passed,true);
  return policies;
}
export function labelledPdfDefects(){
  // The primary camera's 1x bevel visibility is not inherited on the page grid.
  return [...labelledBorderDefects().map(({exactAtScales,...d})=>d),
    {caseId:'lines',name:'missing-italic-period',kind:'remove-glyph',index:11,target:'glyph-11'},
    {caseId:'lines',name:'faint-italic-period-loss',kind:'glyph-opacity',index:11,value:.99,target:'glyph-11'},
    {caseId:'lines',name:'missing-v',kind:'remove-glyph',index:1,target:'glyph-1'},
    {caseId:'lines',name:'faint-v-loss',kind:'glyph-opacity',index:1,value:.99,target:'glyph-1'},
    {caseId:'transforms',name:'missing-orthogonal-connection',kind:'remove-path',index:6,target:'path-6'},
    {caseId:'transforms',name:'changed-orthogonal-join',kind:'bevel-join',index:6,target:'path-6.endpoint-1'}];
}
export function labelledPdfExpectedOutcome(defect,view){
  return defect.exactVisibilityControl?'pixel-identical':'target-rejection';
}
