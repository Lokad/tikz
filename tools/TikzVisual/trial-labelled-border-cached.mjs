// Portable research trial. Independent evidence is checked before conversion.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {canonical,captureLabelledCombinedSources,verifyLabelledSourceHashes} from './labelled-border-combined-common.mjs';
import {loadLabelledCache,labelledCacheSha256,labelledCacheDecodedSha256} from './labelled-border-cache.mjs';
import {remeasureLabelledCache} from './labelled-border-cache-images.mjs';
import {runLabelledResearchTool,saveLabelledImages} from './labelled-border-research.mjs';
import {labelledCombinedGateReport,finishLabelledCombinedGates} from './labelled-border-combined-coverage.mjs';
import {finishLabelledCachedGates,validateLabelledCachedTrial} from './labelled-border-cached-coverage.mjs';
import {labelledBorderDefects,labelledDefectExpectation,mutateLabelledBorderSvg} from './labelled-border-image-defects.mjs';
import {labelledPdfDefects,labelledPdfViewKey} from './labelled-border-pdf-calibration-common.mjs';
import {shapeViews,evaluateShapeTrial} from './shape-primary-trial-policy.mjs';
import {shapePdfViews,evaluateShapePdfTrial} from './shape-pdf-trial-policy.mjs';
import {measureShapePdfPair} from './shape-pdf-image-pair.mjs';
import {saveLabelledPdfImages} from './labelled-border-pdf-viewport.mjs';
import {compareLabelledNativePages,evaluateLabelledPdfPageGuard,labelledPdfGuardExpectation} from './labelled-border-pdf-page-guard.mjs';
import {createRenderer} from './compare.mjs';
import {measureShapePair} from './shape-image-pair.mjs';

const base=path.join(root,'artifacts/labelled-border-cached-trial'),output=path.join(base,'run-'+randomUUID());
const artifacts={},cases=[],primaryControls=[],pdfControls=[];let toolHashes={},phase='source-capture',converterInvoked=false;
const save=(p,b)=>writeArtifact(output,p,b,artifacts),read=p=>readFile(path.join(output,p));
async function publish(r){const b=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(output,'report.json',b);
  await writeArtifact(base,'latest.json',JSON.stringify({completed:r.completed,
    report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');
  return {report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)};}
try{
  toolHashes=await captureLabelledCombinedSources(save,'trial-labelled-border-cached.mjs');
  for(const file of ['labelled-border-cache.mjs','labelled-border-cache-images.mjs','labelled-border-cached-coverage.mjs']){
    const p='tools/TikzVisual/'+file,b=canonical(await readFile(path.join(root,p)));toolHashes[p]=sha256(b);await save('tool-sources/'+p,b);
  }
  await publish({completed:false,phase,converterInvoked:false,approvedImagePolicy:false,toolHashes,artifacts});assert.equal(process.argv.length,2);
  phase='portable-independent-inputs';const e=await loadLabelledCache();
  Object.assign(toolHashes,e.calibration.toolHashes);
  for(const[p,h]of Object.entries(e.calibration.toolHashes)){const b=canonical(await readFile(path.join(root,p)));assert.equal(sha256(b),h);await save('tool-sources/'+p,b);}
  await save('independent-calibration.json.gz',e.compressed);
  const renderer=await createRenderer();
  try{
    phase='independent-png-replay';const independentQualification=await remeasureLabelledCache(e,renderer,(p,b)=>save('independent/'+p,b));
    phase='fresh-public-conversion';converterInvoked=true;
    const numeric=await runLabelledResearchTool(output,'TikzLabelledBorderComparison','candidate',save,artifacts);
    await verifyLabelledSourceHashes({...numeric.converterSources,...numeric.toolHashes});
    const actuals=new Map(),pages=new Map();
    for(let i=0;i<3;i++){
      const p=e.reports.primary.cases[i],pdf=e.reports.pdf.cases[i],id=p.caseId;
      const actual=(await read('candidate/'+id+'/actual.svg')).toString('utf8');actuals.set(id,actual);
      const scene=JSON.parse(await read('candidate/'+id+'/actual-scene.json')),reference=e.get('pdf',pdf.svg.original).toString('utf8');
      const inkRoot=[],sources=p.frame.regions.map(r=>{const op=r.kind==='glyph'?scene.glyphs[r.glyphIndex]:scene.paths[r.nativePathIndex];assert.ok(op);
        return {regionId:r.id,semanticId:op.semanticId,svgElementId:op.svgElementId,source:op.source};});
      for(const r of p.ink.records){const op=r.kind==='glyph'?scene.glyphs[r.glyphIndex]:scene.paths[r.nativePathIndex];assert.ok(op);
        for(const k of ['minX','minY','maxX','maxY']){const observed=op.inkBounds[k],expected=r.bound[k],delta=Math.abs(observed-expected),limit=1e-8;
          inkRoot.push({quantity:r.id+'.'+k,expected,observed,delta,limit,passed:Number.isFinite(observed)&&delta<=limit,source:op.source});}}
      const rootValues=await renderer.page.evaluate(svg=>{const d=new DOMParser().parseFromString(svg,'image/svg+xml');
        if(d.querySelector('parsererror')||d.doctype)throw Error('Invalid public SVG.');return d.documentElement.getAttribute('viewBox').split(/[ ,]+/).map(Number);},actual);
      assert.equal(rootValues.length,4);
      p.rootChecks.forEach((r,k)=>{const observed=rootValues[k],expected=r.serialized,delta=Math.abs(observed-expected),limit=.000001;
        inkRoot.push({quantity:'root.'+r.quantity,expected,observed,delta,limit,passed:Number.isFinite(observed)&&delta<=limit});});
      const preferred=id==='lines'?['glyph-6','glyph-11','path-7']:id==='paths'?['glyph-0','path-8']:['glyph-11','path-6.endpoint-1','path-8'];
      const primary=[],originalPdf=[],candidatePdf=[],nativePage=[];phase=id+'/baseline-primary';
      for(const view of shapeViews){const m=await measureShapePair(renderer,{reference,actual,leftIsDriver:true,origin:p.frame.origin,
        camera:p.frame.camera,regions:p.frame.regions,...view,rightLabel:'Fresh public SVG',cropRegionIds:preferred,cropLimit:3});
        primary.push({...view,...await saveLabelledImages(save,id+'/primary/'+labelledPdfViewKey(view),m),evaluation:evaluateShapeTrial(p.policy,view,m)});}
      phase=id+'/baseline-pdf-native';
      for(const view of shapePdfViews){
        const page=e.get('pdf',pdf.pdfPages[view.scale]),url='data:image/png;base64,'+page.toString('base64');pages.set(id+'/'+view.scale,url);
        const original=await measureShapePdfPair(renderer,{svg:reference,units:'bp',svgOriginBp:pdf.frame.origin,camera:pdf.camera,regions:pdf.regions,
          ...view,pdfPage:url,cropRegionIds:preferred,cropLimit:3,rightLabel:'Original driver SVG'});
        originalPdf.push({...await saveLabelledPdfImages(save,id+'/original-pdf/'+labelledPdfViewKey(view),original),
          evaluation:evaluateShapePdfTrial(pdf.policies.original,view,original)});
        const m=await measureShapePdfPair(renderer,{svg:actual,units:'cssPixels',svgOriginBp:{x:0,y:0},camera:pdf.camera,regions:pdf.regions,
          ...view,pdfPage:url,cropRegionIds:preferred,cropLimit:3,rightLabel:'Fresh public SVG'});
        const row=await saveLabelledPdfImages(save,id+'/public-pdf/'+labelledPdfViewKey(view),m);
        row.evaluation=evaluateShapePdfTrial(pdf.policies.native,view,m);candidatePdf.push(row);
        const anchor=pdf.observations.find(q=>q.mode==='native-ink'&&labelledPdfViewKey(q)===labelledPdfViewKey(view));
        const referencePage='reference-pages/'+id+'/'+labelledPdfViewKey(view)+'.png',nativeBytes=e.get('pdf',anchor.artifacts['svg-page']);await save(referencePage,nativeBytes);
        const native=await compareLabelledNativePages(renderer,{reference:'data:image/png;base64,'+nativeBytes.toString('base64'),
          actual:'data:image/png;base64,'+m.images['svg-page'],pageSize:pdf.camera.rasterSizes[view.scale+'x'],regions:pdf.regions,scale:view.scale,cropId:preferred[0]});
        const sheet=id+'/native-page/'+labelledPdfViewKey(view)+'-sheet.png';await save(sheet,Buffer.from(native.images.sheet,'base64'));
        nativePage.push({...view,measurement:{...native,images:undefined},evaluation:evaluateLabelledPdfPageGuard(native,row.evaluation),
          referencePage,actualPage:row.artifacts['svg-page'],sheet});
      }
      const gates=labelledCombinedGateReport(numeric.cases[i].numericPassed,inkRoot,primary,originalPdf,candidatePdf,nativePage);
      gates.numeric.executedChecks=numeric.cases[i].checks;
      cases.push({caseId:id,numericPassed:numeric.cases[i].numericPassed,inkRoot,primary,originalPdf,candidatePdf,nativePage,sources,
        source:'candidate/'+id+'/source.tikz',scene:'candidate/'+id+'/actual-scene.json',svg:'candidate/'+id+'/actual.svg',combined:finishLabelledCombinedGates(gates)});
      console.log(id+': fresh portable baseline '+cases.at(-1).combined.verdict);
    }
    for(const d of labelledBorderDefects()){
      phase='fresh-primary/'+d.caseId+'/'+d.name;const p=e.reports.primary.cases.find(c=>c.caseId===d.caseId),base=cases.find(c=>c.caseId===d.caseId);
      const changed=await renderer.page.evaluate(mutateLabelledBorderSvg,{source:actuals.get(d.caseId),defect:d,publicCandidate:true,rootBox:p.ink.root});
      const svg='primary-controls/'+d.caseId+'/'+d.name+'.svg';await save(svg,changed);const views=[];
      const pdf=e.reports.pdf.cases.find(c=>c.caseId===d.caseId),reference=e.get('pdf',pdf.svg.original).toString('utf8');
      for(const view of shapeViews.filter(v=>v.background==='white'&&(!d.naturalOnly||v.frame==='natural'))){
        const m=await measureShapePair(renderer,{reference,actual:changed,leftIsDriver:true,origin:p.frame.origin,camera:p.frame.camera,regions:p.frame.regions,
          ...view,cropRegionIds:d.target?[d.target]:[],cropLimit:d.target?1:0,rightLabel:d.name}),verdict=evaluateShapeTrial(p.policy,view,m);
        const target=verdict.checks.find(q=>q.id===(d.target??'whole-picture')),b=base.primary.find(q=>labelledPdfViewKey(q)===labelledPdfViewKey(view));assert.ok(target);
        const exact=sha256(Buffer.from(m.images.actual,'base64'))===artifacts[b.images.actual],expected=labelledDefectExpectation(d,view);
        const passed=expected==='pixel-identical'?verdict.passed&&exact:!verdict.passed&&!target.passed&&!exact;
        views.push({...view,...await saveLabelledImages(save,'primary-controls/'+d.caseId+'/'+d.name+'/'+labelledPdfViewKey(view),m),
          evaluation:verdict,exactBaselinePixels:exact,expectedImageOutcome:expected,expectedOutcomePassed:passed});
      }
      primaryControls.push({...d,svg,numericGatesBypassed:true,targetSource:base.sources.find(q=>q.regionId===d.target)??null,
        views,passed:views.every(o=>o.expectedOutcomePassed)});console.log(phase+': '+primaryControls.at(-1).passed);
    }
    for(const d of labelledPdfDefects()){
      phase='fresh-pdf/'+d.caseId+'/'+d.name;const p=e.reports.pdf.cases.find(c=>c.caseId===d.caseId),base=cases.find(c=>c.caseId===d.caseId);
      const changed=await renderer.page.evaluate(mutateLabelledBorderSvg,{source:actuals.get(d.caseId),defect:d,publicCandidate:true,rootBox:p.ink.root});
      const svg='pdf-controls/'+d.caseId+'/'+d.name+'.svg';await save(svg,changed);const views=[];
      for(const view of shapePdfViews.filter(v=>!d.naturalOnly||v.frame==='natural')){
        const m=await measureShapePdfPair(renderer,{svg:changed,units:'cssPixels',svgOriginBp:{x:0,y:0},camera:p.camera,regions:p.regions,
          ...view,pdfPage:pages.get(d.caseId+'/'+view.scale),cropRegionIds:d.target?[d.target]:[],cropLimit:d.target?1:0,rightLabel:d.name});
        const row=await saveLabelledPdfImages(save,'pdf-controls/'+d.caseId+'/'+d.name+'/'+labelledPdfViewKey(view),m),verdict=evaluateShapePdfTrial(p.policies.native,view,m);
        const referencePage=base.nativePage.find(q=>labelledPdfViewKey(q)===labelledPdfViewKey(view)).referencePage;
        const crop=view.scale===1&&['paths/faint-glyph-loss','transforms/faint-period-loss'].includes(d.caseId+'/'+d.name)?d.target:null;
        const native=await compareLabelledNativePages(renderer,{reference:'data:image/png;base64,'+(await read(referencePage)).toString('base64'),
          actual:'data:image/png;base64,'+m.images['svg-page'],pageSize:p.camera.rasterSizes[view.scale+'x'],regions:p.regions,scale:view.scale,cropId:crop});
        const guard=evaluateLabelledPdfPageGuard(native,verdict),expected=labelledPdfGuardExpectation(d,view),target=guard.checks.find(q=>q.id===(d.target??'whole-picture'));assert.ok(target);
        const exact=native.fullPage.exactRgbaMatch,passed=expected==='pixel-identical'?guard.passed&&exact:!guard.passed&&!target.passed&&!exact;
        let sheet=null;if(native.images){sheet='pdf-controls/'+d.caseId+'/'+d.name+'/'+labelledPdfViewKey(view)+'-native-sheet.png';await save(sheet,Buffer.from(native.images.sheet,'base64'));}
        views.push({...row,evaluation:verdict,guard:{measurement:{...native,images:undefined},evaluation:guard,referencePage,actualPage:row.artifacts['svg-page'],sheet},
          expectedImageOutcome:expected,expectedOutcomePassed:passed});
      }
      pdfControls.push({...d,svg,numericGatesBypassed:true,targetSource:base.sources.find(q=>q.regionId===d.target)??null,
        views,passed:views.every(o=>o.expectedOutcomePassed)});console.log(phase+': '+pdfControls.at(-1).passed);
    }
    const combined=finishLabelledCachedGates(cases,primaryControls,pdfControls);
    await save('index.html','<!doctype html><meta charset="utf-8"><h1>Portable public labeled-border trial</h1><p>All eight gates required; admission pending.</p><a href="report.json">Report</a>'
      +cases.map(c=>'<h2>'+c.caseId+'</h2><a href="'+c.source+'">Source</a> / <a href="'+c.scene+'">Scene and spans</a>'
        +c.primary.filter(v=>v.scale===1&&v.background==='white').map(v=>'<img src="'+v.images.comparison+'">').join('')
        +c.candidatePdf.filter(v=>v.scale===1).map(v=>'<h3>Ordinary PDF / public / '+v.frame+'</h3><img src="'+v.artifacts.sheet+'">').join('')
        +c.nativePage.filter(v=>v.scale===1).map(v=>'<h3>Independent native / public / '+v.frame+'</h3><img src="'+v.sheet+'">').join('')).join('')
      +[...primaryControls,...pdfControls].map(c=>'<h2>'+c.caseId+'/'+c.name+'</h2>'+c.views.filter(v=>v.scale===1).map(v=>
        (v.artifacts?.sheet?'<img src="'+v.artifacts.sheet+'">':'')+v.regions.filter(q=>q.crops).map(q=>'<img src="'+q.crops.sheet+'">').join('')
        +(v.guard?.sheet?'<img src="'+v.guard.sheet+'">':'')).join('')).join(''));
    await verifyLabelledSourceHashes({...toolHashes,...numeric.converterSources,...numeric.toolHashes});
    for(const[p,h]of Object.entries(artifacts))assert.equal(sha256(await read(p)),h,p);
    const report={schemaVersion:1,comparisonKind:'portable-public-labelled-border-trial',completed:true,converterInvoked:true,
      approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',cacheSha256:labelledCacheSha256,decodedSha256:labelledCacheDecodedSha256,
      snapshotSha256:e.calibration.snapshotSha256,renderer:renderer.identity,toolHashes,independentQualification,cases,primaryControls,pdfControls,combined,
      coverage:{cases:3,numericChecks:1624,inkRootChecks:276,primaryViews:36,pdfViews:24,nativePageViews:12,
        primaryControls:26,primaryControlViews:102,pdfControls:32,pdfControlViews:126,visiblePdfRejections:114,exactPdfVisibilityControls:12,pdfOnlyBlindSpotViews:4},
      agent:{viewer:'index.html',firstFailedGate:combined.firstFailedGate,command:'node tools/TikzVisual/trial-labelled-border-cached.mjs'},artifacts};
    validateLabelledCachedTrial(report,e,numeric);const location=await publish(report);process.exitCode=combined.passed?0:1;
    console.log(JSON.stringify({kind:'labelled-border-cached-trial-output',final:true,completed:true,passed:combined.passed,...location}));
    console.log('Portable public labeled-border trial: '+(combined.firstFailedGate??'all eight gates pass'));
  }finally{await renderer.browser.close();}
}catch(error){process.exitCode=2;console.error(error.stack);const location=await publish({completed:false,phase,converterInvoked,
  approvedImagePolicy:false,imageConformanceClaim:false,error:error.message.replaceAll(root,'<repo>'),cases,primaryControls,pdfControls,toolHashes,artifacts});
  console.log(JSON.stringify({kind:'labelled-border-cached-trial-output',final:true,completed:false,passed:false,...location}));}
