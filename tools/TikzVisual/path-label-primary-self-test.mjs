// Specific acceptance gap: image summaries and rehashed policies must not be trusted.
import assert from 'node:assert/strict';
import path from 'node:path';
import {root} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport,calcHash} from './calc-saved-images.mjs';
import {verifyPathLabelPrimaryPixels} from './check-path-label-primary.mjs';

assert.equal(process.argv.length,3,'Usage: node tools/TikzVisual/path-label-primary-self-test.mjs <exact-native-calibration-report>');
const original=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'path-label-native-primary-calibration');
function mutation(edit){const report=structuredClone(original.report),files=new Map(original.files);
 function json(file,change){const value=JSON.parse(files.get(file));change(value);const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');files.set(file,bytes);report.artifacts[file]=calcHash(bytes);}
 edit(report,json);return{...original,report,files,json:file=>JSON.parse(files.get(file))};}
const defects=[
 ['candidate-fed-calibration',r=>r.converterInvoked=true],
 ['missing-native-view',r=>r.records.pop()],
 ['duplicate-native-view',r=>r.records[1]=structuredClone(r.records[0])],
 ['missing-label-control',r=>r.controls.pop()],
 ['rehashed-native-policy',(r,json)=>json('policies.json',p=>p['intrinsic-image'].rows[0].whole.rawChangedPixels++)],
 ['rehashed-false-pixel-metric',(r,json)=>json(r.records[0].file,p=>p.metrics.rawChangedPixels++)]
];
if(original.report.controls.some(c=>c.kind==='missing-label'))defects.push(
 ['missing-whole-label-control',r=>r.controls.splice(r.controls.findIndex(c=>c.kind==='missing-label'),1)]
);
if(original.json('frame.json').nativePathEncoding)defects.push(
 ['missing-native-path-encoding',r=>r.records=r.records.filter(v=>v.encoding!=='native-paths-pt-short')]
);
for(const [name,edit]of defects){const changed=mutation(edit);
 assert.notEqual(JSON.stringify(changed.report),JSON.stringify(original.report),'Control did not change its declared report/artifact: '+name);
 assert.throws(()=>verifyPathLabelPrimaryPixels(changed),undefined,'Corruption accepted: '+name);}
console.log(JSON.stringify({validated:true,controls:defects.map(([name])=>name)}));
