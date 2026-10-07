import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {arrowSourcePrimarySources,loadArrowSourcePrimaryInput,arrowSourcePrimaryLiveRead,arrowSourcePrimaryPlan,deriveArrowSourcePrimaryPolicies,buildArrowSourcePrimaryExperiment,arrowSourcePrimaryEntry,loadArrowSourcePrimaryOwned} from './arrow-source-primary-contract.mjs';
import {arrowSourcePrimaryReference,arrowSourcePrimaryFrame} from './arrow-source-primary-reference.mjs';
import {arrowPrimaryRegions} from './arrow-primary-contract.mjs';
import {arrowPrimaryDefects,arrowPrimaryVisibility,mutateArrowPrimary,arrowVisibilityInputs} from './arrow-primary-defects.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';
import {createRenderer} from './compare.mjs';
import {runArrowSourcePrimaryControls,runArrowSourcePrimaryBrowserControls} from './arrow-source-primary-self-test.mjs';
import {arrowSourcePrimaryIndex,arrowSourcePrimaryLabels} from './arrow-source-primary-panels.mjs';

const out=await outputPath(path.join(root,'artifacts/arrow-source-primary-calibration/run-'+randomUUID()));await mkdir(out,{recursive:true});
let renderer,phase='arguments';
async function publish(r){const b=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(out,'report.json',b);console.log(JSON.stringify({kind:'arrow-source-primary-calibration',completed:r.completed,phase:r.phase,report:path.relative(root,path.join(out,'report.json')).split(path.sep).join('/'),sha256:sha256(b)}));}
try{
 const args=process.argv.slice(2);let input;
 if(args[0]==='--replay'){assert.equal(args.length,2);input=(await loadArrowSourcePrimaryOwned(args[1])).input;}
 else{assert.equal(args.length,2);input=await loadArrowSourcePrimaryInput(...args,await arrowSourcePrimaryLiveRead(...args));}
 const sources=await arrowSourcePrimarySources(),artifacts={},records=[],bases=new Map(),visibilityPolicies=new Map();let primaryPolicies;
 const save=async(f,b)=>{const bytes=Buffer.isBuffer(b)?b:Buffer.from(b);assert.ok(bytes.length<30000000);await writeArtifact(out,f,bytes,artifacts);};
 const json=(f,v)=>save(f,JSON.stringify(v)+'\n');
 for(const [f,b]of input.files)await save('upstream/'+f,b);
 for(const [f,s]of sources)await save('source-captures/'+f,s.bytes);
 renderer=await createRenderer();assert.deepEqual(renderer.identity,input.report.renderer);await installShapeMetrics(renderer);
 await json('controls.json',[...await runArrowSourcePrimaryControls(),...await runArrowSourcePrimaryBrowserControls(renderer)]);
 for(const c of input.evidence.cases){
  const frame=input.frames.find(f=>f.caseId===c.id),base=await arrowSourcePrimaryReference(renderer,c.metrics,frame,input.evidence.artifacts.get(c.id+'/plain-reference.svg').toString());
  bases.set(c.id,base);await json('cases/'+c.id+'/framing.json',{envelope:base.envelope,originalFrame:base.originalFrame,referenceProof:base.referenceProof,actualProof:base.actualProof});
  await save('cases/'+c.id+'/original.svg',input.evidence.artifacts.get(c.id+'/plain-reference.svg'));
 }
 for(const view of arrowSourcePrimaryPlan()){
  if(view.kind!=='calibration'&&!primaryPolicies){primaryPolicies=deriveArrowSourcePrimaryPolicies(records).policies;await json('primary-policies.json',primaryPolicies);}
  if(view.kind==='visibility-missing'&&!visibilityPolicies.has(view.name)){
   const policy=deriveArrowSourcePrimaryPolicies(records).visibility.find(p=>p.name===view.name);assert.ok(policy);visibilityPolicies.set(view.name,policy);await json('visibility/'+view.name+'/policy.json',policy);
  }
  phase=view.id;const frame=input.frames.find(f=>f.caseId===view.caseId),base=bases.get(view.caseId);let reference=base.reference,actual=base.actual,leftIsDriver=true,origin=frame.origin;
  const control=(view.kind==='defect'?arrowPrimaryDefects:arrowPrimaryVisibility).find(d=>d.name===view.name);
  if(view.kind==='defect')actual=mutateArrowPrimary(actual,control);
  if(view.kind.startsWith('visibility-')){const p=arrowVisibilityInputs(actual,control);reference=p.reference;actual=view.kind==='visibility-missing'?p.missing:p.actual;leftIsDriver=false;origin={x:0,y:0};}
  const sourceFrame=await arrowSourcePrimaryFrame(renderer,actual,base.envelope),folder='views/'+view.id;
  const files={reference:folder+'/reference.svg',actual:folder+'/actual.svg',numbers:folder+'/numbers.json',record:folder+'/record.json',images:{},crops:[]};
  await save(files.reference,reference);await save(files.actual,actual);
  const pair=await measureEdgeTrialPrimary(renderer,{reference,actual,leftIsDriver,origin,camera:frame.camera,regions:arrowPrimaryRegions(frame),...view,cropLimit:control?1:0,cropRegionIds:control?[control.target]:[],...arrowSourcePrimaryLabels(view)});
  assert.equal(pair.repeat.rawChangedPixels,0);assert.equal(pair.actualRepeat.rawChangedPixels,0);
  const {images,crops,...numbers}=pair;
  for(const [name,b64]of Object.entries(images)){files.images[name]=folder+'/'+name+'.png';await save(files.images[name],Buffer.from(b64,'base64'));}
  for(const crop of crops){const p={id:crop.id,presentation:crop.presentation,images:{}};for(const [name,b64]of Object.entries({...crop.paired,sheet:crop.sheet})){p.images[name]=folder+'/crop-'+crop.id+'-'+name+'.png';await save(p.images[name],Buffer.from(b64,'base64'));}files.crops.push(p);}
  const record={view,numbers,sourceFrame,files,delta:null};
  if(['defect','visibility-missing'].includes(view.kind)){
   const kind=view.kind==='defect'?'calibration':'visibility-calibration',baseline=records.find(r=>r.view.caseId===view.caseId&&r.view.kind===kind&&r.view.frame===view.frame&&r.view.scale===view.scale&&r.view.background===view.background&&(kind==='calibration'||r.view.name===view.name));assert.ok(baseline);
   record.delta=(await decodeEdgeOraclePngPair(renderer,[await readFile(path.join(out,baseline.files.images.actual)),await readFile(path.join(out,files.images.actual))],{width:frame.camera.width*view.scale,height:frame.camera.height*view.scale},[{x:0,y:0,width:frame.camera.width*view.scale,height:frame.camera.height*view.scale}],view.scale,view.background)).metrics[0];
  }
  await json(files.numbers,{...numbers,view,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false});
  await json(files.record,{view,sourceFrame,files,delta:record.delta});records.push(record);
  if(view.background==='black'&&view.scale===4)console.log('Native source primary rendered: '+view.id);
 }
 phase='coupled-gates';const model=buildArrowSourcePrimaryExperiment(records);
 assert.deepEqual(model.policies,primaryPolicies);assert.deepEqual(model.visibility,[...visibilityPolicies.values()]);
 for(const e of model.evaluations)await json('views/'+e.view.id+'/gates.json',e);
 await json('policies.json',{policies:model.policies,visibility:model.visibility});await json('summary.json',model.summary);
 await save('index.html',arrowSourcePrimaryIndex(model,records));
 const mb=Buffer.from(JSON.stringify({schemaVersion:1,artifacts},null,2)+'\n');await writeArtifact(out,'manifest.json',mb);
 assert.deepEqual(await arrowSourcePrimarySources(),sources);
 const report=arrowSourcePrimaryEntry(input,sources,model,{file:'manifest.json',sha256:sha256(mb),files:Object.keys(artifacts).length});assert.ok(Buffer.byteLength(JSON.stringify(report,null,2))<32000);await publish(report);
}catch(error){process.exitCode=2;await publish({schemaVersion:1,completed:false,phase,error:error.message.replaceAll(root,'<repo>'),converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false});console.error(error.stack);}finally{await renderer?.browser.close();}
