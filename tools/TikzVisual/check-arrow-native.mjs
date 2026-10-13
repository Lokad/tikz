import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Explicit owned run only. Reconstruct native bindings and re-decode every raster.
import assert from 'node:assert/strict';
import {readFile,stat,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadArrowEvidence} from './arrow-evidence.mjs';
import {buildArrowNativeFrame,checkArrowBrowserBoxes} from './arrow-native-frame.mjs';
import {makeArrowNativeSvg,arrowNativeRepresentations} from './arrow-native-svg.mjs';
import {arrowNativeSourceClosure,arrowCanonical,validateArrowNativeCoverage,arrowMetrics} from './arrow-native-contract.mjs';
import {checkArrowNativePanels} from './arrow-native-panels.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

const output=await outputPath(path.join(root,'artifacts/arrow-native-checks/run-'+randomUUID()));await mkdir(output,{recursive:true});
let renderer,phase='arguments',inputReportSha256,metricsRecomputed=0,pagesRecomputed=0,svgReconstructions=0,panelsRecomputed=0;
const controls=[],artifacts={},sourceHashes={};
const save=(p,b)=>writeArtifact(output,p,b,artifacts),relative=p=>path.relative(root,p).split(path.sep).join('/');
async function publish(report){const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',bytes);
 console.log(JSON.stringify({kind:'arrow-native-check',completed:report.completed,phase:report.phase,report:relative(path.join(output,'report.json')),sha256:sha256(bytes)}));}
try{
 assert.equal(process.argv.length,3,'Usage: node tools/TikzVisual/check-arrow-native.mjs artifacts/arrow-native-inspection/run-<uuid>/report.json');
 assert.match(process.argv[2],/^artifacts\/arrow-native-inspection\/run-[a-f0-9-]+\/report.json$/);
 const input=path.dirname(await outputPath(path.dirname(path.join(root,process.argv[2])),'report.json'));
 const reportFile=path.join(input,'report.json');assert.ok((await stat(reportFile)).size<=150000000);
 const bytes=await readFile(reportFile),r=JSON.parse(bytes);inputReportSha256=sha256(bytes);
 const read=async file=>{assert.match(file,/^[a-zA-Z0-9_./-]+$/);assert.ok(!file.startsWith('/')&&!file.split('/').some(p=>['','..','.'].includes(p)));
  const full=await outputPath(input,file),s=await stat(full);assert.ok(s.isFile()&&s.size<=150000000);return readFile(full);};
 await publish({schemaVersion:1,completed:false,phase,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,inputReportSha256});
 phase='sources-and-artifacts';const sources=await arrowNativeSourceClosure(),evidence=await loadArrowEvidence();
 for(const file of Object.keys(evidence.snapshot.sourceHashes))if(!sources.has(file)){const b=arrowCanonical(await readFile(path.join(root,file)));sources.set(file,{bytes:b,sha256:sha256(b)});}
 assert.deepEqual(Object.keys(r.sourceHashes),[...sources.keys()].sort((a,b)=>a.localeCompare(b)),'Incomplete transitive source capture.');
 for(const[file,value]of sources){assert.equal(r.sourceHashes[file],value.sha256);assert.equal(sha256(await read('source-captures/'+file)),value.sha256);sourceHashes[file]=value.sha256;
  await save('source-captures/'+file,value.bytes);}
 const integrity=async()=>{
  assert.equal(sha256(await readFile(reportFile)),inputReportSha256,'Native report changed during check.');
  for(const[file,hash]of Object.entries(r.artifacts)){assert.match(hash,/^[a-f0-9]{64}$/);assert.equal(sha256(await read(file)),hash,'Changed saved native artifact: '+file);}
  for(const[file,value]of sources)assert.equal(sha256(arrowCanonical(await readFile(path.join(root,file)))),value.sha256,'Source changed during check: '+file);
 };await integrity();
 for(const[file,b]of evidence.artifacts)assert.ok(b.equals(await read('reference/'+file)),'Native reference bytes changed.');
 assert.equal(sha256(await read('reference/snapshot.json')),evidence.snapshotSha256);
 phase='native-reconstruction';const frames=[];
 for(const c of evidence.cases){const f=buildArrowNativeFrame(c.id,evidence.artifacts.get(c.id+'/plain-reference.svg').toString('utf8'),c.metrics);frames.push(f);
  assert.deepEqual(JSON.parse(await read(c.id+'/frame.json')),f);
 }
 const validate=()=>{const coverage=validateArrowNativeCoverage(r,evidence,frames);assert.deepEqual(r.coverage,coverage);
  for(const o of[...r.observations,...r.pdfObservations])for(const file of Object.values(o.images))assert.match(r.artifacts[file]??'',/^[a-f0-9]{64}$/);
  for(const o of r.observations)for(const c of o.crops)for(const file of Object.values(c.images))assert.match(r.artifacts[file]??'',/^[a-f0-9]{64}$/);
  for(const file of ['index.html',...r.derivations.flatMap(d=>[d.svg,d.instructions])])assert.match(r.artifacts[file]??'',/^[a-f0-9]{64}$/);
 };validate();
 for(const d of r.derivations){assert.equal(d.svg,d.id+'/native.svg');assert.equal(d.instructions,d.id+'/instructions.json');
  const c=evidence.cases.find(c=>c.id===d.caseId),f=frames.find(f=>f.caseId===d.caseId),variant=arrowNativeRepresentations.find(v=>v.name===d.variant),result=makeArrowNativeSvg(c.metrics,f,variant,d.rootMode);
  assert.equal((await read(d.svg)).toString('utf8'),result.svg,'Saved reconstruction changed.');
  assert.deepEqual(JSON.parse(await read(d.instructions)),JSON.parse(JSON.stringify(result.instructions)));assert.equal(d.serializationChecks,result.instructions.checks.length);svgReconstructions++;
 }
 phase='browser';renderer=await createRenderer();requireRenderer(renderer.identity, r.renderer, 'Saved rasterizer identity changed.');await installShapeMetrics(renderer);
 for(const f of frames){const actual=await checkArrowBrowserBoxes(renderer,f),row=r.browserChecks.find(b=>b.caseId===f.caseId);assert.deepEqual(row.checks,actual);
  assert.deepEqual(JSON.parse(await read(f.caseId+'/browser-boxes.json')),actual);}
 phase='saved-primary';
 for(const o of r.observations){const f=frames.find(f=>f.caseId===o.caseId),size={width:f.camera.width*o.scale,height:f.camera.height*o.scale};
  const rectangles=[undefined,...o.regions.map(q=>Object.fromEntries(Object.entries(q.rectangle).map(([k,v])=>[k,v*o.scale])))];
  const result=await decodeEdgeOraclePngPair(renderer,await Promise.all([read(o.images.reference),read(o.images.actual)]),size,rectangles,o.scale,o.background);
  assert.deepEqual(result.metrics[0],o.metrics);for(const [i,region]of o.regions.entries())assert.deepEqual(result.metrics[i+1],arrowMetrics(region));
  metricsRecomputed+=result.metrics.length;panelsRecomputed+=await checkArrowNativePanels(renderer,o,read,f);
  if(o.scale===4&&o.frame==='expanded'&&o.background==='black')console.log('Saved primary checked: '+o.caseId+'/'+o.variant+'/'+o.rootMode);
 }
 phase='saved-pdf';
 for(const o of r.pdfObservations){const f=frames.find(f=>f.caseId===o.caseId),rows=[o.whole,...o.regions],rectangles=rows.map(q=>q.rasterRectangles[o.scale+'x']);
  const native=evidence.cases.find(c=>c.id===o.caseId);assert.equal(o.pdfPage,'reference/'+o.caseId+'/plain-pdf-page-'+o.scale+'x.png');assert.deepEqual(o.pageSize,native.metrics.pdfCamera.rasterSizes[o.scale].size);
  const result=await decodeEdgeOraclePngPair(renderer,await Promise.all([read(o.pdfPage),read(o.images['svg-page'])]),o.pageSize,rectangles,o.scale,'white',true);
  assert.deepEqual(result.fullPage,o.fullPage);for(const [i,row]of rows.entries())assert.deepEqual(result.metrics[i],arrowMetrics(row));
  assert.equal(result.fullPage.rawChangedPixels-result.metrics[0].rawChangedPixels,o.outsideWholeChangedPixels);
  metricsRecomputed+=result.metrics.length;pagesRecomputed++;panelsRecomputed+=await checkArrowNativePanels(renderer,o,read,f);
  if(o.scale===4&&o.frame==='expanded')console.log('Saved PDF checked: '+o.caseId+'/'+o.route);
 }
 phase='corruption-controls';
 function changed(name,object,key,value){const had=Object.hasOwn(object,key),old=object[key];try{if(value===undefined)delete object[key];else object[key]=value;
   assert.throws(validate,undefined,'Accepted corruption: '+name);controls.push({name,expected:'reject',passed:true});}finally{if(had)object[key]=old;else delete object[key];}}
 for(const k of['completed','converterInvoked','approvedImagePolicy','imageConformanceClaim'])changed('wrong role '+k,r,k,!r[k]);
 changed('false admission',r,'overallVerdict','passed');changed('changed snapshot',r,'snapshotSha256','0'.repeat(64));
 changed('missing view',r,'observations',r.observations.slice(0,-1));changed('duplicate view',r,'observations',[r.observations[0],...r.observations.slice(0,-1)]);
 changed('missing PDF view',r,'pdfObservations',r.pdfObservations.slice(0,-1));changed('missing derivation',r,'derivations',r.derivations.slice(0,-1));
 changed('changed native camera',r.frames[0].camera,'width',r.frames[0].camera.width+1);
 changed('missing paint',r.frames[0],'records',r.frames[0].records.slice(0,-1));
 changed('missing local region',r.observations[0],'regions',r.observations[0].regions.slice(0,-1));
 changed('changed local rectangle',r.observations[0].regions[1].rectangle,'x',r.observations[0].regions[1].rectangle.x+1);
 changed('reference repeat',r.observations[0].repeat,'rawChangedPixels',1);changed('actual repeat',r.observations[0].actualRepeat,'rawChangedPixels',1);
 changed('negative raw metric',r.observations[0].metrics,'rawChangedPixels',-1);changed('not finite metric',r.observations[0].metrics,'meanForegroundChannelError',NaN);
 changed('changed topology threshold',r.observations[0].metrics.topology,'threshold',17);
 changed('changed actual natural frame',r.observations[0].naturalFrames.actual,'x',r.observations[0].naturalFrames.actual.x+1);
 changed('changed reference natural frame',r.observations[0].naturalFrames.reference,'height',r.observations[0].naturalFrames.reference.height+1);
 changed('changed browser limit',r.browserChecks[0].checks[0],'limit',1);changed('false browser pass',r.browserChecks[0].checks[0],'passed',false);
 changed('PDF repeat',r.pdfObservations[0].repeat.svg,'rawChangedPixels',1);changed('hidden outside differences',r.pdfObservations[0],'outsideWholeChangedPixels',1);
 changed('PDF source frame',r.pdfObservations[0].sourceFrame,'width',r.pdfObservations[0].sourceFrame.width+1);
 changed('PDF viewport',r.pdfObservations[0].clipFrame,'x',r.pdfObservations[0].clipFrame.x+1);
 changed('missing PDF region',r.pdfObservations[0],'regions',r.pdfObservations[0].regions.slice(0,-1));
 changed('changed PDF raster',r.pdfObservations[0].whole.rasterRectangles['1x'],'width',r.pdfObservations[0].whole.rasterRectangles['1x'].width+1);
 changed('false coverage count',r.coverage,'primaryViews',575);changed('missing viewer',r.agent,'viewer',undefined);changed('viewer traversal',r.agent,'viewer','../index.html');
 changed('false required failure',r.agent,'firstRequiredFailure','passed');changed('missing paired tip',r.agent,'rankedRegions',r.agent.rankedRegions.slice(0,-1));
 changed('lost matching scale',r.agent.rankedRegions[0],'matchingScale',undefined);
 changed('invented source span',r.agent.rankedRegions[0].attribution,'candidateSourceSpan',{start:1,length:1});
 changed('missing image hash',r.artifacts,r.observations[0].images.reference,undefined);changed('bad image hash',r.artifacts,r.observations[0].images.reference,'bad');
 changed('missing native artifact hash',r.artifacts,'reference/snapshot.json',undefined);
 changed('unbound extra artifact',r.artifacts,'unbound.json','0'.repeat(64));
 const tipObservation=r.observations.find(o=>o.crops.length);changed('missing tip crop',tipObservation,'crops',tipObservation.crops.slice(0,-1));
 changed('crop smoothing/resizing',tipObservation.crops[0].presentation,'integerEnlargement',3);
 validate();phase='final-integrity';await integrity();await loadArrowEvidence();
 assert.equal(svgReconstructions,48);assert.equal(pagesRecomputed,120);
 await publish({schemaVersion:1,completed:true,phase:'complete',comparisonKind:'independent-native-arrow-saved-check',converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
  inputReport:process.argv[2],inputReportSha256,snapshotSha256:evidence.snapshotSha256,renderer:renderer.identity,
  metricsRecomputed,pagesRecomputed,svgReconstructions,panelsRecomputed,controls,coverage:r.coverage,sourceHashes,artifacts});
}catch(error){process.exitCode=2;await publish({schemaVersion:1,completed:false,phase,error:error.message.replaceAll(root,'<repo>'),converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
 inputReportSha256,metricsRecomputed,pagesRecomputed,svgReconstructions,panelsRecomputed,controls,artifacts});console.error(error.stack);}
finally{await renderer?.browser.close();}
