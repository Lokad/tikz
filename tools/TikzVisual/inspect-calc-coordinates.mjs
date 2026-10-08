// Fixed-fixture research captures. No image admission or borrowed allowances.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRenderer} from './compare.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {parsePath, parseTransform, transformSegments, pathBounds} from './shape-frame-math.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {measureArrowVectorPair} from './arrow-vector-pair.mjs';
import {checkCalcNativePaths} from './calc-native-path-checks.mjs';

assert.equal(process.argv.length, 3, 'Usage: node tools/TikzVisual/inspect-calc-coordinates.mjs <candidate-export/report.json>');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const output = path.join(root, 'artifacts/calc-inspection/run-' + randomUUID());
await mkdir(output, {recursive:true});
const artifacts = {}, sources = {};
async function save(file, bytes) {
  assert.match(file, /^[a-zA-Z0-9_./-]+$/);
  assert.ok(!file.split('/').includes('..') && !file.startsWith('/'));
  const target = path.join(output, file);
  await mkdir(path.dirname(target), {recursive:true});
  await writeFile(target, bytes); artifacts[file] = hash(bytes);
}
const saveJson = (file, value) => save(file, Buffer.from(JSON.stringify(value, null, 2) + '\n'));
let phase = 'candidate-export', renderer, inputHash;
const common = {schemaVersion:1, role:'calc-coordinate-rendering-research', converterInvoked:false,
  nativeToolInvoked:false, approvedImagePolicy:false, imageConformanceClaim:false, imageAdmission:'pending'};
async function publish(details) {
  const bytes = Buffer.from(JSON.stringify({...common, phase, inputHash, artifacts, ...details}, null, 2) + '\n');
  await writeFile(path.join(output, 'report.json'), bytes);
  console.log(JSON.stringify({completed:details.completed, report:path.relative(root, path.join(output, 'report.json')).split(path.sep).join('/'), sha256:hash(bytes)}));
}
await publish({completed:false});
try {
  const reportPath = path.resolve(root, process.argv[2]);
  assert.ok(reportPath.startsWith(path.join(root, 'artifacts') + path.sep));
  const reportBytes = await readFile(reportPath), report = JSON.parse(reportBytes);
  inputHash = hash(reportBytes);
  assert.equal(report.role, 'calc-coordinate-candidate-export');
  assert.equal(report.completed, true); assert.equal(report.phase, 'complete');
  assert.equal(report.details.publicTraceParity, true); assert.equal(report.details.numericPassed, true);
  assert.equal(report.details.quantities, 50);
  const loaded = {};
  for (const [file, digest] of Object.entries(report.artifacts)) {
    assert.match(file, /^[a-z-]+\.(json|svg|tikz)$/);
    const bytes = await readFile(path.join(path.dirname(reportPath), file));
    assert.equal(hash(bytes), digest); loaded[file] = bytes; await save('inputs/' + file, bytes);
  }
  await save('inputs/export-report.json', reportBytes);
  for (const file of ['source.tikz','reference.svg','actual.svg','native-points.json','numeric.json','actual-scene.json','candidate-source-hashes.json','candidate-provenance.json']) assert.ok(loaded[file], 'Missing ' + file);
  const guardFiles = JSON.parse(loaded['candidate-source-hashes.json']);
  assert.ok(Object.keys(guardFiles).length >= 60);
  for (const [file, digest] of Object.entries(guardFiles)) {
    assert.ok(file.startsWith('src/Lokad.TikZ/') || file.startsWith('tools/TikzReference/') || ['Directory.Build.props','global.json'].includes(file));
    assert.ok(!file.split('/').includes('..')); assert.equal(hash(await readFile(path.join(root,file))), digest);
  }
  for (const file of ['inspect-calc-coordinates.mjs','compare.mjs','browser-profile.json','text-profile.json','node-profile.json','package.json','package-lock.json',
    'calc-native-path-checks.mjs','shape-raster-metrics.mjs','shape-frame-math.mjs','edge-trial-images.mjs','edge-oracle-pair.mjs','arrow-vector-pair.mjs','shape-oracle-bundle.mjs']) {
    const key = 'tools/TikzVisual/' + file, bytes = await readFile(path.join(root,key));
    sources[key] = hash(bytes); await save('source-captures/' + key,bytes);
  }
  const reference = loaded['reference.svg'].toString(), actual = loaded['actual.svg'].toString();
  const native = JSON.parse(loaded['native-points.json']), scene = JSON.parse(loaded['actual-scene.json']);
  assert.equal(hash(loaded['source.tikz']),native.sourceSha256);
  assert.equal(hash(loaded['reference.svg']),native.observerSvgSha256);
  assert.equal(native.points.length,25);
  phase = 'native-frame';
  renderer = await createRenderer();
  await renderer.page.evaluate('globalThis.shapeRasterMetrics = (' + createShapeRasterMetrics.toString() + ')()');
  const rawFrame = await renderer.page.evaluate(svg => {
    const doc = new DOMParser().parseFromString(svg,'image/svg+xml');
    if (doc.querySelector('parsererror')) throw Error('Invalid native SVG');
    const root = doc.documentElement, group = doc.querySelector('#page1 > g');
    const match = /^translate\(([-\d.]+),([-\d.]+)\)scale\(([-\d.]+),([-\d.]+)\)$/.exec(group?.getAttribute('transform') ?? '');
    if (!match) throw Error('Unexpected native origin encoding');
    const paths = [...doc.querySelectorAll('path')];
    if (paths.length !== 24 || paths.some(p => p.getAttribute('fill') !== 'none' || p.getAttribute('transform'))) throw Error('Unexpected glyph-free native fixture');
    if (doc.querySelector('[clip-path], clipPath') || paths.some(p=>p.parentElement.getAttribute('stroke-width')!=='0.4'
      || p.parentElement.parentElement.getAttribute('stroke')!=='#000' || p.parentElement.parentElement.parentElement!==group))
      throw Error('Unexpected native paint inheritance');
    for(const element of doc.querySelectorAll('*'))for(const attribute of ['opacity','stroke-opacity','stroke-linecap','stroke-linejoin','stroke-dasharray','stroke-dashoffset'])
      if(element.hasAttribute(attribute))throw Error('Unexpected native stroke state');
    return {viewBox:root.getAttribute('viewBox').trim().split(/\s+/).map(Number), origin:{x:Number(match[1]),y:Number(match[2])},
      transform:group.getAttribute('transform'), paths:paths.map(p => p.getAttribute('d'))};
  },reference);
  const pathChecks=checkCalcNativePaths(rawFrame.paths,scene);
  await saveJson('native-path-checks.json',pathChecks);
  assert.ok(rawFrame.viewBox.length===4 && rawFrame.viewBox.every(Number.isFinite));
  const [vx,vy,vw,vh] = rawFrame.viewBox, origin = rawFrame.origin;
  const natural = {x:(vx-origin.x)*4/3,y:(vy-origin.y)*4/3,width:vw*4/3,height:vh*4/3};
  const camera = {x:Math.floor(natural.x)-8,y:Math.floor(natural.y)-8,
    width:Math.ceil(natural.x+natural.width)+8-(Math.floor(natural.x)-8),
    height:Math.ceil(natural.y+natural.height)+8-(Math.floor(natural.y)-8)};
  const matrix = parseTransform(rawFrame.transform);
  const world = [matrix[0]*4/3,matrix[1]*4/3,matrix[2]*4/3,matrix[3]*4/3,(matrix[4]-origin.x)*4/3,(matrix[5]-origin.y)*4/3];
  const overlap = (a,b) => a.minX<=b.maxX && a.maxX>=b.minX && a.minY<=b.maxY && a.maxY>=b.minY;
  const regions = rawFrame.paths.map((d,i) => {
    const bounds = pathBounds(transformSegments(parsePath(d),world));
    const x=Math.max(0,Math.floor(bounds.minX-camera.x)-4), y=Math.max(0,Math.floor(bounds.minY-camera.y)-4);
    const right=Math.min(camera.width,Math.ceil(bounds.maxX-camera.x)+4), bottom=Math.min(camera.height,Math.ceil(bounds.maxY-camera.y)+4);
    assert.ok(right>x&&bottom>y);
    const physical = {minX:camera.x+x,minY:camera.y+y,maxX:camera.x+right,maxY:camera.y+bottom};
    return {id:'native-paint-'+i,rectangle:{x,y,width:right-x,height:bottom-y},bounds,
      attribution:{confidence:'spatial-overlap', candidates:scene.paths.filter(p=>overlap(physical,p.inkBounds)).map(p=>({semanticId:p.semanticId,svgElementId:p.svgElementId,source:p.source}))}};
  });
  await saveJson('native-frame.json',{schemaVersion:1,source:'original dvisvgm SVG; origin is its PGF transform translation',
    referenceSha256:hash(loaded['reference.svg']),rawFrame,natural,camera,regions,coordinateUnits:'CSS px, y down; no candidate-derived frame'});
  phase = 'primary-captures';
  const records = [];
  for (const [capture,measure] of [['intrinsic-image',measureEdgeTrialPrimary],['explicit-viewport',measureArrowVectorPair]])
    for (const frame of ['natural','expanded']) for (const scale of [1,4]) for (const background of ['transparent','white','black']) {
      const key = capture+'/'+frame+'/'+scale+'x-'+background;
      const pair = await measure(renderer,{reference,actual,leftIsDriver:true,origin,camera,frame,scale,background,regions,
        cropLimit:4,referenceLabel:'Original TikZ SVG',rightLabel:'Public calc candidate'});
      assert.equal(pair.repeat.rawChangedPixels,0); assert.equal(pair.actualRepeat.rawChangedPixels,0);
      if (background==='white' && !pair.images.comparison) pair.images.comparison=await renderer.page.evaluate(async images=>{
        const parts=[];for(const name of ['reference','actual','amplified']){const im=new Image();im.src='data:image/png;base64,'+images[name];await im.decode();parts.push(im);}
        const w=parts[0].width,h=parts[0].height,c=document.createElement('canvas');c.width=w*3;c.height=h+48;
        const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='16px sans-serif';
        ['Original TikZ SVG','Public calc candidate','Raw difference amplified ×16'].forEach((label,i)=>{ctx.fillText(label,i*w+8,24);ctx.drawImage(parts[i],i*w,48);});
        return c.toDataURL('image/png').split(',')[1];
      },pair.images);
      const images = {};
      for(const [name,b64] of Object.entries(pair.images)) { const file='views/'+key+'/'+name+'.png'; await save(file,Buffer.from(b64,'base64'));images[name]=file; }
      const crops = [];
      for(const crop of pair.crops) {
        const links = {};
        for(const [name,b64] of Object.entries({...crop.paired,sheet:crop.sheet})) { const file='views/'+key+'/crops/'+crop.id+'-'+name+'.png';await save(file,Buffer.from(b64,'base64'));links[name]=file; }
        crops.push({id:crop.id,images:links,presentation:crop.presentation});
      }
      const record={capture,frame,scale,background,metrics:pair.metrics,regions:pair.regions,repeat:pair.repeat,actualRepeat:pair.actualRepeat,
        naturalFrames:pair.naturalFrames,images,crops,vectorCapture:pair.vectorCapture??null};
      const file='views/'+key+'/record.json'; await saveJson(file,record);records.push({file,...record});
    }
  assert.equal(records.length,24);assert.ok(records.every(r=>r.regions.length===24));
  phase='native-only-encodings';
  const oracleEncodings=[];
  for(const encoding of ['driver-scale-local-origin','exact-physical-scale-local-origin']) {
    const equivalent=await renderer.page.evaluate(({svg,natural,encoding})=>{
      const doc=new DOMParser().parseFromString(svg,'image/svg+xml'),root=doc.documentElement,group=doc.querySelector('#page1 > g');
      const match=/scale\(([-\d.]+),([-\d.]+)\)$/.exec(group.getAttribute('transform'));
      if(!match)throw Error('Unknown native transform');
      const x=encoding==='driver-scale-local-origin'?Number(match[1])*4/3:96/72.27;
      const y=encoding==='driver-scale-local-origin'?Number(match[2])*4/3:-96/72.27;
      group.setAttribute('transform','scale('+x+' '+y+')');
      root.setAttribute('width',natural.width+'px');root.setAttribute('height',natural.height+'px');
      root.setAttribute('viewBox',[natural.x,natural.y,natural.width,natural.height].join(' '));
      return new XMLSerializer().serializeToString(doc);
    },{svg:reference,natural,encoding});
    await save('oracle-encodings/'+encoding+'.svg',Buffer.from(equivalent));
    for(const frame of ['natural','expanded'])for(const scale of [1,4])for(const background of ['transparent','white','black']){
      const pair=await measureArrowVectorPair(renderer,{reference,actual:equivalent,leftIsDriver:true,origin,camera,frame,scale,background,regions,
        cropLimit:0,referenceLabel:'Original TikZ SVG',rightLabel:'Native-only '+encoding});
      const images={},key=encoding+'/'+frame+'/'+scale+'x-'+background;
      for(const[name,b64]of Object.entries(pair.images)){const file='oracle-encodings/'+key+'/'+name+'.png';await save(file,Buffer.from(b64,'base64'));images[name]=file;}
      const record={encoding,frame,scale,background,converterInvoked:false,policyDerived:false,metrics:pair.metrics,regions:pair.regions,repeat:pair.repeat,actualRepeat:pair.actualRepeat,images};
      assert.equal(pair.repeat.rawChangedPixels,0);assert.equal(pair.actualRepeat.rawChangedPixels,0);
      const file='oracle-encodings/'+key+'/record.json';await saveJson(file,record);oracleEncodings.push({file,encoding,frame,scale,background,metrics:pair.metrics});
    }
  }
  phase='image-only-controls';
  const controls=[];
  for(const defect of ['missing-mark','quarter-pixel-shift']) {
    const mutated=await renderer.page.evaluate(({svg,defect})=>{
      const doc=new DOMParser().parseFromString(svg,'image/svg+xml'),root=doc.documentElement;
      if(defect==='missing-mark') {const p=doc.querySelector('#candidate-p2');if(!p)throw Error('No calculated mark');p.remove();}
      else {const g=doc.createElementNS(root.namespaceURI,'g');g.setAttribute('transform','translate(0.25 0)');while(root.firstChild)g.append(root.firstChild);root.append(g);}
      return new XMLSerializer().serializeToString(doc);
    },{svg:actual,defect});
    await save('controls/'+defect+'.svg',Buffer.from(mutated));
    for(const scale of [1,4]) {
      const pair=await measureArrowVectorPair(renderer,{reference:actual,actual:mutated,leftIsDriver:false,origin:{x:0,y:0},camera,frame:'expanded',scale,background:'white',regions,
        cropLimit:2,cropRegionIds:['native-paint-2'],referenceLabel:'Unchanged public SVG',rightLabel:defect});
      assert.ok(pair.metrics.rawChangedPixels>0,'Invisible control '+defect);
      if(defect==='missing-mark') assert.ok(pair.regions.find(r=>r.id==='native-paint-2').rawChangedPixels>0);
      const images={};for(const[name,b64]of Object.entries(pair.images)){const file='controls/'+defect+'/'+scale+'x-'+name+'.png';await save(file,Buffer.from(b64,'base64'));images[name]=file;}
      const control={defect,scale,numericChecksBypassed:true,observedPixelDifference:true,metrics:pair.metrics,regions:pair.regions,images};
      await saveJson('controls/'+defect+'/'+scale+'x-record.json',control);controls.push(control);
    }
  }
  phase='evidence-finalization';
  const selected=records.filter(r=>r.background==='white');
  const firstDifference=records.filter(r=>r.background==='white'&&!r.metrics.exactRgbaMatch).sort((a,b)=>b.metrics.rawChangedPixels-a.metrics.rawChangedPixels)[0];
  const agent={schemaVersion:1,completionState:'complete',acceptance:'pending',referenceRoute:'original-svg',numeric:'inputs/numeric.json',
    nativeFrame:'native-frame.json',nativePathChecks:'native-path-checks.json',source:'inputs/source.tikz',scene:'inputs/actual-scene.json',
    firstObservedDifference:firstDifference?{record:firstDifference.file,metrics:firstDifference.metrics,crops:firstDifference.crops}:null,
    selected:selected.map(r=>({view:r.capture+'/'+r.frame+'/'+r.scale+'x',record:r.file,contactSheet:r.images.comparison,images:r.images,crops:r.crops})),
    rerun:{executable:'node',arguments:['tools/TikzVisual/inspect-calc-coordinates.mjs',process.argv[2]]},
    newCandidate:{executable:'dotnet',arguments:['run','--project','tools/TikzReference','-c','Release','--','export-calc-coordinates'],
      next:'Invoke the inspector with the new export report path; old exports reject changed candidate sources.'},
    followUpCommands:[{executable:'dotnet',arguments:['test','Lokad.TikZ.slnx']}],
    remaining:['ordinary PDF route','independent calibration','full defect matrix','independent saved-evidence verification','broader calc interactions']};
  await saveJson('agent-inspection.json',agent);
  await save('index.html',Buffer.from('<!doctype html><meta charset="utf-8"><title>Calc rendering research</title><style>body{font:16px sans-serif;margin:24px}img{max-width:100%;image-rendering:pixelated}</style><h1>Calc rendering research</h1><p>Original TikZ SVG and public candidate. Image admission pending.</p><p><a href="report.json">Report</a> · <a href="agent-inspection.json">Inspection JSON</a> · <a href="native-frame.json">Native frame and source regions</a></p>'+selected.map(r=>'<article><h2>'+r.capture+' / '+r.frame+' / '+r.scale+'x</h2><a href="'+r.file+'">Metrics and source attribution</a><img src="'+r.images.comparison+'">'+r.crops.map(c=>'<img src="'+c.images.sheet+'">').join('')+'</article>').join('')));
  for(const[file,digest]of Object.entries(guardFiles))assert.equal(hash(await readFile(path.join(root,file))),digest);
  for(const[file,digest]of Object.entries(sources))assert.equal(hash(await readFile(path.join(root,file))),digest);
  for(const[file,digest]of Object.entries(artifacts))assert.equal(hash(await readFile(path.join(output,file))),digest);
  assert.equal(hash(await readFile(reportPath)),inputHash);
  phase='complete';
  await publish({completed:true,renderer:renderer.identity,sourceHashes:sources,coverage:{views:24,regionsPerView:24,regionChecks:576,oracleOnlyViews:24,controls:4},
    observations:{numericAnchors:25,nativePathChecks:pathChecks.checks.length,nativePathsAgree:true,exactPrimaryViews:records.filter(r=>r.metrics.exactRgbaMatch).length,
      maximumChangedPixels:Math.max(...records.map(r=>r.metrics.rawChangedPixels)),allUnchangedCapturesExact:true},
    records:records.map(r=>({file:r.file,metrics:r.metrics})),oracleEncodings,controls,agent:'agent-inspection.json',viewer:'index.html'});
}catch(error){
  await publish({completed:false,error:error.message.replaceAll(root,'<repo>').slice(0,2000)});process.exitCode=1;console.error(error.stack);
}finally{await renderer?.browser.close();}
