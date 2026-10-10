// Missing PDF routes/marks, rehashed evidence and explicit rule opt-in are acceptance gaps.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root,writeArtifact,sha256} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport} from './calc-saved-images.mjs';
import {runPrimaryReportControls} from './primary-report-controls.mjs';
import {loadMathPdfImageInputs,bindMathPdfImageInputs,verifyMathPdfImagePixels,mathPdfPolicies} from './math-label-pdf-images.mjs';
import {createRenderer} from './compare.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {measureEdgePdfPair} from './edge-pdf-image-pair.mjs';
assert.equal(process.argv.length,3,'Usage: math-label-pdf-self-test.mjs <native-PDF-image-calibration>');
const bundle=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'math-label-native-pdf-calibration');
const loaded=await loadMathPdfImageInputs(...['native','nativeCheck','primary','primaryCheck'].map(n=>bundle.report.inputs[n].file));
const styled=bundle.report.cases.length===1,id=styled?'flowchart-styled-labels':'network-math-labels',
 regionCase=styled?id:'math-atom-contract',regionId=styled?'label-output':'label-negativeSpace';
const verify=b=>{bindMathPdfImageInputs(b,loaded);return verifyMathPdfImagePixels(b);};
const controls=runPrimaryReportControls(bundle,verify,[
 ['candidate-fed-calibration',r=>r.converterInvoked=true],
 ['missing-original-pdf-view',r=>r.records.shift()],
 ['duplicate-native-pdf-view',r=>r.records[1]=structuredClone(r.records[0])],
 ['missing-native-pdf-encoding',r=>r.records=r.records.filter(v=>v.encoding!=='atlas-integer-12')],
 ['missing-radical-fault',r=>r.controls.splice(r.controls.findIndex(v=>v.name===(styled?'radical-overbar':'assembled-radical-piece')),1)],
 ['extra-unowned-math-fault',r=>r.controls.push({...structuredClone(r.controls[0]),caseId:'unknown-math-case'})],
 ['wrong-math-rule-owner',(r,json)=>json(id+'/frame.json',f=>f.records.find(v=>v.kind==='rule').nodeId=styled?'input':'worker1')],
 ['changed-native-pdf-camera',(r,json)=>json(id+'/pdf-frame.json',f=>f.camera.origin.x+=0.25)],
 ['rehashed-pdf-policy',(r,json)=>json(id+'/policies.json',p=>p.candidate.rows[0].regions[0].limits.rawChangedPixels++)],
 ['rehashed-pixels-and-policy',(r,json)=>{
  const file=r.records[0].file;json(file,p=>{p.whole.rawChangedPixels++;p.whole.premultipliedChangedPixels++;p.fullPage.rawChangedPixels++;});
  const rows=r.records.filter(v=>v.caseId===id).map(v=>JSON.parse(bundle.files.get(v.file)));
  rows[0].whole.rawChangedPixels++;rows[0].whole.premultipliedChangedPixels++;rows[0].fullPage.rawChangedPixels++;
  json(id+'/policies.json',p=>Object.assign(p,mathPdfPolicies(rows,bundle.json(id+'/pdf-frame.json'),{caseId:id,native:loaded.native,files:bundle.files})));
 }],
 [styled?'missing-output-label-region':'missing-empty-label-region',(r,json)=>json(regionCase+'/pdf-frame.json',f=>f.regions.splice(f.regions.findIndex(v=>v.id===regionId),1))],
 ...(styled?[
  ['missing-rule-pixel-policy',(r,json)=>json(id+'/policies.json',p=>delete p.candidate.rulePixels)],
  ['rehashed-rule-pixel-limit',(r,json)=>json(id+'/policies.json',p=>p.candidate.rulePixels[0].regions[0].limits[0]++)],
  ['wrong-rule-pixel-owner',(r,json)=>json(id+'/policies.json',p=>p.candidate.rulePixels[0].regions[0].id='native-rule-46')]
 ]:[])
]);
const renderer=await createRenderer();
try{
 await renderer.page.evaluate('globalThis.shapeRasterMetrics=('+createShapeRasterMetrics.toString()+')()');
 const frame=bundle.json(id+'/frame.json'),pdf=bundle.json(id+'/pdf-frame.json');
 const svg=bundle.files.get(id+'/encodings/atlas-integer-6.svg').toString();
 const input={svg,pdfPage:'data:image/png;base64,'+loaded.native.files.get(id+'/probed-pdf-page-1x.png').toString('base64'),
  ...pdf,frame:'expanded',scale:1,units:'cssPixels',svgOriginBp:{x:0,y:0},cropLimit:0,capture:false};
 await assert.rejects(()=>measureEdgePdfPair(renderer,input),/Unsupported PDF comparison element/);controls.push('default-rejects-math-rule');
 const pair=await measureEdgePdfPair(renderer,{...input,allowMathMarks:true});
 assert.deepEqual(pair.whole,bundle.json(id+'/views/atlas-integer-6/expanded/1x/record.json').whole);controls.push('explicit-rule-opt-in-preserves-native-pixels');
 for(const [key,value]of [['width','0'],['height','-1'],['width','1px'],['x','1000001'],['y','NaN']]){
  const altered=await renderer.page.evaluate(({svg,key,value})=>{const d=new DOMParser().parseFromString(svg,'image/svg+xml');d.querySelector('rect').setAttribute(key,value);return new XMLSerializer().serializeToString(d);},{svg,key,value});
  await assert.rejects(()=>measureEdgePdfPair(renderer,{...input,svg:altered,allowMathMarks:true}),/Invalid math rule rectangle/);controls.push('invalid-rule-'+key+'-'+value.replace(/[^a-z0-9]/gi,'_'));
 }
 await assert.rejects(()=>measureEdgePdfPair(renderer,{...input,allowMathMarks:'true'}),/Invalid math mark opt-in/);controls.push('nonboolean-rule-opt-in');
}finally{await renderer.browser.close();}
const output=path.join(root,'artifacts/math-pdf-image-controls',...(styled?['styled-labels']:[])),artifacts={};await writeArtifact(output,'input-report.json',bundle.bytes,artifacts);
await writeArtifact(output,'source-captures/tools/TikzVisual/math-label-pdf-self-test.mjs',await readFile(path.join(root,'tools/TikzVisual/math-label-pdf-self-test.mjs')),artifacts);
const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'math-label-pdf-image-controls',completed:true,phase:'complete',converterInvoked:false,nativeToolInvoked:false,
 approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',inputSha256:bundle.sha256,controls,artifacts},null,2)+'\n');await writeArtifact(output,'report.json',bytes);
console.log(JSON.stringify({validated:true,controls:controls.length,report:path.relative(root,path.join(output,'report.json')).replaceAll('\\','/'),sha256:sha256(bytes)}));
