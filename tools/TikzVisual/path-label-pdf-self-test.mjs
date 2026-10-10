// Acceptance gap: omission of either PDF route and consistently rehashed pixel/policy fraud.
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {root} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport} from './calc-saved-images.mjs';
import {verifyPathLabelPdfPixels} from './check-path-label-pdf.mjs';
import {pathLabelPdfPolicies} from './path-label-pdf-policy.mjs';
import {pathLabelImageEncodingIds} from './path-label-image-reference.mjs';
import {runPrimaryReportControls} from './primary-report-controls.mjs';

export function pathLabelPdfDefects(original){
const defects=[
 ['candidate-fed-calibration',r=>r.converterInvoked=true],
 ['missing-original-view',r=>r.records.shift()],
 ['duplicate-native-encoding-view',r=>r.records[5]=structuredClone(r.records[4])],
 ['rehashed-policy',(r,json)=>json('policies.json',p=>p.candidate.rows[0].regions[0].limits.rawChangedPixels++)],
 ['rehashed-pixels-and-policy',(r,json,artifact,get)=>{
  json(r.records[0].file,p=>{p.whole.rawChangedPixels++;p.whole.premultipliedChangedPixels++;p.fullPage.rawChangedPixels++;});
  json('policies.json',p=>Object.assign(p,pathLabelPdfPolicies(r.records.map(v=>get(v.file)),get('pdf-frame.json'),pathLabelImageEncodingIds(get('frame.json')))));
 }]
];
if(original.json('frame.json').nativePathEncoding)defects.push(['missing-native-path-view',r=>r.records=r.records.filter(v=>v.encoding!=='native-paths-pt-short')]);
 return defects;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.ok([3,5].includes(process.argv.length),'Usage: path-label-pdf-self-test.mjs <native-PDF-calibration-report> [--only <comma-separated-control-names>]');
 const original=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'path-label-native-pdf-calibration');let defects=pathLabelPdfDefects(original);
 if(process.argv[3]){assert.equal(process.argv[3],'--only');const names=process.argv[4].split(',');
  assert.equal(new Set(names).size,names.length);assert.ok(names.every(name=>defects.some(([n])=>n===name)));defects=defects.filter(([name])=>names.includes(name));}
 console.log(JSON.stringify({validated:true,controls:runPrimaryReportControls(original,verifyPathLabelPdfPixels,defects)}));
}
