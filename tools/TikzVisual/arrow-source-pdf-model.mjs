import assert from 'node:assert/strict';
import {arrowPrimaryCaseIds} from './arrow-primary-policy.mjs';
import {arrowPrimaryDefects,arrowPrimaryVisibility,mutateArrowPrimary,arrowVisibilityInputs} from './arrow-primary-defects.mjs';
import {arrowPdfViews,arrowPdfViewKey,arrowPdfStrictAttempt,deriveArrowInkPolicy,evaluateArrowInk} from './arrow-pdf-policy.mjs';
import {deriveArrowFaintPolicy,evaluateArrowFaint} from './arrow-faint-policy.mjs';
import {arrowViewportRegions,arrowViewportExtra,arrowViewportFrameCheck} from './arrow-viewport-model.mjs';
import {normalizeArrowViewport,addArrowViewportExtra} from './arrow-viewport-normalize.mjs';
import {arrowSourceCamera} from './arrow-source-envelope.mjs';

export const arrowSourcePdfRoutes=['original-source','native-source'];
export const arrowSourcePdfRasters=['relative-viewport','absolute-viewport'];
export const arrowSourcePdfContract={id:'native-arrow-conservative-source-and-scene-PDF-v1',
 reference:'Unchanged ordinary PDF pages, native page origin and six-decimal conservative source envelope; no candidate fit.',
 source:'Source framing and source PDF pixels are mandatory before outer presentation is normalized to the physical page.',
 scene:'Drawing children, root paint and explicit clips remain unchanged. The full physical page and outside-diagram differences are required.',
 views:'Both original-reference and independently reconstructed native sources, both raster routes and every natural/expanded 1x/4x white view remain required.',
 limits:'Native-only nonzero-ink PDF limits and exact RGB moments are saved before faults. Earlier strict attempts and intrinsic experiments remain diagnostics.',
 controls:'Both raster routes retain every native fault, synthetic visibility control, outside-diagram mark and expanded padding test.',
 scope:'Prospective six-fixture glyph-free observations; immutable qualification and public combined admission remain pending.'};

export function arrowSourcePdfPolicyIndex(policies){
 return policies.map(p=>({caseId:p.caseId,route:p.route,raster:p.raster,file:'policies/'+p.caseId+'/'+p.route+'/'+p.raster+'.json',sourceState:p.source.state,sceneState:p.scene.state}));
}

export function arrowSourcePdfVisibilityIndex(policies){
 return policies.map(p=>({name:p.name,raster:p.raster,syntheticControl:true,file:'visibility/'+p.name+'/'+p.raster+'/policy.json'}));
}

export function arrowSourcePdfPlan(){
 const rows=[],add=(kind,caseId,route,raster,name,views=arrowPdfViews)=>{for(const v of views)rows.push({id:caseId+'/'+kind+'/'+route+'/'+raster+'/'+name+'/'+arrowPdfViewKey(v),caseId,kind,route,raster,name,...v});};
 for(const id of arrowPrimaryCaseIds)for(const route of arrowSourcePdfRoutes)for(const raster of arrowSourcePdfRasters)add('calibration',id,route,raster,'baseline');
 for(const d of arrowPrimaryDefects)for(const raster of arrowSourcePdfRasters)add('defect',d.caseId,'native-source',raster,d.name,arrowPdfViews.filter(v=>!d.frames||d.frames.includes(v.frame)));
 for(const c of arrowPrimaryVisibility)for(const raster of arrowSourcePdfRasters){add('visibility-calibration',c.caseId,'native-source',raster,c.name);add('visibility-missing',c.caseId,'native-source',raster,c.name);}
 for(const id of arrowPrimaryCaseIds)for(const route of arrowSourcePdfRoutes)for(const raster of arrowSourcePdfRasters){
  add('extra-ink',id,route,raster,'outside-diagram');add('padded-expanded',id,route,raster,'padded',arrowPdfViews.filter(v=>v.frame==='expanded'));
 }
 assert.equal(rows.length,396);assert.equal(new Set(rows.map(v=>v.id)).size,rows.length);return rows;
}

export function arrowSourcePdfControl(v){
 return v.kind==='extra-ink'?{target:'outside-diagram'}:v.kind==='defect'?arrowPrimaryDefects.find(d=>d.name===v.name):v.kind==='visibility-missing'?arrowPrimaryVisibility.find(d=>d.name===v.name):null;
}

export async function arrowSourcePdfInputs(renderer,v,frame,base){
 const driver=v.route==='original-source',units=driver?'bp':'cssPixels',svgOriginBp=driver?frame.origin:{x:0,y:0};
 let svg=driver?base.reference:base.actual,extra=null;
 if(v.kind==='defect')svg=mutateArrowPrimary(svg,arrowSourcePdfControl(v));
 if(v.kind.startsWith('visibility-')){const c=arrowPrimaryVisibility.find(d=>d.name===v.name),pair=arrowVisibilityInputs(svg,c);svg=v.kind==='visibility-missing'?pair.missing:pair.actual;}
 if(v.kind==='extra-ink'){extra=arrowViewportExtra(frame,units,svgOriginBp);svg=addArrowViewportExtra(svg,extra);}
 if(v.kind==='padded-expanded'){
  const r=base.envelope.root,envelope={root:{x:r.x-8,y:r.y-8,width:r.width+16,height:r.height+16}};
  svg=(await normalizeArrowViewport(renderer,svg,units,svgOriginBp,arrowSourceCamera(envelope))).svg;
 }
 const normalized=await normalizeArrowViewport(renderer,svg,units,svgOriginBp,frame.paper.camera);
 return{svg,scene:normalized.svg,normalization:normalized.proof,extra,sourceFrame:arrowViewportFrameCheck(normalized.proof.sourceFrame,base.envelope.root),
  units,svgOriginBp,rightLabel:v.kind==='extra-ink'?'Extra SVG ink':v.kind==='defect'||v.kind==='visibility-missing'?'SVG fault':v.kind.startsWith('visibility-')?'Native control':driver?'PGF source':'Native source'};
}

export function arrowSourcePdfBaseline(records,v){
 const kind=v.kind==='visibility-missing'?'visibility-calibration':'calibration';
 return records.find(r=>r.view.kind===kind&&r.view.caseId===v.caseId&&r.view.route===v.route&&r.view.raster===v.raster&&arrowPdfViewKey(r.view)===arrowPdfViewKey(v)&&(kind==='calibration'||r.view.name===v.name));
}

export function deriveArrowSourcePdfPolicies(records,frames){
 const policies=[];
 for(const f of frames)for(const route of arrowSourcePdfRoutes)for(const raster of arrowSourcePdfRasters){
  const rows=records.filter(r=>r.view.kind==='calibration'&&r.view.caseId===f.caseId&&r.view.route===route&&r.view.raster===raster);
  if(rows.length===0)continue;
  const mode=f.caseId+'/'+route,source=rows.map(r=>r.source),scene=rows.map(r=>r.scene);
  policies.push({caseId:f.caseId,route,raster,source:deriveArrowFaintPolicy(source,f.paper.camera,f.paper.regions,mode),scene:deriveArrowFaintPolicy(scene,f.paper.camera,arrowViewportRegions(f),mode),
   strict:{source:arrowPdfStrictAttempt(source,f.paper.camera,f.paper.regions,mode),scene:arrowPdfStrictAttempt(scene,f.paper.camera,arrowViewportRegions(f),mode)}});
 }
 const visibility=[];
 for(const c of arrowPrimaryVisibility)for(const raster of arrowSourcePdfRasters){
  const rows=records.filter(r=>r.view.kind==='visibility-calibration'&&r.view.name===c.name&&r.view.raster===raster);if(rows.length===0)continue;
  visibility.push({name:c.name,raster,syntheticControl:true,source:deriveArrowInkPolicy(rows.map(r=>r.source)),scene:deriveArrowInkPolicy(rows.map(r=>r.scene))});
 }
 return{policies,visibility};
}

export function evaluateArrowSourcePdf(model,r){
 const v=r.view,synthetic=v.kind.startsWith('visibility-');
 const p=synthetic?model.visibility.find(p=>p.name===v.name&&p.raster===v.raster):model.policies.find(p=>p.caseId===v.caseId&&p.route===v.route&&p.raster===v.raster);
 assert.ok(p);const evaluate=synthetic?evaluateArrowInk:evaluateArrowFaint,source=evaluate(p.source,r.source),scene=evaluate(p.scene,r.scene);
 scene.checks.push({id:'outside-diagram',passed:r.scene.outsideDiagramChangedPixels===0});scene.passed=scene.checks.every(c=>c.passed);
 const control=arrowSourcePdfControl(v),sourceChanged=(r.sourceDelta?.rawChangedPixels??0)>0,sceneChanged=(r.sceneDelta?.rawChangedPixels??0)>0;
 const passed=r.sourceFrame.passed&&source.passed&&scene.passed;
 const targetRejected=Boolean(control&&(source.checks.some(c=>c.id===control.target&&!c.passed)||scene.checks.some(c=>c.id===control.target&&!c.passed)));
 const sensitivity=control?{numericGatesBypassed:true,target:control.target,sourceChanged,sceneChanged,targetRejected,sourceFrameRejected:!r.sourceFrame.passed,
  outcome:!r.sourceFrame.passed&&!sourceChanged&&!sceneChanged?'source-frame-rejected':!sourceChanged&&!sceneChanged?'no-raster-change':targetRejected?'target-rejected':passed?'visible-fault-accepted':'rejected-outside-target'}:null;
 return{view:v,sourceFrame:r.sourceFrame,source,scene,passed,sensitivity};
}

export function buildArrowSourcePdfExperiment(records,frames){
 assert.deepEqual(records.map(r=>r.view),arrowSourcePdfPlan());
 const model=deriveArrowSourcePdfPolicies(records,frames),evaluations=records.map(r=>evaluateArrowSourcePdf(model,r));
 const faults=evaluations.filter(e=>e.view.kind==='defect'),extra=evaluations.filter(e=>e.view.kind==='extra-ink'),padding=evaluations.filter(e=>e.view.kind==='padded-expanded');
 const eligibility=model.policies.map(p=>({caseId:p.caseId,route:p.route,raster:p.raster,source:p.source.state,scene:p.scene.state,strictSource:p.strict.source.state,strictScene:p.strict.scene.state}));
 const summary={views:396,calibrationViews:96,defectViews:124,visibilityViews:32,extraInkViews:96,paddedExpandedViews:48,sourceScenePolicies:24,
  eligibleSources:eligibility.filter(p=>p.source==='eligible').length,eligibleScenes:eligibility.filter(p=>p.scene==='eligible').length,
  baselinePasses:evaluations.filter(e=>e.view.kind==='calibration'&&e.passed).length,
  faults:Object.fromEntries(['target-rejected','no-raster-change','source-frame-rejected','visible-fault-accepted','rejected-outside-target'].map(k=>[k,faults.filter(e=>e.sensitivity.outcome===k).length])),
  faultFamilies:arrowPrimaryDefects.map(d=>({name:d.name,views:faults.filter(e=>e.view.name===d.name).length,targetRejections:faults.filter(e=>e.view.name===d.name&&e.sensitivity.targetRejected).length,sourceFrameRejections:faults.filter(e=>e.view.name===d.name&&!e.sourceFrame.passed).length})),
  extraInkTargetRejections:extra.filter(e=>e.sensitivity.targetRejected).length,extraInkSourceHidden:extra.filter(e=>!e.sensitivity.sourceChanged&&e.sourceFrame.passed&&e.source.passed).length,
  paddingUnchanged:padding.filter(e=>{const r=records.find(r=>r.view.id===e.view.id);return r.sourceDelta.rawChangedPixels===0&&r.sceneDelta.rawChangedPixels===0;}).length,
  paddingSourceFrameRejections:padding.filter(e=>!e.sourceFrame.passed).length,
  rootCropViews:faults.filter(e=>e.view.name==='cropped-picture-root').map(e=>({view:e.view,sourceFramePassed:e.sourceFrame.passed,...e.sensitivity})),
  visibility:evaluations.filter(e=>e.view.kind==='visibility-missing').map(e=>({name:e.view.name,raster:e.view.raster,view:arrowPdfViewKey(e.view),...e.sensitivity})),
  qualification:'pending-immutable-primary-and-PDF-qualification-and-public-admission'};
 assert.equal(summary.baselinePasses,96);assert.equal(summary.eligibleSources,24);assert.equal(summary.eligibleScenes,24);
 assert.equal(summary.faults['visible-fault-accepted'],0);assert.equal(summary.faults['rejected-outside-target'],0);
 assert.ok(summary.faultFamilies.every(f=>f.targetRejections>0||f.sourceFrameRejections>0));
 assert.equal(summary.extraInkTargetRejections,96);assert.equal(summary.extraInkSourceHidden,96);assert.equal(summary.paddingUnchanged,48);assert.equal(summary.paddingSourceFrameRejections,48);
 return{...model,evaluations,eligibility,summary};
}
