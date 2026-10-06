// Fresh public conversion through all independently calibrated image gates.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadLabelledBorderEvidence} from './labelled-border-evidence.mjs';
import {runLabelledResearchTool,saveLabelledImages} from './labelled-border-research.mjs';
import {labelledCombinedInputs,loadLabelledCombinedInputs,copyLabelledCombinedInputs,
  captureLabelledCombinedSources,verifyLabelledSourceHashes} from './labelled-border-combined-common.mjs';
import {labelledCombinedGateReport,finishLabelledCombinedGates,validateLabelledCombinedTrial} from './labelled-border-combined-coverage.mjs';
import {shapeViews,evaluateShapeTrial} from './shape-primary-trial-policy.mjs';
import {shapePdfViews,evaluateShapePdfTrial} from './shape-pdf-trial-policy.mjs';
import {labelledPdfViewKey} from './labelled-border-pdf-calibration-common.mjs';
import {compareLabelledNativePages,evaluateLabelledPdfPageGuard} from './labelled-border-pdf-page-guard.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics,measureShapePair} from './shape-image-pair.mjs';
import {measureShapePdfPair} from './shape-pdf-image-pair.mjs';
import {saveLabelledPdfImages} from './labelled-border-pdf-viewport.mjs';

const base=path.join(root,'artifacts/labelled-border-combined-trial'),output=path.join(base,'run-'+randomUUID());
const artifacts={},cases=[];let toolHashes={},phase='source-capture';
const save=(p,b)=>writeArtifact(output,p,b,artifacts),read=p=>readFile(path.join(output,p));
async function publish(r){
  const b=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(output,'report.json',b);
  await writeArtifact(base,'latest.json',JSON.stringify({completed:r.completed,
    report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');
}
try{
  toolHashes=await captureLabelledCombinedSources(save,'trial-labelled-border-combined.mjs');
  assert.equal(process.argv.length,2);await publish({completed:false,phase,toolHashes,artifacts});
  phase='independent-inputs';const evidence=await loadLabelledBorderEvidence(),inputs=await loadLabelledCombinedInputs();
  await copyLabelledCombinedInputs(inputs,save);
  phase='fresh-public-conversion';const numeric=await runLabelledResearchTool(output,'TikzLabelledBorderComparison','candidate',save,artifacts);
  await verifyLabelledSourceHashes({...numeric.converterSources,...numeric.toolHashes});
  const renderer=await createRenderer();
  try{
    assert.deepEqual(renderer.identity,inputs.primary.report.renderer);await installShapeMetrics(renderer);
    for(let i=0;i<3;i++){
      const p=inputs.primary.report.cases[i],pdf=inputs.pdf.report.cases[i],id=p.caseId;
      const actual=(await read('candidate/'+id+'/actual.svg')).toString('utf8');
      const scene=JSON.parse(await read('candidate/'+id+'/actual-scene.json'));
      const reference=(await inputs.pdf.read(pdf.svg.original)).toString('utf8'),inkRoot=[];
      const sources=p.frame.regions.map(r=>{
        const op=r.kind==='glyph'?scene.glyphs[r.glyphIndex]:scene.paths[r.nativePathIndex];assert.ok(op);
        return {regionId:r.id,semanticId:op.semanticId,svgElementId:op.svgElementId,source:op.source};
      });
      for(const r of p.ink.records){
        const op=r.kind==='glyph'?scene.glyphs[r.glyphIndex]:scene.paths[r.nativePathIndex];assert.ok(op);
        for(const k of ['minX','minY','maxX','maxY']){
          const observed=op.inkBounds[k],expected=r.bound[k],delta=Math.abs(observed-expected),limit=1e-8;
          inkRoot.push({quantity:r.id+'.'+k,expected,observed,delta,limit,passed:Number.isFinite(observed)&&delta<=limit,source:op.source});
        }
      }
      const rootValues=await renderer.page.evaluate(svg=>{
        const d=new DOMParser().parseFromString(svg,'image/svg+xml');if(d.querySelector('parsererror')||d.doctype)throw Error('Invalid public SVG.');
        return d.documentElement.getAttribute('viewBox').split(/[ ,]+/).map(Number);
      },actual);
      assert.equal(rootValues.length,4);
      p.rootChecks.forEach((r,k)=>{
        const observed=rootValues[k],expected=r.serialized,delta=Math.abs(observed-expected),limit=.000001;
        inkRoot.push({quantity:'root.'+r.quantity,expected,observed,delta,limit,passed:Number.isFinite(observed)&&delta<=limit});
      });
      const preferred=id==='lines'?['glyph-6','glyph-11','path-7']:id==='paths'?['glyph-0','path-8']:['glyph-11','path-6.endpoint-1','path-8'];
      const primary=[],originalPdf=[],candidatePdf=[],nativePage=[];phase=id+'/primary';
      for(const view of shapeViews){
        const m=await measureShapePair(renderer,{reference,actual,leftIsDriver:true,origin:p.frame.origin,
          camera:p.frame.camera,regions:p.frame.regions,...view,rightLabel:'Fresh public SVG',cropRegionIds:preferred,cropLimit:3});
        primary.push({...view,...await saveLabelledImages(save,id+'/primary/'+labelledPdfViewKey(view),m),
          evaluation:evaluateShapeTrial(p.policy,view,m)});
      }
      phase=id+'/pdf-and-native-page';
      for(const view of shapePdfViews){
        const page=await inputs.pdf.read(pdf.pdfPages[view.scale]),url='data:image/png;base64,'+page.toString('base64');
        const original=await measureShapePdfPair(renderer,{svg:reference,units:'bp',svgOriginBp:pdf.frame.origin,
          camera:pdf.camera,regions:pdf.regions,...view,pdfPage:url,cropRegionIds:preferred,cropLimit:3,rightLabel:'Original driver SVG'});
        originalPdf.push({...await saveLabelledPdfImages(save,id+'/original-pdf/'+labelledPdfViewKey(view),original),
          evaluation:evaluateShapePdfTrial(pdf.policies.original,view,original)});
        const publicPair=await measureShapePdfPair(renderer,{svg:actual,units:'cssPixels',svgOriginBp:{x:0,y:0},
          camera:pdf.camera,regions:pdf.regions,...view,pdfPage:url,cropRegionIds:preferred,cropLimit:3,rightLabel:'Fresh public SVG'});
        const candidate=await saveLabelledPdfImages(save,id+'/public-pdf/'+labelledPdfViewKey(view),publicPair);
        candidate.evaluation=evaluateShapePdfTrial(pdf.policies.native,view,publicPair);candidatePdf.push(candidate);
        const anchor=pdf.observations.find(o=>o.mode==='native-ink'&&labelledPdfViewKey(o)===labelledPdfViewKey(view));assert.ok(anchor);
        const referencePage='calibration/pdf/'+anchor.artifacts['svg-page'];
        const m=await compareLabelledNativePages(renderer,{reference:'data:image/png;base64,'+(await read(referencePage)).toString('base64'),
          actual:'data:image/png;base64,'+publicPair.images['svg-page'],pageSize:pdf.camera.rasterSizes[view.scale+'x'],
          regions:pdf.regions,scale:view.scale,cropId:preferred[0]});
        const sheet=id+'/native-page/'+labelledPdfViewKey(view)+'-sheet.png';await save(sheet,Buffer.from(m.images.sheet,'base64'));
        nativePage.push({...view,measurement:{...m,images:undefined},evaluation:evaluateLabelledPdfPageGuard(m,candidate.evaluation),
          referencePage,actualPage:candidate.artifacts['svg-page'],sheet});
      }
      const numericCase=numeric.cases[i],gates=labelledCombinedGateReport(numericCase.numericPassed,inkRoot,primary,originalPdf,candidatePdf,nativePage);
      gates.numeric.executedChecks=numericCase.checks;
      cases.push({caseId:id,numericPassed:numericCase.numericPassed,inkRoot,primary,originalPdf,candidatePdf,nativePage,sources,
        source:'candidate/'+id+'/source.tikz',scene:'candidate/'+id+'/actual-scene.json',svg:'candidate/'+id+'/actual.svg',
        combined:finishLabelledCombinedGates(gates)});
      console.log(id+': '+cases.at(-1).combined.verdict+' across all six gates.');
    }
    await verifyLabelledSourceHashes({...toolHashes,...numeric.converterSources,...numeric.toolHashes});
    for(const[p,h]of Object.entries(artifacts))assert.equal(sha256(await read(p)),h,p);
    assert.equal((await loadLabelledBorderEvidence()).snapshotSha256,evidence.snapshotSha256);
    const html='<!doctype html><meta charset="utf-8"><h1>Public labeled-border combined trial</h1><p>All gates required; research, no conformance admission.</p><a href="report.json">Report</a>'
      +cases.map(c=>'<h2>'+c.caseId+' / '+c.combined.verdict+'</h2><a href="'+c.source+'">Source</a> / <a href="'+c.scene+'">Scene and spans</a>'
        +c.primary.filter(v=>v.background==='white'&&v.scale===1).map(v=>'<h3>Primary / '+v.frame+'</h3><img src="'+v.images.comparison+'">').join('')
        +c.candidatePdf.filter(v=>v.scale===1).map(v=>'<h3>Ordinary PDF / public / '+v.frame+'</h3><img src="'+v.artifacts.sheet+'">'
          +v.regions.filter(q=>q.crops).map(q=>'<p>'+q.id+'</p><img src="'+q.crops.sheet+'">').join('')).join('')
        +c.nativePage.filter(v=>v.scale===1).map(v=>'<h3>Exact independent native page / '+v.frame+'</h3><img src="'+v.sheet+'">').join('')).join('');
    await save('index.html',html);
    const trialPassed=cases.every(c=>c.combined.passed);
    const report={schemaVersion:1,comparisonKind:'public-labelled-border-combined-trial',completed:true,converterInvoked:true,
      approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',trialPassed,inputs:labelledCombinedInputs,
      snapshotSha256:evidence.snapshotSha256,renderer:renderer.identity,toolHashes,
      numeric:{passed:numeric.numericPassed,checks:1624,report:'candidate/report.json',assemblySha256:numeric.converterAssemblySha256,
        assemblyReferences:numeric.converterAssemblyReferences,converterSources:numeric.converterSources,toolHashes:numeric.toolHashes},cases,
      coverage:{cases:3,numericChecks:1624,inkRootChecks:276,primaryViews:36,primaryLocalObservations:1944,primaryChecks:1980,
        pdfViews:24,pdfLocalObservations:1296,pdfChecks:1392,nativePageViews:12,nativePageLocalObservations:648,nativePageChecks:672},
      agent:{viewer:'index.html',command:'node tools/TikzVisual/trial-labelled-border-combined.mjs',
        firstFailedGate:cases.find(c=>!c.combined.passed)?.combined.firstFailedGate??null},artifacts};
    validateLabelledCombinedTrial(report,inputs,numeric);await publish(report);process.exitCode=trialPassed?0:1;
  }finally{await renderer.browser.close();}
}catch(error){
  process.exitCode=2;console.error(error.stack);await publish({completed:false,phase,converterInvoked:true,
    approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',error:error.message.replaceAll(root,'<repo>'),toolHashes,artifacts});
}
