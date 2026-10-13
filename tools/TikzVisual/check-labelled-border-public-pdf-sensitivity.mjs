import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Numeric gates are bypassed for mutations of freshly exported public SVGs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadLabelledBorderEvidence} from './labelled-border-evidence.mjs';
import {loadLabelledCombinedInputs,labelledCombinedInputs,captureLabelledCombinedSources,canonical,
  verifyLabelledSourceHashes} from './labelled-border-combined-common.mjs';
import {labelledPublicPdfEvidence,loadLabelledPublicPdfEvidence,validateLabelledPublicPdfSensitivity} from './labelled-border-public-pdf-coverage.mjs';
import {labelledPdfDefects,labelledPdfViewKey,labelledPdfExpectedOutcome} from './labelled-border-pdf-calibration-common.mjs';
import {mutateLabelledBorderSvg} from './labelled-border-image-defects.mjs';
import {shapePdfViews,evaluateShapePdfTrial} from './shape-pdf-trial-policy.mjs';
import {measureShapePdfPair} from './shape-pdf-image-pair.mjs';
import {saveLabelledPdfImages} from './labelled-border-pdf-viewport.mjs';
import {compareLabelledNativePages,evaluateLabelledPdfPageGuard,labelledPdfGuardExpectation} from './labelled-border-pdf-page-guard.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

const base=path.join(root,'artifacts/labelled-border-public-pdf-sensitivity'),output=path.join(base,'run-'+randomUUID());
const artifacts={},controls=[];let toolHashes={},phase='source-capture';
const save=(p,b)=>writeArtifact(output,p,b,artifacts),read=p=>readFile(path.join(output,p));
async function publish(r){
  const b=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(output,'report.json',b);
  await writeArtifact(base,'latest.json',JSON.stringify({completed:r.completed,
    report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');
}
async function freshBaseline(){
  let size=0;const buffers=[];
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['tools/TikzVisual/trial-labelled-border-combined.mjs'],{cwd:root,windowsHide:true,shell:false});
    let settled=false;const finish=e=>{if(settled)return;settled=true;clearTimeout(timer);if(e){child.kill();reject(e);}else resolve();};
    const timer=setTimeout(()=>finish(Error('Fresh combined baseline timed out.')),600000);
    const capture=b=>{size+=b.length;if(size>1000000)finish(Error('Fresh combined baseline output bound.'));else buffers.push(b);};
    child.stdout.on('data',capture);child.stderr.on('data',capture);child.on('error',finish);
    child.on('close',code=>finish(code===0?null:Error('Fresh combined baseline failed: '+code)));
  });
  const log=Buffer.concat(buffers).toString('utf8');await save('baseline-command.log',log.replaceAll(root,'<repo>'));
  const markers=log.split(/\r?\n/).filter(s=>s.startsWith('{')).map(s=>JSON.parse(s))
    .filter(q=>q.kind==='labelled-border-combined-trial-output');
  assert.equal(markers.length,1);const marker=markers[0];assert.equal(marker.completed,true);assert.equal(marker.trialPassed,true);
  assert.match(marker.report,/^artifacts\/labelled-border-combined-trial\/run-[a-f0-9-]+\/report.json$/);
  const bytes=await readFile(path.join(root,marker.report));assert.equal(sha256(bytes),marker.sha256);
  const report=JSON.parse(bytes),folder=path.dirname(path.join(root,marker.report));
  await save('baseline/report.json',bytes);
  for(const[p,h]of Object.entries(report.artifacts)){
    const b=await readFile(await outputPath(folder,p));assert.equal(sha256(b),h,p);await save('baseline/'+p,b);
  }
  await verifyLabelledSourceHashes(report.toolHashes);return {report,marker};
}
try{
  toolHashes=await captureLabelledCombinedSources(save,'check-labelled-border-public-pdf-sensitivity.mjs');
  for(const file of ['labelled-border-public-pdf-coverage.mjs','labelled-border-pdf-page-guard-coverage.mjs']){
    const p='tools/TikzVisual/'+file,b=canonical(await readFile(path.join(root,p)));toolHashes[p]=sha256(b);await save('tool-sources/'+p,b);
  }
  await publish({completed:false,phase,converterInvoked:true,approvedImagePolicy:false,imageConformanceClaim:false,toolHashes,artifacts});
  assert.equal(process.argv.length,2);
  phase='independent-inputs';const evidence=await loadLabelledBorderEvidence(),inputs=await loadLabelledCombinedInputs();
  const independent=await loadLabelledPublicPdfEvidence(inputs);
  for(const key of ['source','guard'])await save('independent/'+key+'-report.json',independent[key].bytes);
  phase='fresh-combined-baseline';const {report:baseline,marker}=await freshBaseline();
  const numeric=JSON.parse(await read('baseline/candidate/report.json'));
  await verifyLabelledSourceHashes({...numeric.converterSources,...numeric.toolHashes});
  const renderer=await createRenderer();
  try{
    requireRenderer(renderer.identity, baseline.renderer);await installShapeMetrics(renderer);
    for(const d of labelledPdfDefects()){
      phase=d.caseId+'/'+d.name;const c=inputs.pdf.report.cases.find(c=>c.caseId===d.caseId);
      const b=baseline.cases.find(c=>c.caseId===d.caseId),source=(await read('baseline/'+b.svg)).toString('utf8');
      const changed=await renderer.page.evaluate(mutateLabelledBorderSvg,{source,defect:d,publicCandidate:true,rootBox:c.ink.root});
      const svg=d.caseId+'/'+d.name+'.svg';await save(svg,changed);const views=[];
      for(const view of shapePdfViews.filter(v=>!d.naturalOnly||v.frame==='natural')){
        const page=await read('baseline/calibration/pdf/'+c.pdfPages[view.scale]);
        const m=await measureShapePdfPair(renderer,{svg:changed,units:'cssPixels',svgOriginBp:{x:0,y:0},camera:c.camera,
          regions:c.regions,...view,pdfPage:'data:image/png;base64,'+page.toString('base64'),cropRegionIds:d.target?[d.target]:[],
          cropLimit:d.target?1:0,rightLabel:'Public '+d.name});
        const row=await saveLabelledPdfImages(save,phase+'/'+labelledPdfViewKey(view),m);
        const evaluation=evaluateShapePdfTrial(c.policies.native,view,m);
        const anchor=c.observations.find(o=>o.mode==='native-ink'&&labelledPdfViewKey(o)===labelledPdfViewKey(view));
        const referencePage='baseline/calibration/pdf/'+anchor.artifacts['svg-page'];
        const crop=view.scale===1&&['paths/faint-glyph-loss','transforms/faint-period-loss'].includes(phase)?d.target:null;
        const native=await compareLabelledNativePages(renderer,{reference:'data:image/png;base64,'+(await read(referencePage)).toString('base64'),
          actual:'data:image/png;base64,'+m.images['svg-page'],pageSize:c.camera.rasterSizes[view.scale+'x'],regions:c.regions,
          scale:view.scale,cropId:crop});
        const guarded=evaluateLabelledPdfPageGuard(native,evaluation),target=guarded.checks.find(q=>q.id===(d.target??'whole-picture'));
        assert.ok(target);let sheet=null;
        if(native.images){sheet=phase+'/'+labelledPdfViewKey(view)+'-native-sheet.png';await save(sheet,Buffer.from(native.images.sheet,'base64'));}
        const exact=native.fullPage.exactRgbaMatch,outcome=labelledPdfGuardExpectation(d,view);
        const passed=outcome==='pixel-identical'?guarded.passed&&exact:!guarded.passed&&!target.passed&&!exact;
        const pdfTarget=evaluation.checks.find(q=>q.id===(d.target??'whole-picture'));
        const pdfOnlyExpectedOutcomePassed=labelledPdfExpectedOutcome(d,view)==='pixel-identical'?evaluation.passed&&exact
          :!evaluation.passed&&!pdfTarget.passed&&!exact;
        views.push({...row,evaluation,guard:{measurement:{...native,images:undefined},evaluation:guarded,
          referencePage,actualPage:row.artifacts['svg-page'],sheet},targetRejected:!target.passed,exactBaselinePixels:exact,
          expectedImageOutcome:outcome,expectedOutcomePassed:passed,pdfOnlyExpectedOutcomePassed});
      }
      controls.push({...d,svg,targetSource:b.sources.find(q=>q.regionId===d.target)??null,numericGatesBypassed:true,
        passed:views.every(o=>o.expectedOutcomePassed),pdfOnlyPassed:views.every(o=>o.pdfOnlyExpectedOutcomePassed),views});
      console.log(phase+': '+(controls.at(-1).passed?'expected public image outcome':'UNEXPECTED public image outcome retained'));
    }
    await verifyLabelledSourceHashes({...toolHashes,...numeric.converterSources,...numeric.toolHashes});
    for(const[p,h]of Object.entries(artifacts))assert.equal(sha256(await read(p)),h,p);
    assert.equal((await loadLabelledBorderEvidence()).snapshotSha256,evidence.snapshotSha256);
    const html='<!doctype html><meta charset="utf-8"><h1>Fresh public labeled-border PDF sensitivity</h1>'
      +'<p>Numeric gates bypassed for mutations. Fixed independent PDF/native-page conjunction; no admission.</p><a href="report.json">Report</a> / <a href="baseline/index.html">Fresh six-gate baseline</a>'
      +controls.map(c=>'<h2>'+c.caseId+'/'+c.name+' / '+(c.passed?'expected':'UNEXPECTED')+'</h2>'
        +c.views.filter(o=>o.scale===1).map(o=>'<h3>'+o.frame+'</h3><img src="'+o.artifacts.sheet+'">'
          +o.regions.filter(q=>q.crops).map(q=>'<img src="'+q.crops.sheet+'">').join('')
          +(o.guard.sheet?'<img src="'+o.guard.sheet+'">':'')).join('')).join('');
    await save('index.html',html);
    const sensitivityPassed=controls.every(c=>c.passed),report={schemaVersion:1,comparisonKind:'public-labelled-border-pdf-image-sensitivity',
      completed:true,converterInvoked:true,numericGatesBypassed:true,approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',
      sensitivityPassed,pdfOnlySensitivityPassed:controls.every(c=>c.pdfOnlyPassed),snapshotSha256:evidence.snapshotSha256,
      inputs:labelledCombinedInputs,independentInputs:labelledPublicPdfEvidence,renderer:renderer.identity,toolHashes,
      baseline:{report:'baseline/report.json',sha256:marker.sha256,sourceFile:marker.report,completed:true,trialPassed:true},controls,
      coverage:{baselineCases:3,baselineGates:18,controls:32,views:126,localObservations:6606,visibleRejections:114,
        exactVisibilityControls:12,pdfOnlyBlindSpotViews:4,independentControlPixelMatches:126},
      agent:{viewer:'index.html',command:'node tools/TikzVisual/check-labelled-border-public-pdf-sensitivity.mjs',
        firstUnexpectedControl:controls.find(c=>!c.passed)?controls.find(c=>!c.passed).caseId+'/'+controls.find(c=>!c.passed).name:null},artifacts};
    validateLabelledPublicPdfSensitivity(report,inputs,independent,baseline,numeric);await publish(report);
    process.exitCode=sensitivityPassed?0:1;
  }finally{await renderer.browser.close();}
}catch(error){
  process.exitCode=2;console.error(error.stack);await publish({completed:false,phase,converterInvoked:true,
    approvedImagePolicy:false,imageConformanceClaim:false,error:error.message.replaceAll(root,'<repo>'),toolHashes,artifacts,
    controls,completedControls:controls.map(c=>({caseId:c.caseId,name:c.name,passed:c.passed}))});
}
