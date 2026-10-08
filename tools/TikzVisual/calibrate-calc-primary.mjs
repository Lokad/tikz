// Oracle-only primary calibration and defect sensitivity; never admits a policy.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRenderer} from './compare.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {measureArrowVectorPair} from './arrow-vector-pair.mjs';
import {buildCalcPrimaryReference,calcPrimaryDefects,mutateCalcPrimary,calcControlledClip} from './calc-primary-reference.mjs';
import {calcPrimaryViews,calcPrimaryKey,deriveCalcPrimaryPolicy,evaluateCalcPrimary} from './calc-primary-policy.mjs';
import {loadCalcSavedReport,calcHash,calcEqual} from './calc-saved-images.mjs';
import {readCalcLayoutEvidence} from './calc-layout-evidence.mjs';

assert.equal(process.argv.length,3,'Usage: node tools/TikzVisual/calibrate-calc-primary.mjs <native-layout/report.json>');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.join(root,'artifacts/calc-primary-calibration/run-'+randomUUID());
await mkdir(output,{recursive:true});
const artifacts={},sourceHashes={},records=[],replays=[],defects=[],visibility=[];
const relative=file=>path.relative(root,file).split(path.sep).join('/');
async function save(file,bytes){await mkdir(path.dirname(path.join(output,file)),{recursive:true});await writeFile(path.join(output,file),bytes);artifacts[file]=calcHash(bytes);}
const json=(file,value)=>save(file,Buffer.from(JSON.stringify(value,null,2)+'\n'));
let phase='native-inputs',renderer,frame,policy,nativeHash;
async function publish(completed,error){
  const index=r=>Object.fromEntries(Object.entries({file:r.file,encoding:r.encoding,capture:r.capture,frame:r.frame,scale:r.scale,background:r.background}).filter(([,v])=>v!==undefined));
  const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'native-calc-primary-calibration',completed,phase,converterInvoked:false,nativeToolInvoked:false,
    approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',input:{file:process.argv[2],sha256:nativeHash},
    renderer:renderer?.identity,sourceHashes,artifacts,records:records.map(index),replays:replays.map(index),policy,
    defects:defects.map(({comparisons,...d})=>({...d,comparisons:comparisons.map(index)})),
    visibility:visibility.map(({comparisons,...v})=>({...v,comparisons:comparisons.map(index)})),...(error?{error}: {})},null,2)+'\n');
  await writeFile(path.join(output,'report.json'),bytes);
  console.log(JSON.stringify({completed,phase,report:relative(path.join(output,'report.json')),sha256:calcHash(bytes)}));
}
async function observe(prefix,reference,actual,view,{leftIsDriver=true,target,allImages=false}={}){
  const measure=view.capture==='intrinsic-image'?measureEdgeTrialPrimary:measureArrowVectorPair;
  const pair=await measure(renderer,{reference,actual,leftIsDriver,origin:leftIsDriver?frame.raw.origin:{x:0,y:0},camera:frame.camera,regions:frame.regions,
    ...view,cropLimit:view.background==='white'?1:0,cropRegionIds:target&&target!=='whole-picture'?[target]:[],
    referenceLabel:'Native reference',rightLabel:'Native encoding / controlled defect'});
  assert.equal(pair.repeat.rawChangedPixels,0);assert.equal(pair.actualRepeat.rawChangedPixels,0);
  const images={},crops=[];
  for(const[name,base64]of Object.entries(pair.images))if(allImages||['reference','actual'].includes(name)){
    const file=prefix+'/'+name+'.png';await save(file,Buffer.from(base64,'base64'));images[name]=file;
  }
  for(const crop of pair.crops){const links={};
    for(const[name,base64]of Object.entries({...crop.paired,sheet:crop.sheet})){
      const file=prefix+'/crops/'+crop.id+'-'+name+'.png';await save(file,Buffer.from(base64,'base64'));links[name]=file;
    }
    crops.push({id:crop.id,images:links,presentation:crop.presentation});
  }
  const row={...view,converterInvoked:false,metrics:pair.metrics,regions:pair.regions,repeat:pair.repeat,actualRepeat:pair.actualRepeat,
    naturalFrames:pair.naturalFrames,images,crops};
  await json(prefix+'/record.json',row);return{file:prefix+'/record.json',...row};
}
function targetFailed(evaluation,target){return evaluation.checks.some(c=>c.id===target&&!c.passed);}
await publish(false);
try{
  const native=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'native-calc-layout-page-research');nativeHash=native.sha256;
  const cacheBytes=await readFile(path.join(root,'tests/Reference/CalcCoordinates/points.json')),cache=JSON.parse(cacheBytes);
  const pinBytes=await readFile(path.join(root,'tests/Reference/CalcCoordinates/pdf-pin.json')),pin=JSON.parse(pinBytes);
  assert.equal(native.sha256,pin.nativeReportSha256);assert.equal(native.report.sourceSha256,cache.sourceSha256);
  assert.equal(calcHash(native.files.get('pdf-plain/case.pdf')),pin.pdfSha256);
  for(const scale of [1,4])assert.equal(calcHash(native.files.get('pdf-plain/page-'+scale+'x.png')),pin.rasterSha256[scale+'x']);
  calcEqual(readCalcLayoutEvidence(Object.fromEntries(native.files),cache).measurements,native.report.measurements,'Native layout summary differs');
  await save('native/report.json',native.bytes);for(const[file,bytes]of native.files)await save('native/'+file,bytes);
  await save('points.json',cacheBytes);await save('pdf-pin.json',pinBytes);
  const modules=['calibrate-calc-primary.mjs','calc-primary-reference.mjs','calc-primary-policy.mjs','calc-saved-images.mjs','calc-png.mjs',
    'calc-layout-evidence.mjs','shape-frame-math.mjs','shape-raster-metrics.mjs','shape-primary-trial-policy.mjs',
    'edge-trial-images.mjs','edge-oracle-pair.mjs','arrow-vector-pair.mjs','shape-oracle-bundle.mjs','compare.mjs',
    'browser-profile.json','text-profile.json','node-profile.json','package.json','package-lock.json'];
  for(const file of modules){const key='tools/TikzVisual/'+file,bytes=await readFile(path.join(root,key));sourceHashes[key]=calcHash(bytes);await save('source-captures/'+key,bytes);}
  renderer=await createRenderer();await renderer.page.evaluate('globalThis.shapeRasterMetrics=('+createShapeRasterMetrics.toString()+')()');
  const reference=native.files.get('svg-plain/reference.svg').toString();frame=await buildCalcPrimaryReference(renderer,reference,cache);
  await json('native-frame.json',{...frame,representations:frame.representations.map(r=>({id:r.id,nativePaths:r.nativePaths,converterInvoked:r.converterInvoked}))});
  for(const r of frame.representations)await save('encodings/'+r.id+'.svg',Buffer.from(r.svg));
  phase='native-only-encodings';
  for(const encoding of frame.representations){
    for(const view of calcPrimaryViews){const row=await observe('encodings/'+encoding.id+'/'+calcPrimaryKey(view),reference,encoding.svg,view,{allImages:true});records.push({encoding:encoding.id,...row});}
    console.log(JSON.stringify({phase,encoding:encoding.id,views:24}));
  }
  policy=deriveCalcPrimaryPolicy(records);await json('trial-policy.json',policy);
  for(const row of records)assert.equal(evaluateCalcPrimary(policy,row).passed,true,'Native baseline does not satisfy its own derived policy');
  phase='independent-recapture';const canonical=frame.representations.at(-1).svg;
  for(const view of calcPrimaryViews){const row=await observe('replay/'+calcPrimaryKey(view),reference,canonical,view);
    const first=records.find(r=>r.encoding===frame.contract.representations.at(-1)&&calcPrimaryKey(r)===calcPrimaryKey(view));
    calcEqual(row.metrics,first.metrics,'Repeated native metrics differ');calcEqual(row.regions,first.regions,'Repeated native regions differ');
    for(const file of ['reference','actual'])assert.equal(artifacts[row.images[file]],artifacts[first.images[file]],'Repeated native PNG differs');replays.push(row);
  }
  phase='image-only-defects';
  for(const defect of calcPrimaryDefects){
    const base=defect.rendererOnly?await calcControlledClip(renderer,canonical):canonical;
    const altered=await mutateCalcPrimary(renderer,base,defect,frame);
    assert.notEqual(calcHash(Buffer.from(base)),calcHash(Buffer.from(altered)),'Defect did not alter SVG');
    await save('defects/'+defect.name+'/unchanged.svg',Buffer.from(base));await save('defects/'+defect.name+'/altered.svg',Buffer.from(altered));
    const control={...defect,numericChecksBypassed:true,converterInvoked:false,comparisons:[]};defects.push(control);
    for(const view of calcPrimaryViews){
      // Ordinary defects are judged against the original native driver. Clip
      // controls use two identical managed encodings to isolate lost clipping.
      const left=defect.rendererOnly?base:reference;
      const row=await observe('defects/'+defect.name+'/'+calcPrimaryKey(view),left,altered,view,{leftIsDriver:!defect.rendererOnly,target:defect.target});
      row.evaluation=evaluateCalcPrimary(policy,row);
      const expectedVisible=view.background!=='black'||defect.name==='wrong-color';
      const visible=expectedVisible&&(!defect.naturalOnly||view.frame==='natural')&&(!defect.expandedOnly||view.frame==='expanded');
      row.expectedVisible=visible;
      if(visible){assert.equal(row.evaluation.passed,false,'Visible defect passed: '+defect.name+' '+calcPrimaryKey(view));
        assert.ok(targetFailed(row.evaluation,defect.target),'Defect rejected outside intended region: '+defect.name+' '+calcPrimaryKey(view));}
      else{
        assert.equal(row.evaluation.passed,true,'Declared invisible defect changed required metrics: '+defect.name+' '+calcPrimaryKey(view));
        const baseline=await observe('defects/'+defect.name+'/visibility-base/'+calcPrimaryKey(view),left,base,view,{leftIsDriver:!defect.rendererOnly});
        assert.equal(artifacts[row.images.actual],artifacts[baseline.images.actual],'Declared invisible defect changed samples');
      }
      await json(row.file,row);control.comparisons.push(row);
    }
    console.log(JSON.stringify({phase,defect:defect.name,views:24}));
  }
  phase='controlled-faint-visibility';
  for(const opacity of ['0.01','0.001']){
    const base=await renderer.page.evaluate(({svg,opacity})=>{
      const doc=new DOMParser().parseFromString(svg,'image/svg+xml');doc.querySelector('#native-p2').setAttribute('stroke-opacity',opacity);
      return new XMLSerializer().serializeToString(doc);
    },{svg:canonical,opacity});
    const missing=await mutateCalcPrimary(renderer,base,calcPrimaryDefects[0],frame),id='opacity-'+opacity.replace('.','-');
    await save('visibility/'+id+'/unchanged.svg',Buffer.from(base));await save('visibility/'+id+'/missing.svg',Buffer.from(missing));
    const control={id,opacity:Number(opacity),rendererOnly:true,numericChecksBypassed:true,converterInvoked:false,
      scope:'Exact unchanged-encoding visibility test, not a native opacity compatibility fixture or an opaque-policy allowance.',comparisons:[]};visibility.push(control);
    for(const view of calcPrimaryViews){
      const row=await observe('visibility/'+id+'/'+calcPrimaryKey(view),base,missing,view,{leftIsDriver:false,target:'native-paint-2'});
      const region=row.regions.find(r=>r.id==='native-paint-2');assert.ok(region);
      row.observedVisible=row.metrics.rawChangedPixels>0;assert.equal(region.rawChangedPixels>0,row.observedVisible);
      if(view.background==='black')assert.equal(row.observedVisible,false);
      row.exactControlPassed=!row.observedVisible;await json(row.file,row);control.comparisons.push(row);
    }
    console.log(JSON.stringify({phase,opacity,visible:control.comparisons.filter(r=>r.observedVisible).length,views:24}));
  }
  phase='inspection';
  const selected=defects.flatMap(d=>d.comparisons.filter(r=>r.background==='white'&&r.capture==='explicit-viewport'&&r.frame==='expanded')
    .map(r=>({defect:d.name,view:calcPrimaryKey(r),record:r.file,crops:r.crops,expectedVisible:r.expectedVisible})));
  await json('agent-inspection.json',{schemaVersion:1,completionState:'complete',acceptance:'pending',referenceRoute:'original-svg',
    converterInvoked:false,nativeFrame:'native-frame.json',trialPolicy:'trial-policy.json',selected,
    rerun:{executable:'node',arguments:['tools/TikzVisual/calibrate-calc-primary.mjs',process.argv[2]]},
    remaining:['independent saved-calibration verification','ordinary PDF calibration and sensitivity','public candidate trial','broader interactions','root integration']});
  await save('index.html',Buffer.from('<!doctype html><meta charset="utf-8"><title>Native calc primary calibration</title><style>body{font:16px sans-serif;margin:24px}img{max-width:100%;image-rendering:pixelated}</style><h1>Native calc primary calibration; admission pending</h1><p>No converter invoked. Renderer-only clip/opacity controls have no native TikZ compatibility claim.</p><a href="report.json">Report</a> · <a href="agent-inspection.json">Agent JSON</a>'+selected.map(r=>'<article><h2>'+r.defect+' / '+r.view+'</h2><a href="'+r.record+'">Metrics</a>'+r.crops.map(c=>'<img src="'+c.images.sheet+'">').join('')+'</article>').join('')));
  for(const[file,digest]of Object.entries(sourceHashes))assert.equal(calcHash(await readFile(path.join(root,file))),digest);
  for(const[file,digest]of Object.entries(artifacts))assert.equal(calcHash(await readFile(path.join(output,file))),digest);
  assert.equal(calcHash(await readFile(path.resolve(root,process.argv[2]))),nativeHash);
  phase='complete';await publish(true);
}catch(error){process.exitCode=1;await publish(false,error.message.replaceAll(root,'<repo>').slice(0,2000));console.error(error.stack);}
finally{if(renderer)await renderer.browser.close();}
