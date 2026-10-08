// Declared gap: native-only primary/local limits and missing/displaced label controls.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root,writeArtifact,sha256} from './shape-oracle-bundle.mjs';
import {createRenderer} from './compare.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {loadPathLabelEvidence} from './path-label-evidence.mjs';
import {runCalcChild,readCalcChild,ownCalcBundle} from './calc-admission-child.mjs';
import {calcEqual} from './calc-saved-images.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {measureArrowVectorPair} from './arrow-vector-pair.mjs';
import {shapeViews,deriveShapeTrialPolicy,evaluateShapeTrial} from './shape-primary-trial-policy.mjs';
import {buildPathLabelImageReference,pathLabelPrimaryCaptures,mutatePathLabelImage} from './path-label-image-reference.mjs';

assert.equal(process.argv.length,3,'Usage: node tools/TikzVisual/calibrate-path-label-primary.mjs <placement|interactions>');
const id=process.argv[2],output=path.join(root,'artifacts/path-label-primary-calibration/run-'+randomUUID()),artifacts={};
const save=(p,b)=>writeArtifact(output,p,b,artifacts),json=(p,v)=>save(p,JSON.stringify(v,null,2)+'\n');
let phase='native-input',renderer,native,frame;const records=[],controls=[];
const key=v=>v.frame+'/'+v.scale+'x-'+v.background;
async function publish(completed,extra={}){
 const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'path-label-native-primary-calibration',completed,
  phase:completed?'complete':phase,converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,
  imageConformanceClaim:false,imageAdmission:'pending',fixture:id,nativeInputSha256:native?.sha256,renderer:renderer?.identity,
  artifacts,records,controls,...extra},null,2)+'\n');
 await writeArtifact(output,'report.json',bytes);console.log(JSON.stringify({completed,phase,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));
}
async function observe(prefix,svg,view,target){
 const measure=view.capture==='intrinsic-image'?measureEdgeTrialPrimary:measureArrowVectorPair;
 const pair=await measure(renderer,{reference:native.files.get('probed-reference.svg').toString('utf8'),actual:svg,leftIsDriver:true,
  origin:frame.origin,camera:frame.camera,regions:frame.regions,...view,cropLimit:target&&view.background==='white'?1:0,cropRegionIds:target?[target]:[],
  referenceLabel:'Original native TikZ',rightLabel:'Independent native encoding / defect'});
 assert.equal(pair.repeat.rawChangedPixels,0);assert.equal(pair.actualRepeat.rawChangedPixels,0);
 const images={};for(const [name,b64]of Object.entries(pair.images))if(!target||['reference','actual','comparison'].includes(name)){
  const file=prefix+'/'+name+'.png';await save(file,Buffer.from(b64,'base64'));images[name]=file;}
 for(const crop of pair.crops)for(const[name,b64]of Object.entries({...crop.paired,sheet:crop.sheet}))await save(prefix+'/crops/'+crop.id+'/'+name+'.png',Buffer.from(b64,'base64'));
 const row={...view,metrics:pair.metrics,regions:pair.regions,repeat:pair.repeat,actualRepeat:pair.actualRepeat,naturalFrames:pair.naturalFrames,images};
 await json(prefix+'/record.json',row);return{file:prefix+'/record.json',...row};
}
function envelope(rows){
 const result=structuredClone(rows[0]);
 for(const r of rows){assert.equal(r.topology.componentDifference,0,'Native encoding changes topology.');
  for(const k of['rawChangedPixels','maxRawChannelError','premultipliedChangedPixels','maxPremultipliedChannelError','meanForegroundChannelError'])result[k]=Math.max(result[k],r[k]);
  result.topology.maxEdgeDisplacementRasterPixels=Math.max(result.topology.maxEdgeDisplacementRasterPixels,r.topology.maxEdgeDisplacementRasterPixels);
 }return result;
}
await publish(false);
try{
 native=await loadPathLabelEvidence(id);await ownCalcBundle(native,'native',save);
 const handle=await runCalcChild(root,'dotnet',['run','--project','tools/TikzPathLabelOracle','-c','Release','--',path.relative(root,path.join(output,'native/report.json'))],'oracle',save);
 const oracle=await readCalcChild(root,handle,'path-label-native-glyph-oracle');await ownCalcBundle(oracle,'oracle',save);
 assert.equal(oracle.report.converterInvoked,false);assert.equal(oracle.report.nativeInputSha256,native.sha256);
 assert.ok(oracle.report.assemblyReferences.every(n=>n==='System'||n.startsWith('System.')));
 renderer=await createRenderer();await renderer.page.evaluate('globalThis.shapeRasterMetrics=('+createShapeRasterMetrics.toString()+')()');
 frame=await buildPathLabelImageReference(renderer,native,oracle.json('native-glyphs.json'));
 await json('frame.json',{...frame,encodings:frame.encodings.map(({svg,...e})=>e)});
 for(const e of frame.encodings)await save('encodings/'+e.id+'.svg',e.svg);
 for(const file of['calibrate-path-label-primary.mjs','path-label-image-reference.mjs','path-label-evidence.mjs','shape-frame-math.mjs','shape-pdf-camera.mjs',
  'calc-png.mjs','shape-raster-metrics.mjs','shape-primary-trial-policy.mjs','edge-trial-images.mjs','edge-oracle-pair.mjs','arrow-vector-pair.mjs',
  'compare.mjs','shape-oracle-bundle.mjs','calc-admission-child.mjs','calc-saved-images.mjs','browser-profile.json','text-profile.json','node-profile.json','package.json','package-lock.json'])
  await save('source-captures/tools/TikzVisual/'+file,await readFile(path.join(root,'tools/TikzVisual/'+file)));
 phase='native-encodings';
 for(const encoding of frame.encodings)for(const capture of pathLabelPrimaryCaptures){
  for(const view of shapeViews){const row=await observe('encodings/'+encoding.id+'/'+capture+'/'+key(view),encoding.svg,{...view,capture});
   records.push({encoding:encoding.id,capture,file:row.file,metrics:row.metrics});}
  console.log(JSON.stringify({phase,encoding:encoding.id,capture,views:shapeViews.length}));
 }
 const policies={};
 for(const capture of pathLabelPrimaryCaptures){const rows=[];
  for(const view of shapeViews){const matches=records.filter(r=>r.capture===capture&&r.file.endsWith('/'+key(view)+'/record.json'));
   const measured=await Promise.all(matches.map(async r=>JSON.parse(await readFile(path.join(output,r.file))))),base=measured[0];
   rows.push({...base,...envelope(measured.map(r=>r.metrics)),regions:base.regions.map((r,i)=>({...r,...envelope(measured.map(row=>row.regions[i]))}))});
  }policies[capture]=deriveShapeTrialPolicy(rows,'Fixed trusted path-label '+id+' native-only decimal encodings; '+capture);
 }
 await json('policies.json',policies);
 phase='label-sensitivity';
 const glyphs=oracle.json('native-glyphs.json').nodes;let offset=0;const labels=[];
 for(const node of glyphs){if(!['from','target','seed'].includes(node.id))labels.push({nodeId:node.id,target:'native-glyph-'+offset});offset+=node.glyphs.length;}
 for(const label of labels)for(const kind of['missing','quarter-pixel-shift']){
  const original=frame.encodings[0].svg,altered=await mutatePathLabelImage(renderer,original,{...label,kind}),name=label.nodeId+'/'+kind;
  await save('controls/'+name+'/altered.svg',altered);
  const control={...label,kind,numericChecksBypassed:true,comparisons:[]};controls.push(control);
  for(const capture of pathLabelPrimaryCaptures)for(const view of shapeViews){
   const row=await observe('controls/'+name+'/'+capture+'/'+key(view),altered,{...view,capture},label.target);
   const evaluation=evaluateShapeTrial(policies[capture],view,row),base=records.find(r=>r.encoding===frame.encodings[0].id&&r.capture===capture&&r.file.endsWith('/'+key(view)+'/record.json'));
   const a=await readFile(path.join(output,base.file)),baseline=JSON.parse(a);
   // Exact independent recapture determines visibility; never grant an error allowance from a defect.
   const visible=artifacts[row.images.actual]!==artifacts[baseline.images.actual];
   if(visible){assert.equal(evaluation.passed,false,'Visible label defect passed: '+name+' '+capture+' '+key(view));assert.ok(evaluation.checks.some(c=>c.id===label.target&&!c.passed),'Target region did not reject '+name);}
   else calcEqual(row.metrics,baseline.metrics,'Invisible control changed metrics.');
   await json(row.file,{...row,observedVisible:visible,evaluation});control.comparisons.push({capture,...view,file:row.file,observedVisible:visible,rejected:!evaluation.passed});
  }
  console.log(JSON.stringify({phase,node:label.nodeId,kind,views:24}));
 }
 await publish(true,{coverage:{encodings:2,captures:2,nativeViews:records.length,labelControls:controls.length,controlViews:controls.reduce((n,c)=>n+c.comparisons.length,0),regions:frame.regions.length},
  scope:'Native-only primary/local calibration and first-glyph missing/displacement sensitivity for each path label. PDF gates and current converter acceptance remain open.'});
}catch(error){await save('failure.log',String(error.stack??error).replaceAll(root,'<repo>'));await publish(false,{error:error.message});process.exitCode=1;}
finally{await renderer?.browser.close();}
