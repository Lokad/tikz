import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Explicit owned report; re-decode saved RGBA and rederive limits/outcomes.
import assert from 'node:assert/strict';
import {readFile,mkdir,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadArrowEvidence} from './arrow-evidence.mjs';
import {buildArrowNativeFrame} from './arrow-native-frame.mjs';
import {arrowMetrics,arrowCanonical} from './arrow-native-contract.mjs';
import {arrowPrimarySources,arrowPrimaryInputs,arrowPrimaryRegions,arrowSensitivity,arrowEvaluation,arrowSensitivitySummary,validateArrowPrimaryReport} from './arrow-primary-contract.mjs';
import {deriveArrowPrimaryPolicy,evaluateArrowPrimary,arrowPrimaryViewKey,arrowPrimaryView} from './arrow-primary-policy.mjs';
import {deriveShapeTrialPolicy,evaluateShapeTrial} from './shape-primary-trial-policy.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {checkArrowNativePanels} from './arrow-native-panels.mjs';
import {arrowVectorDocument} from './arrow-vector-pair.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';
const out=await outputPath(path.join(root,'artifacts/arrow-primary-checks/run-'+randomUUID()));await mkdir(out,{recursive:true});
let phase='arguments',renderer,inputReportSha256,measurements=0,panels=0;const controls=[];
async function publish(r){const b=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(out,'report.json',b);
 console.log(JSON.stringify({kind:'arrow-primary-check',completed:r.completed,phase:r.phase,report:path.relative(root,path.join(out,'report.json')).split(path.sep).join('/'),sha256:sha256(b)}));}
try{
 assert.equal(process.argv.length,3);assert.match(process.argv[2],/^artifacts\/arrow-primary-calibration\/run-[a-f0-9-]+\/report.json$/);
 const input=path.dirname(path.join(root,process.argv[2]));await outputPath(input);assert.ok((await stat(path.join(input,'report.json'))).size<=20000000);
 const bytes=await readFile(path.join(input,'report.json')),r=JSON.parse(bytes);inputReportSha256=sha256(bytes);
 const read=file=>readFile(path.join(input,file)),e=await loadArrowEvidence(),sources=await arrowPrimarySources();
 for(const file of Object.keys(e.snapshot.sourceHashes))if(!sources.has(file)){const bytes=arrowCanonical(await readFile(path.join(root,file)));sources.set(file,{bytes,sha256:sha256(bytes)});}
 assert.deepEqual(r.sourceHashes,Object.fromEntries([...sources].sort(([a],[b])=>a.localeCompare(b)).map(([f,v])=>[f,v.sha256])));
 const integrity=async()=>{for(const[file,v]of sources){assert.equal(sha256(await read('source-captures/'+file)),v.sha256);assert.equal(sha256(arrowCanonical(await readFile(path.join(root,file)))),v.sha256);}
  for(const[file,h]of Object.entries(r.artifacts)){assert.match(file,/^(?!.*(?:^|\/)\.\.\/)[\w./-]+$/);assert.equal(sha256(await read(file)),h);}};await integrity();
 const frames=e.cases.map(c=>buildArrowNativeFrame(c.id,e.artifacts.get(c.id+'/plain-reference.svg').toString(),c.metrics));
 const validate=()=>assert.deepEqual(validateArrowPrimaryReport(r,e,frames),r.coverage);validate();for(const f of frames)assert.deepEqual(JSON.parse(await read(f.caseId+'/frame.json')),f);
 assert.deepEqual(JSON.parse(await read('trial-policy.json')),r.policy);
 renderer=await createRenderer();requireRenderer(renderer.identity, r.renderer);await installShapeMetrics(renderer);
 phase='saved-measurements';const saved=new Map(),baselines=[],visibilityRows=new Map(),visibilityPolicies=new Map(),sensitivity=[];let independentlyDerivedPolicy;
 for(const o of r.observations){const v=o.view,c=e.cases.find(c=>c.id===v.caseId),f=frames.find(f=>f.caseId===v.caseId),inputs=arrowPrimaryInputs(v,c,f,e.artifacts.get(c.id+'/plain-reference.svg').toString()),n=JSON.parse(await read(o.numbers));
  if(v.kind!=='calibration'&&!independentlyDerivedPolicy){independentlyDerivedPolicy=deriveArrowPrimaryPolicy(e.cases.map(c=>({id:c.id,measurements:baselines.filter(o=>o.view.caseId===c.id).map(o=>({...o,...o.view}))})));assert.deepEqual(independentlyDerivedPolicy,r.policy);}
  assert.equal((await read(o.reference)).toString(),inputs.reference);assert.equal((await read(o.actual)).toString(),inputs.actual);
  assert.deepEqual(n.view,v);assert.deepEqual(n.crops,o.crops);assert.equal(n.referenceLabel,inputs.referenceLabel);assert.equal(n.rightLabel,inputs.rightLabel);
  assert.deepEqual([n.converterInvoked,n.approvedImagePolicy,n.imageConformanceClaim],[false,false,false]);assert.equal(n.repeat.rawChangedPixels,0);assert.equal(n.actualRepeat.rawChangedPixels,0);
  const regions=arrowPrimaryRegions(f);assert.deepEqual(n.regions.map(({id,nodeId,kind,rectangle})=>({id,nodeId,kind,rectangle})),regions.map(({id,nodeId,kind,rectangle})=>({id,nodeId,kind,rectangle})));
  const natural=await Promise.all([[inputs.reference,inputs.leftIsDriver,inputs.origin],[inputs.actual,false,{x:0,y:0}]].map(([svg,driver,origin])=>arrowVectorDocument(renderer,{svg,driver,origin,camera:f.camera,frame:v.frame})));
  assert.deepEqual(n.naturalFrames,{reference:natural[0].natural,actual:natural[1].natural});
  const size={width:f.camera.width*v.scale,height:f.camera.height*v.scale},rectangles=[undefined,...regions.map(r=>Object.fromEntries(Object.entries(r.rectangle).map(([k,a])=>[k,a*v.scale])))];
  const decoded=await decodeEdgeOraclePngPair(renderer,await Promise.all([read(o.images.reference),read(o.images.actual)]),size,rectangles,v.scale,v.background);
  assert.deepEqual(decoded.metrics[0],n.metrics);assert.deepEqual(decoded.metrics[0],o.metrics);for(const[i,region]of n.regions.entries())assert.deepEqual(decoded.metrics[i+1],arrowMetrics(region));measurements+=decoded.metrics.length;
  const independent={...n,...v,metrics:decoded.metrics[0],regions:n.regions.map((q,i)=>({...q,...decoded.metrics[i+1]}))};
  if(v.kind==='calibration')baselines.push(independent);
  else if(v.kind==='visibility-calibration'){const rows=visibilityRows.get(v.name)??[];rows.push(independent);visibilityRows.set(v.name,rows);}
  else if(v.kind==='visibility-missing'){
   if(!visibilityPolicies.has(v.name)){const p=deriveShapeTrialPolicy(visibilityRows.get(v.name).map(o=>({...o,...o.metrics})),v.name+'; renderer-only visibility control');visibilityPolicies.set(v.name,p);assert.deepEqual(JSON.parse(await read('visibility/'+v.name+'/policy.json')),p);}
   assert.deepEqual(n.evaluation,arrowEvaluation(evaluateShapeTrial(visibilityPolicies.get(v.name),arrowPrimaryView(v),independent)));
   const baseline=saved.get(v.caseId+'/visibility-calibration/'+v.name+'/'+arrowPrimaryViewKey(v));assert.equal(n.rasterChanged,r.artifacts[baseline.images.actual]!==r.artifacts[o.images.actual]);
  }else{
   const evaluation=evaluateArrowPrimary(independentlyDerivedPolicy,v.caseId,independent);assert.deepEqual(n.evaluation,arrowEvaluation(evaluation));
   if(v.kind==='defect'){const baseline=saved.get(v.caseId+'/calibration/picture/'+arrowPrimaryViewKey(v));
    const check=arrowSensitivity(v,evaluation,r.artifacts[baseline.images.actual],r.artifacts[o.images.actual]);assert.deepEqual(n.sensitivity,check);sensitivity.push({view:v,sensitivity:check});}
  }
  for(const crop of o.crops){const q=regions.find(q=>q.id===crop.id).rectangle;assert.deepEqual(crop.presentation,{background:'white',integerEnlargement:v.scale===1?4:1,rawDifferenceAmplification:16,
   rasterRectangle:Object.fromEntries(Object.entries(q).map(([k,a])=>[k,a*v.scale]))});}
  const images={...o.images};if(inputs.referenceLabel!=='TikZ SVG')delete images.comparison;
  panels+=await checkArrowNativePanels(renderer,{frame:v.frame,scale:v.scale,background:v.background,variant:inputs.rightLabel,images,crops:o.crops},read,f);
  if(inputs.referenceLabel!=='TikZ SVG'&&o.images.comparison){
   const pngs=await Promise.all(['reference','actual','amplified','comparison'].map(async key=>'data:image/png;base64,'+(await read(o.images[key])).toString('base64')));
   await renderer.page.evaluate(async({pngs,leftLabel,rightLabel})=>{const images=[];for(const src of pngs){const i=new Image();i.src=src;await i.decode();images.push(i);}
    const width=images[0].width,height=images[0].height,c=document.createElement('canvas');c.width=3*width;c.height=height+48;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='12px sans-serif';
    [leftLabel,rightLabel,'Raw difference\nAmplified ×16'].forEach((text,i)=>{text.split('\n').forEach((line,j)=>ctx.fillText(line,i*width+4,16+j*16));ctx.drawImage(images[i],i*width,48);});
    if(images[3].width!==c.width||images[3].height!==c.height)throw Error('Controlled panel dimensions changed');const actual=document.createElement('canvas');actual.width=c.width;actual.height=c.height;
    const ac=actual.getContext('2d');ac.drawImage(images[3],0,0);const a=ac.getImageData(0,0,c.width,c.height).data,b=ctx.getImageData(0,0,c.width,c.height).data;
    for(let i=0;i<a.length;i++)if(a[i]!==b[i])throw Error('Controlled comparison pixels or labels changed');
   },{pngs,leftLabel:inputs.referenceLabel,rightLabel:inputs.rightLabel});panels++;
  }
  saved.set(v.id,o);if(v.background==='black'&&v.scale===4&&v.frame==='expanded')console.log('Saved primary checked: '+v.id);
 }
 const summary=arrowSensitivitySummary(sensitivity);assert.deepEqual(r.sensitivity,summary);assert.deepEqual(JSON.parse(await read('sensitivity.json')),{...summary,rows:sensitivity});
 phase='corruption-controls';const changed=(name,obj,key,value)=>{const old=obj[key],had=Object.hasOwn(obj,key);try{if(value===undefined)delete obj[key];else obj[key]=value;assert.throws(validate);controls.push({name,passed:true});}finally{if(had)obj[key]=old;else delete obj[key];}};
 for(const k of['completed','converterInvoked','approvedImagePolicy','imageConformanceClaim'])changed(k,r,k,!r[k]);
 changed('missing view',r,'observations',r.observations.slice(0,-1));changed('duplicate view',r,'observations',[r.observations[0],...r.observations.slice(0,-1)]);
 changed('changed root contract',r.contract,'root','ink');changed('changed camera',r.frames[0].camera,'width',r.frames[0].camera.width+1);
 changed('missing fault crop',r.observations.find(o=>o.view.kind==='defect'),'crops',[]);changed('missing hash',r.artifacts,r.observations[0].images.reference,undefined);
 changed('added unbound artifact',r.artifacts,'extra.png','0'.repeat(64));changed('false coverage',r.coverage,'observations',377);
 changed('viewer traversal',r.agent,'viewer','../index.html');changed('unapproved admission',r.agent,'pendingGates',[]);
 validate();phase='final-integrity';await integrity();await loadArrowEvidence();await publish({schemaVersion:1,completed:true,phase:'complete',comparisonKind:'independent-native-arrow-primary-check',converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
  inputReport:process.argv[2],inputReportSha256,snapshotSha256:e.snapshotSha256,renderer:renderer.identity,measurements,panels,controls,coverage:r.coverage,sensitivity:summary,sourceHashes:r.sourceHashes});
}catch(error){process.exitCode=2;await publish({schemaVersion:1,completed:false,phase,error:error.message.replaceAll(root,'<repo>'),converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,inputReportSha256,measurements,panels,controls});console.error(error.stack);}
finally{await renderer?.browser.close();}
