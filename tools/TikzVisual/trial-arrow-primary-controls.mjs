import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Full public primary fault matrix with frozen native policies and checked inputs.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {loadArrowMeetImageCache} from './arrow-meet-image-cache.mjs';
import {arrowPublicMeetBindings} from './arrow-public-meet-contract.mjs';
import {loadArrowPublicControlInput,arrowPublicControlSources,arrowPublicPrimaryPending} from './arrow-public-controls-contract.mjs';
import {arrowPublicPrimaryControlPlan,captureArrowPublicPrimaryControl,arrowPublicPrimaryBaseline,arrowPublicPrimaryDelta,summarizeArrowPublicPrimaryControls} from './arrow-public-primary-controls.mjs';
import {loadArrowPublicPrimaryOwned} from './arrow-public-primary-reader.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

const args=process.argv.slice(2);assert.ok(args.length===0||args.length===2&&args[0]==='--replay');
const out=await outputPath(path.join(root,'artifacts/arrow-public-primary-controls/run-'+randomUUID())),artifacts={},records=[];
const save=(file,bytes)=>writeArtifact(out,file,bytes,artifacts),json=(file,value)=>save(file,JSON.stringify(value)+'\n');
const entries=['trial-arrow-primary-controls.mjs','arrow-public-controls-contract.mjs'];
let renderer,phase='qualified-input',inputBindings,sourceHashes={},summary;
async function publish(completed,error){
  const mb=Buffer.from(JSON.stringify({schemaVersion:1,artifacts},null,2)+'\n');await writeArtifact(out,'manifest.json',mb);
  const report={schemaVersion:1,completed,phase,comparisonKind:'public-arrow-primary-image-controls',converterInvoked:false,nativeToolInvoked:false,
    numericGatesBypassedForMutations:true,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',renderer:renderer?.identity,
    inputBindings,sourceHashes,summary,records:'record-index.json',nativeBindings:'native-limit-bindings.json',viewer:'index.html',
    manifest:{file:'manifest.json',sha256:sha256(mb),files:Object.keys(artifacts).length},pendingGates:arrowPublicPrimaryPending,...(error?{error}:{})};
  const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(out,'report.json',bytes);
  console.log(JSON.stringify({completed,phase,report:path.relative(root,path.join(out,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes),views:records.length}));
}
try{
  const e=await loadArrowMeetImageCache();
  const input=args.length?(await loadArrowPublicPrimaryOwned(args[1],e)).input:await loadArrowPublicControlInput(e);
  const sources=await arrowPublicControlSources(e,entries);inputBindings=input.bindings;
  for(const [file,bytes]of input.files)await save(file,bytes);
  for(const [file,s]of sources){sourceHashes[file]=s.sha256;await save('source-captures/'+file,s.bytes);}
  await json('native-limit-bindings.json',arrowPublicMeetBindings(e));
  renderer=await createRenderer();requireRenderer(renderer.identity, input.bundle.report.renderer);await installShapeMetrics(renderer);
  for(const view of arrowPublicPrimaryControlPlan()){
    phase=view.id;const capture=await captureArrowPublicPrimaryControl(renderer,e,input,view),{record,numbers,images,crops,reference,actual,frame}=capture;
    const png=Buffer.from(images.actual,'base64');
    if(['defect','visibility-missing'].includes(view.kind))record.delta=await arrowPublicPrimaryDelta(renderer,frame,view,arrowPublicPrimaryBaseline(records,view).actualPng,png);
    await save(record.files.reference,reference);await save(record.files.actual,actual);
    for(const [name,image]of Object.entries(images))await save(record.files.images[name],Buffer.from(image,'base64'));
    for(const [i,crop]of crops.entries())for(const [name,image]of Object.entries({...crop.paired,sheet:crop.sheet}))await save(record.files.crops[i].images[name],Buffer.from(image,'base64'));
    await json(record.files.numbers,numbers);await json(record.files.record,record);records.push({...record,numbers,actualPng:png});
    if(view.scale===4&&view.background==='black')console.log('Public primary control captured: '+view.id);
  }
  phase='coupled-outcomes';const model=summarizeArrowPublicPrimaryControls(e,records);summary=model.summary;
  for(const row of model.evaluations)await json('views/'+row.view.id+'/gates.json',row);
  await json('summary.json',summary);await json('record-index.json',records.map(r=>r.files.record));
  await save('index.html','<!doctype html><meta charset="utf-8"><title>Public arrow primary controls</title><style>body{font:16px sans-serif;margin:24px}img{max-width:100%;image-rendering:pixelated}pre{white-space:pre-wrap}</style><h1>Public arrow primary controls; admission pending</h1><p>Numeric defect gates are bypassed. Native policies, cameras and regions remain fixed. Invisible and source-frame failures remain explicit.</p><a href="report.json">Report</a> · <a href="summary.json">Outcomes</a><pre>'+JSON.stringify(summary,null,2)+'</pre>'+records.filter(r=>r.view.scale===1&&r.view.background==='white').map(r=>'<article><h2>'+r.view.id+'</h2><a href="'+r.files.record+'">Source attribution and files</a><img src="'+r.files.images.comparison+'">'+r.files.crops.map(c=>'<img src="'+c.images.sheet+'">').join('')+'</article>').join(''));
  assertNativeEqual(await arrowPublicControlSources(e,entries),sources,'Public control sources changed during capture.');
  phase='complete';await publish(true);
}catch(error){process.exitCode=2;await publish(false,error.message.slice(0,1000).replaceAll(root,'<repo>'));console.error(error.stack);}finally{await renderer?.browser.close();}
