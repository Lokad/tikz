// Public baselines consume fixed native limits; image admission remains pending.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root, sha256, outputPath, writeArtifact} from './shape-oracle-bundle.mjs';
import {loadArrowImageCache, arrowImageCacheFile, arrowImageCacheSha256} from './arrow-image-cache.mjs';
import {arrowPublicSourceTools, validateArrowPublicNumeric} from './arrow-public-source-contract.mjs';
import {arrowPublicPrimaryPlan, arrowPublicPdfPlan, evaluateArrowPublicPrimary, evaluateArrowPublicPdf, arrowPublicExactPage, finishArrowPublicBaselines} from './arrow-public-source-policy.mjs';
import {arrowPrimaryRegions} from './arrow-primary-contract.mjs';
import {arrowPrimaryViewKey} from './arrow-primary-policy.mjs';
import {arrowPdfViewKey} from './arrow-pdf-policy.mjs';
import {normalizeArrowViewport} from './arrow-viewport-normalize.mjs';
import {arrowViewportFrameCheck, arrowViewportRegions} from './arrow-viewport-model.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {measureShapePdfPair} from './shape-pdf-image-pair.mjs';
import {measureEdgePdfPair} from './edge-pdf-image-pair.mjs';
import {measureArrowPdfInk, attachArrowPdfInk} from './arrow-pdf-ink.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

assert.equal(process.argv.length,2);
const output = await outputPath(path.join(root,'artifacts/arrow-public-source-baselines/run-'+randomUUID())), artifacts={}, primary=[], pdf=[], frames=[];
const relative = p => path.relative(root,p).split(path.sep).join('/');
const save = (p,b) => writeArtifact(output,p,b,artifacts), json = (p,v) => save(p,JSON.stringify(v)+'\n');
const read = p => readFile(path.join(output,p));
let renderer, phase='native-input', numeric, sourceHashes={}, combined, converterInvoked=false;
async function publish(completed,error) {
  const manifest=Buffer.from(JSON.stringify({schemaVersion:1,artifacts},null,2)+'\n'); await writeArtifact(output,'manifest.json',manifest);
  const report={schemaVersion:1,comparisonKind:'public-arrow-source-baseline-trial',completed,phase,converterInvoked,approvedImagePolicy:false,imageConformanceClaim:false,
    overallVerdict:'pending',cache:{file:'native-cache.bin.gz',sha256:arrowImageCacheSha256},renderer:renderer?.identity,sourceHashes,
    numericReport:numeric?'numeric/report.json':null,frames:'frames.json',primary:'primary.json',pdf:'pdf.json',combined,
    pendingGates:['public-image-only-defect-and-visibility-controls','independent-public-trial-reader','fixed-family-image-admission'],viewer:'index.html',
    manifest:{file:'manifest.json',sha256:sha256(manifest),files:Object.keys(artifacts).length},...(error?{error}:{})};
  const b=Buffer.from(JSON.stringify(report,null,2)+'\n'); await writeArtifact(output,'report.json',b);
  console.log(JSON.stringify({completed,phase,report:relative(path.join(output,'report.json')),sha256:sha256(b),baselinePassed:combined?.passed,firstFailedGate:combined?.firstFailedGate}));
}
try {
  const e=await loadArrowImageCache(), tools=await arrowPublicSourceTools();
  await save('native-cache.bin.gz',await readFile(path.join(root,arrowImageCacheFile)));
  for(const [p,s] of tools){sourceHashes[p]=s.sha256;await save('source-captures/'+p,s.bytes);}
  await json('native-limit-bindings.json',{cacheSha256:arrowImageCacheSha256,sourceReports:e.header.sourceReports,sourceEnvelopes:e.frames.map(f=>({caseId:f.caseId,envelope:f.sourceEnvelope})),
    primaryPolicies:e.primary.policies.map(p=>({caseId:p.id,sha256:sha256(JSON.stringify(p.policy))})),pdfPolicies:e.pdf.policies.map(p=>({caseId:p.caseId,route:p.route,raster:p.raster,sha256:sha256(JSON.stringify(p))}))});
  renderer=await createRenderer();assert.deepEqual(renderer.identity,e.reports.primary.renderer);await installShapeMetrics(renderer);
  phase='public-numeric';converterInvoked=true;
  let command;
  try {command=await promisify(execFile)('dotnet',['run','--project','tools/TikzArrowComparison','-c','Release','--','--out',relative(path.join(output,'numeric'))],{cwd:root,windowsHide:true,timeout:180000,maxBuffer:1000000});}
  catch(error){await save('numeric-command.log',(String(error.stdout??'')+String(error.stderr??'')).replaceAll(root,'<repo>'));if(error.code!==1)throw error;}
  if(command)await save('numeric-command.log',(command.stdout+command.stderr).replaceAll(root,'<repo>').replaceAll(relative(output),'<trial>'));
  const nb=await read('numeric/report.json');numeric=JSON.parse(nb);await validateArrowPublicNumeric(numeric,p=>read('numeric/'+p));
  assert.equal(numeric.snapshotSha256,e.native.snapshotSha256);artifacts['numeric/report.json']=sha256(nb);
  for(const [p,h] of Object.entries(numeric.artifacts))artifacts['numeric/'+p]=h;
  const candidates=new Map();
  for(const f of e.frames){
    const svg=(await read('numeric/'+f.caseId+'/candidate.svg')).toString(),normalized=await normalizeArrowViewport(renderer,svg,'cssPixels',{x:0,y:0},f.paper.camera);
    candidates.set(f.caseId,{svg,scene:normalized.svg,normalization:normalized.proof});
    frames.push({caseId:f.caseId,sourceFrame:arrowViewportFrameCheck(normalized.proof.sourceFrame,f.sourceEnvelope.root),normalization:normalized.proof});
  }
  await json('frames.json',frames);
  for(const v of arrowPublicPrimaryPlan()){
    phase=v.id;const f=e.frames.find(f=>f.caseId===v.caseId),native=v.route==='native-source',folder='views/'+v.id;
    const reference=e.getRole('primary','views/'+v.caseId+'/calibration/source/'+arrowPrimaryViewKey(v)+'/'+(native?'actual':'reference')+'.svg').toString();
    const actual=candidates.get(v.caseId).svg;
    const raw=await measureEdgeTrialPrimary(renderer,{reference,actual,leftIsDriver:!native,origin:native?{x:0,y:0}:f.origin,camera:f.camera,...v,regions:arrowPrimaryRegions(f),cropLimit:v.scale===1&&v.background==='white'?4:0,
      referenceLabel:native?'Native SVG':'PGF SVG',rightLabel:'Public SVG'});
    const {images,crops,...numbers}=raw,files={reference:folder+'/reference.svg',actual:folder+'/actual.svg',numbers:folder+'/numbers.json',images:{},crops:[]};
    await save(files.reference,reference);await save(files.actual,actual);
    for(const [k,b64] of Object.entries(images)){files.images[k]=folder+'/'+k+'.png';await save(files.images[k],Buffer.from(b64,'base64'));}
    for(const c of crops){const q={id:c.id,presentation:c.presentation,images:{}};for(const [k,b64]of Object.entries({...c.paired,sheet:c.sheet})){q.images[k]=folder+'/crop-'+c.id+'-'+k+'.png';await save(q.images[k],Buffer.from(b64,'base64'));}files.crops.push(q);}
    const row={view:v,numbers,files};row.evaluation=evaluateArrowPublicPrimary(e,row);await json(files.numbers,numbers);await json(folder+'/record.json',row);primary.push(row);
    if(v.scale===4&&v.background==='black'&&v.frame==='expanded')console.log('Public primary measured: '+v.caseId+'/'+v.route);
  }
  await json('primary.json',primary);
  for(const v of arrowPublicPdfPlan()){
    phase=v.id;const f=e.frames.find(f=>f.caseId===v.caseId),publicSource=v.route==='public-source',policyRoute=publicSource?'native-source':'original-source';
    const calibrationId=v.caseId+'/calibration/'+policyRoute+'/'+v.raster+'/baseline/'+arrowPdfViewKey(v),baseline=JSON.parse(e.get('views/'+calibrationId+'/record.json'));
    const folder='views/'+v.id,pdfBytes=e.get('reference/'+v.caseId+'/pdf-page-'+v.scale+'x.png'),pdfFile='reference/'+v.caseId+'/pdf-page-'+v.scale+'x.png';await save(pdfFile,pdfBytes);
    const row={view:v,sourceFrame:publicSource?frames.find(q=>q.caseId===v.caseId).sourceFrame:baseline.sourceFrame,pdf:pdfFile};
    for(const type of ['source','scene']){
      const svg=publicSource?(type==='source'?candidates.get(v.caseId).svg:candidates.get(v.caseId).scene):e.get(baseline.files[type].svg).toString();
      const regions=type==='source'?f.paper.regions:arrowViewportRegions(f),measure=v.raster==='relative-viewport'?measureShapePdfPair:measureEdgePdfPair;
      const raw=await measure(renderer,{svg,units:publicSource?'cssPixels':'bp',svgOriginBp:publicSource?{x:0,y:0}:f.origin,camera:f.paper.camera,regions,...v,
        pdfPage:'data:image/png;base64,'+pdfBytes.toString('base64'),cropLimit:0,rightLabel:(publicSource?'Public SVG':'PGF SVG')+' '+type});
      const {images,crops,...values}=raw;assert.equal(crops.length,0);const png=Buffer.from(images['svg-page'],'base64');
      const numbers=attachArrowPdfInk({...values,mode:v.caseId+'/'+policyRoute,converterInvoked:publicSource,approvedImagePolicy:false,imageConformanceClaim:false,
        ...(type==='scene'?{outsideDiagramChangedPixels:raw.fullPage.rawChangedPixels-raw.regions[0].rawChangedPixels}:{})},await measureArrowPdfInk(renderer,[pdfBytes,png],raw.pageSize,regions,v.scale));
      const files={svg:folder+'/'+type+'.svg',numbers:folder+'/'+type+'-numbers.json',images:{}};await save(files.svg,svg);await json(files.numbers,numbers);
      for(const [k,b64]of Object.entries(images)){files.images[k]=folder+'/'+type+'-'+k+'.png';await save(files.images[k],Buffer.from(b64,'base64'));}
      const exact=arrowPublicExactPage(await decodeEdgeOraclePngPair(renderer,[e.get(baseline.files[type].images['svg-page']),png],raw.pageSize,regions.map(r=>r.rasterRectangles[v.scale+'x']),v.scale,'white',true));
      row[type]={numbers,files,evaluation:evaluateArrowPublicPdf(e,v,type,numbers),exact,qualifiedRaster:baseline.files[type].images['svg-page']};
    }
    await json(folder+'/record.json',row);pdf.push(row);
    if(v.frame==='expanded'&&v.scale===4)console.log('Public PDF measured: '+v.caseId+'/'+v.route+'/'+v.raster);
  }
  await json('pdf.json',pdf);combined=finishArrowPublicBaselines(numeric,frames,primary,pdf);await json('combined.json',combined);
  const rows=primary.filter(r=>r.view.scale===1&&r.view.background==='white');
  await save('index.html','<!doctype html><meta charset="utf-8"><title>Public arrow baseline trial</title><style>body{font:16px sans-serif;margin:24px}img{max-width:100%;image-rendering:pixelated}pre{white-space:pre-wrap}</style><h1>Public arrow baselines; admission pending</h1><p>Native-only limits were frozen before public conversion. Every source frame, primary route and source/scene PDF route remains required. Controls and independent saved-image checking remain pending.</p><a href="report.json">Report</a> · <a href="combined.json">Required baseline gates</a><pre>'+JSON.stringify(combined,null,2)+'</pre>'+rows.map(r=>'<article><h2>'+r.view.id+'</h2><img src="'+r.files.images.comparison+'" alt="PGF or native SVG | public SVG | amplified raw difference">'+r.files.crops.map(c=>'<img src="'+c.images.sheet+'" alt="Fixed native crop '+c.id+'">').join('')+'</article>').join('')+'<h2>PDF views</h2><ul>'+pdf.map(r=>'<li><a href="views/'+r.view.id+'/record.json">'+r.view.id+'</a> · source '+r.source.evaluation.passed+' · scene '+r.scene.evaluation.passed+'</li>').join('')+'</ul>');
  assert.deepEqual(await arrowPublicSourceTools(),tools);await validateArrowPublicNumeric(numeric,p=>read('numeric/'+p));phase='complete';await publish(true);
}catch(error){process.exitCode=2;await publish(false,error.message.replaceAll(root,'<repo>'));console.error(error.stack);}finally{await renderer?.browser.close();}
