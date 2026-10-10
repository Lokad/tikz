// New gap: math-only region/fault ownership. Generic report corruption is shared.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root,sha256} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport} from './calc-saved-images.mjs';
import {verifyMathPrimaryPixels,mathNativeSourceHash,mathNativeSourcePairs} from './check-math-label-primary.mjs';
import {primaryReportCorruptions,runPrimaryReportControls} from './primary-report-controls.mjs';
assert.equal(process.argv.length,3,'Usage: math-label-primary-self-test.mjs <exact-native-calibration-report>');
const original=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'math-label-native-primary-calibration');
const styled=original.report.cases.length===1&&original.report.cases[0].id==='flowchart-styled-labels';
const first=styled?'flowchart-styled-labels':'network-math-labels';
const defects=primaryReportCorruptions(first+'/policies.json',p=>p['intrinsic-image'].rows[0].whole.rawChangedPixels++);
if(styled)defects.push(
 ['wrong-math-rule-owner',(r,json)=>json(first+'/frame.json',f=>f.records.find(m=>m.kind==='rule').nodeId='input')],
 ['missing-radical-control',r=>r.controls.splice(r.controls.findIndex(c=>c.name==='radical-overbar'),1)],
 ['wrong-controlled-mark',r=>r.controls[0].targets[0]='native-glyph-1'],
 ['missing-styled-label-region',(r,json)=>json(first+'/frame.json',f=>f.regions.splice(f.regions.findIndex(s=>s.id==='label-output'),1))]
);
else
defects.push(
 ['wrong-math-rule-owner',(r,json)=>json('network-math-labels/frame.json',f=>f.records.find(m=>m.kind==='rule').nodeId='worker1')],
 ['missing-radical-control',r=>r.controls.splice(r.controls.findIndex(c=>c.name==='assembled-radical-piece'),1)],
 ['wrong-controlled-mark',r=>r.controls[0].targets[0]='native-glyph-0'],
 ['missing-empty-label-region',(r,json)=>json('math-atom-contract/frame.json',f=>f.regions.splice(f.regions.findIndex(s=>s.id==='label-negativeSpace'),1))]
);
const controls=runPrimaryReportControls(original,verifyMathPrimaryPixels,defects),native=original.json('inputs/native-report.json'),input=original.report.nativeInputSha256;
for(const[file,digest]of Object.entries(native.sources))if(file.endsWith('.cs')||file.endsWith('.csproj')||file.endsWith('.json'))
 mathNativeSourceHash(input,file,digest,sha256(await readFile(path.join(root,file))));
const historicalInput='b124baf97409d134781e233dd605461e315387991c2bae6cba8e975ec64c650a';let acceptedSourceVersions=0;
for(const[file,pair]of Object.entries(mathNativeSourcePairs)){
 const bytes=await readFile(path.join(root,file));assert.equal(sha256(bytes),pair.current);
 assert.equal(native.sources[file],styled?pair.current:pair.historical);
 for(const actual of [pair.historical,pair.current]){assert.equal(mathNativeSourceHash(historicalInput,file,pair.historical,actual),actual);acceptedSourceVersions++;}
 for(const[name,container,historical,actual]of [
  ['unknown-current',historicalInput,pair.historical,sha256(Buffer.concat([bytes,Buffer.from('\n// unreviewed')]))],
  ['wrong-historical',historicalInput,'0'.repeat(64),pair.current],
  ['wrong-container','0'.repeat(64),pair.historical,pair.current]
 ]){assert.throws(()=>mathNativeSourceHash(container,file,historical,actual),/Unreviewed native math reader source/);controls.push(name+'-'+path.basename(file));}
}
const unreviewed='tools/TikzShapeComparison/NativeMathFaces.cs',unchanged=await readFile(path.join(root,unreviewed));
assert.throws(()=>mathNativeSourceHash(historicalInput,unreviewed,sha256(unchanged),sha256(Buffer.concat([unchanged,Buffer.from('\n// unreviewed')]))),/Unreviewed native math reader source/);controls.push('changed-unreviewed-native-source');
const pairs=Object.entries(mathNativeSourcePairs);assert.throws(()=>mathNativeSourceHash(historicalInput,pairs[0][0],pairs[0][1].historical,pairs[1][1].current),/Unreviewed native math reader source/);controls.push('exchanged-native-source-pair');
console.log(JSON.stringify({validated:true,controls,reviewedSources:Object.keys(mathNativeSourcePairs).length,acceptedSourceVersions}));
