// Acceptance gaps: split output provenance, omitted gates and rehashed current metrics/verdicts.
import assert from 'node:assert/strict';
import path from 'node:path';
import {root} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport,calcHash} from './calc-saved-images.mjs';
import {verifyPathLabelCurrentPixels} from './check-path-label-current.mjs';

assert.equal(process.argv.length,4,'Usage: node tools/TikzVisual/path-label-current-self-test.mjs <current-primary-report> <current-PDF-report>');
const primary=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'path-label-current-primary-iteration'),pdf=await loadCalcSavedReport(path.resolve(root,process.argv[3]),'path-label-current-pdf-iteration');
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
for(const[name,which,edit]of defects){const original=which==='primary'?primary:pdf,report=structuredClone(original.report),files=new Map(original.files);
 const json=(file,change)=>{const v=JSON.parse(files.get(file));change(v);const b=Buffer.from(JSON.stringify(v,null,2)+'\n');files.set(file,b);report.artifacts[file]=calcHash(b);};
 edit(report,json);assert.notEqual(JSON.stringify(report),JSON.stringify(original.report),'Control did not change evidence.');
 const changed={...original,report,files,json:file=>JSON.parse(files.get(file))};
 assert.throws(()=>verifyPathLabelCurrentPixels(which==='primary'?changed:primary,which==='pdf'?changed:pdf),undefined,'Accepted '+name);
}console.log(JSON.stringify({validated:true,controls:defects.map(([name])=>name)}));
