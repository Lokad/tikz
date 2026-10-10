// Native math scope and fault targets; shared policy/PNG machinery stays generic.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root,sha256} from './shape-oracle-bundle.mjs';
import {shapeViews,deriveShapeTrialPolicy,evaluateShapeTrial,nativeMetricEnvelope} from './shape-primary-trial-policy.mjs';
import {mathFramingCases,mathFramingFamily,deriveMathFraming,withMathNaturalRoot} from './math-label-framing.mjs';
import {buildMathNativeVariants} from './math-label-native-svg.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {measureArrowVectorPair} from './arrow-vector-pair.mjs';
export const mathPrimaryEncodings=['atlas-integer-6','atlas-integer-12'];
export const mathPrimaryCaptures=['intrinsic-image','explicit-viewport'];
export const mathPrimaryViews=mathPrimaryCaptures.flatMap(capture=>shapeViews.map(v=>({capture,...v})));
export const mathPrimaryKey=v=>v.capture+'/'+v.frame+'/'+v.scale+'x-'+v.background;
export const mathControlViews=mathPrimaryCaptures.flatMap(capture=>[1,4].map(scale=>({capture,frame:'expanded',scale,background:'white'})));
export const mathNativeImageSha256='b124baf97409d134781e233dd605461e315387991c2bae6cba8e975ec64c650a';
export function mathPrimaryNativeHash(ids){
 const family=mathFramingFamily(ids);
 return family.length===1?'8e8319ea03da1fde250a1ca29a1b96ace966c5ea3cfb3e3bb530364d4d69c8a7':mathNativeImageSha256;
}
export const mathPrimarySources=['math-label-primary.mjs','math-label-framing.mjs','math-label-native-svg.mjs','math-label-native-paths.mjs',
 'check-math-label-framing.mjs','diagram-native-root.mjs','arrow-log.mjs','arrow-driver-state.mjs','arrow-native-frame.mjs',
 'edge-oracle.mjs','edge-oracle-frame.mjs','edge-oracle-pair.mjs','edge-trial-images.mjs','arrow-vector-pair.mjs',
 'shape-primary-trial-policy.mjs','path-label-primary-pixels.mjs','shape-frame-math.mjs','shape-image-pair.mjs',
 'shape-raster-metrics.mjs','calc-png.mjs','calc-saved-images.mjs','shape-oracle-bundle.mjs','compare.mjs',
 'browser-profile.json','package.json','package-lock.json'];
export async function mathPrimaryNativeCase(renderer,bundle,id,supplement,pathSupplement){
 const family=mathFramingFamily(bundle.report.cases.map(c=>c.id));
 assert.ok(family.some(c=>c.id===id),'Native input does not own this fixture.');
 assert.equal(bundle.sha256,mathPrimaryNativeHash(family.map(c=>c.id)),'Use the accepted frozen native-only input.');
 assert.equal(bundle.report.converterInvoked,false);
 const prefix='events/'+id+'/',reference=bundle.files.get(prefix+'oracle.svg').toString(),
  events=bundle.json(prefix+'events.json'),measurements=bundle.json(prefix+'measurements.json'),atlases={};
 for(const font of new Set(events.nodes.flatMap(n=>n.glyphs.map(g=>g.font))))atlases[font]=bundle.files.get(prefix+'fonts/'+font+'.svg').toString();
 const native=await buildMathNativeVariants(renderer,{reference,events,measurements,atlases,includeGeometry:true});
 for(const v of native.variants)assert.equal(sha256(Buffer.from(v.svg)),bundle.report.artifacts[id+'/'+v.id+'/actual.svg'],'Frozen native encoding changed.');
 supplement??=JSON.parse(await readFile(path.join(root,'tests/Reference/MathLabels/native-layout/'+id+'/framing.json')));
 pathSupplement??=JSON.parse(await readFile(path.join(root,'tests/Reference/MathLabels/native-layout/'+id+'/paths.json')));
 const frame=await deriveMathFraming(renderer,{caseId:id,reference,events,measurements,supplement,pathSupplement,native});
 const encodings=[];
 for(const encoding of mathPrimaryEncodings)encodings.push({id:encoding,svg:await withMathNaturalRoot(renderer,native.variants.find(v=>v.id===encoding).svg,frame)});
 return{reference,events,measurements,supplement,pathSupplement,frame,encodings};
}
export async function measureMathPrimary(renderer,native,svg,view,target,{sourceRecapture=false}={}){
 const measure=view.capture==='intrinsic-image'?measureEdgeTrialPrimary:measureArrowVectorPair;
 assert.ok(mathPrimaryCaptures.includes(view.capture));
 assert.equal(typeof sourceRecapture,'boolean');
 assert.ok(!sourceRecapture||target===undefined,'Source recapture cannot narrow targeted diagnostics.');
 // Recapture checks both complete PNGs and whole metrics. The shared renderer
 // requires a region; retain one without repeating all local observations.
 const regions=sourceRecapture?native.frame.regions.slice(0,1):native.frame.regions;
 return measure(renderer,{reference:native.reference,actual:svg,leftIsDriver:true,origin:native.frame.origin,
  camera:native.frame.camera,regions,allowMathMarks:true,...view,
  cropLimit:target?1:0,cropRegionIds:target?[target]:[],
  referenceLabel:'Original native TikZ',rightLabel:'Independent math encoding / inspected output'});
}
export function deriveMathPrimaryPolicy(caseId,records){
 assert.ok(mathFramingCases.some(c=>c.id===caseId)||caseId==='flowchart-styled-labels');
 const expected=mathPrimaryEncodings.flatMap(encoding=>mathPrimaryViews.map(v=>encoding+'/'+mathPrimaryKey(v)));
 assert.deepEqual(records.map(r=>r.encoding+'/'+mathPrimaryKey(r)).sort(),expected.sort(),'Math native view coverage differs.');
 for(const r of records){assert.equal(r.converterInvoked,false);assert.equal(r.repeat.rawChangedPixels,0);assert.equal(r.actualRepeat.rawChangedPixels,0);}
 return Object.fromEntries(mathPrimaryCaptures.map(capture=>{
  const rows=shapeViews.map(view=>{
   const matches=records.filter(r=>r.capture===capture&&r.frame===view.frame&&r.scale===view.scale&&r.background===view.background),base=matches[0];
   assert.equal(matches.length,2);
   return{...view,...nativeMetricEnvelope(matches.map(r=>r.metrics)),regions:base.regions.map((r,i)=>{
    for(const row of matches)assert.deepEqual({id:row.regions[i].id,nodeId:row.regions[i].nodeId,kind:row.regions[i].kind,rectangle:row.regions[i].rectangle},
     {id:r.id,nodeId:r.nodeId,kind:r.kind,rectangle:r.rectangle});
    return{...r,...nativeMetricEnvelope(matches.map(row=>row.regions[i]))};
   })};
  });
  return[capture,deriveShapeTrialPolicy(rows,'Fixed math '+caseId+' native-only atlas matrix encodings; '+capture)];
 }));
}
export function evaluateMathPrimary(policies,row){
 assert.ok(mathPrimaryCaptures.includes(row.capture));
 const view=Object.fromEntries(['frame','scale','background'].map(k=>[k,row[k]]));
 return evaluateShapeTrial(policies[row.capture],view,row);
}
export function mathPrimaryControls(frame){
 const select=(name,nodeId,predicate,whole=false)=>{
  const marks=frame.records.filter(r=>r.nodeId===nodeId),selected=whole?marks:marks.filter(predicate).slice(0,1);assert.ok(selected.length,name);
  return{name,nodeId,targets:selected.map(r=>r.id),region:whole?'label-'+nodeId:selected[0].id};
 };
 let targets;
 if(frame.caseId==='flowchart-styled-labels')targets=[
  select('bold-ten','input',r=>r.font==='bold-10'),
  select('italic-ten','filter',r=>r.font==='italic-10'),
  select('bold-twelve','output',r=>r.font==='bold-12'),
  select('regular-period','review',r=>r.font==='regular-10'&&r.slot===46),
  select('italic-twelve','review',r=>r.font==='italic-12'),
  select('regular-twelve','diagram-label-1',r=>r.font==='regular-12'),
  select('normal-math-under-bold','output',r=>r.font==='math-italic-12'),
  select('fraction-bar','review',r=>r.kind==='rule'),
  select('radical-overbar','review',r=>r.kind==='rule'&&r.index===1),
  select('complete-multiline-sloped-label','diagram-label-5',()=>true,true)];
 else if(frame.caseId==='network-math-labels')targets=[
  select('complete-path-label','diagram-label-1',()=>true,true),
  select('five-point-script','output',r=>r.font==='math-roman-5'),
  select('fraction-bar','output',r=>r.kind==='rule')];
 else if(frame.caseId==='math-label-contract')targets=[
  select('nested-script','nestedScripts',r=>r.font==='math-italic-5'),
  select('script-fraction-bar','fractionScript',r=>r.kind==='rule'),
  select('radical-overbar','root',r=>r.kind==='rule')];
 else{assert.equal(frame.caseId,'math-atom-contract');targets=[
  select('assembled-radical-piece','assembledRoot',r=>r.slot===117),
  select('six-point-script','largeScripts',r=>r.font==='math-italic-6'),
  select('overlapping-negation','negation',r=>r.font?.startsWith('math-symbol')&&r.slot===54)];}
 const controls=targets.flatMap(t=>['missing','quarter-pixel-shift'].map(kind=>({...t,kind})));
 if(frame.caseId==='math-atom-contract')controls.push({name:'empty-label-extra-ink',nodeId:'negativeSpace',targets:[],region:'label-negativeSpace',kind:'extra-ink'});
 return controls;
}
export async function mutateMathPrimary(renderer,svg,control,frame){
 assert.ok(['missing','quarter-pixel-shift','extra-ink'].includes(control.kind));
 assert.ok(control.targets.every(t=>/^native-(glyph|rule)-\d+$/.test(t)));
 const region=frame.regions.find(r=>r.id===control.region);assert.ok(region);
 return renderer.page.evaluate(({svg,control,bound})=>{
  const doc=new DOMParser().parseFromString(svg,'image/svg+xml');
  if(control.kind==='extra-ink'){
   const e=doc.createElementNS('http://www.w3.org/2000/svg','path'),x=(bound.minX+bound.maxX)/2,y=(bound.minY+bound.maxY)/2;
   e.id='math-empty-label-extra-ink';e.setAttribute('fill','#000');e.setAttribute('d','M'+x+' '+y+'h1v1h-1Z');doc.documentElement.append(e);
  }else for(const id of control.targets){const e=doc.getElementById(id);if(!e||!['use','rect'].includes(e.localName))throw Error('Missing owned math mark.');
   if(control.kind==='missing')e.remove();else e.setAttribute('transform','translate(0.25 0) '+e.getAttribute('transform'));}
  return new XMLSerializer().serializeToString(doc);
 },{svg,control,bound:region.bound});
}
