// Acceptance gap: omitted math gates, split sources and rehashed current pixels/verdicts.
import assert from 'node:assert/strict';
import path from 'node:path';
import {root} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport} from './calc-saved-images.mjs';
import {verifyMathCurrentPixels,verifyMathCurrentAnchors,verifyMathCurrentLabels} from './check-math-label-current.mjs';
import {runPrimaryReportControls} from './primary-report-controls.mjs';
assert.equal(process.argv.length,6,'Usage: math-label-current-self-test.mjs <current-primary> <current-PDF> <native-primary-calibration> <native-PDF-calibration>');
const roles=['math-label-current-primary-iteration','math-label-current-pdf-iteration','math-label-native-primary-calibration','math-label-native-pdf-calibration'],bundles=[];
for(const[i,f]of process.argv.slice(2).entries())bundles.push(await loadCalcSavedReport(path.resolve(root,f),roles[i]));
const[primary,pdf,pc,dc]=bundles;
verifyMathCurrentPixels(primary,pdf,pc,dc);
const id=primary.report.cases[0].id,sceneFile='public/'+id+'/actual-scene.json',scene=primary.json(sceneFile),measurements=pc.json('events/'+id+'/measurements.json'),anchor=measurements.anchors[0];
scene.nodes[measurements.nodes.findIndex(n=>n.name===anchor.name)].anchorsBp[anchor.anchor].x+=72/(72.27*65536);
assert.throws(()=>verifyMathCurrentAnchors(scene,measurements),undefined,'Accepted altered integer math anchor.');
const labelScene=primary.json(sceneFile);labelScene.nodes[0].text.widthSp++;
assert.throws(()=>verifyMathCurrentLabels(labelScene,measurements),undefined,'Accepted altered integer text dimension.');
const controls=['altered-integer-math-anchor','altered-integer-text-dimension',...runPrimaryReportControls(primary,p=>verifyMathCurrentPixels(p,pdf,pc,dc),[
 ['missing-primary-view',r=>r.cases[0].views.pop()],
 ['duplicate-math-case',r=>r.cases.push(structuredClone(r.cases[0]))],
 ['rehashed-primary-pixels',(r,json)=>json(r.cases[0].views[0].file,v=>v.metrics.rawChangedPixels++)],
 ['rehashed-primary-verdict',(r,json)=>json(r.cases[0].views[0].file,v=>v.evaluation.passed=!v.evaluation.passed)]
])];
// Ownership is common to both families; exercise these two faults once.
if(primary.report.pixelCheckOwner!==undefined&&id!=='flowchart-styled-labels')controls.push(...runPrimaryReportControls(primary,p=>verifyMathCurrentPixels(p,pdf,pc,dc),[
 ['missing-independent-pixel-owner',r=>delete r.pixelCheckOwner],
 ['forged-independent-pixel-owner',r=>r.pixelCheckOwner='producer']
]));
controls.push(...runPrimaryReportControls(pdf,p=>verifyMathCurrentPixels(primary,p,pc,dc),[
 ['duplicate-PDF-route',r=>r.records[4]=structuredClone(r.records[0])],
 ['split-public-output',r=>r.publicInputSha256='0'.repeat(64)],
 ['forged-PDF-summary',r=>r.gates.candidate.passed=!r.gates.candidate.passed],
 ['rehashed-wrong-intrinsic-frame',(r,json)=>json(id+'/views/candidate/natural/1x/record.json',v=>v.sourceFrame.x+=.25)],
 ['rehashed-PDF-pixels',(r,json)=>json(r.records[0].file,v=>v.fullPage.rawChangedPixels++)]
]));
if(pdf.report.pixelCheckOwner!==undefined&&id!=='flowchart-styled-labels')controls.push(...runPrimaryReportControls(pdf,p=>verifyMathCurrentPixels(primary,p,pc,dc),[
 ['missing-independent-PDF-pixel-owner',r=>delete r.pixelCheckOwner],
 ['forged-independent-PDF-pixel-owner',r=>r.pixelCheckOwner='producer']
]));
if(id==='flowchart-styled-labels')controls.push(...runPrimaryReportControls(pdf,p=>verifyMathCurrentPixels(primary,p,pc,dc),[
 ['missing-styled-rule-envelope',(r,json)=>json('calibration/'+id+'/policies.json',p=>delete p.candidate.rulePixels)],
 ['rehashed-styled-rule-envelope',(r,json)=>json('calibration/'+id+'/policies.json',p=>p.candidate.rulePixels[0].regions[0].limits[0]++)]
]));
console.log(JSON.stringify({validated:true,controls}));
