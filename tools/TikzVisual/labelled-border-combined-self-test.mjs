// Independent saved-image measurements and source/gate corruption controls.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadLabelledCombinedInputs,captureLabelledCombinedSources,verifyLabelledSourceHashes} from './labelled-border-combined-common.mjs';
import {validateLabelledCombinedTrial,finishLabelledCombinedGates} from './labelled-border-combined-coverage.mjs';
import {labelledPdfViewKey} from './labelled-border-pdf-calibration-common.mjs';
import {shapePdfMetricRecord} from './shape-pdf-trial-policy.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

const base=path.join(root,'artifacts/labelled-border-combined-controls'),output=path.join(base,'run-'+randomUUID());
const artifacts={},controls=[];let toolHashes={};
const save=(p,b)=>writeArtifact(output,p,b,artifacts);
async function publish(r){
  const b=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(output,'report.json',b);
  await writeArtifact(base,'latest.json',JSON.stringify({completed:r.completed,
    report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');
}
function reject(name,action){let error;try{action();}catch(e){error=e.message;}assert.ok(error,'Accepted control: '+name);
  controls.push({name,expected:'reject',passed:true,error});}
function validateNumericChecks(q,count){
  assert.equal(q.completed,true);assert.equal(q.checks.length,count);
  assert.equal(new Set(q.checks.map(c=>c.quantity)).size,count);
  for(const check of q.checks){
    assert.ok(typeof check.quantity==='string'&&check.quantity.length);
    if(check.unit==='identity'){
      assert.equal(typeof check.expected,'string');assert.equal(typeof check.actual,'string');
      assert.equal(check.delta,null);assert.equal(check.limit,0);
      assert.equal(check.passed,check.expected===check.actual);
    }else if(check.unit==='source containment'){
      assert.equal(check.expected,true);assert.equal(typeof check.actual,'boolean');
      assert.equal(check.delta,null);assert.equal(check.limit,0);assert.equal(check.passed,check.actual);
    }else{
      assert.ok(['count','integer sp','sp','coefficient','slot','bp'].includes(check.unit));
      assert.ok([check.expected,check.actual,check.delta,check.limit].every(Number.isFinite));
      assert.equal(check.limit,check.unit==='sp'?1e-4:check.unit==='bp'?1e-9:0);
      assert.equal(check.delta,Math.abs(check.expected-check.actual));
      assert.equal(check.passed,check.delta<=check.limit);
    }
  }
  assert.equal(q.passed,q.checks.every(c=>c.passed));
}
try{
  toolHashes=await captureLabelledCombinedSources(save,'labelled-border-combined-self-test.mjs');
  await publish({schemaVersion:1,completed:false,passed:false,converterInvoked:false,
    approvedImagePolicy:false,imageConformanceClaim:false,toolHashes,artifacts});
  assert.equal(process.argv.length,2);const inputs=await loadLabelledCombinedInputs();
  const folder=path.join(root,'artifacts/labelled-border-combined-trial');
  const pointer=JSON.parse(await readFile(path.join(folder,'latest.json')));
  assert.equal(pointer.completed,true);assert.match(pointer.report,/^run-[a-f0-9-]+\/report.json$/);
  const input=path.dirname(path.join(folder,pointer.report)),bytes=await readFile(path.join(input,'report.json'));
  assert.equal(sha256(bytes),pointer.sha256);const r=JSON.parse(bytes);
  const read=async p=>readFile(await outputPath(input,p));
  for(const[p,h]of Object.entries(r.artifacts))assert.equal(sha256(await read(p)),h,p);
  await verifyLabelledSourceHashes(r.toolHashes);
  const numeric=JSON.parse(await read('candidate/report.json'));
  await verifyLabelledSourceHashes({...numeric.converterSources,...numeric.toolHashes});
  validateLabelledCombinedTrial(r,inputs,numeric);assert.equal(r.trialPassed,true);await save('input-report.json',bytes);
  const scenes=await Promise.all(r.cases.map(c=>read(c.scene).then(b=>JSON.parse(b))));
  const sourceTexts=await Promise.all(r.cases.map(c=>read(c.source).then(b=>b.toString('utf8'))));
  const nativeQuantities=await Promise.all(r.cases.map(c=>read('candidate/'+c.caseId+'/numeric.json').then(b=>JSON.parse(b))));
  function attributionAndCrops(report){
    for(let i=0;i<3;i++){
      const c=report.cases[i],p=inputs.primary.report.cases[i],pdf=inputs.pdf.report.cases[i],scene=scenes[i];
      const expected=p.frame.regions.map(region=>{
        const op=region.kind==='glyph'?scene.glyphs[region.glyphIndex]:scene.paths[region.nativePathIndex];
        const span=op.source,prefix=sourceTexts[i].slice(0,span.offset).split('\n');
        assert.ok(span.length>0&&span.offset+span.length<=sourceTexts[i].length);
        assert.equal(span.line,prefix.length);assert.equal(span.column,prefix.at(-1).length+1);
        return {regionId:region.id,semanticId:op.semanticId,svgElementId:op.svgElementId,source:span};
      });
      assert.deepEqual(c.sources,expected);
      let k=0;
      for(const q of p.ink.records){
        const op=q.kind==='glyph'?scene.glyphs[q.glyphIndex]:scene.paths[q.nativePathIndex];
        for(const key of ['minX','minY','maxX','maxY'])assert.equal(c.inkRoot[k++].observed,op.inkBounds[key]);
      }
      const crops=(rows,primary)=>{
        for(const row of rows){
          const cropped=row.regions.filter(q=>q.crops);assert.equal(cropped.length,3);
          for(const q of cropped){
            const e=primary?p.frame.regions.find(v=>v.id===q.id):pdf.regions.find(v=>v.id===q.id);
            const rectangle=primary?Object.fromEntries(Object.entries(e.rectangle).map(([key,value])=>[key,value*row.scale]))
              :e.rasterRectangles[row.scale+'x'];
            assert.deepEqual(q.crops.presentation,{background:'white',integerEnlargement:row.scale===1?4:1,
              rawDifferenceAmplification:16,rasterRectangle:rectangle});
            const keys=primary?['reference','actual','difference','amplified','sheet']:['pdf','svg','difference','amplified','overlay','sheet'];
            assert.deepEqual(Object.keys(q.crops).sort(),[...keys,'presentation'].sort());
            for(const key of keys)assert.match(report.artifacts[q.crops[key]]??'',/^[a-f0-9]{64}$/);
          }
        }
      };
      crops(c.primary,true);crops(c.originalPdf,false);crops(c.candidatePdf,false);
      for(const row of c.nativePage){
        assert.equal(row.sheet,c.caseId+'/native-page/'+labelledPdfViewKey(row)+'-sheet.png');
        assert.match(report.artifacts[row.sheet]??'',/^[a-f0-9]{64}$/);
      }
    }
  }
  attributionAndCrops(r);
  let numericChecks=0;
  for(let i=0;i<3;i++){
    const q=nativeQuantities[i];validateNumericChecks(q,[512,578,534][i]);
    numericChecks+=q.checks.length;assert.equal(q.passed,r.cases[i].numericPassed);
  }
  assert.equal(numericChecks,1624);
  const renderer=await createRenderer();let metricsRecomputed=0,pagesRecomputed=0;
  try{
    assert.deepEqual(renderer.identity,r.renderer);await installShapeMetrics(renderer);
    async function measure(images,size,regions,scale,background,scanPage=false){
      return renderer.page.evaluate(async({images,size,regions,scale,background,scanPage})=>{
        const buffers=[];
        for(const src of images){
          const image=new Image();image.src=src;await image.decode();
          if(image.width!==size.width||image.height!==size.height)throw Error('Changed combined PNG dimensions.');
          const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
          const ctx=canvas.getContext('2d',{colorSpace:'srgb',willReadFrequently:true});ctx.drawImage(image,0,0);
          buffers.push(ctx.getImageData(0,0,size.width,size.height).data);
        }
        const metrics=regions.map(rectangle=>globalThis.shapeRasterMetrics.compare(...buffers,
          {...size,scale,background,maskThreshold:16,rectangle}));
        let fullPage=null;
        if(scanPage){
          let rawChangedPixels=0,maxRawChannelError=0;
          for(let i=0;i<buffers[0].length;i+=4){
            let error=0;for(let channel=0;channel<4;channel++)error=Math.max(error,Math.abs(buffers[0][i+channel]-buffers[1][i+channel]));
            rawChangedPixels+=error!==0;maxRawChannelError=Math.max(maxRawChannelError,error);
          }
          fullPage={exactRgbaMatch:rawChangedPixels===0,rawChangedPixels,maxRawChannelError};
        }
        return {metrics,fullPage};
      },{images:images.map(b=>'data:image/png;base64,'+b.toString('base64')),size,regions,scale,background,scanPage});
    }
    for(let i=0;i<3;i++){
      const c=r.cases[i],p=inputs.primary.report.cases[i],pdf=inputs.pdf.report.cases[i];
      const svg=(await read(c.svg)).toString('utf8');
      const parsed=await renderer.page.evaluate(({svg,ids})=>{
        const d=new DOMParser().parseFromString(svg,'image/svg+xml');if(d.querySelector('parsererror')||d.doctype)throw Error('Invalid public SVG.');
        return {root:d.documentElement.getAttribute('viewBox').split(/[ ,]+/).map(Number),ids:ids.map(id=>!!d.getElementById(id))};
      },{svg,ids:c.sources.map(s=>s.svgElementId)});
      assert.ok(parsed.ids.every(Boolean));
      for(let k=0;k<4;k++)assert.equal(c.inkRoot.at(-4+k).observed,parsed.root[k]);
      for(const row of c.primary){
        const size={width:p.frame.camera.width*row.scale,height:p.frame.camera.height*row.scale};
        const rectangles=[undefined,...p.frame.regions.map(q=>Object.fromEntries(Object.entries(q.rectangle).map(([k,v])=>[k,v*row.scale])))];
        const m=await measure(await Promise.all(['reference','actual'].map(k=>read(row.images[k]))),size,rectangles,row.scale,row.background);
        for(let j=0;j<m.metrics.length;j++)assert.deepEqual(m.metrics[j],shapePdfMetricRecord(j===0?row.metrics:row.regions[j-1]));
        metricsRecomputed+=m.metrics.length;
      }
      for(const row of [...c.originalPdf,...c.candidatePdf]){
        const whole=row.whole.rasterRectangles[row.scale+'x'],size={width:whole.width,height:whole.height};
        const rectangles=[undefined,...row.regions.map(q=>{
          const box=q.rasterRectangles[row.scale+'x'];return {x:box.x-whole.x,y:box.y-whole.y,width:box.width,height:box.height};
        })];
        const m=await measure(await Promise.all(['pdf','svg'].map(k=>read(row.artifacts[k]))),size,rectangles,row.scale,'white');
        for(let j=0;j<m.metrics.length;j++)assert.deepEqual(m.metrics[j],shapePdfMetricRecord(j===0?row.whole:row.regions[j-1]));
        metricsRecomputed+=m.metrics.length;
      }
      for(const row of c.nativePage){
        const m=await measure(await Promise.all([row.referencePage,row.actualPage].map(read)),pdf.camera.rasterSizes[row.scale+'x'],
          pdf.regions.map(q=>q.rasterRectangles[row.scale+'x']),row.scale,'white',true);
        assert.deepEqual(m.fullPage,row.measurement.fullPage);
        const rows=[row.measurement.whole,...row.measurement.regions];
        for(let j=0;j<rows.length;j++)assert.deepEqual(m.metrics[j],shapePdfMetricRecord(rows[j]));
        assert.equal(row.measurement.outsideWholeChangedPixels,m.fullPage.rawChangedPixels-m.metrics[0].rawChangedPixels);
        metricsRecomputed+=m.metrics.length;pagesRecomputed++;
      }
      console.log(c.caseId+': numeric attribution and all primary/PDF/native PNG metrics checked.');
    }
  }finally{await renderer.browser.close();}
  assert.deepEqual([metricsRecomputed,pagesRecomputed],[3960,12]);
  controls.push({name:'Actual numeric records, source/SVG attribution, all saved PNG metrics and full pages',expected:'pass',passed:true,
    numericChecks,metricsRecomputed,pagesRecomputed});
  reject('Changed painting/segment identity with a stale passing flag',()=>{
    const q=structuredClone(nativeQuantities[0]);q.checks.find(c=>c.unit==='identity').actual='wrong';validateNumericChecks(q,512);
  });
  reject('Identity check cannot pretend to have a numeric delta',()=>{
    const q=structuredClone(nativeQuantities[0]);q.checks.find(c=>c.unit==='identity').delta=0;validateNumericChecks(q,512);
  });
  reject('Duplicate native quantity cannot replace another assertion',()=>{
    const q=structuredClone(nativeQuantities[0]);q.checks[1]=q.checks[0];validateNumericChecks(q,512);
  });
  reject('Source containment cannot keep a stale passing flag',()=>{
    const q=structuredClone(nativeQuantities[0]);q.checks.find(c=>c.unit==='source containment').actual=false;validateNumericChecks(q,512);
  });
  reject('Source containment remains a boolean predicate',()=>{
    const q=structuredClone(nativeQuantities[0]);q.checks.find(c=>c.unit==='source containment').actual=1;validateNumericChecks(q,512);
  });
  reject('Native scalar limits stay those declared by the independent matcher',()=>{
    const q=structuredClone(nativeQuantities[0]);q.checks.find(c=>c.unit==='sp').limit++;validateNumericChecks(q,512);
  });
  const mutations={unfinished:q=>q.completed=false,converter:q=>q.converterInvoked=false,claim:q=>q.imageConformanceClaim=true,
    approval:q=>q.approvedImagePolicy=true,verdict:q=>q.overallVerdict='passed',snapshot:q=>q.snapshotSha256='0'.repeat(64),
    input:q=>q.inputs.pdf.sha256='0'.repeat(64),renderer:q=>q.renderer.changed=true,case:q=>q.cases.pop(),
    missingPrimary:q=>q.cases[0].primary.pop(),duplicatePrimary:q=>q.cases[0].primary[1]=q.cases[0].primary[0],
    missingOriginalPdf:q=>q.cases[0].originalPdf.pop(),missingPublicPdf:q=>q.cases[0].candidatePdf.pop(),
    missingNativePage:q=>q.cases[0].nativePage.pop(),duplicateNativePage:q=>q.cases[0].nativePage[1]=q.cases[0].nativePage[0],
    missingBound:q=>q.cases[0].inkRoot.pop(),boundLimit:q=>q.cases[0].inkRoot[0].limit++,
    boundExpected:q=>q.cases[0].inkRoot[0].expected++,boundVerdict:q=>q.cases[0].inkRoot[0].passed=false,
    changedRegion:q=>q.cases[0].primary[0].regions[0].rectangle.x++,primarySummary:q=>q.cases[0].primary[0].evaluation.passed=false,
    pdfSummary:q=>q.cases[0].candidatePdf[0].evaluation.passed=false,pdfOrigin:q=>q.cases[0].candidatePdf[0].pageSize.width++,
    pdfFrame:q=>q.cases[0].originalPdf[0].sourceFrame.x++,nativeReference:q=>q.cases[0].nativePage[0].referencePage=q.cases[0].nativePage[0].actualPage,
    nativePageLimit:q=>q.cases[0].nativePage[0].evaluation.fullPageLimit=1,nativeSummary:q=>q.cases[0].nativePage[0].evaluation.passed=false,
    numericState:q=>q.cases[0].numericPassed=false,numericCount:q=>q.numeric.checks--,nonFramework:q=>q.numeric.assemblyReferences.push('Other'),
    gateCount:q=>q.cases[0].combined.gates.primary.executedChecks--,missingGate:q=>delete q.cases[0].combined.gates.nativePage,
    trialSummary:q=>q.trialPassed=false,agent:q=>q.agent.firstFailedGate='numeric',command:q=>q.agent.command='wrong',
    coverage:q=>q.coverage.nativePageChecks--,artifact:q=>delete q.artifacts[q.cases[0].svg],outsideLink:q=>q.cases[0].svg='../outside.svg',
    source:q=>q.cases[0].sources[0].source=null,sourceIdentity:q=>q.cases[0].sources[0].regionId='other'
  };
  for(const[name,change]of Object.entries(mutations))reject('coverage/'+name,()=>{
    const q=structuredClone(r);change(q);validateLabelledCombinedTrial(q,inputs,numeric);
  });
  const metadata={wrongSpan:q=>q.cases[0].sources[0].source.offset++,wrongSvgId:q=>q.cases[0].sources[0].svgElementId='wrong',
    wrongObservedInk:q=>q.cases[0].inkRoot[0].observed++,missingCrop:q=>q.cases[0].primary[0].regions.find(q=>q.crops).crops=null,
    cropLattice:q=>q.cases[0].candidatePdf[0].regions.find(q=>q.crops).crops.presentation.rasterRectangle.x++,
    cropEnlargement:q=>q.cases[0].primary[0].regions.find(q=>q.crops).crops.presentation.integerEnlargement++,
    missingNativeSheet:q=>q.cases[0].nativePage[0].sheet=null};
  for(const[name,change]of Object.entries(metadata))reject('attribution/'+name,()=>{
    const q=structuredClone(r);change(q);attributionAndCrops(q);
  });
  for(const gate of ['numeric','inkRoot','primary','originalPdf','candidatePdf','nativePage']){
    const q=structuredClone(r.cases[0].combined.gates);q[gate].state='failed';
    const result=finishLabelledCombinedGates(q);assert.equal(result.passed,false);assert.equal(result.firstFailedGate,gate);
    controls.push({name:'A failed '+gate+' gate cannot be hidden by the other passing gates',expected:'trial-failed',passed:true});
    reject('Empty '+gate+' gate',()=>{q[gate].executedChecks=0;finishLabelledCombinedGates(q);});
  }
  await verifyLabelledSourceHashes({...toolHashes,...numeric.converterSources,...numeric.toolHashes});
  const report={schemaVersion:1,completed:true,passed:true,converterInvoked:false,
    approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',inputReportSha256:pointer.sha256,
    numericChecks,metricsRecomputed,pagesRecomputed,controls,toolHashes,artifacts};
  await publish(report);
  console.log('Combined trial: '+controls.length+' controls, '+numericChecks+' quantities, '+metricsRecomputed+' metrics and '+pagesRecomputed+' full pages.');
}catch(error){
  process.exitCode=2;console.error(error.stack);await publish({completed:false,passed:false,
    converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,error:error.message.replaceAll(root,'<repo>'),controls,toolHashes,artifacts});
}
