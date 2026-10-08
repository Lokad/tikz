// Original SVG and public candidate on an independently measured native PDF page.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRenderer} from './compare.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {parsePath,parseTransform,transformSegments,pathBounds} from './shape-frame-math.mjs';
import {checkCalcNativePaths} from './calc-native-path-checks.mjs';
import {measureEdgePdfPair} from './edge-pdf-image-pair.mjs';
import {readCalcLayoutEvidence} from './calc-layout-evidence.mjs';

assert.equal(process.argv.length,4,'Usage: node tools/TikzVisual/inspect-calc-pdf.mjs <candidate-export/report.json> <native-layout/report.json>');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.join(root,'artifacts/calc-pdf-inspection/run-'+randomUUID());
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),artifacts={},sources={};
await mkdir(output,{recursive:true});
async function save(file,bytes){assert.match(file,/^[a-zA-Z0-9_./-]+$/);assert.ok(!file.split('/').includes('..')&&!file.startsWith('/'));
  const target=path.join(output,file);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);artifacts[file]=hash(bytes);}
const saveJson=(file,value)=>save(file,Buffer.from(JSON.stringify(value,null,2)+'\n'));
let phase='bound-inputs',renderer;
const inputs={};
async function publish(details){const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'calc-ordinary-pdf-rendering-research',phase,inputs,
  converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',artifacts,...details},null,2)+'\n');
  await writeFile(path.join(output,'report.json'),bytes);console.log(JSON.stringify({completed:details.completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:hash(bytes)}));}
await publish({completed:false});
async function load(file,role,prefix){
  const target=path.resolve(root,file);assert.ok(target.startsWith(path.join(root,'artifacts')+path.sep));
  const bytes=await readFile(target),report=JSON.parse(bytes),loaded={};
  assert.equal(report.completed,true);assert.equal(report.phase,'complete');assert.equal(report.role,role);
  assert.equal(report.imageConformanceClaim,false);assert.equal(report.imageAdmission,'pending');
  inputs[prefix]={file,sha256:hash(bytes)};await save(prefix+'/report.json',bytes);
  for(const[name,digest]of Object.entries(report.artifacts)){
    assert.match(name,/^[a-zA-Z0-9_./-]+$/);assert.ok(!name.split('/').includes('..')&&!name.startsWith('/'));
    const item=await readFile(path.join(path.dirname(target),name));assert.equal(hash(item),digest);
    loaded[name]=item;await save(prefix+'/'+name,item);
  }
  return{report,loaded,target};
}
async function comparePages(a,b,scale){
  return renderer.page.evaluate(async({a,b,scale})=>{
    const data=[];let width,height;for(const text of[a,b]){const im=new Image();im.src='data:image/png;base64,'+text;await im.decode();
      if(width!==undefined&&(width!==im.width||height!==im.height))throw Error('Page sizes differ');width=im.width;height=im.height;
      const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);data.push(ctx.getImageData(0,0,width,height).data);}
    return globalThis.shapeRasterMetrics.compare(...data,{width,height,scale,background:'white',maskThreshold:16});
  },{a,b,scale});
}
try{
  const candidate=await load(process.argv[2],'calc-coordinate-candidate-export','candidate');
  const native=await load(process.argv[3],'native-calc-layout-page-research','native');
  const c=candidate.loaded,n=native.loaded;
  assert.equal(candidate.report.details.publicTraceParity,true);assert.equal(candidate.report.details.quantities,50);
  assert.equal(hash(c['source.tikz']),native.report.sourceSha256);assert.equal(hash(n['case.tikz']),native.report.sourceSha256);
  const guardFiles=JSON.parse(c['candidate-source-hashes.json']);
  for(const[file,digest]of Object.entries(guardFiles)){
    assert.ok(file.startsWith('src/Lokad.TikZ/')||file.startsWith('tools/TikzReference/')||['Directory.Build.props','global.json'].includes(file));
    assert.ok(!file.split('/').includes('..'));assert.equal(hash(await readFile(path.join(root,file))),digest);
  }
  for(const file of ['inspect-calc-pdf.mjs','compare.mjs','browser-profile.json','text-profile.json','node-profile.json','package.json','package-lock.json',
    'shape-raster-metrics.mjs','shape-frame-math.mjs','calc-native-path-checks.mjs','calc-layout-evidence.mjs','edge-pdf-image-pair.mjs']){
    const key='tools/TikzVisual/'+file,bytes=await readFile(path.join(root,key));sources[key]=hash(bytes);await save('source-captures/'+key,bytes);
  }
  const nativeEvidence=readCalcLayoutEvidence(n,JSON.parse(c['native-points.json']));
  assert.deepEqual(nativeEvidence.measurements,native.report.measurements);
  assert.deepEqual(nativeEvidence.registration,native.report.registration);assert.deepEqual(nativeEvidence.rasterSizes,native.report.rasterSizes);
  await saveJson('decoded-native-layout.json',{schemaVersion:1,...nativeEvidence});
  const scene=JSON.parse(c['actual-scene.json']),layout=nativeEvidence.measurements['pdf-plain'];
  assert.equal(scene.pictureBounds.isEmpty,false);
  for(const key of ['svg-plain','svg-probed','pdf-probed'])assert.deepEqual(native.report.measurements[key].boundsSp,layout.boundsSp);
  assert.equal(native.report.artifacts['pdf-plain/case.pdf'],native.report.artifacts['pdf-probed/case.pdf']);
  const [minX,minY,maxX,maxY]=layout.boundsSp,[boxX,boxY,pageWidthSp,pageHeightSp]=layout.boxPageSp,[pictureX,pictureY]=layout.picturePositionSp;
  assert.equal(pictureY,boxY);assert.equal(layout.boxSp[2],0);assert.equal(maxY-minY,layout.boxSp[1]);
  assert.equal(layout.boxSp[0],pictureX-boxX+maxX-minX);
  const factor=96/(72.27*65536),originSp={x:pictureX-minX,y:pageHeightSp-pictureY+minY};
  const origin={x:originSp.x*factor,y:originSp.y*factor};
  assert.deepEqual(native.report.registration.originSp,originSp);assert.deepEqual(native.report.registration.originPixels,origin);
  const boundsChecks=[];
  for(const[name,expected,actual]of[
    ['minX',minX,scene.pictureBounds.minX/factor],['minY',minY,-scene.pictureBounds.maxY/factor],
    ['maxX',maxX,scene.pictureBounds.maxX/factor],['maxY',maxY,-scene.pictureBounds.minY/factor],
    ['width',maxX-minX,scene.pictureBounds.width/factor],['height',maxY-minY,scene.pictureBounds.height/factor]]){
    const measured=Math.round(actual);assert.equal(measured,expected,'Native picture '+name);
    boundsChecks.push({name,reference:expected,actual:measured,units:'TeX sp',limit:0,passed:true});
  }
  phase='native-page-and-regions';renderer=await createRenderer();
  await renderer.page.evaluate('globalThis.shapeRasterMetrics=('+createShapeRasterMetrics.toString()+')()');
  const reference=c['reference.svg'].toString(),actual=c['actual.svg'].toString();
  const raw=await renderer.page.evaluate(svg=>{
    const doc=new DOMParser().parseFromString(svg,'image/svg+xml');if(doc.querySelector('parsererror'))throw Error('Invalid native SVG');
    const group=doc.querySelector('#page1 > g'),match=/^translate\(([-\d.]+),([-\d.]+)\)scale\(([-\d.]+),([-\d.]+)\)$/.exec(group?.getAttribute('transform')??'');
    if(!match)throw Error('Unknown native origin');return{origin:{x:Number(match[1]),y:Number(match[2])},transform:group.getAttribute('transform'),paths:[...doc.querySelectorAll('path')].map(p=>p.getAttribute('d'))};
  },reference);
  const pathChecks=checkCalcNativePaths(raw.paths,scene);await saveJson('native-path-checks.json',pathChecks);
  const matrix=parseTransform(raw.transform),world=[matrix[0]*4/3,matrix[1]*4/3,matrix[2]*4/3,matrix[3]*4/3,(matrix[4]-raw.origin.x)*4/3,(matrix[5]-raw.origin.y)*4/3];
  const rectangle=(x,y,right,bottom)=>({x,y,width:right-x,height:bottom-y});
  const definitions=[{id:'whole-picture',rectangle:{x:-origin.x,y:-origin.y,width:pageWidthSp*factor,height:pageHeightSp*factor},
    scope:'Entire physical page, including ink outside the diagram.'},
    {id:'diagram',rectangle:rectangle(Math.floor(minX*factor)-8,Math.floor(-maxY*factor)-8,Math.ceil(maxX*factor)+8,Math.ceil(-minY*factor)+8)}];
  raw.paths.forEach((d,i)=>{const b=pathBounds(transformSegments(parsePath(d),world));
    const box=rectangle(Math.floor(b.minX)-4,Math.floor(b.minY)-4,Math.ceil(b.maxX)+4,Math.ceil(b.maxY)+4),p=scene.paths[i];
    const overlaps=q=>q.inkBounds.minX<=box.x+box.width&&q.inkBounds.maxX>=box.x&&q.inkBounds.minY<=box.y+box.height&&q.inkBounds.maxY>=box.y;
    definitions.push({id:'native-paint-'+i,rectangle:box,attribution:{
      intended:{confidence:'verified-native-path-sequence',semanticId:p.semanticId,svgElementId:p.svgElementId,source:p.source},
      spatialOverlap:scene.paths.filter(overlaps).map(q=>({semanticId:q.semanticId,svgElementId:q.svgElementId,source:q.source}))}});});
  const regions=definitions.map(r=>({...r,rasterRectangles:Object.fromEntries([1,4].map(scale=>{
    const x=Math.floor((origin.x+r.rectangle.x)*scale),y=Math.floor((origin.y+r.rectangle.y)*scale);
    const width=Math.ceil((origin.x+r.rectangle.x+r.rectangle.width)*scale)-x,height=Math.ceil((origin.y+r.rectangle.y+r.rectangle.height)*scale)-y;
    const page=native.report.rasterSizes[scale+'x'];assert.ok(x>=0&&y>=0&&width>0&&height>0&&x+width<=page.width&&y+height<=page.height);
    return[scale+'x',{x,y,width,height}];}))}));
  const camera={origin,rasterSizes:native.report.rasterSizes};
  await saveJson('registration.json',{schemaVersion:1,originSp,originPixels:origin,leadingTeXSp:pictureX-boxX,pictureBoundsSp:layout.boundsSp,
    pictureBoxSp:[maxX-minX,maxY-minY,0],outerBoxSp:layout.boxSp,boundsChecks,camera,regions,
    convention:'Saved picture-start baseline excludes outer leading TeX glue. Full-page expanded captures retain foreign ink.'});
  const records=[],baselines=new Map(),routePages=new Map();
  async function capture(key,pair){
    const images={},crops=[];
    for(const[name,b64]of Object.entries(pair.images)){const file='views/'+key+'/'+name+'.png';await save(file,Buffer.from(b64,'base64'));images[name]=file;}
    for(const crop of pair.crops){const links={};for(const[name,b64]of Object.entries(crop.images)){const file='views/'+key+'/crops/'+crop.id+'-'+name+'.png';await save(file,Buffer.from(b64,'base64'));links[name]=file;}
      crops.push({id:crop.id,images:links,presentation:crop.presentation});}
    const {images:unused,crops:unusedCrops,...metrics}=pair;void unused;void unusedCrops;
    const record={...metrics,images,crops};const file='views/'+key+'/record.json';await saveJson(file,record);return{file,...record};
  }
  phase='svg-and-pdf-captures';
  for(const route of ['original-svg','candidate-svg'])for(const frame of ['natural','expanded'])for(const scale of [1,4]){
    const pdf=n['pdf-plain/page-'+scale+'x.png'];assert.equal(hash(pdf),hash(n['pdf-probed/page-'+scale+'x.png']));
    const options={svg:route==='original-svg'?reference:actual,units:route==='original-svg'?'bp':'cssPixels',svgOriginBp:route==='original-svg'?raw.origin:{x:0,y:0},
      pdfPage:'data:image/png;base64,'+pdf.toString('base64'),camera,regions,frame,scale,cropLimit:4,rightLabel:route};
    const pair=await measureEdgePdfPair(renderer,options);assert.equal(pair.repeat.pdf.rawChangedPixels,0);assert.equal(pair.repeat.svg.rawChangedPixels,0);
    const key=route+'/'+frame+'/'+scale+'x';records.push({route,...await capture(key,pair)});
    routePages.set(key,pair.images['svg-page']);
    if(route==='candidate-svg')baselines.set(frame+'/'+scale,{options,page:pair.images['svg-page']});
  }
  const routeParity=[];
  for(const frame of ['natural','expanded'])for(const scale of [1,4]){
    const observed=await comparePages(routePages.get('original-svg/'+frame+'/'+scale+'x'),routePages.get('candidate-svg/'+frame+'/'+scale+'x'),scale);
    routeParity.push({frame,scale,referenceRoute:'original SVG on native PDF page',candidateRoute:'public SVG on native PDF page',observed});
  }
  await saveJson('route-parity.json',{schemaVersion:1,policyDerived:false,comparisons:routeParity});
  phase='image-only-controls';const controls=[];
  for(const defect of ['missing-mark','outside-diagram-ink']){
    const mutated=await renderer.page.evaluate(({svg,defect,origin})=>{
      const doc=new DOMParser().parseFromString(svg,'image/svg+xml'),root=doc.documentElement;
      if(defect==='missing-mark'){const p=doc.querySelector('#candidate-p2');if(!p)throw Error('No unique calculated mark');p.remove();}
      else{const p=doc.createElementNS(root.namespaceURI,'path');p.setAttribute('d','M'+(20-origin.x)+' '+(20-origin.y)+'h2v2h-2Z');p.setAttribute('fill','#000');root.append(p);}
      return new XMLSerializer().serializeToString(doc);
    },{svg:actual,defect,origin});await save('controls/'+defect+'.svg',Buffer.from(mutated));
    for(const frame of ['natural','expanded'])for(const scale of [1,4]){
      const baseline=baselines.get(frame+'/'+scale),pair=await measureEdgePdfPair(renderer,{...baseline.options,svg:mutated,cropLimit:0,rightLabel:defect});
      const observed=await comparePages(baseline.page,pair.images['svg-page'],scale);
      const expectedVisible=defect==='missing-mark'||frame==='expanded';assert.equal(observed.rawChangedPixels>0,expectedVisible);
      const key='control-'+defect+'/'+frame+'/'+scale+'x',record=await capture(key,pair);
      controls.push({defect,frame,scale,numericChecksBypassed:true,expectedVisible,observed,record:record.file});
    }
  }
  phase='evidence-finalization';
  const agent={schemaVersion:1,completionState:'complete',acceptance:'pending',registration:'registration.json',nativePathChecks:'native-path-checks.json',routeParity:'route-parity.json',
    source:'candidate/source.tikz',scene:'candidate/actual-scene.json',ordinaryPdf:'native/pdf-plain/case.pdf',
    selected:records.map(r=>({route:r.route,frame:r.frame,scale:r.scale,record:r.file,images:r.images,crops:r.crops})),controls,
    newCandidate:{executable:'dotnet',arguments:['run','--project','tools/TikzReference','-c','Release','--','export-calc-coordinates']},
    rerun:{executable:'node',arguments:['tools/TikzVisual/inspect-calc-pdf.mjs',...process.argv.slice(2)]},
    remaining:['independent image calibration','full defect matrix','independent decoded-image/replay checker','broader interactions','root integration']};
  await saveJson('agent-inspection.json',agent);
  await save('index.html',Buffer.from('<!doctype html><meta charset="utf-8"><title>Calc PDF research</title><style>body{font:16px sans-serif;margin:24px}img{max-width:100%;image-rendering:pixelated}</style><h1>Calc PDF research</h1><p>Ordinary native PDF and separately registered SVG routes. Admission pending.</p><p><a href="report.json">Report</a> · <a href="agent-inspection.json">Inspection JSON</a> · <a href="registration.json">Native placement and bounds</a></p>'+records.filter(r=>r.scale===1).map(r=>'<article><h2>'+r.route+' / '+r.frame+'</h2><a href="'+r.file+'">Measurements</a><img src="'+r.images.sheet+'">'+r.crops.map(c=>'<img src="'+c.images.sheet+'">').join('')+'</article>').join('')));
  for(const[file,digest]of Object.entries({...guardFiles,...sources}))assert.equal(hash(await readFile(path.join(root,file))),digest);
  for(const[file,digest]of Object.entries(artifacts))assert.equal(hash(await readFile(path.join(output,file))),digest);
  for(const b of [candidate,native])assert.equal(hash(await readFile(b.target)),inputs[b===candidate?'candidate':'native'].sha256);
  phase='complete';await publish({completed:true,renderer:renderer.identity,sourceHashes:sources,
    coverage:{routes:2,views:8,regionsPerView:26,regionalChecks:208,imageOnlyControls:8,routeParity:4},boundsChecks,nativePathChecks:pathChecks.checks.length,routeParity,
    records:records.map(r=>({route:r.route,frame:r.frame,scale:r.scale,file:r.file,whole:r.whole,fullPage:r.fullPage})),controls,agent:'agent-inspection.json',viewer:'index.html'});
}catch(error){await publish({completed:false,error:error.message.replaceAll(root,'<repo>').slice(0,2000)});process.exitCode=1;console.error(error.stack);}
finally{await renderer?.browser.close();}
