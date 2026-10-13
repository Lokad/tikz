import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Independent PNG decoding and corruption controls for fresh public defects.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadLabelledCombinedInputs,captureLabelledCombinedSources,verifyLabelledSourceHashes,canonical} from './labelled-border-combined-common.mjs';
import {loadLabelledPublicPdfEvidence,validateLabelledPublicPdfSensitivity} from './labelled-border-public-pdf-coverage.mjs';
import {shapePdfMetricRecord} from './shape-pdf-trial-policy.mjs';
import {labelledPdfViewKey} from './labelled-border-pdf-calibration-common.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

const base=path.join(root,'artifacts/labelled-border-public-pdf-controls'),output=path.join(base,'run-'+randomUUID());
const artifacts={},controls=[];let toolHashes={};
const save=(p,b)=>writeArtifact(output,p,b,artifacts);
async function publish(r){
  const bytes=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(output,'report.json',bytes);
  await writeArtifact(base,'latest.json',JSON.stringify({completed:r.completed,
    report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)},null,2)+'\n');
}
function reject(name,action){
  let error;try{action();}catch(e){error=e.message;}assert.ok(error,'Accepted control: '+name);
  controls.push({name,expected:'reject',passed:true,error});
}
try{
  toolHashes=await captureLabelledCombinedSources(save,'labelled-border-public-pdf-self-test.mjs');
  for(const file of ['labelled-border-public-pdf-coverage.mjs','labelled-border-pdf-page-guard-coverage.mjs']){
    const p='tools/TikzVisual/'+file,b=canonical(await readFile(path.join(root,p)));toolHashes[p]=sha256(b);await save('tool-sources/'+p,b);
  }
  await publish({completed:false,passed:false,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,toolHashes,artifacts});
  assert.equal(process.argv.length,2);const inputs=await loadLabelledCombinedInputs(),independent=await loadLabelledPublicPdfEvidence(inputs);
  const folder=path.join(root,'artifacts/labelled-border-public-pdf-sensitivity');
  const pointer=JSON.parse(await readFile(path.join(folder,'latest.json')));
  assert.equal(pointer.completed,true);assert.match(pointer.report,/^run-[a-f0-9-]+\/report.json$/);
  const input=path.dirname(path.join(folder,pointer.report)),bytes=await readFile(path.join(input,'report.json'));
  assert.equal(sha256(bytes),pointer.sha256);const r=JSON.parse(bytes),read=async p=>readFile(await outputPath(input,p));
  for(const[p,h]of Object.entries(r.artifacts))assert.equal(sha256(await read(p)),h,p);
  await verifyLabelledSourceHashes(r.toolHashes);
  const baseline=JSON.parse(await read('baseline/report.json')),numeric=JSON.parse(await read('baseline/candidate/report.json'));
  await verifyLabelledSourceHashes({...baseline.toolHashes,...numeric.converterSources,...numeric.toolHashes});
  const coverage=validateLabelledPublicPdfSensitivity(r,inputs,independent,baseline,numeric);
  assert.equal(r.sensitivityPassed,true);await save('input-report.json',bytes);
  const renderer=await createRenderer();let metricsRecomputed=0,pagesRecomputed=0;
  try{
    requireRenderer(renderer.identity, r.renderer);await installShapeMetrics(renderer);
    async function measure(images,size,rectangles,scale,scanPage){
      return renderer.page.evaluate(async({images,size,rectangles,scale,scanPage})=>{
        const buffers=[];
        for(const src of images){
          const image=new Image();image.src=src;await image.decode();
          if(image.width!==size.width||image.height!==size.height)throw Error('Changed public defect PNG dimensions.');
          const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
          const ctx=canvas.getContext('2d',{colorSpace:'srgb',willReadFrequently:true});ctx.drawImage(image,0,0);
          buffers.push(ctx.getImageData(0,0,size.width,size.height).data);
        }
        const metrics=rectangles.map(rectangle=>globalThis.shapeRasterMetrics.compare(...buffers,
          {...size,scale,background:'white',maskThreshold:16,rectangle}));
        let fullPage=null;
        if(scanPage){
          let rawChangedPixels=0,maxRawChannelError=0;
          for(let i=0;i<buffers[0].length;i+=4){
            let maximum=0;for(let channel=0;channel<4;channel++)maximum=Math.max(maximum,Math.abs(buffers[0][i+channel]-buffers[1][i+channel]));
            rawChangedPixels+=maximum!==0;maxRawChannelError=Math.max(maxRawChannelError,maximum);
          }
          fullPage={exactRgbaMatch:rawChangedPixels===0,rawChangedPixels,maxRawChannelError};
        }
        return {metrics,fullPage};
      },{images:images.map(b=>'data:image/png;base64,'+b.toString('base64')),size,rectangles,scale,scanPage});
    }
    async function pdfPair(o,prefix=''){
      const whole=o.whole.rasterRectangles[o.scale+'x'],size={width:whole.width,height:whole.height};
      const rectangles=[undefined,...o.regions.map(q=>{
        const b=q.rasterRectangles[o.scale+'x'];return {x:b.x-whole.x,y:b.y-whole.y,width:b.width,height:b.height};
      })];
      const m=await measure(await Promise.all(['pdf','svg'].map(k=>read(prefix+o.artifacts[k]))),size,rectangles,o.scale,false);
      for(let k=0;k<m.metrics.length;k++)assert.deepEqual(m.metrics[k],shapePdfMetricRecord(k===0?o.whole:o.regions[k-1]));
      metricsRecomputed+=m.metrics.length;
    }
    async function nativePair(pdf,o){
      const m=await measure(await Promise.all([o.referencePage,o.actualPage].map(read)),pdf.camera.rasterSizes[o.scale+'x'],
        pdf.regions.map(q=>q.rasterRectangles[o.scale+'x']),o.scale,true);
      assert.deepEqual(m.fullPage,o.measurement.fullPage);const rows=[o.measurement.whole,...o.measurement.regions];
      for(let k=0;k<rows.length;k++)assert.deepEqual(m.metrics[k],shapePdfMetricRecord(rows[k]));
      assert.equal(o.measurement.outsideWholeChangedPixels,m.fullPage.rawChangedPixels-m.metrics[0].rawChangedPixels);
      metricsRecomputed+=m.metrics.length;pagesRecomputed++;
    }
    for(const c of baseline.cases){
      const pdf=inputs.pdf.report.cases.find(p=>p.caseId===c.caseId);
      for(const o of c.candidatePdf)await pdfPair(o,'baseline/');
      for(const o of c.nativePage)await nativePair(pdf,{...o,referencePage:'baseline/'+o.referencePage,actualPage:'baseline/'+o.actualPage});
    }
    for(const c of r.controls){
      const pdf=inputs.pdf.report.cases.find(p=>p.caseId===c.caseId);
      for(const o of c.views){await pdfPair(o);await nativePair(pdf,{...o.guard,scale:o.scale});}
      console.log(c.caseId+'/'+c.name+': public ordinary-PDF and native-page PNG metrics checked.');
    }
  }finally{await renderer.browser.close();}
  assert.deepEqual([metricsRecomputed,pagesRecomputed],[14784,138]);
  controls.push({name:'Every public baseline/control PDF/native whole/local metric and full page remeasured',expected:'pass',passed:true,
    metricsRecomputed,pagesRecomputed,independentControlPixelMatches:126});
  const mutations={unfinished:q=>q.completed=false,converter:q=>q.converterInvoked=false,bypass:q=>q.numericGatesBypassed=false,
    approval:q=>q.approvedImagePolicy=true,claim:q=>q.imageConformanceClaim=true,verdict:q=>q.overallVerdict='passed',
    input:q=>q.inputs.pdf.sha256='0'.repeat(64),independent:q=>q.independentInputs.guard.sha256='0'.repeat(64),
    snapshot:q=>q.snapshotSha256='0'.repeat(64),renderer:q=>q.renderer.changed=true,control:q=>q.controls.pop(),
    duplicate:q=>q.controls[1]=q.controls[0],view:q=>q.controls[0].views.pop(),duplicateView:q=>q.controls[0].views[1]=q.controls[0].views[0],
    defect:q=>q.controls[0].kind='other',controlBypass:q=>q.controls[0].numericGatesBypassed=false,
    target:q=>q.controls[0].target='glyph-0',source:q=>q.controls[0].targetSource.source.offset++,
    baseline:q=>q.baseline.completed=false,baselineHash:q=>q.baseline.sha256='0'.repeat(64),
    baselinePath:q=>q.baseline.sourceFile='artifacts/old/report.json',missingBaselineArtifact:q=>delete q.artifacts['baseline/'+baseline.cases[0].svg],
    pixelPattern:q=>q.artifacts[q.controls[0].views[0].artifacts['svg-page']]='0'.repeat(64),
    pdfSummary:q=>q.controls[0].views[0].evaluation.passed=true,pdfOrigin:q=>q.controls[0].views[0].pageSize.width++,
    pdfMetric:q=>q.controls[0].views[0].whole.rawChangedPixels++,nativeMetric:q=>q.controls[0].views[0].guard.measurement.fullPage.rawChangedPixels++,
    nativeLimit:q=>q.controls[0].views[0].guard.evaluation.fullPageLimit=1,nativeSummary:q=>q.controls[0].views[0].guard.evaluation.passed=true,
    nativeReference:q=>q.controls[0].views[0].guard.referencePage=q.controls[0].views[0].guard.actualPage,
    exact:q=>q.controls[0].views[0].exactBaselinePixels=true,targetRejected:q=>q.controls[0].views[0].targetRejected=false,
    expectedOutcome:q=>q.controls[0].views[0].expectedImageOutcome='pixel-identical',outcomeSummary:q=>q.controls[0].views[0].expectedOutcomePassed=false,
    pdfOnlySummary:q=>q.pdfOnlySensitivityPassed=true,pdfOnlyControl:q=>q.controls.find(c=>c.name==='faint-glyph-loss').pdfOnlyPassed=true,
    sensitivity:q=>q.sensitivityPassed=false,controlSummary:q=>q.controls[0].passed=false,
    bevel1x:q=>q.controls.find(c=>c.name==='changed-corner-join').views[0].expectedImageOutcome='target-rejection',
    bevel4x:q=>q.controls.find(c=>c.name==='changed-corner-join').views[1].expectedImageOutcome='pixel-identical',
    faint1x:q=>q.controls.find(c=>c.caseId==='transforms'&&c.name==='faint-period-loss').views[0].expectedImageOutcome='pixel-identical',
    crop:q=>q.controls[0].views[0].regions.find(q=>q.crops).crops=null,
    cropLattice:q=>q.controls[0].views[0].regions.find(q=>q.crops).crops.presentation.rasterRectangle.x++,
    missingSheet:q=>q.controls.find(c=>c.caseId==='paths'&&c.name==='faint-glyph-loss').views[0].guard.sheet=null,
    artifact:q=>delete q.artifacts[q.agent.viewer],outside:q=>q.agent.viewer='../outside',
    command:q=>q.agent.command='wrong',agent:q=>q.agent.firstUnexpectedControl='undefined/undefined',coverage:q=>q.coverage.views--,
    tool:q=>q.toolHashes['tools/TikzVisual/labelled-border-public-pdf-coverage.mjs']='0'.repeat(64)
  };
  for(const[name,change]of Object.entries(mutations))reject('coverage/'+name,()=>{
    const q=structuredClone(r);change(q);validateLabelledPublicPdfSensitivity(q,inputs,independent,baseline,numeric);
  });
  const wire=structuredClone(r);wire.controls[0].views[0].guard.measurement.images=undefined;
  validateLabelledPublicPdfSensitivity(wire,inputs,independent,baseline,numeric);
  controls.push({name:'Omitted images field has the same JSON wire representation',expected:'pass',passed:true});
  const wrongBaseline=structuredClone(baseline);wrongBaseline.cases[0].combined.gates.numeric.state='failed';
  reject('A fresh baseline with failed numeric evidence cannot qualify image-only controls',()=>
    validateLabelledPublicPdfSensitivity(r,inputs,independent,wrongBaseline,numeric));
  const allowed={...inputs,pdf:{...inputs.pdf,report:structuredClone(inputs.pdf.report)}};
  allowed.pdf.report.cases[0].policies.native.rows[0].regions[0].limits.maxRawChannelError++;
  reject('Image-only controls cannot inflate the independent PDF allowance',()=>
    validateLabelledPublicPdfSensitivity(r,allowed,independent,baseline,numeric));
  await verifyLabelledSourceHashes({...toolHashes,...numeric.converterSources,...numeric.toolHashes});
  await publish({schemaVersion:1,completed:true,passed:true,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
    overallVerdict:'pending',inputReportSha256:pointer.sha256,baselineSha256:r.baseline.sha256,metricsRecomputed,pagesRecomputed,
    coverage,controls,toolHashes,artifacts});
  console.log('Public PDF sensitivity: '+controls.length+' controls, '+metricsRecomputed+' metrics and '+pagesRecomputed+' full pages.');
}catch(error){
  process.exitCode=2;console.error(error.stack);await publish({completed:false,passed:false,converterInvoked:false,
    approvedImagePolicy:false,imageConformanceClaim:false,error:error.message.replaceAll(root,'<repo>'),controls,toolHashes,artifacts});
}
