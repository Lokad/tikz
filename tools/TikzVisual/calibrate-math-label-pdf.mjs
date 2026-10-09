// Declared gap: both native-only math PDF policies and representative image-only faults.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root,writeArtifact,sha256} from './shape-oracle-bundle.mjs';
import {ownCalcBundle} from './calc-admission-child.mjs';
import {calcEqual} from './calc-saved-images.mjs';
import {createRenderer} from './compare.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {mathFramingCases} from './math-label-framing.mjs';
import {mathPrimaryEncodings,mathPrimaryControls,mutateMathPrimary} from './math-label-primary.mjs';
import {shapePdfViews,evaluateShapePdfTrial} from './shape-pdf-trial-policy.mjs';
import {loadMathPdfImageInputs,mathPdfSources,mathPdfKey,mathPdfPolicies,measureMathPdf} from './math-label-pdf-images.mjs';
assert.equal(process.argv.length,6,'Usage: calibrate-math-label-pdf.mjs <native-pdf> <native-pdf-check> <primary-calibration> <primary-check>');
const output=path.join(root,'artifacts/math-pdf-calibration/run-'+randomUUID()),artifacts={},records=[],controls=[],cases=[],observations=new Map();
const save=(file,bytes)=>writeArtifact(output,file,bytes,artifacts),json=(file,value)=>save(file,JSON.stringify(value,null,2)+'\n');
let phase='inputs',renderer,inputs;
async function publish(completed,extra={}){
 const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'math-label-native-pdf-calibration',completed,phase:completed?'complete':phase,
  converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',
  inputs,renderer:renderer?.identity,cases,records,controls,artifacts,...extra},null,2)+'\n');await writeArtifact(output,'report.json',bytes);
 console.log(JSON.stringify({completed,phase,report:path.relative(root,path.join(output,'report.json')).replaceAll('\\','/'),sha256:sha256(bytes)}));
}
async function observe(prefix,context,svg,encoding,view,target){
 const pair=await measureMathPdf(renderer,{...context,svg,encoding,view,target}),images={};
 for(const [name,b64]of Object.entries(pair.images)){images[name]=prefix+'/'+name+'.png';await save(images[name],Buffer.from(b64,'base64'));}
 for(const crop of pair.crops)for(const[name,b64]of Object.entries(crop.images))await save(prefix+'/crops/'+crop.id+'/'+name+'.png',Buffer.from(b64,'base64'));
 const {images:ignored,crops,...result}=pair,row={encoding,...result,images},file=prefix+'/record.json';
 await json(file,row);observations.set(file,row);return{file,row};
}
await publish(false);
try{
 const loaded=await loadMathPdfImageInputs(...process.argv.slice(2)),{native,nativeCheck,primary,primaryCheck}=loaded;
 inputs=Object.fromEntries(Object.entries(loaded).map(([name,b],i)=>[name,{file:process.argv[i+2],sha256:b.sha256}]));
 await ownCalcBundle(native,'native',save);
 for(const [name,b]of Object.entries({nativeCheck,primary,primaryCheck}))await save('inputs/'+name+'-report.json',b.bytes);
 for(const f of ['calibrate-math-label-pdf.mjs',...mathPdfSources])await save('source-captures/tools/TikzVisual/'+f,await readFile(path.join(root,'tools/TikzVisual/'+f)));
 renderer=await createRenderer();calcEqual(renderer.identity,primary.report.renderer,'Changed native PDF image renderer.');
 await renderer.page.evaluate('globalThis.shapeRasterMetrics=('+createShapeRasterMetrics.toString()+')()');
 for(const c of mathFramingCases){
  const id=c.id,frame=primary.json(id+'/frame.json'),pdf=nativeCheck.json(id+'/pdf-frame.json'),context={native,caseId:id,frame,pdf};
  await json(id+'/frame.json',frame);await json(id+'/pdf-frame.json',pdf);cases.push({id,regions:pdf.regions.length});
  const svgs=new Map([['original',primary.files.get('events/'+id+'/oracle.svg').toString()]]);
  for(const e of mathPrimaryEncodings)svgs.set(e,primary.files.get(id+'/encodings/'+e+'.svg').toString());
  for(const[e,svg]of svgs)await save(id+'/encodings/'+e+'.svg',svg);
  phase='native-pdf';
  for(const [encoding,svg]of svgs)for(const view of shapePdfViews){
   const {file,row}=await observe(id+'/views/'+encoding+'/'+mathPdfKey(view),context,svg,encoding,view);
   records.push({caseId:id,encoding,...view,file});
   console.log(JSON.stringify({phase,caseId:id,encoding,...view,outside:row.outsideWholeChangedPixels,changed:row.whole.rawChangedPixels}));
  }
  const policies=mathPdfPolicies(records.filter(r=>r.caseId===id).map(r=>observations.get(r.file)),pdf);await json(id+'/policies.json',policies);
  phase='math-pdf-sensitivity';
  for(const declared of mathPrimaryControls(frame)){
   const control={caseId:id,...declared,numericChecksBypassed:true,comparisons:[]},prefix=id+'/controls/'+control.name+'/'+control.kind;
   const svg=await mutateMathPrimary(renderer,svgs.get(mathPrimaryEncodings[0]),control,frame);await save(prefix+'/altered.svg',svg);controls.push(control);
   for(const view of shapePdfViews){
    const {file,row}=await observe(prefix+'/'+mathPdfKey(view),context,svg,'candidate',view,control.region),evaluation=evaluateShapePdfTrial(policies.candidate,view,row);
    const base=records.find(r=>r.caseId===id&&r.encoding===mathPrimaryEncodings[0]&&mathPdfKey(r)===mathPdfKey(view));
    const baseline=observations.get(base.file),visible=artifacts[row.images['svg-page']]!==artifacts[baseline.images['svg-page']];
    await json(file,{...row,observedVisible:visible,evaluation});control.comparisons.push({...view,file,observedVisible:visible,rejected:!evaluation.passed});
    if(visible){assert.equal(evaluation.passed,false,'Visible math PDF defect admitted: '+prefix+' '+mathPdfKey(view));
     assert.ok(evaluation.checks.some(check=>check.id===control.region&&!check.passed),'Target PDF region admitted '+prefix);}
    else calcEqual(row.whole,baseline.whole,'Invisible PDF fault changed metrics.');
   }
   console.log(JSON.stringify({phase,caseId:id,name:control.name,kind:control.kind,views:control.comparisons.length}));
  }
 }
 const coverage={cases:cases.length,encodings:3,nativeViews:records.length,controls:controls.length,controlViews:controls.reduce((n,c)=>n+c.comparisons.length,0),regions:cases.reduce((n,c)=>n+c.regions,0)};
 calcEqual(coverage,{cases:3,encodings:3,nativeViews:36,controls:19,controlViews:76,regions:634});
 await save('index.html','<!doctype html><meta charset="utf-8"><title>Native math PDF comparisons</title><h1>Native math PDF policies and sensitivity</h1><p><a href="report.json">All views and fixed regions</a>. Native-only calibration; current output and feature-final acceptance are separate.</p>'+
  cases.map(c=>'<section><h2>'+c.id+'</h2><a href="'+c.id+'/policies.json">Original/candidate limits</a><p><img width="1000" src="'+c.id+'/views/atlas-integer-6/expanded/1x/sheet.png"></p></section>').join(''));
 await publish(true,{coverage,scope:'Both native-only PDF policies and 19 representative math faults; independent/current/final qualification remains separate.'});
}catch(error){await save('failure.log',String(error.stack??error).replaceAll(root,'<repo>'));await publish(false,{error:error.message});process.exitCode=1;}
finally{await renderer?.browser.close();}
