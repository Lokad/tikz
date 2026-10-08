// Acceptance gap: complete-text coverage and rehashed summaries must be independently checked.
import assert from 'node:assert/strict';
import path from 'node:path';
import {root} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport,calcHash} from './calc-saved-images.mjs';
import {verifyPathLabelTextPixels} from './check-path-label-text-sensitivity.mjs';

assert.equal(process.argv.length,3,'Usage: node tools/TikzVisual/path-label-text-self-test.mjs <exact-sensitivity-report>');
const original=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'path-label-complete-text-sensitivity');
const defects=[
 ['missing-whole-label',r=>r.controls.pop()],
 ['first-glyph-only',r=>r.controls[0].targets.splice(1)],
 ['missing-control-view',r=>r.controls[0].comparisons.pop()],
 ['rehashed-false-pixel-metric',(r,json)=>json(r.controls[0].comparisons[0].file,v=>v.metrics.rawChangedPixels++)],
 ['rehashed-false-verdict',(r,json)=>json(r.controls[0].comparisons[0].file,v=>v.evaluation.passed=!v.evaluation.passed)]
];
for(const [name,edit]of defects){const report=structuredClone(original.report),files=new Map(original.files);
 const json=(file,change)=>{const v=JSON.parse(files.get(file));change(v);const b=Buffer.from(JSON.stringify(v,null,2)+'\n');files.set(file,b);report.artifacts[file]=calcHash(b);};
 edit(report,json);assert.notEqual(JSON.stringify(report),JSON.stringify(original.report),'Control did not change evidence.');
 assert.throws(()=>verifyPathLabelTextPixels({...original,report,files,json:file=>JSON.parse(files.get(file))}),undefined,'Accepted '+name);
}console.log(JSON.stringify({validated:true,controls:defects.map(([name])=>name)}));
