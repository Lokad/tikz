// New ownership semantics; artifact overlays/rehashed-report controls are shared.
import assert from 'node:assert/strict';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport} from './calc-saved-images.mjs';
import {runPrimaryReportControls} from './primary-report-controls.mjs';
import {validateMathPdfReference,mathNativePdfFrame,verifyMathPdfReplay} from './math-label-pdf-native.mjs';
assert.equal(process.argv.length,6,'Usage: math-label-pdf-native-self-test.mjs <native-pdf-report> <native-path-report> <primary-calibration> <native-pdf-check>');
const original=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'math-label-native-pdf-reference'),
 wrappers=await loadCalcSavedReport(path.resolve(root,process.argv[3]),'math-label-path-native'),
 primary=await loadCalcSavedReport(path.resolve(root,process.argv[4]),'math-label-native-primary-calibration'),
 checked=await loadCalcSavedReport(path.resolve(root,process.argv[5]),'math-label-independent-native-pdf-check');
assert.equal(checked.report.nativeInputSha256,original.sha256);
const verify=bundle=>{
 validateMathPdfReference(bundle,wrappers);verifyMathPdfReplay(bundle,checked.report.replay);
 for(const c of checked.report.frames)assert.deepEqual(mathNativePdfFrame(bundle,c.id,primary.json(c.id+'/frame.json')),checked.json(c.id+'/pdf-frame.json'));
};
verify(original);
const controls=runPrimaryReportControls(original,verify,[
 ['converter-fed-native-reference',r=>r.converterInvoked=true],
 ['missing-math-case',r=>r.cases.pop()],
 ['duplicate-math-case',r=>r.cases[1]=structuredClone(r.cases[0])],
 ['wrong-wrapper-owner',r=>r.wrapperInputSha256='0'.repeat(64)],
 ['rehashed-native-font',(r,json)=>json('network-math-labels/plain/native-inputs.json',v=>v['rm-lmr5.tfm']='0'.repeat(64))],
 ['rehashed-page-position',(r,json)=>json('network-math-labels/measurements.json',v=>v.page.boxXSp++)],
 ['rehashed-wrapper-glue',(r,json)=>json('network-math-labels/measurements.json',v=>v.wrapperExtraWidthSp++)],
 ['missing-native-anchor',(r,json)=>json('math-atom-contract/measurements.json',v=>v.anchors.pop())]
]);
// Both original/probed equality and rehashing can be forged together. The saved
// independent source replay remains a separate observation and must reject it.
const forged={...original,report:structuredClone(original.report),files:new Map(original.files)},bytes=Buffer.from(original.files.get('network-math-labels/probed-reference.pdf'));bytes[100]^=1;
for(const state of ['plain','probed']){
 const file='network-math-labels/'+state+'-reference.pdf';forged.files.set(file,bytes);forged.report.artifacts[file]=sha256(bytes);
}
for(const [file,digest]of Object.entries(forged.report.artifacts))assert.equal(sha256(forged.files.get(file)),digest);
assert.throws(()=>verifyMathPdfReplay(forged,checked.report.replay),/Native PDF source replay differs/);
controls.push('matching-pdf-corruption-rejected-by-source-replay');
const badFrame=structuredClone(primary.json('math-atom-contract/frame.json'));badFrame.regions[0].rectangle.x=1000000;
assert.throws(()=>mathNativePdfFrame(original,'math-atom-contract',badFrame),/Region escapes the native page/);controls.push('crop-outside-native-page');
const output=path.join(root,'artifacts/math-pdf-native-controls'),report={schemaVersion:1,role:'math-label-native-pdf-ownership-controls',completed:true,phase:'complete',
 converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',
 inputSha256:original.sha256,nativeCheckSha256:checked.sha256,controls,
 artifacts:{'input-report.json':original.sha256}};
await writeArtifact(output,'input-report.json',original.bytes);const b=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',b);
console.log(JSON.stringify({validated:true,controls,report:path.relative(root,path.join(output,'report.json')),sha256:sha256(b)}));
