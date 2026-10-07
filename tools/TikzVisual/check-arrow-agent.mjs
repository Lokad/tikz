// Rebuild projections, decode public pixels, and exercise the linked offline viewer.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadArrowAgentOwned,arrowAgentReplayHandles,loadArrowAgentInputs,arrowAgentSourceClosure} from './arrow-agent-evidence.mjs';
import {buildArrowAgentCases,arrowAgentEntry,validateArrowAgent,arrowAgentRectangle} from './arrow-agent-model.mjs';
import {arrowAgentIndex,arrowAgentCaseHtml} from './arrow-agent-viewer.mjs';
import {runArrowAgentControls} from './arrow-agent-self-test.mjs';
import {arrowMetrics} from './arrow-native-contract.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';
import {createRenderer} from './compare.mjs';
const out=await outputPath(path.join(root,'artifacts/arrow-agent-checks/run-'+randomUUID()));await mkdir(out,{recursive:true});let renderer,phase='arguments',inputReportSha256,publicMeasurements=0,viewerPixelChecks=0,linkedRequests=0;const controls=runArrowAgentControls(),viewerSelections=[],artifacts={};
async function publish(report){const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(out,'report.json',bytes);console.log(JSON.stringify({kind:'arrow-agent-check',completed:report.completed,phase:report.phase,report:path.relative(root,path.join(out,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));}
try{
 assert.equal(process.argv.length,3);const owned=await loadArrowAgentOwned(process.argv[2]);inputReportSha256=owned.sha256;
 phase='input-and-projection';const handles=arrowAgentReplayHandles(owned),bundle=await loadArrowAgentInputs(handles),cases=buildArrowAgentCases(bundle),sourceHashes=Object.fromEntries([...owned.sources].map(([f,s])=>[f,s.sha256])),core=arrowAgentEntry(bundle,cases,sourceHashes),expectedArtifacts={};
 for(const input of bundle.loaded)for(const [f,b]of input.files)expectedArtifacts['inputs/'+input.kind+'/'+f]=sha256(b);
 for(const [f,s]of owned.sources)expectedArtifacts['source-captures/'+f]=s.sha256;
 for(const c of cases){expectedArtifacts['cases/'+c.caseId+'.json']=sha256(Buffer.from(JSON.stringify(c,null,2)+'\n'));expectedArtifacts['cases/'+c.caseId+'.html']=sha256(Buffer.from(arrowAgentCaseHtml(c)));}
 expectedArtifacts['index.html']=sha256(Buffer.from(arrowAgentIndex(core)));assert.deepEqual(owned.manifest.artifacts,expectedArtifacts);
 const expectedManifest=Buffer.from(JSON.stringify({schemaVersion:1,artifacts:expectedArtifacts},null,2)+'\n');assert.equal(sha256(expectedManifest),owned.report.manifest.sha256);
 const expected={...core,manifest:{file:'manifest.json',sha256:sha256(expectedManifest),files:Object.keys(expectedArtifacts).length}},savedCases=owned.report.cases.map(c=>JSON.parse(owned.files.get(c.report)));
 const validate=()=>{assert.deepEqual(savedCases,cases);return validateArrowAgent(owned.report,savedCases,expected,owned.manifest.artifacts);};const coverage=validate();
 phase='public-saved-pixels';renderer=await createRenderer();assert.deepEqual(renderer.identity,owned.report.renderer);await installShapeMetrics(renderer);
 const prototype=bundle.loaded[4];for(const c of cases){for(const row of c.rows.filter(r=>r.family==='prototype')){
  const original=prototype.report.observations.find(o=>row.id==='prototype/'+o.id),rectangles=c.regions.prototype.map(r=>arrowAgentRectangle(c,row,r.id));
  const decoded=await decodeEdgeOraclePngPair(renderer,Object.values(row.images).map(f=>owned.files.get(f)),row.size,rectangles,row.view.scale,row.view.background);
  assert.deepEqual(arrowMetrics(decoded.metrics[0]),arrowMetrics(original.metrics));for(let i=0;i<rectangles.length;i++)assert.deepEqual(arrowMetrics(decoded.metrics[i]),arrowMetrics(original.regions[i]));publicMeasurements+=rectangles.length;
 }console.log('Saved public pixels checked: '+c.caseId);}
 phase='viewer';const page=renderer.page,errors=[],blocked=[];page.on('pageerror',e=>errors.push(e.message));await page.unroute('**/*');
 await page.route('**/*',async route=>{const u=new URL(route.request().url()),f=u.pathname.slice(1),b=owned.files.get(f);if(u.origin!=='http://arrow-agent.invalid'||u.search||u.hash||!b){blocked.push(u.href);await route.abort();return;}
  linkedRequests++;await route.fulfill({status:200,body:b,contentType:f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.png')?'image/png':f.endsWith('.json')?'application/json':'text/plain; charset=utf-8'});});
 await page.clock.install();await page.goto('http://arrow-agent.invalid/index.html');assert.equal(await page.locator('li a').count(),6);
 for(const c of cases){await page.goto('http://arrow-agent.invalid/cases/'+c.caseId+'.html');await page.waitForFunction(()=>window.arrowAgentState?.ready===true);
  for(const family of ['prototype','primary','pdf']){await page.selectOption('#family',family);await page.waitForFunction(f=>window.arrowAgentState?.ready&&window.arrowAgentState.family===f,family);
   const rows=c.rows.filter(r=>r.family===family),chosen=[rows.find(r=>r.view.scale===1&&r.view.background==='white'&&(r.kind==='calibration'||r.kind==='prototype-raw')),rows.find(r=>r.view.scale===4&&r.view.background==='white'&&r.kind==='defect')??rows.find(r=>r.view.scale===4&&r.view.background==='white')];assert.ok(chosen.every(Boolean));
   for(const row of chosen){await page.selectOption('#view',row.id);await page.waitForFunction(id=>window.arrowAgentState?.ready&&window.arrowAgentState.rowId===id,row.id);
    const region=c.regions[family].find(r=>r.sourceSpan)??c.regions[family].find(r=>r.id===row.crops[0]?.id)??c.regions[family].find(r=>r.id!=='whole-picture');assert.ok(region);
    await page.selectOption('#region',region.id);const q=arrowAgentRectangle(c,row,region.id);assert.deepEqual((await page.evaluate(()=>window.arrowAgentState)).rectangle,q);
    const links=await page.locator('#links a').evaluateAll(as=>as.map(a=>new URL(a.href).pathname.slice(1)));assert.deepEqual(links,[row.measurement,row.inputSvg,row.images.reference,row.images.actual,c.source.file,c.source.scene]);assert.ok(links.every(f=>owned.files.has(f)));
    const detail=JSON.parse(await page.locator('#detail').textContent());assert.deepEqual(detail.sourceSpan,region.sourceSpan??null);assert.deepEqual(detail.shaftSourceSpan,region.shaftSourceSpan??null);
    if(region.sourceSpan)assert.equal(await page.locator('#source').textContent(),'Source '+region.sourceSpan.line+':'+region.sourceSpan.column+'\n'+region.sourceSpan.text+'\n\nFixture:\n'+c.source.text);
    else assert.match(await page.locator('#source').textContent(),/no candidate source span/);
    for(const zoom of [1,2,4,8]){await page.selectOption('#zoom',String(zoom));for(const mode of zoom===2?['pair','difference','overlay','blink']:['pair']){
     await page.selectOption('#mode',mode);await verifyPixels(row,q,zoom,mode,false);if(mode==='blink'){await page.clock.fastForward(500);await verifyPixels(row,q,zoom,mode,true);}
    }}await page.selectOption('#mode','pair');viewerSelections.push({caseId:c.caseId,rowId:row.id,regionId:region.id,scale:row.view.scale});
    if(family==='prototype'&&row===chosen[0]){await page.selectOption('#zoom','4');await writeArtifact(out,'viewer/'+c.caseId+'.png',await page.screenshot({animations:'disabled'}),artifacts);}
   }
  }console.log('Linked viewer checked: '+c.caseId);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);assert.ok(linkedRequests>0);
 // This deliberate request proves that the browser cannot retrieve unbound files.
 await page.evaluate(()=>fetch('http://arrow-agent.invalid/not-in-manifest.png').catch(()=>null));assert.equal(blocked.length,1);controls.push({name:'browser blocks unbound assets',passed:true});
 phase='corruption-controls';for(const [name,mutate]of [
 ['completed',r=>r.completed=false],['false image admission',r=>r.imageConformanceClaim=true],['missing case',r=>r.cases.pop()],['duplicate case',r=>r.cases[1]=r.cases[0]],['viewport fitting',r=>r.coverage.views--],['manifest traversal',r=>r.manifest.file='../manifest.json'],['lost pending gate',r=>r.agent.pendingGates.pop()],['invented source',r=>r.sourceHashes.extra='0'.repeat(64)]
 ]){const altered=structuredClone(owned.report);mutate(altered);assert.throws(()=>validateArrowAgent(altered,savedCases,expected,owned.manifest.artifacts));controls.push({name,passed:true});}
 const altered=structuredClone(savedCases);altered[0].regions.prototype[1].sourceSpan.offset++;assert.throws(()=>assert.deepEqual(altered,cases));controls.push({name:'stale case source span',passed:true});
 const artifact=owned.files.keys().next().value,corrupt=Buffer.from(owned.files.get(artifact));corrupt[0]^=1;assert.notEqual(sha256(corrupt),owned.manifest.artifacts[artifact]);controls.push({name:'changed artifact bytes',passed:true});
 validate();assert.deepEqual(await arrowAgentSourceClosure(),owned.sources);await loadArrowAgentInputs(handles);await loadArrowAgentOwned(process.argv[2]);
 await publish({schemaVersion:1,completed:true,phase:'complete',comparisonKind:'independent-arrow-agent-check',converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',inputReport:process.argv[2],inputReportSha256,snapshotSha256:owned.report.snapshotSha256,sourceHashes,renderer:renderer.identity,coverage,publicMeasurements,viewerPixelChecks,viewerSelections,linkedRequests,controls,artifacts});
}catch(error){process.exitCode=2;await publish({schemaVersion:1,completed:false,phase,error:error.message.replaceAll(root,'<repo>'),converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,inputReportSha256,publicMeasurements,viewerPixelChecks,viewerSelections,linkedRequests,controls});console.error(error.stack);}
finally{await renderer?.browser.close();}
async function verifyPixels(row,q,zoom,mode,blinkActual){
 const result=await renderer.page.evaluate(async({row,q,zoom,mode,blinkActual})=>{
  const make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;},crop=async f=>{const im=new Image();im.src='../'+f;await im.decode();const canvas=make(q.width,q.height);canvas.getContext('2d').drawImage(im,q.x,q.y,q.width,q.height,0,0,q.width,q.height);return canvas;};
  const reference=await crop(row.images.reference),actual=await crop(row.images.actual),ra=reference.getContext('2d').getImageData(0,0,q.width,q.height).data,rb=actual.getContext('2d').getImageData(0,0,q.width,q.height).data,diff=make(q.width,q.height),dc=diff.getContext('2d'),d=dc.createImageData(q.width,q.height);let changed=0,maximum=0;
  for(let i=0;i<ra.length;i+=4){const error=Math.max(...[0,1,2,3].map(k=>Math.abs(ra[i+k]-rb[i+k])));changed+=error>0;maximum=Math.max(maximum,error);d.data.set([255,255-Math.min(255,error*16),255-Math.min(255,error*16),255],i);}dc.putImageData(d,0,0);
  for(const id of ['reference','actual','difference']){const observed=document.getElementById(id),expected=make(q.width*zoom,q.height*zoom),ctx=expected.getContext('2d');if(observed.width!==expected.width||observed.height!==expected.height)throw Error('Viewer dimensions changed');ctx.imageSmoothingEnabled=false;
   ctx.drawImage(id==='actual'?actual:id==='difference'?diff:mode==='difference'?diff:mode==='blink'&&blinkActual?actual:reference,0,0,expected.width,expected.height);
   if(id==='reference'&&mode==='overlay'){ctx.globalAlpha=.5;ctx.drawImage(actual,0,0,expected.width,expected.height);}
   const a=observed.getContext('2d').getImageData(0,0,observed.width,observed.height).data,b=ctx.getImageData(0,0,expected.width,expected.height).data;for(let i=0;i<a.length;i++)if(a[i]!==b[i])throw Error('Viewer pixel mismatch: '+id+' '+i);
  }
  const state=window.arrowAgentState;if(state.changedPixels!==changed||state.maxChannelError!==maximum||state.zoom!==zoom||state.mode!==mode)throw Error('Viewer state mismatch');
  const label=document.getElementById('reference-label').textContent;if(label!==(mode==='pair'?row.labels.reference:mode==='blink'?(blinkActual?row.labels.actual:row.labels.reference):mode))throw Error('Viewer label mismatch');return{canvases:3};
 },{row,q,zoom,mode,blinkActual});viewerPixelChecks+=result.canvases;
}
