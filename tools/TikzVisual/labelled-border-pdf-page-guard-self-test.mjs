import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Remeasure retained PNGs independently of the guard producer and test coverage.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadLabelledPdfQualification,labelledPdfViewKey} from './labelled-border-pdf-calibration-common.mjs';
import {validateLabelledPdfCalibration} from './labelled-border-pdf-calibration-coverage.mjs';
import {labelledPdfFailedTrial,validateLabelledPdfPageGuard} from './labelled-border-pdf-page-guard-coverage.mjs';
import {evaluateLabelledPdfPageGuard,labelledPdfGuardExpectation} from './labelled-border-pdf-page-guard.mjs';
import {shapePdfMetricRecord} from './shape-pdf-trial-policy.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

const base=path.join(root,'artifacts/labelled-border-pdf-page-guard-controls');
const output=path.join(base,'run-'+randomUUID()),artifacts={},toolHashes={},controls=[];
const save=(p,b)=>writeArtifact(output,p,b,artifacts);
function reject(name,action){
  let error;try{action();}catch(e){error=e.message;}
  assert.ok(error,'Accepted control: '+name);
  controls.push({name,expected:'reject',passed:true,error});
}
async function hashBundle(r,folder){
  for(const[p,h]of Object.entries(r.artifacts))assert.equal(sha256(await readFile(await outputPath(folder,p))),h,p);
  for(const[p,h]of Object.entries(r.toolHashes))
    assert.equal(sha256(Buffer.from((await readFile(path.join(root,p),'utf8')).replaceAll('\r\n','\n'))),h,p);
}

try{
  for(const file of ['labelled-border-pdf-page-guard-self-test.mjs','labelled-border-pdf-page-guard-coverage.mjs',
    'labelled-border-pdf-page-guard.mjs','shape-raster-metrics.mjs','shape-pdf-trial-policy.mjs',
    'labelled-border-pdf-calibration-common.mjs','labelled-border-pdf-calibration-coverage.mjs',
    'shape-oracle-bundle.mjs','compare.mjs','shape-image-pair.mjs','browser-profile.json','package-lock.json']){
    const p='tools/TikzVisual/'+file,b=Buffer.from((await readFile(path.join(root,p),'utf8')).replaceAll('\r\n','\n'));
    toolHashes[p]=sha256(b);await save('tool-sources/'+p,b);
  }
  assert.equal(process.argv.length,2);
  const folder=path.join(root,'artifacts/labelled-border-pdf-page-guard');
  const pointer=JSON.parse(await readFile(path.join(folder,'latest.json')));
  assert.equal(pointer.completed,true);assert.match(pointer.report,/^run-[a-f0-9-]+\/report.json$/);
  const input=path.dirname(path.join(folder,pointer.report)),bytes=await readFile(path.join(input,'report.json'));
  assert.equal(sha256(bytes),pointer.sha256);
  const r=JSON.parse(bytes);await hashBundle(r,input);
  const sourceBytes=await readFile(await outputPath(input,'pdf-only-report.json'));
  assert.equal(sha256(sourceBytes),labelledPdfFailedTrial.sha256);
  const source=JSON.parse(sourceBytes),sourceFolder=path.dirname(path.join(root,labelledPdfFailedTrial.file));
  assert.equal(sha256(await readFile(path.join(root,labelledPdfFailedTrial.file))),labelledPdfFailedTrial.sha256);
  await hashBundle(source,sourceFolder);
  const calBytes=await readFile(await outputPath(input,'calibration-report.json'));
  assert.equal(sha256(calBytes),labelledPdfFailedTrial.calibrationSha256);
  const calibration=JSON.parse(calBytes),qualification=await loadLabelledPdfQualification();
  validateLabelledPdfCalibration(calibration,qualification.report);
  const coverage=validateLabelledPdfPageGuard(r,source,calibration);assert.equal(r.guardPassed,true);
  await save('input-report.json',bytes);
  const read=p=>readFile(outputPathSync(p));
  function outputPathSync(p){assert.ok(!path.isAbsolute(p)&&!p.includes('\\')&&!p.includes(':')
    &&!p.split('/').some(s=>['..','.',''].includes(s)));return path.join(sourceFolder,p);}
  const renderer=await createRenderer();let pagesRecomputed=0,metricsRecomputed=0;
  try{
    requireRenderer(renderer.identity, r.renderer);await installShapeMetrics(renderer);
    async function measure(c,o){
      const anchor=c.observations.find(v=>v.mode==='native-ink'&&labelledPdfViewKey(v)===labelledPdfViewKey(o));
      assert.ok(anchor);
      const reference=await read('calibration/'+anchor.artifacts['svg-page']),actual=await read(o.artifacts['svg-page']);
      return renderer.page.evaluate(async({images,pageSize,regions,scale})=>{
        const buffers=[];
        for(const src of images){
          const image=new Image();image.src=src;await image.decode();
          if(image.width!==pageSize.width||image.height!==pageSize.height)throw Error('Changed guard PNG dimensions.');
          const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
          const ctx=canvas.getContext('2d',{colorSpace:'srgb',willReadFrequently:true});ctx.drawImage(image,0,0);
          buffers.push(ctx.getImageData(0,0,image.width,image.height).data);
        }
        // Independent channel loop; the producer uses Uint32 pixel comparisons.
        let rawChangedPixels=0,maxRawChannelError=0;
        for(let i=0;i<buffers[0].length;i+=4){
          let error=0;for(let k=0;k<4;k++)error=Math.max(error,Math.abs(buffers[0][i+k]-buffers[1][i+k]));
          rawChangedPixels+=error!==0;maxRawChannelError=Math.max(maxRawChannelError,error);
        }
        // Decode/crop the whole window first; local coordinates are relative to it.
        const whole=regions[0].rasterRectangles[scale+'x'],crops=buffers.map(buffer=>{
          const crop=new Uint8ClampedArray(whole.width*whole.height*4);
          for(let y=0;y<whole.height;y++)crop.set(buffer.subarray(
            4*((whole.y+y)*pageSize.width+whole.x),4*((whole.y+y)*pageSize.width+whole.x+whole.width)),y*whole.width*4);
          return crop;
        });
        const metrics=regions.map(q=>{
          const box=q.rasterRectangles[scale+'x'];
          return globalThis.shapeRasterMetrics.compare(...crops,{width:whole.width,height:whole.height,
            scale,background:'white',maskThreshold:16,rectangle:{x:box.x-whole.x,y:box.y-whole.y,width:box.width,height:box.height}});
        });
        return {fullPage:{exactRgbaMatch:rawChangedPixels===0,rawChangedPixels,maxRawChannelError},
          outsideWholeChangedPixels:rawChangedPixels-metrics[0].rawChangedPixels,metrics};
      },{images:[reference,actual].map(b=>'data:image/png;base64,'+b.toString('base64')),
        pageSize:c.camera.rasterSizes[o.scale+'x'],regions:c.regions,scale:o.scale});
    }
    for(const b of source.baselines){
      const c=calibration.cases.find(c=>c.caseId===b.caseId);
      for(const o of b.views){
        const m=await measure(c,o);assert.deepEqual(m.fullPage,{exactRgbaMatch:true,rawChangedPixels:0,maxRawChannelError:0});
        assert.equal(m.outsideWholeChangedPixels,0);assert.ok(m.metrics.every(q=>q.exactRgbaMatch));
        pagesRecomputed++;metricsRecomputed+=m.metrics.length;
      }
    }
    for(let i=0;i<r.controls.length;i++){
      const control=r.controls[i],c=calibration.cases.find(c=>c.caseId===control.caseId);
      for(let j=0;j<control.views.length;j++){
        const o=control.views[j],m=await measure(c,source.controls[i].views[j]);
        assert.deepEqual(m.fullPage,o.measurement.fullPage);
        assert.equal(m.outsideWholeChangedPixels,o.measurement.outsideWholeChangedPixels);
        const rows=[o.measurement.whole,...o.measurement.regions];
        for(let k=0;k<rows.length;k++)assert.deepEqual(m.metrics[k],shapePdfMetricRecord(rows[k]));
        pagesRecomputed++;metricsRecomputed+=m.metrics.length;
      }
      console.log(control.caseId+'/'+control.name+': native PNG metrics independently checked.');
    }
    assert.equal(pagesRecomputed,138);assert.equal(metricsRecomputed,coverage.measurements+660);
    controls.push({name:'Independent full-page channel loop and whole/local PNG remeasurement',expected:'pass',
      passed:true,pagesRecomputed,metricsRecomputed});
  }finally{await renderer.browser.close();}

  const mutations={
    unfinished:q=>q.completed=false,converter:q=>q.converterInvoked=true,policy:q=>q.approvedImagePolicy=true,
    claim:q=>q.imageConformanceClaim=true,verdict:q=>q.overallVerdict='passed',snapshot:q=>q.snapshotSha256='0'.repeat(64),
    source:q=>q.sourceFile='artifacts/other/report.json',sourceHash:q=>q.sourceSha256='0'.repeat(64),
    calibrationHash:q=>q.calibrationSha256='0'.repeat(64),renderer:q=>q.renderer.chromiumVersion='wrong',
    missingControl:q=>q.controls.pop(),duplicateControl:q=>q.controls[1]=q.controls[0],
    missingView:q=>q.controls[0].views.pop(),duplicateView:q=>q.controls[0].views[1]=q.controls[0].views[0],
    target:q=>q.controls[0].target='glyph-0',numericBypass:q=>q.controls[0].numericGatesBypassed=false,
    summary:q=>q.guardPassed=false,controlSummary:q=>q.controls[0].passed=false,
    pdfOnlySummary:q=>q.controls.find(c=>c.caseId==='paths'&&c.name==='faint-glyph-loss').pdfOnlyPassed=true,
    falsePdfPass:q=>q.controls[0].views[0].evaluation.pdfOnlyPassed=true,
    falseNativePass:q=>q.controls[0].views[0].evaluation.nativePagePassed=true,
    falseCombinedPass:q=>q.controls[0].views[0].evaluation.passed=true,
    falseTargetPass:q=>q.controls[0].views[0].targetRejected=false,
    changedZeroLimit:q=>q.controls[0].views[0].evaluation.fullPageLimit=1,
    changedLocalZeroLimit:q=>q.controls[0].views[0].evaluation.nativeChecks[0].limit=1,
    changedCamera:q=>q.controls[0].views[0].measurement.whole.rasterRectangles['1x'].x++,
    changedRegion:q=>q.controls[0].views[0].measurement.regions.pop(),
    exactFlag:q=>q.controls[0].views[0].measurement.fullPage.exactRgbaMatch=true,
    changedPageCount:q=>q.controls[0].views[0].measurement.fullPage.rawChangedPixels++,
    inconsistentChannel:q=>q.controls[0].views[0].measurement.fullPage.maxRawChannelError=0,
    invalidChannel:q=>q.controls[0].views[0].measurement.fullPage.maxRawChannelError=256,
    outsideWhole:q=>q.controls[0].views[0].measurement.outsideWholeChangedPixels=1,
    missingLocalChecks:q=>q.controls[0].views[0].evaluation.checks.pop(),
    bevel1x:q=>q.controls.find(c=>c.name==='changed-corner-join').views[0].expectedImageOutcome='target-rejection',
    bevel4x:q=>q.controls.find(c=>c.name==='changed-corner-join').views[1].expectedImageOutcome='pixel-identical',
    faint1x:q=>q.controls.find(c=>c.caseId==='transforms'&&c.name==='faint-period-loss').views[0].expectedImageOutcome='pixel-identical',
    missingSheet:q=>q.controls.find(c=>c.caseId==='paths'&&c.name==='faint-glyph-loss').views[0].sheet=null,
    outsideLink:q=>q.controls.find(c=>c.caseId==='paths'&&c.name==='faint-glyph-loss').views[0].sheet='../outside.png',
    artifact:q=>delete q.artifacts['index.html'],tool:q=>delete q.toolHashes['tools/TikzVisual/labelled-border-pdf-page-guard.mjs'],
    toolHash:q=>q.toolHashes['tools/TikzVisual/labelled-border-pdf-page-guard.mjs']='0'.repeat(64),
    coverage:q=>q.coverage.baselines=0
  };
  for(const[name,change]of Object.entries(mutations))reject('coverage/'+name,()=>{
    const q=structuredClone(r);change(q);validateLabelledPdfPageGuard(q,source,calibration);
  });
  reject('Changed frozen PDF-only blind-spot summary',()=>{
    const q=structuredClone(source);q.sensitivityPassed=true;validateLabelledPdfPageGuard(r,q,calibration);
  });
  reject('Changed independent PDF allowance',()=>{
    const q=structuredClone(calibration);q.cases[0].policies.native.rows[0].regions[0].limits.maxRawChannelError++;
    validateLabelledPdfCalibration(q,qualification.report);
  });
  const faint=r.controls.find(c=>c.caseId==='paths'&&c.name==='faint-glyph-loss').views[0];
  const q=structuredClone(faint.measurement);q.fullPage={exactRgbaMatch:true,rawChangedPixels:0,maxRawChannelError:0};
  q.whole={...q.whole,exactRgbaMatch:true,rawChangedPixels:0,maxRawChannelError:0};
  q.regions=q.regions.map(row=>({...row,exactRgbaMatch:true,rawChangedPixels:0,maxRawChannelError:0}));
  const pdf=source.controls.find(c=>c.caseId==='paths'&&c.name==='faint-glyph-loss').views[0].evaluation;
  assert.equal(evaluateLabelledPdfPageGuard(faint.measurement,pdf).passed,false);
  assert.equal(evaluateLabelledPdfPageGuard(q,pdf).passed,true);
  reject('Replacing faint pixels with an unmodified page is detected',()=>assert.deepEqual(q.fullPage,faint.measurement.fullPage));
  // Every RGBA channel must contribute, including faint alpha and an outside pixel.
  const metrics=createShapeRasterMetrics(),reference=new Uint8Array([0,0,0,255,255,255,255,255]);
  for(let channel=0;channel<4;channel++){
    const actual=reference.slice();actual[channel]+=channel===3?-1:1;
    const row={id:'whole-picture',...metrics.compare(reference,actual,{width:2,height:1,background:'white'})};
    const m={fullPage:{exactRgbaMatch:false,rawChangedPixels:1,maxRawChannelError:1},whole:row,regions:[],outsideWholeChangedPixels:0};
    assert.equal(evaluateLabelledPdfPageGuard(m,{passed:true,checks:[{id:'whole-picture',passed:true}]}).passed,false);
    controls.push({name:'One-unit RGBA channel '+channel+' is rejected despite PDF pass',expected:'reject',passed:true});
  }
  reject('Changed pixels outside the whole camera',()=>evaluateLabelledPdfPageGuard({
    ...faint.measurement,outsideWholeChangedPixels:1},pdf));
  assert.equal(labelledPdfGuardExpectation({caseId:'paths',name:'another-join'},{scale:1}),'target-rejection');
  controls.push({name:'Another join receives no 1x exemption',expected:'target-rejection',passed:true});
  for(const[p,h]of Object.entries(toolHashes))assert.equal(
    sha256(Buffer.from((await readFile(path.join(root,p),'utf8')).replaceAll('\r\n','\n'))),h,p);
  const report=Buffer.from(JSON.stringify({schemaVersion:1,completed:true,passed:true,converterInvoked:false,
    approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',inputReportSha256:pointer.sha256,
    sourceSha256:labelledPdfFailedTrial.sha256,calibrationSha256:labelledPdfFailedTrial.calibrationSha256,
    pagesRecomputed,metricsRecomputed,coverage,controls,toolHashes,artifacts},null,2)+'\n');
  await writeArtifact(output,'report.json',report);
  await writeArtifact(base,'latest.json',JSON.stringify({completed:true,
    report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(report)},null,2)+'\n');
  console.log('Native-page guard: '+controls.length+' controls, '+pagesRecomputed+' pages and '+metricsRecomputed+' metrics.');
}catch(error){
  process.exitCode=2;await save('report.json',JSON.stringify({completed:false,passed:false,converterInvoked:false,
    approvedImagePolicy:false,imageConformanceClaim:false,controls,error:error.message,toolHashes,artifacts},null,2)+'\n');
  console.error(error.stack);
}
