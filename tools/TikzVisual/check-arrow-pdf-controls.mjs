import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Independently bind saved primary/PDF images and decode their pixel quantities.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {arrowCanonical,arrowMetrics} from './arrow-native-contract.mjs';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {loadArrowMeetImageCache} from './arrow-meet-image-cache.mjs';
import {loadArrowPublicPdfOwned,validateArrowPublicPdfBundle} from './arrow-public-pdf-reader.mjs';
import {captureArrowPublicPdfControl,arrowPublicPdfBaseline,arrowPublicPdfDelta,summarizeArrowPublicPdfControls} from './arrow-public-pdf-controls.mjs';
import {verifyArrowPublicPdfPrimary} from './arrow-public-pdf-primary-binding.mjs';
import {arrowViewportRegions} from './arrow-viewport-model.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {measureArrowPdfInk} from './arrow-pdf-ink.mjs';
import {checkArrowPaperPanels} from './arrow-pdf-panels.mjs';
import {paintArrowFaintFocus,checkArrowFaintFocus} from './arrow-faint-panels.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

assert.equal(process.argv.length,3);
const out=await outputPath(path.join(root,'artifacts/arrow-public-pdf-checks/run-'+randomUUID())),records=[],controls=[],ownSources={};
let renderer,phase='owned-input',inputReportSha256,primary,summary,measurements=0,moments=0,fullPages=0,images=0,deltas=0,panels=0,focusPanels=0;
async function publish(completed,error){
  const bytes=Buffer.from(JSON.stringify({schemaVersion:1,completed,phase,comparisonKind:'independent-public-arrow-PDF-control-check',inputReport:process.argv[2],inputReportSha256,
    converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',renderer:renderer?.identity,ownSources,primary,
    views:records.length,measurements,moments,fullPages,images,deltas,panels,focusPanels,summary,controls,...(error?{error}:{})},null,2)+'\n');
  await writeArtifact(out,'report.json',bytes);console.log(JSON.stringify({completed,phase,report:path.relative(root,path.join(out,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes),views:records.length}));
}
async function reject(name,action){let rejection;await assert.rejects(action,error=>{assert.ok(error instanceof assert.AssertionError);rejection=error.message.slice(0,500);return true;});controls.push({name,passed:true,rejection});}
function matchCapture(record,capture,read){
  const{source,scene,...meta}=record;assertNativeEqual({...capture.record,sourceDelta:record.sourceDelta,sceneDelta:record.sceneDelta},meta,'Changed public PDF metadata: '+record.view.id);
  assert.ok(read(record.files.pdf).equals(capture.pdf));
  for(const type of ['source','scene']){
    const c=capture.captures[type],files=record.files[type];assert.equal(read(files.svg).toString(),c.svg,'Changed public PDF SVG: '+record.view.id+'/'+type);
    assertNativeEqual(JSON.parse(read(files.numbers)),c.numbers,'Changed public PDF quantities: '+record.view.id+'/'+type);
    for(const[name,image]of Object.entries(c.images))assert.ok(read(files.images[name]).equals(Buffer.from(image,'base64')),'Public PDF SVG/image binding: '+record.view.id+'/'+type+'/'+name);
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
  const codeName='tools/TikzVisual/check-arrow-pdf-controls.mjs',code=arrowCanonical(await readFile(path.join(root,codeName)));ownSources[codeName]=sha256(code);await writeArtifact(out,'source-captures/'+codeName,code);
  const e=await loadArrowMeetImageCache(),b=await loadArrowPublicPdfOwned(process.argv[2],e);inputReportSha256=b.inputReportSha256;
  renderer=await createRenderer();requireRenderer(renderer.identity, b.report.renderer);await installShapeMetrics(renderer);
  phase='bound-primary';primary=await verifyArrowPublicPdfPrimary(renderer,e,b.input.primary,view=>{phase='primary/'+view.id;if(view.scale===4&&view.background==='black')console.log('Bound public primary checked: '+view.id);});
  for(const record of b.records){
    phase=record.view.id;const capture=await captureArrowPublicPdfControl(renderer,e,b.input.input,record.view);matchCapture(record,capture,b.read);
    for(const type of ['source','scene']){
      const count=await decodeNumbers(e,b,record,type);measurements+=count;moments+=count;fullPages++;
      images+=Object.keys(capture.captures[type].images).length;
      const frame=capture.frame,regions=type==='source'?frame.paper.regions:arrowViewportRegions(frame),n=record[type];
      panels+=await checkArrowPaperPanels(renderer,{...n,images:record.files[type].images,pdfPage:record.files.pdf,crops:[]},b.read,regions);
      if(!['calibration','visibility-calibration'].includes(record.view.kind)){
        const baseline=arrowPublicPdfBaseline(records,record.view);assert.ok(baseline);
        assertNativeEqual(record[type+'Delta'],await arrowPublicPdfDelta(renderer,record.view,n.pageSize,b.read(baseline.files[type].images['svg-page']),b.read(record.files[type].images['svg-page'])));deltas++;
      }
    }
    records.push(record);if(record.view.frame==='expanded'&&record.view.scale===4)console.log('Public PDF control checked: '+record.view.id);
  }
  phase='fixed-focus-crops';
  for(const p of b.focus){
    const expected=await paintArrowFaintFocus(renderer,p,b.read);for(const[name,image]of Object.entries(expected))assert.ok(b.read(p.images[name]).equals(Buffer.from(image,'base64')),'Public PDF crop/page binding: '+p.viewId+'/'+p.type+'/'+p.regionId+'/'+name);
    images+=Object.keys(expected).length;focusPanels+=await checkArrowFaintFocus(renderer,p,b.read);
  }
  summary=summarizeArrowPublicPdfControls(e,records).summary;assertNativeEqual(summary,b.report.summary);
  phase='corruption-controls';const validate=(report=b.report,mb=b.manifestBytes,assets=b.assets)=>validateArrowPublicPdfBundle(Buffer.from(JSON.stringify(report)+'\n'),mb,assets,e);
  const metadata=[['false complete',r=>r.completed=false],['false approval',r=>r.approvedImagePolicy=true],['false image claim',r=>r.imageConformanceClaim=true],['false admission',r=>r.imageAdmission='passed'],
    ['numeric defects falsely enabled',r=>r.numericGatesBypassedForMutations=false],['lost pending gate',r=>r.pendingGates.pop()],['changed renderer',r=>r.renderer.browser='different'],
    ['lost source guard',r=>delete r.sourceHashes[Object.keys(r.sourceHashes)[0]]],['changed primary qualification',r=>r.inputBindings.qualification.commit='0'.repeat(40)],
    ['false view count',r=>r.summary.views--],['unsafe manifest',r=>r.manifest.file='../manifest.json']];
  for(const[name,change]of metadata){const report=structuredClone(b.report);change(report);await reject(name,()=>validate(report));}
  for(const[name,change]of [['missing PDF page',a=>a.delete(records[0].files.pdf)],['changed scene PNG',a=>a.set(records[0].files.scene.images['svg-page'],Buffer.from('different'))],
    ['missing qualified primary checker',a=>a.delete('proofs/primary-reader.json')]]){const assets=new Map(b.assets);change(assets);await reject(name,()=>validate(b.report,b.manifestBytes,assets));}
  const rehash=changes=>{
    const assets=new Map(b.assets),manifest=structuredClone(b.manifest);for(const[file,bytes]of changes){assets.set(file,bytes);manifest.artifacts[file]=sha256(bytes);}
    const mb=Buffer.from(JSON.stringify(manifest,null,2)+'\n'),report=structuredClone(b.report);report.manifest.sha256=sha256(mb);return{report,mb,assets};
  };
  const rejectForgery=async(name,changes)=>{const f=rehash(changes);await reject(name,()=>validate(f.report,f.mb,f.assets));};
  const index=b.json('record-index.json');index.pop();await rejectForgery('fully rehashed lost PDF view',[['record-index.json',Buffer.from(JSON.stringify(index)+'\n')]]);
  const bindings=b.json('native-limit-bindings.json');bindings.pdfPolicies.pop();await rejectForgery('fully rehashed lost native PDF policy',[['native-limit-bindings.json',Buffer.from(JSON.stringify(bindings)+'\n')]]);
  const attributed=records.find(r=>r.attribution!==null),meta=b.json('views/'+attributed.view.id+'/record.json');meta.attribution.source.offset++;
  await rejectForgery('fully rehashed source attribution',[['views/'+attributed.view.id+'/record.json',Buffer.from(JSON.stringify(meta)+'\n')]]);
  const sample=records.find(r=>r.view.kind==='defect'&&r.sourceDelta.rawChangedPixels>0&&r.sceneDelta.rawChangedPixels>0);assert.ok(sample);
  const boundForgery=async(name,changes,check)=>{const f=rehash(changes),bad=await validate(f.report,f.mb,f.assets);await reject(name,()=>check(bad));};
  await boundForgery('fully rehashed source SVG through actual binding',[[sample.files.source.svg,Buffer.from('<svg/>')]],async bad=>matchCapture(sample,await captureArrowPublicPdfControl(renderer,e,b.input.input,sample.view),bad.read));
  for(const type of ['source','scene']){
    assert.ok(!b.read(sample.files[type].images['svg-page']).equals(b.read(sample.files.pdf)));
    await boundForgery('fully rehashed '+type+' PNG through actual SVG/image binding',[[sample.files[type].images['svg-page'],b.read(sample.files.pdf)]],async bad=>matchCapture(sample,await captureArrowPublicPdfControl(renderer,e,b.input.input,sample.view),bad.read));
  }
  const normalization=b.json('views/'+sample.view.id+'/record.json');normalization.normalization.sourceFrame.x+=.25;
  await boundForgery('fully rehashed normalization proof through actual binding',[['views/'+sample.view.id+'/record.json',Buffer.from(JSON.stringify(normalization)+'\n')]],async bad=>matchCapture(bad.records.find(r=>r.view.id===sample.view.id),await captureArrowPublicPdfControl(renderer,e,b.input.input,sample.view),bad.read));
  const momentRecord=records.find(r=>r.view.kind==='defect'&&r.view.name==='wrong-tip-fill'&&r.view.scale===1),numbers=b.json(momentRecord.files.source.numbers);
  const target=numbers.regions.find(r=>r.id===momentRecord.attribution.nativeRegion),q=target.rasterRectangles['1x'];assert.ok(target.inkCoverage.actual.some(n=>n>0));
  target.inkMoments.actual[1].mass++;target.inkMoments.actual[1].x+=q.x;target.inkMoments.actual[1].y+=q.y;target.inkCoverage.actual[1]++;
  await boundForgery('fully rehashed RGB moments through independent PNG decoding',[[momentRecord.files.source.numbers,Buffer.from(JSON.stringify(numbers)+'\n')]],bad=>decodeNumbers(e,bad,momentRecord,'source'));
  const p=b.focus.find(p=>p.viewId===momentRecord.view.id&&p.type==='source'&&p.regionId===momentRecord.attribution.nativeRegion);assert.ok(p);assert.ok(!b.read(p.images.actual).equals(b.read(p.images.reference)));
  await boundForgery('fully rehashed focused crop through actual page binding',[[p.images.actual,b.read(p.images.reference)]],async bad=>{const expected=await paintArrowFaintFocus(renderer,p,bad.read);assert.ok(bad.read(p.images.actual).equals(Buffer.from(expected.actual,'base64')),'Substituted public PDF focus crop.');});
  const camera=b.json(records[0].files.source.numbers);camera.sourceFrame.x+=.25;
  await boundForgery('fully rehashed source camera through actual binding',[[records[0].files.source.numbers,Buffer.from(JSON.stringify(camera)+'\n')]],async bad=>matchCapture(records[0],await captureArrowPublicPdfControl(renderer,e,b.input.input,records[0].view),bad.read));
  const innerFile='primary/'+b.input.primary.records.find(r=>r.view.kind==='defect'&&r.delta.rawChangedPixels>0).files.images.actual;
  const innerManifest=b.json('primary/manifest.json');innerManifest.artifacts[innerFile.slice('primary/'.length)]=sha256(b.read(sample.files.pdf));const innerMb=Buffer.from(JSON.stringify(innerManifest,null,2)+'\n');
  const innerReport=b.json('primary/report.json');innerReport.manifest.sha256=sha256(innerMb);
  await rejectForgery('fully rehashed primary bundle rejected by external qualification pins',[[innerFile,b.read(sample.files.pdf)],['primary/manifest.json',innerMb],['primary/report.json',Buffer.from(JSON.stringify(innerReport,null,2)+'\n')]]);
  assert.equal(controls.length,25);assert.ok(controls.every(c=>c.passed===true));
  assert.equal(sha256(arrowCanonical(await readFile(path.join(root,codeName)))),ownSources[codeName]);await loadArrowPublicPdfOwned(process.argv[2],e);
  phase='complete';await publish(true);
}catch(error){process.exitCode=2;await publish(false,error.message.slice(0,1000).replaceAll(root,'<repo>'));console.error(error.stack);}finally{await renderer?.browser.close();}
