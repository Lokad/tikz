// Ordinary native pages, fixed registration and separately retained raster routes.
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadArrowEvidence} from './arrow-evidence.mjs';
import {buildArrowNativeFrame} from './arrow-native-frame.mjs';
import {arrowCanonical,arrowPdfRegions} from './arrow-native-contract.mjs';
import {arrowPrimaryDefects,arrowPrimaryVisibility} from './arrow-primary-defects.mjs';
import {arrowPaperPlan,arrowPaperInputs,arrowPaperSources,arrowPaperSensitivity,arrowPaperSummary,validateArrowPaperReport,arrowPaperRoutes,arrowPaperRasters} from './arrow-pdf-contract.mjs';
import {arrowPdfContract,arrowPdfViewKey,arrowPdfStrictAttempt,deriveArrowInkPolicy,evaluateArrowInk} from './arrow-pdf-policy.mjs';
import {measureArrowPdfInk,attachArrowPdfInk} from './arrow-pdf-ink.mjs';
import {runArrowPaperInkControls} from './arrow-pdf-self-test.mjs';
import {measureShapePdfPair} from './shape-pdf-image-pair.mjs';
import {measureEdgePdfPair} from './edge-pdf-image-pair.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';
assert.equal(process.argv.length,2);const out=await outputPath(path.join(root,'artifacts/arrow-pdf-calibration/run-'+randomUUID()));await mkdir(out,{recursive:true});
const artifacts={},sourceHashes={},frames=[],observations=[],baselineRows=[],sensitivity=[],visibilityRows=new Map(),visibilityPolicies=new Map();let renderer,evidence,policies,phase='sources';
const save=(f,b)=>writeArtifact(out,f,b,artifacts),json=(f,v)=>save(f,JSON.stringify(v,null,2)+'\n'),read=f=>readFile(path.join(out,f));
async function publish(r){const bytes=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(out,'report.json',bytes);console.log(JSON.stringify({kind:'arrow-PDF-calibration',completed:r.completed,phase:r.phase,report:path.relative(root,path.join(out,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));}
try{
 await publish({schemaVersion:1,completed:false,phase,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false});evidence=await loadArrowEvidence();const sources=await arrowPaperSources();
 for(const f of Object.keys(evidence.snapshot.sourceHashes))if(!sources.has(f)){const bytes=arrowCanonical(await readFile(path.join(root,f)));sources.set(f,{bytes,sha256:sha256(bytes)});}
 for(const[f,v]of [...sources].sort(([a],[b])=>a.localeCompare(b))){sourceHashes[f]=v.sha256;await save('source-captures/'+f,v.bytes);}
 for(const c of evidence.cases){const f=buildArrowNativeFrame(c.id,evidence.artifacts.get(c.id+'/plain-reference.svg').toString(),c.metrics);f.paper=arrowPdfRegions(c.metrics,f);frames.push(f);await json(c.id+'/paper-frame.json',f);
  for(const scale of[1,4])await save('reference/'+c.id+'/pdf-page-'+scale+'x.png',evidence.artifacts.get(c.id+'/plain-pdf-page-'+scale+'x.png'));}
 renderer=await createRenderer();await installShapeMetrics(renderer);await json('ink-controls.json',await runArrowPaperInkControls(renderer));
 for(const view of arrowPaperPlan()){
  if(view.kind!=='calibration'&&!policies){policies={strict:[],fingerprints:[]};for(const f of frames)for(const route of arrowPaperRoutes){const rows=baselineRows.filter(r=>r.view.caseId===f.caseId&&r.view.route===route&&r.view.raster===arrowPaperRasters[0]);
    policies.strict.push({caseId:f.caseId,route,...arrowPdfStrictAttempt(rows,f.paper.camera,f.paper.regions,f.caseId+'/'+route)});
    if(route!=='original-driver')for(const raster of arrowPaperRasters)policies.fingerprints.push({caseId:f.caseId,route,raster,policy:deriveArrowInkPolicy(baselineRows.filter(r=>r.view.caseId===f.caseId&&r.view.route===route&&r.view.raster===raster))});}
   await json('policies.json',policies);console.log(JSON.stringify({strictEligibility:policies.strict.map(p=>({caseId:p.caseId,route:p.route,state:p.state}))}));}
  phase=view.id;const c=evidence.cases.find(c=>c.id===view.caseId),f=frames.find(f=>f.caseId===c.id),input=arrowPaperInputs(view,c,f,evidence.artifacts.get(c.id+'/plain-reference.svg').toString());const svg=view.id+'/input.svg';await save(svg,input.svg);
  const pdfPage='reference/'+c.id+'/pdf-page-'+view.scale+'x.png',pdfBytes=await read(pdfPage),control=view.kind==='defect'?arrowPrimaryDefects.find(d=>d.name===view.name):view.kind==='visibility-missing'?arrowPrimaryVisibility.find(d=>d.name===view.name):null;
  const raw=await(view.raster===arrowPaperRasters[0]?measureShapePdfPair:measureEdgePdfPair)(renderer,{...input,pdfPage:'data:image/png;base64,'+pdfBytes.toString('base64'),camera:f.paper.camera,regions:f.paper.regions,
   scale:view.scale,frame:view.frame,cropLimit:control?1:0,cropRegionIds:control?[control.target]:[]});
  for(const r of Object.values(raw.repeat))assert.deepEqual(r,{exactRgbaMatch:true,rawChangedPixels:0,maxRawChannelError:0});
  const result=attachArrowPdfInk(raw,await measureArrowPdfInk(renderer,[pdfBytes,Buffer.from(raw.images['svg-page'],'base64')],raw.pageSize,f.paper.regions,view.scale));
  const {images:rawImages,crops:rawCrops,...values}=result,images={},crops=[];for(const[k,png]of Object.entries(rawImages)){images[k]=view.id+'-'+k+'.png';await save(images[k],Buffer.from(png,'base64'));}
  for(const crop of rawCrops){const saved={id:crop.id,presentation:crop.presentation,images:{}};for(const[k,png]of Object.entries(crop.images)){saved.images[k]=view.id+'/crop-'+crop.id+'-'+k+'.png';await save(saved.images[k],Buffer.from(png,'base64'));}crops.push(saved);}
  const numbers={...values,view,mode:c.id+'/'+view.route,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,rightLabel:input.rightLabel,crops};
  if(view.kind==='calibration')baselineRows.push(numbers);
  else if(view.kind==='visibility-calibration'){const rows=visibilityRows.get(view.name)??[];rows.push(numbers);visibilityRows.set(view.name,rows);}
  else{
   let policy,baseline;if(view.kind==='visibility-missing'){if(!visibilityPolicies.has(view.name))visibilityPolicies.set(view.name,deriveArrowInkPolicy(visibilityRows.get(view.name)));policy=visibilityPolicies.get(view.name);
    baseline=observations.find(o=>o.view.kind==='visibility-calibration'&&o.view.name===view.name&&arrowPdfViewKey(o.view)===arrowPdfViewKey(view));}
   else{policy=policies.fingerprints.find(p=>p.caseId===c.id&&p.route===view.route&&p.raster===view.raster).policy;baseline=observations.find(o=>o.view.kind==='calibration'&&o.view.caseId===c.id&&o.view.route===view.route&&o.view.raster===view.raster&&arrowPdfViewKey(o.view)===arrowPdfViewKey(view));}
   const evaluation=evaluateArrowInk(policy,numbers);numbers.evaluation=evaluation;
   const q=f.paper.regions[0].rasterRectangles[view.scale+'x'];numbers.svgDelta=(await decodeEdgeOraclePngPair(renderer,[await read(baseline.images['svg-page']),await read(images['svg-page'])],result.pageSize,[q],view.scale,'white')).metrics[0];
   if(view.kind==='defect'){numbers.sensitivity=arrowPaperSensitivity(view,evaluation,numbers.svgDelta);sensitivity.push({view,sensitivity:numbers.sensitivity});}
   if(view.kind==='padded-expanded'){assert.equal(numbers.svgDelta.rawChangedPixels,0);assert.equal(evaluation.passed,true);assert.equal(artifacts[baseline.images['svg-page']],artifacts[images['svg-page']]);}
  }
  const numbersPath=view.id+'/numbers.json';await json(numbersPath,numbers);observations.push({view,numbers:numbersPath,svg,pdfPage,images,crops});
  if(view.scale===4&&view.frame===(control?.frames?.[0]??'expanded'))console.log('Paper evidence: '+view.id);
 }
 phase='summary';const summary=arrowPaperSummary(sensitivity);await json('sensitivity.json',{...summary,rows:sensitivity});
 await save('index.html','<!doctype html><html lang="en"><meta charset="utf-8"><title>Native arrow PDF observations</title><style>body{font:16px sans-serif;margin:24px}img{max-width:100%;image-rendering:pixelated}section{border-top:1px solid #ccc}</style><h1>Native arrow ordinary-PDF observations; admission pending</h1><p>Original page pixels and registration are unchanged. Both relative and absolute viewport observations are retained. Strict lost-edge failures are not relaxed. SVG ink fingerprints are prospective sensitivity guards.</p><a href="report.json">Report</a> · <a href="policies.json">Strict attempts and ink fingerprints</a> · <a href="sensitivity.json">Image-only outcomes</a>'+observations.filter(o=>o.view.scale===1).map(o=>'<section><h2>'+o.view.id+'</h2><img src="'+(o.crops[0]?.images.sheet??o.images.sheet)+'" alt="Ordinary PDF, native SVG and amplified difference"><a href="'+o.numbers+'">Measurements and registration</a></section>').join('')+'</html>\n');
 const report={schemaVersion:1,completed:true,phase:'complete',comparisonKind:'native-arrow-PDF-observations',converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,snapshotSha256:evidence.snapshotSha256,
  contract:arrowPdfContract,renderer:renderer.identity,sourceHashes,frames,observations,policies,visibilityPolicies:Object.fromEntries(visibilityPolicies),sensitivity:summary,
  agent:{viewer:'index.html',pendingGates:['strict-PDF-eligibility','immutable-qualification','public-combined-admission'],interpretation:'Native PDF observations and prospective SVG ink fingerprints only. Original lost-edge and viewport failures are retained. Neither raster route grants conformance.'},artifacts};
 report.coverage=validateArrowPaperReport(report,evidence,frames);for(const[f,v]of sources)assert.equal(sha256(arrowCanonical(await readFile(path.join(root,f)))),v.sha256);await loadArrowEvidence();
 for(const[f,h]of Object.entries(artifacts))assert.equal(sha256(await read(f)),h);await publish(report);
}catch(error){process.exitCode=2;await publish({schemaVersion:1,completed:false,phase,error:error.message.replaceAll(root,'<repo>'),converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,sourceHashes,frames,observations,artifacts});console.error(error.stack);}
finally{await renderer?.browser.close();}
