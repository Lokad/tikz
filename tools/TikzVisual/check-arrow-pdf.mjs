import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Saved-page reader, strict-attempt replay and independent native ink outcomes.
import assert from 'node:assert/strict';
import {readFile,mkdir,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadArrowEvidence} from './arrow-evidence.mjs';
import {buildArrowNativeFrame} from './arrow-native-frame.mjs';
import {arrowCanonical,arrowPdfRegions,arrowMetrics} from './arrow-native-contract.mjs';
import {arrowPaperSources,arrowPaperInputs,arrowPaperSensitivity,arrowPaperSummary,validateArrowPaperReport,arrowPaperRoutes,arrowPaperRasters} from './arrow-pdf-contract.mjs';
import {arrowPdfStrictAttempt,deriveArrowInkPolicy,evaluateArrowInk,arrowPdfViewKey} from './arrow-pdf-policy.mjs';
import {measureArrowPdfInk,attachArrowPdfInk} from './arrow-pdf-ink.mjs';
import {checkArrowPaperPanels} from './arrow-pdf-panels.mjs';
import {runArrowPaperInkControls} from './arrow-pdf-self-test.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {edgePdfSourceFrame} from './curved-edge-pdf-registration.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';
const out=await outputPath(path.join(root,'artifacts/arrow-pdf-checks/run-'+randomUUID()));await mkdir(out,{recursive:true});
let renderer,phase='arguments',inputReportSha256,measurements=0,panels=0,momentRegions=0;const controls=[];
async function publish(r){const b=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(out,'report.json',b);console.log(JSON.stringify({kind:'arrow-PDF-check',completed:r.completed,phase:r.phase,report:path.relative(root,path.join(out,'report.json')).split(path.sep).join('/'),sha256:sha256(b)}));}
try{
 assert.equal(process.argv.length,3);assert.match(process.argv[2],/^artifacts\/arrow-pdf-calibration\/run-[a-f0-9-]+\/report.json$/);const input=path.dirname(path.join(root,process.argv[2]));await outputPath(input);
 assert.ok((await stat(path.join(input,'report.json'))).size<30000000);const bytes=await readFile(path.join(input,'report.json')),r=JSON.parse(bytes);inputReportSha256=sha256(bytes);const read=f=>readFile(path.join(input,f)),e=await loadArrowEvidence(),sources=await arrowPaperSources();
 for(const f of Object.keys(e.snapshot.sourceHashes))if(!sources.has(f)){const bytes=arrowCanonical(await readFile(path.join(root,f)));sources.set(f,{bytes,sha256:sha256(bytes)});}
 assert.deepEqual(r.sourceHashes,Object.fromEntries([...sources].sort(([a],[b])=>a.localeCompare(b)).map(([f,v])=>[f,v.sha256])));
 const integrity=async()=>{for(const[f,v]of sources){assert.equal(sha256(await read('source-captures/'+f)),v.sha256);assert.equal(sha256(arrowCanonical(await readFile(path.join(root,f)))),v.sha256);}for(const[f,h]of Object.entries(r.artifacts)){assert.match(f,/^(?!.*(?:^|\/)\.\.\/)[\w./-]+$/);assert.equal(sha256(await read(f)),h);}};await integrity();
 const frames=e.cases.map(c=>{const f=buildArrowNativeFrame(c.id,e.artifacts.get(c.id+'/plain-reference.svg').toString(),c.metrics);return{...f,paper:arrowPdfRegions(c.metrics,f)};});
 const validate=()=>assert.deepEqual(validateArrowPaperReport(r,e,frames),r.coverage);validate();for(const f of frames){assert.deepEqual(JSON.parse(await read(f.caseId+'/paper-frame.json')),f);
  for(const scale of[1,4])assert.ok((await read('reference/'+f.caseId+'/pdf-page-'+scale+'x.png')).equals(e.artifacts.get(f.caseId+'/plain-pdf-page-'+scale+'x.png')));}
 assert.deepEqual(JSON.parse(await read('policies.json')),r.policies);renderer=await createRenderer();requireRenderer(renderer.identity, r.renderer);await installShapeMetrics(renderer);
 assert.deepEqual(JSON.parse(await read('ink-controls.json')),await runArrowPaperInkControls(renderer));const baselines=[],saved=new Map(),sensitivity=[],visibilityRows=new Map(),visibilityPolicies=new Map();let independentlyDerived;
 for(const o of r.observations){const v=o.view,c=e.cases.find(c=>c.id===v.caseId),f=frames.find(f=>f.caseId===v.caseId),input=arrowPaperInputs(v,c,f,e.artifacts.get(c.id+'/plain-reference.svg').toString()),n=JSON.parse(await read(o.numbers));phase=v.id;
  if(v.kind!=='calibration'&&!independentlyDerived){independentlyDerived={strict:[],fingerprints:[]};for(const frame of frames)for(const route of arrowPaperRoutes){const rows=baselines.filter(q=>q.view.caseId===frame.caseId&&q.view.route===route&&q.view.raster===arrowPaperRasters[0]);
    independentlyDerived.strict.push({caseId:frame.caseId,route,...arrowPdfStrictAttempt(rows,frame.paper.camera,frame.paper.regions,frame.caseId+'/'+route)});
    if(route!=='original-driver')for(const raster of arrowPaperRasters)independentlyDerived.fingerprints.push({caseId:frame.caseId,route,raster,policy:deriveArrowInkPolicy(baselines.filter(q=>q.view.caseId===frame.caseId&&q.view.route===route&&q.view.raster===raster))});}
   assert.deepEqual(independentlyDerived,r.policies);}
  assert.equal((await read(o.svg)).toString(),input.svg);assert.deepEqual(n.view,v);assert.deepEqual(n.crops,o.crops);assert.equal(n.mode,c.id+'/'+v.route);assert.equal(n.rightLabel,input.rightLabel);
  assert.deepEqual([n.converterInvoked,n.approvedImagePolicy,n.imageConformanceClaim],[false,false,false]);for(const repeat of Object.values(n.repeat))assert.deepEqual(repeat,{exactRgbaMatch:true,rawChangedPixels:0,maxRawChannelError:0});
  const sourceFrame=await edgePdfSourceFrame(renderer,input.svg,v.route==='original-driver'?'original-driver':'native-semantic',input.svgOriginBp);assert.deepEqual(n.sourceFrame,sourceFrame);
  assert.deepEqual(n.clipFrame,v.frame==='natural'?sourceFrame:f.paper.regions[0].rectangle);assert.deepEqual(n.pageSize,f.paper.camera.rasterSizes[v.scale+'x']);assert.deepEqual([n.frame,n.scale,n.background],[v.frame,v.scale,'white']);
  assert.equal(o.pdfPage,'reference/'+c.id+'/pdf-page-'+v.scale+'x.png');const pngs=await Promise.all([read(o.pdfPage),read(o.images['svg-page'])]),rectangles=f.paper.regions.map(q=>q.rasterRectangles[v.scale+'x']);
  const decoded=await decodeEdgeOraclePngPair(renderer,pngs,n.pageSize,rectangles,v.scale,'white',true);assert.deepEqual(decoded.fullPage,n.fullPage);assert.equal(n.outsideWholeChangedPixels,n.fullPage.rawChangedPixels-decoded.metrics[0].rawChangedPixels);
  const actual=[n.whole,...n.regions];assert.equal(actual.length,f.paper.regions.length);for(const[i,q]of actual.entries()){const keys=Object.keys(f.paper.regions[i]);assert.deepEqual(Object.fromEntries(keys.map(k=>[k,q[k]])),f.paper.regions[i]);assert.deepEqual(arrowMetrics(q),decoded.metrics[i]);}measurements+=decoded.metrics.length;
  const ink=await measureArrowPdfInk(renderer,pngs,n.pageSize,f.paper.regions,v.scale);for(const[i,q]of actual.entries()){assert.deepEqual(q.inkCoverage,ink[i].inkCoverage);assert.deepEqual(q.inkMoments,ink[i].inkMoments);}momentRegions+=ink.length;
  const independent=attachArrowPdfInk({...n,whole:{...n.whole,...decoded.metrics[0]},regions:n.regions.map((q,i)=>({...q,...decoded.metrics[i+1]}))},ink);
  if(v.kind==='calibration')baselines.push(independent);
  else if(v.kind==='visibility-calibration'){const rows=visibilityRows.get(v.name)??[];rows.push(independent);visibilityRows.set(v.name,rows);}
  else{
   let policy,baseline;if(v.kind==='visibility-missing'){if(!visibilityPolicies.has(v.name))visibilityPolicies.set(v.name,deriveArrowInkPolicy(visibilityRows.get(v.name)));policy=visibilityPolicies.get(v.name);baseline=[...saved.values()].find(q=>q.view.kind==='visibility-calibration'&&q.view.name===v.name&&arrowPdfViewKey(q.view)===arrowPdfViewKey(v));}
   else{policy=independentlyDerived.fingerprints.find(p=>p.caseId===c.id&&p.route===v.route&&p.raster===v.raster).policy;baseline=[...saved.values()].find(q=>q.view.kind==='calibration'&&q.view.caseId===c.id&&q.view.route===v.route&&q.view.raster===v.raster&&arrowPdfViewKey(q.view)===arrowPdfViewKey(v));}
   const evaluation=evaluateArrowInk(policy,independent);assert.deepEqual(n.evaluation,evaluation);const delta=(await decodeEdgeOraclePngPair(renderer,[await read(baseline.images['svg-page']),pngs[1]],n.pageSize,[rectangles[0]],v.scale,'white')).metrics[0];assert.deepEqual(n.svgDelta,delta);
   if(v.kind==='defect'){const check=arrowPaperSensitivity(v,evaluation,delta);assert.deepEqual(n.sensitivity,check);sensitivity.push({view:v,sensitivity:check});}
   if(v.kind==='padded-expanded'){assert.equal(delta.rawChangedPixels,0);assert.equal(evaluation.passed,true);assert.equal(r.artifacts[baseline.images['svg-page']],r.artifacts[o.images['svg-page']]);}
  }
  for(const crop of o.crops)assert.deepEqual(crop.presentation,{background:'white',integerEnlargement:v.scale===1?4:1,rawDifferenceAmplification:16,rasterRectangle:f.paper.regions.find(q=>q.id===crop.id).rasterRectangles[v.scale+'x']});
  panels+=await checkArrowPaperPanels(renderer,{...n,images:o.images,pdfPage:o.pdfPage,crops:o.crops},read,f.paper.regions);saved.set(v.id,o);
  if(v.frame==='expanded'&&v.scale===4)console.log('Saved paper checked: '+v.id);
 }
 assert.deepEqual(Object.fromEntries(visibilityPolicies),r.visibilityPolicies);const summary=arrowPaperSummary(sensitivity);assert.deepEqual(r.sensitivity,summary);assert.deepEqual(JSON.parse(await read('sensitivity.json')),{...summary,rows:sensitivity});
 phase='corruption-controls';const changed=(name,obj,key,value)=>{const old=obj[key],had=Object.hasOwn(obj,key);try{if(value===undefined)delete obj[key];else obj[key]=value;assert.throws(validate);controls.push({name,passed:true});}finally{if(had)obj[key]=old;else delete obj[key];}};
 for(const k of['completed','converterInvoked','approvedImagePolicy','imageConformanceClaim'])changed(k,r,k,!r[k]);changed('missing view',r,'observations',r.observations.slice(0,-1));changed('duplicate view',r,'observations',[r.observations[0],...r.observations.slice(0,-1)]);
 changed('changed paper contract',r.contract,'raster','other');changed('changed camera',r.frames[0].paper.camera.origin,'x',r.frames[0].paper.camera.origin.x+1);changed('missing target crop',r.observations.find(o=>o.view.kind==='defect'),'crops',[]);
 changed('missing image hash',r.artifacts,r.observations[0].images['svg-page'],undefined);changed('added artifact',r.artifacts,'extra.png','0'.repeat(64));changed('false coverage',r.coverage,'observations',295);changed('viewer traversal',r.agent,'viewer','../index.html');changed('unapproved admission',r.agent,'pendingGates',[]);
 validate();await integrity();await loadArrowEvidence();await publish({schemaVersion:1,completed:true,phase:'complete',comparisonKind:'independent-native-arrow-PDF-check',converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
  inputReport:process.argv[2],inputReportSha256,snapshotSha256:e.snapshotSha256,renderer:renderer.identity,measurements,momentRegions,panels,controls,coverage:r.coverage,sensitivity:summary,strictEligibility:r.policies.strict.map(p=>({caseId:p.caseId,route:p.route,state:p.state})),sourceHashes:r.sourceHashes});
}catch(error){process.exitCode=2;await publish({schemaVersion:1,completed:false,phase,error:error.message.replaceAll(root,'<repo>'),converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,inputReportSha256,measurements,momentRegions,panels,controls});console.error(error.stack);}
finally{await renderer?.browser.close();}
