// Current compilation, independent image decoding and hostile fully rehashed bundles.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {arrowMetrics} from './arrow-native-contract.mjs';
import {arrowCurrentTrialSources,arrowCurrentNumericParity} from './arrow-current-trial-contract.mjs';
import {loadArrowCurrentTrial,validateArrowCurrentTrial} from './arrow-current-trial-reader.mjs';
import {verifyArrowCurrentBaselines} from './arrow-current-baseline-check.mjs';
import {verifyArrowPublicMeetPrimaryCapture} from './arrow-public-meet-binding.mjs';
import {validateArrowPublicNumeric} from './arrow-public-source-contract.mjs';
import {verifyArrowPublicPdfPrimary} from './arrow-public-pdf-primary-binding.mjs';
import {captureArrowPublicPrimaryControl} from './arrow-public-primary-controls.mjs';
import {captureArrowPublicPdfControl,arrowPublicPdfBaseline,arrowPublicPdfDelta,summarizeArrowPublicPdfControls} from './arrow-public-pdf-controls.mjs';
import {arrowViewportRegions} from './arrow-viewport-model.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {measureArrowPdfInk} from './arrow-pdf-ink.mjs';
import {checkArrowPaperPanels} from './arrow-pdf-panels.mjs';
import {paintArrowFaintFocus,checkArrowFaintFocus} from './arrow-faint-panels.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

assert.equal(process.argv.length,3);
const out=await outputPath(path.join(root,'artifacts/arrow-current-checks/run-'+randomUUID())),controls=[],records=[],artifacts={};
const relative=p=>path.relative(root,p).split(path.sep).join('/'),save=(p,b)=>writeArtifact(out,p,b,artifacts);
let renderer,phase='owned-current-input',inputReportSha256,numericBuildIdentity,baseline,primary,summary,sourceHashes={},converterInvoked=false;
let measurements=0,moments=0,fullPages=0,images=0,deltas=0,panels=0,focusPanels=0;
async function publish(completed,error){
  const bytes=Buffer.from(JSON.stringify({schemaVersion:1,comparisonKind:'independent-current-public-arrow-combined-check',completed,phase,inputReport:process.argv[2],inputReportSha256,
    converterInvoked,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',renderer:renderer?.identity,sourceHashes,numericBuildIdentity,
    baseline,primary,pdf:{views:records.length,measurements,moments,fullPages,images,deltas,panels,focusPanels,summary},controls,artifacts,...(error?{error}:{})},null,2)+'\n');
  await writeArtifact(out,'report.json',bytes);console.log(JSON.stringify({completed,phase,report:relative(path.join(out,'report.json')),sha256:sha256(bytes),views:records.length,controls:controls.length}));
}
async function reject(name,action){let rejection;await assert.rejects(action,error=>{assert.ok(error instanceof assert.AssertionError);rejection=error.message.slice(0,500);return true;});controls.push({name,passed:true,rejection});}
function matchCapture(record,capture,read){
  const{source,scene,...meta}=record;assertNativeEqual({...capture.record,sourceDelta:record.sourceDelta,sceneDelta:record.sceneDelta},meta,'Changed current PDF metadata: '+record.view.id);
  assert.ok(read(record.files.pdf).equals(capture.pdf));
  for(const type of ['source','scene']){
    const c=capture.captures[type],files=record.files[type];assert.equal(read(files.svg).toString(),c.svg,'Changed current PDF SVG: '+record.view.id+'/'+type);assertNativeEqual(JSON.parse(read(files.numbers)),c.numbers);
    for(const[name,image]of Object.entries(c.images))assert.ok(read(files.images[name]).equals(Buffer.from(image,'base64')),'Current PDF SVG/image binding: '+record.view.id+'/'+type+'/'+name);
  }
}
async function decodeNumbers(e,b,record,type){
  const view=record.view,frame=e.frames.find(f=>f.caseId===view.caseId),n=b.json(record.files[type].numbers),regions=type==='source'?frame.paper.regions:arrowViewportRegions(frame);
  const pair=[b.read(record.files.pdf),b.read(record.files[type].images['svg-page'])];
  const decoded=await decodeEdgeOraclePngPair(renderer,pair,n.pageSize,regions.map(r=>r.rasterRectangles[view.scale+'x']),view.scale,'white',true);
  const ink=await measureArrowPdfInk(renderer,pair,n.pageSize,regions,view.scale),quantities=[n.whole,...n.regions];assert.equal(quantities.length,regions.length);
  assertNativeEqual(n.fullPage,decoded.fullPage);assert.equal(n.outsideWholeChangedPixels,decoded.fullPage.rawChangedPixels-decoded.metrics[0].rawChangedPixels);
  if(type==='scene')assert.equal(n.outsideDiagramChangedPixels,decoded.fullPage.rawChangedPixels-decoded.metrics[1].rawChangedPixels);
  for(const[i,q]of quantities.entries()){
    for(const[k,value]of Object.entries(regions[i]))assertNativeEqual(q[k],value);
    assertNativeEqual(arrowMetrics(q),decoded.metrics[i]);assertNativeEqual(q.inkCoverage,ink[i].inkCoverage,'Changed decoded PDF RGB mass.');assertNativeEqual(q.inkMoments,ink[i].inkMoments,'Changed decoded PDF RGB moments.');
  }
  return quantities.length;
}
try{
  const b=await loadArrowCurrentTrial(process.argv[2]),e=b.e;inputReportSha256=b.inputReportSha256;
  const sources=await arrowCurrentTrialSources(e);for(const[file,s]of sources){sourceHashes[file]=s.sha256;await save('source-captures/'+file,s.bytes);}
  renderer=await createRenderer();assertNativeEqual(renderer.identity,b.report.renderer);await installShapeMetrics(renderer);
  phase='independent-current-compilation';converterInvoked=true;
  const command=await promisify(execFile)('dotnet',['run','--project','tools/TikzArrowComparison','-c','Release','--','--out',relative(path.join(out,'numeric'))],{cwd:root,windowsHide:true,timeout:180000,maxBuffer:1000000});
  await save('numeric-command.log',(command.stdout+command.stderr).replaceAll(root,'<repo>').replaceAll(relative(out),'<check>'));
  const nb=await readFile(path.join(out,'numeric/report.json')),fresh=JSON.parse(nb);await validateArrowPublicNumeric(fresh,p=>readFile(path.join(out,'numeric',p)));
  numericBuildIdentity=arrowCurrentNumericParity(b.baseline.numeric,fresh);artifacts['numeric/report.json']=sha256(nb);
  for(const[file,hash]of Object.entries(fresh.artifacts))artifacts['numeric/'+file]=hash;
  phase='independent-complete-baselines';baseline=await verifyArrowCurrentBaselines(renderer,e,b.baseline,fresh);
  assertNativeEqual([baseline.primaryRegions,baseline.pdfRegions,baseline.momentRegions,baseline.exactRegions,baseline.fullPages,baseline.panels,baseline.recapturedPrimaryImages,baseline.recapturedPdfImages],[17928,24000,24000,24192,384,2136,1368,1248]);
  phase='independent-primary-controls';primary=await verifyArrowPublicPdfPrimary(renderer,e,b.primary,view=>{phase='primary/'+view.id;if(view.scale===4&&view.background==='black')console.log('Current primary control checked: '+view.id);});
  for(const record of b.pdf.records){
    phase='pdf/'+record.view.id;const capture=await captureArrowPublicPdfControl(renderer,e,b.input,record.view);matchCapture(record,capture,b.pdf.read);
    for(const type of ['source','scene']){
      const count=await decodeNumbers(e,b.pdf,record,type);measurements+=count;moments+=count;fullPages++;images+=Object.keys(capture.captures[type].images).length;
      const frame=capture.frame,regions=type==='source'?frame.paper.regions:arrowViewportRegions(frame),n=record[type];
      panels+=await checkArrowPaperPanels(renderer,{...n,images:record.files[type].images,pdfPage:record.files.pdf,crops:[]},b.pdf.read,regions);
      if(!['calibration','visibility-calibration'].includes(record.view.kind)){
        const br=arrowPublicPdfBaseline(records,record.view);assert.ok(br);assertNativeEqual(record[type+'Delta'],await arrowPublicPdfDelta(renderer,record.view,n.pageSize,b.pdf.read(br.files[type].images['svg-page']),b.pdf.read(record.files[type].images['svg-page'])));deltas++;
      }
    }
    records.push(record);if(record.view.frame==='expanded'&&record.view.scale===4)console.log('Current PDF control checked: '+record.view.id);
  }
  phase='independent-focus-crops';
  for(const p of b.pdf.focus){const expected=await paintArrowFaintFocus(renderer,p,b.pdf.read);for(const[name,image]of Object.entries(expected))assert.ok(b.pdf.read(p.images[name]).equals(Buffer.from(image,'base64')),'Current focus crop/page binding.');images+=Object.keys(expected).length;focusPanels+=await checkArrowFaintFocus(renderer,p,b.pdf.read);}
  summary=summarizeArrowPublicPdfControls(e,records).summary;assertNativeEqual(summary,b.report.pdfSummary);
  assertNativeEqual([records.length,measurements,moments,fullPages,images,deltas,panels,focusPanels],[396,100908,100908,792,7228,568,4356,2080]);
  phase='corruption-controls';const validate=(report=b.report,mb=b.manifestBytes,assets=b.assets)=>validateArrowCurrentTrial(Buffer.from(JSON.stringify(report)+'\n'),mb,assets,e);
  const metadata=[['false complete',r=>r.completed=false],['false approval',r=>r.approvedImagePolicy=true],['false image claim',r=>r.imageConformanceClaim=true],['false admission',r=>r.imageAdmission='passed'],
    ['converter bypassed',r=>r.converterInvoked=false],['numeric mutations falsely enabled',r=>r.numericGatesBypassedForMutations=false],['lost pending gate',r=>r.pendingGates.pop()],['changed renderer',r=>r.renderer.browser='different'],
    ['lost current source guard',r=>delete r.sourceHashes[Object.keys(r.sourceHashes)[0]]],['changed native qualification',r=>r.qualification.nativeMeetCacheSha256='0'.repeat(64)],['false baseline verdict',r=>r.baselinePassed=false],
    ['false primary count',r=>r.primarySummary.views--],['false PDF count',r=>r.pdfSummary.views--],['unsafe manifest',r=>r.manifest.file='../manifest.json']];
  for(const[name,change]of metadata){const report=structuredClone(b.report);change(report);await reject(name,()=>validate(report));}
  for(const[name,file]of [['missing current SVG','baseline/numeric/'+e.frames[0].caseId+'/candidate.svg'],['missing native page','pdf/'+records[0].files.pdf],['missing qualification','qualification/public-controls.bin.gz'],['missing focused crop','pdf/'+b.pdf.focus[0].images.sheet]]){
    const assets=new Map(b.assets);assets.delete(file);await reject(name,()=>validate(b.report,b.manifestBytes,assets));
  }
  for(const[name,change]of [['changed numeric count',n=>n.checks--],['changed current numeric source',n=>n.sources[Object.keys(n.sources)[0]]='0'.repeat(64)],['changed current artifact',n=>n.artifacts[Object.keys(n.artifacts)[0]]='0'.repeat(64)],['lost public parity',n=>n.cases[0].publicTraceParity=false],['malformed build identity',n=>n.assemblySha256='invalid']]){
    const bad=structuredClone(fresh);change(bad);await reject(name,async()=>arrowCurrentNumericParity(fresh,bad));
  }
  const alternate=structuredClone(fresh);alternate.assemblySha256=fresh.assemblySha256==='a'.repeat(64)?'b'.repeat(64):'a'.repeat(64);assert.equal(arrowCurrentNumericParity(fresh,alternate).identicalAssemblyBytes,false);controls.push({name:'different assembly provenance with identical current evidence',passed:true});
  const rehash=changes=>{
    const assets=new Map(b.assets),manifest=structuredClone(b.manifest);for(const[file,bytes]of changes){assets.set(file,bytes);manifest.artifacts[file]=sha256(bytes);}
    const mb=Buffer.from(JSON.stringify(manifest,null,2)+'\n'),report=structuredClone(b.report);report.manifest.sha256=sha256(mb);return{report,mb,assets};
  };
  const forgery=async(name,changes,check)=>{const f=rehash(changes);if(check){const bad=await validate(f.report,f.mb,f.assets);await reject(name,()=>check(bad));}else await reject(name,()=>validate(f.report,f.mb,f.assets));};
  const encode=value=>Buffer.from(JSON.stringify(value)+'\n');
  for(const ns of ['primary','pdf']){const index=b.json(ns+'/record-index.json');index.pop();await forgery('fully rehashed lost '+ns+' view',[[ns+'/record-index.json',encode(index)]]);}
  const limits=b.json('native-limit-bindings.json');limits.pdfPolicies.pop();await forgery('fully rehashed lost frozen policy',[['native-limit-bindings.json',encode(limits)]]);
  const attributed=records.find(r=>r.attribution!==null),meta=b.pdf.json('views/'+attributed.view.id+'/record.json');meta.attribution.source.offset++;
  await forgery('fully rehashed source attribution',[['pdf/views/'+attributed.view.id+'/record.json',encode(meta)]]);
  const sample=records.find(r=>r.view.kind==='defect'&&r.sourceDelta.rawChangedPixels>0&&r.sceneDelta.rawChangedPixels>0);assert.ok(sample);
  await forgery('fully rehashed source SVG through image binding',[['pdf/'+sample.files.source.svg,Buffer.from('<svg/>')]],async bad=>matchCapture(sample,await captureArrowPublicPdfControl(renderer,e,b.input,sample.view),bad.pdf.read));
  for(const type of ['source','scene'])await forgery('fully rehashed '+type+' PNG through image binding',[['pdf/'+sample.files[type].images['svg-page'],b.pdf.read(sample.files.pdf)]],async bad=>matchCapture(sample,await captureArrowPublicPdfControl(renderer,e,b.input,sample.view),bad.pdf.read));
  const normalization=b.pdf.json('views/'+sample.view.id+'/record.json');normalization.normalization.sourceFrame.x+=.25;
  await forgery('fully rehashed normalization through image binding',[['pdf/views/'+sample.view.id+'/record.json',encode(normalization)]],async bad=>matchCapture(bad.pdf.records.find(r=>r.view.id===sample.view.id),await captureArrowPublicPdfControl(renderer,e,b.input,sample.view),bad.pdf.read));
  const momentRecord=records.find(r=>r.view.kind==='defect'&&r.view.name==='wrong-tip-fill'&&r.view.scale===1);assert.ok(momentRecord);
  for(const axis of ['mass','x','y']){
    const numbers=b.pdf.json(momentRecord.files.source.numbers),before=structuredClone(numbers),target=numbers.regions.find(r=>r.id===momentRecord.attribution.nativeRegion);assert.ok(target.inkCoverage.actual.some(n=>n>0));
    if(axis==='mass'){const q=target.rasterRectangles['1x'];target.inkMoments.actual[1].mass++;target.inkMoments.actual[1].x+=q.x;target.inkMoments.actual[1].y+=q.y;target.inkCoverage.actual[1]++;}
    else{target.inkMoments.actual[1][axis]++;const restore=structuredClone(numbers);restore.regions.find(r=>r.id===momentRecord.attribution.nativeRegion).inkMoments.actual[1][axis]--;assertNativeEqual(restore,before,'First-moment-only control changed other evidence.');}
    await forgery('fully rehashed '+axis+'-only RGB moment through independent decoding',[['pdf/'+momentRecord.files.source.numbers,encode(numbers)]],bad=>decodeNumbers(e,bad.pdf,momentRecord,'source'));
    controls.at(-1).structurallyAccepted=true;controls.at(-1).unchangedMassAndCoverage=axis!=='mass';controls.at(-1).axis=axis;
  }
  const p=b.pdf.focus.find(p=>p.viewId===momentRecord.view.id&&p.type==='source'&&p.regionId===momentRecord.attribution.nativeRegion);assert.ok(p);
  await forgery('fully rehashed focused crop through page binding',[['pdf/'+p.images.actual,b.pdf.read(p.images.reference)]],async bad=>{const expected=await paintArrowFaintFocus(renderer,p,bad.pdf.read);assert.ok(bad.pdf.read(p.images.actual).equals(Buffer.from(expected.actual,'base64')),'Substituted focus crop.');});
  const camera=b.pdf.json(records[0].files.source.numbers);camera.sourceFrame.x+=.25;
  await forgery('fully rehashed source camera through binding',[['pdf/'+records[0].files.source.numbers,encode(camera)]],async bad=>matchCapture(records[0],await captureArrowPublicPdfControl(renderer,e,b.input,records[0].view),bad.pdf.read));
  const inspection=b.json('agent-inspection.json');inspection.focus.pop();await forgery('fully rehashed lost agent focus',[['agent-inspection.json',encode(inspection)]]);
  const baselineSample=b.baseline.primary.find(r=>!b.baseline.read(r.files.images.actual).equals(b.baseline.read(r.files.images.reference)));assert.ok(baselineSample);
  await forgery('fully rehashed baseline PNG through SVG binding',[['baseline/'+baselineSample.files.images.actual,b.baseline.read(baselineSample.files.images.reference)]],bad=>verifyArrowPublicMeetPrimaryCapture(renderer,e,baselineSample,bad.baseline.read));
  const primarySample=b.primary.records.find(r=>r.view.kind==='defect'&&r.delta.rawChangedPixels>0);assert.ok(primarySample);
  await forgery('fully rehashed primary PNG through SVG binding',[['primary/'+primarySample.files.images.actual,b.primary.read(primarySample.files.images.reference)]],async bad=>{
    const capture=await captureArrowPublicPrimaryControl(renderer,e,b.input,primarySample.view);assert.ok(bad.primary.read(primarySample.files.images.actual).equals(Buffer.from(capture.images.actual,'base64')),'Substituted primary SVG raster.');
  });
  assert.equal(controls.length,40);assert.ok(controls.every(c=>c.passed));
  assertNativeEqual(await arrowCurrentTrialSources(e),sources,'Current checking sources changed.');await validate(b.report,b.manifestBytes,b.assets);
  phase='complete';await publish(true);
}catch(error){process.exitCode=2;await publish(false,error.message.slice(0,1000).replaceAll(root,'<repo>'));console.error(error.stack);}finally{await renderer?.browser.close();}
