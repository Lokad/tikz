// Fixed math families, split by evidence phase; native ownership semantics remain separate.
import assert from 'node:assert/strict';
import {calcEqual} from './calc-saved-images.mjs';
import {validateMathPdfReference,mathNativePdfFrame,verifyMathPdfReplay} from './math-label-pdf-native.mjs';
import {bindMathPdfImageInputs,mathPdfCoverage} from './math-label-pdf-images.mjs';
import {mathFramingCases,mathFramingFamily} from './math-label-framing.mjs';
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
export const styledLabelCacheReports=[
 ['math-label-path-native','artifacts/positioning-native/run-13f44e3d-ac9b-495b-a7d7-ace4418d82ee/report.json','70c21514f08464239450311c75881446e1094b9b1e647c377671317f08b13811',true],
 ['math-label-native-image-iteration','artifacts/styled-labels-native-encoding/run-36e617d-final/report.json','8e8319ea03da1fde250a1ca29a1b96ace966c5ea3cfb3e3bb530364d4d69c8a7',false],
 ['math-label-native-primary-calibration','artifacts/math-primary-calibration/run-0a8522ee-e696-40c6-a50d-b9d548d6c2ce/report.json','a8fa4e859d09420be360faa9d639b6803f2ee2980b6a3aa7775a4f42b2732c0e',false],
 ['math-label-independent-primary-check','artifacts/math-primary-check/run-29bc7d16-14a3-4651-af4d-9b09c874237d/report.json','e3530831f410c347332fdee44d73850bc4b29f8143aa3b5ad528bde2c8b8d47a',false],
 ['math-label-native-pdf-reference','artifacts/math-pdf-reference/run-fef2a75f-49e7-47a1-8b9a-52363c8c765f/report.json','6ea432d26eba15e461f63a22b6d1478388939f2647f5ea4a798445ed07784c02',true],
 ['math-label-independent-native-pdf-check','artifacts/math-pdf-native-check/run-196314a6-a8ce-4309-a64f-7730640c12eb/report.json','87be4d509917a9a91065cf61358a7244e7b88a221fead6ecdfa09357a933feb9',true],
 ['math-label-native-pdf-calibration','artifacts/math-pdf-calibration/run-ce4d3373-0ab5-4c26-a79c-0719c1a253f3/report.json','eaecf331895b9f496faf997e42e357faf0321ca6e48b8b4214b169e9bcdbe639',false],
 ['math-label-independent-pdf-image-check','artifacts/math-pdf-check/run-f9493469-aa2d-44e6-8b39-ec908e4926e1/report.json','1edf9e4918fb5d675b5dd5101d21d1b548caca479a8b929b9a1735228920fd61',false]
].map(([role,file,sha256,nativeToolInvoked])=>({role,file,sha256,nativeToolInvoked}));
export const mathLabelCacheGroups={
 'math-labels-native':mathLabelCacheReports.slice(0,2),
 'math-labels-primary':mathLabelCacheReports.slice(2,4),
 'math-labels-pdf':mathLabelCacheReports.slice(4),
 'styled-labels-native':styledLabelCacheReports.slice(0,2),
 'styled-labels-primary':styledLabelCacheReports.slice(2,4),
 'styled-labels-pdf':styledLabelCacheReports.slice(4)
};
export function verifyMathPortablePart(group,bundles){
 const declared=mathLabelCacheGroups[group];assert.ok(declared);assert.equal(bundles.length,declared.length);
 for(const [i,b]of bundles.entries()){assert.equal(b.report.role,declared[i].role);assert.equal(b.sha256,declared[i].sha256);
  assert.equal(b.report.converterInvoked,false);assert.equal(b.report.nativeToolInvoked,declared[i].nativeToolInvoked);}
 const styled=group.startsWith('styled-labels-'),owners=styled?styledLabelCacheReports:mathLabelCacheReports,
  family=styled?mathFramingFamily(['flowchart-styled-labels']):mathFramingCases;
 if(group.endsWith('-primary')){
  const[primary,checked]=bundles;assert.equal(primary.report.nativeInputSha256,owners[1].sha256);
  assert.equal(checked.report.inputSha256,primary.sha256);assert.ok(checked.files.get('input-report.json').equals(primary.bytes));assert.equal(checked.report.sourceRecaptures,styled?128:220);
 }
 if(group.endsWith('-pdf')){
  const[pdf,pdfCheck,images,imagesCheck]=bundles;
  assert.equal(pdf.report.wrapperInputSha256,owners[0].sha256);assert.equal(pdfCheck.report.nativeInputSha256,pdf.sha256);
  assert.ok(pdfCheck.files.get('input-report.json').equals(pdf.bytes));assert.equal(pdfCheck.report.primaryInputSha256,owners[2].sha256);
  assert.equal(pdfCheck.report.primaryCheckSha256,owners[3].sha256);verifyMathPdfReplay(pdf,pdfCheck.report.replay);
  for(const c of family)calcEqual(mathNativePdfFrame(pdf,c.id,images.json(c.id+'/frame.json')),pdfCheck.json(c.id+'/pdf-frame.json'));
  assert.equal(imagesCheck.report.inputSha256,images.sha256);assert.ok(imagesCheck.files.get('input-report.json').equals(images.bytes));assert.equal(imagesCheck.report.sourceRecaptures,styled?92:112);
 }
}
export function verifyMathPortableInputs(bundles,styled=false){
 assert.equal(typeof styled,'boolean');
 assert.equal(bundles.length,8);
 const owners=styled?styledLabelCacheReports:mathLabelCacheReports,family=styled?mathFramingFamily(['flowchart-styled-labels']):mathFramingCases;
 for(const [i,b]of bundles.entries()){const declared=owners[i];assert.equal(b.report.role,declared.role);assert.equal(b.sha256,declared.sha256);
  assert.equal(b.report.converterInvoked,false);assert.equal(b.report.nativeToolInvoked,declared.nativeToolInvoked);}
 const [wrappers,native,primary,primaryCheck,pdf,pdfCheck,images,imagesCheck]=bundles;
 assert.equal(primary.report.nativeInputSha256,native.sha256);assert.equal(primaryCheck.report.inputSha256,primary.sha256);
 assert.ok(primaryCheck.files.get('input-report.json').equals(primary.bytes));assert.equal(primaryCheck.report.sourceRecaptures,styled?128:220);
 for(const[f,b]of native.files)if(f.startsWith('events/'))assert.ok(primary.files.get(f).equals(b),'Changed primary math input.');
 calcEqual(validateMathPdfReference(pdf,wrappers),pdfCheck.report.measurements);calcEqual(verifyMathPdfReplay(pdf,pdfCheck.report.replay),pdfCheck.report.sourceReplay);
 assert.equal(pdfCheck.report.nativeInputSha256,pdf.sha256);assert.ok(pdfCheck.files.get('input-report.json').equals(pdf.bytes));
 assert.equal(pdfCheck.report.primaryInputSha256,primary.sha256);assert.equal(pdfCheck.report.primaryCheckSha256,primaryCheck.sha256);
 for(const c of family)calcEqual(mathNativePdfFrame(pdf,c.id,primary.json(c.id+'/frame.json')),pdfCheck.json(c.id+'/pdf-frame.json'));
 bindMathPdfImageInputs(images,{native:pdf,nativeCheck:pdfCheck,primary,primaryCheck});
 assert.equal(imagesCheck.report.inputSha256,images.sha256);assert.ok(imagesCheck.files.get('input-report.json').equals(images.bytes));
 const coverage=mathPdfCoverage(family.map(c=>c.id));
 calcEqual(imagesCheck.report.pixels,styled?{comparisons:92,regions:9292,visibleControls:80,invisibleControls:0}:{comparisons:112,regions:24356,visibleControls:76,invisibleControls:0});
 assert.equal(imagesCheck.report.sourceRecaptures,coverage.nativeViews+coverage.controlViews);
 return{reports:8,fixtures:family.length,primarySourceRecaptures:styled?128:220,pdfSourceRecaptures:styled?92:112,nativePdfReplay:{pdfs:family.length*2,rasters:family.length*4},nativeCalibrationPreserved:true};
}
