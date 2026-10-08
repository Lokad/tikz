// Public PDF mutations use the qualified primary input and fixed native policies.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {loadArrowMeetImageCache} from './arrow-meet-image-cache.mjs';
import {arrowPublicMeetBindings} from './arrow-public-meet-contract.mjs';
import {loadArrowPublicPdfInput,arrowPublicPdfSources,arrowPublicPdfPending} from './arrow-public-pdf-contract.mjs';
import {arrowPublicPdfControlPlan,captureArrowPublicPdfControl,arrowPublicPdfBaseline,arrowPublicPdfDelta,arrowPublicPdfFocus,arrowPublicPdfIndex,summarizeArrowPublicPdfControls} from './arrow-public-pdf-controls.mjs';
import {loadArrowPublicPdfOwned} from './arrow-public-pdf-reader.mjs';
import {paintArrowFaintFocus} from './arrow-faint-panels.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

const args=process.argv.slice(2);assert.ok(args.length===0||args.length===2&&args[0]==='--replay');
const out=await outputPath(path.join(root,'artifacts/arrow-public-pdf-controls/run-'+randomUUID())),artifacts={},records=[];
const save=(file,bytes)=>writeArtifact(out,file,bytes,artifacts),json=(file,value)=>save(file,JSON.stringify(value)+'\n'),saved=new Map();
let renderer,phase='qualified-primary-input',inputBindings,sourceHashes={},summary;
async function publish(completed,error){
  const mb=Buffer.from(JSON.stringify({schemaVersion:1,artifacts},null,2)+'\n');await writeArtifact(out,'manifest.json',mb);
  const report={schemaVersion:1,completed,phase,comparisonKind:'public-arrow-PDF-image-controls',converterInvoked:false,nativeToolInvoked:false,numericGatesBypassedForMutations:true,
    approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',renderer:renderer?.identity,inputBindings,sourceHashes,summary,records:'record-index.json',focus:'focus.json',nativeBindings:'native-limit-bindings.json',viewer:'index.html',
    manifest:{file:'manifest.json',sha256:sha256(mb),files:Object.keys(artifacts).length},pendingGates:arrowPublicPdfPending,...(error?{error}:{})};
  const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(out,'report.json',bytes);console.log(JSON.stringify({completed,phase,report:path.relative(root,path.join(out,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes),views:records.length}));
}
try{
  const e=await loadArrowMeetImageCache(),input=args.length?(await loadArrowPublicPdfOwned(args[1],e)).input:await loadArrowPublicPdfInput(e),sources=await arrowPublicPdfSources(e);inputBindings=input.bindings;
  for(const[file,bytes]of input.files)await save(file,bytes);for(const[file,s]of sources){sourceHashes[file]=s.sha256;await save('source-captures/'+file,s.bytes);}
  await json('native-limit-bindings.json',arrowPublicMeetBindings(e));renderer=await createRenderer();assertNativeEqual(renderer.identity,input.primary.report.renderer);await installShapeMetrics(renderer);
  for(const view of arrowPublicPdfControlPlan()){
    phase=view.id;const{record,captures,pdf}=await captureArrowPublicPdfControl(renderer,e,input.input,view);await save(record.files.pdf,pdf);saved.set(record.files.pdf,pdf);
    for(const type of ['source','scene']){
      const c=captures[type],files=record.files[type];await save(files.svg,c.svg);await json(files.numbers,c.numbers);record[type]=c.numbers;
      for(const[name,image]of Object.entries(c.images)){const bytes=Buffer.from(image,'base64');await save(files.images[name],bytes);if(name==='svg-page')saved.set(files.images[name],bytes);}
      if(!['calibration','visibility-calibration'].includes(view.kind)){
        const baseline=arrowPublicPdfBaseline(records,view);assert.ok(baseline);record[type+'Delta']=await arrowPublicPdfDelta(renderer,view,c.numbers.pageSize,saved.get(baseline.files[type].images['svg-page']),saved.get(files.images['svg-page']));
      }
    }
    const{source,scene,...meta}=record;await json('views/'+view.id+'/record.json',meta);records.push(record);
    if(view.frame==='expanded'&&view.scale===4)console.log('Public PDF control captured: '+view.id);
  }
  phase='coupled-outcomes';const model=summarizeArrowPublicPdfControls(e,records);summary=model.summary;
  for(const row of model.evaluations)await json('views/'+row.view.id+'/gates.json',row);await json('summary.json',summary);await json('record-index.json',records.map(r=>'views/'+r.view.id+'/record.json'));
  phase='fixed-focus-crops';const focus=arrowPublicPdfFocus(e,input.input,records);
  for(const p of focus){const panels=await paintArrowFaintFocus(renderer,p,file=>{assert.ok(saved.has(file));return saved.get(file);});for(const[name,image]of Object.entries(panels))await save(p.images[name],Buffer.from(image,'base64'));}
  await json('focus.json',focus);await save('index.html',arrowPublicPdfIndex(summary,records,focus));
  assertNativeEqual(await arrowPublicPdfSources(e),sources,'Public PDF sources changed during capture.');phase='complete';await publish(true);
}catch(error){process.exitCode=2;await publish(false,error.message.slice(0,1000).replaceAll(root,'<repo>'));console.error(error.stack);}finally{await renderer?.browser.close();}
