import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {root,sha256,outputPath} from './shape-oracle-bundle.mjs';
import {arrowAgentPath} from './arrow-agent-evidence.mjs';
import {arrowCanonical} from './arrow-native-contract.mjs';
import {loadArrowEvidence} from './arrow-evidence.mjs';
import {buildArrowNativeFrame} from './arrow-native-frame.mjs';
import {arrowPrimarySources,arrowPrimaryPlan,validateArrowPrimaryReport} from './arrow-primary-contract.mjs';
import {arrowPrimaryCaseIds,arrowPrimaryViewKey,arrowPrimaryView} from './arrow-primary-policy.mjs';
import {arrowPrimaryDefects,arrowPrimaryVisibility,arrowDefectDeclaredInvisible} from './arrow-primary-defects.mjs';
import {deriveShapeTrialPolicy,evaluateShapeTrial} from './shape-primary-trial-policy.mjs';
import {arrowSourcePrimaryContract} from './arrow-source-primary-reference.mjs';

export async function arrowSourcePrimarySources(){
 const evidence=await loadArrowEvidence(),sources=await primaryInputSources(evidence);
 const queue=['arrow-source-envelope.mjs','arrow-source-primary-reference.mjs','arrow-source-primary-contract.mjs','arrow-source-primary-self-test.mjs','calibrate-arrow-source-primary.mjs','check-arrow-source-primary.mjs'].map(f=>'tools/TikzVisual/'+f);
 for(let i=0;i<queue.length;i++){
  const f=queue[i];if(sources.has(f))continue;assert.match(f,/^tools\/TikzVisual\/[a-z0-9.-]+\.mjs$/);
  const bytes=arrowCanonical(await readFile(path.join(root,f)));sources.set(f,{bytes,sha256:sha256(bytes)});
  for(const m of bytes.toString().matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g))queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(f),m[1])));
 }
 return new Map([...sources].sort(([a],[b])=>a.localeCompare(b)));
}

async function primaryInputSources(evidence){
 const sources=await arrowPrimarySources();
 for(const f of Object.keys(evidence.snapshot.sourceHashes))if(!sources.has(f)){
  const bytes=arrowCanonical(await readFile(path.join(root,f)));sources.set(f,{bytes,sha256:sha256(bytes)});
 }
 return new Map([...sources].sort(([a],[b])=>a.localeCompare(b)));
}

export async function loadArrowSourcePrimaryInput(producer,checker,read){
 assert.match(producer,/^artifacts\/arrow-primary-calibration\/run-[a-f0-9-]+\/report.json$/);
 assert.match(checker,/^artifacts\/arrow-primary-checks\/run-[a-f0-9-]+\/report.json$/);
 const bytes=await read('legacy','report.json'),checkBytes=await read('legacy-check','report.json');
 assert.ok(bytes.length<30000000&&checkBytes.length<100000);
 const report=JSON.parse(bytes),check=JSON.parse(checkBytes),evidence=await loadArrowEvidence();
 const frames=evidence.cases.map(c=>buildArrowNativeFrame(c.id,evidence.artifacts.get(c.id+'/plain-reference.svg').toString(),c.metrics));
 assert.deepEqual(validateArrowPrimaryReport(report,evidence,frames),report.coverage);
 assert.equal(report.sensitivity.qualified,true);
 const sources=await primaryInputSources(evidence);
 assert.deepEqual(report.sourceHashes,Object.fromEntries([...sources].map(([f,s])=>[f,s.sha256])));
 const files=new Map([['legacy/report.json',bytes],['legacy-check/report.json',checkBytes]]);
 for(const [f,h]of Object.entries(report.artifacts)){
  arrowAgentPath(f);const b=await read('legacy',f);assert.equal(sha256(b),h,'Changed primary input: '+f);files.set('legacy/'+f,b);
 }
 for(const [f,s]of sources)assert.equal(sha256(files.get('legacy/source-captures/'+f)),s.sha256);
 assert.deepEqual([check.completed,check.converterInvoked,check.approvedImagePolicy,check.imageConformanceClaim],[true,false,false,false]);
 assert.equal(check.comparisonKind,'independent-native-arrow-primary-check');assert.equal(check.inputReport,producer);assert.equal(check.inputReportSha256,sha256(bytes));
 assert.deepEqual(check.sourceHashes,report.sourceHashes);assert.equal(check.snapshotSha256,evidence.snapshotSha256);assert.deepEqual(check.renderer,report.renderer);
 assert.deepEqual(check.coverage,report.coverage);assert.deepEqual(check.sensitivity,report.sensitivity);
 assert.deepEqual([check.measurements,check.panels,check.controls.length],[48870,2625,14]);assert.ok(check.controls.every(c=>c.passed));
 return{producer,checker,producerSha256:sha256(bytes),checkerSha256:sha256(checkBytes),report,check,evidence,frames,files};
}

export async function arrowSourcePrimaryLiveRead(producer,checker){
 const folders={legacy:path.dirname(path.join(root,producer)),'legacy-check':path.dirname(path.join(root,checker))};
 for(const folder of Object.values(folders))await outputPath(folder);
 return async(kind,f)=>{const p=await outputPath(folders[kind],arrowAgentPath(f));assert.ok((await stat(p)).size<30000000);return readFile(p);};
}

export function arrowSourcePrimaryPlan(){
 const plan=arrowPrimaryPlan().filter(v=>v.kind!=='ink-diagnostic').map(v=>v.kind==='calibration'?{...v,name:'source',id:v.id.replace('/picture/','/source/')}:v);
 assert.equal(plan.length,306);return plan;
}

export function deriveArrowSourcePrimaryPolicies(records){
 const policies=arrowPrimaryCaseIds.map(id=>({id,policy:deriveShapeTrialPolicy(records.filter(r=>r.view.caseId===id&&r.view.kind==='calibration').map(r=>({...r.numbers,...r.numbers.metrics,...r.view})),id+'; '+arrowSourcePrimaryContract.id)}));
 const visibility=arrowPrimaryVisibility.flatMap(c=>{
  const rows=records.filter(r=>r.view.kind==='visibility-calibration'&&r.view.name===c.name);if(rows.length===0)return[];
  return[{name:c.name,syntheticControl:true,policy:deriveShapeTrialPolicy(rows.map(r=>({...r.numbers,...r.numbers.metrics,...r.view})),c.name+'; synthetic native source')}];
 });
 return{policies,visibility};
}

export function evaluateArrowSourcePrimary(model,record){
 const v=record.view,p=v.kind.startsWith('visibility-')?model.visibility.find(p=>p.name===v.name):model.policies.find(p=>p.id===v.caseId);
 const pixels=evaluateShapeTrial(p.policy,arrowPrimaryView(v),{...record.numbers,...record.numbers.metrics});
 const passed=record.sourceFrame.passed&&pixels.passed;
 let sensitivity=null;
 if(['defect','visibility-missing'].includes(v.kind)){
  const control=(v.kind==='defect'?arrowPrimaryDefects:arrowPrimaryVisibility).find(c=>c.name===v.name);
  const changed=record.delta.rawChangedPixels>0,targetRejected=pixels.checks.some(c=>c.id===control.target&&!c.passed);
  const declaredInvisible=v.kind==='defect'&&arrowDefectDeclaredInvisible(control,v);
  if(declaredInvisible){assert.equal(changed,false);assert.equal(pixels.passed,true);}
  sensitivity={numericGatesBypassed:true,target:control.target,rasterChanged:changed,declaredInvisible,sourceFrameRejected:!record.sourceFrame.passed,targetRejected,
   outcome:!record.sourceFrame.passed&&!changed?'source-frame-rejected':declaredInvisible?'declared-invisible':!changed?'no-raster-change':targetRejected?'target-rejected':pixels.passed?'visible-fault-accepted':'rejected-outside-target'};
 }
 return{view:v,sourceFrame:record.sourceFrame,pixels,passed,sensitivity};
}

export function buildArrowSourcePrimaryExperiment(records){
 assert.deepEqual(records.map(r=>r.view),arrowSourcePrimaryPlan());
 const model=deriveArrowSourcePrimaryPolicies(records),evaluations=records.map(r=>evaluateArrowSourcePrimary(model,r));
 const faults=evaluations.filter(e=>e.view.kind==='defect');
 const outcomes=['target-rejected','declared-invisible','no-raster-change','source-frame-rejected','visible-fault-accepted','rejected-outside-target'];
 const summary={views:306,calibrationViews:72,defectViews:186,visibilityViews:48,sourcePolicies:6,
  baselinePasses:evaluations.filter(e=>e.view.kind==='calibration'&&e.passed).length,
  faults:Object.fromEntries(outcomes.map(k=>[k,faults.filter(e=>e.sensitivity.outcome===k).length])),
  faultFamilies:arrowPrimaryDefects.map(d=>({name:d.name,views:faults.filter(e=>e.view.name===d.name).length,targetRejections:faults.filter(e=>e.view.name===d.name&&e.sensitivity.targetRejected).length,sourceFrameRejections:faults.filter(e=>e.view.name===d.name&&e.sensitivity.sourceFrameRejected).length})),
  visibility:evaluations.filter(e=>e.view.kind==='visibility-missing').map(e=>({name:e.view.name,view:arrowPrimaryViewKey(e.view),...e.sensitivity})),
  qualification:'pending-source-PDF-observations-immutable-qualification-and-public-admission'};
 assert.equal(summary.baselinePasses,72);assert.equal(summary.faults['visible-fault-accepted'],0);assert.equal(summary.faults['rejected-outside-target'],0);
 assert.ok(summary.faultFamilies.every(f=>f.targetRejections>0||f.sourceFrameRejections>0));
 return{...model,evaluations,summary};
}

export function arrowSourcePrimaryEntry(input,sources,model,manifest){
 return{schemaVersion:1,completed:true,comparisonKind:'native-arrow-standalone-source-primary-observations',converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',
  contract:arrowSourcePrimaryContract,snapshotSha256:input.evidence.snapshotSha256,renderer:input.report.renderer,
  sourceHashes:Object.fromEntries([...sources].map(([f,s])=>[f,s.sha256])),
  inputs:{producer:input.producer,checker:input.checker,producerSha256:input.producerSha256,checkerSha256:input.checkerSha256},summary:model.summary,
  viewer:'index.html',policies:'policies.json',manifest,agent:{pendingGates:['source-PDF-observations','immutable-primary-and-PDF-qualification','owned-public-combined-admission'],interpretation:'Native source envelopes, root-only original-reference presentation, original metadata and every paired-image view are retained. This does not admit public conversion.'}};
}

export async function loadArrowSourcePrimaryOwned(file){
 arrowAgentPath(file);assert.match(file,/^artifacts\/arrow-source-primary-calibration\/run-[a-f0-9-]+\/report.json$/);
 const folder=path.dirname(path.join(root,file));await outputPath(folder);
 const read=async f=>{const p=await outputPath(folder,arrowAgentPath(f));assert.ok((await stat(p)).size<30000000);return readFile(p);};
 const bytes=await read('report.json');assert.ok(bytes.length<32000);const report=JSON.parse(bytes);
 assert.deepEqual([report.completed,report.converterInvoked,report.approvedImagePolicy,report.imageConformanceClaim],[true,false,false,false]);
 assert.equal(report.manifest.file,'manifest.json');const mb=await read('manifest.json');assert.equal(sha256(mb),report.manifest.sha256);
 const manifest=JSON.parse(mb),files=new Map();assert.equal(Object.keys(manifest.artifacts).length,report.manifest.files);
 for(const [f,h]of Object.entries(manifest.artifacts)){const b=await read(f);assert.equal(sha256(b),h);files.set(f,b);}
 const sources=await arrowSourcePrimarySources();assert.deepEqual(report.sourceHashes,Object.fromEntries([...sources].map(([f,s])=>[f,s.sha256])));
 for(const [f,s]of sources)assert.equal(sha256(files.get('source-captures/'+f)),s.sha256);
 const input=await loadArrowSourcePrimaryInput(report.inputs.producer,report.inputs.checker,async(k,f)=>files.get('upstream/'+k+'/'+f));
 return{folder,bytes,sha256:sha256(bytes),report,manifest,files,sources,input};
}
