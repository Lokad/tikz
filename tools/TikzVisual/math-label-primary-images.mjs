// Affected iteration matrix against frozen native-only limits; final qualification is separate.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root,writeArtifact,sha256} from './shape-oracle-bundle.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';
import {loadCalcSavedReport,calcEqual} from './calc-saved-images.mjs';
import {pathLabelPrimaryPixelReader} from './path-label-primary-pixels.mjs';
import {mathFramingFamily} from './math-label-framing.mjs';
import {mathFramingNumeric} from './check-math-label-framing.mjs';
import {mathPrimaryNativeCase,mathPrimarySources,mathPrimaryKey,evaluateMathPrimary,measureMathPrimary} from './math-label-primary.mjs';
import {verificationMode,currentPrimaryViews} from './verification-views.mjs';

assert.ok([5,6].includes(process.argv.length),'Usage: math-label-primary-images.mjs <native-image-report> <native-primary-calibration> <current-public-export> [--iteration]');
const mode=verificationMode(process.argv[5]),views=currentPrimaryViews(mode);
const output=path.join(root,'artifacts/math-primary-current/run-'+randomUUID()),artifacts={},cases=[],sources={};
const save=(f,b)=>writeArtifact(output,f,b,artifacts),json=(f,v)=>save(f,JSON.stringify(v,null,2)+'\n');
let renderer,calibration,publicBundle,phase='current-input';let decodedPairs=0,regionChecks=0,sourceRecaptures=0,identicalNativeViews=0;
async function publish(completed,extra={}){
 const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'math-label-current-primary-iteration',completed,phase:completed?'complete':phase,
  verificationMode:mode,converterInvoked:true,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',
  calibrationSha256:calibration?.sha256,publicInputSha256:publicBundle?.sha256,renderer:renderer?.identity,cases,sources,artifacts,...extra},null,2)+'\n');
 await writeArtifact(output,'report.json',bytes);console.log(JSON.stringify({completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));
}
await publish(false);
try{
 const nativeBundle=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'math-label-native-image-iteration');
 calibration=await loadCalcSavedReport(path.resolve(root,process.argv[3]),'math-label-native-primary-calibration');
 publicBundle=await loadCalcSavedReport(path.resolve(root,process.argv[4]),'math-label-candidate-export');
 const declaredCases=mathFramingFamily(publicBundle.report.records.map(r=>r.id));
 calcEqual(calibration.report.cases.map(c=>c.id),declaredCases.map(c=>c.id),'Calibration/public fixture coverage differs.');
 assert.equal(calibration.report.nativeInputSha256,nativeBundle.sha256,'Changed calibrated native input.');
 for(const [f,digest]of Object.entries(publicBundle.json('candidate-source-hashes.json'))){
  assert.equal(sha256(await readFile(path.join(root,f))),digest,'Public export does not describe current source: '+f);sources[f]=digest;
 }
 await save('inputs/calibration-report.json',calibration.bytes);await save('inputs/public-report.json',publicBundle.bytes);
 for(const [f,b]of publicBundle.files)await save('public/'+f,b);
 for(const f of ['math-label-primary-images.mjs','verification-views.mjs',...mathPrimarySources]){
  const file='tools/TikzVisual/'+f,bytes=await readFile(path.join(root,file));sources[file]=sha256(bytes);await save('source-captures/'+file,bytes);
 }
 renderer=await createRenderer();calcEqual(renderer.identity,calibration.report.renderer,'Changed primary renderer.');await installShapeMetrics(renderer);
 for(const declared of declaredCases){
  const id=declared.id,native=await mathPrimaryNativeCase(renderer,nativeBundle,id,calibration.json(id+'/supplement.json'),calibration.json(id+'/path-supplement.json'));
  calcEqual(JSON.parse(JSON.stringify(native.frame)),calibration.json(id+'/frame.json'),'Changed native framing.');
  const policies=calibration.json(id+'/policies.json'),svg=publicBundle.files.get(id+'/actual.svg').toString(),scene=publicBundle.json(id+'/actual-scene.json');
  const numeric=mathFramingNumeric(native.frame,scene,svg,native.measurements);
  assert.equal(numeric.boundsContract.passed,true);assert.ok(numeric.checks.filter(c=>c.name.startsWith('root.')).every(c=>c.passed));
  await json(id+'/frame.json',native.frame);await json(id+'/numeric.json',numeric);
  const summary={id,regions:native.frame.regions.length,nativeBoundsPassed:true,nativeRootPassed:true,views:[]};cases.push(summary);
  phase='current-primary';
  for(const view of views){
   const prefix=id+'/'+mathPrimaryKey(view),pair=await measureMathPrimary(renderer,native,svg,view),images={};
   for(const [name,b64]of Object.entries(pair.images))if(['reference','actual','difference','amplified','comparison'].includes(name)){
    images[name]=prefix+'/'+name+'.png';await save(images[name],Buffer.from(b64,'base64'));
   }
   const row={...view,metrics:pair.metrics,regions:pair.regions,repeat:pair.repeat,actualRepeat:pair.actualRepeat,
    naturalFrames:pair.naturalFrames,images,...(pair.vectorCapture?{vectorCapture:pair.vectorCapture}:{})};
   assert.equal(row.repeat.rawChangedPixels,0);assert.equal(row.actualRepeat.rawChangedPixels,0);
   const evaluation=evaluateMathPrimary(policies,row);assert.equal(evaluation.passed,true,'Current math primary failed: '+prefix);
   const file=prefix+'/record.json';await json(file,{...row,evaluation});summary.views.push({...view,file,passed:true});
   const base=calibration.report.records.find(r=>r.caseId===id&&r.encoding==='atlas-integer-6'&&r.file.endsWith('/'+mathPrimaryKey(view)+'/record.json'));
   const nativeRow=calibration.json(base.file);identicalNativeViews+=sha256(Buffer.from(pair.images.actual,'base64'))===sha256(calibration.files.get(nativeRow.images.actual));
  }
  const owned={files:new Map(),json:file=>JSON.parse(owned.files.get(file))};
  for(const index of summary.views){
   const row=JSON.parse(await readFile(path.join(output,index.file)));owned.files.set(index.file,Buffer.from(JSON.stringify(row)));
   for(const name of ['reference','actual'])owned.files.set(row.images[name],await readFile(path.join(output,row.images[name])));
  }
  const read=pathLabelPrimaryPixelReader(owned,native.frame);
  for(const index of summary.views){
   const row=read(index.file),evaluation=evaluateMathPrimary(policies,row);calcEqual(row.evaluation,evaluation,'Decoded current verdict differs.');
   decodedPairs++;regionChecks+=row.regions.length;
   const pair=await measureMathPrimary(renderer,native,svg,index);
   for(const name of ['reference','actual'])assert.equal(sha256(Buffer.from(pair.images[name],'base64')),
    sha256(owned.files.get(row.images[name])),'Current source recapture differs.');
   calcEqual(pair.metrics,row.metrics,'Current recapture metrics differ.');sourceRecaptures++;
  }
  console.log(JSON.stringify({phase,caseId:id,views:summary.views.length,independentlyDecoded:true,sourceRecaptured:true}));
 }
 assert.equal(decodedPairs,declaredCases.length*views.length);
 assert.equal(regionChecks,declaredCases.reduce((n,c)=>n+c.nodes+c.glyphs+c.rules+c.paths,0)*views.length);
 assert.equal(sourceRecaptures,decodedPairs);
 for(const [f,digest]of Object.entries(sources))assert.equal(sha256(await readFile(path.join(root,f))),digest,'Source changed during primary check: '+f);
 await save('index.html','<!doctype html><meta charset="utf-8"><title>Current math primary views</title><h1>Current math output against native-only limits</h1><p><a href="report.json">All '+decodedPairs+' views and independent checks</a>. PDF and final feature qualification remain open.</p>'+
  cases.map(c=>'<section><h2>'+c.id+'</h2><a href="'+c.id+'/numeric.json">Source-attributed framing/bounds</a><p><img width="1000" src="'+c.id+'/intrinsic-image/natural/1x-white/comparison.png"></p></section>').join(''));
 await publish(true,{checked:{decodedPairs,regionChecks,sourceRecaptures,identicalNativeViews},scope:mode==='iteration'?'Affected mechanism/interaction views only; final qualification requires the complete matrix.':'Current unchanged public-export sources; full required primary/local matrix only. Native calibration stays frozen. Both PDF and final clean-source qualification remain open.'});
}catch(error){await save('failure.log',String(error.stack??error).replaceAll(root,'<repo>'));await publish(false,{error:error.message});process.exitCode=1;}
finally{await renderer?.browser.close();}
