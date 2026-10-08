// Independent trusted-fixture native measurements; no converter invocation.
import assert from 'node:assert/strict';
import {readFile,mkdir,copyFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {captureProcess} from './qualification-process.mjs';
import {edgeAnchors,edgeWrapper,edgeHooks,edgeCanonical,edgeSanitize,edgePdfPage} from './edge-log.mjs';
import {canonicalEdgeSvg} from './edge-replay.mjs';
import {parsePathLabelNative,pathLabelPhysicalCalls,pathLabelDriverState} from './path-label-native.mjs';

assert.ok(process.argv.length===2||process.argv.length===3,'Usage: node tools/TikzVisual/path-label-reference.mjs [placement|interactions]');
const cases={
 placement:['straight','quarter','reverse','inverted','bend','absolute','from','target','border','reset','full','zero','one'],
 interactions:['seed','first','second','reuse','clipped','continued','nested','escaped']
};
const id=process.argv[2]??'placement';assert.ok(Object.hasOwn(cases,id),'Only fixed trusted repository fixtures are accepted.');
const source='tests/Fixtures/PathLabels/'+id+'.tikz',ids=cases[id];
const definition={id,nodes:ids.map(id=>({id,shape:'rectangle'})),coordinates:[]};
const output=path.join(root,'artifacts/path-label-reference/run-'+randomUUID()),artifacts={},commands=[];
const save=(p,b)=>writeArtifact(output,p,b,artifacts),json=(p,v)=>save(p,JSON.stringify(v,null,2)+'\n');
let phase='inputs';
async function publish(completed,details={}){
 const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'path-label-native-reference',completed,phase:completed?'complete':phase,
  converterInvoked:false,nativeToolInvoked:true,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',artifacts,commands,...details},null,2)+'\n');
 await writeArtifact(output,'report.json',bytes);console.log(JSON.stringify({completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));
}
async function execute(executable,args,cwd,tag){
 const result=await captureProcess(executable,args,{cwd});await save('commands/'+tag+'.log',edgeSanitize(result.output));
 commands.push({tag,executable:path.basename(executable),args,exitCode:result.exitCode,failure:result.failure});
 assert.equal(result.failure,null,tag+' '+result.failure);assert.equal(result.exitCode,0,tag+' '+edgeSanitize(result.output).slice(-1200));return result.output;
}
async function identify(name,expected){
 const directories=(process.env.PATH??'').split(path.delimiter);
 if(process.platform==='win32')directories.push(path.join(process.env.LOCALAPPDATA,'Programs/MiKTeX/miktex/bin/x64'));
 let executable;
 for(const dir of directories){const p=path.join(dir.replace(/^"|"$/g,''),name+(process.platform==='win32'?'.exe':''));try{await readFile(p);executable=p;break;}catch(e){if(!['ENOENT','ENOTDIR'].includes(e.code))throw e;}}
 assert.ok(executable,'Missing native tool '+name);
 const version=await execute(executable,[name==='pdftoppm'?'-v':'--version'],root,'identity-'+name);assert.ok(version.includes(expected),'Unexpected native version '+name);
 return{executable,version:version.split(/\r?\n/)[0],sha256:sha256(await readFile(executable))};
}
await publish(false);
try{
 const native=JSON.parse(await readFile(path.join(root,'tests/Reference/NodeShapes/oracle-profile.json'))),pdf=JSON.parse(await readFile(path.join(root,'tests/Reference/NodeShapes/pdf-oracle-profile.json')));
 const tools={};for(const[n,v]of Object.entries({latex:native.latexVersion,pdflatex:pdf.pdfLatexVersion,dvisvgm:native.dvisvgmVersion,dvitype:native.dviTypeVersion,pdftoppm:pdf.pdfRasterizerVersion}))tools[n]=await identify(n,v);
 const sources=[source,edgeWrapper,edgeHooks,'tools/TikzVisual/path-label-reference.mjs','tools/TikzVisual/path-label-native.mjs','tools/TikzVisual/qualification-process.mjs','tools/TikzVisual/edge-log.mjs','tools/TikzVisual/edge-replay.mjs','tools/TikzVisual/edge-driver-state.mjs','tools/TikzFontData/font-profile.json'];
 const sourceHashes={};for(const file of sources){const b=edgeCanonical(await readFile(path.join(root,file)));sourceHashes[file]=sha256(b);await save('source-captures/'+file,b);}
 const profile=JSON.parse(await readFile(path.join(root,'tools/TikzFontData/font-profile.json')));
 for(const input of profile.inputs.filter(i=>i.name.endsWith('.tfm'))){const b=await readFile(path.join(root,'tests/Reference/Edges/fonts/'+input.name));assert.equal(sha256(b),input.sha256);await save('fonts/'+input.name,b);}
 let wrapper=(await readFile(path.join(root,edgeWrapper),'utf8')).replaceAll('\r\n','\n').replace('\\begin{document}','\\selectcolormodel{rgb}\n\\input{edge-hooks.tex}\n\\begin{document}');
 const pdfWrapper='\\pdfinfoomitdate=1\n\\pdftrailerid{}\n\\pdfsuppressptexinfo=15\n\\AtBeginDocument{\\edgepdftrue}\n'+wrapper.replace('\\def\\pgfsysdriver{pgfsys-dvisvgm.def}\n','')
  .replace('\\paperwidth=600pt \\paperheight=800pt','\\paperwidth=600pt \\paperheight=800pt\n\\pdfpagewidth=\\paperwidth \\pdfpageheight=\\paperheight')
  .replace('      \\setbox\\pgfnodeparttextbox=\\hbox{\\special{lokad-node-origin #3}\\box\\pgfnodeparttextbox}%\n','')
  .replace('\\hbox{\\box\\lokadpicture}','\\hbox{\\pdfsavepos\\write16{LOKAD-PDF-PAGE \\number\\pdflastxpos|\\number\\pdflastypos|\\number\\pdfpagewidth|\\number\\pdfpageheight|END}\\box\\lokadpicture}');
 assert.ok(!pdfWrapper.includes('\\special{'));
 const probes=ids.flatMap(id=>edgeAnchors.map(a=>'\\lokadanchor{'+id+'}{'+a+'}')).join('\n')+'\n';
 await save('probes.tex',probes);await save('svg-wrapper.tex',wrapper);await save('pdf-wrapper.tex',pdfWrapper);
 const observations={};
 for(const route of ['svg','pdf'])for(const state of ['plain','probed']){
  phase=route+'-'+state;const folder=await outputPath(output,'work/'+phase);await mkdir(folder,{recursive:true});
  await copyFile(path.join(root,source),path.join(folder,'case.tikz'));await copyFile(path.join(root,edgeHooks),path.join(folder,'edge-hooks.tex'));
  await writeFile(path.join(folder,'probes.tex'),probes);await writeFile(path.join(folder,'case.tex'),(state==='probed'?'\\AtBeginDocument{\\lokadprobestrue}\n':'')+(route==='svg'?wrapper:pdfWrapper));
  await execute(tools[route==='svg'?'latex':'pdflatex'].executable,['-disable-write18','-disable-installer','-interaction=nonstopmode','-halt-on-error','-recorder','case.tex'],folder,phase+'-compile');
  const log=edgeSanitize(await readFile(path.join(folder,'case.log'),'utf8'));await save(phase+'.log',log);
  const inputs={};for(const line of (await readFile(path.join(folder,'case.fls'),'utf8')).split(/\r?\n/).filter(l=>l.startsWith('INPUT '))){const p=path.resolve(folder,line.slice(6));if(p.startsWith(output+path.sep))continue;const key=path.basename(p),h=sha256(await readFile(p));if(inputs[key])assert.equal(inputs[key],h);inputs[key]=h;}
  await json(phase+'-inputs.json',inputs);
  if(route==='svg'){
   await execute(tools.dvisvgm.executable,['--no-fonts','--exact-bbox','--bbox=min','--page=1','--output=reference.svg','case.dvi'],folder,phase+'-outline');
   const bytes=await readFile(path.join(folder,'reference.svg'));await save(state+'-reference.svg',bytes);
   let trace=null;if(state==='probed'){trace=edgeSanitize(await execute(tools.dvitype.executable,['-disable-installer','-out-mode=4','case.dvi'],folder,'glyph-trace'));await save('native-positions.log',trace);}
   observations[phase]={log,bytes,trace};
  }else{
   const bytes=await readFile(path.join(folder,'case.pdf'));await save(state+'-reference.pdf',bytes);const pages={};
   for(const scale of [1,4]){await execute(tools.pdftoppm.executable,['-png','-r',String(96*scale),'-f','1','-singlefile','case.pdf','page-'+scale+'x'],folder,phase+'-'+scale+'x');const b=await readFile(path.join(folder,'page-'+scale+'x.png'));await save(state+'-pdf-page-'+scale+'x.png',b);pages[scale]=sha256(b);}
   observations[phase]={log,bytes,pages,page:edgePdfPage(log)};
  }
 }
 phase='native-checking';const svg=observations['svg-probed'],pdfObserved=observations['pdf-probed'];
 assert.equal(canonicalEdgeSvg(svg.bytes),canonicalEdgeSvg(observations['svg-plain'].bytes),'Probes changed native SVG drawing.');
 assert.ok(pdfObserved.bytes.equals(observations['pdf-plain'].bytes),'Probes changed native PDF bytes.');assert.deepEqual(pdfObserved.pages,observations['pdf-plain'].pages);
 const metrics=parsePathLabelNative(svg.log,ids),pdfMetrics=parsePathLabelNative(pdfObserved.log,ids);
 assert.deepEqual(metrics,pdfMetrics,'Native SVG/PDF semantic observations differ.');
 metrics.physicalOrder=pathLabelPhysicalCalls(metrics,svg.trace,pdfObserved.log);
 metrics.driverState=pathLabelDriverState(svg.bytes,pdfObserved.bytes);
 await json('metrics.json',metrics);
 await publish(true,{sourceHashes,tools:Object.fromEntries(Object.entries(tools).map(([n,t])=>[n,{version:t.version,sha256:t.sha256}])),definition,pdfPage:pdfObserved.page,
  invariance:{svgDrawing:true,pdfBytes:true,pdfPixels:true},counts:{nodes:metrics.nodes.length,pathCalls:metrics.constructionPaths.length,paintedPaths:metrics.driverState.pathPaints,anchors:metrics.nodes.length*edgeAnchors.length}});
}catch(error){await save('failure.log',edgeSanitize(error.stack??String(error)));await publish(false,{error:edgeSanitize(error.message)});process.exitCode=1;}
