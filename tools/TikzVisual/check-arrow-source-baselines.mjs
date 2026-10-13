import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Independently decode saved baselines, including failed ones. This grants no admission.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root, sha256, outputPath, writeArtifact} from './shape-oracle-bundle.mjs';
import {loadArrowImageCache} from './arrow-image-cache.mjs';
import {loadArrowPublicBaseline, validateArrowPublicBaselineBundle} from './arrow-public-source-reader.mjs';
import {arrowPublicSourceTools} from './arrow-public-source-contract.mjs';
import {evaluateArrowPublicPrimary,evaluateArrowPublicPdf,arrowPublicExactPage,finishArrowPublicBaselines} from './arrow-public-source-policy.mjs';
import {arrowCanonical,arrowMetrics} from './arrow-native-contract.mjs';
import {arrowPrimaryRegions} from './arrow-primary-contract.mjs';
import {arrowPrimaryViewKey} from './arrow-primary-policy.mjs';
import {arrowPdfViewKey} from './arrow-pdf-policy.mjs';
import {normalizeArrowViewport} from './arrow-viewport-normalize.mjs';
import {arrowViewportFrameCheck,arrowViewportRegions} from './arrow-viewport-model.mjs';
import {edgePdfSourceFrame} from './curved-edge-pdf-registration.mjs';
import {measureArrowPdfInk} from './arrow-pdf-ink.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {checkArrowNativePanels} from './arrow-native-panels.mjs';
import {checkArrowPaperPanels} from './arrow-pdf-panels.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

const output=await outputPath(path.join(root,'artifacts/arrow-public-source-checks/run-'+randomUUID())),artifacts={},controls=[];
const save=(p,b)=>writeArtifact(output,p,b,artifacts),relative=p=>path.relative(root,p).split(path.sep).join('/');
let renderer,phase='arguments',inputReportSha256,converterInvoked=false,combined,numericBuildIdentity,primaryRegions=0,pdfRegions=0,momentRegions=0,exactRegions=0,fullPages=0,panels=0;
const sourceHashes={};
function numericParity(reference,actual){
  for(const n of [reference,actual])assert.match(n.assemblySha256,/^[a-f0-9]{64}$/);
  assert.deepEqual({...actual,assemblySha256:null},{...reference,assemblySha256:null},'Fresh numeric checks, SVGs, scenes, sources or inputs changed.');
  return {referenceAssemblySha256:reference.assemblySha256,actualAssemblySha256:actual.assemblySha256,identicalAssemblyBytes:reference.assemblySha256===actual.assemblySha256};
}
async function publish(completed,error){
  const report={schemaVersion:1,comparisonKind:'independent-public-arrow-source-baseline-check',completed,phase,inputReport:process.argv[2],inputReportSha256,
    converterInvoked,approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',renderer:renderer?.identity,sourceHashes,
    primaryRegions,pdfRegions,momentRegions,exactRegions,fullPages,panels,controls,combined,numericBuildIdentity,artifacts,...(error?{error}:{})};
  const b=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',b);
  console.log(JSON.stringify({completed,phase,report:relative(path.join(output,'report.json')),sha256:sha256(b),baselinePassed:combined?.passed}));
}
async function checkPrimaryPanels(r,read,f){
  const images={...r.files.images},comparison=images.comparison;delete images.comparison;
  let count=await checkArrowNativePanels(renderer,{...r.view,route:undefined,variant:'Public SVG',images,crops:r.files.crops},read,f);
  if(comparison){
    const pngs=await Promise.all(['reference','actual','amplified'].map(async k=>'data:image/png;base64,'+(await read(images[k])).toString('base64')));
    pngs.push('data:image/png;base64,'+(await read(comparison)).toString('base64'));
    await renderer.page.evaluate(async({pngs,label})=>{
      const parts=[];for(const src of pngs){const im=new Image();im.src=src;await im.decode();parts.push(im);}
      const w=parts[0].width,h=parts[0].height,c=document.createElement('canvas');c.width=w*3;c.height=h+48;const ctx=c.getContext('2d');
      ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='12px sans-serif';
      [label,'Public SVG','Raw difference\nAmplified ×16'].forEach((s,i)=>{s.split('\n').forEach((line,j)=>ctx.fillText(line,i*w+4,16+j*16));ctx.drawImage(parts[i],i*w,48);});
      if(parts[3].width!==c.width||parts[3].height!==c.height)throw Error('Public primary panel dimensions changed');
      const actual=document.createElement('canvas');actual.width=c.width;actual.height=c.height;const ac=actual.getContext('2d');ac.drawImage(parts[3],0,0);
      const a=ac.getImageData(0,0,c.width,c.height).data,b=ctx.getImageData(0,0,c.width,c.height).data;
      for(let i=0;i<a.length;i++)if(a[i]!==b[i])throw Error('Public primary panel pixels/labels changed');
    },{pngs,label:r.view.route==='native-source'?'Native SVG':'PGF SVG'});count++;
  }
  return count;
}
async function primaryNaturalFrame(svg,driver,origin){
  // Apply registration in the primary route's declared arithmetic order.
  return renderer.page.evaluate(({svg,driver,origin})=>{
    const d=new DOMParser().parseFromString(svg,'image/svg+xml'),s=d.documentElement;
    if(d.querySelector('parsererror')||s.localName!=='svg')throw Error('Invalid primary SVG root');
    const v=s.getAttribute('viewBox').split(/[ ,]+/).map(Number);
    if(v.length!==4||!v.every(Number.isFinite))throw Error('Invalid primary viewport');
    const dimension=value=>{const m=/^([-\d.e+]+)(px|pt)$/.exec(value);if(!m)throw Error('Invalid primary size');return Number(m[1])*(m[2]==='pt'?4/3:1);};
    return {x:driver?(v[0]-origin.x)*4/3:v[0],y:driver?(v[1]-origin.y)*4/3:v[1],width:dimension(s.getAttribute('width')),height:dimension(s.getAttribute('height'))};
  },{svg,driver,origin});
}
try{
  assert.equal(process.argv.length,3);
  for(const p of ['arrow-public-source-reader.mjs','check-arrow-source-baselines.mjs']){
    const name='tools/TikzVisual/'+p,bytes=arrowCanonical(await readFile(path.join(root,name)));sourceHashes[name]=sha256(bytes);await save('source-captures/'+name,bytes);
  }
  const e=await loadArrowImageCache(),b=await loadArrowPublicBaseline(process.argv[2],e);inputReportSha256=b.inputReportSha256;
  renderer=await createRenderer();requireRenderer(renderer.identity, b.report.renderer);await installShapeMetrics(renderer);
  phase='fresh-public-numeric';converterInvoked=true;
  let command;try{command=await promisify(execFile)('dotnet',['run','--project','tools/TikzArrowComparison','-c','Release','--','--out',relative(path.join(output,'numeric'))],{cwd:root,windowsHide:true,timeout:180000,maxBuffer:1000000});}
  catch(error){await save('numeric-command.log',(String(error.stdout??'')+String(error.stderr??'')).replaceAll(root,'<repo>'));if(error.code!==1)throw error;}
  if(command)await save('numeric-command.log',(command.stdout+command.stderr).replaceAll(root,'<repo>').replaceAll(relative(output),'<check>'));
  const fresh=JSON.parse(await readFile(path.join(output,'numeric/report.json')));
  numericBuildIdentity=numericParity(b.numeric,fresh);
  for(const [p,h] of Object.entries(fresh.artifacts))assert.equal(sha256(await readFile(path.join(output,'numeric',p))),h);
  const candidates=new Map(),frames=[];
  for(const f of e.frames){
    const svg=b.read('numeric/'+f.caseId+'/candidate.svg').toString(),normalized=await normalizeArrowViewport(renderer,svg,'cssPixels',{x:0,y:0},f.paper.camera);
    candidates.set(f.caseId,{svg,scene:normalized.svg});frames.push({caseId:f.caseId,sourceFrame:arrowViewportFrameCheck(normalized.proof.sourceFrame,f.sourceEnvelope.root),normalization:normalized.proof});
    const checks=b.json('numeric/'+f.caseId+'/checks.json');assert.equal(checks.length,fresh.cases.find(c=>c.id===f.caseId).checks);
    assert.equal(checks.filter(c=>!c.passed).length,fresh.cases.find(c=>c.id===f.caseId).failed);
  }
  assert.deepEqual(frames,b.frames);
  const primary=[];
  for(const r of b.primary){
    phase=r.view.id;const v=r.view,f=e.frames.find(f=>f.caseId===v.caseId),regions=arrowPrimaryRegions(f),native=v.route==='native-source';
    const reference=e.getRole('primary','views/'+v.caseId+'/calibration/source/'+arrowPrimaryViewKey(v)+'/'+(native?'actual':'reference')+'.svg').toString();
    assert.equal(b.read(r.files.reference).toString(),reference);assert.equal(b.read(r.files.actual).toString(),candidates.get(v.caseId).svg);
    const natural={reference:await primaryNaturalFrame(reference,!native,native?{x:0,y:0}:f.origin),
      actual:await primaryNaturalFrame(candidates.get(v.caseId).svg,false,{x:0,y:0})};assert.deepEqual(r.numbers.naturalFrames,natural);
    const size={width:f.camera.width*v.scale,height:f.camera.height*v.scale},rectangles=regions.map(q=>Object.fromEntries(Object.entries(q.rectangle).map(([k,n])=>[k,n*v.scale])));
    const pair=[b.read(r.files.images.reference),b.read(r.files.images.actual)],decoded=await decodeEdgeOraclePngPair(renderer,pair,size,rectangles,v.scale,v.background);
    assert.deepEqual(r.numbers.metrics,decoded.metrics[0]);assert.equal(r.numbers.regions.length,regions.length);
    for(const [i,q] of r.numbers.regions.entries()){for(const [k,n] of Object.entries(regions[i]))assert.deepEqual(q[k],n);assert.deepEqual(arrowMetrics(q),decoded.metrics[i]);}
    for(const k of ['repeat','actualRepeat']){const repeat=r.numbers[k];assert.ok(repeat.exactRgbaMatch&&repeat.rawChangedPixels===0&&repeat.maxRawChannelError===0);}
    primaryRegions+=decoded.metrics.length;
    const verified={...r,numbers:{...r.numbers,metrics:decoded.metrics[0],regions:r.numbers.regions.map((q,i)=>({...q,...decoded.metrics[i]}))}};
    assert.deepEqual(r.evaluation,evaluateArrowPublicPrimary(e,verified));primary.push(verified);panels+=await checkPrimaryPanels(r,b.read,f);
  }
  const pdf=[];
  for(const r of b.pdf){
    phase=r.view.id;const v=r.view,f=e.frames.find(f=>f.caseId===v.caseId),publicSource=v.route==='public-source',route=publicSource?'native-source':'original-source';
    const baseline=JSON.parse(e.get('views/'+v.caseId+'/calibration/'+route+'/'+v.raster+'/baseline/'+arrowPdfViewKey(v)+'/record.json'));
    assert.deepEqual(r.sourceFrame,publicSource?frames.find(f=>f.caseId===v.caseId).sourceFrame:baseline.sourceFrame);
    const pdfBytes=e.get('reference/'+v.caseId+'/pdf-page-'+v.scale+'x.png');assert.ok(pdfBytes.equals(b.read(r.pdf)));
    const verified={...r};
    for(const type of ['source','scene']){
      const t=r[type],n=t.numbers,svg=publicSource?candidates.get(v.caseId)[type==='source'?'svg':'scene']:e.get(baseline.files[type].svg).toString();
      assert.equal(b.read(t.files.svg).toString(),svg);
      const regions=type==='source'?f.paper.regions:arrowViewportRegions(f),size=f.paper.camera.rasterSizes[v.scale+'x'];
      assert.deepEqual(n.pageSize,size);assert.deepEqual([n.frame,n.scale,n.background,n.mode,n.converterInvoked,n.approvedImagePolicy,n.imageConformanceClaim],
        [v.frame,v.scale,'white',v.caseId+'/'+route,publicSource,false,false]);
      const sourceFrame=await edgePdfSourceFrame(renderer,svg,publicSource?'native-semantic':'original-driver',publicSource?{x:0,y:0}:f.origin);
      assert.deepEqual(n.sourceFrame,sourceFrame);assert.deepEqual(n.clipFrame,v.frame==='natural'?sourceFrame:regions[0].rectangle);
      for(const repeat of Object.values(n.repeat))assert.deepEqual(repeat,{exactRgbaMatch:true,rawChangedPixels:0,maxRawChannelError:0});
      assert.deepEqual(Object.keys(n.repeat).sort(),['pdf','svg']);
      const png=b.read(t.files.images['svg-page']),pair=[pdfBytes,png],rectangles=regions.map(q=>q.rasterRectangles[v.scale+'x']);
      const decoded=await decodeEdgeOraclePngPair(renderer,pair,size,rectangles,v.scale,'white',true),ink=await measureArrowPdfInk(renderer,pair,size,regions,v.scale);
      assert.deepEqual(n.fullPage,decoded.fullPage);assert.equal(n.outsideWholeChangedPixels,decoded.fullPage.rawChangedPixels-decoded.metrics[0].rawChangedPixels);
      if(type==='scene')assert.equal(n.outsideDiagramChangedPixels,decoded.fullPage.rawChangedPixels-decoded.metrics[1].rawChangedPixels);
      const quantities=[n.whole,...n.regions];assert.equal(quantities.length,regions.length);
      for(const [i,q] of quantities.entries()){
        for(const [k,value] of Object.entries(regions[i]))assert.deepEqual(q[k],value);
        assert.deepEqual(arrowMetrics(q),decoded.metrics[i]);assert.deepEqual(q.inkCoverage,ink[i].inkCoverage);assert.deepEqual(q.inkMoments,ink[i].inkMoments);
      }
      assert.equal(t.qualifiedRaster,baseline.files[type].images['svg-page']);
      const exact=arrowPublicExactPage(await decodeEdgeOraclePngPair(renderer,[e.get(t.qualifiedRaster),png],size,rectangles,v.scale,'white',true));assert.deepEqual(t.exact,exact);
      pdfRegions+=decoded.metrics.length;momentRegions+=ink.length;exactRegions+=exact.checks.length;fullPages+=2;
      assert.deepEqual(t.evaluation,evaluateArrowPublicPdf(e,v,type,n));verified[type]={...t,exact};
      panels+=await checkArrowPaperPanels(renderer,{...n,rightLabel:(publicSource?'Public SVG':'PGF SVG')+' '+type,images:t.files.images,pdfPage:r.pdf,crops:[]},b.read,regions);
    }
    pdf.push(verified);if(v.frame==='expanded'&&v.scale===4)console.log('Saved public baseline checked: '+v.caseId+'/'+v.route+'/'+v.raster);
  }
  combined=finishArrowPublicBaselines(fresh,frames,primary,pdf);assert.deepEqual(combined,b.combined);
  phase='reader-corruption-controls';
  const rebuilt=structuredClone(fresh);rebuilt.assemblySha256=fresh.assemblySha256==='a'.repeat(64)?'b'.repeat(64):'a'.repeat(64);
  assert.equal(numericParity(fresh,rebuilt).identicalAssemblyBytes,false);controls.push({name:'different build identity with identical numeric artifacts',passed:true});
  for(const [name,change] of [['changed numeric count',n=>n.checks--],['changed numeric source',n=>n.sources[Object.keys(n.sources)[0]]='a'.repeat(64)],
    ['changed numeric artifact',n=>n.artifacts[Object.keys(n.artifacts)[0]]='a'.repeat(64)],['lost public parity',n=>n.cases[0].publicTraceParity=false],['malformed build identity',n=>n.assemblySha256='invalid']]){
    const bad=structuredClone(fresh);change(bad);assert.throws(()=>numericParity(fresh,bad));controls.push({name,passed:true});
  }
  for(const [name,change] of [
    ['false approval',r=>r.approvedImagePolicy=true],['false image admission',r=>r.imageConformanceClaim=true],['false exact verdict',r=>r.overallVerdict='exact'],
    ['incomplete run',r=>r.completed=false],['lost pending gate',r=>r.pendingGates.pop()],['changed renderer',r=>r.renderer.browser='different'],
    ['lost source guard',r=>delete r.sourceHashes[Object.keys(r.sourceHashes)[0]]],['unsafe manifest',r=>r.manifest.file='../manifest.json'],
    ['false combined pass',r=>r.combined.passed=!r.combined.passed],['false first failure',r=>r.combined.firstFailedGate='invented']]){
    const report=structuredClone(b.report);change(report);
    assert.throws(()=>validateArrowPublicBaselineBundle(Buffer.from(JSON.stringify(report)),b.manifestBytes,b.assets,e,b.sources));controls.push({name,passed:true});
  }
  for(const [name,change] of [['missing image',a=>a.delete(b.primary[0].files.images.actual)],['changed image',a=>a.set(b.primary[0].files.images.actual,Buffer.from('changed'))],
    ['native cache substituted',a=>a.set('native-cache.bin.gz',Buffer.from('different'))]]){
    const assets=new Map(b.assets);change(assets);assert.throws(()=>validateArrowPublicBaselineBundle(b.reportBytes,b.manifestBytes,assets,e,b.sources));controls.push({name,passed:true});
  }
  assert.deepEqual(await arrowPublicSourceTools(),b.sources);
  for(const [p,h] of Object.entries(sourceHashes))assert.equal(sha256(arrowCanonical(await readFile(path.join(root,p)))),h);
  await loadArrowPublicBaseline(process.argv[2],e);phase='complete';await publish(true);
}catch(error){process.exitCode=2;await publish(false,error.message.replaceAll(root,'<repo>'));console.error(error.stack);}finally{await renderer?.browser.close();}
