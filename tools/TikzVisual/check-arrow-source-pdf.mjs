import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadArrowSourcePdfOwned,arrowSourcePdfSources,arrowSourcePdfEntry} from './arrow-source-pdf-contract.mjs';
import {arrowSourcePdfPlan,arrowSourcePdfInputs,arrowSourcePdfBaseline,buildArrowSourcePdfExperiment,arrowSourcePdfPolicyIndex,arrowSourcePdfVisibilityIndex} from './arrow-source-pdf-model.mjs';
import {arrowSourcePrimaryReference} from './arrow-source-primary-reference.mjs';
import {arrowViewportRegions} from './arrow-viewport-model.mjs';
import {arrowMetrics} from './arrow-native-contract.mjs';
import {measureArrowPdfInk,attachArrowPdfInk} from './arrow-pdf-ink.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {edgePdfSourceFrame} from './curved-edge-pdf-registration.mjs';
import {checkArrowPaperPanels} from './arrow-pdf-panels.mjs';
import {checkArrowFaintFocus} from './arrow-faint-panels.mjs';
import {arrowSourcePdfFocus,arrowSourcePdfIndex} from './arrow-source-pdf-panels.mjs';
import {runArrowSourcePdfControls,runArrowSourcePdfBrowserControls} from './arrow-source-pdf-self-test.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

const out=await outputPath(path.join(root,'artifacts/arrow-source-pdf-checks/run-'+randomUUID()));await mkdir(out,{recursive:true});
let renderer,phase='arguments',inputReportSha256,measurements=0,momentRegions=0,fullPageMeasurements=0,deltaChecks=0,panels=0;let controls=[];
async function publish(r){const b=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(out,'report.json',b);console.log(JSON.stringify({kind:'arrow-source-PDF-check',completed:r.completed,phase:r.phase,report:path.relative(root,path.join(out,'report.json')).split(path.sep).join('/'),sha256:sha256(b)}));}
try{
 assert.equal(process.argv.length,3);const owned=await loadArrowSourcePdfOwned(process.argv[2]);inputReportSha256=owned.sha256;
 const {input,files}=owned,records=[],bases=new Map(),expectedArtifacts={};
 const read=async f=>{assert.ok(files.has(f),f);return files.get(f);},expectedJson=(f,v)=>expectedArtifacts[f]=sha256(Buffer.from(JSON.stringify(v)+'\n'));
 for(const [f,b]of input.files)expectedArtifacts['upstream/'+f]=sha256(b);for(const [f,s]of owned.sources)expectedArtifacts['source-captures/'+f]=s.sha256;
 renderer=await createRenderer();assert.deepEqual(renderer.identity,owned.report.renderer);await installShapeMetrics(renderer);
 controls=[...await runArrowSourcePdfControls(),...await runArrowSourcePdfBrowserControls(renderer)];expectedJson('controls.json',controls);
 for(const c of input.evidence.cases){
  const f=input.frames.find(f=>f.caseId===c.id),base=await arrowSourcePrimaryReference(renderer,c.metrics,f,input.evidence.artifacts.get(c.id+'/plain-reference.svg').toString());bases.set(c.id,base);
  const framing={envelope:base.envelope,originalFrame:base.originalFrame,referenceProof:base.referenceProof,actualProof:base.actualProof};
  assert.deepEqual(JSON.parse(await read('cases/'+c.id+'/framing.json')),framing);assert.deepEqual(framing,JSON.parse(input.files.get('primary/cases/'+c.id+'/framing.json')));
  assert.deepEqual(JSON.parse(await read('cases/'+c.id+'/paper.json')),f.paper);expectedJson('cases/'+c.id+'/framing.json',framing);expectedJson('cases/'+c.id+'/paper.json',f.paper);
  for(const scale of [1,4]){const file='reference/'+c.id+'/pdf-page-'+scale+'x.png',b=input.evidence.artifacts.get(c.id+'/plain-pdf-page-'+scale+'x.png');assert.deepEqual(await read(file),b);expectedArtifacts[file]=sha256(b);}
 }
 for(const v of arrowSourcePdfPlan()){
  phase=v.id;const f=input.frames.find(f=>f.caseId===v.caseId),physical=await arrowSourcePdfInputs(renderer,v,f,bases.get(v.caseId)),folder='views/'+v.id;
  const meta=JSON.parse(await read(folder+'/record.json')),expectedFiles={pdf:'reference/'+v.caseId+'/pdf-page-'+v.scale+'x.png'};
  const record={view:v,sourceFrame:physical.sourceFrame,normalization:physical.normalization,extra:physical.extra,files:null,sourceDelta:null,sceneDelta:null};
  assert.deepEqual(meta.view,v);assert.deepEqual(meta.sourceFrame,physical.sourceFrame);assert.deepEqual(meta.normalization,physical.normalization);assert.deepEqual(meta.extra,physical.extra);
  for(const type of ['source','scene']){
   const svg=type==='source'?physical.svg:physical.scene,regions=type==='source'?f.paper.regions:arrowViewportRegions(f);
   const expected={svg:folder+'/'+type+'.svg',numbers:folder+'/'+type+'-numbers.json',images:{}};
   for(const key of ['svg-page','pdf','svg','difference','amplified','overlay',...(v.scale===1?['sheet']:[])])expected.images[key]=folder+'/'+type+'-'+key+'.png';
   expectedFiles[type]=expected;assert.deepEqual(meta.files[type],expected);assert.equal((await read(expected.svg)).toString(),svg);expectedArtifacts[expected.svg]=sha256(Buffer.from(svg));
   const n=JSON.parse(await read(expected.numbers));assert.deepEqual(n.view,v);assert.equal(n.mode,v.caseId+'/'+v.route);
   assert.deepEqual([n.converterInvoked,n.approvedImagePolicy,n.imageConformanceClaim],[false,false,false]);
   assert.equal(n.rightLabel,physical.rightLabel+(type==='scene'?' scene':''));
   for(const repeat of Object.values(n.repeat))assert.deepEqual(repeat,{exactRgbaMatch:true,rawChangedPixels:0,maxRawChannelError:0});
   assert.deepEqual(Object.keys(n.repeat).sort(),['pdf','svg']);
   const sourceFrame=await edgePdfSourceFrame(renderer,svg,v.route==='original-source'?'original-driver':'native-semantic',physical.svgOriginBp);
   assert.deepEqual(n.sourceFrame,sourceFrame);assert.deepEqual(n.clipFrame,v.frame==='natural'?sourceFrame:regions[0].rectangle);
   assert.deepEqual(n.pageSize,f.paper.camera.rasterSizes[v.scale+'x']);assert.deepEqual([n.frame,n.scale,n.background],[v.frame,v.scale,'white']);
   const pngs=[await read(expectedFiles.pdf),await read(expected.images['svg-page'])],rectangles=regions.map(q=>q.rasterRectangles[v.scale+'x']);
   const decoded=await decodeEdgeOraclePngPair(renderer,pngs,n.pageSize,rectangles,v.scale,'white',true);
   assert.deepEqual(n.fullPage,decoded.fullPage);fullPageMeasurements++;assert.equal(n.outsideWholeChangedPixels,decoded.fullPage.rawChangedPixels-decoded.metrics[0].rawChangedPixels);
   if(type==='scene')assert.equal(n.outsideDiagramChangedPixels,decoded.fullPage.rawChangedPixels-decoded.metrics[1].rawChangedPixels);
   const actual=[n.whole,...n.regions];assert.equal(actual.length,regions.length);
   for(const [i,q]of actual.entries()){for(const [k,value]of Object.entries(regions[i]))assert.deepEqual(q[k],value);assert.deepEqual(arrowMetrics(q),decoded.metrics[i]);}
   measurements+=decoded.metrics.length;
   const ink=await measureArrowPdfInk(renderer,pngs,n.pageSize,regions,v.scale);momentRegions+=ink.length;
   for(const [i,q]of actual.entries()){assert.deepEqual(q.inkCoverage,ink[i].inkCoverage);assert.deepEqual(q.inkMoments,ink[i].inkMoments);}
   record[type]=attachArrowPdfInk({...n,whole:{...n.whole,...decoded.metrics[0]},regions:n.regions.map((r,i)=>({...r,...decoded.metrics[i+1]}))},ink);
   if(!['calibration','visibility-calibration'].includes(v.kind)){
    const baseline=arrowSourcePdfBaseline(records,v);assert.ok(baseline);
    record[type+'Delta']=(await decodeEdgeOraclePngPair(renderer,[await read(baseline.files[type].images['svg-page']),pngs[1]],n.pageSize,[{x:0,y:0,...n.pageSize}],v.scale,'white')).metrics[0];deltaChecks++;
   }
   panels+=await checkArrowPaperPanels(renderer,{...n,images:expected.images,pdfPage:expectedFiles.pdf,crops:[]},read,regions);
   expectedJson(expected.numbers,n);for(const file of Object.values(expected.images))expectedArtifacts[file]=owned.manifest.artifacts[file];
  }
  assert.deepEqual(meta.files,expectedFiles);record.files=expectedFiles;
  assert.deepEqual(meta.sourceDelta,record.sourceDelta);assert.deepEqual(meta.sceneDelta,record.sceneDelta);expectedJson(folder+'/record.json',meta);records.push(record);
  if(v.frame==='expanded'&&v.scale===4)console.log('Saved source PDF checked: '+v.id);
 }
 phase='coupled-gates';const model=buildArrowSourcePdfExperiment(records,input.frames);
 for(const e of model.evaluations){const f='views/'+e.view.id+'/gates.json';assert.deepEqual(JSON.parse(await read(f)),e);expectedJson(f,e);}
 const policyIndex=arrowSourcePdfPolicyIndex(model.policies);for(const [i,p]of model.policies.entries())expectedJson(policyIndex[i].file,p);
 expectedJson('baseline-policies.json',policyIndex);for(const p of model.visibility)expectedJson('visibility/'+p.name+'/'+p.raster+'/policy.json',p);
 expectedJson('policies.json',{policies:policyIndex,visibility:arrowSourcePdfVisibilityIndex(model.visibility)});expectedJson('summary.json',{summary:model.summary,eligibility:model.eligibility});
 const focus=arrowSourcePdfFocus(model,records,input.frames);assert.deepEqual(JSON.parse(await read('focus.json')),focus);expectedJson('focus.json',focus);
 for(const p of focus){panels+=await checkArrowFaintFocus(renderer,p,read);for(const file of Object.values(p.images))expectedArtifacts[file]=owned.manifest.artifacts[file];}
 expectedArtifacts['index.html']=sha256(Buffer.from(arrowSourcePdfIndex(model,focus)));assert.deepEqual(owned.manifest.artifacts,expectedArtifacts);
 const expected=arrowSourcePdfEntry(input,owned.sources,model,owned.report.manifest);assert.deepEqual(owned.report,expected);
 phase='corruption-controls';
 for(const [name,change]of [['false approval',r=>r.approvedImagePolicy=true],['false admission',r=>r.imageConformanceClaim=true],['source erased',r=>r.contract.source='scene only'],['lost raster',r=>r.contract.views='relative only'],['lost baseline',r=>r.summary.baselinePasses--],['lost source eligibility',r=>r.summary.eligibleSources--],['missed overflow',r=>r.summary.extraInkTargetRejections--],['padding approved',r=>r.summary.paddingSourceFrameRejections=0],['reference substituted',r=>r.contract.reference='fitted'],['lost source guard',r=>delete r.sourceHashes[Object.keys(r.sourceHashes)[0]]],['manifest traversal',r=>r.manifest.file='../manifest.json'],['lost pending gate',r=>r.agent.pendingGates.pop()]]){
  const bad=structuredClone(expected);change(bad);assert.throws(()=>assert.deepEqual(bad,expected));controls.push({name,passed:true});
 }
 assert.deepEqual(await arrowSourcePdfSources(),owned.sources);await loadArrowSourcePdfOwned(process.argv[2]);
 await publish({schemaVersion:1,completed:true,phase:'complete',comparisonKind:'independent-native-arrow-source-PDF-check',converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',
  inputReport:process.argv[2],inputReportSha256,snapshotSha256:owned.report.snapshotSha256,renderer:renderer.identity,sourceHashes:owned.report.sourceHashes,summary:model.summary,eligibility:model.eligibility,
  measurements,momentRegions,fullPageMeasurements,deltaChecks,panels,focusPanels:focus.length*4,controls});
}catch(error){process.exitCode=2;await publish({schemaVersion:1,completed:false,phase,error:error.message.replaceAll(root,'<repo>'),converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,inputReportSha256,measurements,momentRegions,fullPageMeasurements,deltaChecks,panels,controls});console.error(error.stack);}finally{await renderer?.browser.close();}
