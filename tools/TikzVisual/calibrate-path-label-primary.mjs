// Declared gap: native-only primary/local limits and missing/displaced label controls.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root,writeArtifact,sha256} from './shape-oracle-bundle.mjs';
import {createRenderer} from './compare.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {loadLabelImageEvidence} from './diagram-image-evidence.mjs';
import {runCalcChild,readCalcChild,ownCalcBundle} from './calc-admission-child.mjs';
import {calcEqual,loadCalcSavedReport} from './calc-saved-images.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {measureArrowVectorPair} from './arrow-vector-pair.mjs';
import {shapeViews,deriveShapeTrialPolicy,evaluateShapeTrial} from './shape-primary-trial-policy.mjs';
import {buildPathLabelImageReference,pathLabelPrimaryCaptures,mutatePathLabelImage,pathLabelImageControls,pathLabelControlViews} from './path-label-image-reference.mjs';
import {pathLabelNativeComponentLimit,pathLabelRootRegistrationViews,registerPathLabelNativeRoot} from './path-label-primary-policy.mjs';

assert.ok(process.argv.length===3||(process.argv.length===5&&process.argv[3]==='--reuse'),'Usage: node tools/TikzVisual/calibrate-path-label-primary.mjs <placement|interactions|frozen-diagram-arrow-report> [--reuse <prior-calibration>]');
const input=process.argv[2],output=path.join(root,'artifacts/path-label-primary-calibration/run-'+randomUUID()),artifacts={};let id=input;
const save=(p,b)=>writeArtifact(output,p,b,artifacts),json=(p,v)=>save(p,JSON.stringify(v,null,2)+'\n');
let phase='native-input',renderer,native,frame,reuse,reusedViews=0,reusedExpandedViews=0;const records=[],controls=[],rootRegistrations=[],reusableSources=new Map();
const key=v=>v.frame+'/'+v.scale+'x-'+v.background;
async function publish(completed,extra={}){
 if(completed)assert.ok(Object.keys(artifacts).length<=4096,'Primary report exceeds shared artifact bounds.');
 const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'path-label-native-primary-calibration',completed,
  phase:completed?'complete':phase,converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,
  imageConformanceClaim:false,imageAdmission:'pending',fixture:id,nativeInputSha256:native?.sha256,renderer:renderer?.identity,
  artifacts,records,controls,...(rootRegistrations.length?{rootRegistrations}:{}),...(reuse?{reuse:{inputSha256:reuse.sha256,reusedViews,reusedExpandedViews}}:{}),...extra},null,2)+'\n');
 await writeArtifact(output,'report.json',bytes);console.log(JSON.stringify({completed,phase,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));
}
async function observe(prefix,svg,view,target){
 if(reuse?.files.has(prefix+'/record.json')&&(view.frame==='expanded'||reusableSources.get(svg)===svg)){
  const old=structuredClone(reuse.json(prefix+'/record.json'));
  // Root-only changes preserve expanded pixels. The independent checker still
  // recaptures every reused source; update its declared intrinsic metadata.
  const v=/viewBox="([^"]+)"/.exec(svg)[1].split(' ').map(Number);
  old.naturalFrames.actual={x:v[0],y:v[1],width:v[2],height:v[3]};
  for(const[f,b]of reuse.files)if(f.startsWith(prefix+'/')&&f!==prefix+'/record.json')await save(f,b);
  await json(prefix+'/record.json',old);reusedViews++;if(view.frame==='expanded')reusedExpandedViews++;return{file:prefix+'/record.json',...old};
 }
 const measure=view.capture==='intrinsic-image'?measureEdgeTrialPrimary:measureArrowVectorPair;
 const pair=await measure(renderer,{reference:native.files.get('probed-reference.svg').toString('utf8'),actual:svg,leftIsDriver:true,
  origin:frame.origin,camera:frame.camera,regions:frame.regions,...view,cropLimit:target&&view.background==='white'?1:0,cropRegionIds:target?[target]:[],
  referenceLabel:'Original native TikZ',rightLabel:'Independent native encoding / defect'});
 assert.equal(pair.repeat.rawChangedPixels,0);assert.equal(pair.actualRepeat.rawChangedPixels,0);
 const images={};for(const [name,b64]of Object.entries(pair.images))if(!target||['reference','actual','comparison'].includes(name)){
  const file=prefix+'/'+name+'.png';await save(file,Buffer.from(b64,'base64'));images[name]=file;}
 // Control pairs already own full reference/actual PNGs. Keep their paired crop
 // sheet for inspection without four redundant derivatives per control view.
 for(const crop of pair.crops)for(const[name,b64]of Object.entries(target?{sheet:crop.sheet}:{...crop.paired,sheet:crop.sheet}))await save(prefix+'/crops/'+crop.id+'/'+name+'.png',Buffer.from(b64,'base64'));
 const row={...view,metrics:pair.metrics,regions:pair.regions,repeat:pair.repeat,actualRepeat:pair.actualRepeat,naturalFrames:pair.naturalFrames,images};
 await json(prefix+'/record.json',row);return{file:prefix+'/record.json',...row};
}
function envelope(rows,componentLimit=0){
 const result=structuredClone(rows[0]);
 for(const r of rows){assert.ok(r.topology.componentDifference<=componentLimit,'Native encoding changes topology outside declared scope.');
  for(const k of['rawChangedPixels','maxRawChannelError','premultipliedChangedPixels','maxPremultipliedChannelError','meanForegroundChannelError'])result[k]=Math.max(result[k],r[k]);
  result.topology.maxEdgeDisplacementRasterPixels=Math.max(result.topology.maxEdgeDisplacementRasterPixels,r.topology.maxEdgeDisplacementRasterPixels);
  result.topology.componentDifference=Math.max(result.topology.componentDifference,r.topology.componentDifference);
 }return result;
}
await publish(false);
try{
 native=await loadLabelImageEvidence(input);id=native.report.definition.id;await ownCalcBundle(native,'native',save);
 const handle=await runCalcChild(root,'dotnet',['run','--project','tools/TikzPathLabelOracle','-c','Release','--',path.relative(root,path.join(output,'native/report.json'))],'oracle',save);
 const oracle=await readCalcChild(root,handle,'path-label-native-glyph-oracle');await ownCalcBundle(oracle,'oracle',save);
 assert.equal(oracle.report.converterInvoked,false);assert.equal(oracle.report.nativeInputSha256,native.sha256);
 assert.ok(oracle.report.assemblyReferences.every(n=>n==='System'||n.startsWith('System.')));
 renderer=await createRenderer();await renderer.page.evaluate('globalThis.shapeRasterMetrics=('+createShapeRasterMetrics.toString()+')()');
 frame=await buildPathLabelImageReference(renderer,native,oracle.json('native-glyphs.json'));
 if(process.argv.length===5){
  reuse=await loadCalcSavedReport(path.resolve(root,process.argv[4]),'path-label-native-primary-calibration');
  assert.equal(reuse.report.nativeInputSha256,native.sha256);calcEqual(reuse.report.renderer,renderer.identity);
  calcEqual(reuse.json('frame.json').camera,frame.camera);calcEqual(reuse.json('frame.json').regions,frame.regions);
  for(const e of frame.encodings){const old=reuse.files.get('encodings/'+e.id+'.svg');if(!old)continue;
   assert.equal(e.svg.replace(/^<svg[^>]*>/,''),old.toString().replace(/^<svg[^>]*>/,''),'Expanded drawing changed.');reusableSources.set(e.svg,old.toString());}
  calcEqual(pathLabelImageControls(frame,oracle.json('native-glyphs.json')),reuse.report.controls.map(({comparisons,numericChecksBypassed,...c})=>c),'Controlled targets changed.');
 }
 await json('frame.json',{...frame,encodings:frame.encodings.map(({svg,...e})=>e)});
 for(const e of frame.encodings)await save('encodings/'+e.id+'.svg',e.svg);
 for(const file of['calibrate-path-label-primary.mjs','path-label-image-reference.mjs','path-label-evidence.mjs','diagram-image-evidence.mjs','diagram-native-root.mjs','arrow-native-svg.mjs','edge-oracle.mjs','curved-node-path-units.mjs','shape-frame-math.mjs','shape-pdf-camera.mjs',
  'calc-png.mjs','shape-raster-metrics.mjs','shape-primary-trial-policy.mjs','path-label-primary-policy.mjs','edge-trial-images.mjs','edge-oracle-pair.mjs','arrow-vector-pair.mjs',
  'compare.mjs','shape-oracle-bundle.mjs','calc-admission-child.mjs','calc-saved-images.mjs','browser-profile.json','text-profile.json','node-profile.json','package.json','package-lock.json'])
  await save('source-captures/tools/TikzVisual/'+file,await readFile(path.join(root,'tools/TikzVisual/'+file)));
 phase='native-encodings';
 for(const encoding of frame.encodings)for(const capture of pathLabelPrimaryCaptures){
  for(const view of shapeViews){const row=await observe('encodings/'+encoding.id+'/'+capture+'/'+key(view),encoding.svg,{...view,capture});
   records.push({encoding:encoding.id,capture,file:row.file,metrics:row.metrics});}
  console.log(JSON.stringify({phase,encoding:encoding.id,capture,views:shapeViews.length}));
 }
 phase='native-root-registration';
 for(const view of pathLabelRootRegistrationViews(id,frame.encodings.map(e=>e.id))){
  const base=JSON.parse(await readFile(path.join(output,records.find(r=>r.encoding===view.encoding&&r.capture===view.capture&&r.file.endsWith('/'+key(view)+'/record.json')).file)));
  const svg=registerPathLabelNativeRoot(frame.encodings.find(e=>e.id===view.encoding).svg,base.naturalFrames.reference),prefix='root-registration/'+view.encoding+'/'+key(view);
  await save(prefix+'/registered.svg',svg);const row=await observe(prefix,svg,view);
  calcEqual(row.naturalFrames.reference,row.naturalFrames.actual,'Matched native roots differ.');
  for(const metric of[row.metrics,...row.regions])assert.equal(metric.topology.componentDifference,0,'Matched native root changes topology.');
  rootRegistrations.push({...view,file:row.file});
 }
 const policies={};
 for(const capture of pathLabelPrimaryCaptures){const rows=[];
  for(const view of shapeViews){const matches=records.filter(r=>r.capture===capture&&r.file.endsWith('/'+key(view)+'/record.json'));
   const measured=await Promise.all(matches.map(async r=>JSON.parse(await readFile(path.join(output,r.file))))),base=measured[0];
   rows.push({...base,...envelope(measured.map(r=>r.metrics),pathLabelNativeComponentLimit(id,capture,view,'whole-picture')),
    regions:base.regions.map((r,i)=>({...r,...envelope(measured.map(row=>row.regions[i]),pathLabelNativeComponentLimit(id,capture,view,r.id))}))});
  }policies[capture]=deriveShapeTrialPolicy(rows,'Fixed trusted path-label '+id+' native-only decimal encodings; '+capture,shapeViews,
    (view,region)=>pathLabelNativeComponentLimit(id,capture,view,region));
 }
 await json('policies.json',policies);
 phase='label-sensitivity';
 const controlViews=pathLabelControlViews(frame)??shapeViews;
 for(const label of pathLabelImageControls(frame,oracle.json('native-glyphs.json'))){
  const kind=label.kind,original=frame.encodings[0].svg,altered=await mutatePathLabelImage(renderer,original,label),name=label.nodeId+'/'+kind;
  if(reuse){const old=reuse.files.get('controls/'+name+'/altered.svg').toString();assert.equal(altered.replace(/^<svg[^>]*>/,''),old.replace(/^<svg[^>]*>/,''),'Expanded controlled drawing changed.');reusableSources.set(altered,old);}
  await save('controls/'+name+'/altered.svg',altered);
  const control={...label,kind,numericChecksBypassed:true,comparisons:[]};controls.push(control);
  for(const capture of pathLabelPrimaryCaptures)for(const view of controlViews){
   const row=await observe('controls/'+name+'/'+capture+'/'+key(view),altered,{...view,capture},label.target);
   const evaluation=evaluateShapeTrial(policies[capture],view,row),base=records.find(r=>r.encoding===frame.encodings[0].id&&r.capture===capture&&r.file.endsWith('/'+key(view)+'/record.json'));
   const a=await readFile(path.join(output,base.file)),baseline=JSON.parse(a);
   // Exact independent recapture determines visibility; never grant an error allowance from a defect.
   const visible=artifacts[row.images.actual]!==artifacts[baseline.images.actual];
   if(['missing-clip','wrong-default-fill'].includes(kind))assert.equal(visible,true,'Declared visible control must change pixels: '+name);
   if(visible){assert.equal(evaluation.passed,false,'Visible label defect passed: '+name+' '+capture+' '+key(view));assert.ok(evaluation.checks.some(c=>c.id===label.target&&!c.passed),'Target region did not reject '+name);}
   else calcEqual(row.metrics,baseline.metrics,'Invisible control changed metrics.');
   await json(row.file,{...row,observedVisible:visible,evaluation});control.comparisons.push({capture,...view,file:row.file,observedVisible:visible,rejected:!evaluation.passed});
  }
  console.log(JSON.stringify({phase,node:label.nodeId,kind,views:pathLabelPrimaryCaptures.length*controlViews.length}));
 }
 await publish(true,{coverage:{encodings:frame.encodings.length,captures:2,nativeViews:records.length,labelControls:controls.length,controlViews:controls.reduce((n,c)=>n+c.comparisons.length,0),regions:frame.regions.length},
  scope:'Native-only primary/local calibration; text controls and, for diagrams, whole-label and native-tip controls in expanded white 1x/4x through both captures. PDF gates and current converter acceptance remain open.'});
}catch(error){await save('failure.log',String(error.stack??error).replaceAll(root,'<repo>'));await publish(false,{error:error.message});process.exitCode=1;}
finally{await renderer?.browser.close();}
