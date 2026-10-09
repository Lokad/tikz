// New gap: math-only region/fault ownership. Generic report corruption is shared.
import assert from 'node:assert/strict';
import path from 'node:path';
import {root} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport} from './calc-saved-images.mjs';
import {verifyMathPrimaryPixels} from './check-math-label-primary.mjs';
import {primaryReportCorruptions,runPrimaryReportControls} from './primary-report-controls.mjs';
assert.equal(process.argv.length,3,'Usage: math-label-primary-self-test.mjs <exact-native-calibration-report>');
const original=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'math-label-native-primary-calibration');
const defects=primaryReportCorruptions('network-math-labels/policies.json',p=>p['intrinsic-image'].rows[0].whole.rawChangedPixels++);
defects.push(
 ['wrong-math-rule-owner',(r,json)=>json('network-math-labels/frame.json',f=>f.records.find(m=>m.kind==='rule').nodeId='worker1')],
 ['missing-radical-control',r=>r.controls.splice(r.controls.findIndex(c=>c.name==='assembled-radical-piece'),1)],
 ['wrong-controlled-mark',r=>r.controls[0].targets[0]='native-glyph-0'],
 ['missing-empty-label-region',(r,json)=>json('math-atom-contract/frame.json',f=>f.regions.splice(f.regions.findIndex(s=>s.id==='label-negativeSpace'),1))]
);
console.log(JSON.stringify({validated:true,controls:runPrimaryReportControls(original,verifyMathPrimaryPixels,defects)}));
