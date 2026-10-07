// Frozen native input only. Limits are fixed before any image-only perturbation.
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadArrowEvidence} from './arrow-evidence.mjs';
import {buildArrowNativeFrame} from './arrow-native-frame.mjs';
import {arrowCanonical} from './arrow-native-contract.mjs';
import {arrowPrimaryContract} from './arrow-primary-reference.mjs';
import {deriveArrowPrimaryPolicy,evaluateArrowPrimary,arrowPrimaryViewKey,arrowPrimaryView} from './arrow-primary-policy.mjs';
import {arrowPrimaryDefects,arrowPrimaryVisibility} from './arrow-primary-defects.mjs';
import {arrowPrimaryPlan,arrowPrimaryInputs,arrowPrimarySources,arrowPrimaryRegions,arrowSensitivity,arrowEvaluation,arrowSensitivitySummary,validateArrowPrimaryReport} from './arrow-primary-contract.mjs';
import {deriveShapeTrialPolicy,evaluateShapeTrial} from './shape-primary-trial-policy.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';
assert.equal(process.argv.length,2);
const out=await outputPath(path.join(root,'artifacts/arrow-primary-calibration/run-'+randomUUID()));await mkdir(out,{recursive:true});
const artifacts={},sourceHashes={},frames=[],observations=[],baselines=[],sensitivity=[],visibilityPolicies=new Map(),visibilityRows=new Map();
let renderer,evidence,policy,phase='source-capture';
const save=(f,b)=>writeArtifact(out,f,b,artifacts),json=(f,v)=>save(f,JSON.stringify(v,null,2)+'\n');
async function publish(r){const bytes=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(out,'report.json',bytes);
 console.log(JSON.stringify({kind:'arrow-primary-calibration',completed:r.completed,phase:r.phase,report:path.relative(root,path.join(out,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));}
try{
 await publish({schemaVersion:1,completed:false,phase,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false});
 evidence=await loadArrowEvidence();const sources=await arrowPrimarySources();
 for(const file of Object.keys(evidence.snapshot.sourceHashes))if(!sources.has(file)){const bytes=arrowCanonical(await readFile(path.join(root,file)));sources.set(file,{bytes,sha256:sha256(bytes)});}
 for(const[file,value]of [...sources].sort(([a],[b])=>a.localeCompare(b))){sourceHashes[file]=value.sha256;await save('source-captures/'+file,value.bytes);}
 for(const c of evidence.cases){const f=buildArrowNativeFrame(c.id,evidence.artifacts.get(c.id+'/plain-reference.svg').toString(),c.metrics);frames.push(f);await json(c.id+'/frame.json',f);}
 renderer=await createRenderer();await installShapeMetrics(renderer);
 for(const view of arrowPrimaryPlan()){
  if(view.kind!=='calibration'&&!policy){phase='derive-policy';policy=deriveArrowPrimaryPolicy(evidence.cases.map(c=>({id:c.id,measurements:baselines.filter(o=>o.view.caseId===c.id).map(o=>({...o,...o.view}))})));await json('trial-policy.json',policy);}
  phase=view.id;const c=evidence.cases.find(c=>c.id===view.caseId),frame=frames.find(f=>f.caseId===c.id),inputs=arrowPrimaryInputs(view,c,frame,evidence.artifacts.get(c.id+'/plain-reference.svg').toString());
  const reference=view.id+'/reference.svg',actual=view.id+'/actual.svg';await save(reference,inputs.reference);await save(actual,inputs.actual);
  const control=view.kind==='defect'?arrowPrimaryDefects.find(d=>d.name===view.name):view.kind==='visibility-missing'?arrowPrimaryVisibility.find(d=>d.name===view.name):null;
  const pair=await measureEdgeTrialPrimary(renderer,{...inputs,camera:frame.camera,frame:view.frame,scale:view.scale,background:view.background,
   regions:arrowPrimaryRegions(frame),cropLimit:control?1:0,cropRegionIds:control?[control.target]:[]});
  assert.equal(pair.repeat.rawChangedPixels,0);assert.equal(pair.actualRepeat.rawChangedPixels,0);
  const {images:raw,crops:rawCrops,...values}=pair,images={};for(const[key,png]of Object.entries(raw)){images[key]=view.id+'-'+key+'.png';await save(images[key],Buffer.from(png,'base64'));}
  const crops=[];for(const crop of rawCrops){const saved={id:crop.id,presentation:crop.presentation,images:{}};for(const[key,png]of Object.entries({...crop.paired,sheet:crop.sheet})){saved.images[key]=view.id+'/crop-'+crop.id+'-'+key+'.png';await save(saved.images[key],Buffer.from(png,'base64'));}crops.push(saved);}
  const numbers={...values,view,crops,referenceLabel:inputs.referenceLabel,rightLabel:inputs.rightLabel,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false};
  if(view.kind==='calibration')baselines.push(numbers);
  else if(view.kind==='visibility-calibration'){const rows=visibilityRows.get(view.name)??[];rows.push({...numbers,...view});visibilityRows.set(view.name,rows);}
  else if(view.kind==='visibility-missing'){
   if(!visibilityPolicies.has(view.name)){const p=deriveShapeTrialPolicy(visibilityRows.get(view.name).map(o=>({...o,...o.metrics})),view.name+'; renderer-only visibility control');visibilityPolicies.set(view.name,p);await json('visibility/'+view.name+'/policy.json',p);}
   const evaluation=evaluateShapeTrial(visibilityPolicies.get(view.name),arrowPrimaryView(view),numbers);numbers.evaluation=arrowEvaluation(evaluation);
   const baseline=observations.find(o=>o.view.kind==='visibility-calibration'&&o.view.name===view.name&&arrowPrimaryViewKey(o.view)===arrowPrimaryViewKey(view));
   numbers.rasterChanged=artifacts[baseline.images.actual]!==artifacts[images.actual];
  }else{
   const evaluation=evaluateArrowPrimary(policy,view.caseId,{...numbers,...view});numbers.evaluation=arrowEvaluation(evaluation);
   if(view.kind==='defect'){const baseline=observations.find(o=>o.view.kind==='calibration'&&o.view.caseId===view.caseId&&arrowPrimaryViewKey(o.view)===arrowPrimaryViewKey(view));
    numbers.sensitivity=arrowSensitivity(view,evaluation,artifacts[baseline.images.actual],artifacts[images.actual]);sensitivity.push({view,sensitivity:numbers.sensitivity});}
  }
  const numbersPath=view.id+'/numbers.json';await json(numbersPath,numbers);observations.push({view,numbers:numbersPath,reference,actual,images,crops,metrics:pair.metrics});
  if(view.background==='black'&&view.scale===4&&view.frame===(control?.frames?.[0]??'expanded'))console.log('Primary evidence: '+view.id);
 }
 phase='sensitivity-summary';const summary=arrowSensitivitySummary(sensitivity);await json('sensitivity.json',{...summary,rows:sensitivity});
 const links=observations.filter(o=>o.view.background==='white'&&o.view.scale===1).map(o=>({o,image:o.crops[0]?.images.sheet??o.images.comparison}));
 await save('index.html','<!doctype html><html lang="en"><meta charset="utf-8"><title>Native arrow primary calibration</title><style>body{font:16px sans-serif;margin:24px}img{max-width:100%;image-rendering:pixelated}section{border-top:1px solid #ccc}</style><h1>Native arrow primary calibration; admission pending</h1><p>No converter. Original intrinsic natural and expanded routes retained. Picture-root limits precede defects; ink-root diagnostics and visible blind spots remain in the report.</p><a href="report.json">Report</a> · <a href="trial-policy.json">Unapproved limits</a> · <a href="sensitivity.json">Image-only sensitivity</a>'+links.map(({o,image})=>'<section><h2>'+o.view.id+'</h2><img src="'+image+'" alt="Reference, actual and amplified difference"><a href="'+o.numbers+'">Whole/local measurements, framing and outcome</a></section>').join('')+'</html>\n');
 const report={schemaVersion:1,completed:true,phase:'complete',comparisonKind:'native-arrow-primary-calibration',converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
  snapshotSha256:evidence.snapshotSha256,contract:arrowPrimaryContract,renderer:renderer.identity,sourceHashes,frames,observations,policy,sensitivity:summary,
  agent:{viewer:'index.html',pendingGates:['primary-qualification','PDF-calibration','public-combined-admission'],interpretation:'Unapproved native-only primary observations and image-only controls. Ink roots and all observed blind spots remain visible; no public conformance claim.'},artifacts};
 report.coverage=validateArrowPrimaryReport(report,evidence,frames);
 phase='final-integrity';for(const[file,value]of sources)assert.equal(sha256(arrowCanonical(await readFile(path.join(root,file)))),value.sha256,'Source changed during primary capture');
 await loadArrowEvidence();for(const[file,h]of Object.entries(artifacts))assert.equal(sha256(await readFile(path.join(out,file))),h);await publish(report);
}catch(error){process.exitCode=2;await publish({schemaVersion:1,completed:false,phase,error:error.message.replaceAll(root,'<repo>'),converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,sourceHashes,frames,observations,artifacts});console.error(error.stack);}
finally{await renderer?.browser.close();}
