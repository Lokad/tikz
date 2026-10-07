import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {arrowSourcePdfSources,loadArrowSourcePdfInput,arrowSourcePdfLiveRead,loadArrowSourcePdfOwned,arrowSourcePdfEntry} from './arrow-source-pdf-contract.mjs';
import {arrowSourcePdfPlan,arrowSourcePdfInputs,arrowSourcePdfBaseline,deriveArrowSourcePdfPolicies,buildArrowSourcePdfExperiment,arrowSourcePdfPolicyIndex,arrowSourcePdfVisibilityIndex} from './arrow-source-pdf-model.mjs';
import {arrowSourcePrimaryReference} from './arrow-source-primary-reference.mjs';
import {arrowViewportRegions} from './arrow-viewport-model.mjs';
import {measureShapePdfPair} from './shape-pdf-image-pair.mjs';
import {measureEdgePdfPair} from './edge-pdf-image-pair.mjs';
import {measureArrowPdfInk,attachArrowPdfInk} from './arrow-pdf-ink.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';
import {createRenderer} from './compare.mjs';
import {runArrowSourcePdfControls,runArrowSourcePdfBrowserControls} from './arrow-source-pdf-self-test.mjs';
import {arrowSourcePdfFocus,arrowSourcePdfIndex} from './arrow-source-pdf-panels.mjs';
import {paintArrowFaintFocus} from './arrow-faint-panels.mjs';

const out=await outputPath(path.join(root,'artifacts/arrow-source-pdf-calibration/run-'+randomUUID()));await mkdir(out,{recursive:true});
let renderer,phase='arguments';
async function publish(r){const b=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(out,'report.json',b);console.log(JSON.stringify({kind:'arrow-source-PDF-calibration',completed:r.completed,phase:r.phase,report:path.relative(root,path.join(out,'report.json')).split(path.sep).join('/'),sha256:sha256(b)}));}
try{
 const args=process.argv.slice(2);let input;
 if(args[0]==='--replay'){assert.equal(args.length,2);input=(await loadArrowSourcePdfOwned(args[1])).input;}
 else{assert.equal(args.length,2);input=await loadArrowSourcePdfInput(...args,await arrowSourcePdfLiveRead(...args));}
 const sources=await arrowSourcePdfSources(),artifacts={},records=[],bases=new Map(),visibilityPolicies=new Map();let primaryPolicies;
 const save=async(f,b)=>{const bytes=Buffer.isBuffer(b)?b:Buffer.from(b);assert.ok(bytes.length<30000000,'Oversized source-PDF artifact: '+f);await writeArtifact(out,f,bytes,artifacts);};
 const json=(f,v)=>save(f,JSON.stringify(v)+'\n'),read=f=>readFile(path.join(out,f));
 for(const [f,b]of input.files)await save('upstream/'+f,b);for(const [f,s]of sources)await save('source-captures/'+f,s.bytes);
 renderer=await createRenderer();assert.deepEqual(renderer.identity,input.report.renderer);await installShapeMetrics(renderer);
 await json('controls.json',[...await runArrowSourcePdfControls(),...await runArrowSourcePdfBrowserControls(renderer)]);
 for(const c of input.evidence.cases){
  const f=input.frames.find(f=>f.caseId===c.id),base=await arrowSourcePrimaryReference(renderer,c.metrics,f,input.evidence.artifacts.get(c.id+'/plain-reference.svg').toString());bases.set(c.id,base);
  const framing={envelope:base.envelope,originalFrame:base.originalFrame,referenceProof:base.referenceProof,actualProof:base.actualProof};
  assert.deepEqual(framing,JSON.parse(input.files.get('primary/cases/'+c.id+'/framing.json')));
  await json('cases/'+c.id+'/framing.json',framing);await json('cases/'+c.id+'/paper.json',f.paper);
  for(const scale of [1,4])await save('reference/'+c.id+'/pdf-page-'+scale+'x.png',input.evidence.artifacts.get(c.id+'/plain-pdf-page-'+scale+'x.png'));
 }
 for(const v of arrowSourcePdfPlan()){
  if(v.kind!=='calibration'&&!primaryPolicies){
   primaryPolicies=deriveArrowSourcePdfPolicies(records,input.frames).policies;const index=arrowSourcePdfPolicyIndex(primaryPolicies);
   for(const [i,p]of primaryPolicies.entries())await json(index[i].file,p);await json('baseline-policies.json',index);
  }
  if(v.kind==='visibility-missing'){
   const key=v.name+'/'+v.raster;if(!visibilityPolicies.has(key)){const p=deriveArrowSourcePdfPolicies(records,input.frames).visibility.find(p=>p.name===v.name&&p.raster===v.raster);assert.ok(p);visibilityPolicies.set(key,p);await json('visibility/'+key+'/policy.json',p);}
  }
  phase=v.id;const f=input.frames.find(f=>f.caseId===v.caseId),physical=await arrowSourcePdfInputs(renderer,v,f,bases.get(v.caseId)),folder='views/'+v.id;
  const pdfFile='reference/'+v.caseId+'/pdf-page-'+v.scale+'x.png',pdfBytes=await read(pdfFile),measure=v.raster==='relative-viewport'?measureShapePdfPair:measureEdgePdfPair;
  const record={view:v,sourceFrame:physical.sourceFrame,normalization:physical.normalization,extra:physical.extra,files:{pdf:pdfFile},sourceDelta:null,sceneDelta:null};
  for(const type of ['source','scene']){
   const svg=type==='source'?physical.svg:physical.scene,regions=type==='source'?f.paper.regions:arrowViewportRegions(f);
   const svgFile=folder+'/'+type+'.svg';await save(svgFile,svg);
   const raw=await measure(renderer,{...physical,svg,camera:f.paper.camera,regions,scale:v.scale,frame:v.frame,pdfPage:'data:image/png;base64,'+pdfBytes.toString('base64'),cropLimit:0,rightLabel:physical.rightLabel+(type==='scene'?' scene':'')});
   for(const repeat of Object.values(raw.repeat))assert.deepEqual(repeat,{exactRgbaMatch:true,rawChangedPixels:0,maxRawChannelError:0});
   const png=Buffer.from(raw.images['svg-page'],'base64'),{images,crops,...values}=raw;assert.equal(crops.length,0);
   const row=attachArrowPdfInk({...values,view:v,mode:v.caseId+'/'+v.route,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
    ...(type==='scene'?{outsideDiagramChangedPixels:raw.fullPage.rawChangedPixels-raw.regions[0].rawChangedPixels}:{}),rightLabel:physical.rightLabel+(type==='scene'?' scene':'')},await measureArrowPdfInk(renderer,[pdfBytes,png],raw.pageSize,regions,v.scale));
   record[type]=row;const files={svg:svgFile,numbers:folder+'/'+type+'-numbers.json',images:{}};
   for(const [name,b64]of Object.entries(images)){files.images[name]=folder+'/'+type+'-'+name+'.png';await save(files.images[name],Buffer.from(b64,'base64'));}
   await json(files.numbers,row);record.files[type]=files;
   if(!['calibration','visibility-calibration'].includes(v.kind)){
    const baseline=arrowSourcePdfBaseline(records,v);assert.ok(baseline);
    record[type+'Delta']=(await decodeEdgeOraclePngPair(renderer,[await read(baseline.files[type].images['svg-page']),png],row.pageSize,[{x:0,y:0,...row.pageSize}],v.scale,'white')).metrics[0];
   }
  }
  await json(folder+'/record.json',{view:v,sourceFrame:record.sourceFrame,normalization:record.normalization,extra:record.extra,files:record.files,sourceDelta:record.sourceDelta,sceneDelta:record.sceneDelta});records.push(record);
  if(v.frame==='expanded'&&v.scale===4)console.log('Native source PDF rendered: '+v.id);
 }
 phase='coupled-gates';const model=buildArrowSourcePdfExperiment(records,input.frames);assert.deepEqual(model.policies,primaryPolicies);assert.deepEqual(model.visibility,[...visibilityPolicies.values()]);
 for(const e of model.evaluations)await json('views/'+e.view.id+'/gates.json',e);
 await json('policies.json',{policies:arrowSourcePdfPolicyIndex(model.policies),visibility:arrowSourcePdfVisibilityIndex(model.visibility)});await json('summary.json',{summary:model.summary,eligibility:model.eligibility});
 const focus=arrowSourcePdfFocus(model,records,input.frames);for(const p of focus){const panels=await paintArrowFaintFocus(renderer,p,read);for(const [k,b64]of Object.entries(panels))await save(p.images[k],Buffer.from(b64,'base64'));}
 await json('focus.json',focus);await save('index.html',arrowSourcePdfIndex(model,focus));
 const mb=Buffer.from(JSON.stringify({schemaVersion:1,artifacts},null,2)+'\n');await writeArtifact(out,'manifest.json',mb);assert.deepEqual(await arrowSourcePdfSources(),sources);
 const report=arrowSourcePdfEntry(input,sources,model,{file:'manifest.json',sha256:sha256(mb),files:Object.keys(artifacts).length});assert.ok(Buffer.byteLength(JSON.stringify(report,null,2))<32000);await publish(report);
}catch(error){process.exitCode=2;await publish({schemaVersion:1,completed:false,phase,error:error.message.replaceAll(root,'<repo>'),converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false});console.error(error.stack);}finally{await renderer?.browser.close();}
