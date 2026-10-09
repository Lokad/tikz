// Acceptance gap: omission of either PDF route and consistently rehashed pixel/policy fraud.
import assert from 'node:assert/strict';
import path from 'node:path';
import {root} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport,calcHash} from './calc-saved-images.mjs';
import {verifyPathLabelPdfPixels} from './check-path-label-pdf.mjs';
import {pathLabelPdfPolicies} from './path-label-pdf-policy.mjs';
import {pathLabelImageEncodingIds} from './path-label-image-reference.mjs';

assert.equal(process.argv.length,3,'Usage: node tools/TikzVisual/path-label-pdf-self-test.mjs <exact-native-PDF-calibration-report>');
const original=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'path-label-native-pdf-calibration');
const defects=[
 ['candidate-fed-calibration',r=>r.converterInvoked=true],
 ['missing-original-view',r=>r.records.shift()],
 ['duplicate-native-encoding-view',r=>r.records[5]=structuredClone(r.records[4])],
 ['rehashed-policy',(r,json)=>json('policies.json',p=>p.candidate.rows[0].regions[0].limits.rawChangedPixels++)],
 ['rehashed-pixels-and-policy',(r,json,get)=>{
  json(r.records[0].file,p=>{p.whole.rawChangedPixels++;p.whole.premultipliedChangedPixels++;p.fullPage.rawChangedPixels++;});
  json('policies.json',p=>Object.assign(p,pathLabelPdfPolicies(r.records.map(v=>get(v.file)),get('pdf-frame.json'),pathLabelImageEncodingIds(get('frame.json')))));
 }]
];
if(original.json('frame.json').nativePathEncoding)defects.push(['missing-native-path-view',r=>r.records=r.records.filter(v=>v.encoding!=='native-paths-pt-short')]);
for(const [name,edit]of defects){const report=structuredClone(original.report),files=new Map(original.files),get=file=>JSON.parse(files.get(file));
 const json=(file,change)=>{const v=get(file);change(v);const b=Buffer.from(JSON.stringify(v,null,2)+'\n');files.set(file,b);report.artifacts[file]=calcHash(b);};
 edit(report,json,get);assert.notEqual(JSON.stringify(report),JSON.stringify(original.report),'Control did not change evidence.');
 assert.throws(()=>verifyPathLabelPdfPixels({...original,report,files,json:get}),undefined,'Accepted '+name);
}console.log(JSON.stringify({validated:true,controls:defects.map(([name])=>name)}));
