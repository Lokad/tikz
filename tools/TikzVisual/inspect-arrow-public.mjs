// Fixed native/candidate inspection. No image policy is selected or admitted.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact,outputPath} from './shape-oracle-bundle.mjs';
import {loadArrowEvidence} from './arrow-evidence.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';

assert.equal(process.argv.length,2,'Usage: node tools/TikzVisual/inspect-arrow-public.mjs');
const output=await outputPath(path.join(root,'artifacts/arrow-public-inspection/run-'+randomUUID()));
await mkdir(output,{recursive:true});
const artifacts={},observations=[],rankedRegions=[],sourceHashes={};let phase='frozen-evidence',renderer;
const save=(file,bytes)=>writeArtifact(output,file,bytes,artifacts);
const write=(file,value)=>save(file,JSON.stringify(value,null,2)+'\n');
const read=file=>readFile(path.join(output,file));
const relative=file=>path.relative(root,file).split(path.sep).join('/');
async function images(prefix,values){
 const links={};for(const [key,value]of Object.entries(values)){links[key]=prefix+'-'+key+'.png';await save(links[key],Buffer.from(value,'base64'));}
 return links;
}
function cameraAndRegions(metrics){
 const f=96/(72.27*65536),b=metrics.pictureBounds;
 const camera={x:Math.floor(b.minXSp*f)-16,y:Math.floor(-b.maxYSp*f)-16};
 camera.width=Math.ceil(b.maxXSp*f)-camera.x+16;camera.height=Math.ceil(-b.minYSp*f)-camera.y+16;
 const regions=[{id:'whole-picture',rectangle:{x:0,y:0,width:camera.width,height:camera.height},attribution:null}];
 for(const placement of metrics.placements){
  const paint=metrics.driverState.paints.find(p=>p.placementId===placement.id);
  assert.ok(paint);const local=metrics.paths.find(p=>p.id===paint.pathId);assert.ok(local);
  const m=placement.matrix,points=local.segments.map(p=>({
   x:(m[0]*p.xSp+m[2]*p.ySp+placement.xSp)*f,
   y:-(m[1]*p.xSp+m[3]*p.ySp+placement.ySp)*f
  }));
  const radius=paint.widthSp*f/2*(paint.join===0?paint.miter:Math.SQRT2)+2;
  const left=Math.max(0,Math.floor(Math.min(...points.map(p=>p.x))-radius-camera.x));
  const top=Math.max(0,Math.floor(Math.min(...points.map(p=>p.y))-radius-camera.y));
  const right=Math.min(camera.width,Math.ceil(Math.max(...points.map(p=>p.x))+radius-camera.x));
  const bottom=Math.min(camera.height,Math.ceil(Math.max(...points.map(p=>p.y))+radius-camera.y));
  assert.ok(right>left&&bottom>top,'A native tip has no inspection rectangle.');
  regions.push({id:'tip-'+placement.id,rectangle:{x:left,y:top,width:right-left,height:bottom-top},
   nativePlacementId:placement.id,nativePaintOrdinal:paint.ordinal,side:placement.side,templateId:placement.templateId});
 }
 return{camera,regions};
}
function gallery(){
 return '<!doctype html><html lang="en"><meta charset="utf-8"><title>Public TikZ arrow inspection</title>'+
 '<style>body{font:16px sans-serif;margin:24px}img{max-width:100%;image-rendering:pixelated}section{border-top:1px solid #ccc;padding:16px 0}</style>'+
 '<h1>Native TikZ and public arrow output</h1><p>Numeric comparison passed. These are raw inspection observations; independent primary/PDF calibration and image admission remain pending.</p>'+
 '<p><a href="report.json">Complete report</a> · <a href="numeric/report.json">Owned public numeric report</a></p>'+
 observations.filter(o=>o.scale===1&&o.background==='white').map(o=>'<section><h2>'+o.caseId+' · '+o.frame+
 '</h2><img src="'+o.images.comparison+'" alt="Original native SVG | public candidate | amplified difference">'+
 '<p>'+o.metrics.rawChangedPixels+' changed RGBA pixels; maximum '+o.metrics.maxRawChannelError+'/255.</p>'+
 o.crops.map(c=>'<details><summary>'+c.id+'</summary><img src="'+c.images.sheet+'" alt="Paired fixed native region"></details>').join('')+'</section>').join('')+'</html>';
}
try{
 const evidence=await loadArrowEvidence();
 for(const file of ['tools/TikzVisual/inspect-arrow-public.mjs','tools/TikzVisual/compare.mjs',
  'tools/TikzVisual/browser-profile.json','tools/TikzVisual/text-profile.json','tools/TikzVisual/node-profile.json',
  'tools/TikzVisual/shape-image-pair.mjs','tools/TikzVisual/shape-raster-metrics.mjs',
  'tools/TikzVisual/edge-oracle-pair.mjs','tools/TikzVisual/edge-trial-images.mjs',
  'tools/TikzVisual/shape-oracle-bundle.mjs','tools/TikzVisual/package.json','tools/TikzVisual/package-lock.json']){
  const bytes=await readFile(path.join(root,file));sourceHashes[file]=sha256(bytes);await save('source-captures/'+file,bytes);
 }
 phase='public-numeric';let command;
 try{command=await promisify(execFile)('dotnet',['run','--project','tools/TikzArrowComparison','-c','Release','--','--out',relative(path.join(output,'numeric'))],
  {cwd:root,windowsHide:true,timeout:180000,maxBuffer:1000000});}
 catch(error){await save('numeric-command.log',String(error.stdout??'')+String(error.stderr??'').replaceAll(root,'<repo>'));throw error;}
 await save('numeric-command.log',(command.stdout+command.stderr).replaceAll(root,'<repo>'));
 const numericBytes=await read('numeric/report.json'),numeric=JSON.parse(numericBytes);
 assert.equal(numeric.completed,true);assert.equal(numeric.passed,true);assert.equal(numeric.snapshotSha256,evidence.snapshotSha256);
 assert.equal(numeric.approvedImagePolicy,false);assert.equal(numeric.imageConformanceClaim,false);
 artifacts['numeric/report.json']=sha256(numericBytes);
 for(const [file,hash]of Object.entries(numeric.artifacts)){
  assert.ok(!path.isAbsolute(file)&&!file.includes('\\')&&!file.includes(':')&&!file.split('/').includes('..'));
  assert.equal(sha256(await read('numeric/'+file)),hash);artifacts['numeric/'+file]=hash;
 }
 phase='renderer';renderer=await createRenderer();await installShapeMetrics(renderer);
 for(const native of evidence.cases){
  phase='images/'+native.id;console.log('Arrow inspection: '+native.id);
  const {camera,regions}=cameraAndRegions(native.metrics);
  const scene=JSON.parse(await read('numeric/'+native.id+'/scene.json'));
  for(const region of regions.filter(r=>r.nativePlacementId)){
   const paint=scene.paths[region.nativePaintOrdinal-1];assert.equal(paint.role,'tip');
   region.attribution={confidence:'direct-native-placement-and-public-trace',source:paint.source,shaftSource:paint.arrow.shaftSource,
    publicPaintOrdinal:paint.ordinal,svgElementId:'candidate-p'+(paint.ordinal-1)};
  }
  const original=evidence.artifacts.get(native.id+'/plain-reference.svg').toString('utf8');
  const actual=(await read('numeric/'+native.id+'/candidate.svg')).toString('utf8');
  await write(native.id+'/frame-regions.json',{camera,regions,source:'Frozen native picture bounds, local tip paths, placement matrices and effective pen; fixed 16 CSS pixel camera margin.'});
  for(const frame of ['natural','expanded'])for(const scale of [1,4])for(const background of ['transparent','white','black']){
   const id=native.id+'/'+frame+'/'+scale+'x-'+background;
   const pair=await measureEdgeTrialPrimary(renderer,{reference:original,actual,leftIsDriver:true,
    origin:{x:native.metrics.driverState.svgRootMatrix[4],y:native.metrics.driverState.svgRootMatrix[5]},
    camera,frame,scale,background,regions,cropLimit:frame==='expanded'&&background==='white'?16:0,
    referenceLabel:'Native TikZ SVG',rightLabel:'Lokad.TikZ SVG'});
   assert.equal(pair.repeat.rawChangedPixels,0,'Reference repeat changed.');assert.equal(pair.actualRepeat.rawChangedPixels,0,'Candidate repeat changed.');
   const links=await images(id,pair.images),crops=[];
   for(const crop of pair.crops){
    const links=await images(id+'/crops/'+crop.id,{...crop.paired,sheet:crop.sheet});
    crops.push({id:crop.id,images:links,presentation:crop.presentation});
   }
   for(const region of pair.regions.filter(r=>r.nativePlacementId)){
    const crop=crops.find(c=>c.id===region.id);
    if(crop)rankedRegions.push({caseId:native.id,regionId:region.id,frame,scale,background,
     referenceRoute:'original-svg',metrics:region,images:crop.images,presentation:crop.presentation,attribution:region.attribution});
   }
   observations.push({id,caseId:native.id,frame,scale,background,metrics:pair.metrics,repeat:pair.repeat,actualRepeat:pair.actualRepeat,
    naturalFrames:pair.naturalFrames,regions:pair.regions,images:links,crops});
  }
 }
 assert.equal(observations.length,72);assert.equal(rankedRegions.length,118);
 await save('index.html',gallery());phase='complete';
 await write('report.json',{schemaVersion:1,completed:true,phase,comparisonKind:'public-arrow-inspection',
  numericConformanceClaim:true,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',
  snapshotSha256:evidence.snapshotSha256,numericReport:'numeric/report.json',numericChecks:numeric.checks,renderer:renderer.identity,
  sourceHashes,observations,agent:{firstRequiredFailure:null,pendingGates:['independent-frames','primary-calibration','PDF-calibration','image-defect-sensitivity','owned-combined-admission'],
   viewer:'index.html',rankedRegions:rankedRegions.sort((a,b)=>b.metrics.rawChangedPixels-a.metrics.rawChangedPixels||a.caseId.localeCompare(b.caseId)||a.regionId.localeCompare(b.regionId)),
   focusedRerun:{executable:'node',arguments:['tools/TikzVisual/inspect-arrow-public.mjs'],workingDirectory:'repository-root'},
   followUpCommands:[{executable:'dotnet',arguments:['test','Lokad.TikZ.slnx']}]},artifacts:{...artifacts}});
 console.log(JSON.stringify({completed:true,report:relative(path.join(output,'report.json')),views:observations.length,tipCrops:rankedRegions.length,imageAdmission:'pending'}));
}catch(error){
 await write('report.json',{schemaVersion:1,completed:false,phase,error:error.message,approvedImagePolicy:false,imageConformanceClaim:false,artifacts:{...artifacts}});
 console.error(error);process.exitCode=2;
}finally{if(renderer)await renderer.browser.close();}
