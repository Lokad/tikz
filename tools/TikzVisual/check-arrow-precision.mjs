import {requireRenderer} from './shape-primary-trial-policy.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadArrowEvidence} from './arrow-evidence.mjs';
import {buildArrowNativeFrame} from './arrow-native-frame.mjs';
import {arrowPrecisionSources,arrowPrecisionInputs,validateArrowPrecisionReport} from './arrow-precision-contract.mjs';
import {arrowMetrics,arrowCanonical} from './arrow-native-contract.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {checkArrowNativePanels} from './arrow-native-panels.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';
import {arrowIntrinsicRasterSize,arrowVectorDocument,runArrowViewportControls} from './arrow-vector-pair.mjs';

const out=await outputPath(path.join(root,'artifacts/arrow-precision-checks/run-'+randomUUID()));await mkdir(out,{recursive:true});
let phase='arguments',renderer,inputReportSha256,measurements=0,panels=0;const controls=[];
async function publish(r){const b=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(out,'report.json',b);
 console.log(JSON.stringify({kind:'arrow-precision-check',completed:r.completed,phase:r.phase,report:path.relative(root,path.join(out,'report.json')).split(path.sep).join('/'),sha256:sha256(b)}));}
try{
 assert.equal(process.argv.length,3);assert.match(process.argv[2],/^artifacts\/arrow-precision-inspection\/run-[a-f0-9-]+\/report.json$/);
 const input=path.dirname(path.join(root,process.argv[2]));await outputPath(input);assert.ok((await stat(path.join(input,'report.json'))).size<=10000000);
 const bytes=await readFile(path.join(input,'report.json')),r=JSON.parse(bytes);inputReportSha256=sha256(bytes);
 const read=async file=>{assert.match(file,/^[a-zA-Z0-9_./-]+$/);assert.ok(!file.startsWith('/')&&!file.split('/').some(p=>['','..','.'].includes(p)));const full=await outputPath(input,file);
  assert.ok((await stat(full)).size<=10000000);return readFile(full);};
 await publish({completed:false,phase,inputReportSha256});
 const e=await loadArrowEvidence(),sources=await arrowPrecisionSources();for(const file of Object.keys(e.snapshot.sourceHashes))if(!sources.has(file)){const b=arrowCanonical(await readFile(path.join(root,file)));sources.set(file,{bytes:b,sha256:sha256(b)});}
 assert.deepEqual(Object.keys(r.sourceHashes),[...sources.keys()].sort((a,b)=>a.localeCompare(b)));
 for(const[file,v]of sources){assert.equal(r.sourceHashes[file],v.sha256);assert.equal(sha256(await read('source-captures/'+file)),v.sha256);}
 const integrity=async()=>{assert.equal(sha256(await readFile(path.join(input,'report.json'))),inputReportSha256);for(const[file,h]of Object.entries(r.artifacts))assert.equal(sha256(await read(file)),h);
  for(const[file,v]of sources)assert.equal(sha256(arrowCanonical(await readFile(path.join(root,file)))),v.sha256);};await integrity();
 const frames=e.cases.map(c=>buildArrowNativeFrame(c.id,e.artifacts.get(c.id+'/plain-reference.svg').toString(),c.metrics));
 const validate=()=>assert.deepEqual(validateArrowPrecisionReport(r,e,frames),r.coverage);validate();
 for(const f of frames)assert.deepEqual(JSON.parse(await read(f.caseId+'/frame.json')),f);
 renderer=await createRenderer();requireRenderer(renderer.identity, r.renderer);await installShapeMetrics(renderer);
 assert.deepEqual(JSON.parse(await read('controls.json')),await runArrowViewportControls(renderer));
 phase='saved-measurements';const expanded=new Map();
 for(const o of r.observations){const v=o.view,c=e.cases.find(c=>c.id===v.caseId),f=frames.find(f=>f.caseId===v.caseId),original=e.artifacts.get(c.id+'/plain-reference.svg').toString();
  const inputs=arrowPrecisionInputs(v,c,f,original),numbers=JSON.parse(await read(o.numbers));assert.equal((await read(o.reference)).toString(),inputs.reference);assert.equal((await read(o.actual)).toString(),inputs.actual);
  assert.deepEqual(numbers.view,v);assert.deepEqual(numbers.pen,inputs.pen??null);assert.equal(numbers.converterInvoked,false);assert.equal(numbers.approvedImagePolicy,false);assert.equal(numbers.imageConformanceClaim,false);
  assert.equal(numbers.repeat.rawChangedPixels,0);assert.equal(numbers.actualRepeat.rawChangedPixels,0);
  const regions=[{id:'whole-picture',rectangle:{x:0,y:0,width:f.camera.width,height:f.camera.height}},...f.regions];
  assert.deepEqual(numbers.regions.map(r=>({id:r.id,rectangle:r.rectangle})),regions.map(r=>({id:r.id,rectangle:r.rectangle})));
  assert.deepEqual(numbers.intrinsic,{reference:await arrowIntrinsicRasterSize(renderer,inputs.reference),actual:await arrowIntrinsicRasterSize(renderer,inputs.actual)});
  const ref=await arrowVectorDocument(renderer,{svg:inputs.reference,driver:inputs.leftIsDriver,origin:inputs.origin,camera:f.camera,frame:v.frame});
  const actual=await arrowVectorDocument(renderer,{svg:inputs.actual,driver:false,origin:{x:0,y:0},camera:f.camera,frame:v.frame});
  assert.deepEqual(numbers.naturalFrames,{reference:ref.natural,actual:actual.natural});
  if(v.route==='explicit-viewport')assert.deepEqual(numbers.vectorCapture,{schemaVersion:1,rasterSize:{width:f.camera.width*v.scale,height:f.camera.height*v.scale},frame:v.frame,scale:v.scale,
   reference:{sourceViewBox:ref.sourceViewBox,sourceElementCount:ref.sourceElementCount,viewportContract:ref.viewportContract},actual:{sourceViewBox:actual.sourceViewBox,sourceElementCount:actual.sourceElementCount,viewportContract:actual.viewportContract},
   contract:'Original content maps directly to the fixed camera at the requested density; declared natural root clipping is explicit. Original intrinsic-image observations remain required separately.'});
  else assert.equal(numbers.vectorCapture,undefined);
  const size={width:f.camera.width*v.scale,height:f.camera.height*v.scale},rectangles=[undefined,...regions.map(r=>Object.fromEntries(Object.entries(r.rectangle).map(([k,n])=>[k,n*v.scale])))];
  const decoded=await decodeEdgeOraclePngPair(renderer,await Promise.all([read(o.images.reference),read(o.images.actual)]),size,rectangles,v.scale,v.background);
  assert.deepEqual(decoded.metrics[0],o.metrics);assert.deepEqual(decoded.metrics[0],numbers.metrics);for(const[i,region]of numbers.regions.entries())assert.deepEqual(decoded.metrics[i+1],arrowMetrics(region));measurements+=decoded.metrics.length;
  const panelImages={...o.images};if(v.kind==='pen')delete panelImages.comparison;
  panels+=await checkArrowNativePanels(renderer,{frame:v.frame,scale:v.scale,background:v.background,variant:v.route,images:panelImages,crops:[]},read,f);
  if(v.kind==='pen'&&o.images.comparison){
   const pngs=await Promise.all(['reference','actual','amplified','comparison'].map(async key=>'data:image/png;base64,'+(await read(o.images[key])).toString('base64')));
   await renderer.page.evaluate(async({pngs,label})=>{const images=[];for(const src of pngs){const i=new Image();i.src=src;await i.decode();images.push(i);}
    const width=images[0].width,height=images[0].height,c=document.createElement('canvas');c.width=3*width;c.height=height+48;const ctx=c.getContext('2d');
    ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='12px sans-serif';
    ['Native pen',label,'Raw difference\nAmplified ×16'].forEach((text,i)=>{text.split('\n').forEach((line,j)=>ctx.fillText(line,i*width+4,16+j*16));ctx.drawImage(images[i],i*width,48);});
    const actual=document.createElement('canvas');actual.width=c.width;actual.height=c.height;if(images[3].width!==c.width||images[3].height!==c.height)throw Error('Pen contact-sheet dimensions changed.');
    const ac=actual.getContext('2d');ac.drawImage(images[3],0,0);const a=ac.getImageData(0,0,c.width,c.height).data,b=ctx.getImageData(0,0,c.width,c.height).data;
    for(let i=0;i<a.length;i++)if(a[i]!==b[i])throw Error('Pen contact sheet or reference label changed.');
   },{pngs,label:v.route});panels++;
  }
  if(v.frame==='expanded'&&v.kind!=='pen'){
   const key=[v.caseId,v.kind,v.mask,v.scale,v.background].join('/'),hashes=[r.artifacts[o.images.reference],r.artifacts[o.images.actual]];
   if(v.route==='intrinsic-image')expanded.set(key,hashes);else assert.deepEqual(hashes,expanded.get(key),'Explicit expanded route changed original raster samples.');
  }
  if(v.background==='black'&&v.scale===4&&v.frame==='expanded')console.log('Saved precision checked: '+v.id);
 }
 phase='corruption-controls';
 const changed=(name,obj,key,value)=>{const old=obj[key],had=Object.hasOwn(obj,key);try{if(value===undefined)delete obj[key];else obj[key]=value;assert.throws(validate);controls.push({name,passed:true});}finally{if(had)obj[key]=old;else delete obj[key];}};
 for(const k of['completed','converterInvoked','approvedImagePolicy','imageConformanceClaim'])changed(k,r,k,!r[k]);
 changed('missing view',r,'observations',r.observations.slice(0,-1));changed('duplicated view',r,'observations',[r.observations[0],...r.observations.slice(0,-1)]);
 changed('changed route',r.observations[0].view,'route','other');changed('changed camera',r.frames[0].camera,'width',r.frames[0].camera.width+1);
 changed('missing image hash',r.artifacts,r.observations[0].images.reference,undefined);changed('added unbound artifact',r.artifacts,'extra.png','0'.repeat(64));
 changed('false count',r.coverage,'observations',389);changed('viewer traversal',r.agent,'viewer','../index.html');changed('unapproved admission',r.agent,'pendingGates',[]);
 validate();phase='final-integrity';await integrity();await loadArrowEvidence();
 await publish({schemaVersion:1,completed:true,phase:'complete',comparisonKind:'independent-native-arrow-precision-check',converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
  inputReport:process.argv[2],inputReportSha256,snapshotSha256:e.snapshotSha256,renderer:renderer.identity,measurements,panels,controls,coverage:r.coverage,sourceHashes:r.sourceHashes});
}catch(error){process.exitCode=2;await publish({schemaVersion:1,completed:false,phase,error:error.message.replaceAll(root,'<repo>'),converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,inputReportSha256,measurements,panels,controls});console.error(error.stack);}
finally{await renderer?.browser.close();}
