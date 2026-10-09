// Specific acceptance gap: image summaries and rehashed policies must not be trusted.
import assert from 'node:assert/strict';
import path from 'node:path';
import {root} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport} from './calc-saved-images.mjs';
import {verifyPathLabelPrimaryPixels} from './check-path-label-primary.mjs';
import {primaryReportCorruptions,runPrimaryReportControls} from './primary-report-controls.mjs';

assert.equal(process.argv.length,3,'Usage: node tools/TikzVisual/path-label-primary-self-test.mjs <exact-native-calibration-report>');
const original=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'path-label-native-primary-calibration');
const defects=primaryReportCorruptions('policies.json',p=>p['intrinsic-image'].rows[0].whole.rawChangedPixels++);
if(original.report.controls.some(c=>c.kind==='missing-label'))defects.push(
 ['missing-whole-label-control',r=>r.controls.splice(r.controls.findIndex(c=>c.kind==='missing-label'),1)]
);
if(original.json('frame.json').nativePathEncoding)defects.push(
 ['missing-native-path-encoding',r=>r.records=r.records.filter(v=>v.encoding!=='native-paths-pt-short')]
);
console.log(JSON.stringify({validated:true,controls:runPrimaryReportControls(original,verifyPathLabelPrimaryPixels,defects)}));
