// Fixed trusted fixture, existing process/paint/capture helpers, native evidence only.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {captureProcess} from './qualification-process.mjs';
import {edgeSanitize} from './edge-log.mjs';
import {edgeSvgPaints,edgePdfPaints} from './edge-driver-state.mjs';
import {arrowSvgVectors} from './arrow-driver-state.mjs';
import {svgDefaultArrowFillWorkaround,svgDefaultArrowFillWorkaroundKind} from './svg-arrow-color-workaround.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';
import {measureEdgeOraclePair} from './edge-oracle-pair.mjs';
assert.equal(process.argv.length,2);
const fixture='tests/Fixtures/Diagrams/arrow-color-contract.tikz',source=await readFile(path.join(root,fixture));
assert.equal(sha256(source),'48afc2076c84177c9b62aa7d583db5dfad0bf829c5f6b7746d0b32f5796b5bff');
const output=path.join(root,'artifacts/arrow-color-driver-controls/run-'+randomUUID()),artifacts={},commands=[];
const save=(f,b)=>writeArtifact(output,f,b,artifacts);
await save('fixture.tikz',source);await save('probe-driver.mjs',await readFile(new URL(import.meta.url)));
async function run(executable,args,cwd,tag){const r=await captureProcess(executable,args,{cwd,timeout:120000});await save('commands/'+tag+'.log',edgeSanitize(r.output));commands.push({tag,executable,args,exitCode:r.exitCode,failure:r.failure});assert.equal(r.failure,null);assert.equal(r.exitCode,0,tag+' '+r.output.slice(-800));return r.output;}
// Preserve the installed source identities already observed by the original failed capture.
const nativeInputs={
 'pgfcorearrows.code.tex':'ffabc47530ac7058f6dff74bf3325ab114049dcedc51b2d8556f578b03311799',
 'pgfcoregraphicstate.code.tex':'81862c3425e8aa2a82e605eb8fde07b1b7b47862b981922393d4f54ca9fa6250',
 'pgfsys-common-svg.def':'1a25e1bb28e23389db3010bed982a8403504cf8e6a4a0dbb105912e20433d13f',
 'pgfsys-dvisvgm.def':'5d5ce36eb9534e7c79bd99fdfd71891537d476abb332a0625f0d694f5dbf8bd2'};
for(const name of ['pgfcorearrows.code.tex','pgfcoregraphicstate.code.tex','pgfsys-common-svg.def','pgfsys-dvisvgm.def']){
 const location=(await run('kpsewhich',[name],root,'locate-'+name)).trim();const b=await readFile(location);assert.equal(sha256(b),nativeInputs[name]);await save('installed-sources/'+name,b);
}
for(const executable of ['latex','pdflatex','dvisvgm','pdftoppm'])await run(executable,[executable==='pdftoppm'?'-v':'--version'],root,'identity-'+executable);
const trace=String.raw`\global\advance\colorProbe by1
\ifx\pgf@strokecolor@global\pgf@fillcolor@global
  \typeout{ARROWCOLOR:\the\colorProbe:EQUAL}
\else\typeout{ARROWCOLOR:\the\colorProbe:DIFFERENT}\fi`;
const results=[];let renderer;
try{
 for(const backend of ['svg','pdf'])for(const corrected of [false,true])for(const probed of [false,true]){
  const id=backend+'-'+(corrected?'corrected':'original')+'-'+(probed?'probed':'plain'),dir=path.join(output,id);await mkdir(dir,{recursive:true});
  const hook=(corrected?svgDefaultArrowFillWorkaround:'')+(probed?String.raw`\makeatletter%
\newcount\colorProbe%
\let\originalArrowColorSetup\pgf@arrows@color@setup%
\def\pgf@arrows@color@setup{${trace}%
  \originalArrowColorSetup}%
\makeatother%
`:'');
  const tex=String.raw`\documentclass{article}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
${backend==='svg'?String.raw`\def\pgfsysdriver{pgfsys-dvisvgm.def}`:''}
\usepackage{tikz}
\pagestyle{empty}
${hook}
\begin{document}
${source.toString()}
\end{document}
`;
  await save(id+'/drawing.tex',tex);
  await run(backend==='svg'?'latex':'pdflatex',['-interaction=nonstopmode','-halt-on-error','-no-shell-escape','-recorder','drawing.tex'],dir,id+'-compile');
  const log=await readFile(path.join(dir,'drawing.log'));await save(id+'/drawing.log',log);
  await save(id+'/drawing.fls',edgeSanitize((await readFile(path.join(dir,'drawing.fls'))).toString()));
  const cache=[...log.toString().matchAll(/ARROWCOLOR:(\d+):(EQUAL|DIFFERENT)/g)].map(m=>({tip:Number(m[1]),cache:m[2]}));
  let bytes,paints,pixels;
  if(backend==='svg'){
   await run('dvisvgm',['--no-fonts','--exact','--bbox=min','--output=drawing.svg','drawing.dvi'],dir,id+'-outline');
   bytes=await readFile(path.join(dir,'drawing.svg'));await save(id+'/drawing.svg',bytes);paints=edgeSvgPaints(bytes).paints;
  }else{
   bytes=await readFile(path.join(dir,'drawing.pdf'));await save(id+'/drawing.pdf',bytes);paints=edgePdfPaints(bytes).paints;
   await run('pdftoppm',['-png','-singlefile','-r','384','drawing.pdf','page'],dir,id+'-pixels');pixels=await readFile(path.join(dir,'page.png'));await save(id+'/page.png',pixels);
  }
  assert.equal(paints.length,8);const tips=[1,3,5,7].map(index=>({index,fill:paints[index].fill,stroke:paints[index].stroke}));
  results.push({id,backend,corrected,probed,sha256:sha256(bytes),pixelsSha256:pixels?sha256(pixels):null,tips,cache});
 }
 const find=(b,c,p)=>results.find(r=>r.backend===b&&r.corrected===c&&r.probed===p);
 for(const b of ['svg','pdf'])for(const c of [false,true]){
  const a=find(b,c,false),p=find(b,c,true);assert.deepEqual(a.tips,p.tips);if(b==='svg')assert.equal(a.sha256,p.sha256);else assert.equal(a.pixelsSha256,p.pixelsSha256);
 }
 const rgb=t=>t.fill.map(v=>Math.round(v*255));
 assert.deepEqual(find('svg',false,false).tips.map(rgb),[[0,128,128],[0,0,0],[0,128,128],[0,128,128]]);
 for(const r of results.filter(r=>r.backend==='pdf'||r.corrected))assert.deepEqual(r.tips.map(rgb),Array.from({length:4},()=>[0,128,128]));
 assert.deepEqual(find('pdf',false,false).tips,find('pdf',true,false).tips);
 assert.equal(find('pdf',false,false).pixelsSha256,find('pdf',true,false).pixelsSha256);
 const before=await readFile(path.join(output,'svg-original-plain/drawing.svg')),after=await readFile(path.join(output,'svg-corrected-plain/drawing.svg'));
 const originalPaints=edgeSvgPaints(before),correctedPaints=edgeSvgPaints(after),expected=structuredClone(originalPaints);expected.paints[3].fill=correctedPaints.paints[3].fill;assert.deepEqual(correctedPaints,expected);
 assert.deepEqual(arrowSvgVectors(before,{allowText:true}),arrowSvgVectors(after,{allowText:true}));
 assert.deepEqual(find('svg',false,true).cache.map(c=>c.cache),['DIFFERENT','EQUAL','DIFFERENT','EQUAL']);
 assert.deepEqual(find('pdf',false,true).cache.map(c=>c.cache),['DIFFERENT','DIFFERENT','DIFFERENT','EQUAL']);
 const controls=['original-svg-matching-label-cache-defect','original-pdf-default-fill','svg-probe-byte-noninterference','pdf-probe-pixel-noninterference','corrected-svg-default-fill','unchanged-pdf-pixels','unchanged-svg-geometry-other-paint','independent-native-cache-traces'].map(name=>({name,passed:true}));
 renderer=await createRenderer();await installShapeMetrics(renderer);
 for(const corrected of [false,true]){
  const id=find('svg',corrected,false).id,svg=(await readFile(path.join(output,id,'drawing.svg'))).toString(),v=/viewBox='([^']+)'/.exec(svg)[1].split(' ').map(Number);
  const camera={x:v[0],y:v[1],width:Math.ceil(v[2]*4/3),height:Math.ceil(v[3]*4/3)};
  const capture=await measureEdgeOraclePair(renderer,{reference:svg,actual:svg,leftIsDriver:false,origin:{x:0,y:0},camera,frame:'natural',scale:4,background:'white',regions:[{id:'whole',rectangle:{x:0,y:0,width:camera.width,height:camera.height}}],cropLimit:0});
  assert.equal(capture.metrics.rawChangedPixels,0);await save(id+'/native-4x-white.png',Buffer.from(capture.images.reference,'base64'));
 }
 const report=Buffer.from(JSON.stringify({schemaVersion:1,role:'native-arrow-color-driver-controls',completed:true,phase:'complete',converterInvoked:false,nativeToolInvoked:true,approvedImagePolicy:false,imageConformanceClaim:false,
  fixture,sourceSha256:sha256(source),workaround:{kind:svgDefaultArrowFillWorkaroundKind,tex:svgDefaultArrowFillWorkaround},controls,commands,results,renderer:renderer.identity,artifacts},null,2)+'\n');await writeArtifact(output,'report.json',report);
 console.log(JSON.stringify({completed:true,report:path.relative(root,path.join(output,'report.json')).replaceAll('\\','/'),sha256:sha256(report),controls:controls.length}));
}catch(e){await save('failure.log',String(e.stack??e));const r=Buffer.from(JSON.stringify({schemaVersion:1,role:'native-arrow-color-driver-controls',completed:false,phase:'failed',error:e.message,converterInvoked:false,nativeToolInvoked:true,approvedImagePolicy:false,imageConformanceClaim:false,commands,results,artifacts},null,2)+'\n');await writeArtifact(output,'report.json',r);console.error(JSON.stringify({completed:false,report:path.relative(root,path.join(output,'report.json')).replaceAll('\\','/'),sha256:sha256(r),error:e.message}));process.exitCode=1;
}finally{await renderer?.browser.close();}
