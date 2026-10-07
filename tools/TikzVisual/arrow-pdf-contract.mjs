import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root,sha256} from './shape-oracle-bundle.mjs';
import {arrowCanonical} from './arrow-native-contract.mjs';
import {arrowPrimarySources} from './arrow-primary-contract.mjs';
import {arrowPrimaryCaseIds} from './arrow-primary-policy.mjs';
import {buildArrowPrimaryReference} from './arrow-primary-reference.mjs';
import {arrowPrimaryDefects,arrowPrimaryVisibility,mutateArrowPrimary,arrowVisibilityInputs} from './arrow-primary-defects.mjs';
import {arrowPdfViews,arrowPdfViewKey,arrowPdfContract} from './arrow-pdf-policy.mjs';
export const arrowPaperRoutes=['original-driver','native-picture','native-ink'];
export const arrowPaperRasters=['relative-viewport','absolute-viewport'];
export function arrowPaperPlan(){
 const rows=[],add=(kind,caseId,route,raster,name,views=arrowPdfViews)=>{for(const v of views)rows.push({id:caseId+'/'+kind+'/'+route+'/'+raster+'/'+name+'/'+arrowPdfViewKey(v),caseId,kind,route,raster,name,...v});};
 for(const id of arrowPrimaryCaseIds)for(const route of arrowPaperRoutes)for(const raster of arrowPaperRasters)add('calibration',id,route,raster,'baseline');
 for(const d of arrowPrimaryDefects)for(const route of arrowPaperRoutes.slice(1))add('defect',d.caseId,route,arrowPaperRasters[0],d.name,arrowPdfViews.filter(v=>!d.frames||d.frames.includes(v.frame)));
 for(const d of arrowPrimaryVisibility){add('visibility-calibration',d.caseId,'native-ink',arrowPaperRasters[0],d.name);add('visibility-missing',d.caseId,'native-ink',arrowPaperRasters[0],d.name);}
 for(const id of arrowPrimaryCaseIds)add('padded-expanded',id,'native-ink',arrowPaperRasters[0],'padded',arrowPdfViews.filter(v=>v.frame==='expanded'));
 return rows;
}
export function arrowPaperInputs(view,native,frame,original){
 const driver=view.route==='original-driver';let svg=driver?original:buildArrowPrimaryReference(native.metrics,frame,view.route==='native-picture'?'picture':'ink').svg;
 if(view.kind==='defect')svg=mutateArrowPrimary(svg,arrowPrimaryDefects.find(d=>d.name===view.name));
 if(view.kind.startsWith('visibility-')){const c=arrowPrimaryVisibility.find(d=>d.name===view.name),pair=arrowVisibilityInputs(svg,c);svg=view.kind==='visibility-missing'?pair.missing:pair.actual;}
 if(view.kind==='padded-expanded'){const b=frame.camera,box=[b.x-8,b.y-8,b.width+16,b.height+16];svg=svg.replace(/ width="[^"]+"/,' width="'+box[2]+'px"').replace(/ height="[^"]+"/,' height="'+box[3]+'px"').replace(/ viewBox="[^"]+"/,' viewBox="'+box.join(' ')+'"');}
 return{svg,units:driver?'bp':'cssPixels',svgOriginBp:driver?frame.origin:{x:0,y:0},rightLabel:driver?'Original TikZ SVG':view.kind.startsWith('visibility-')?'Native control':view.route==='native-picture'?'Native picture':'Native ink'};
}
export async function arrowPaperSources(){
 const sources=await arrowPrimarySources(),queue=['arrow-pdf-ink.mjs','arrow-pdf-policy.mjs','arrow-pdf-contract.mjs','arrow-pdf-panels.mjs','arrow-pdf-self-test.mjs',
 'calibrate-arrow-pdf.mjs','check-arrow-pdf.mjs'].map(f=>'tools/TikzVisual/'+f);
 for(let i=0;i<queue.length;i++){const f=queue[i];if(sources.has(f))continue;assert.match(f,/^tools\/TikzVisual\/[a-z0-9.-]+\.mjs$/);const bytes=arrowCanonical(await readFile(path.join(root,f)));sources.set(f,{bytes,sha256:sha256(bytes)});
  for(const m of bytes.toString().matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g))queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(f),m[1])));}
 return new Map([...sources].sort(([a],[b])=>a.localeCompare(b)));
}
export function arrowPaperSensitivity(view,evaluation,delta){
 const d=arrowPrimaryDefects.find(d=>d.name===view.name),rasterChanged=delta.rawChangedPixels>0,targetRejected=evaluation.checks.some(c=>c.id===d.target&&!c.passed);
 return{numericGatesBypassed:true,rasterChanged,targetRejected,outcome:!rasterChanged?'no-raster-change':evaluation.passed?'visible-fault-accepted':targetRejected?'target-rejected':'rejected-outside-target'};
}
export function arrowPaperSummary(rows){const outcomes=Object.fromEntries(['target-rejected','no-raster-change','visible-fault-accepted','rejected-outside-target'].map(k=>[k,rows.filter(r=>r.sensitivity.outcome===k).length]));
 return{converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,outcomes,qualification:'pending-strict-PDF-eligibility'};}
export function validateArrowPaperReport(r,e,frames){
 assert.deepEqual([r.schemaVersion,r.completed,r.comparisonKind,r.converterInvoked,r.approvedImagePolicy,r.imageConformanceClaim],
 [1,true,'native-arrow-PDF-observations',false,false,false]);assert.equal(r.snapshotSha256,e.snapshotSha256);assert.deepEqual(r.contract,arrowPdfContract);assert.deepEqual(r.frames,frames);
 const plan=arrowPaperPlan();assert.deepEqual(r.observations.map(o=>o.view),plan);const files=new Set(['index.html','policies.json','sensitivity.json','ink-controls.json',...Object.keys(r.sourceHashes).map(f=>'source-captures/'+f)]);
 for(const f of frames){files.add(f.caseId+'/paper-frame.json');for(const scale of[1,4])files.add('reference/'+f.caseId+'/pdf-page-'+scale+'x.png');}
 for(const o of r.observations){assert.equal(o.numbers,o.view.id+'/numbers.json');assert.equal(o.svg,o.view.id+'/input.svg');files.add(o.numbers);files.add(o.svg);
  assert.deepEqual(Object.keys(o.images),['svg-page','pdf','svg','difference','amplified','overlay',...(o.view.scale===1?['sheet']:[])]);
  for(const[k,f]of Object.entries(o.images)){assert.equal(f,o.view.id+'-'+k+'.png');files.add(f);}
  const cropped=o.view.kind==='defect'||o.view.kind==='visibility-missing';assert.equal(o.crops.length,cropped?1:0);
  if(cropped){const d=(o.view.kind==='defect'?arrowPrimaryDefects:arrowPrimaryVisibility).find(d=>d.name===o.view.name);assert.equal(o.crops[0].id,d.target);
   assert.deepEqual(Object.keys(o.crops[0].images),['pdf','svg','difference','amplified','overlay','sheet']);
   for(const[k,f]of Object.entries(o.crops[0].images)){assert.equal(f,o.view.id+'/crop-'+d.target+'-'+k+'.png');files.add(f);}}
 }
 assert.deepEqual(new Set(Object.keys(r.artifacts)),files);for(const h of Object.values(r.artifacts))assert.match(h,/^[a-f0-9]{64}$/);
 assert.deepEqual(r.agent,{viewer:'index.html',pendingGates:['strict-PDF-eligibility','immutable-qualification','public-combined-admission'],
  interpretation:'Native PDF observations and prospective SVG ink fingerprints only. Original lost-edge and viewport failures are retained. Neither raster route grants conformance.'});
 return{observations:plan.length,calibrationViews:144,defectViews:124,visibilityViews:16,paddedExpandedViews:12,nativeCases:6,regions:frames.reduce((n,f)=>n+f.regions.length,0)};
}
