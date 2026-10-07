import assert from 'node:assert/strict';
import path from 'node:path';
import {runArrowSourcePrimaryControls,runArrowSourcePrimaryBrowserControls} from './arrow-source-primary-self-test.mjs';
import {runArrowFaintControls} from './arrow-faint-self-test.mjs';
import {arrowPdfViews,deriveArrowInkPolicy} from './arrow-pdf-policy.mjs';
import {evaluateArrowSourcePdf,arrowSourcePdfInputs} from './arrow-source-pdf-model.mjs';
import {loadArrowEvidence} from './arrow-evidence.mjs';
import {buildArrowNativeFrame} from './arrow-native-frame.mjs';
import {arrowPdfRegions} from './arrow-native-contract.mjs';
import {arrowSourcePrimaryReference} from './arrow-source-primary-reference.mjs';

export async function runArrowSourcePdfControls(){
 const controls=[...await runArrowSourcePrimaryControls(),...runArrowFaintControls()];
 const moments=()=>({reference:Array.from({length:3},()=>({mass:0,x:0,y:0})),actual:Array.from({length:3},()=>({mass:0,x:0,y:0}))});
 const region=id=>({id,rasterRectangles:{'1x':{x:0,y:0,width:2,height:2},'4x':{x:0,y:0,width:8,height:8}},inkMoments:moments()});
 const rows=arrowPdfViews.map(v=>({...v,converterInvoked:false,pageSize:{width:2*v.scale,height:2*v.scale},whole:region('whole-picture'),regions:[region('paint-4')],outsideDiagramChangedPixels:0}));
 const policy=deriveArrowInkPolicy(rows),model={policies:[],visibility:[{name:'faint-filled-tip-loss',raster:'relative-viewport',source:policy,scene:policy}]};
 const record={view:{...arrowPdfViews[0],kind:'visibility-missing',name:'faint-filled-tip-loss',raster:'relative-viewport'},sourceFrame:{passed:true},source:structuredClone(rows[0]),scene:structuredClone(rows[0]),sourceDelta:{rawChangedPixels:0},sceneDelta:{rawChangedPixels:0}};
 const check=(name,change,verify)=>{const r=structuredClone(record);change(r);verify(evaluateArrowSourcePdf(model,r));controls.push({name,passed:true});};
 check('source frame blocks matching normalized pixels',r=>r.sourceFrame.passed=false,e=>{assert.equal(e.passed,false);assert.equal(e.source.passed,true);assert.equal(e.scene.passed,true);assert.equal(e.sensitivity.outcome,'source-frame-rejected');});
 check('outside-diagram paint blocks matching local signatures',r=>r.scene.outsideDiagramChangedPixels=1,e=>{assert.equal(e.passed,false);assert.equal(e.scene.checks.at(-1).passed,false);});
 check('source loss cannot be excused by matching scene',r=>{r.source.regions[0].inkMoments.actual[0].mass=1;r.sourceDelta.rawChangedPixels=1;},e=>{assert.equal(e.passed,false);assert.equal(e.scene.passed,true);assert.equal(e.sensitivity.targetRejected,true);});
 check('scene loss cannot be excused by matching source',r=>{r.scene.regions[0].inkMoments.actual[0].mass=1;r.sceneDelta.rawChangedPixels=1;},e=>{assert.equal(e.passed,false);assert.equal(e.source.passed,true);assert.equal(e.sensitivity.targetRejected,true);});
 return controls;
}

export async function runArrowSourcePdfBrowserControls(renderer){
 const controls=await runArrowSourcePrimaryBrowserControls(renderer),e=await loadArrowEvidence(),c=e.cases[0];
 const original=e.artifacts.get(c.id+'/plain-reference.svg').toString(),f=buildArrowNativeFrame(c.id,original,c.metrics);f.paper=arrowPdfRegions(c.metrics,f);
 const base=await arrowSourcePrimaryReference(renderer,c.metrics,f,original);
 for(const route of ['original-source','native-source']){
  const view={caseId:c.id,kind:'calibration',route,raster:'relative-viewport',name:'baseline',frame:'expanded',scale:1};
  const good=await arrowSourcePdfInputs(renderer,view,f,base),padded=await arrowSourcePdfInputs(renderer,{...view,kind:'padded-expanded'},f,base);
  assert.equal(good.sourceFrame.passed,true);assert.equal(padded.sourceFrame.passed,false);assert.equal(padded.scene,good.scene);
  controls.push({name:route+' expanded padding retains scene but rejects source frame',passed:true});
  if(route==='native-source'){
   const cropped=await arrowSourcePdfInputs(renderer,{...view,kind:'defect',name:'cropped-picture-root'},f,base);
   assert.equal(cropped.sourceFrame.passed,false);assert.equal(cropped.scene,good.scene);
   controls.push({name:'native crop is rejected before identical full-page normalization',passed:true});
  }
 }
 return controls;
}

if(path.basename(process.argv[1]??'')==='arrow-source-pdf-self-test.mjs'){
 const controls=await runArrowSourcePdfControls();console.log(JSON.stringify({kind:'arrow-source-PDF-pure-controls',controls:controls.length,passed:controls.every(c=>c.passed)}));
}
