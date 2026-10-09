// Independent saved-pixel checks and source recapture; no converter invocation.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {root,writeArtifact,sha256} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport,calcEqual} from './calc-saved-images.mjs';
import {decodeCalcPng} from './calc-png.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {createRenderer} from './compare.mjs';
import {loadLabelImageEvidence} from './diagram-image-evidence.mjs';
import {buildPathLabelImageReference,pathLabelPrimaryCaptures,pathLabelImageEncodings,pathLabelDiagramImageEncodings,mutatePathLabelImage,pathLabelImageControls,pathLabelControlViews} from './path-label-image-reference.mjs';
import {shapeViews,deriveShapeTrialPolicy,evaluateShapeTrial} from './shape-primary-trial-policy.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {measureArrowVectorPair} from './arrow-vector-pair.mjs';
import {runCalcChild,readCalcChild} from './calc-admission-child.mjs';
import {readPathLabelPrimaryPolicies} from './path-label-primary-policy.mjs';

const key=v=>v.frame+'/'+v.scale+'x-'+v.background;
export function verifyPathLabelPrimaryPixels(bundle){
 const r=bundle.report;assert.equal(r.converterInvoked,false);assert.equal(r.nativeToolInvoked,false);
 const frame=bundle.json('frame.json'),compare=createShapeRasterMetrics().compare;
 const encodings=frame.nativePathEncoding?pathLabelDiagramImageEncodings:pathLabelImageEncodings;
 if(frame.nativePathEncoding)assert.ok(frame.regions.some(r=>r.role==='tip'));
 calcEqual(frame.encodings.map(e=>e.id),encodings,'Native representation coverage differs.');
 const expected=encodings.flatMap(encoding=>pathLabelPrimaryCaptures.flatMap(capture=>shapeViews.map(v=>'encodings/'+encoding+'/'+capture+'/'+key(v)+'/record.json')));
 calcEqual(r.records.map(r=>r.file).sort(),expected.sort(),'Native encoding/view coverage differs.');
 assert.equal(r.records.length,encodings.length*24);
 const decoded=new Map();let comparisons=0,regions=0;
 function png(file,cache=false){const bytes=bundle.files.get(file);assert.ok(bytes,'Missing paired image.');const digest=sha256(bytes);
  if(!cache)return decodeCalcPng(bytes);if(!decoded.has(digest))decoded.set(digest,decodeCalcPng(bytes));return decoded.get(digest);}
 function row(file){const row=bundle.json(file),a=png(row.images.reference,true),b=png(row.images.actual);
  assert.equal(a.width,frame.camera.width*row.scale);assert.equal(a.height,frame.camera.height*row.scale);
  assert.equal(a.width,b.width);assert.equal(a.height,b.height);
  const options={width:a.width,height:a.height,scale:row.scale,background:row.background,maskThreshold:16};
  calcEqual(compare(a.rgba,b.rgba,options),row.metrics,'Decoded whole metrics differ: '+file);
  calcEqual(row.regions.map(({id,rectangle})=>({id,rectangle})),frame.regions.map(({id,rectangle})=>({id,rectangle})),'Region coverage differs.');
  for(const region of row.regions){const rectangle=Object.fromEntries(Object.entries(region.rectangle).map(([k,v])=>[k,v*row.scale]));
   const actual=compare(a.rgba,b.rgba,{...options,rectangle});calcEqual(actual,Object.fromEntries(Object.keys(actual).map(k=>[k,region[k]])),'Decoded local metrics differ: '+file+'/'+region.id);regions++;}
  assert.equal(row.repeat.rawChangedPixels,0);assert.equal(row.actualRepeat.rawChangedPixels,0);comparisons++;return row;
 }
 const nativeRows=r.records.map(record=>{const result=row(record.file);calcEqual(result.metrics,record.metrics,'Native summary differs.');return{...result,encoding:record.encoding,file:record.file};});
 const policies=readPathLabelPrimaryPolicies(bundle);
 for(const capture of pathLabelPrimaryCaptures){const aggregate=shapeViews.map(view=>{
  const rows=nativeRows.filter(v=>v.capture===capture&&key(v)===key(view)),base=rows[0];assert.equal(rows.length,encodings.length);
  function maxima(items,local=false){const value=structuredClone(items[0]);for(const item of items){if(!local||!frame.regions.some(r=>r.role==='tip'))assert.equal(item.topology.componentDifference,0);
   for(const k of['rawChangedPixels','maxRawChannelError','premultipliedChangedPixels','maxPremultipliedChannelError','meanForegroundChannelError'])value[k]=Math.max(value[k],item[k]);
   value.topology.maxEdgeDisplacementRasterPixels=Math.max(value.topology.maxEdgeDisplacementRasterPixels,item.topology.maxEdgeDisplacementRasterPixels);
   value.topology.componentDifference=Math.max(value.topology.componentDifference,item.topology.componentDifference);}return value;}
  return{...base,...maxima(rows.map(r=>r.metrics)),regions:base.regions.map((region,i)=>({...region,...maxima(rows.map(r=>r.regions[i]),true)}))};
 });
  calcEqual(deriveShapeTrialPolicy(aggregate,'Fixed trusted path-label '+r.fixture+' native-only decimal encodings; '+capture,shapeViews,frame.regions.some(r=>r.role==='tip')),policies[capture],'Native-only policy derivation differs.');
 }
 const labels=pathLabelImageControls(frame,bundle.json('oracle/native-glyphs.json')),controlViews=pathLabelControlViews(frame)??shapeViews;
 calcEqual(r.controls.map(({comparisons,numericChecksBypassed,...control})=>control),labels,'Image sensitivity coverage differs.');
 let visible=0,invisible=0;
 for(const control of r.controls){assert.equal(control.numericChecksBypassed,true);
  calcEqual(control.comparisons.map(c=>c.capture+'/'+key(c)).sort(),pathLabelPrimaryCaptures.flatMap(capture=>controlViews.map(v=>capture+'/'+key(v))).sort(),'Control views differ.');
  for(const record of control.comparisons){const result=row(record.file),view={frame:record.frame,scale:record.scale,background:record.background},evaluation=evaluateShapeTrial(policies[record.capture],view,result);
   calcEqual(evaluation,result.evaluation,'Control verdict differs.');
   const baseline=nativeRows.find(r=>r.encoding===pathLabelImageEncodings[0]&&r.capture===record.capture&&key(r)===key(record));
   const differs=sha256(bundle.files.get(result.images.actual))!==sha256(bundle.files.get(baseline.images.actual));
   assert.equal(record.observedVisible,differs);assert.equal(result.observedVisible,differs);assert.equal(record.rejected,!evaluation.passed);
   if(differs){assert.equal(evaluation.passed,false);assert.ok(evaluation.checks.some(c=>c.id===control.target&&!c.passed));visible++;}
   else{calcEqual(result.metrics,baseline.metrics,'Invisible control changed observations.');invisible++;}
  }
 }
 calcEqual(r.coverage,{encodings:encodings.length,captures:2,nativeViews:encodings.length*24,labelControls:r.controls.length,controlViews:r.controls.length*pathLabelPrimaryCaptures.length*controlViews.length,regions:frame.regions.length},'Coverage summary differs.');
 return{comparisons,regions,visibleControls:visible,invisibleControls:invisible};
}

export async function checkPathLabelPrimary(file,save=async()=>{}){
 const bundle=await loadCalcSavedReport(file,'path-label-native-primary-calibration');
 const pixels=verifyPathLabelPrimaryPixels(bundle),native=await loadLabelImageEvidence(['placement','interactions'].includes(bundle.report.fixture)?bundle.report.fixture:path.relative(root,path.join(path.dirname(file),'native/report.json')));
 assert.equal(native.sha256,bundle.report.nativeInputSha256);assert.ok(bundle.files.get('native/report.json').equals(native.bytes));
 for(const file of Object.keys(native.report.artifacts))assert.ok(bundle.files.get('native/'+file).equals(native.files.get(file)),'Changed owned native input.');
 // Producer script captures remain immutable provenance. Current readers below
 // must reconstruct the same frame, policy, controlled SVGs and every PNG.
 // Renderer/profile/package inputs remain pinned before that replay.
 for(const [file,bytes]of bundle.files)if(file.startsWith('source-captures/')&&!file.endsWith('.mjs'))assert.ok(bytes.equals(await readFile(path.join(root,file.slice('source-captures/'.length)))),'Current calibration dependency changed: '+file);
 const oracle=bundle.json('oracle/report.json');assert.equal(oracle.converterInvoked,false);assert.equal(oracle.nativeInputSha256,native.sha256);
 assert.ok(oracle.assemblyReferences.every(n=>n==='System'||n.startsWith('System.')));
 for(const [file,bytes]of bundle.files)if(file.startsWith('oracle/source-captures/')&&!file.endsWith('.cs'))assert.ok(bytes.equals(await readFile(path.join(root,file.slice('oracle/source-captures/'.length)))),'Native reader environment changed.');
 const freshHandle=await runCalcChild(root,'dotnet',['run','--project','tools/TikzPathLabelOracle','-c','Release','--',
  path.relative(root,path.join(path.dirname(file),'native/report.json'))],'native-reparse',save);
 const fresh=await readCalcChild(root,freshHandle,'path-label-native-glyph-oracle');
 assert.equal(fresh.report.converterInvoked,false);assert.equal(fresh.report.nativeInputSha256,native.sha256);
 assert.ok(fresh.files.get('native-glyphs.json').equals(bundle.files.get('oracle/native-glyphs.json')),'Fresh independent DVI/TFM glyph evidence differs.');
 const renderer=await createRenderer();let recaptured=0;
 try{
  calcEqual(renderer.identity,bundle.report.renderer,'Renderer identity differs.');
  await renderer.page.evaluate('globalThis.shapeRasterMetrics=('+createShapeRasterMetrics.toString()+')()');
  const frame=await buildPathLabelImageReference(renderer,native,bundle.json('oracle/native-glyphs.json'),!!bundle.json('frame.json').nativePathEncoding);
  calcEqual({...frame,encodings:frame.encodings.map(({svg,...e})=>e)},bundle.json('frame.json'),'Native frame reconstruction differs.');
  for(const encoding of frame.encodings)assert.equal(encoding.svg,bundle.files.get('encodings/'+encoding.id+'.svg').toString('utf8'));
  async function recapture(record,svg){const row=bundle.json(record.file),measure=row.capture==='intrinsic-image'?measureEdgeTrialPrimary:measureArrowVectorPair;
   const pair=await measure(renderer,{reference:native.files.get('probed-reference.svg').toString('utf8'),actual:svg,leftIsDriver:true,
    origin:frame.origin,camera:frame.camera,regions:frame.regions,...row,cropLimit:0});
   calcEqual(pair.metrics,row.metrics,'Source recapture metrics differ.');
   for(const name of['reference','actual'])assert.ok(Buffer.from(pair.images[name],'base64').equals(bundle.files.get(row.images[name])),'Source recapture PNG differs: '+record.file+'/'+name);
   recaptured++;
  }
  for(const record of bundle.report.records)await recapture(record,frame.encodings.find(e=>e.id===record.encoding).svg);
  for(const control of bundle.report.controls){const svg=await mutatePathLabelImage(renderer,frame.encodings[0].svg,control);
   assert.equal(svg,bundle.files.get('controls/'+control.nodeId+'/'+control.kind+'/altered.svg').toString('utf8'),'Controlled SVG differs.');
   for(const record of control.comparisons)await recapture(record,svg);
   console.log(JSON.stringify({phase:'source-recapture',node:control.nodeId,kind:control.kind,views:control.comparisons.length}));
  }
 }finally{await renderer.browser.close();}
 return{bundle,pixels,recaptured};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,3,'Usage: node tools/TikzVisual/check-path-label-primary.mjs <exact-calibration-report>');
 const output=path.join(root,'artifacts/path-label-primary-check/run-'+randomUUID()),artifacts={},save=(p,b)=>writeArtifact(output,p,b,artifacts);
 async function publish(completed,extra={}){const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'path-label-independent-primary-check',completed,
  phase:completed?'complete':'checking',converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',artifacts,...extra},null,2)+'\n');
  await writeArtifact(output,'report.json',bytes);console.log(JSON.stringify({completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));}
 await publish(false);
 try{const checked=await checkPathLabelPrimary(path.resolve(root,process.argv[2]),save);await save('input-report.json',checked.bundle.bytes);
  await save('source-captures/tools/TikzVisual/check-path-label-primary.mjs',await readFile(fileURLToPath(import.meta.url)));
  await publish(true,{inputSha256:checked.bundle.sha256,pixels:checked.pixels,sourceRecaptures:checked.recaptured});
 }catch(error){await save('failure.log',String(error.stack??error).replaceAll(root,'<repo>'));await publish(false,{error:error.message});process.exitCode=1;}
}
