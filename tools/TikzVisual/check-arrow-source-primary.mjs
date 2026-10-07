import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadArrowSourcePrimaryOwned,arrowSourcePrimarySources,arrowSourcePrimaryPlan,buildArrowSourcePrimaryExperiment,arrowSourcePrimaryEntry} from './arrow-source-primary-contract.mjs';
import {arrowSourcePrimaryReference,arrowSourcePrimaryFrame} from './arrow-source-primary-reference.mjs';
import {arrowSourceCamera} from './arrow-source-envelope.mjs';
import {normalizeArrowViewport} from './arrow-viewport-normalize.mjs';
import {arrowViewportFrameCheck} from './arrow-viewport-model.mjs';
import {arrowPrimaryRegions} from './arrow-primary-contract.mjs';
import {arrowPrimaryDefects,arrowPrimaryVisibility,mutateArrowPrimary,arrowVisibilityInputs} from './arrow-primary-defects.mjs';
import {arrowMetrics} from './arrow-native-contract.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {checkArrowSourcePrimaryPanels,arrowSourcePrimaryIndex} from './arrow-source-primary-panels.mjs';
import {runArrowSourcePrimaryControls,runArrowSourcePrimaryBrowserControls} from './arrow-source-primary-self-test.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

const out=await outputPath(path.join(root,'artifacts/arrow-source-primary-checks/run-'+randomUUID()));await mkdir(out,{recursive:true});
let renderer,phase='arguments',inputReportSha256,measurements=0,deltaChecks=0,panels=0;let controls=[];
async function publish(r){const b=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(out,'report.json',b);console.log(JSON.stringify({kind:'arrow-source-primary-check',completed:r.completed,phase:r.phase,report:path.relative(root,path.join(out,'report.json')).split(path.sep).join('/'),sha256:sha256(b)}));}
try{
 assert.equal(process.argv.length,3);const owned=await loadArrowSourcePrimaryOwned(process.argv[2]);inputReportSha256=owned.sha256;
 const {input,files}=owned,records=[],bases=new Map(),expectedArtifacts={};
 const read=async f=>{assert.ok(files.has(f),f);return files.get(f);},expectedJson=(f,v)=>expectedArtifacts[f]=sha256(Buffer.from(JSON.stringify(v)+'\n'));
 for(const [f,b]of input.files)expectedArtifacts['upstream/'+f]=sha256(b);
 for(const [f,s]of owned.sources)expectedArtifacts['source-captures/'+f]=s.sha256;
 renderer=await createRenderer();assert.deepEqual(renderer.identity,owned.report.renderer);await installShapeMetrics(renderer);
 controls=[...await runArrowSourcePrimaryControls(),...await runArrowSourcePrimaryBrowserControls(renderer)];expectedJson('controls.json',controls);
 for(const c of input.evidence.cases){
  const frame=input.frames.find(f=>f.caseId===c.id),original=input.evidence.artifacts.get(c.id+'/plain-reference.svg');
  const base=await arrowSourcePrimaryReference(renderer,c.metrics,frame,original.toString());bases.set(c.id,base);
  const framing={envelope:base.envelope,originalFrame:base.originalFrame,referenceProof:base.referenceProof,actualProof:base.actualProof};
  assert.deepEqual(JSON.parse(await read('cases/'+c.id+'/framing.json')),framing);expectedJson('cases/'+c.id+'/framing.json',framing);
  assert.deepEqual(await read('cases/'+c.id+'/original.svg'),original);expectedArtifacts['cases/'+c.id+'/original.svg']=sha256(original);
 }
 for(const view of arrowSourcePrimaryPlan()){
  phase=view.id;const frame=input.frames.find(f=>f.caseId===view.caseId),base=bases.get(view.caseId);let reference=base.reference,actual=base.actual;
  const control=(view.kind==='defect'?arrowPrimaryDefects:arrowPrimaryVisibility).find(d=>d.name===view.name);
  if(view.kind==='defect')actual=mutateArrowPrimary(actual,control);
  if(view.kind.startsWith('visibility-')){const p=arrowVisibilityInputs(actual,control);reference=p.reference;actual=view.kind==='visibility-missing'?p.missing:p.actual;}
  const folder='views/'+view.id,meta=JSON.parse(await read(folder+'/record.json')),raw=JSON.parse(await read(folder+'/numbers.json'));
  assert.deepEqual(meta.view,view);assert.deepEqual(raw.view,view);assert.deepEqual([raw.converterInvoked,raw.approvedImagePolicy,raw.imageConformanceClaim],[false,false,false]);
  const sourceFrame=await arrowSourcePrimaryFrame(renderer,actual,base.envelope);assert.deepEqual(meta.sourceFrame,sourceFrame);
  const synthetic=view.kind.startsWith('visibility-');
  const parsedReference=await normalizeArrowViewport(renderer,reference,synthetic?'cssPixels':'bp',synthetic?{x:0,y:0}:frame.origin,arrowSourceCamera(base.envelope));
  assert.equal(arrowViewportFrameCheck(raw.naturalFrames.reference,parsedReference.proof.sourceFrame).passed,true);
  assert.equal(arrowViewportFrameCheck(raw.naturalFrames.actual,sourceFrame.actual).passed,true);
  const expectedFiles={reference:folder+'/reference.svg',actual:folder+'/actual.svg',numbers:folder+'/numbers.json',record:folder+'/record.json',images:{},crops:[]};
  for(const key of ['reference','actual','difference','alpha-difference','amplified','overlay',...(view.background==='white'&&view.scale===1?['comparison']:[])])expectedFiles.images[key]=folder+'/'+key+'.png';
  const regions=arrowPrimaryRegions(frame);
  if(control){
   const q=regions.find(r=>r.id===control.target).rectangle;
   expectedFiles.crops=[{id:control.target,presentation:{background:'white',integerEnlargement:view.scale===1?4:1,rawDifferenceAmplification:16,rasterRectangle:Object.fromEntries(Object.entries(q).map(([k,n])=>[k,n*view.scale]))},images:Object.fromEntries(['reference','actual','difference','amplified','sheet'].map(key=>[key,folder+'/crop-'+control.target+'-'+key+'.png']))}];
  }
  assert.deepEqual(meta.files,expectedFiles);
  assert.equal((await read(meta.files.reference)).toString(),reference);assert.equal((await read(meta.files.actual)).toString(),actual);
  expectedArtifacts[meta.files.reference]=sha256(Buffer.from(reference));expectedArtifacts[meta.files.actual]=sha256(Buffer.from(actual));
  const size={width:frame.camera.width*view.scale,height:frame.camera.height*view.scale};
  const rectangles=[{x:0,y:0,...size},...regions.map(r=>Object.fromEntries(Object.entries(r.rectangle).map(([k,n])=>[k,n*view.scale])))];
  const decoded=await decodeEdgeOraclePngPair(renderer,[await read(meta.files.images.reference),await read(meta.files.images.actual)],size,rectangles,view.scale,view.background);
  assert.deepEqual(arrowMetrics(raw.metrics),decoded.metrics[0]);assert.equal(raw.regions.length,regions.length);
  for(const [i,r]of raw.regions.entries()){assert.deepEqual(arrowMetrics(r),decoded.metrics[i+1]);for(const [k,v]of Object.entries(regions[i]))assert.deepEqual(r[k],v);}
  assert.equal(raw.repeat.rawChangedPixels,0);assert.equal(raw.actualRepeat.rawChangedPixels,0);measurements+=decoded.metrics.length;
  const record={view,sourceFrame,files:meta.files,delta:null,numbers:{...raw,metrics:decoded.metrics[0],regions:raw.regions.map((r,i)=>({...r,...decoded.metrics[i+1]}))}};
  if(['defect','visibility-missing'].includes(view.kind)){
   const kind=view.kind==='defect'?'calibration':'visibility-calibration',baseline=records.find(r=>r.view.caseId===view.caseId&&r.view.kind===kind&&r.view.frame===view.frame&&r.view.scale===view.scale&&r.view.background===view.background&&(kind==='calibration'||r.view.name===view.name));assert.ok(baseline);
   record.delta=(await decodeEdgeOraclePngPair(renderer,[await read(baseline.files.images.actual),await read(meta.files.images.actual)],size,[rectangles[0]],view.scale,view.background)).metrics[0];deltaChecks++;
  }
  assert.deepEqual(meta.delta,record.delta);
  expectedJson(meta.files.numbers,raw);expectedJson(meta.files.record,meta);
  for(const f of Object.values(meta.files.images))expectedArtifacts[f]=owned.manifest.artifacts[f];
  for(const crop of meta.files.crops)for(const f of Object.values(crop.images))expectedArtifacts[f]=owned.manifest.artifacts[f];
  panels+=await checkArrowSourcePrimaryPanels(renderer,record,read,frame);records.push(record);
  if(view.background==='black'&&view.scale===4)console.log('Saved source primary checked: '+view.id);
 }
 phase='coupled-gates';const model=buildArrowSourcePrimaryExperiment(records);
 for(const e of model.evaluations){const f='views/'+e.view.id+'/gates.json';assert.deepEqual(JSON.parse(await read(f)),e);expectedJson(f,e);}
 expectedJson('primary-policies.json',model.policies);
 for(const p of model.visibility)expectedJson('visibility/'+p.name+'/policy.json',p);
 expectedJson('policies.json',{policies:model.policies,visibility:model.visibility});expectedJson('summary.json',model.summary);
 expectedArtifacts['index.html']=sha256(Buffer.from(arrowSourcePrimaryIndex(model,records)));
 assert.deepEqual(owned.manifest.artifacts,expectedArtifacts);
 const expected=arrowSourcePrimaryEntry(input,owned.sources,model,owned.report.manifest);assert.deepEqual(owned.report,expected);
 phase='corruption-controls';
 for(const [name,change]of [['false approval',r=>r.approvedImagePolicy=true],['false admission',r=>r.imageConformanceClaim=true],['lost source framing',r=>r.contract.coupling='pixels only'],['changed reference drawing',r=>r.contract.reference='corrected drawing'],['lost background',r=>r.summary.views--],['lost baseline',r=>r.summary.baselinePasses--],['missed root faults',r=>r.summary.faultFamilies.find(f=>f.name==='cropped-picture-root').sourceFrameRejections=0],['manifest traversal',r=>r.manifest.file='../manifest.json'],['lost pending gate',r=>r.agent.pendingGates.pop()]]){
  const bad=structuredClone(expected);change(bad);assert.throws(()=>assert.deepEqual(bad,expected));controls.push({name,passed:true});
 }
 assert.deepEqual(await arrowSourcePrimarySources(),owned.sources);await loadArrowSourcePrimaryOwned(process.argv[2]);
 await publish({schemaVersion:1,completed:true,phase:'complete',comparisonKind:'independent-native-arrow-source-primary-check',converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',inputReport:process.argv[2],inputReportSha256,snapshotSha256:owned.report.snapshotSha256,renderer:renderer.identity,sourceHashes:owned.report.sourceHashes,summary:model.summary,measurements,deltaChecks,panels,controls});
}catch(error){process.exitCode=2;await publish({schemaVersion:1,completed:false,phase,error:error.message.replaceAll(root,'<repo>'),converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,inputReportSha256,measurements,deltaChecks,panels,controls});console.error(error.stack);}finally{await renderer?.browser.close();}
