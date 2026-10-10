// Independent decoding, native rederivation and source replay; no TeX invocation.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport,calcEqual} from './calc-saved-images.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';
import {pathLabelPrimaryPixelReader} from './path-label-primary-pixels.mjs';
import {mathFramingFamily} from './math-label-framing.mjs';
import {validateMathInspectionFrame} from './check-math-label-framing.mjs';
import {mathPrimaryNativeCase,mathPrimarySources,mathPrimaryViews,mathPrimaryEncodings,mathPrimaryKey,mathPrimaryNativeHash,
 mathControlViews,mathPrimaryControls,mutateMathPrimary,deriveMathPrimaryPolicy,evaluateMathPrimary,measureMathPrimary} from './math-label-primary.mjs';

// Reviewed f99ce86 selector addition. The original three cases retain all
// 116 frozen event payloads and 942 PNGs (see the styled source review).
// These pairs apply only to the original immutable input, never another version.
export const mathNativeSourcePairs=Object.freeze({
 'tools/TikzShapeCalibration/Program.cs':Object.freeze({historical:'4616e8d4f03f4f3473f04bf3b88aeaf0e22f9a5261d93ed0aeaa68e5541ea5e4',current:'2a8784723d9bea21bc50d9c736be11c79f0be722953c1c8fad48ba43495c0145'}),
 'tools/TikzShapeCalibration/MathEvents.cs':Object.freeze({historical:'cf60bebdfb3b3461ec8f35bcf759fd2b54ccfea3cdfa38092efc8412c21a9aea',current:'ff73078c4851f3f7aad8279f7b9729825232a2ba8e0e7fc6c95a48bf67749997'})
});
export function mathNativeSourceHash(nativeInput,file,historical,actual){
 if(actual===historical)return actual;
 const pair=mathNativeSourcePairs[file];
 assert.ok(nativeInput==='b124baf97409d134781e233dd605461e315387991c2bae6cba8e975ec64c650a'
  &&pair&&historical===pair.historical&&actual===pair.current,'Unreviewed native math reader source: '+file);
 return actual;
}
export function verifyMathPrimaryPixels(bundle){
 const r=bundle.report;assert.equal(r.converterInvoked,false);assert.equal(r.nativeToolInvoked,false);
 const declaredCases=mathFramingFamily(r.cases.map(c=>c.id)),nativeHash=mathPrimaryNativeHash(declaredCases.map(c=>c.id));
 assert.equal(r.nativeInputSha256,nativeHash);
 assert.equal(sha256(bundle.files.get('inputs/native-report.json')),nativeHash);
 calcEqual(r.records.map(v=>v.file).sort(),declaredCases.flatMap(c=>mathPrimaryEncodings.flatMap(e=>mathPrimaryViews.map(v=>
  c.id+'/encodings/'+e+'/'+mathPrimaryKey(v)+'/record.json'))).sort(),'Native math view coverage differs.');
 let pairs=0,regions=0,visibleControls=0,invisibleControls=0;
 for(const declared of declaredCases){
  const id=declared.id,frame=bundle.json(id+'/frame.json');
  validateMathInspectionFrame(frame,declared,bundle.json('events/'+id+'/measurements.json'),
   bundle.json(id+'/supplement.json'),bundle.json(id+'/path-supplement.json'));
  const summary=r.cases.find(c=>c.id===id);calcEqual(summary,{id,regions:frame.regions.length,counts:frame.counts},'Math count summary differs.');
  const pixels=pathLabelPrimaryPixelReader(bundle,frame),nativeRows=[];
  for(const index of r.records.filter(v=>v.caseId===id)){
   assert.ok(mathPrimaryEncodings.includes(index.encoding));assert.ok(index.file.startsWith(id+'/encodings/'+index.encoding+'/'+index.capture+'/'));
   const row=pixels(index.file);assert.equal(row.converterInvoked,false);assert.equal(index.capture,row.capture);
   assert.equal(index.file,id+'/encodings/'+index.encoding+'/'+mathPrimaryKey(row)+'/record.json');
   calcEqual(index.metrics,row.metrics,'Native metric summary differs.');nativeRows.push({...row,encoding:index.encoding});
   pairs++;regions+=row.regions.length;
  }
  const policies=deriveMathPrimaryPolicy(id,nativeRows);calcEqual(policies,bundle.json(id+'/policies.json'),'Native-only policy derivation differs.');
  const expected=mathPrimaryControls(frame),controls=r.controls.filter(c=>c.caseId===id);
  calcEqual(controls.map(({caseId,numericChecksBypassed,comparisons,...c})=>c),expected,'Math fault ownership/coverage differs.');
  for(const control of controls){
   assert.equal(control.numericChecksBypassed,true);
   calcEqual(control.comparisons.map(mathPrimaryKey).sort(),mathControlViews.map(mathPrimaryKey).sort(),'Math control view coverage differs.');
   for(const index of control.comparisons){
    assert.equal(index.file,id+'/controls/'+control.name+'/'+control.kind+'/'+mathPrimaryKey(index)+'/record.json');
    const row=pixels(index.file);assert.equal(mathPrimaryKey(row),mathPrimaryKey(index));assert.equal(row.converterInvoked,false);
    const evaluation=evaluateMathPrimary(policies,row);calcEqual(row.evaluation,evaluation,'Math control verdict differs.');
    const base=nativeRows.find(r=>r.encoding===mathPrimaryEncodings[0]&&mathPrimaryKey(r)===mathPrimaryKey(row));
    const visible=sha256(bundle.files.get(row.images.actual))!==sha256(bundle.files.get(base.images.actual));
    assert.equal(index.observedVisible,visible);assert.equal(row.observedVisible,visible);assert.equal(index.rejected,!evaluation.passed);
    if(visible){assert.equal(evaluation.passed,false);assert.ok(evaluation.checks.some(c=>c.id===control.region&&!c.passed));visibleControls++;}
    else{calcEqual(row.metrics,base.metrics,'Invisible math control changed metrics.');invisibleControls++;}
    pairs++;regions+=row.regions.length;
   }
  }
 }
 const expected=declaredCases.length===1?
  {cases:1,encodings:2,captures:2,nativeViews:48,controls:20,controlViews:80,regions:100}:
  {cases:3,encodings:2,captures:2,nativeViews:144,controls:19,controlViews:76,regions:631};
 assert.equal(r.controls.length,expected.controls);
 calcEqual(r.coverage,expected,'Math calibration coverage summary differs.');
 return{pairs,regions,visibleControls,invisibleControls};
}
export async function checkMathPrimary(file,nativeFile){
 const bundle=await loadCalcSavedReport(file,'math-label-native-primary-calibration'),pixels=verifyMathPrimaryPixels(bundle);
 const nativeBundle=await loadCalcSavedReport(nativeFile,'math-label-native-image-iteration');
 const declaredCases=mathFramingFamily(bundle.report.cases.map(c=>c.id));
 assert.equal(nativeBundle.sha256,mathPrimaryNativeHash(declaredCases.map(c=>c.id)));assert.ok(nativeBundle.bytes.equals(bundle.files.get('inputs/native-report.json')));
 for(const [file,bytes]of nativeBundle.files)if(file.startsWith('events/'))assert.ok(bytes.equals(bundle.files.get(file)),'Changed native event input: '+file);
 const nativeSourceHashes={};
 for(const [file,digest]of Object.entries(nativeBundle.report.sources))if(file.endsWith('.cs')||file.endsWith('.csproj')||file.endsWith('.json'))
  nativeSourceHashes[file]=mathNativeSourceHash(nativeBundle.sha256,file,digest,sha256(await readFile(path.join(root,file))));
 for(const file of mathPrimarySources.filter(f=>!f.endsWith('.mjs')))
  assert.ok(bundle.files.get('source-captures/tools/TikzVisual/'+file).equals(await readFile(path.join(root,'tools/TikzVisual/'+file))),'Changed calibration environment: '+file);
 const renderer=await createRenderer();let recaptured=0;
 try{
  calcEqual(renderer.identity,bundle.report.renderer,'Changed calibration renderer.');await installShapeMetrics(renderer);
  for(const declared of declaredCases){
   const id=declared.id,native=await mathPrimaryNativeCase(renderer,nativeBundle,id,bundle.json(id+'/supplement.json'),bundle.json(id+'/path-supplement.json'));
   calcEqual(JSON.parse(JSON.stringify(native.frame)),bundle.json(id+'/frame.json'),'Native math frame reconstruction differs.');
   for(const e of native.encodings)assert.equal(e.svg,bundle.files.get(id+'/encodings/'+e.id+'.svg').toString(),'Native math encoding differs.');
   async function replay(index,svg){
    const row=bundle.json(index.file),view=Object.fromEntries(['capture','frame','scale','background'].map(k=>[k,row[k]]));
    const pair=await measureMathPrimary(renderer,native,svg,view);
    calcEqual(pair.metrics,row.metrics,'Recaptured math metrics differ: '+index.file);
    for(const name of ['reference','actual'])assert.equal(sha256(Buffer.from(pair.images[name],'base64')),
     sha256(bundle.files.get(row.images[name])),'Recaptured math PNG differs: '+index.file+'/'+name);
    assert.equal(pair.repeat.rawChangedPixels,0);assert.equal(pair.actualRepeat.rawChangedPixels,0);recaptured++;
   }
   for(const index of bundle.report.records.filter(r=>r.caseId===id))await replay(index,native.encodings.find(e=>e.id===index.encoding).svg);
   for(const control of bundle.report.controls.filter(c=>c.caseId===id)){
    const svg=await mutateMathPrimary(renderer,native.encodings[0].svg,control,native.frame);
    assert.equal(svg,bundle.files.get(id+'/controls/'+control.name+'/'+control.kind+'/altered.svg').toString(),'Math controlled SVG differs.');
    for(const index of control.comparisons)await replay(index,svg);
   }
   console.log(JSON.stringify({phase:'native-source-recapture',caseId:id}));
  }
 }finally{await renderer.browser.close();}
 assert.equal(recaptured,bundle.report.coverage.nativeViews+bundle.report.coverage.controlViews);
 return{inputSha256:bundle.sha256,pixels,sourceRecaptures:recaptured,nativeSourceHashes};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,4,'Usage: check-math-label-primary.mjs <calibration-report> <accepted-native-image-report>');
 const output=path.join(root,'artifacts/math-primary-check/run-'+randomUUID()),artifacts={};
 const save=(file,bytes)=>writeArtifact(output,file,bytes,artifacts);
 async function publish(completed,extra={}){
  const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'math-label-independent-primary-check',completed,phase:completed?'complete':'checking',
   converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',artifacts,...extra},null,2)+'\n');
  await writeArtifact(output,'report.json',bytes);console.log(JSON.stringify({completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));
 }
 await publish(false);
 try{
  const checked=await checkMathPrimary(path.resolve(root,process.argv[2]),path.resolve(root,process.argv[3]));
  await save('input-report.json',await readFile(path.resolve(root,process.argv[2])));
  await save('source-captures/tools/TikzVisual/check-math-label-primary.mjs',await readFile(fileURLToPath(import.meta.url)));
  await publish(true,checked);
 }catch(error){await save('failure.log',String(error.stack??error).replaceAll(root,'<repo>'));await publish(false,{error:error.message});process.exitCode=1;}
}
