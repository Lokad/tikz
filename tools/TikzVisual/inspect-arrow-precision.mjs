// Research only: retain both framing routes, factorial printing and isolated pens.
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadArrowEvidence} from './arrow-evidence.mjs';
import {buildArrowNativeFrame} from './arrow-native-frame.mjs';
import {arrowCanonical} from './arrow-native-contract.mjs';
import {arrowPrecisionPlan,arrowPrecisionInputs,arrowPrecisionSources,validateArrowPrecisionReport} from './arrow-precision-contract.mjs';
import {measureArrowVectorPair,arrowIntrinsicRasterSize,runArrowViewportControls} from './arrow-vector-pair.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

assert.equal(process.argv.length,2,'Usage: node tools/TikzVisual/inspect-arrow-precision.mjs');
const out=await outputPath(path.join(root,'artifacts/arrow-precision-inspection/run-'+randomUUID()));await mkdir(out,{recursive:true});
const artifacts={},sourceHashes={},frames=[],observations=[];let renderer,phase='source-capture',evidence,controls;
const save=(f,b)=>writeArtifact(out,f,b,artifacts),json=(f,v)=>save(f,JSON.stringify(v,null,2)+'\n');
async function publish(r){const bytes=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(out,'report.json',bytes);
 console.log(JSON.stringify({kind:'arrow-precision-inspection',completed:r.completed,phase:r.phase,report:path.relative(root,path.join(out,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));}
function gallery(){return'<!doctype html><html lang="en"><meta charset="utf-8"><title>Native arrow precision and viewports</title><style>body{font:16px sans-serif;margin:24px}img{max-width:100%;image-rendering:pixelated}section{border-top:1px solid #ccc;padding:12px}</style><h1>Native precision and viewport research</h1><p>No converter, policy or public admission. Both routes remain required separately.</p><a href="report.json">Report</a> · <a href="controls.json">Controls</a>'+
 observations.filter(o=>o.view.background==='white'&&o.view.scale===1&&o.view.kind!=='pen').map(o=>'<section><h2>'+o.view.id+'</h2><img src="'+o.images.comparison+'" alt="Reference | native representation | amplified difference"><p>'+o.metrics.rawChangedPixels+' changed pixels; maximum '+o.metrics.maxRawChannelError+'/255. <a href="'+o.numbers+'">Whole/local measurements and framing</a></p></section>').join('')+'</html>\n';}
try{
 await publish({schemaVersion:1,completed:false,phase,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false});
 evidence=await loadArrowEvidence();const sources=await arrowPrecisionSources();
 for(const file of Object.keys(evidence.snapshot.sourceHashes))if(!sources.has(file)){const bytes=arrowCanonical(await readFile(path.join(root,file)));sources.set(file,{bytes,sha256:sha256(bytes)});}
 for(const[file,value]of [...sources].sort(([a],[b])=>a.localeCompare(b))){sourceHashes[file]=value.sha256;await save('source-captures/'+file,value.bytes);}
 for(const c of evidence.cases){const frame=buildArrowNativeFrame(c.id,evidence.artifacts.get(c.id+'/plain-reference.svg').toString(),c.metrics);frames.push(frame);await json(c.id+'/frame.json',frame);}
 renderer=await createRenderer();await installShapeMetrics(renderer);phase='controls';controls=await runArrowViewportControls(renderer);await json('controls.json',controls);
 phase='captures';
 for(const view of arrowPrecisionPlan(evidence.cases.map(c=>c.id))){
  const c=evidence.cases.find(c=>c.id===view.caseId),frame=frames.find(f=>f.caseId===view.caseId),original=evidence.artifacts.get(c.id+'/plain-reference.svg').toString();
  const inputs=arrowPrecisionInputs(view,c,frame,original),reference=view.id+'/reference.svg',actual=view.id+'/actual.svg';await save(reference,inputs.reference);await save(actual,inputs.actual);
  const pair=await(view.route==='intrinsic-image'?measureEdgeTrialPrimary:measureArrowVectorPair)(renderer,{...inputs,camera:frame.camera,frame:view.frame,scale:view.scale,background:view.background,
   regions:[{id:'whole-picture',rectangle:{x:0,y:0,width:frame.camera.width,height:frame.camera.height}},...frame.regions],cropLimit:0,referenceLabel:view.kind==='pen'?'Native pen':'TikZ SVG',rightLabel:view.route});
  assert.equal(pair.repeat.rawChangedPixels,0);assert.equal(pair.actualRepeat.rawChangedPixels,0);
  const {images:raw,crops,...values}=pair;assert.equal(crops.length,0);const images={};
  for(const[key,png]of Object.entries(raw)){images[key]=view.id+'-'+key+'.png';await save(images[key],Buffer.from(png,'base64'));}
  const intrinsic={reference:await arrowIntrinsicRasterSize(renderer,inputs.reference),actual:await arrowIntrinsicRasterSize(renderer,inputs.actual)};
  const numbers=view.id+'/numbers.json';await json(numbers,{...values,view,intrinsic,pen:inputs.pen??null,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false});
  observations.push({view,numbers,reference,actual,images,metrics:pair.metrics});
  if(view.background==='black'&&view.scale===4&&view.frame==='expanded')console.log('Native precision: '+view.id);
 }
 phase='coverage';await save('index.html',gallery());
 const report={schemaVersion:1,completed:true,phase:'complete',comparisonKind:'native-arrow-precision-and-viewport-research',converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
  snapshotSha256:evidence.snapshotSha256,renderer:renderer.identity,sourceHashes,frames,observations,
  agent:{viewer:'index.html',pendingGates:['primary-calibration','PDF-calibration','image-only-sensitivity','public-combined-admission'],
   interpretation:'Research observations only. Both intrinsic-image and explicit-viewport routes are retained; neither replaces the other or establishes public conformance.'},artifacts};
 report.coverage=validateArrowPrecisionReport(report,evidence,frames);
 for(const[file,value]of sources)assert.equal(sha256(arrowCanonical(await readFile(path.join(root,file)))),value.sha256,'Source changed during precision capture.');await loadArrowEvidence();
 await publish(report);
}catch(error){process.exitCode=2;await publish({schemaVersion:1,completed:false,phase,error:error.message.replaceAll(root,'<repo>'),converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
 sourceHashes,frames,observations,artifacts});console.error(error.stack);}
finally{await renderer?.browser.close();}
