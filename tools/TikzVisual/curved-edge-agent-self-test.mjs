import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Browser qualification of the fixed family's report-to-image navigation.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {createRenderer} from './compare.mjs';
import {buildEdgeAgent,validateEdgeAgentLinks} from './curved-edge-agent.mjs';
import {edgeAgentViewer,edgeAgentImages} from './curved-edge-agent-viewer.mjs';

assert.equal(process.argv.length,4);const mode=process.argv[2];assert.ok(['--trial','--report'].includes(mode));
assert.match(process.argv[3],new RegExp('^artifacts/curved-edge-'+(mode==='--trial'?'public-trial':'conformance')+'/run-[a-f0-9-]+/report\\.json$'));
const bytes=await readFile(path.join(root,process.argv[3])),input=JSON.parse(bytes),folder=path.dirname(path.join(root,process.argv[3]));
assert.equal(input.completed,true);const read=async p=>readFile(await outputPath(folder,p));
for(const [p,h]of Object.entries(input.artifacts))assert.equal(sha256(await read(p)),h,p);
const trial=mode==='--trial'?input:JSON.parse(await read('trial/report.json')),agent=buildEdgeAgent(trial);
const artifacts=mode==='--trial'?Object.fromEntries(Object.entries(input.artifacts).map(([p,h])=>['trial/'+p,h])):input.artifacts;
const readAgent=async p=>read(mode==='--trial'?p.slice(6):p);
let viewerScope='Fixed curved-connection inspection qualification';
validateEdgeAgentLinks(agent,artifacts);if(mode==='--report'){
 assert.equal(sha256(JSON.stringify(input.agent)),sha256(JSON.stringify(agent)),'Changed complete agent projection.');
 const {loadEdgePolicy,validateEdgeAdmissionReport}=await import('./curved-edge-admission-policy.mjs');
 const policy=await loadEdgePolicy();viewerScope=policy.profile.scope;
 validateEdgeAdmissionReport(input,policy,JSON.parse(await read('cached/report.json')),trial,JSON.parse(await read('checker/report.json')));
}
const output=path.join(root,'artifacts/curved-edge-agent-controls/run-'+randomUUID()),saved={},controls=[];
const save=(p,b)=>writeArtifact(output,p,b,saved),passed=name=>controls.push({name,passed:true});
const imageData=await edgeAgentImages(agent,artifacts,readAgent);let imageBytes=0;
for(const [p,data]of Object.entries(imageData)){const b=Buffer.from(data.slice(data.indexOf(',')+1),'base64');assert.equal(sha256(b),artifacts[p]);imageBytes+=b.length;}
assert.equal(Object.keys(imageData).length,150);passed('all 150 embedded PNGs bind exact saved artifact hashes');
const sourceFiles=new Map();
for(const r of agent.rankedRegions){
 for(const p of [r.images.reference,r.images.actual]){const b=Buffer.from(imageData[p].split(',')[1],'base64'),q=r.rectangle;
  assert.equal(b.toString('ascii',12,16),'IHDR');assert.ok(q.x>=0&&q.y>=0&&q.x+q.width<=b.readUInt32BE(16)&&q.y+q.height<=b.readUInt32BE(20),r.regionId);}
 if(!sourceFiles.has(r.sourceFile))sourceFiles.set(r.sourceFile,(await readAgent(r.sourceFile)).toString('utf8'));
 assert.equal(sourceFiles.get(r.sourceFile).slice(r.source.source.offset,r.source.source.offset+r.source.source.length),r.source.text);
}
passed('all 6224 registered rectangles and source spans resolve');
const html=edgeAgentViewer(agent,viewerScope,imageData);
if(mode==='--report'){assert.equal(sha256(await read('index.html')),sha256(html),'Changed complete saved viewer.');passed('saved admission viewer equals checked report and PNG inputs');}
await save('index.html',html);
const defect=trial.defects.find(d=>d.primary.some(r=>r.observedVisible&&r.evaluation.checks.some(c=>c.id===d.target&&!c.passed)));
const damaged=defect.primary.find(r=>r.observedVisible&&r.evaluation.checks.some(c=>c.id===defect.target&&!c.passed));
const base=agent.rankedRegions.find(r=>r.caseId===defect.caseId&&r.regionId===defect.target&&r.route==='primary'&&r.view.frame===damaged.frame&&r.view.scale===damaged.scale&&r.view.background===damaged.background);
assert.ok(base);const failure=structuredClone(agent);failure.firstFailedGate='freshPrimary';
failure.rankedRegions=[{...base,passed:false,metrics:damaged.evaluation.checks.find(c=>c.id===defect.target).metrics,
 budgetUtilization:Math.max(...damaged.evaluation.checks.find(c=>c.id===defect.target).metrics.map(m=>m.expected!==undefined?Math.abs(m.observed-m.expected):m.limit===0?m.observed:m.observed/m.limit)),
 images:{reference:'trial/'+damaged.images.reference,actual:'trial/'+damaged.images.actual},crops:null}];
const defectImages=await edgeAgentImages(failure,artifacts,readAgent);await save('defect.html',edgeAgentViewer(failure,'Visible native image-only defect: '+defect.name,defectImages));
const renderer=await createRenderer(),page=renderer.page,errors=[],selected=[];page.on('pageerror',e=>errors.push(e.message));
try{
 if(mode==='--report')requireRenderer(renderer.identity, input.renderer);
 await page.unroute('**/*');const bundleUrls=[output,folder].map(p=>pathToFileURL(p+path.sep).href);
 await page.route('**/*',route=>bundleUrls.some(p=>route.request().url().startsWith(p))?route.continue():route.abort());
 await page.goto(pathToFileURL(path.join(mode==='--report'?folder:output,'index.html')).href);
 await page.waitForFunction(()=>document.getElementById('left').width>0);
 for(const route of ['primary','candidatePdf'])for(const kind of ['path','glyph','clip'])for(const scale of [1,4]){
  const i=agent.rankedRegions.findIndex(r=>r.route===route&&r.source.kind===kind&&r.view.scale===scale);assert.ok(i>=0);selected.push(i);
 }
 async function select(i){
  await page.selectOption('#mode','pair');await page.selectOption('#zoom','1');await page.selectOption('#regions',String(i));
  await page.waitForFunction(index=>chosen===agent.rankedRegions[index]&&images!==null,i);
 }
 // Compare displayed samples with independently indexed full decoded PNGs.
 async function pixels(i,mode,zoom){
  await page.selectOption('#mode',mode);await page.selectOption('#zoom',String(zoom));
  const result=await page.evaluate(async({i,mode,zoom})=>{
   const r=agent.rankedRegions[i],rect=r.rectangle;
   const decode=src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;c.getContext('2d').drawImage(im,0,0);resolve({width:c.width,data:c.getContext('2d').getImageData(0,0,c.width,c.height).data});};im.onerror=reject;im.src=JSON.parse(document.getElementById('imageData').textContent)[src];});
   const [a,b]=await Promise.all([decode(r.images.reference),decode(r.images.actual)]),canvas=document.getElementById('left'),observed=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
   let mismatches=0;
   for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
    const sx=rect.x+Math.floor(x/zoom),sy=rect.y+Math.floor(y/zoom),ia=(sy*a.width+sx)*4,ib=(sy*b.width+sx)*4,j=(y*canvas.width+x)*4;
    for(let k=0;k<4;k++){const expected=mode==='difference'?(k===3?255:255-Math.min(255,Math.max(Math.abs(a.data[ia+3]-b.data[ib+3]),Math.abs(a.data[ia+k]-b.data[ib+k]))*16)):a.data[ia+k];if(observed[j+k]!==expected)mismatches++;}
   }
   return {width:canvas.width,height:canvas.height,mismatches,rectangle:rect};
  },{i,mode,zoom});
  assert.deepEqual([result.width,result.height],[result.rectangle.width*zoom,result.rectangle.height*zoom]);assert.equal(result.mismatches,0);
  passed('displayed '+mode+' pixels/'+i+'/'+zoom+'x');
 }
 for(const i of selected){await select(i);await pixels(i,'pair',1);await pixels(i,'difference',4);await page.selectOption('#mode','overlay');
  assert.equal(await page.locator('#actualFigure').isVisible(),false);await page.selectOption('#mode','blink');
  await page.waitForFunction(()=>document.getElementById('leftLabel').textContent==='Actual');
  await page.waitForFunction(()=>document.getElementById('leftLabel').textContent==='Reference');
  assert.ok((await page.locator('#source').textContent()).includes(agent.rankedRegions[i].source.text));passed('overlay, blink and source navigation/'+i);
  const r=agent.rankedRegions[i];assert.equal(await page.locator('#links a').filter({hasText:/^source$/}).getAttribute('href'),r.sourceFile);assert.equal(await page.locator('#links a').filter({hasText:/^scene$/}).getAttribute('href'),r.scene);
 }
 const i=selected[0];await select(i);for(const zoom of [2,8])await pixels(i,'pair',zoom);
 const panIndex=agent.rankedRegions.findIndex(r=>r.route==='primary'&&r.rectangle.width*8>1200&&r.rectangle.height*8>480);assert.ok(panIndex>=0);
 await select(panIndex);await page.selectOption('#zoom','8');
 await page.evaluate(()=>{const a=document.getElementById('leftViewport');a.scrollLeft=30;a.scrollTop=30;});
 await page.waitForFunction(()=>{const a=document.getElementById('leftViewport'),b=document.getElementById('rightViewport');return a.scrollLeft===b.scrollLeft&&a.scrollTop===b.scrollTop;});passed('synchronized pan');
 assert.ok(await page.evaluate(()=>document.getElementById('leftViewport').scrollLeft>0&&document.getElementById('leftViewport').scrollTop>0));
 await page.fill('#filter','no-such-native-region');await page.waitForFunction(()=>document.getElementById('left').width===0);
 assert.equal(await page.locator('#source').textContent(),'');assert.equal(await page.locator('#detail').textContent(),'No matching regions');passed('empty selection clears stale images and source');
 await page.fill('#filter','');await page.selectOption('#case','nodes');await page.selectOption('#route','candidatePdf');
 assert.ok(await page.locator('#regions option').count()>0);await page.waitForFunction(()=>chosen?.caseId==='nodes'&&chosen?.route==='candidatePdf'&&images!==null);passed('case and PDF filters');
 await save('viewer.png',await page.screenshot());await page.goto(pathToFileURL(path.join(output,'defect.html')).href);await page.waitForFunction(()=>document.getElementById('left').width>0);
 assert.ok((await page.locator('body').textContent()).includes('First failed gate: freshPrimary'));await pixels(0,'pair',1);await pixels(0,'difference',4);
 assert.ok(await page.evaluate(()=>{const c=document.getElementById('left'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return d.some((v,i)=>i%4!==3&&v<255);}));
 passed('alpha-aware difference shows transparent black-stroke loss');await save('defect.png',await page.screenshot());passed('visible image-only defect navigation');
 assert.deepEqual(errors,[]);passed('no browser errors from local-file captures');
}finally{await renderer.browser.close();}
const report={schemaVersion:1,comparisonKind:'curved-edge-agent-inspection-controls',completed:true,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
 inputReport:process.argv[3],inputReportSha256:sha256(bytes),viewerSha256:sha256(html),savedAdmissionViewerExercised:mode==='--report',renderer:renderer.identity,coverage:agent.coverage,embeddedImages:150,embeddedImageBytes:imageBytes,selectedRegions:selected.map(i=>{const r=agent.rankedRegions[i];return{caseId:r.caseId,route:r.route,scale:r.view.scale,regionId:r.regionId};}),controls,artifacts:saved};
const reportBytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',reportBytes);
console.log(JSON.stringify({kind:report.comparisonKind,completed:true,controls:controls.length,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(reportBytes)}));
