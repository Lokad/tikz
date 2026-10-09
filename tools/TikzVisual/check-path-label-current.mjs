// Acceptance gap: current primary/PDF pixels, verdicts and fresh public source binding.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {root,writeArtifact,sha256} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport,calcEqual} from './calc-saved-images.mjs';
import {runCalcChild,readCalcChild,ownCalcBundle} from './calc-admission-child.mjs';
import {loadQualifiedPathLabelPrimary} from './path-label-qualified-primary.mjs';
import {pathLabelPrimaryPixelReader} from './path-label-primary-pixels.mjs';
import {pathLabelPdfPixelReader} from './path-label-pdf-pixels.mjs';
import {readPathLabelPrimaryPolicies} from './path-label-primary-policy.mjs';
import {pathLabelPrimaryCaptures,pathLabelPdfFrame} from './path-label-image-reference.mjs';
import {shapeViews,evaluateShapeTrial} from './shape-primary-trial-policy.mjs';
import {shapePdfViews,evaluateShapePdfTrial} from './shape-pdf-trial-policy.mjs';
import {createRenderer} from './compare.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {measureArrowVectorPair} from './arrow-vector-pair.mjs';
import {measureEdgePdfPair} from './edge-pdf-image-pair.mjs';

const primaryKey=v=>v.capture+'/'+v.frame+'/'+v.scale+'x-'+v.background;
const pdfKey=v=>v.mode+'/'+v.frame+'/'+v.scale+'x';
export function verifyPathLabelCurrentPixels(primary,pdf){
 const frame=primary.json('calibration/frame.json'),pdfFrame=pdf.json('calibration/pdf-frame.json');
 const primaryPolicies=readPathLabelPrimaryPolicies({json:f=>primary.json('calibration/'+f)}),pdfPolicies=pdf.json('calibration/policies.json');
 assert.equal(primary.report.converterInvoked,false);assert.equal(pdf.report.converterInvoked,false);
 assert.equal(primary.report.nativeToolInvoked,false);assert.equal(pdf.report.nativeToolInvoked,false);
 calcEqual(primary.report.records.map(primaryKey).sort(),pathLabelPrimaryCaptures.flatMap(capture=>shapeViews.map(v=>primaryKey({...v,capture}))).sort(),'Changed current primary views.');
 calcEqual(pdf.report.records.map(pdfKey).sort(),['original','candidate'].flatMap(mode=>shapePdfViews.map(v=>pdfKey({...v,mode}))).sort(),'Changed current PDF routes/views.');
 assert.equal(primary.report.result.fixture,pdf.report.fixture);
 assert.equal(primary.report.result.sourceNumericSha256,pdf.report.inputs.numericSha256,'Current reports use different numeric outputs.');
 const source=pdf.json('views/candidate/natural/1x/record.json').sourceFrame,b=frame.natural?.root??frame.picture;
 const corners=[source.x,source.y,source.x+source.width,source.y+source.height],nativeCorners=[b.minX,b.minY,b.maxX,b.maxY];
 // Native dimensions are integer sp; two six-decimal SVG quantities form a far corner.
 const framingTolerance=frame.natural?1.1e-6:96/(72.27*65536)+1e-6;
 assert.ok(source.width>0&&source.height>0&&corners.every((v,i)=>Number.isFinite(v)&&Math.abs(v-nativeCorners[i])<=framingTolerance),'Current intrinsic frame differs from native bounds.');
 for(const record of pdf.report.records.filter(r=>r.mode==='candidate'))calcEqual(pdf.json(record.file).sourceFrame,source,'Current intrinsic frame changed between views.');
 const primaryPassed=primary.report.records.every(r=>r.passed),pdfPassed=pdf.report.records.every(r=>r.passed);
 assert.equal(primary.report.result.primaryPassed,primaryPassed);assert.equal(primary.report.result.views,24);
 assert.equal(pdf.report.pdfPassed,pdfPassed);
 calcEqual(pdf.report.gates,Object.fromEntries(['original','candidate'].map(mode=>[mode,{passed:pdf.report.records.filter(r=>r.mode===mode).every(r=>r.passed),views:4}])), 'Forged current PDF gates.');
 const readPrimary=pathLabelPrimaryPixelReader(primary,frame),readPdf=pathLabelPdfPixelReader(pdf,pdfFrame,'calibration/native');
 function verdict(record,row,evaluation){
  calcEqual(row.evaluation,evaluation,'Forged current row verdict.');assert.equal(record.passed,evaluation.passed);
  calcEqual(record.failed,evaluation.checks.filter(c=>!c.passed),'Forged current failure list.');
 }
 for(const record of primary.report.records){
  assert.equal(record.file,'views/'+primaryKey(record)+'/record.json');const row=readPrimary(record.file);
  calcEqual(primaryKey(row),primaryKey(record));
  verdict(record,row,evaluateShapeTrial(primaryPolicies[record.capture],{frame:record.frame,scale:record.scale,background:record.background},row));
 }
 for(const record of pdf.report.records){
  assert.equal(record.background,'white');assert.equal(record.file,'views/'+pdfKey(record)+'/record.json');const row=readPdf(record.file);
  calcEqual(pdfKey(row),pdfKey(record));assert.equal(row.background,'white');
  verdict(record,row,evaluateShapePdfTrial(pdfPolicies[record.mode],{frame:record.frame,scale:record.scale,background:'white'},row));
 }
 return{primaryPassed,pdfPassed,framing:{checks:4,toleranceCssPixels:framingTolerance,source,nativeCorners},primaryViews:24,pdfViews:8,primaryRegionChecks:24*frame.regions.length,pdfRegionChecks:8*pdfFrame.regions.length};
}

async function currentSources(bundle,prefix,historicalScripts=false){
 const entries=[...bundle.files].filter(([file])=>file.startsWith(prefix));assert.ok(entries.length,'Missing source captures.');
 for(const[file,bytes]of entries)if(!historicalScripts||!file.endsWith('.mjs'))assert.ok(bytes.equals(await readFile(path.join(root,file.slice(prefix.length)))),'Current dependency changed: '+file);
 return entries.length;
}
function ownedEqual(owner,prefix,input){
 assert.ok(owner.files.get(prefix+'/report.json').equals(input.bytes),'Changed owned report: '+prefix);
 for(const file of Object.keys(input.report.artifacts))assert.ok(owner.files.get(prefix+'/'+file).equals(input.files.get(file)),'Changed owned input: '+prefix+'/'+file);
}

export async function checkPathLabelCurrent(args,save,markConverter=()=>{}){
 const [primaryFile,primaryCheckFile,pdfFile,pdfCheckFile]=args.map(f=>path.resolve(root,f));
 const primary=await loadCalcSavedReport(primaryFile,'path-label-current-primary-iteration');
 const pdf=await loadCalcSavedReport(pdfFile,'path-label-current-pdf-iteration');
 const primaryCalibrationFile=path.join(path.dirname(primaryFile),'calibration/report.json');
 const {calibration,checked,native,readerReplay}=await loadQualifiedPathLabelPrimary(primaryCalibrationFile,primaryCheckFile);
 if(readerReplay)await ownCalcBundle(readerReplay,'native-reader-replay',save);
 const pdfCalibration=await loadCalcSavedReport(path.join(path.dirname(pdfFile),'calibration/report.json'),'path-label-native-pdf-calibration');
 const pdfChecked=await loadCalcSavedReport(pdfCheckFile,'path-label-independent-pdf-check');
 assert.equal(pdfChecked.report.inputSha256,pdfCalibration.sha256);assert.equal(pdfChecked.report.sourceRecaptures,pdfCalibration.report.records.length);
 assert.ok(pdfChecked.files.get('input-report.json').equals(pdfCalibration.bytes));
 assert.equal(primary.report.result.nativeCalibrationSha256,calibration.sha256);assert.equal(pdf.report.inputs.calibrationSha256,pdfCalibration.sha256);
 assert.equal(pdfCalibration.report.inputs.primarySha256,calibration.sha256);assert.equal(pdfCalibration.report.inputs.checkedSha256,checked.sha256);
 assert.equal(pdfCalibration.report.inputs.nativeInputSha256,native.sha256);
 assert.equal(pdfCalibration.report.fixture,native.report.definition.id);
 calcEqual(pdfCalibration.json('frame.json'),calibration.json('frame.json'));
 calcEqual(pdfCalibration.json('pdf-frame.json'),pathLabelPdfFrame(native,calibration.json('frame.json')),'Changed native PDF registration.');
 ownedEqual(pdfCalibration,'native',native);
 await currentSources(checked,'source-captures/',true);await currentSources(pdfChecked,'source-captures/',true);
 await currentSources(pdfCalibration,'source-captures/',true);await currentSources(primary,'source-captures/');await currentSources(pdf,'source-captures/');
 const numericFile=path.join(path.dirname(primaryFile),'numeric/report.json'),role=JSON.parse(await readFile(numericFile)).role;
 assert.ok(['path-label-numeric-iteration','diagram-current-numeric'].includes(role));const diagram=role==='diagram-current-numeric',prefix=diagram?'':'current/';
 const numeric=await loadCalcSavedReport(numericFile,role);
 const pdfNumeric=await loadCalcSavedReport(path.join(path.dirname(pdfFile),'numeric/report.json'),role);
 assert.equal(numeric.sha256,primary.report.result.sourceNumericSha256);assert.equal(pdfNumeric.sha256,numeric.sha256);
 assert.equal(numeric.report.converterInvoked,true);assert.equal(numeric.report.result.numericPassed,true);assert.equal(numeric.report.result.publicTraceParity,true);
 assert.equal(numeric.report.result.nativeInputSha256,native.sha256);
 if(diagram){assert.ok(numeric.files.get('native-report.json').equals(native.bytes));assert.ok(numeric.files.get('source.tikz').equals(native.files.get('source-captures/tests/Fixtures/Diagrams/'+native.report.definition.id+'.tikz')));}
 else{assert.equal(numeric.report.result.fixture,native.report.definition.id);ownedEqual(numeric,'native',native);}
 assert.ok(numeric.files.get(prefix+'public.svg').equals(numeric.files.get(prefix+'actual.svg')));
 await currentSources(numeric,prefix+'source-captures/');
 const pixels=verifyPathLabelCurrentPixels(primary,pdf);
 for(const[name,input]of Object.entries({primary,pdf,primaryCheck:checked,pdfCheck:pdfChecked}))await save('inputs/'+name+'-report.json',input.bytes);
 markConverter();
 const handle=await runCalcChild(root,'dotnet',['run','--project','tools/TikzPathLabelComparison','-c','Release','--',
  path.relative(root,diagram?native.file:path.join(path.dirname(primaryFile),'numeric/native/report.json'))],'fresh-current',save);
 const fresh=await readCalcChild(root,handle,diagram?'diagram-current-numeric':'path-label-current-numeric');await ownCalcBundle(fresh,'fresh',save);
 assert.equal(fresh.report.converterInvoked,true);assert.equal(fresh.report.result.numericPassed,true);assert.equal(fresh.report.result.publicTraceParity,true);
 assert.equal(fresh.report.result.nativeInputSha256,native.sha256);assert.equal(fresh.report.result.checks,numeric.report.result.checks);
 assert.ok(fresh.files.get('public.svg').equals(numeric.files.get(prefix+'public.svg')),'Fresh public SVG differs from saved image source.');
 assert.ok(fresh.files.get('actual.svg').equals(fresh.files.get('public.svg')));
 const captures=[...fresh.files.keys()].filter(f=>f.startsWith('source-captures/')).sort();
 calcEqual(captures,[...numeric.files.keys()].filter(f=>f.startsWith(prefix+'source-captures/')).map(f=>f.slice(prefix.length)).sort(),'Changed converter source coverage.');
 for(const f of captures)assert.ok(fresh.files.get(f).equals(numeric.files.get(prefix+f)),'Changed fresh converter source capture.');
 if(diagram)assert.ok(fresh.files.get('source-map.json').equals(numeric.files.get('source-map.json')),'Changed fresh source spans.');
 const renderer=await createRenderer(),frame=calibration.json('frame.json'),pdfFrame=pdfCalibration.json('pdf-frame.json');let recaptured=0;
 try{
  calcEqual(renderer.identity,calibration.report.renderer);calcEqual(renderer.identity,pdfCalibration.report.renderer);
  await renderer.page.evaluate('globalThis.shapeRasterMetrics=('+createShapeRasterMetrics.toString()+')()');
  const svg=fresh.files.get('public.svg').toString('utf8'),reference=native.files.get('probed-reference.svg').toString('utf8');
  for(const record of primary.report.records){const row=primary.json(record.file),measure=row.capture==='intrinsic-image'?measureEdgeTrialPrimary:measureArrowVectorPair;
   const pair=await measure(renderer,{reference,actual:svg,leftIsDriver:true,origin:frame.origin,camera:frame.camera,regions:frame.regions,
    frame:row.frame,scale:row.scale,background:row.background,cropLimit:0});
   for(const k of['metrics','regions','repeat','actualRepeat'])calcEqual(pair[k],row[k],'Current primary source recapture differs: '+k);
   for(const k of['reference','actual'])assert.ok(Buffer.from(pair.images[k],'base64').equals(primary.files.get(row.images[k])),'Changed source-bound primary PNG.');recaptured++;
  }
  console.log(JSON.stringify({phase:'current-source-recapture',primaryViews:24}));
  for(const record of pdf.report.records){const row=pdf.json(record.file),original=row.mode==='original';
   const pair=await measureEdgePdfPair(renderer,{svg:original?reference:svg,pdfPage:'data:image/png;base64,'+native.files.get('probed-pdf-page-'+row.scale+'x.png').toString('base64'),
    ...pdfFrame,frame:row.frame,scale:row.scale,units:original?'bp':'cssPixels',svgOriginBp:original?frame.origin:{x:0,y:0},cropLimit:0});
   for(const k of['sourceFrame','clipFrame','whole','regions','fullPage','outsideWholeChangedPixels','repeat'])calcEqual(pair[k],row[k],'Current PDF source recapture differs: '+k);
   assert.ok(Buffer.from(pair.images['svg-page'],'base64').equals(pdf.files.get(row.images['svg-page'])),'Changed source-bound PDF PNG.');recaptured++;
  }
 }finally{await renderer.browser.close();}
 return{fixture:native.report.definition.id,inputSha256:{primary:primary.sha256,pdf:pdf.sha256,primaryCheck:checked.sha256,pdfCheck:pdfChecked.sha256},
  pixels,sourceRecaptures:recaptured,freshNumericChecks:fresh.report.result.checks,converterSourceCaptures:captures.length,passed:pixels.primaryPassed&&pixels.pdfPassed};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,6,'Usage: node tools/TikzVisual/check-path-label-current.mjs <current-primary-report> <independent-primary-check-report> <current-PDF-report> <independent-PDF-check-report>');
 const output=path.join(root,'artifacts/path-label-current-check/run-'+randomUUID()),artifacts={},save=(p,b)=>writeArtifact(output,p,b,artifacts);let converterInvoked=false;
 async function publish(completed,extra={}){const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'path-label-independent-current-check',completed,
  phase:completed?'complete':'checking',converterInvoked,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',artifacts,...extra},null,2)+'\n');
  await writeArtifact(output,'report.json',bytes);console.log(JSON.stringify({completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));}
 await publish(false);try{const result=await checkPathLabelCurrent(process.argv.slice(2),save,()=>{converterInvoked=true;});
  for(const f of['check-path-label-current.mjs','path-label-primary-pixels.mjs','path-label-pdf-pixels.mjs'])await save('source-captures/tools/TikzVisual/'+f,await readFile(path.join(root,'tools/TikzVisual/'+f)));
  await publish(true,{result,scope:'Independent current checking for this fixed fixture only. Portable calibration and final feature acceptance remain open.'});process.exitCode=result.passed?0:1;
 }catch(error){await save('failure.log',String(error.stack??error).replaceAll(root,'<repo>'));await publish(false,{error:error.message});process.exitCode=1;}
}
