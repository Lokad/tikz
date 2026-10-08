// Independent native-page calibration and SVG image defects. No converter call.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRenderer} from './compare.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {measureEdgePdfPair} from './edge-pdf-image-pair.mjs';
import {calcPrimaryDefects,mutateCalcPrimary,calcControlledClip} from './calc-primary-reference.mjs';
import {buildCalcPdfReference} from './calc-pdf-reference.mjs';
import {calcPdfViews,calcPdfKey,calcPdfInk,deriveCalcPdfPolicy,evaluateCalcPdf,deriveCalcPdfInkPolicy,evaluateCalcPdfInk} from './calc-pdf-policy.mjs';
import {loadCalcSavedReport,calcHash,calcEqual} from './calc-saved-images.mjs';
import {decodeCalcPng} from './calc-png.mjs';

assert.equal(process.argv.length,3,'Usage: node tools/TikzVisual/calibrate-calc-pdf.mjs <native-layout/report.json>');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.join(root,'artifacts/calc-pdf-calibration/run-'+randomUUID());
await mkdir(output,{recursive:true});
const artifacts={},sourceHashes={},records=[],replays=[],defects=[],controlled=[],visibility=[];
const relative=file=>path.relative(root,file).split(path.sep).join('/');
async function save(file,b){await mkdir(path.dirname(path.join(output,file)),{recursive:true});await writeFile(path.join(output,file),b);artifacts[file]=calcHash(b);}
const json=(file,value)=>save(file,Buffer.from(JSON.stringify(value,null,2)+'\n'));
let phase='native-inputs',nativeHash,renderer,built,policy;
async function publish(completed,error){
  const index=r=>({file:r.file,route:r.route,frame:r.frame,scale:r.scale,background:'white'});
  const b=Buffer.from(JSON.stringify({schemaVersion:1,role:'native-calc-pdf-calibration',completed,phase,converterInvoked:false,nativeToolInvoked:false,
    approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',input:{file:process.argv[2],sha256:nativeHash},renderer:renderer?.identity,
    sourceHashes,artifacts,policy,records:records.map(index),replays:replays.map(index),
    defects:defects.map(({comparisons,...d})=>({...d,comparisons:comparisons.map(index)})),
    controlled:controlled.map(({unchanged,comparisons,...c})=>({...c,unchanged:unchanged.map(index),comparisons:comparisons.map(index)})),
    visibility:visibility.map(({unchanged,comparisons,...c})=>({...c,unchanged:unchanged.map(index),comparisons:comparisons.map(index)})),...(error?{error}:{})},null,2)+'\n');
  await writeFile(path.join(output,'report.json'),b);console.log(JSON.stringify({completed,phase,report:relative(path.join(output,'report.json')),sha256:calcHash(b)}));
}
const pngs=new Map();
async function observe(prefix,svg,route,view,{target,allImages=false}={}){
  const original=route==='original-driver',pair=await measureEdgePdfPair(renderer,{svg,units:original?'bp':'cssPixels',svgOriginBp:original?built.frame.raw.origin:{x:0,y:0},
    camera:built.camera,regions:built.regions,frame:view.frame,scale:view.scale,pdfPage:pngs.get(view.scale),cropLimit:target?1:0,
    cropRegionIds:target&&target!=='whole-picture'?[target]:[],rightLabel:'Native SVG'});
  assert.equal(pair.repeat.pdf.rawChangedPixels,0);assert.equal(pair.repeat.svg.rawChangedPixels,0);
  const images={},crops=[];
  for(const[name,base64]of Object.entries(pair.images))if(allImages||['pdf','svg','svg-page'].includes(name)){
    const file=prefix+'/'+name+'.png';await save(file,Buffer.from(base64,'base64'));images[name]=file;
  }
  for(const crop of pair.crops){const links={};for(const[name,base64]of Object.entries(crop.images)){
    const file=prefix+'/crops/'+crop.id+'-'+name+'.png';await save(file,Buffer.from(base64,'base64'));links[name]=file;}
    crops.push({id:crop.id,images:links,presentation:crop.presentation});}
  const a=decodeCalcPng(Buffer.from(pair.images.pdf,'base64')),b=decodeCalcPng(Buffer.from(pair.images['svg-page'],'base64'));
  const ink=calcPdfInk(a.rgba,b.rgba,a.width,built.regions,view.scale);
  const {images:unused,crops:unusedCrops,...metrics}=pair;void unused;void unusedCrops;
  const row={route,converterInvoked:false,...metrics,ink,images,crops};const file=prefix+'/record.json';await json(file,row);return{file,...row};
}
await publish(false);
try{
  const native=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'native-calc-layout-page-research');nativeHash=native.sha256;
  const cacheBytes=await readFile(path.join(root,'tests/Reference/CalcCoordinates/points.json')),cache=JSON.parse(cacheBytes);
  const pinBytes=await readFile(path.join(root,'tests/Reference/CalcCoordinates/pdf-pin.json')),pin=JSON.parse(pinBytes);
  assert.equal(native.sha256,pin.nativeReportSha256);assert.equal(native.report.sourceSha256,cache.sourceSha256);
  assert.equal(calcHash(native.files.get('pdf-plain/case.pdf')),pin.pdfSha256);
  for(const scale of [1,4]){const b=native.files.get('pdf-plain/page-'+scale+'x.png');assert.equal(calcHash(b),pin.rasterSha256[scale+'x']);pngs.set(scale,'data:image/png;base64,'+b.toString('base64'));}
  await save('native/report.json',native.bytes);for(const[file,b]of native.files)await save('native/'+file,b);
  await save('points.json',cacheBytes);await save('pdf-pin.json',pinBytes);
  for(const file of ['calibrate-calc-pdf.mjs','calc-pdf-reference.mjs','calc-pdf-policy.mjs','calc-primary-reference.mjs','calc-layout-evidence.mjs',
    'calc-saved-images.mjs','calc-png.mjs','arrow-pdf-ink.mjs','shape-frame-math.mjs','shape-raster-metrics.mjs','shape-pdf-trial-policy.mjs','shape-pdf-camera.mjs',
    'edge-pdf-image-pair.mjs','compare.mjs','browser-profile.json','text-profile.json','node-profile.json','package.json','package-lock.json']){
    const key='tools/TikzVisual/'+file,b=await readFile(path.join(root,key));sourceHashes[key]=calcHash(b);await save('source-captures/'+key,b);}
  renderer=await createRenderer();await renderer.page.evaluate('globalThis.shapeRasterMetrics=('+createShapeRasterMetrics.toString()+')()');
  built=await buildCalcPdfReference(renderer,native.files,cache);calcEqual(built.evidence.measurements,native.report.measurements,'Native summary differs');
  await json('registration.json',{evidence:built.evidence,camera:built.camera,regions:built.regions});
  for(const r of built.representations)await save('encodings/'+r.id+'.svg',Buffer.from(r.svg));
  phase='native-page-calibration';
  for(const representation of built.representations){
    for(const view of calcPdfViews)records.push(await observe('encodings/'+representation.id+'/'+calcPdfKey(view),representation.svg,representation.id,view,{allImages:true}));
    console.log(JSON.stringify({phase,route:representation.id,views:4}));
  }
  policy=deriveCalcPdfPolicy(records,built.camera,built.regions);await json('trial-policy.json',policy);
  for(const row of records)assert.equal(evaluateCalcPdf(policy,row).passed,true,'Native route exceeds independent envelope');
  const canonical=built.representations.at(-1);
  phase='native-page-replay';
  for(const representation of built.representations)for(const view of calcPdfViews){
    const row=await observe('replay/'+representation.id+'/'+calcPdfKey(view),representation.svg,representation.id,view);
    const first=records.find(r=>r.route===representation.id&&calcPdfKey(r)===calcPdfKey(view));
    for(const k of ['whole','regions','ink','fullPage','sourceFrame','clipFrame'])calcEqual(row[k],first[k],'Native PDF replay differs');
    for(const k of ['pdf','svg','svg-page'])assert.equal(artifacts[row.images[k]],artifacts[first.images[k]],'Native page replay PNG differs');replays.push(row);
  }
  phase='image-only-defects';
  for(const declaration of calcPrimaryDefects.filter(d=>!d.rendererOnly)){
    const defect={...declaration,...(declaration.name==='outside-ink'?{target:'page-corner'}:{})};
    let altered=await mutateCalcPrimary(renderer,canonical.svg,defect,built.frame);
    if(defect.name==='outside-ink')altered=await renderer.page.evaluate(({svg,origin})=>{
      const doc=new DOMParser().parseFromString(svg,'image/svg+xml'),mark=doc.documentElement.lastElementChild;
      mark.setAttribute('d','M'+(20-origin.x)+' '+(20-origin.y)+'h2v2h-2Z');return new XMLSerializer().serializeToString(doc);
    },{svg:altered,origin:built.camera.origin});
    assert.notEqual(calcHash(Buffer.from(altered)),calcHash(Buffer.from(canonical.svg)));await save('defects/'+defect.name+'/altered.svg',Buffer.from(altered));
    const control={...defect,converterInvoked:false,numericChecksBypassed:true,comparisons:[]};defects.push(control);
    for(const view of calcPdfViews){
      const row=await observe('defects/'+defect.name+'/'+calcPdfKey(view),altered,canonical.id,view,{target:defect.target});row.evaluation=evaluateCalcPdf(policy,row);
      const baseline=records.find(r=>r.route===canonical.id&&calcPdfKey(r)===calcPdfKey(view));
      row.expectedVisible=(!defect.naturalOnly||view.frame==='natural')&&(!defect.expandedOnly||view.frame==='expanded');
      row.observedVisible=artifacts[row.images['svg-page']]!==artifacts[baseline.images['svg-page']];assert.equal(row.observedVisible,row.expectedVisible,'Unexpected native-page visibility: '+defect.name);
      assert.equal(row.evaluation.passed,!row.expectedVisible,'Native PDF defect escaped: '+defect.name+' '+calcPdfKey(view));
      if(row.expectedVisible)assert.ok(row.evaluation.checks.some(c=>c.id===defect.target&&!c.passed),'Native PDF defect failed outside target: '+defect.name);
      await json(row.file,row);control.comparisons.push(row);
    }
    console.log(JSON.stringify({phase,defect:defect.name,views:4}));
  }
  phase='controlled-renderer-visibility';
  const clipDefect=calcPrimaryDefects.find(d=>d.rendererOnly),clipped=await calcControlledClip(renderer,canonical.svg),unclipped=await mutateCalcPrimary(renderer,clipped,clipDefect,built.frame);
  for(const control of [{id:'lost-half-clip',target:'native-paint-13',base:clipped,altered:unclipped},
    ...await Promise.all(['0.01','0.001'].map(async opacity=>{
      const base=await renderer.page.evaluate(({svg,opacity})=>{const d=new DOMParser().parseFromString(svg,'image/svg+xml');d.querySelector('#native-p2').setAttribute('stroke-opacity',opacity);return new XMLSerializer().serializeToString(d);},{svg:canonical.svg,opacity});
      return{id:'opacity-'+opacity.replace('.','-'),opacity:Number(opacity),target:'native-paint-2',base,altered:await mutateCalcPrimary(renderer,base,calcPrimaryDefects[0],built.frame)};
    }))]){
    const group={id:control.id,target:control.target,...(control.opacity===undefined?{}:{opacity:control.opacity}),rendererOnly:true,converterInvoked:false,numericChecksBypassed:true,
      scope:'Exact native-encoding RGB ink/moment control; not native PDF clipping/opacity conformance.',unchanged:[],comparisons:[]};
    (control.opacity===undefined?controlled:visibility).push(group);
    await save('controls/'+control.id+'/unchanged.svg',Buffer.from(control.base));await save('controls/'+control.id+'/altered.svg',Buffer.from(control.altered));
    for(const view of calcPdfViews)group.unchanged.push(await observe('controls/'+control.id+'/unchanged/'+calcPdfKey(view),control.base,canonical.id,view,{target:control.target}));
    group.inkPolicy=deriveCalcPdfInkPolicy(group.unchanged,group.scope);
    for(const view of calcPdfViews){
      const row=await observe('controls/'+control.id+'/altered/'+calcPdfKey(view),control.altered,canonical.id,view,{target:control.target});
      const baseline=group.unchanged.find(r=>calcPdfKey(r)===calcPdfKey(view));row.observedVisible=artifacts[row.images['svg-page']]!==artifacts[baseline.images['svg-page']];
      row.evaluation=evaluateCalcPdfInk(group.inkPolicy,row);assert.equal(row.evaluation.passed,!row.observedVisible,'Visible controlled page change escaped ink gate');
      if(row.observedVisible)assert.ok(row.evaluation.checks.some(c=>c.id===control.target&&!c.passed));await json(row.file,row);group.comparisons.push(row);
    }
    console.log(JSON.stringify({phase,control:control.id,visible:group.comparisons.filter(r=>r.observedVisible).length,views:4}));
  }
  phase='inspection';
  const selected=defects.flatMap(d=>d.comparisons.filter(r=>r.frame===(d.naturalOnly?'natural':'expanded')).map(r=>({defect:d.name,record:r.file,scale:r.scale,images:r.images,crops:r.crops})));
  await json('agent-inspection.json',{schemaVersion:1,completionState:'complete',acceptance:'pending',registration:'registration.json',trialPolicy:'trial-policy.json',selected,
    rerun:{executable:'node',arguments:['tools/TikzVisual/calibrate-calc-pdf.mjs',process.argv[2]]},
    remaining:['independent saved-PDF calibration check','fresh public candidate trial','reviewed combined admission','broader interactions','root integration']});
  await save('index.html',Buffer.from('<!doctype html><meta charset="utf-8"><title>Native calc PDF calibration</title><style>body{font:16px sans-serif;margin:24px}img{max-width:100%;image-rendering:pixelated}</style><h1>Native calc PDF calibration; admission pending</h1><p>Original PDF pixels; fixed native page. No converter invoked. Ink/moment ranges supplement pixel/edge limits.</p><a href="report.json">Report</a> · <a href="agent-inspection.json">Agent JSON</a>'+selected.map(r=>'<article><h2>'+r.defect+' / '+r.scale+'x</h2><a href="'+r.record+'">Measurements</a>'+r.crops.map(c=>'<img src="'+c.images.sheet+'">').join('')+'</article>').join('')));
  for(const[file,digest]of Object.entries(sourceHashes))assert.equal(calcHash(await readFile(path.join(root,file))),digest);
  for(const[file,digest]of Object.entries(artifacts))assert.equal(calcHash(await readFile(path.join(output,file))),digest);
  assert.equal(calcHash(await readFile(path.resolve(root,process.argv[2]))),nativeHash);phase='complete';await publish(true);
}catch(error){process.exitCode=1;await publish(false,error.message.replaceAll(root,'<repo>').slice(0,2000));console.error(error.stack);}
finally{if(renderer)await renderer.browser.close();}
