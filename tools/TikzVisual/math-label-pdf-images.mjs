// Math scope/ownership is separate; capture, policy envelopes and PNG decoding are shared.
import assert from 'node:assert/strict';
import path from 'node:path';
import {root} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport,calcEqual} from './calc-saved-images.mjs';
import {mathFramingCases} from './math-label-framing.mjs';
import {mathPrimaryEncodings,mathNativeImageSha256,mathPrimaryControls} from './math-label-primary.mjs';
import {mathNativePdfFrame,verifyMathPdfReplay} from './math-label-pdf-native.mjs';
import {nativePdfPolicies} from './path-label-pdf-policy.mjs';
import {shapePdfViews,evaluateShapePdfTrial} from './shape-pdf-trial-policy.mjs';
import {measureEdgePdfPair} from './edge-pdf-image-pair.mjs';
import {pdfPagePixelReader} from './path-label-pdf-pixels.mjs';
export const mathPdfKey=v=>v.frame+'/'+v.scale+'x';
export const mathPdfSources=['math-label-pdf-images.mjs','math-label-pdf-native.mjs','math-label-primary.mjs',
 'math-label-framing.mjs','edge-pdf-image-pair.mjs','path-label-pdf-policy.mjs','path-label-pdf-pixels.mjs',
 'shape-pdf-trial-policy.mjs','shape-pdf-camera.mjs','shape-raster-metrics.mjs','calc-png.mjs',
 'calc-saved-images.mjs','shape-oracle-bundle.mjs','compare.mjs','browser-profile.json','package.json','package-lock.json'];
export async function loadMathPdfImageInputs(pdfFile,pdfCheckFile,primaryFile,primaryCheckFile){
 const native=await loadCalcSavedReport(path.resolve(root,pdfFile),'math-label-native-pdf-reference');
 const nativeCheck=await loadCalcSavedReport(path.resolve(root,pdfCheckFile),'math-label-independent-native-pdf-check');
 const primary=await loadCalcSavedReport(path.resolve(root,primaryFile),'math-label-native-primary-calibration');
 const primaryCheck=await loadCalcSavedReport(path.resolve(root,primaryCheckFile),'math-label-independent-primary-check');
 assert.equal(nativeCheck.report.nativeInputSha256,native.sha256);assert.ok(nativeCheck.files.get('input-report.json').equals(native.bytes));
 calcEqual(nativeCheck.report.sourceReplay,{pdfs:6,rasters:12});assert.equal(nativeCheck.report.requiredRegions,634);
 assert.equal(primaryCheck.report.inputSha256,primary.sha256);assert.ok(primaryCheck.files.get('input-report.json').equals(primary.bytes));
 assert.equal(primaryCheck.report.sourceRecaptures,220);assert.equal(primary.report.nativeInputSha256,mathNativeImageSha256);
 assert.equal(nativeCheck.report.primaryInputSha256,primary.sha256);assert.equal(nativeCheck.report.primaryCheckSha256,primaryCheck.sha256);
 verifyMathPdfReplay(native,nativeCheck.report.replay);
 for(const c of mathFramingCases)calcEqual(mathNativePdfFrame(native,c.id,primary.json(c.id+'/frame.json')),nativeCheck.json(c.id+'/pdf-frame.json'));
 return{native,nativeCheck,primary,primaryCheck};
}
export function bindMathPdfImageInputs(bundle,loaded){
 for(const[name,b]of Object.entries(loaded))assert.equal(bundle.report.inputs[name].sha256,b.sha256,'Changed math PDF owner.');
 assert.ok(bundle.files.get('native/report.json').equals(loaded.native.bytes));
 for(const[f,b]of loaded.native.files)assert.ok(bundle.files.get('native/'+f).equals(b),'Changed native PDF artifact.');
 for(const name of ['nativeCheck','primary','primaryCheck'])assert.ok(bundle.files.get('inputs/'+name+'-report.json').equals(loaded[name].bytes));
 for(const c of mathFramingCases){
  calcEqual(bundle.json(c.id+'/frame.json'),loaded.primary.json(c.id+'/frame.json'),'Changed math PDF mark ownership.');
  calcEqual(bundle.json(c.id+'/pdf-frame.json'),loaded.nativeCheck.json(c.id+'/pdf-frame.json'),'Changed math PDF camera.');
  assert.ok(bundle.files.get(c.id+'/encodings/original.svg').equals(loaded.primary.files.get('events/'+c.id+'/oracle.svg')));
  for(const e of mathPrimaryEncodings)assert.ok(bundle.files.get(c.id+'/encodings/'+e+'.svg').equals(loaded.primary.files.get(c.id+'/encodings/'+e+'.svg')));
 }
}
export function mathPdfPolicies(rows,pdf){return nativePdfPolicies(rows,pdf,mathPrimaryEncodings);}
export async function measureMathPdf(renderer,{native,caseId,frame,pdf,svg,encoding,view,target}){
 return measureEdgePdfPair(renderer,{svg,pdfPage:'data:image/png;base64,'+native.files.get(caseId+'/probed-pdf-page-'+view.scale+'x.png').toString('base64'),
  ...pdf,...view,allowMathMarks:true,units:encoding==='original'?'bp':'cssPixels',svgOriginBp:encoding==='original'?frame.origin:{x:0,y:0},
  cropLimit:target?1:0,cropRegionIds:target?[target]:[],rightLabel:encoding==='original'?'Original native TikZ SVG':'Math SVG'});
}
export function verifyMathPdfImagePixels(bundle){
 const r=bundle.report;assert.equal(r.converterInvoked,false);assert.equal(r.nativeToolInvoked,false);
 calcEqual(r.cases.map(c=>c.id),mathFramingCases.map(c=>c.id));
 assert.equal(r.controls.length,19,'Unexpected math PDF fault coverage.');
 const expected=mathFramingCases.flatMap(c=>['original',...mathPrimaryEncodings].flatMap(e=>shapePdfViews.map(v=>c.id+'/'+e+'/'+mathPdfKey(v))));
 calcEqual(r.records.map(v=>v.caseId+'/'+v.encoding+'/'+mathPdfKey(v)).sort(),expected.sort(),'Math PDF native view coverage differs.');
 let comparisons=0,regions=0,visible=0,invisible=0;
 for(const c of mathFramingCases){
  const frame=bundle.json(c.id+'/frame.json'),pdf=bundle.json(c.id+'/pdf-frame.json'),read=pdfPagePixelReader(bundle,pdf,'native/'+c.id);
  assert.equal(frame.caseId,c.id);assert.equal(pdf.regions.length,1+c.nodes+c.glyphs+c.rules+c.paths);
  calcEqual(r.cases.find(v=>v.id===c.id),{id:c.id,regions:pdf.regions.length});
  const records=r.records.filter(v=>v.caseId===c.id),rows=records.map(v=>{
   assert.equal(v.file,c.id+'/views/'+v.encoding+'/'+mathPdfKey(v)+'/record.json');
   const row=read(v.file);calcEqual({encoding:row.encoding,frame:row.frame,scale:row.scale,background:row.background},
    {encoding:v.encoding,frame:v.frame,scale:v.scale,background:v.background});comparisons++;regions+=pdf.regions.length;return row;
  });
  const policies=mathPdfPolicies(rows,pdf);calcEqual(policies,bundle.json(c.id+'/policies.json'),'Forged math PDF policy.');
  const controls=r.controls.filter(v=>v.caseId===c.id),declared=mathPrimaryControls(frame);
  calcEqual(controls.map(({caseId,comparisons,numericChecksBypassed,...v})=>v),declared,'Math PDF fault ownership differs.');
  for(const control of controls){
   assert.equal(control.numericChecksBypassed,true);calcEqual(control.comparisons.map(mathPdfKey).sort(),shapePdfViews.map(mathPdfKey).sort());
   for(const v of control.comparisons){
    assert.equal(v.file,c.id+'/controls/'+control.name+'/'+control.kind+'/'+mathPdfKey(v)+'/record.json');
    const row=read(v.file),view={frame:v.frame,scale:v.scale,background:v.background},evaluation=evaluateShapePdfTrial(policies.candidate,view,row);calcEqual(row.evaluation,evaluation);
    const baseline=rows.find(b=>b.encoding===mathPrimaryEncodings[0]&&mathPdfKey(b)===mathPdfKey(v));
    const observedVisible=!bundle.files.get(row.images['svg-page']).equals(bundle.files.get(baseline.images['svg-page']));
    assert.equal(row.observedVisible,observedVisible);assert.equal(v.observedVisible,observedVisible);assert.equal(v.rejected,!evaluation.passed);
    if(observedVisible){assert.equal(evaluation.passed,false,'Visible PDF math fault admitted.');
     assert.ok(evaluation.checks.some(check=>check.id===control.region&&!check.passed),'Target PDF region admitted math fault.');visible++;
    }else{calcEqual(row.whole,baseline.whole);invisible++;}
    comparisons++;regions+=pdf.regions.length;
   }
  }
 }
 calcEqual(r.coverage,{cases:3,encodings:3,nativeViews:36,controls:19,controlViews:76,regions:634});
 return{comparisons,regions,visibleControls:visible,invisibleControls:invisible};
}
