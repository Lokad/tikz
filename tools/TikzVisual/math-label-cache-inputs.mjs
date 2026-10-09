// One fixed math family, split by evidence phase; native ownership semantics remain separate.
import assert from 'node:assert/strict';
import {calcEqual} from './calc-saved-images.mjs';
import {validateMathPdfReference,mathNativePdfFrame,verifyMathPdfReplay} from './math-label-pdf-native.mjs';
import {bindMathPdfImageInputs} from './math-label-pdf-images.mjs';
import {mathFramingCases} from './math-label-framing.mjs';
export const mathLabelCacheReports=[
 ['math-label-path-native','artifacts/positioning-native/run-b0307efd-650e-493b-a4dd-989c20bcfe00/report.json','05c910aee989202da26444e4c8bbe0ed71a28192a2d37a1ec6076fd3d8a668be',true],
 ['math-label-native-image-iteration','artifacts/math-native-image/native-iteration-accepted/report.json','b124baf97409d134781e233dd605461e315387991c2bae6cba8e975ec64c650a',false],
 ['math-label-native-primary-calibration','artifacts/math-primary-calibration/compact-native-verdicts/report.json','a867667245513838ed9e7f449c271dd3787a897a2ad75abb0a2678c96c725425',false],
 ['math-label-independent-primary-check','artifacts/math-primary-check/run-a769e28e-d093-4769-846a-6dfcea93b801/report.json','eedef963b96499f964ff79e41839062949720e564c82ef792123f2899e97ac8e',false],
 ['math-label-native-pdf-reference','artifacts/math-pdf-reference/run-5b1e74d9-5dac-4dd5-b6da-ee925950ab5e/report.json','43c7ba9772b2435652df4ca1b88eb07b92166d2d9c2cdb182fd5ade99e4679f1',true],
 ['math-label-independent-native-pdf-check','artifacts/math-pdf-native-check/run-43e7be87-654b-4407-8035-c0268b410c00/report.json','551ac2514d876bcf0e2f600a527bd24beea7b6078916e44e87cc1a2101448a9f',true],
 ['math-label-native-pdf-calibration','artifacts/math-pdf-calibration/run-3650e716-cdae-4712-ab76-a79a1e16d283/report.json','2c4f66bd54eaf69e91f9441383e4df166f02f6149b76b93d3fc8b9bc95b683c0',false],
 ['math-label-independent-pdf-image-check','artifacts/math-pdf-check/run-ab19a750-e03d-460e-a24f-3c1b848a05ff/report.json','a385b3edd8cc4d41e0dcaf15affc4babdf90952194d776f38db59b04f9deeb40',false]
].map(([role,file,sha256,nativeToolInvoked])=>({role,file,sha256,nativeToolInvoked}));
export const mathLabelCacheGroups={
 'math-labels-native':mathLabelCacheReports.slice(0,2),
 'math-labels-primary':mathLabelCacheReports.slice(2,4),
 'math-labels-pdf':mathLabelCacheReports.slice(4)
};
export function verifyMathPortablePart(group,bundles){
 const declared=mathLabelCacheGroups[group];assert.ok(declared);assert.equal(bundles.length,declared.length);
 for(const [i,b]of bundles.entries()){assert.equal(b.report.role,declared[i].role);assert.equal(b.sha256,declared[i].sha256);
  assert.equal(b.report.converterInvoked,false);assert.equal(b.report.nativeToolInvoked,declared[i].nativeToolInvoked);}
 if(group==='math-labels-primary'){
  const[primary,checked]=bundles;assert.equal(primary.report.nativeInputSha256,mathLabelCacheReports[1].sha256);
  assert.equal(checked.report.inputSha256,primary.sha256);assert.ok(checked.files.get('input-report.json').equals(primary.bytes));assert.equal(checked.report.sourceRecaptures,220);
 }
 if(group==='math-labels-pdf'){
  const[pdf,pdfCheck,images,imagesCheck]=bundles;
  assert.equal(pdf.report.wrapperInputSha256,mathLabelCacheReports[0].sha256);assert.equal(pdfCheck.report.nativeInputSha256,pdf.sha256);
  assert.ok(pdfCheck.files.get('input-report.json').equals(pdf.bytes));assert.equal(pdfCheck.report.primaryInputSha256,mathLabelCacheReports[2].sha256);
  assert.equal(pdfCheck.report.primaryCheckSha256,mathLabelCacheReports[3].sha256);verifyMathPdfReplay(pdf,pdfCheck.report.replay);
  for(const c of mathFramingCases)calcEqual(mathNativePdfFrame(pdf,c.id,images.json(c.id+'/frame.json')),pdfCheck.json(c.id+'/pdf-frame.json'));
  assert.equal(imagesCheck.report.inputSha256,images.sha256);assert.ok(imagesCheck.files.get('input-report.json').equals(images.bytes));assert.equal(imagesCheck.report.sourceRecaptures,112);
 }
}
export function verifyMathPortableInputs(bundles){
 assert.equal(bundles.length,8);
 for(const [i,b]of bundles.entries()){const declared=mathLabelCacheReports[i];assert.equal(b.report.role,declared.role);assert.equal(b.sha256,declared.sha256);
  assert.equal(b.report.converterInvoked,false);assert.equal(b.report.nativeToolInvoked,declared.nativeToolInvoked);}
 const [wrappers,native,primary,primaryCheck,pdf,pdfCheck,images,imagesCheck]=bundles;
 assert.equal(primary.report.nativeInputSha256,native.sha256);assert.equal(primaryCheck.report.inputSha256,primary.sha256);
 assert.ok(primaryCheck.files.get('input-report.json').equals(primary.bytes));assert.equal(primaryCheck.report.sourceRecaptures,220);
 for(const[f,b]of native.files)if(f.startsWith('events/'))assert.ok(primary.files.get(f).equals(b),'Changed primary math input.');
 calcEqual(validateMathPdfReference(pdf,wrappers),pdfCheck.report.measurements);calcEqual(verifyMathPdfReplay(pdf,pdfCheck.report.replay),pdfCheck.report.sourceReplay);
 assert.equal(pdfCheck.report.nativeInputSha256,pdf.sha256);assert.ok(pdfCheck.files.get('input-report.json').equals(pdf.bytes));
 assert.equal(pdfCheck.report.primaryInputSha256,primary.sha256);assert.equal(pdfCheck.report.primaryCheckSha256,primaryCheck.sha256);
 for(const c of mathFramingCases)calcEqual(mathNativePdfFrame(pdf,c.id,primary.json(c.id+'/frame.json')),pdfCheck.json(c.id+'/pdf-frame.json'));
 bindMathPdfImageInputs(images,{native:pdf,nativeCheck:pdfCheck,primary,primaryCheck});
 assert.equal(imagesCheck.report.inputSha256,images.sha256);assert.ok(imagesCheck.files.get('input-report.json').equals(images.bytes));
 calcEqual(imagesCheck.report.pixels,{comparisons:112,regions:24356,visibleControls:76,invisibleControls:0});assert.equal(imagesCheck.report.sourceRecaptures,112);
 return{reports:8,fixtures:3,primarySourceRecaptures:220,pdfSourceRecaptures:112,nativePdfReplay:{pdfs:6,rasters:12},nativeCalibrationPreserved:true};
}
