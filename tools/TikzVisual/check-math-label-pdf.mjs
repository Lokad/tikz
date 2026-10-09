// Independent native/current PDF page decoding and SVG source recapture; no native regeneration.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {root,writeArtifact,sha256} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport,calcEqual} from './calc-saved-images.mjs';
import {createRenderer} from './compare.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {mathFramingCases} from './math-label-framing.mjs';
import {mutateMathPrimary} from './math-label-primary.mjs';
import {loadMathPdfImageInputs,bindMathPdfImageInputs,verifyMathPdfImagePixels,measureMathPdf,mathPdfKey} from './math-label-pdf-images.mjs';
export async function checkMathPdfImages(file){
 const bundle=await loadCalcSavedReport(file,'math-label-native-pdf-calibration'),r=bundle.report;
 const loaded=await loadMathPdfImageInputs(...['native','nativeCheck','primary','primaryCheck'].map(name=>r.inputs[name].file));
 bindMathPdfImageInputs(bundle,loaded);
 for(const [f,b]of bundle.files)if(f.startsWith('source-captures/')&&!f.endsWith('.mjs'))assert.ok(b.equals(await readFile(path.join(root,f.slice(16)))),'Changed PDF renderer dependency.');
 for(const name of ['pdflatex','pdftoppm','pdfinfo'])assert.equal(sha256(await readFile(path.join(process.env.LOCALAPPDATA,'Programs/MiKTeX/miktex/bin/x64',name+'.exe'))),loaded.native.report.tools[name].sha256);
 const pixels=verifyMathPdfImagePixels(bundle),renderer=await createRenderer();let recaptured=0;
 try{
  calcEqual(renderer.identity,r.renderer);await renderer.page.evaluate('globalThis.shapeRasterMetrics=('+createShapeRasterMetrics.toString()+')()');
  for(const c of mathFramingCases){
   const frame=bundle.json(c.id+'/frame.json'),pdf=bundle.json(c.id+'/pdf-frame.json'),context={native:loaded.native,caseId:c.id,frame,pdf};
   const recapture=async(index,svg,encoding)=>{
    const row=bundle.json(index.file),pair=await measureMathPdf(renderer,{...context,svg,encoding,view:index});
    for(const name of ['sourceFrame','clipFrame','whole','regions','fullPage','outsideWholeChangedPixels','repeat'])calcEqual(pair[name],row[name],'Math PDF source recapture differs: '+name);
    assert.ok(Buffer.from(pair.images['svg-page'],'base64').equals(bundle.files.get(row.images['svg-page'])),'Math PDF SVG page bytes differ.');recaptured++;
   };
   for(const index of r.records.filter(v=>v.caseId===c.id))await recapture(index,bundle.files.get(c.id+'/encodings/'+index.encoding+'.svg').toString(),index.encoding);
   for(const control of r.controls.filter(v=>v.caseId===c.id)){
    const prefix=c.id+'/controls/'+control.name+'/'+control.kind,svg=await mutateMathPrimary(renderer,bundle.files.get(c.id+'/encodings/atlas-integer-6.svg').toString(),control,frame);
    assert.equal(svg,bundle.files.get(prefix+'/altered.svg').toString(),'Changed owned math PDF fault.');
    for(const index of control.comparisons)await recapture(index,svg,'candidate');
   }
   console.log(JSON.stringify({phase:'math-pdf-source-recapture',caseId:c.id,recaptured}));
  }
 }finally{await renderer.browser.close();}
 assert.equal(recaptured,112);return{bundle,pixels,recaptured};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,3,'Usage: check-math-label-pdf.mjs <native-PDF-image-calibration>');
 const output=path.join(root,'artifacts/math-pdf-check/run-'+randomUUID()),artifacts={},save=(file,b)=>writeArtifact(output,file,b,artifacts);
 async function publish(completed,extra={}){
  const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'math-label-independent-pdf-image-check',completed,phase:completed?'complete':'checking',
   converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',artifacts,...extra},null,2)+'\n');
  await writeArtifact(output,'report.json',bytes);console.log(JSON.stringify({completed,report:path.relative(root,path.join(output,'report.json')).replaceAll('\\','/'),sha256:sha256(bytes)}));
 }
 await publish(false);try{const result=await checkMathPdfImages(path.resolve(root,process.argv[2]));await save('input-report.json',result.bundle.bytes);
  await save('source-captures/tools/TikzVisual/check-math-label-pdf.mjs',await readFile(path.join(root,'tools/TikzVisual/check-math-label-pdf.mjs')));
  await publish(true,{inputSha256:result.bundle.sha256,pixels:result.pixels,sourceRecaptures:result.recaptured});
 }catch(error){await save('failure.log',String(error.stack??error).replaceAll(root,'<repo>'));await publish(false,{error:error.message});process.exitCode=1;}
}
