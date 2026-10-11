// Specific acceptance gap: image summaries and rehashed policies must not be trusted.
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {root} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport} from './calc-saved-images.mjs';
import {verifyPathLabelPrimaryPixels} from './check-path-label-primary.mjs';
import {primaryReportCorruptions,runPrimaryReportControls} from './primary-report-controls.mjs';

export function pathLabelPrimaryDefects(original){
const defects=primaryReportCorruptions('policies.json',p=>p['intrinsic-image'].rows[0].whole.rawChangedPixels++);
for(const kind of ['wrong-fill-rule','wrong-clip-rule'])if(original.report.controls.some(c=>c.kind===kind))defects.push(
 ['missing-'+kind+'-control',r=>r.controls.splice(r.controls.findIndex(c=>c.kind===kind),1)]
);
if(original.report.controls.some(c=>c.kind==='wrong-default-fill'))defects.push(
 ['missing-wrong-default-fill-control',r=>r.controls.splice(r.controls.findIndex(c=>c.kind==='wrong-default-fill'),1)]
);
if(original.report.controls.some(c=>c.kind==='missing-label'))defects.push(
 ['missing-whole-label-control',r=>r.controls.splice(r.controls.findIndex(c=>c.kind==='missing-label'),1)]
);
if(original.json('frame.json').nativePathEncoding)defects.push(
 ['missing-native-path-encoding',r=>r.records=r.records.filter(v=>v.encoding!=='native-paths-pt-short')]
);
if(original.report.rootRegistrations?.length)defects.push(
 ['missing-native-root-registration',r=>r.rootRegistrations.pop()],
 ['rehashed-root-registration-metric',(r,json)=>json(r.rootRegistrations[0].file,p=>p.metrics.topology.componentDifference++)],
 ['inflated-native-component-policy',(r,json)=>json('policies.json',p=>p['intrinsic-image'].rows.find(v=>v.frame==='natural'&&v.scale===1&&v.background==='white').regions.find(v=>v.id==='native-glyph-1').limits.componentDifference++)],
 ['out-of-scope-native-component-policy',(r,json)=>json('policies.json',p=>p['explicit-viewport'].rows[0].whole.componentDifference++)],
 ['missing-affected-glyph-control',r=>r.controls.splice(r.controls.findIndex(c=>c.target==='native-glyph-1'&&c.kind==='missing'),1)]
);
 return defects;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.ok([3,5].includes(process.argv.length),'Usage: path-label-primary-self-test.mjs <native-calibration-report> [--only <comma-separated-control-names>]');
 const original=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'path-label-native-primary-calibration');
 let defects=pathLabelPrimaryDefects(original);
 if(process.argv[3]){assert.equal(process.argv[3],'--only');const names=process.argv[4].split(',');
  assert.equal(new Set(names).size,names.length);assert.ok(names.every(name=>defects.some(([n])=>n===name)));
  defects=defects.filter(([name])=>names.includes(name));}
 console.log(JSON.stringify({validated:true,controls:runPrimaryReportControls(original,verifyPathLabelPrimaryPixels,defects)}));
}
