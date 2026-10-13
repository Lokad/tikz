import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Public SVG trial against frozen native research; never selects an allowance.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {loadCalcSavedReport,calcHash,calcEqual} from './calc-saved-images.mjs';
import {loadCalcTrialReference,currentCalcSources} from './calc-trial-reference.mjs';
import {readCalcTrialCandidate,mutateCalcTrialCandidate,controlCalcTrialCandidate} from './calc-trial-candidate.mjs';
import {createRenderer} from './compare.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {measureArrowVectorPair} from './arrow-vector-pair.mjs';
import {measureEdgePdfPair} from './edge-pdf-image-pair.mjs';
import {calcPrimaryDefects,buildCalcPrimaryReference} from './calc-primary-reference.mjs';
import {buildCalcPdfReference} from './calc-pdf-reference.mjs';
import {calcPrimaryViews,calcPrimaryKey,evaluateCalcPrimary} from './calc-primary-policy.mjs';
import {calcPdfViews,calcPdfKey,calcPdfInk,evaluateCalcPdf,deriveCalcPdfInkPolicy,evaluateCalcPdfInk} from './calc-pdf-policy.mjs';
import {decodeCalcPng} from './calc-png.mjs';
assert.equal(process.argv.length,4,'Usage: node tools/TikzVisual/trial-calc.mjs <candidate-export/report.json> <native-trial-reference/report.json>');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.join(root,'artifacts/calc-public-trial/run-'+randomUUID());
await mkdir(output,{recursive:true});const artifacts={},sourceHashes={},primary=[],pdf=[],primaryReplay=[],pdfReplay=[],defects=[],controls=[],inputs={};
let phase='bound-inputs',renderer,reference,candidate,evidence,frames;const relative=f=>path.relative(root,f).split(path.sep).join('/');
async function save(f,b){await mkdir(path.dirname(path.join(output,f)),{recursive:true});await writeFile(path.join(output,f),b);artifacts[f]=calcHash(b);}
const json=(f,o)=>save(f,Buffer.from(JSON.stringify(o,null,2)+'\n'));
const index=r=>({file:r.file,...(r.capture===undefined?{route:r.route}:{capture:r.capture}),frame:r.frame,scale:r.scale,background:r.background});
async function publish(completed,error){const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'calc-current-candidate-trial',completed,phase,
  converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',inputs,sourceHashes,artifacts,renderer:renderer?.identity,
  primary:primary.map(index),pdf:pdf.map(index),primaryReplay:primaryReplay.map(index),pdfReplay:pdfReplay.map(index),
  defects:defects.map(({primary,pdf,...d})=>({...d,primary:primary.map(index),pdf:pdf.map(index)})),
  controls:controls.map(({primaryUnchanged,primaryAltered,pdfUnchanged,pdfAltered,...c})=>({...c,primaryUnchanged:primaryUnchanged.map(index),primaryAltered:primaryAltered.map(index),pdfUnchanged:pdfUnchanged.map(index),pdfAltered:pdfAltered.map(index)})),
  ...(completed?{verdict:'trial-pass',gates:{numeric:{state:'passed',checks:evidence.checks.length+evidence.paths.checks.length},
    frame:{state:'passed',checks:evidence.bounds.length+frames.length},primary:{state:'passed',views:24},originalPdf:{state:'passed',views:4},candidatePdf:{state:'passed',views:4},
    comparator:{state:'passed',opaquePrimaryViews:264,opaquePdfViews:44,controlledViews:168}}}:{}),...(error?{error}:{})},null,2)+'\n');
  await writeFile(path.join(output,'report.json'),bytes);console.log(JSON.stringify({completed,phase,report:relative(path.join(output,'report.json')),sha256:calcHash(bytes)}));}
async function primaryPair(prefix,left,right,view,{driver=true,target,full=false}={}){
  const measure=view.capture==='intrinsic-image'?measureEdgeTrialPrimary:measureArrowVectorPair,f=reference.primaryFrame;
  const result=await measure(renderer,{reference:left,actual:right,leftIsDriver:driver,origin:driver?f.raw.origin:{x:0,y:0},camera:f.camera,regions:f.regions,
    ...view,cropLimit:target&&view.background==='white'?1:0,cropRegionIds:target&&target!=='whole-picture'?[target]:[],referenceLabel:driver?'Original TikZ':'Control baseline',rightLabel:'Public SVG'});
  assert.equal(result.repeat.rawChangedPixels,0);assert.equal(result.actualRepeat.rawChangedPixels,0);const images={},crops=[];
  for(const[name,b64]of Object.entries(result.images))if(full||['reference','actual'].includes(name)){const f=prefix+'/'+name+'.png';await save(f,Buffer.from(b64,'base64'));images[name]=f;}
  for(const c of result.crops){const links={};for(const[n,b]of Object.entries({...c.paired,sheet:c.sheet})){const f=prefix+'/crops/'+c.id+'-'+n+'.png';await save(f,Buffer.from(b,'base64'));links[n]=f;}
    crops.push({id:c.id,images:links,presentation:c.presentation});}
  const row={...view,candidateInput:true,converterInvoked:false,metrics:result.metrics,regions:result.regions,repeat:result.repeat,actualRepeat:result.actualRepeat,
    naturalFrames:result.naturalFrames,images,crops};await json(prefix+'/record.json',row);return{file:prefix+'/record.json',...row};
}
async function pdfPair(prefix,svg,route,view,{target,full=false}={}){
  const original=route==='original-svg',r=reference.registration;
  const result=await measureEdgePdfPair(renderer,{svg,units:original?'bp':'cssPixels',svgOriginBp:original?reference.primaryFrame.raw.origin:{x:0,y:0},
    camera:r.camera,regions:r.regions,frame:view.frame,scale:view.scale,pdfPage:'data:image/png;base64,'+reference.native.get('pdf-plain/page-'+view.scale+'x.png').toString('base64'),
    cropLimit:target?1:0,cropRegionIds:target&&target!=='whole-picture'?[target]:[],rightLabel:original?'Original SVG':'Public SVG'});
  assert.equal(result.repeat.pdf.rawChangedPixels,0);assert.equal(result.repeat.svg.rawChangedPixels,0);const images={},crops=[];
  for(const[name,b64]of Object.entries(result.images))if(full||['pdf','svg','svg-page'].includes(name)){const f=prefix+'/'+name+'.png';await save(f,Buffer.from(b64,'base64'));images[name]=f;}
  for(const c of result.crops){const links={};for(const[n,b]of Object.entries(c.images)){const f=prefix+'/crops/'+c.id+'-'+n+'.png';await save(f,Buffer.from(b,'base64'));links[n]=f;}
    crops.push({id:c.id,images:links,presentation:c.presentation});}
  const a=decodeCalcPng(Buffer.from(result.images.pdf,'base64')),b=decodeCalcPng(Buffer.from(result.images['svg-page'],'base64'));
  const {images:unused,crops:unusedCrops,...metrics}=result;void unused;void unusedCrops;
  const row={route,candidateInput:!original,converterInvoked:false,...metrics,ink:calcPdfInk(a.rgba,b.rgba,a.width,r.regions,view.scale),images,crops};
  await json(prefix+'/record.json',row);return{file:prefix+'/record.json',...row};
}
const changed=(a,b)=>artifacts[a]!==artifacts[b];
await publish(false);
try{
  reference=await loadCalcTrialReference(root,process.argv[3]);candidate=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'calc-coordinate-candidate-export');
  for(const[key,b]of [['candidate',candidate],['reference',reference.bundle]]){inputs[key]={file:key==='candidate'?process.argv[2]:process.argv[3],sha256:b.sha256};await save(key+'/report.json',b.bytes);for(const[f,bytes]of b.files)await save(key+'/'+f,bytes);}
  evidence=readCalcTrialCandidate(candidate,reference);await currentCalcSources(root,evidence.sourceHashes);
  await json('native-agreement.json',{anchors:evidence.checks,paths:evidence.paths,bounds:evidence.bounds});
  const modules=['trial-calc.mjs','calc-trial-reference.mjs','calc-trial-candidate.mjs','calc-saved-images.mjs','calc-png.mjs','calc-layout-evidence.mjs','calc-native-path-checks.mjs',
    'calc-primary-reference.mjs','calc-primary-policy.mjs','calc-pdf-reference.mjs','calc-pdf-policy.mjs','arrow-pdf-ink.mjs','shape-frame-math.mjs','shape-raster-metrics.mjs',
    'shape-primary-trial-policy.mjs','shape-pdf-trial-policy.mjs','shape-pdf-camera.mjs','edge-trial-images.mjs','edge-oracle-pair.mjs','arrow-vector-pair.mjs','edge-pdf-image-pair.mjs','shape-oracle-bundle.mjs',
    'compare.mjs','browser-profile.json','text-profile.json','node-profile.json','package.json','package-lock.json'];
  for(const f of modules){const key='tools/TikzVisual/'+f,b=await readFile(path.join(root,key));sourceHashes[key]=calcHash(b);await save('source-captures/'+key,b);}
  renderer=await createRenderer();requireRenderer(renderer.identity, reference.bundle.json('primaryCalibration/report.json').renderer, 'Frozen primary renderer differs');
  requireRenderer(renderer.identity, reference.bundle.json('pdfCalibration/report.json').renderer, 'Frozen PDF renderer differs');
  await renderer.page.evaluate('globalThis.shapeRasterMetrics=('+createShapeRasterMetrics.toString()+')()');
  const original=candidate.files.get('reference.svg').toString(),actual=candidate.files.get('actual.svg').toString();
  const built=await buildCalcPrimaryReference(renderer,original,reference.cache);
  const {representations,...frame}=built;void representations;
  const stored=reference.primaryFrame;for(const k of Object.keys(frame))calcEqual(frame[k],stored[k],'Frozen primary reconstruction differs: '+k);
  const rebuilt=await buildCalcPdfReference(renderer,reference.native,reference.cache);calcEqual({evidence:rebuilt.evidence,camera:rebuilt.camera,regions:rebuilt.regions},reference.registration,'Frozen PDF reconstruction differs');
  frames=await renderer.page.evaluate(({svg,expected})=>{const d=new DOMParser().parseFromString(svg,'image/svg+xml'),s=d.documentElement,v=s.getAttribute('viewBox').split(/\s+/).map(Number);
    if(d.querySelector('parsererror')||s.getAttribute('width')!==v[2]+'px'||s.getAttribute('height')!==v[3]+'px')throw Error('Public root dimensions disagree');
    return ['x','y','width','height'].map((name,i)=>({name,reference:expected[name],actual:v[i],limit:0,units:'serialized CSS px',passed:v[i]===expected[name]}));
  },{svg:actual,expected:reference.primaryFrame.serializedBounds});assert.ok(frames.every(f=>f.passed),'Public root differs from native serialized bounds');await json('root-frame.json',frames);
  phase='public-baselines';
  for(const view of calcPrimaryViews){const row=await primaryPair('primary/'+calcPrimaryKey(view),original,actual,view,{full:true});row.evaluation=evaluateCalcPrimary(reference.primaryPolicy,row);
    assert.equal(row.evaluation.passed,true,'Public primary baseline differs: '+calcPrimaryKey(view));await json(row.file,row);primary.push(row);}
  for(const route of ['original-svg','candidate-svg'])for(const view of calcPdfViews){const row=await pdfPair('pdf/'+route+'/'+calcPdfKey(view),route==='original-svg'?original:actual,route,view,{full:true});
    row.evaluation=evaluateCalcPdf(reference.pdfPolicy,row);assert.equal(row.evaluation.passed,true,'Public PDF baseline differs: '+route+'/'+calcPdfKey(view));await json(row.file,row);pdf.push(row);}
  console.log(JSON.stringify({phase,primaryViews:24,pdfViews:8}));phase='separate-replays';
  for(const view of calcPrimaryViews){const row=await primaryPair('replay/primary/'+calcPrimaryKey(view),original,actual,view),first=primary.find(r=>calcPrimaryKey(r)===calcPrimaryKey(view));
    calcEqual(row.metrics,first.metrics,'Public primary replay differs');calcEqual(row.regions,first.regions,'Public primary replay regions differ');
    for(const key of ['reference','actual'])assert.equal(artifacts[row.images[key]],artifacts[first.images[key]],'Public primary replay PNG differs');primaryReplay.push(row);}
  for(const route of ['original-svg','candidate-svg'])for(const view of calcPdfViews){const row=await pdfPair('replay/pdf/'+route+'/'+calcPdfKey(view),route==='original-svg'?original:actual,route,view),first=pdf.find(r=>r.route===route&&calcPdfKey(r)===calcPdfKey(view));
    for(const k of ['whole','regions','ink','fullPage','sourceFrame','clipFrame'])calcEqual(row[k],first[k],'Public PDF replay differs');
    for(const key of ['pdf','svg','svg-page'])assert.equal(artifacts[row.images[key]],artifacts[first.images[key]],'Public PDF replay PNG differs');pdfReplay.push(row);}
  phase='public-image-only-defects';
  for(const declaration of calcPrimaryDefects.filter(d=>!d.rendererOnly)){
    const group={...declaration,numericChecksBypassed:true,primary:[],pdf:[]};defects.push(group);
    for(const kind of ['primary','pdf']){const altered=await mutateCalcTrialCandidate(renderer,actual,declaration,reference,{pdf:kind==='pdf'});await save('defects/'+declaration.name+'/'+kind+'.svg',Buffer.from(altered));
      for(const view of kind==='primary'?calcPrimaryViews:calcPdfViews){const target=kind==='pdf'&&declaration.name==='outside-ink'?'page-corner':declaration.target;
        const row=kind==='primary'?await primaryPair('defects/'+declaration.name+'/primary/'+calcPrimaryKey(view),original,altered,view,{target}):await pdfPair('defects/'+declaration.name+'/pdf/'+calcPdfKey(view),altered,'candidate-svg',view,{target});
        row.evaluation=kind==='primary'?evaluateCalcPrimary(reference.primaryPolicy,row):evaluateCalcPdf(reference.pdfPolicy,row);
        row.expectedVisible=(kind==='pdf'||view.background!=='black'||declaration.name==='wrong-color')&&(!declaration.naturalOnly||view.frame==='natural')&&(!declaration.expandedOnly||view.frame==='expanded');
        const first=kind==='primary'?primary.find(r=>calcPrimaryKey(r)===calcPrimaryKey(view)):pdf.find(r=>r.route==='candidate-svg'&&calcPdfKey(r)===calcPdfKey(view));
        row.observedVisible=changed(row.images[kind==='primary'?'actual':'svg-page'],first.images[kind==='primary'?'actual':'svg-page']);
        assert.equal(row.observedVisible,row.expectedVisible,'Public defect visibility differs: '+declaration.name);
        assert.equal(row.evaluation.passed,!row.expectedVisible,'Public defect escaped: '+declaration.name);
        if(row.expectedVisible)assert.ok(row.evaluation.checks.some(c=>c.id===target&&!c.passed),'Public defect rejected outside target');
        await json(row.file,row);group[kind].push(row);}
    }console.log(JSON.stringify({phase,defect:declaration.name,primaryViews:24,pdfViews:4}));
  }
  phase='controlled-candidate-visibility';
  for(const spec of [{id:'lost-half-clip',target:'native-paint-13'},...['0.01','0.001'].map(opacity=>({id:'opacity-'+opacity.replace('.','-'),opacity:Number(opacity),target:'native-paint-2'}))]){
    const base=await controlCalcTrialCandidate(renderer,actual,spec),declaration=calcPrimaryDefects.find(d=>d.name===(spec.opacity===undefined?'lost-half-clip':'missing-mark'));
    const altered=await mutateCalcTrialCandidate(renderer,base,declaration,reference),group={...spec,rendererOnly:true,numericChecksBypassed:true,candidateOnlyBaseline:true,
      scope:'Exact public-encoding comparator visibility; supplies no native policy allowance or new TikZ clipping/opacity compatibility.',primaryUnchanged:[],primaryAltered:[],pdfUnchanged:[],pdfAltered:[]};controls.push(group);
    await save('controls/'+spec.id+'/unchanged.svg',Buffer.from(base));await save('controls/'+spec.id+'/altered.svg',Buffer.from(altered));
    for(const view of calcPrimaryViews){const unchanged=await primaryPair('controls/'+spec.id+'/primary/unchanged/'+calcPrimaryKey(view),base,base,view,{driver:false}),row=await primaryPair('controls/'+spec.id+'/primary/altered/'+calcPrimaryKey(view),base,altered,view,{driver:false,target:spec.target});
      assert.equal(unchanged.metrics.rawChangedPixels,0);row.observedVisible=row.metrics.rawChangedPixels>0;row.exactControlPassed=!row.observedVisible;
      assert.equal(row.regions.find(r=>r.id===spec.target).rawChangedPixels>0,row.observedVisible);if(view.background==='black')assert.equal(row.observedVisible,false);
      await json(row.file,row);group.primaryUnchanged.push(unchanged);group.primaryAltered.push(row);}
    for(const view of calcPdfViews)group.pdfUnchanged.push(await pdfPair('controls/'+spec.id+'/pdf/unchanged/'+calcPdfKey(view),base,'candidate-svg',view));
    group.inkPolicy=deriveCalcPdfInkPolicy(group.pdfUnchanged,group.scope);
    for(const view of calcPdfViews){const row=await pdfPair('controls/'+spec.id+'/pdf/altered/'+calcPdfKey(view),altered,'candidate-svg',view,{target:spec.target}),first=group.pdfUnchanged.find(r=>calcPdfKey(r)===calcPdfKey(view));
      row.observedVisible=changed(row.images['svg-page'],first.images['svg-page']);row.evaluation=evaluateCalcPdfInk(group.inkPolicy,row);
      assert.equal(row.evaluation.passed,!row.observedVisible);if(row.observedVisible)assert.ok(row.evaluation.checks.some(c=>c.id===spec.target&&!c.passed));await json(row.file,row);group.pdfAltered.push(row);}
    console.log(JSON.stringify({phase,control:spec.id,visiblePrimary:group.primaryAltered.filter(r=>r.observedVisible).length,visiblePdf:group.pdfAltered.filter(r=>r.observedVisible).length}));
  }
  phase='inspection';const selected=[...primary.filter(r=>r.background==='white'&&r.capture==='explicit-viewport'&&r.frame==='expanded'),...pdf.filter(r=>r.route==='candidate-svg'),
    ...defects.flatMap(d=>[...d.primary.filter(r=>r.capture==='explicit-viewport'&&r.background==='white'&&r.frame===(d.naturalOnly?'natural':'expanded')),...d.pdf.filter(r=>r.frame===(d.naturalOnly?'natural':'expanded'))])].map(r=>({record:r.file,images:r.images,crops:r.crops}));
  await json('agent-inspection.json',{schemaVersion:1,completionState:'complete',acceptance:'pending',source:'candidate/source.tikz',scene:'candidate/actual-scene.json',
    nativeAgreement:'native-agreement.json',rootFrame:'root-frame.json',selected,attribution:reference.primaryFrame.regions.map((r,i)=>({id:r.id,
      intended:{semanticId:evidence.scene.paths[i].semanticId,svgElementId:evidence.scene.paths[i].svgElementId,source:evidence.scene.paths[i].source,confidence:'verified-native-path-sequence'}})),
    controls:controls.map(c=>({id:c.id,scope:c.scope,unchanged:c.pdfUnchanged.map(r=>({view:calcPdfKey(r),image:r.images['svg-page']})),altered:c.pdfAltered.map(r=>({view:calcPdfKey(r),image:r.images['svg-page']}))})),
    rerun:{executable:'node',arguments:['tools/TikzVisual/trial-calc.mjs',...process.argv.slice(2)]},freshCandidate:{executable:'dotnet',arguments:['run','--project','tools/TikzReference','-c','Release','--','export-calc-coordinates']},
    remaining:['independent current-candidate trial verification','reviewed combined admission','broader interactions','root integration']});
  await save('index.html',Buffer.from('<!doctype html><meta charset="utf-8"><title>Calc public trial</title><style>body{font:16px sans-serif;margin:24px}img{max-width:100%;image-rendering:pixelated}</style><h1>Calc public trial; admission pending</h1><p>Frozen native camera and research policies. Numeric, frame, primary and original/candidate PDF gates pass.</p><a href="report.json">Report</a> · <a href="agent-inspection.json">Agent JSON</a>'+selected.map(r=>'<article><h2>'+r.record+'</h2>'+r.crops.map(c=>'<img src="'+c.images.sheet+'">').join('')+'</article>').join('')));
  await currentCalcSources(root,{...reference.nativeSourceHashes,...evidence.sourceHashes,...sourceHashes});
  for(const[f,h]of Object.entries(artifacts))assert.equal(calcHash(await readFile(path.join(output,f))),h);
  assert.equal(calcHash(await readFile(path.resolve(root,process.argv[2]))),candidate.sha256);assert.equal(calcHash(await readFile(path.resolve(root,process.argv[3]))),reference.bundle.sha256);
  phase='complete';await publish(true);
}catch(error){process.exitCode=1;await publish(false,error.message.replaceAll(root,'<repo>').slice(0,2000));console.error(error.stack);}
finally{if(renderer)await renderer.browser.close();}
