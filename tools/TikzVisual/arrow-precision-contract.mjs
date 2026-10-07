import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root,sha256} from './shape-oracle-bundle.mjs';
import {arrowNativeSourceClosure,arrowCanonical} from './arrow-native-contract.mjs';
import {arrowPrecisionMasks,arrowPenProbeWidths,arrowPrecisionHybrid,arrowIsolatedPenProbe} from './arrow-precision-model.mjs';
export const precisionRoutes=['intrinsic-image','explicit-viewport'];
const views=['natural','expanded'].flatMap(frame=>[1,4].flatMap(scale=>['transparent','white','black'].map(background=>({frame,scale,background}))));
export function arrowPrecisionPlan(ids){
 return[
  ...ids.flatMap(caseId=>precisionRoutes.flatMap(route=>views.map(v=>({id:caseId+'/baseline/'+route+'/'+v.frame+'/'+v.scale+'x-'+v.background,caseId,kind:'baseline',route,mask:7,...v})))),
  ...arrowPrecisionMasks.flatMap(m=>precisionRoutes.flatMap(route=>views.map(v=>({id:'transforms/hybrid-'+m.mask+'/'+route+'/'+v.frame+'/'+v.scale+'x-'+v.background,
   caseId:'transforms',kind:'hybrid',route,mask:m.mask,...v})))),
  ...arrowPenProbeWidths.flatMap(width=>[1,4].flatMap(scale=>['transparent','white','black'].map(background=>({id:'transforms/pen-'+width+'/'+scale+'x-'+background,
   caseId:'transforms',kind:'pen',route:'explicit-viewport',width,frame:'expanded',scale,background}))))
 ];
}
export function arrowPrecisionInputs(view,native,frame,original){
 if(view.kind==='pen'){const reference=arrowIsolatedPenProbe(native.metrics,frame,'0.4'),actual=arrowIsolatedPenProbe(native.metrics,frame,view.width);
  return{reference:reference.svg,actual:actual.svg,leftIsDriver:false,origin:{x:0,y:0},pen:actual.record};}
 return{reference:original,actual:arrowPrecisionHybrid(native.metrics,frame,view.mask).svg,leftIsDriver:true,origin:frame.origin};
}
export async function arrowPrecisionSources(){
 const sources=await arrowNativeSourceClosure(),queue=['arrow-vector-pair.mjs','arrow-precision-model.mjs','arrow-precision-contract.mjs','arrow-precision-self-test.mjs',
  'inspect-arrow-precision.mjs','check-arrow-precision.mjs'].map(p=>'tools/TikzVisual/'+p);
 for(let i=0;i<queue.length;i++){const file=queue[i];if(sources.has(file))continue;assert.match(file,/^tools\/TikzVisual\/[a-z0-9.-]+\.mjs$/);
  const bytes=arrowCanonical(await readFile(path.join(root,file)));sources.set(file,{bytes,sha256:sha256(bytes)});
  for(const m of bytes.toString().matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g))queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(file),m[1])));
 }
 return new Map([...sources].sort(([a],[b])=>a.localeCompare(b)));
}
export function validateArrowPrecisionReport(r,evidence,frames){
 assert.deepEqual([r.schemaVersion,r.completed,r.converterInvoked,r.approvedImagePolicy,r.imageConformanceClaim,r.comparisonKind],
  [1,true,false,false,false,'native-arrow-precision-and-viewport-research']);assert.equal(r.snapshotSha256,evidence.snapshotSha256);
 const plan=arrowPrecisionPlan(evidence.cases.map(c=>c.id));assert.deepEqual(r.frames,frames);
 assert.deepEqual(r.observations.map(o=>o.view),plan);assert.equal(plan.length,390);
 const files=new Set(['index.html','controls.json',...Object.keys(r.sourceHashes).map(f=>'source-captures/'+f)]);
 for(const f of frames)files.add(f.caseId+'/frame.json');
 for(const o of r.observations){assert.equal(o.numbers,o.view.id+'/numbers.json');assert.equal(o.reference,o.view.id+'/reference.svg');assert.equal(o.actual,o.view.id+'/actual.svg');
  for(const file of[o.numbers,o.reference,o.actual])files.add(file);
  assert.deepEqual(Object.keys(o.images),['reference','actual','difference','alpha-difference','amplified','overlay',...(o.view.background==='white'&&o.view.scale===1?['comparison']:[])]);
  for(const[key,file]of Object.entries(o.images)){assert.equal(file,o.view.id+'-'+key+'.png');files.add(file);}
 }
 assert.deepEqual(new Set(Object.keys(r.artifacts)),files);for(const h of Object.values(r.artifacts))assert.match(h,/^[a-f0-9]{64}$/);
 assert.equal(r.agent.viewer,'index.html');assert.deepEqual(r.agent.pendingGates,['primary-calibration','PDF-calibration','image-only-sensitivity','public-combined-admission']);
 assert.equal(r.agent.interpretation,'Research observations only. Both intrinsic-image and explicit-viewport routes are retained; neither replaces the other or establishes public conformance.');
 return{observations:390,baselineViews:144,hybridViews:192,penViews:54,nativeCases:6,regions:frames.reduce((n,f)=>n+f.regions.length,0)};
}
