import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Affected current PDF gates; final clean-source feature qualification remains separate.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root,writeArtifact,sha256} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport,calcEqual} from './calc-saved-images.mjs';
import {ownCalcBundle} from './calc-admission-child.mjs';
import {createRenderer} from './compare.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {shapePdfViews} from './shape-pdf-trial-policy.mjs';
import {mathFramingFamily} from './math-label-framing.mjs';
import {mathPdfSources,mathPdfKey,mathPdfCoverage,evaluateMathPdf,measureMathPdf} from './math-label-pdf-images.mjs';
import {verificationMode,verificationViewPolicy,reusesOriginalReference} from './verification-views.mjs';
assert.ok([5,6].includes(process.argv.length),'Usage: compare-math-label-pdf.mjs <native-PDF-calibration> <independent-PDF-check> <current-public-export> [--iteration]');
const verification=verificationMode(process.argv[5]),viewPolicy=verificationViewPolicy(process.argv[5]);
const reuseReference=reusesOriginalReference(verification,viewPolicy);
const output=path.join(root,'artifacts/math-pdf-current/run-'+randomUUID()),artifacts={},records=[],sources={},cases=[],files=new Map();
const save=(file,b)=>writeArtifact(output,file,b,artifacts),json=(file,v)=>save(file,JSON.stringify(v,null,2)+'\n');
let renderer,calibration,checked,publicBundle,phase='inputs',capturedPairs=0,regionChecks=0,sourceRecaptures=0;
async function publish(completed,extra={}){
 const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'math-label-current-pdf-iteration',completed,phase:completed?'complete':phase,
  verificationMode:verification,viewPolicy,pixelCheckOwner:'independent-current-check',reusedOriginalReference:reuseReference,converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',
  calibrationSha256:calibration?.sha256,calibrationCheckSha256:checked?.sha256,publicInputSha256:publicBundle?.sha256,
  renderer:renderer?.identity,cases,records,sources,artifacts,...extra},null,2)+'\n');await writeArtifact(output,'report.json',bytes);
 console.log(JSON.stringify({completed,phase,report:path.relative(root,path.join(output,'report.json')).replaceAll('\\','/'),sha256:sha256(bytes)}));
}
await publish(false);
try{
 calibration=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'math-label-native-pdf-calibration');
 checked=await loadCalcSavedReport(path.resolve(root,process.argv[3]),'math-label-independent-pdf-image-check');
 publicBundle=await loadCalcSavedReport(path.resolve(root,process.argv[4]),'math-label-candidate-export');
 assert.equal(checked.report.inputSha256,calibration.sha256);assert.ok(checked.files.get('input-report.json').equals(calibration.bytes));
 const ids=calibration.report.cases.map(c=>c.id),family=mathFramingFamily(ids),coverage=mathPdfCoverage(ids);
 calcEqual(calibration.report.coverage,coverage);
 assert.equal(checked.report.sourceRecaptures,coverage.nativeViews+coverage.controlViews);
 assert.equal(checked.report.pixels.comparisons,coverage.nativeViews+coverage.controlViews);
 calcEqual(publicBundle.report.records.map(r=>r.id),ids);
 for(const [f,digest]of Object.entries(publicBundle.json('candidate-source-hashes.json'))){assert.equal(sha256(await readFile(path.join(root,f))),digest);sources[f]=digest;}
 await ownCalcBundle(calibration,'calibration',save);await ownCalcBundle(publicBundle,'public',save);await save('inputs/calibration-check.json',checked.bytes);
 for(const [f,b]of calibration.files)files.set('calibration/'+f,b);
 for(const f of ['compare-math-label-pdf.mjs','verification-views.mjs',...mathPdfSources]){const file='tools/TikzVisual/'+f,b=await readFile(path.join(root,file));sources[file]=sha256(b);await save('source-captures/'+file,b);}
 renderer=await createRenderer();requireRenderer(renderer.identity, calibration.report.renderer);await renderer.page.evaluate('globalThis.shapeRasterMetrics=('+createShapeRasterMetrics.toString()+')()');
 const native={files:new Map([...calibration.files].filter(([f])=>f.startsWith('native/')).map(([f,b])=>[f.slice(7),b]))};
 for(const c of family){
  const id=c.id,frame=calibration.json(id+'/frame.json'),pdf=calibration.json(id+'/pdf-frame.json'),policies=calibration.json(id+'/policies.json'),context={native,caseId:id,frame,pdf};
  const exported=publicBundle.report.records.find(r=>r.id===id);assert.equal(exported.publicTraceParity,true);
  assert.ok(publicBundle.files.get(id+'/source.tikz').equals(calibration.files.get('native/'+id+'/probed/case.tikz')));
  assert.equal(exported.svgSha256,sha256(publicBundle.files.get(id+'/actual.svg')));const summary={id,views:[]};cases.push(summary);phase='current-pdf';
  const owner={caseId:id,native,files};
  for(const mode of ['original','candidate'])for(const view of shapePdfViews){
   if(mode==='original'&&reuseReference){
    const index=calibration.report.records.find(r=>r.caseId===id&&r.encoding==='original'&&r.frame===view.frame&&r.scale===view.scale);assert.ok(index);
    const original=calibration.json(index.file),row={...original,mode},file=id+'/views/original/'+mathPdfKey(view)+'/record.json';
    for(const image of Object.values(row.images)){const bytes=calibration.files.get(image);await save(image,bytes);files.set(image,bytes);}
    const evaluation=evaluateMathPdf(policies.original,view,row,owner);await json(file,{...row,evaluation});files.set(file,Buffer.from(JSON.stringify({...row,evaluation})));
    capturedPairs++;regionChecks+=pdf.regions.length;
    const entry={caseId:id,mode,...view,file,passed:evaluation.passed};records.push(entry);summary.views.push(entry);continue;
   }
   const svg=mode==='original'?calibration.files.get(id+'/encodings/original.svg').toString():publicBundle.files.get(id+'/actual.svg').toString();
   const pair=await measureMathPdf(renderer,{...context,svg,encoding:mode,view}),prefix=id+'/views/'+mode+'/'+mathPdfKey(view),images={};
   for(const [name,b64]of Object.entries(pair.images)){const f=prefix+'/'+name+'.png',b=Buffer.from(b64,'base64');images[name]=f;await save(f,b);files.set(f,b);}
   const {images:ignored,crops,...result}=pair,row={mode,...result,images},evaluation=evaluateMathPdf(policies[mode],view,row,owner),file=prefix+'/record.json';
   await json(file,{...row,evaluation});files.set(file,Buffer.from(JSON.stringify({...row,evaluation})));
   // The current checker independently decodes all whole/local PNG metrics
   // and evaluates the same policy, including styled rule pixel envelopes.
   capturedPairs++;regionChecks+=pdf.regions.length;
   const replay=await measureMathPdf(renderer,{...context,svg,encoding:mode,view});
   for(const name of ['sourceFrame','clipFrame','whole','regions','fullPage','outsideWholeChangedPixels','repeat'])calcEqual(replay[name],row[name],'Current math PDF source recapture differs.');
   assert.ok(Buffer.from(replay.images['svg-page'],'base64').equals(files.get(images['svg-page'])));sourceRecaptures++;
   const entry={caseId:id,mode,...view,file,passed:evaluation.passed};records.push(entry);summary.views.push(entry);
   console.log(JSON.stringify({phase,caseId:id,mode,...view,passed:evaluation.passed,failed:evaluation.checks.filter(r=>!r.passed).map(r=>r.id)}));
  }
 }
 const views=family.length*shapePdfViews.length;
 assert.equal(capturedPairs,views*2);assert.equal(regionChecks,coverage.regions*shapePdfViews.length*2);assert.equal(sourceRecaptures,views*(reuseReference?1:2));
 for(const[f,digest]of Object.entries(sources))assert.equal(sha256(await readFile(path.join(root,f))),digest,'Source changed during current math PDF checking.');
 const gates=Object.fromEntries(['original','candidate'].map(mode=>[mode,{passed:records.filter(r=>r.mode===mode).every(r=>r.passed),views}]));
 await save('index.html','<!doctype html><meta charset="utf-8"><title>Current math PDF comparisons</title><h1>Current output against native-only PDF limits</h1><p><a href="report.json">Both captured routes and source recaptures</a>. Independent pixel checking and feature-final acceptance remain required.</p>'+
  cases.map(c=>'<section><h2>'+c.id+'</h2><p><img width="1000" src="'+c.id+'/views/candidate/expanded/1x/sheet.png"></p></section>').join(''));
 await publish(true,{gates,pdfPassed:Object.values(gates).every(g=>g.passed),checked:{capturedPairs,regionChecks,sourceRecaptures},
  scope:'Affected current original/candidate PDF gates on source-checked public output. Frozen references unchanged; independent pixel checking and feature-final qualification remain required.'});
 process.exitCode=Object.values(gates).every(g=>g.passed)?0:1;
}catch(error){await save('failure.log',String(error.stack??error).replaceAll(root,'<repo>'));await publish(false,{error:error.message});process.exitCode=1;}
finally{await renderer?.browser.close();}
