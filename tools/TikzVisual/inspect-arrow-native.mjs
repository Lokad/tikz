// Owned native-only research. Image differences are observations, never limits.
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadArrowEvidence} from './arrow-evidence.mjs';
import {buildArrowNativeFrame,checkArrowBrowserBoxes} from './arrow-native-frame.mjs';
import {makeArrowNativeSvg,arrowNativeRepresentations,arrowNativeRoots} from './arrow-native-svg.mjs';
import {arrowPrimaryPlan,arrowPdfPlan,arrowPdfRegions,arrowNativeSourceClosure,arrowCanonical,validateArrowNativeCoverage,makeArrowNativeAgent} from './arrow-native-contract.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {measureShapePdfPair} from './shape-pdf-image-pair.mjs';

assert.equal(process.argv.length,2,'Usage: node tools/TikzVisual/inspect-arrow-native.mjs');
const output=await outputPath(path.join(root,'artifacts/arrow-native-inspection/run-'+randomUUID()));await mkdir(output,{recursive:true});
const artifacts={},sourceHashes={},frames=[],browserChecks=[],derivations=[],observations=[],pdfObservations=[];
const save=(file,bytes)=>writeArtifact(output,file,bytes,artifacts),json=(file,value)=>save(file,JSON.stringify(value,null,2)+'\n');
let phase='source-capture',renderer,evidence;
const relative=file=>path.relative(root,file).split(path.sep).join('/');
async function publish(report){const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',bytes);
 console.log(JSON.stringify({kind:'arrow-native-inspection',completed:report.completed,phase:report.phase,report:relative(path.join(output,'report.json')),sha256:sha256(bytes)}));}
async function images(prefix,values){const links={};for(const[key,value]of Object.entries(values)){links[key]=prefix+'-'+key+'.png';await save(links[key],Buffer.from(value,'base64'));}return links;}
function gallery(){
 return'<!doctype html><html lang="en"><meta charset="utf-8"><title>Native TikZ arrow grounding</title><style>body{font:16px sans-serif;margin:24px}img{max-width:100%;image-rendering:pixelated}section{border-top:1px solid #ccc;padding:16px 0}</style>'+
 '<h1>Native arrow reconstruction</h1><p>No converter invoked. Raw observations on frozen SVG and ordinary PDF. Image calibration and admission are pending.</p><p><a href="report.json">Complete report</a></p>'+
 observations.filter(o=>o.variant==='pt-short'&&o.rootMode==='ink'&&o.scale===1&&o.background==='white').map(o=>
  '<section><h2>'+o.caseId+' · '+o.frame+'</h2><img src="'+o.images.comparison+'" alt="Original TikZ SVG | reconstructed native SVG | difference amplified x16">'+
  '<p>'+o.metrics.rawChangedPixels+' changed pixels, maximum '+o.metrics.maxRawChannelError+'/255. <a href="'+o.caseId+'/frame.json">Native bounds and regions</a> · <a href="source-captures/tests/Reference/Arrows/'+o.caseId+'/source.tikz">TikZ source</a></p>'+
  o.crops.map(c=>'<details><summary>'+c.id+'</summary><img src="'+c.images.sheet+'" alt="Paired native tip region"></details>').join('')+'</section>').join('')+
 '<h1>Ordinary native PDF</h1>'+pdfObservations.filter(o=>o.scale===1&&o.frame==='expanded'&&['original-driver','pt-short'].includes(o.route)).map(o=>
  '<section><h2>'+o.caseId+' · '+o.route+'</h2><img src="'+o.images.sheet+'" alt="Ordinary PDF | original or reconstructed SVG | difference amplified x16">'+
  '<p>'+o.whole.rawChangedPixels+' changed pixels, maximum '+o.whole.maxRawChannelError+'/255.</p></section>').join('')+'</html>\n';
}
try{
 await publish({schemaVersion:1,completed:false,phase,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false});
 const sources=await arrowNativeSourceClosure();evidence=await loadArrowEvidence();
 for(const file of Object.keys(evidence.snapshot.sourceHashes))if(!sources.has(file)){const bytes=arrowCanonical(await readFile(path.join(root,file)));sources.set(file,{bytes,sha256:sha256(bytes)});}
 for(const[file,value]of [...sources].sort(([a],[b])=>a.localeCompare(b))){sourceHashes[file]=value.sha256;await save('source-captures/'+file,value.bytes);}
 await save('reference/snapshot.json',await readFile(path.join(root,'tests/Reference/Arrows/snapshot.json')));
 for(const[file,bytes]of evidence.artifacts)await save('reference/'+file,bytes);
 phase='native-frame';
 for(const c of evidence.cases){const reference=evidence.artifacts.get(c.id+'/plain-reference.svg').toString('utf8');
  const frame=buildArrowNativeFrame(c.id,reference,c.metrics);frames.push(frame);await json(c.id+'/frame.json',frame);
  for(const variant of arrowNativeRepresentations)for(const rootMode of arrowNativeRoots){
   const result=makeArrowNativeSvg(c.metrics,frame,variant,rootMode),prefix=c.id+'/'+variant.name+'/'+rootMode;
   await save(prefix+'/native.svg',result.svg);await json(prefix+'/instructions.json',result.instructions);
   derivations.push({id:prefix,caseId:c.id,variant:variant.name,rootMode,svg:prefix+'/native.svg',instructions:prefix+'/instructions.json',serializationChecks:result.instructions.checks.length});
  }
 }
 phase='renderer';renderer=await createRenderer();await installShapeMetrics(renderer);
 for(const frame of frames){const checks=await checkArrowBrowserBoxes(renderer,frame);browserChecks.push({caseId:frame.caseId,checks});await json(frame.caseId+'/browser-boxes.json',checks);}
 phase='primary';
 for(const view of arrowPrimaryPlan(evidence.cases.map(c=>c.id))){
  const frame=frames.find(f=>f.caseId===view.caseId),reference=evidence.artifacts.get(view.caseId+'/plain-reference.svg').toString('utf8');
  const actual=(await readFile(path.join(output,view.caseId+'/'+view.variant+'/'+view.rootMode+'/native.svg'))).toString('utf8');
  const tipIds=frame.records.filter(r=>r.role==='tip').map(r=>r.id);
  const eligible=view.variant==='pt-short'&&view.rootMode==='ink'&&view.frame==='expanded'&&view.background==='white';
  const pair=await measureEdgeTrialPrimary(renderer,{reference,actual,leftIsDriver:true,origin:frame.origin,camera:frame.camera,frame:view.frame,scale:view.scale,background:view.background,
   regions:[{id:'whole-picture',rectangle:{x:0,y:0,width:frame.camera.width,height:frame.camera.height}},...frame.regions],
   cropLimit:eligible?tipIds.length:0,cropRegionIds:tipIds,referenceLabel:'TikZ SVG',rightLabel:view.variant});
  assert.equal(pair.repeat.rawChangedPixels,0);assert.equal(pair.actualRepeat.rawChangedPixels,0);
  const links=await images(view.id,pair.images),crops=[];
  for(const crop of pair.crops)crops.push({id:crop.id,images:await images(view.id+'/crops/'+crop.id,{...crop.paired,sheet:crop.sheet}),presentation:crop.presentation});
  observations.push({...view,metrics:pair.metrics,regions:pair.regions,repeat:pair.repeat,actualRepeat:pair.actualRepeat,naturalFrames:pair.naturalFrames,images:links,crops});
  if(view.background==='black'&&view.frame==='expanded'&&view.scale===4)console.log('Primary native arrow: '+view.caseId+'/'+view.variant+'/'+view.rootMode);
 }
 phase='pdf';
 for(const view of arrowPdfPlan(evidence.cases.map(c=>c.id))){
  const native=evidence.cases.find(c=>c.id===view.caseId),frame=frames.find(f=>f.caseId===view.caseId),{camera,regions}=arrowPdfRegions(native.metrics,frame);
  const svg=view.route==='original-driver'?evidence.artifacts.get(view.caseId+'/plain-reference.svg').toString('utf8'):
   (await readFile(path.join(output,view.caseId+'/'+view.route+'/ink/native.svg'))).toString('utf8');
  const pdfPage='reference/'+view.caseId+'/plain-pdf-page-'+view.scale+'x.png';
  const result=await measureShapePdfPair(renderer,{svg,pdfPage:'data:image/png;base64,'+evidence.artifacts.get(view.caseId+'/plain-pdf-page-'+view.scale+'x.png').toString('base64'),
   camera,regions,scale:view.scale,frame:view.frame,units:view.route==='original-driver'?'bp':'cssPixels',
   svgOriginBp:view.route==='original-driver'?frame.origin:{x:0,y:0},capture:true,cropLimit:0,rightLabel:view.route==='original-driver'?'Original TikZ SVG':'Native '+view.route});
  assert.equal(result.repeat.pdf.rawChangedPixels,0);assert.equal(result.repeat.svg.rawChangedPixels,0);
  const {images:rawImages,crops,...numbers}=result;assert.equal(crops.length,0);
  pdfObservations.push({...numbers,...view,camera,pdfPage,images:await images(view.id,rawImages),crops:[]});
  if(view.scale===4&&view.frame==='expanded')console.log('PDF native arrow: '+view.caseId+'/'+view.route);
 }
 phase='coverage';await save('index.html',gallery());
 const report={schemaVersion:1,completed:true,phase:'complete',comparisonKind:'native-only-arrow-framing-and-reconstruction',converterInvoked:false,approvedImagePolicy:false,
  imageConformanceClaim:false,overallVerdict:'pending-image-calibration',snapshotSha256:evidence.snapshotSha256,renderer:renderer.identity,sourceHashes,
  frames,browserChecks,derivations,observations,pdfObservations,agent:makeArrowNativeAgent(observations,frames),artifacts};
 report.coverage=validateArrowNativeCoverage(report,evidence,frames);
 for(const[file,value]of sources)assert.equal(sha256(arrowCanonical(await readFile(path.join(root,file)))),value.sha256,'Source changed during native run: '+file);
 await loadArrowEvidence();phase='complete';await publish(report);
}catch(error){process.exitCode=2;await publish({schemaVersion:1,completed:false,phase,error:error.message.replaceAll(root,'<repo>'),converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
 sourceHashes,frames,browserChecks,derivations,observations,pdfObservations,artifacts});console.error(error.stack);}
finally{await renderer?.browser.close();}
