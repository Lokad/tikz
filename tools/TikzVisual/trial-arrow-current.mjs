import {requireRenderer} from './shape-primary-trial-policy.mjs';
// One owned fresh converter run, complete baselines and both sensitivity matrices.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadArrowPublicImageCache} from './arrow-public-image-cache.mjs';
import {arrowPublicImageCacheFile,arrowPublicImageCacheSha256} from './arrow-public-image-cache-pin.mjs';
import {arrowMeetImageCacheFile,arrowMeetImageCacheSha256} from './arrow-meet-image-cache-pin.mjs';
import {arrowImageCacheFile,arrowImageCacheSha256} from './arrow-image-cache.mjs';
import {arrowPublicMeetBindings} from './arrow-public-meet-contract.mjs';
import {validateArrowPublicNumeric} from './arrow-public-source-contract.mjs';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {arrowCurrentTrialSources,arrowCurrentCandidateInput,arrowCurrentTrialPending,arrowCurrentIndex} from './arrow-current-trial-contract.mjs';
import {captureArrowCurrentBaselines} from './arrow-current-baseline-capture.mjs';
import {arrowPublicPrimaryControlPlan,captureArrowPublicPrimaryControl,arrowPublicPrimaryBaseline,arrowPublicPrimaryDelta,summarizeArrowPublicPrimaryControls} from './arrow-public-primary-controls.mjs';
import {arrowPublicPdfControlPlan,captureArrowPublicPdfControl,arrowPublicPdfBaseline,arrowPublicPdfDelta,arrowPublicPdfFocus,arrowPublicPdfIndex,summarizeArrowPublicPdfControls} from './arrow-public-pdf-controls.mjs';
import {paintArrowFaintFocus} from './arrow-faint-panels.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

assert.equal(process.argv.length,2);
const out=await outputPath(path.join(root,'artifacts/arrow-current-trials/run-'+randomUUID())),artifacts={};
const relative=p=>path.relative(root,p).split(path.sep).join('/');
const save=(file,bytes)=>writeArtifact(out,file,bytes,artifacts),json=(file,value)=>save(file,JSON.stringify(value)+'\n');
const read=file=>readFile(path.join(out,file));
const primary=[],pdf=[],saved=new Map();
let renderer,phase='frozen-qualification',sourceHashes={},qualification,numeric,baselines,primarySummary,pdfSummary,converterInvoked=false;
async function publish(completed,error){
  const mb=Buffer.from(JSON.stringify({schemaVersion:1,artifacts},null,2)+'\n');await writeArtifact(out,'manifest.json',mb);
  const report={schemaVersion:1,comparisonKind:'current-public-arrow-combined-trial',completed,phase,converterInvoked,nativeToolInvoked:false,
    numericGatesBypassedForMutations:true,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',renderer:renderer?.identity,
    qualification,sourceHashes,numericReport:'baseline/numeric/report.json',baseline:'baseline/combined.json',primary:'primary/summary.json',pdf:'pdf/summary.json',
    focus:'pdf/focus.json',inspection:'agent-inspection.json',viewer:'index.html',baselinePassed:baselines?.combined.passed,primarySummary,pdfSummary,
    pendingGates:arrowCurrentTrialPending,manifest:{file:'manifest.json',sha256:sha256(mb),files:Object.keys(artifacts).length},...(error?{error}:{})};
  const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(out,'report.json',bytes);
  console.log(JSON.stringify({completed,phase,report:relative(path.join(out,'report.json')),sha256:sha256(bytes),baselinePassed:report.baselinePassed,primaryViews:primary.length,pdfViews:pdf.length}));
}
try{
  const historical=await loadArrowPublicImageCache(),e=historical.native,sources=await arrowCurrentTrialSources(e);
  qualification={publicCacheSha256:arrowPublicImageCacheSha256,nativeMeetCacheSha256:arrowMeetImageCacheSha256,nativeBaseCacheSha256:arrowImageCacheSha256};
  for(const[file,target]of [[arrowPublicImageCacheFile,'qualification/public-controls.bin.gz'],[arrowMeetImageCacheFile,'qualification/native-meet.bin.gz'],[arrowImageCacheFile,'qualification/native-source.bin.gz']])await save(target,await readFile(path.join(root,file)));
  for(const[file,s]of sources){sourceHashes[file]=s.sha256;await save('source-captures/'+file,s.bytes);}
  await json('native-limit-bindings.json',arrowPublicMeetBindings(e));
  renderer=await createRenderer();requireRenderer(renderer.identity, e.reports.primary.renderer);await installShapeMetrics(renderer);
  phase='fresh-current-numeric';converterInvoked=true;
  const command=await promisify(execFile)('dotnet',['run','--project','tools/TikzArrowComparison','-c','Release','--','--out',relative(path.join(out,'baseline/numeric'))],{cwd:root,windowsHide:true,timeout:180000,maxBuffer:1000000});
  await save('numeric-command.log',(command.stdout+command.stderr).replaceAll(root,'<repo>').replaceAll(relative(out),'<trial>'));
  const nb=await read('baseline/numeric/report.json');numeric=JSON.parse(nb);await validateArrowPublicNumeric(numeric,p=>read('baseline/numeric/'+p));
  assert.equal(numeric.snapshotSha256,e.native.snapshotSha256);artifacts['baseline/numeric/report.json']=sha256(nb);
  for(const[file,hash]of Object.entries(numeric.artifacts))artifacts['baseline/numeric/'+file]=hash;
  phase='complete-current-baselines';
  baselines=await captureArrowCurrentBaselines(renderer,e,numeric,p=>read('baseline/'+p),(p,b)=>save('baseline/'+p,b),(p,v)=>json('baseline/'+p,v));
  assert.equal(baselines.combined.passed,true,'Current converter baseline gates failed.');
  // The adapter reads only the current baseline output. Historical public candidates never enter this path.
  const candidateFiles=new Map();
  for(const caseId of e.frames.map(f=>f.caseId))for(const file of ['candidate.svg','scene.json'])candidateFiles.set('numeric/'+caseId+'/'+file,await read('baseline/numeric/'+caseId+'/'+file));
  for(const row of baselines.pdf)candidateFiles.set(row.source.files.svg,await read('baseline/'+row.source.files.svg));
  for(const[file]of Object.entries(numeric.inputs))candidateFiles.set('numeric/input-captures/'+file,await read('baseline/numeric/input-captures/'+file));
  const input=arrowCurrentCandidateInput(file=>{assert.ok(candidateFiles.has(file),'Missing current candidate input: '+file);return candidateFiles.get(file);},baselines.pdf);
  for(const view of arrowPublicPrimaryControlPlan()){
    phase='primary/'+view.id;const{record,numbers,images,crops,reference,actual,frame}=await captureArrowPublicPrimaryControl(renderer,e,input,view),png=Buffer.from(images.actual,'base64');
    if(['defect','visibility-missing'].includes(view.kind))record.delta=await arrowPublicPrimaryDelta(renderer,frame,view,arrowPublicPrimaryBaseline(primary,view).actualPng,png);
    await save('primary/'+record.files.reference,reference);await save('primary/'+record.files.actual,actual);
    for(const[name,image]of Object.entries(images))await save('primary/'+record.files.images[name],Buffer.from(image,'base64'));
    for(const[i,crop]of crops.entries())for(const[name,image]of Object.entries({...crop.paired,sheet:crop.sheet}))await save('primary/'+record.files.crops[i].images[name],Buffer.from(image,'base64'));
    await json('primary/'+record.files.numbers,numbers);await json('primary/'+record.files.record,record);primary.push({...record,numbers,actualPng:png});
    if(view.scale===4&&view.background==='black')console.log('Current primary control captured: '+view.id);
  }
  const pm=summarizeArrowPublicPrimaryControls(e,primary);primarySummary=pm.summary;
  for(const row of pm.evaluations)await json('primary/views/'+row.view.id+'/gates.json',row);
  await json('primary/summary.json',primarySummary);await json('primary/record-index.json',primary.map(r=>r.files.record));
  for(const view of arrowPublicPdfControlPlan()){
    phase='pdf/'+view.id;const{record,captures,pdf:pdfBytes}=await captureArrowPublicPdfControl(renderer,e,input,view);
    await save('pdf/'+record.files.pdf,pdfBytes);saved.set(record.files.pdf,pdfBytes);
    for(const type of ['source','scene']){
      const c=captures[type],files=record.files[type];await save('pdf/'+files.svg,c.svg);await json('pdf/'+files.numbers,c.numbers);record[type]=c.numbers;
      for(const[name,image]of Object.entries(c.images)){const bytes=Buffer.from(image,'base64');await save('pdf/'+files.images[name],bytes);if(name==='svg-page')saved.set(files.images[name],bytes);}
      if(!['calibration','visibility-calibration'].includes(view.kind)){
        const baseline=arrowPublicPdfBaseline(pdf,view);assert.ok(baseline);
        record[type+'Delta']=await arrowPublicPdfDelta(renderer,view,c.numbers.pageSize,saved.get(baseline.files[type].images['svg-page']),saved.get(files.images['svg-page']));
      }
    }
    const{source,scene,...meta}=record;await json('pdf/views/'+view.id+'/record.json',meta);pdf.push(record);
    if(view.frame==='expanded'&&view.scale===4)console.log('Current PDF control captured: '+view.id);
  }
  const qm=summarizeArrowPublicPdfControls(e,pdf);pdfSummary=qm.summary;
  for(const row of qm.evaluations)await json('pdf/views/'+row.view.id+'/gates.json',row);
  await json('pdf/summary.json',pdfSummary);await json('pdf/record-index.json',pdf.map(r=>'views/'+r.view.id+'/record.json'));
  phase='fixed-focus-crops';const focus=arrowPublicPdfFocus(e,input,pdf);
  for(const p of focus){const panels=await paintArrowFaintFocus(renderer,p,file=>{assert.ok(saved.has(file));return saved.get(file);});for(const[name,image]of Object.entries(panels))await save('pdf/'+p.images[name],Buffer.from(image,'base64'));}
  await json('pdf/focus.json',focus);await save('pdf/index.html',arrowPublicPdfIndex(pdfSummary,pdf,focus));
  const inspection={schemaVersion:1,role:'current-candidate-inspection',numeric:'baseline/numeric/report.json',baseline:'baseline/combined.json',
    coverage:{cases:6,primaryBaselines:144,pdfBaselines:96,qualifiedNativePageChecks:192,primaryControls:306,pdfControls:396,pdfControlCaptures:792,focusSelections:focus.length},
    primary:primary.map(r=>({view:r.view.id,record:'primary/'+r.files.record,pair:'primary/'+(r.files.images.comparison??r.files.images.actual),images:Object.fromEntries(Object.entries(r.files.images).map(([k,p])=>[k,'primary/'+p])),crops:r.files.crops.map(c=>'primary/'+c.images.sheet),attribution:r.attribution})),
    pdf:pdf.map(r=>({view:r.view.id,record:'pdf/views/'+r.view.id+'/record.json',source:'pdf/'+(r.files.source.images.sheet??r.files.source.images['svg-page']),scene:'pdf/'+(r.files.scene.images.sheet??r.files.scene.images['svg-page']),attribution:r.attribution})),
    focus:focus.map(p=>({view:p.viewId,type:p.type,region:p.regionId,sheet:'pdf/'+p.images.sheet,attribution:p.attribution}))};
  await json('agent-inspection.json',inspection);
  await save('index.html',arrowCurrentIndex(inspection));
  assertNativeEqual(await arrowCurrentTrialSources(e),sources,'Current comparison sources changed during capture.');await validateArrowPublicNumeric(numeric,p=>read('baseline/numeric/'+p));
  phase='complete';await publish(true);
}catch(error){process.exitCode=2;await publish(false,error.message.slice(0,1000).replaceAll(root,'<repo>'));console.error(error.stack);}finally{await renderer?.browser.close();}
