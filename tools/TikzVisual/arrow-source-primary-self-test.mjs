import assert from 'node:assert/strict';
import path from 'node:path';
import {loadArrowEvidence} from './arrow-evidence.mjs';
import {buildArrowNativeFrame} from './arrow-native-frame.mjs';
import {containment} from './shape-frame-math.mjs';
import {arrowSourceEnvelope} from './arrow-source-envelope.mjs';
import {arrowViewportFrameCheck} from './arrow-viewport-model.mjs';
import {arrowSourcePrimaryReference,arrowSourcePrimaryFrame} from './arrow-source-primary-reference.mjs';
import {mutateArrowPrimary,arrowPrimaryDefects} from './arrow-primary-defects.mjs';
import {runArrowViewportBrowserControls} from './arrow-viewport-self-test.mjs';
import {shapeViews,deriveShapeTrialPolicy} from './shape-primary-trial-policy.mjs';
import {evaluateArrowSourcePrimary} from './arrow-source-primary-contract.mjs';

export async function runArrowSourcePrimaryControls(){
 const controls=[],pass=(name,fn)=>{fn();controls.push({name,passed:true});};
 const e=await loadArrowEvidence();
 for(const c of e.cases){
  const f=buildArrowNativeFrame(c.id,e.artifacts.get(c.id+'/plain-reference.svg').toString(),c.metrics),s=arrowSourceEnvelope(c.metrics,f);
  pass(c.id+' source contains native ink',()=>assert.equal(containment(f.inkRoot,s.bounds,1e-8).passed,true));
  pass(c.id+' all native paints accounted',()=>assert.equal(s.records.length,c.metrics.driverState.paints.length));
  const values=[s.bounds.minX,s.bounds.minY,s.bounds.maxX-s.bounds.minX,s.bounds.maxY-s.bounds.minY];
  pass(c.id+' bounded six-decimal framing',()=>Object.values(s.root).forEach((v,i)=>assert.ok(Math.abs(v-values[i])<=.000000500001)));
  pass(c.id+' independent source frame',()=>assert.equal(arrowViewportFrameCheck(s.root,s.root).passed,true));
  for(const key of ['x','y','width','height'])pass(c.id+' source '+key+' fault rejects',()=>assert.equal(arrowViewportFrameCheck({...s.root,[key]:s.root[key]+.25},s.root).passed,false));
  pass(c.id+' nonfinite source frame rejects',()=>assert.throws(()=>arrowViewportFrameCheck({...s.root,width:Infinity},s.root)));
  pass(c.id+' bad native paint identity rejects',()=>{const bad=structuredClone(c.metrics);bad.driverState.paints[0].pathId=-1;assert.throws(()=>arrowSourceEnvelope(bad,f));});
 }
 const blank={rawChangedPixels:0,maxRawChannelError:0,premultipliedChangedPixels:0,maxPremultipliedChannelError:0,meanForegroundChannelError:0,
  topology:{threshold:16,connectivity:8,edgeNeighborhood:4,edgeState:'both-empty',componentDifference:0,maxEdgeDisplacementRasterPixels:0}};
 const region={id:'paint-2',nodeId:null,kind:'paint',rectangle:{x:0,y:0,width:2,height:2}};
 const policy=deriveShapeTrialPolicy(shapeViews.map(v=>({...blank,...v,regions:[{...region,...blank}]})),'synthetic target attribution');
 const result=evaluateArrowSourcePrimary({policies:[{id:'legacy-defaults',policy}],visibility:[]},{view:{id:'legacy-defaults/defect/full-id',caseId:'legacy-defaults',kind:'defect',name:'missing-legacy-tip',frame:'natural',scale:1,background:'white'},sourceFrame:{passed:true},numbers:{metrics:{...blank,rawChangedPixels:1},regions:[{...region,...blank,rawChangedPixels:1}]},delta:{rawChangedPixels:1}});
 pass('full view identity preserves local target attribution',()=>{assert.equal(result.sensitivity.targetRejected,true);assert.equal(result.sensitivity.outcome,'target-rejected');assert.equal(result.pixels.checks.at(-1).id,'paint-2');});
 return controls;
}

export async function runArrowSourcePrimaryBrowserControls(renderer){
 const controls=await runArrowViewportBrowserControls(renderer),e=await loadArrowEvidence();
 for(const c of e.cases){
  const original=e.artifacts.get(c.id+'/plain-reference.svg').toString(),frame=buildArrowNativeFrame(c.id,original,c.metrics);
  const r=await arrowSourcePrimaryReference(renderer,c.metrics,frame,original);
  assert.equal(r.originalFrame.passed,true);assert.equal(r.referenceProof.bodyUnchanged,true);assert.equal(r.referenceProof.rootPaintUnchanged,true);
  assert.equal(r.actualProof.bodyUnchanged,true);assert.equal(r.actualProof.rootPaintUnchanged,true);
  assert.equal((await arrowSourcePrimaryFrame(renderer,r.actual,r.envelope)).passed,true);
  controls.push({name:c.id+' reference body and source framing retained',passed:true});
 }
 const c=e.cases[0],frame=buildArrowNativeFrame(c.id,e.artifacts.get(c.id+'/plain-reference.svg').toString(),c.metrics);
 const r=await arrowSourcePrimaryReference(renderer,c.metrics,frame,e.artifacts.get(c.id+'/plain-reference.svg').toString());
 const cropped=mutateArrowPrimary(r.actual,arrowPrimaryDefects.find(d=>d.change==='root'));
 assert.equal((await arrowSourcePrimaryFrame(renderer,cropped,r.envelope)).passed,false);
 controls.push({name:'source crop rejects before scene normalization',passed:true});
 return controls;
}

if(path.basename(process.argv[1]??'')==='arrow-source-primary-self-test.mjs'){
 const controls=await runArrowSourcePrimaryControls();console.log(JSON.stringify({kind:'arrow-source-primary-pure-controls',controls:controls.length,passed:controls.every(c=>c.passed)}));
}
