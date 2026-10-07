import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root,sha256} from './shape-oracle-bundle.mjs';
import {arrowNativeSourceClosure,arrowCanonical} from './arrow-native-contract.mjs';
import {arrowPrimaryViews,arrowPrimaryCaseIds,arrowPrimaryViewKey} from './arrow-primary-policy.mjs';
import {arrowPrimaryDefects,arrowPrimaryVisibility,mutateArrowPrimary,arrowVisibilityInputs,arrowDefectDeclaredInvisible} from './arrow-primary-defects.mjs';
import {buildArrowPrimaryReference,arrowPrimaryContract} from './arrow-primary-reference.mjs';
export function arrowPrimaryPlan(){
 const rows=[];const add=(kind,caseId,name,views=arrowPrimaryViews)=>{for(const v of views)rows.push({id:caseId+'/'+kind+'/'+name+'/'+arrowPrimaryViewKey(v),caseId,kind,name,...v});};
 for(const id of arrowPrimaryCaseIds)add('calibration',id,'picture');
 for(const id of arrowPrimaryCaseIds)add('ink-diagnostic',id,'ink');
 for(const d of arrowPrimaryDefects)add('defect',d.caseId,d.name,arrowPrimaryViews.filter(v=>!d.frames||d.frames.includes(v.frame)));
 for(const d of arrowPrimaryVisibility){add('visibility-calibration',d.caseId,d.name);add('visibility-missing',d.caseId,d.name);}
 return rows;
}
export function arrowPrimaryInputs(view,native,frame,original){
 const built=buildArrowPrimaryReference(native.metrics,frame,view.kind==='ink-diagnostic'?'ink':'picture');
 if(view.kind.startsWith('visibility-')){const control=arrowPrimaryVisibility.find(c=>c.name===view.name);assert.ok(control);
  const pair=arrowVisibilityInputs(built.svg,control);return{reference:pair.reference,actual:view.kind==='visibility-missing'?pair.missing:pair.actual,
   leftIsDriver:false,origin:{x:0,y:0},referenceLabel:'Native control',rightLabel:view.kind==='visibility-missing'?'Missing tip':control.opacity<.00001?'Tiny opacity':'Faint tip'};}
 const defect=view.kind==='defect'?arrowPrimaryDefects.find(d=>d.name===view.name):null;
 const label=defect?({remove:'Missing tip',fill:'Wrong fill','line-end':'Wrong end',shift:'Shifted tip',reverse:'Reversed tip',control:'Wrong control',
  'curve-end':'Wrong end',dash:'No dashes',cap:'Butt cap',opacity:'Transparent',clip:'No clip',root:'Cropped root',order:'Wrong order'})[defect.change]:'Native '+view.name;
 assert.equal(typeof label,'string');
 return{reference:original,actual:defect?mutateArrowPrimary(built.svg,defect):built.svg,
  leftIsDriver:true,origin:frame.origin,referenceLabel:'TikZ SVG',rightLabel:label};
}
export function arrowPrimaryRegions(frame){return[{id:'whole-picture',nodeId:null,kind:'whole-picture',rectangle:{x:0,y:0,width:frame.camera.width,height:frame.camera.height}},
 ...frame.regions.map(r=>({...r,nodeId:null}))];}
export function arrowSensitivity(view,evaluation,baselineHash,actualHash){
 const d=arrowPrimaryDefects.find(d=>d.name===view.name);assert.ok(d);const rasterChanged=baselineHash!==actualHash;
 const targetRejected=evaluation.checks.some(c=>c.id===d.target&&!c.passed),declaredInvisible=arrowDefectDeclaredInvisible(d,view);
 if(declaredInvisible){assert.equal(rasterChanged,false,'Declared invisible fault changed samples');assert.equal(evaluation.passed,true,'Invisible fault changed admission');}
 return{numericGatesBypassed:true,rasterChanged,declaredInvisible,targetRejected,
  outcome:declaredInvisible?'declared-invisible':!rasterChanged?'no-raster-change':evaluation.passed?'visible-fault-accepted':targetRejected?'target-rejected':'rejected-outside-target'};
}
export function arrowEvaluation(e){return{passed:e.passed,globalPassed:e.globalPassed,regionalPassed:e.regionalPassed,executedRegions:e.checks.length,
 failed:e.checks.filter(c=>!c.passed).map(c=>({id:c.id,metrics:c.metrics.filter(m=>!m.passed)}))};}
export function arrowSensitivitySummary(rows){
 const outcomes=Object.fromEntries(['target-rejected','declared-invisible','no-raster-change','visible-fault-accepted','rejected-outside-target'].map(k=>[k,rows.filter(r=>r.sensitivity.outcome===k).length]));
 const defects=arrowPrimaryDefects.map(d=>({name:d.name,views:rows.filter(r=>r.view.name===d.name).length,
  caughtViews:rows.filter(r=>r.view.name===d.name&&r.sensitivity.outcome==='target-rejected').length}));
 return{numericGatesBypassed:true,approvedImagePolicy:false,imageConformanceClaim:false,outcomes,defects,
  qualified:outcomes['visible-fault-accepted']===0&&outcomes['rejected-outside-target']===0&&defects.every(d=>d.caughtViews>0)};
}
export async function arrowPrimarySources(){
 const sources=await arrowNativeSourceClosure(),queue=['arrow-primary-reference.mjs','arrow-primary-policy.mjs','arrow-primary-defects.mjs','arrow-primary-contract.mjs',
  'arrow-primary-self-test.mjs','calibrate-arrow-primary.mjs','check-arrow-primary.mjs'].map(p=>'tools/TikzVisual/'+p);
 for(let i=0;i<queue.length;i++){const file=queue[i];if(sources.has(file))continue;assert.match(file,/^tools\/TikzVisual\/[a-z0-9.-]+\.mjs$/);
  const bytes=arrowCanonical(await readFile(path.join(root,file)));sources.set(file,{bytes,sha256:sha256(bytes)});
  for(const m of bytes.toString().matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g))queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(file),m[1])));
 }
 return new Map([...sources].sort(([a],[b])=>a.localeCompare(b)));
}
export function validateArrowPrimaryReport(r,evidence,frames){
 assert.deepEqual([r.schemaVersion,r.completed,r.converterInvoked,r.approvedImagePolicy,r.imageConformanceClaim,r.comparisonKind],
  [1,true,false,false,false,'native-arrow-primary-calibration']);assert.equal(r.snapshotSha256,evidence.snapshotSha256);
 assert.deepEqual(r.contract,arrowPrimaryContract);assert.deepEqual(r.frames,frames);const plan=arrowPrimaryPlan();assert.deepEqual(r.observations.map(o=>o.view),plan);
 const files=new Set(['index.html','trial-policy.json','sensitivity.json',...Object.keys(r.sourceHashes).map(f=>'source-captures/'+f)]);
 for(const f of frames)files.add(f.caseId+'/frame.json');for(const d of arrowPrimaryVisibility)files.add('visibility/'+d.name+'/policy.json');
 for(const o of r.observations){for(const key of['numbers','reference','actual']){assert.equal(o[key],o.view.id+'/'+({numbers:'numbers.json',reference:'reference.svg',actual:'actual.svg'})[key]);files.add(o[key]);}
  assert.deepEqual(Object.keys(o.images),['reference','actual','difference','alpha-difference','amplified','overlay',...(o.view.background==='white'&&o.view.scale===1?['comparison']:[])]);
  for(const[key,file]of Object.entries(o.images)){assert.equal(file,o.view.id+'-'+key+'.png');files.add(file);}
  const cropped=o.view.kind==='defect'||o.view.kind==='visibility-missing';assert.equal(o.crops.length,cropped?1:0);
  if(cropped){const d=(o.view.kind==='defect'?arrowPrimaryDefects:arrowPrimaryVisibility).find(d=>d.name===o.view.name),crop=o.crops[0];assert.equal(crop.id,d.target);
   assert.deepEqual(Object.keys(crop.images),['reference','actual','difference','amplified','sheet']);
   for(const[key,file]of Object.entries(crop.images)){assert.equal(file,o.view.id+'/crop-'+crop.id+'-'+key+'.png');files.add(file);}}
 }
 assert.deepEqual(new Set(Object.keys(r.artifacts)),files);for(const h of Object.values(r.artifacts))assert.match(h,/^[a-f0-9]{64}$/);
 assert.deepEqual(r.agent,{viewer:'index.html',pendingGates:['primary-qualification','PDF-calibration','public-combined-admission'],
  interpretation:'Unapproved native-only primary observations and image-only controls. Ink roots and all observed blind spots remain visible; no public conformance claim.'});
 return{observations:plan.length,calibrationViews:72,inkDiagnosticViews:72,defectViews:186,visibilityViews:48,defects:16,visibilityControls:2,
  nativeCases:6,regions:frames.reduce((n,f)=>n+f.regions.length,0)};
}
