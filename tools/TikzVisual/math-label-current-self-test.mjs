// Acceptance gap: omitted math gates, split sources and rehashed current pixels/verdicts.
import assert from 'node:assert/strict';
import path from 'node:path';
import {root} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport} from './calc-saved-images.mjs';
import {verifyMathCurrentPixels,verifyMathCurrentAnchors} from './check-math-label-current.mjs';
import {runPrimaryReportControls} from './primary-report-controls.mjs';
assert.equal(process.argv.length,6,'Usage: math-label-current-self-test.mjs <current-primary> <current-PDF> <native-primary-calibration> <native-PDF-calibration>');
const roles=['math-label-current-primary-iteration','math-label-current-pdf-iteration','math-label-native-primary-calibration','math-label-native-pdf-calibration'],bundles=[];
for(const[i,f]of process.argv.slice(2).entries())bundles.push(await loadCalcSavedReport(path.resolve(root,f),roles[i]));
const[primary,pdf,pc,dc]=bundles;
verifyMathCurrentPixels(primary,pdf,pc,dc);
const scene=primary.json('public/network-math-labels/actual-scene.json'),measurements=pc.json('events/network-math-labels/measurements.json'),anchor=measurements.anchors[0];
scene.nodes[measurements.nodes.findIndex(n=>n.name===anchor.name)].anchorsBp[anchor.anchor].x+=72/(72.27*65536);
assert.throws(()=>verifyMathCurrentAnchors(scene,measurements),undefined,'Accepted altered integer math anchor.');
const controls=['altered-integer-math-anchor',...runPrimaryReportControls(primary,p=>verifyMathCurrentPixels(p,pdf,pc,dc),[
 ['missing-primary-view',r=>r.cases[0].views.pop()],
 ['duplicate-math-case',r=>r.cases[2]=structuredClone(r.cases[0])],
 ['rehashed-primary-pixels',(r,json)=>json(r.cases[0].views[0].file,v=>v.metrics.rawChangedPixels++)],
 ['rehashed-primary-verdict',(r,json)=>json(r.cases[0].views[0].file,v=>v.evaluation.passed=!v.evaluation.passed)]
])];
controls.push(...runPrimaryReportControls(pdf,p=>verifyMathCurrentPixels(primary,p,pc,dc),[
 ['duplicate-PDF-route',r=>r.records[4]=structuredClone(r.records[0])],
 ['split-public-output',r=>r.publicInputSha256='0'.repeat(64)],
 ['forged-PDF-summary',r=>r.gates.candidate.passed=!r.gates.candidate.passed],
 ['rehashed-wrong-intrinsic-frame',(r,json)=>json('network-math-labels/views/candidate/natural/1x/record.json',v=>v.sourceFrame.x+=.25)],
 ['rehashed-PDF-pixels',(r,json)=>json(r.records[0].file,v=>v.fullPage.rawChangedPixels++)]
]));
console.log(JSON.stringify({validated:true,controls}));
