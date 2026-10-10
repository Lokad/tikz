// Declared gap: native-only math primary/local limits and semantic sensitivity.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root,writeArtifact,sha256} from './shape-oracle-bundle.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';
import {loadCalcSavedReport,calcEqual} from './calc-saved-images.mjs';
import {mathFramingFamily} from './math-label-framing.mjs';
import {mathPrimaryNativeCase,mathPrimarySources,mathPrimaryViews,mathPrimaryEncodings,mathPrimaryKey,
 mathControlViews,mathPrimaryControls,mutateMathPrimary,deriveMathPrimaryPolicy,evaluateMathPrimary,measureMathPrimary} from './math-label-primary.mjs';

assert.equal(process.argv.length,3,'Usage: calibrate-math-label-primary.mjs <accepted-native-image-report>');
const output=path.join(root,'artifacts/math-primary-calibration/run-'+randomUUID()),artifacts={},records=[],controls=[],cases=[],observations=new Map();
const save=(file,bytes)=>writeArtifact(output,file,bytes,artifacts),json=(file,value)=>save(file,JSON.stringify(value,null,2)+'\n');
let phase='native-input',renderer,nativeBundle;
async function publish(completed,extra={}){
 assert.ok(Object.keys(artifacts).length<=4096);
 const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'math-label-native-primary-calibration',completed,
  phase:completed?'complete':phase,converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,
  imageConformanceClaim:false,imageAdmission:'pending',nativeInputSha256:nativeBundle?.sha256,renderer:renderer?.identity,
  cases,records,controls,artifacts,...extra},null,2)+'\n');
 await writeArtifact(output,'report.json',bytes);
 console.log(JSON.stringify({completed,phase,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));
}
async function observe(prefix,native,svg,view,target){
 const pair=await measureMathPrimary(renderer,native,svg,view,target);
 assert.equal(pair.repeat.rawChangedPixels,0);assert.equal(pair.actualRepeat.rawChangedPixels,0);
 const images={};for(const [name,base64]of Object.entries(pair.images))if(['reference','actual','difference','amplified','comparison'].includes(name)){
  images[name]=prefix+'/'+name+'.png';await save(images[name],Buffer.from(base64,'base64'));
 }
 for(const crop of pair.crops)await save(prefix+'/crop-'+crop.id+'.png',Buffer.from(crop.sheet,'base64'));
 const row={converterInvoked:false,...view,metrics:pair.metrics,regions:pair.regions,repeat:pair.repeat,
  actualRepeat:pair.actualRepeat,naturalFrames:pair.naturalFrames,images,...(pair.vectorCapture?{vectorCapture:pair.vectorCapture}:{})};
 const file=prefix+'/record.json';await json(file,row);observations.set(file,row);return{file,...row};
}
await publish(false);
try{
 nativeBundle=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'math-label-native-image-iteration');
 renderer=await createRenderer();calcEqual(renderer.identity,nativeBundle.report.renderer,'Changed native renderer.');
 await installShapeMetrics(renderer);await save('inputs/native-report.json',nativeBundle.bytes);
 for(const [file,bytes]of nativeBundle.files)if(file.startsWith('events/'))await save(file,bytes);
 for(const file of ['calibrate-math-label-primary.mjs',...mathPrimarySources])
  await save('source-captures/tools/TikzVisual/'+file,await readFile(path.join(root,'tools/TikzVisual/'+file)));
 const declaredCases=mathFramingFamily(nativeBundle.report.cases.map(c=>c.id));
 for(const declared of declaredCases){
  const id=declared.id,native=await mathPrimaryNativeCase(renderer,nativeBundle,id);
  await json(id+'/frame.json',native.frame);await json(id+'/supplement.json',native.supplement);await json(id+'/path-supplement.json',native.pathSupplement);
  for(const e of native.encodings)await save(id+'/encodings/'+e.id+'.svg',e.svg);
  cases.push({id,regions:native.frame.regions.length,counts:native.frame.counts});
  phase='native-encodings';
  for(const encoding of native.encodings)for(const view of mathPrimaryViews){
   const row=await observe(id+'/encodings/'+encoding.id+'/'+mathPrimaryKey(view),native,encoding.svg,view);
   records.push({caseId:id,encoding:encoding.id,capture:view.capture,file:row.file,metrics:row.metrics});
   if(view.frame==='expanded'&&view.scale===4&&view.background==='black')console.log(JSON.stringify({phase,caseId:id,encoding:encoding.id,capture:view.capture}));
  }
  const policies=deriveMathPrimaryPolicy(id,records.filter(r=>r.caseId===id).map(r=>({...observations.get(r.file),encoding:r.encoding})));
  await json(id+'/policies.json',policies);phase='math-sensitivity';
  for(const declaredControl of mathPrimaryControls(native.frame)){
   const control={caseId:id,...declaredControl,numericChecksBypassed:true,comparisons:[]},baseSvg=native.encodings[0].svg;
   const svg=await mutateMathPrimary(renderer,baseSvg,control,native.frame),prefix=id+'/controls/'+control.name+'/'+control.kind;
   await save(prefix+'/altered.svg',svg);controls.push(control);
   for(const view of mathControlViews){
    const row=await observe(prefix+'/'+mathPrimaryKey(view),native,svg,view,control.region),evaluation=evaluateMathPrimary(policies,row);
    const base=records.find(r=>r.caseId===id&&r.encoding===mathPrimaryEncodings[0]&&r.capture===view.capture&&r.file.endsWith('/'+mathPrimaryKey(view)+'/record.json'));
    const baseline=observations.get(base.file),visible=artifacts[row.images.actual]!==artifacts[baseline.images.actual];
    if(visible){assert.equal(evaluation.passed,false,'Visible math defect passed: '+prefix+' '+mathPrimaryKey(view));
     assert.ok(evaluation.checks.some(c=>c.id===control.region&&!c.passed),'Target region accepted '+prefix);}
    else calcEqual(row.metrics,baseline.metrics,'Invisible control changed metrics.');
    const {file,...owned}=row;await json(file,{...owned,observedVisible:visible,evaluation});
    control.comparisons.push({...view,file,observedVisible:visible,rejected:!evaluation.passed});
   }
   console.log(JSON.stringify({phase,caseId:id,name:control.name,kind:control.kind,views:control.comparisons.length}));
  }
 }
 const coverage={cases:cases.length,encodings:2,captures:2,nativeViews:records.length,controls:controls.length,
  controlViews:controls.reduce((n,c)=>n+c.comparisons.length,0),regions:cases.reduce((n,c)=>n+c.regions,0)};
 assert.deepEqual(coverage,declaredCases.length===1?
  {cases:1,encodings:2,captures:2,nativeViews:48,controls:20,controlViews:80,regions:100}:
  {cases:3,encodings:2,captures:2,nativeViews:144,controls:19,controlViews:76,regions:631});
 await save('index.html','<!doctype html><meta charset="utf-8"><title>Native math primary calibration</title><h1>Native math primary limits and sensitivity</h1><p>Native-only limits. PDF and final qualification remain open. <a href="report.json">All views, policies and fixed regions</a></p>'+
  cases.map(c=>'<section><h2>'+c.id+'</h2><a href="'+c.id+'/policies.json">Native-only limits</a> · <a href="'+c.id+'/frame.json">Fixed ownership</a><p><img width="1000" src="'+c.id+'/encodings/atlas-integer-6/intrinsic-image/expanded/1x-white/comparison.png"></p></section>').join(''));
 await publish(true,{coverage,scope:'Explicit fixed math family; native-only whole/local limits and representative mark/label faults. No all-mark fault-coverage claim. Both PDF and final current-converter acceptance remain open.'});
}catch(error){await save('failure.log',String(error.stack??error).replaceAll(root,'<repo>'));await publish(false,{error:error.message});process.exitCode=1;}
finally{await renderer?.browser.close();}
