// Portable trial: independent saved-pixel, numeric, source and gate checks.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {canonical,verifyLabelledSourceHashes} from './labelled-border-combined-common.mjs';
import {loadLabelledCache,labelledSame,requireLabelledRenderer,labelledCacheSha256} from './labelled-border-cache.mjs';
import {decodeLabelledPngPair} from './labelled-border-cache-images.mjs';
import {validateLabelledCachedTrial,finishLabelledCachedGates} from './labelled-border-cached-coverage.mjs';
import {finishLabelledCombinedGates} from './labelled-border-combined-coverage.mjs';
import {shapePdfMetricRecord} from './shape-pdf-trial-policy.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

const base=path.join(root,'artifacts/labelled-border-cached-controls'),output=path.join(base,'run-'+randomUUID());
const artifacts={},controls=[];let toolHashes={},inputReportSha256=null;
const save=(p,b)=>writeArtifact(output,p,b,artifacts);
async function publish(r){const b=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(output,'report.json',b);
  await writeArtifact(base,'latest.json',JSON.stringify({completed:r.completed,
    report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');
  return {report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)};}
function reject(name,action){let error;try{action();}catch(e){error=e.message;}assert.ok(error,'Accepted portable trial control: '+name);
  controls.push({name,expected:'reject',passed:true,error});}
function numericChecks(q,count){
  assert.equal(q.completed,true);assert.equal(q.checks.length,count);assert.equal(new Set(q.checks.map(q=>q.quantity)).size,count);
  for(const c of q.checks){assert.ok(typeof c.quantity==='string'&&c.quantity.length);
    if(c.unit==='identity'){assert.equal(typeof c.expected,'string');assert.equal(typeof c.actual,'string');
      assert.equal(c.delta,null);assert.equal(c.limit,0);assert.equal(c.passed,c.expected===c.actual);
    }else if(c.unit==='source containment'){assert.equal(c.expected,true);assert.equal(typeof c.actual,'boolean');
      assert.equal(c.delta,null);assert.equal(c.limit,0);assert.equal(c.passed,c.actual);
    }else{assert.ok(['count','integer sp','sp','coefficient','slot','bp'].includes(c.unit));
      assert.ok([c.expected,c.actual,c.delta,c.limit].every(Number.isFinite));assert.equal(c.limit,c.unit==='sp'?1e-4:c.unit==='bp'?1e-9:0);
      assert.equal(c.delta,Math.abs(c.expected-c.actual));assert.equal(c.passed,c.delta<=c.limit);}
  }
  assert.equal(q.passed,q.checks.every(c=>c.passed));
}
try{
  const own='tools/TikzVisual/labelled-border-cached-self-test.mjs',ownBytes=canonical(await readFile(path.join(root,own)));
  toolHashes[own]=sha256(ownBytes);await save('tool-sources/'+own,ownBytes);
  await publish({completed:false,passed:false,converterInvoked:false,toolHashes,artifacts});
  assert.ok(process.argv.length===2||(process.argv.length===4&&process.argv[2]==='--report'));
  const e=await loadLabelledCache(),folder=path.join(root,'artifacts/labelled-border-cached-trial');
  let input,bytes;
  if(process.argv.length===4){
    assert.match(process.argv[3],/^artifacts\/labelled-border-cached-trial\/run-[a-f0-9-]+\/report.json$/);
    input=path.dirname(path.join(root,process.argv[3]));bytes=await readFile(path.join(input,'report.json'));
  }else{
    const pointer=JSON.parse(await readFile(path.join(folder,'latest.json')));assert.equal(pointer.completed,true);
    assert.match(pointer.report,/^run-[a-f0-9-]+\/report.json$/);input=path.dirname(path.join(folder,pointer.report));
    bytes=await readFile(path.join(input,'report.json'));assert.equal(sha256(bytes),pointer.sha256);
  }
  inputReportSha256=sha256(bytes);
  const r=JSON.parse(bytes),read=async p=>readFile(await outputPath(input,p));
  for(const[p,h]of Object.entries(r.artifacts))assert.equal(sha256(await read(p)),h,p);
  await verifyLabelledSourceHashes(r.toolHashes);Object.assign(toolHashes,r.toolHashes);
  const numeric=JSON.parse(await read('candidate/report.json'));await verifyLabelledSourceHashes({...numeric.converterSources,...numeric.toolHashes});
  validateLabelledCachedTrial(r,e,numeric);assert.equal(r.combined.passed,true);await save('input-report.json',bytes);
  for(const[p,h]of Object.entries(toolHashes)){const b=canonical(await readFile(path.join(root,p)));assert.equal(sha256(b),h);await save('tool-sources/'+p,b);}
  const quantities=[];let numericAssertions=0;
  function attribution(report,scenes,texts){
    for(let i=0;i<3;i++){
      const c=report.cases[i],p=e.reports.primary.cases[i],scene=scenes[i],source=texts[i];
      const expected=p.frame.regions.map(region=>{const op=region.kind==='glyph'?scene.glyphs[region.glyphIndex]:scene.paths[region.nativePathIndex];
        const span=op.source,prefix=source.slice(0,span.offset).split('\n');assert.ok(span.length>0&&span.offset+span.length<=source.length);
        assert.equal(span.line,prefix.length);assert.equal(span.column,prefix.at(-1).length+1);
        return {regionId:region.id,semanticId:op.semanticId,svgElementId:op.svgElementId,source:span};});
      labelledSame(c.sources,expected);let k=0;
      for(const q of p.ink.records){const op=q.kind==='glyph'?scene.glyphs[q.glyphIndex]:scene.paths[q.nativePathIndex];
        for(const key of ['minX','minY','maxX','maxY'])assert.equal(c.inkRoot[k++].observed,op.inkBounds[key]);}
    }
  }
  const scenes=await Promise.all(r.cases.map(c=>read(c.scene).then(b=>JSON.parse(b)))),texts=await Promise.all(r.cases.map(c=>read(c.source).then(b=>b.toString('utf8'))));
  attribution(r,scenes,texts);
  for(let i=0;i<3;i++){
    const q=JSON.parse(await read('candidate/'+r.cases[i].caseId+'/numeric.json'));numericChecks(q,[512,578,534][i]);
    assert.equal(q.passed,r.cases[i].numericPassed);quantities.push(q);numericAssertions+=q.checks.length;
  }
  const renderer=await createRenderer();let metricsRecomputed=0,pagesRecomputed=0;
  try{
    requireLabelledRenderer(renderer.identity,e.calibration.renderer);requireLabelledRenderer(r.renderer,e.calibration.renderer);await installShapeMetrics(renderer);
    async function primary(o,p){
      const size={width:p.frame.camera.width*o.scale,height:p.frame.camera.height*o.scale};
      const rectangles=[undefined,...p.frame.regions.map(q=>Object.fromEntries(Object.entries(q.rectangle).map(([k,v])=>[k,v*o.scale])))];
      const m=await decodeLabelledPngPair(renderer,await Promise.all(['reference','actual'].map(k=>read(o.images[k]))),size,rectangles,o.scale,o.background);
      labelledSame(m.metrics[0],o.metrics);for(let i=0;i<o.regions.length;i++)labelledSame(m.metrics[i+1],shapePdfMetricRecord(o.regions[i]));
      metricsRecomputed+=m.metrics.length;
    }
    async function pdf(o){
      const whole=o.whole.rasterRectangles[o.scale+'x'],size={width:whole.width,height:whole.height};
      const rects=[undefined,...o.regions.map(q=>{const b=q.rasterRectangles[o.scale+'x'];return{x:b.x-whole.x,y:b.y-whole.y,width:b.width,height:b.height};})];
      const m=await decodeLabelledPngPair(renderer,await Promise.all(['pdf','svg'].map(k=>read(o.artifacts[k]))),size,rects,o.scale,'white');
      const rows=[o.whole,...o.regions];for(let i=0;i<rows.length;i++)labelledSame(m.metrics[i],shapePdfMetricRecord(rows[i]));metricsRecomputed+=rows.length;
    }
    async function native(o,p,scale){
      const m=await decodeLabelledPngPair(renderer,await Promise.all([o.referencePage,o.actualPage].map(read)),p.camera.rasterSizes[scale+'x'],
        p.regions.map(q=>q.rasterRectangles[scale+'x']),scale,'white',true);
      labelledSame(m.fullPage,o.measurement.fullPage);const rows=[o.measurement.whole,...o.measurement.regions];
      for(let i=0;i<rows.length;i++)labelledSame(m.metrics[i],shapePdfMetricRecord(rows[i]));
      assert.equal(m.fullPage.rawChangedPixels-m.metrics[0].rawChangedPixels,o.measurement.outsideWholeChangedPixels);
      metricsRecomputed+=rows.length;pagesRecomputed++;
    }
    for(const c of r.cases){const p=e.reports.primary.cases.find(p=>p.caseId===c.caseId),f=e.reports.pdf.cases.find(p=>p.caseId===c.caseId);
      for(const o of c.primary)await primary(o,p);for(const o of [...c.originalPdf,...c.candidatePdf])await pdf(o);
      for(const o of c.nativePage)await native(o,f,o.scale);}
    for(const c of r.primaryControls){const p=e.reports.primary.cases.find(p=>p.caseId===c.caseId);for(const o of c.views)await primary(o,p);}
    for(const c of r.pdfControls){const p=e.reports.pdf.cases.find(p=>p.caseId===c.caseId);
      for(const o of c.views){await pdf(o);await native(o.guard,p,o.scale);}
      console.log('Portable saved public '+c.caseId+'/'+c.name+': metrics and full pages checked.');
    }
  }finally{await renderer.browser.close();}
  assert.deepEqual([numericAssertions,metricsRecomputed,pagesRecomputed],[1624,22908,138]);
  controls.push({name:'Every saved public baseline and image-only control metric remeasured',expected:'pass',passed:true,numericAssertions,metricsRecomputed,pagesRecomputed});
  const mutations={role:q=>q.converterInvoked=false,completion:q=>q.completed=false,approval:q=>q.approvedImagePolicy=true,
    claim:q=>q.imageConformanceClaim=true,verdict:q=>q.overallVerdict='passed',cache:q=>q.cacheSha256='0'.repeat(64),
    decoded:q=>q.decodedSha256='0'.repeat(64),independent:q=>q.independentQualification.controlPngsReproduced--,
    missingCase:q=>q.cases.pop(),numericFlag:q=>q.cases[0].numericPassed=false,inkLimit:q=>q.cases[0].inkRoot[0].limit++,
    inkActual:q=>q.cases[0].inkRoot[0].observed++,primary:q=>q.cases[0].primary.pop(),pdf:q=>q.cases[0].candidatePdf.pop(),
    native:q=>q.cases[0].nativePage[0].measurement.fullPage.rawChangedPixels++,nativeZero:q=>q.cases[0].nativePage[0].evaluation.fullPageLimit++,
    nativeReference:q=>q.cases[0].nativePage[0].referencePage=q.cases[0].nativePage[0].actualPage,
    primaryControl:q=>q.primaryControls.pop(),pdfControl:q=>q.pdfControls.pop(),bypass:q=>q.primaryControls[0].numericGatesBypassed=false,
    primaryOutcome:q=>q.primaryControls[0].views[0].expectedOutcomePassed=false,primaryPixels:q=>q.primaryControls[0].views[0].exactBaselinePixels=true,
    primaryTarget:q=>q.primaryControls[0].target='glyph-0',pdfOutcome:q=>q.pdfControls[0].views[0].expectedOutcomePassed=false,
    pdfPixels:q=>q.artifacts[q.pdfControls[0].views[0].artifacts['svg-page']]='0'.repeat(64),pdfOrigin:q=>q.cases[0].candidatePdf[0].pageSize.width++,
    pdfMetric:q=>q.pdfControls[0].views[0].whole.rawChangedPixels++,pdfTarget:q=>q.pdfControls[0].target='glyph-0',
    pdfNative:q=>q.pdfControls[0].views[0].guard.measurement.fullPage.rawChangedPixels++,
    pdfNativeLimit:q=>q.pdfControls[0].views[0].guard.evaluation.fullPageLimit++,source:q=>q.primaryControls[0].targetSource.source.offset++,
    coverage:q=>q.coverage.primaryControlViews--,viewer:q=>q.agent.viewer='../outside',summary:q=>q.combined.passed=false,
    artifact:q=>delete q.artifacts['independent-calibration.json.gz'],tool:q=>q.toolHashes['tools/TikzVisual/labelled-border-cache.mjs']='0'.repeat(64)};
  for(const [name,change]of Object.entries(mutations))reject('coverage/'+name,()=>{
    const q={...r,cases:[structuredClone(r.cases[0]),...r.cases.slice(1)],
      primaryControls:[structuredClone(r.primaryControls[0]),...r.primaryControls.slice(1)],
      pdfControls:[structuredClone(r.pdfControls[0]),...r.pdfControls.slice(1)],artifacts:{...r.artifacts},toolHashes:{...r.toolHashes},
      independentQualification:{...r.independentQualification},coverage:{...r.coverage},agent:{...r.agent},combined:{...r.combined}};
    change(q);validateLabelledCachedTrial(q,e,numeric);
  });
  for(const gate of Object.keys(r.combined.gates)){
    const q={...r,cases:r.cases,primaryControls:r.primaryControls,pdfControls:r.pdfControls};
    if(gate==='freshPrimary')q.primaryControls=r.primaryControls.map((c,i)=>i?c:{...c,passed:false});
    else if(gate==='freshPdfNative')q.pdfControls=r.pdfControls.map((c,i)=>i?c:{...c,passed:false});
    else q.cases=r.cases.map((c,i)=>i?c:{...c,combined:{...c.combined,gates:{...c.combined.gates,[gate]:{...c.combined.gates[gate],state:'failed'}}}});
    const result=finishLabelledCachedGates(q.cases,q.primaryControls,q.pdfControls);assert.equal(result.passed,false);assert.equal(result.firstFailedGate,gate);
    controls.push({name:'Passing other gates cannot conceal failure of '+gate,expected:'fail',passed:true});
  }
  const genuine=structuredClone(quantities[0]),scalar=genuine.checks.find(q=>q.unit==='sp');scalar.actual=scalar.expected+1;
  scalar.delta=Math.abs(scalar.actual-scalar.expected);scalar.passed=false;genuine.passed=false;numericChecks(genuine,512);
  const badCase=structuredClone(r.cases[0]);badCase.numericPassed=false;const badGates=badCase.combined.gates;badGates.numeric.state='failed';
  badCase.combined=finishLabelledCombinedGates(badGates);
  const failed=finishLabelledCachedGates([badCase,...r.cases.slice(1)],r.primaryControls,r.pdfControls);assert.equal(failed.firstFailedGate,'numeric');
  controls.push({name:'Genuine changed scaled-point assertion fails with unchanged passing images',expected:'fail',passed:true});
  reject('Forged numeric identity',()=>{const q=structuredClone(quantities[0]);q.checks.find(q=>q.unit==='identity').actual='wrong';numericChecks(q,512);});
  reject('Widened numeric tolerance',()=>{const q=structuredClone(quantities[0]);q.checks.find(q=>q.unit==='sp').limit++;numericChecks(q,512);});
  reject('Forged source containment',()=>{const q=structuredClone(quantities[0]);q.checks.find(q=>q.unit==='source containment').actual=false;numericChecks(q,512);});
  reject('Forged source span',()=>{const q={...r,cases:[structuredClone(r.cases[0]),...r.cases.slice(1)]};q.cases[0].sources[0].source.offset++;attribution(q,scenes,texts);});
  await verifyLabelledSourceHashes(toolHashes);
  const location=await publish({schemaVersion:1,completed:true,passed:true,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',
    inputReportSha256,cacheSha256:labelledCacheSha256,numericAssertions,metricsRecomputed,pagesRecomputed,controls,toolHashes,artifacts});
  console.log(JSON.stringify({kind:'labelled-border-cached-check-output',final:true,completed:true,passed:true,inputReportSha256,...location}));
  console.log('Portable public checker: '+controls.length+' controls, '+metricsRecomputed+' metrics, '+pagesRecomputed+' full pages.');
}catch(error){process.exitCode=2;console.error(error.stack);const location=await publish({completed:false,passed:false,converterInvoked:false,
  approvedImagePolicy:false,imageConformanceClaim:false,error:error.message.replaceAll(root,'<repo>'),inputReportSha256,controls,toolHashes,artifacts});
  console.log(JSON.stringify({kind:'labelled-border-cached-check-output',final:true,completed:false,passed:false,inputReportSha256,...location}));}
