// Independent trusted-fixture native measurements; no converter invocation.
import assert from 'node:assert/strict';
import {readFile,mkdir,copyFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {captureProcess} from './qualification-process.mjs';
import {edgeAnchors,edgeWrapper,edgeHooks,edgeCanonical,edgeSanitize,edgePdfPage} from './edge-log.mjs';
import {canonicalEdgeSvg} from './edge-replay.mjs';
import {parsePathLabelNative,parseDiagramNative,pathLabelPhysicalCalls,pathLabelDriverState} from './path-label-native.mjs';
import {requiresSvgArrowFillCorrection,svgArrowFillChangedPaintIndices,correctedArrowFillWrapper,verifySvgArrowFillCorrection} from './svg-arrow-color-evidence.mjs';
import {svgDefaultArrowFillWorkaroundKind} from './svg-arrow-color-workaround.mjs';

assert.ok(process.argv.length===2||process.argv.length===3,'Usage: node tools/TikzVisual/path-label-reference.mjs [fixed fixture name]');
const cases={
 placement:['straight','quarter','reverse','inverted','bend','absolute','from','target','border','reset','full','zero','one'],
 interactions:['seed','first','second','reuse','clipped','continued','nested','escaped']
};
const diagrams={
 'flowchart-arc-order':{hash:'100b692e54a9d58c6296bf07083755768bbc4e7dfb642b2d2766b46f77bb0481',nodes:['input','check','output','retry'].map(id=>[id,'rectangle']),labels:3,coordinates:['return'],constructionOrder:['input','check','output','retry','diagram-label-1','diagram-label-2','diagram-label-3','return']},
 'definitions-contract':{folder:'Definitions',hash:'faf64f77406ae68829cb3a6d6b4ed24cca3f0630806e08a95ea898ec45ffd5b5',nodes:['early','late','local','restored','boundary','placed','row1','row2'].map(id=>[id,'rectangle']),labels:0,coordinates:[],constructionOrder:['early','late','local','restored','boundary','placed','row1','row2']},
 'flowchart-definitions':{hash:'3ce3467719edad6c46f13e153c26dcd080e6ce2868c588c59244b11d27148483',nodes:['input','check','retry','output'].map(id=>[id,'rectangle']),labels:3,coordinates:['return'],constructionOrder:['input','check','retry','output','diagram-label-1','diagram-label-2','diagram-label-3','return']},
 'flowchart-draw-color':{hash:'00382dca733736532da904d9246c7354565d22e91673a951218a229e052b5137',nodes:['input','check','store','review'].map(id=>[id,'rectangle']),labels:5,coordinates:['return'],constructionOrder:['input','check','store','review','diagram-label-1','diagram-label-2','diagram-label-3','diagram-label-4','return','diagram-label-5']},
 'arrow-color-contract':{hash:'48afc2076c84177c9b62aa7d583db5dfad0bf829c5f6b7746d0b32f5796b5bff',nodes:[],labels:3,coordinates:[],constructionOrder:['diagram-label-1','diagram-label-2','diagram-label-3']},
 'flowchart-paint':{hash:'38e3c9edcca5fbdc25ecf8e614e9c8e0e3cd0c42b302e00374bae309f8f17722',nodes:['input','check','store','review'].map(id=>[id,'rectangle']),labels:5,coordinates:['return'],constructionOrder:['input','check','store','review','diagram-label-1','diagram-label-2','diagram-label-3','diagram-label-4','return','diagram-label-5']},
 'network-smooth-plot':{hash:'10029c10cbbf08c4a13579659138f0a2b7be155c93b866cdb4096c0b5555faee',nodes:['input','filter','output'].map(id=>[id,'rectangle']),labels:3,coordinates:['origin','return'],constructionOrder:['input','filter','output','diagram-label-1','diagram-label-2','origin','diagram-label-3','return']},
 'smooth-plot-contract':{folder:'Plotting',hash:'d2f3415578d92be358eed7d2d2927720d10cee97d56417885d88b82f3b219985',nodes:[['sentinel','rectangle']],labels:0,coordinates:['seed'],constructionOrder:['sentinel','seed']},
 'network-function-plot':{hash:'92a7a7ebfd39bb8e735a3c52f6972acaec607e4de2df5549e5cfcbe6acf88fdc',nodes:['input','filter','output'].map(id=>[id,'rectangle']),labels:3,coordinates:['origin','return'],constructionOrder:['input','filter','output','diagram-label-1','diagram-label-2','origin','diagram-label-3','return']},
 'function-plot-contract':{folder:'Plotting',hash:'bd15f0fa3345ea0df4f5c5a0acd8c1ed48457b5c9429f70ffdded448198c2f11',nodes:['sentinel','restored'].map(id=>[id,'rectangle']),labels:0,coordinates:[],constructionOrder:['sentinel','restored']},
 'network-coordinate-plot':{hash:'4283ad96c06887488e4625436398350664931e13a5a9409470425bca7fa6dcc1',nodes:['input','filter','output'].map(id=>[id,'rectangle']),labels:3,coordinates:['origin','return'],constructionOrder:['input','filter','output','diagram-label-1','diagram-label-2','origin','diagram-label-3','return']},
 'coordinate-plot-contract':{folder:'Plotting',hash:'555ddf964ab1ebc2ca18719f9f3e8b5f04044741db610d4cd4773d799c5b4de4',nodes:[['sentinel','rectangle']],labels:0,coordinates:['seed'],constructionOrder:['sentinel','seed']},
 'network-math-functions':{hash:'2263a4ae32200cfcc435655c3447d4eed0f5b7584f0d88584d9b1b17da579bbf',nodes:['hub','worker1','worker2','worker3','output'].map(id=>[id,'rectangle']),labels:5,coordinates:['slot1','slot2','slot3','relay','return'],constructionOrder:['hub','slot1','worker1','slot2','worker2','slot3','worker3','output','diagram-label-1','diagram-label-2','diagram-label-3','diagram-label-4','diagram-label-5','relay','return']},
 'math-functions-contract':{folder:'MathFunctions',hash:'48927b1ad0cbcf7b139e0eccf4c8daee8358a82362dc46f91dce623232ff6d2e',nodes:['absLiteral','absNegative','absTiny','minimum','maximum','minimumTie','sinZero','sinThirty','cosThirty','sinFortyFive','cosFortyFive','sinNinety','cosNinety','sinHalfTurn','sinThreeQuarters','sinNegative','cosNegative','sinPeriod','cosLarge','sinHalf','cosHalf','sinNegativeHalf','cosNegativeHalf','sinNearPeriod','cosNearHalfTurn','sinSafeMinimum','nested','before','inside','restored','loop1','loop2','loopRestored','sinShiftBoundary','sinLargeNegative','minimumRegister','maximumRegister'].map(id=>[id,'rectangle']),labels:0,coordinates:[],constructionOrder:['absLiteral','absNegative','absTiny','minimum','maximum','minimumTie','sinZero','sinThirty','cosThirty','sinFortyFive','cosFortyFive','sinNinety','cosNinety','sinHalfTurn','sinThreeQuarters','sinNegative','cosNegative','sinPeriod','cosLarge','sinHalf','cosHalf','sinNegativeHalf','cosNegativeHalf','sinNearPeriod','cosNearHalfTurn','sinSafeMinimum','nested','before','inside','restored','loop1','loop2','loopRestored','sinShiftBoundary','sinLargeNegative','minimumRegister','maximumRegister']},
 'math-macro-contract':{folder:'MathMacros',hash:'fdf31eeab83ed8c8377fc0c2951e2864d9191f73d621ed00d27797168430c0b8',nodes:['literal','add','subtract','multiply','negativeMultiply','third','negativeThird','fractionalDivide','smallDivide','chain','unary','precedence','reassign','before','inside','restored','loop1','loop2','loopRestored','grouped','groupRestored','tinyAdd','tinySubtract','nearOneDivide','roundedChain'].map(id=>[id,'rectangle']),labels:0,coordinates:[],constructionOrder:['literal','add','subtract','multiply','negativeMultiply','third','negativeThird','fractionalDivide','smallDivide','chain','unary','precedence','reassign','before','inside','restored','loop1','loop2','loopRestored','grouped','groupRestored','tinyAdd','tinySubtract','nearOneDivide','roundedChain']},
 'flowchart-math-macros':{hash:'a9a0389cf48da3f7036092e2ee00203ed517ee6668452c1352b7acd35d70deef',nodes:['input','stage1','stage2','stage3','output'].map(id=>[id,'rectangle']),labels:4,coordinates:['row1','row2','row3','split','return'],constructionOrder:['input','row1','stage1','row2','stage2','row3','stage3','output','diagram-label-1','diagram-label-2','diagram-label-3','diagram-label-4','split','return']},
 'foreach-contract':{folder:'Foreach',hash:'0a73d42a1dcb045c47b56b0f3ce3fe034eb5c56e0d8f61a1cf3b59b0136d8eeb',nodes:['asc1','asc2','asc3','down3','down2','down1','step1','step3','step5','literalred','literalblue','spaced','outerbefore','inner3','inner4','outerafter','before1','after1','before2','after2','restored','negative-1','negative-3','negative-5','equal','away1','away3','width8mm','width12mm'].map(id=>[id,'rectangle']),labels:0,coordinates:['red','blue'],constructionOrder:['asc1','asc2','asc3','down3','down2','down1','step1','step3','step5','red','blue','literalred','literalblue','spaced','outerbefore','inner3','inner4','outerafter','before1','after1','before2','after2','restored','negative-1','negative-3','negative-5','equal','away1','away3','width8mm','width12mm']},
 'flowchart-foreach':{hash:'64ee9c160bb1a8c652bc0cdd38c6396abccc1bde6c686d8f109169e3a72803ad',nodes:['input','stage1','stage2','stage3','output'].map(id=>[id,'rectangle']),labels:4,coordinates:['row1','row2','row3','return'],constructionOrder:['input','row1','stage1','row2','stage2','row3','stage3','output','diagram-label-1','diagram-label-2','diagram-label-3','diagram-label-4','return']},
 'flowchart-parameterized':{hash:'9783a9f385b8bcc1ad4cb5a4fe589c85ae179f7e5eb15a7cf68d5450bd7105c6',nodes:[['input','rectangle'],['check','rectangle'],['retry','rectangle'],['output','rectangle']],labels:3,coordinates:['return'],constructionOrder:['input','check','retry','output','diagram-label-1','diagram-label-2','diagram-label-3','return']},
 'style-contract':{folder:'Styles',hash:'082e7ac3084bf8b4a3c6bdd36e190578f2d9039278657f00ea38df245f6c200d',nodes:['single','braced','nested','scoped','restored','ignored','appended'].map(id=>[id,'rectangle']),labels:0,coordinates:[],constructionOrder:['single','braced','nested','scoped','restored','ignored','appended']},
 'flowchart-basic':{hash:'16ef26c526d0892f2fa643240cf0e9c4a74ea52a62252d4aff8c8ee792762b54',nodes:[['input','rectangle'],['check','rectangle'],['output','rectangle'],['retry','rectangle']],labels:3,coordinates:['return'],constructionOrder:['input','check','output','retry','diagram-label-1','diagram-label-2','diagram-label-3','return']},
 'network-bent':{hash:'da163c256834b3c94477f4e368cbe69cc700a867b93a0b73a210d3e7a4aa0e54',nodes:[['queue','circle'],['primary','ellipse'],['replica','ellipse']],labels:3,coordinates:['projection','relay'],constructionOrder:['queue','primary','replica','diagram-label-1','diagram-label-2','diagram-label-3','projection','relay']},
 'flowchart-transformed':{hash:'481e44ba361e36319fadb8f75f2dc73049fa3b14a428baefb8f8ce11efc2c5aa',nodes:[['start','rectangle'],['finish','rectangle']],labels:2,coordinates:['waypoint'],constructionOrder:['start','finish','diagram-label-1','waypoint','diagram-label-2']}
};
const id=process.argv[2]??'placement',diagram=Object.hasOwn(diagrams,id);assert.ok(diagram||Object.hasOwn(cases,id),'Only fixed trusted repository fixtures are accepted.');
const correctSvgFill=requiresSvgArrowFillCorrection(id);
const source='tests/Fixtures/'+(diagram?(diagrams[id].folder??'Diagrams'):'PathLabels')+'/'+id+'.tikz';
const definition=diagram?{id,nodes:[...diagrams[id].nodes.map(([id,shape])=>({id,shape})),...Array.from({length:diagrams[id].labels},(_,i)=>({id:'diagram-label-'+(i+1),shape:'rectangle',sourceName:''}))],coordinates:diagrams[id].coordinates,constructionOrder:diagrams[id].constructionOrder}:{id,nodes:cases[id].map(id=>({id,shape:'rectangle'})),coordinates:[]};
const ids=definition.nodes.map(n=>n.id);
const output=path.join(root,'artifacts/'+(diagram?'diagram-reference':'path-label-reference')+'/run-'+randomUUID()),artifacts={},commands=[];
const save=(p,b)=>writeArtifact(output,p,b,artifacts),json=(p,v)=>save(p,JSON.stringify(v,null,2)+'\n');
let phase='inputs';
async function publish(completed,details={}){
 const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:diagram?'diagram-native-reference':'path-label-native-reference',completed,phase:completed?'complete':phase,
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
 if(correctSvgFill)sources.push('tools/TikzVisual/svg-arrow-color-workaround.mjs','tools/TikzVisual/svg-arrow-color-evidence.mjs','tools/TikzVisual/arrow-driver-state.mjs');
 const sourceHashes={};for(const file of sources){const b=edgeCanonical(await readFile(path.join(root,file)));sourceHashes[file]=sha256(b);await save('source-captures/'+file,b);}
 if(diagram)assert.equal(sourceHashes[source],diagrams[id].hash,'Changed trusted diagram source.');
 const profile=JSON.parse(await readFile(path.join(root,'tools/TikzFontData/font-profile.json')));
 for(const input of profile.inputs.filter(i=>i.name.endsWith('.tfm'))){const b=await readFile(path.join(root,'tests/Reference/Edges/fonts/'+input.name));assert.equal(sha256(b),input.sha256);await save('fonts/'+input.name,b);}
 let wrapper=(await readFile(path.join(root,edgeWrapper),'utf8')).replaceAll('\r\n','\n').replace('\\begin{document}','\\selectcolormodel{rgb}\n\\input{edge-hooks.tex}\n\\begin{document}');
 if(diagram){
  // Give anonymous labels probe identities without changing the trusted source.
  // These names exist only in probed runs; drawing/PDF invariance is required.
  wrapper=wrapper.replace('\\newcount\\lokadpathcounter','\\newcount\\lokadpathcounter\n\\newcount\\diagramlabelcounter');
  const start=wrapper.indexOf('    \\def\\pgfmultipartnode'),end=wrapper.indexOf('    \\let\\lokadoriginalellipse',start);assert.ok(start>=0&&end>start);
  let hook=wrapper.slice(start,end).replace('      \\edef\\lokadnodeid{#3}%',
   '      \\edef\\lokadnodeid{#3}%\n      \\ifx\\lokadnodeid\\pgfutil@empty\n        \\global\\advance\\diagramlabelcounter by 1\n        \\edef\\lokadnodeid{diagram-label-\\the\\diagramlabelcounter}%\n      \\fi');
  hook=hook.replaceAll('node-#3','node-\\lokadnodeid').replaceAll('#3|','\\lokadnodeid|')
   .replace('\\special{lokad-node-origin #3}', '\\special{lokad-node-origin \\lokadnodeid}')
   .replace('      \\setbox\\pgfnodeparttextbox=\\hbox{\\special{lokad-node-origin \\lokadnodeid}\\box\\pgfnodeparttextbox}%',
    '      \\def\\diagramshape{#1}\\def\\diagramcoordinate{coordinate}%\n      \\ifx\\diagramshape\\diagramcoordinate\\else\n        \\setbox\\pgfnodeparttextbox=\\hbox{\\special{lokad-node-origin \\lokadnodeid}\\box\\pgfnodeparttextbox}%\n      \\fi')
   .replace('\\lokadoriginalnode{#1}{#2}{#3}{#4}', '\\lokadoriginalnode{#1}{#2}{\\lokadnodeid}{#4}');
  wrapper=wrapper.slice(0,start)+hook+wrapper.slice(end);
 }
 const pdfWrapper='\\pdfinfoomitdate=1\n\\pdftrailerid{}\n\\pdfsuppressptexinfo=15\n\\AtBeginDocument{\\edgepdftrue}\n'+wrapper.replace('\\def\\pgfsysdriver{pgfsys-dvisvgm.def}\n','')
  .replace('\\paperwidth=600pt \\paperheight=800pt','\\paperwidth=600pt \\paperheight=800pt\n\\pdfpagewidth=\\paperwidth \\pdfpageheight=\\paperheight')
  .replace(/^[ \t]*\\setbox\\pgfnodeparttextbox=\\hbox\{\\special\{lokad-node-origin [^}]+\}\\box\\pgfnodeparttextbox\}%\n/m,'')
  .replace('\\hbox{\\box\\lokadpicture}','\\hbox{\\pdfsavepos\\write16{LOKAD-PDF-PAGE \\number\\pdflastxpos|\\number\\pdflastypos|\\number\\pdfpagewidth|\\number\\pdfpageheight|END}\\box\\lokadpicture}');
 assert.ok(!pdfWrapper.includes('\\special{'));
 const originalWrapper=wrapper;
 if(correctSvgFill){await save('original-svg-wrapper.tex',wrapper);wrapper=correctedArrowFillWrapper(wrapper);}
 const probes=[...ids.flatMap(id=>edgeAnchors.map(a=>'\\lokadanchor{'+id+'}{'+a+'}')),...definition.coordinates.map(id=>'\\lokadanchor{'+id+'}{center}')].join('\n')+'\n';
 await save('probes.tex',probes);await save('svg-wrapper.tex',wrapper);await save('pdf-wrapper.tex',pdfWrapper);
 const observations={};
 for(const route of (correctSvgFill?['original-svg','svg','pdf']:['svg','pdf']))for(const state of ['plain','probed']){
  const svgRoute=route!=='pdf';
  phase=route+'-'+state;const folder=await outputPath(output,'work/'+phase);await mkdir(folder,{recursive:true});
  await copyFile(path.join(root,source),path.join(folder,'case.tikz'));await copyFile(path.join(root,edgeHooks),path.join(folder,'edge-hooks.tex'));
  await writeFile(path.join(folder,'probes.tex'),probes);await writeFile(path.join(folder,'case.tex'),(state==='probed'?'\\AtBeginDocument{\\lokadprobestrue}\n':'')+(route==='original-svg'?originalWrapper:svgRoute?wrapper:pdfWrapper));
  await execute(tools[svgRoute?'latex':'pdflatex'].executable,['-disable-write18','-disable-installer','-interaction=nonstopmode','-halt-on-error','-recorder','case.tex'],folder,phase+'-compile');
  const log=edgeSanitize(await readFile(path.join(folder,'case.log'),'utf8'));await save(phase+'.log',log);
  const inputs={};for(const line of (await readFile(path.join(folder,'case.fls'),'utf8')).split(/\r?\n/).filter(l=>l.startsWith('INPUT '))){const p=path.resolve(folder,line.slice(6));if(p.startsWith(output+path.sep))continue;const key=path.basename(p),h=sha256(await readFile(p));if(inputs[key])assert.equal(inputs[key],h);inputs[key]=h;}
  await json(phase+'-inputs.json',inputs);
  if(svgRoute){
   await execute(tools.dvisvgm.executable,['--no-fonts','--exact-bbox','--bbox=min','--page=1','--output=reference.svg','case.dvi'],folder,phase+'-outline');
   const bytes=await readFile(path.join(folder,'reference.svg'));await save((route==='original-svg'?'original-':'')+state+'-reference.svg',bytes);
   let trace=null;if(state==='probed'&&route==='svg'){trace=edgeSanitize(await execute(tools.dvitype.executable,['-disable-installer','-out-mode=4','case.dvi'],folder,'glyph-trace'));await save('native-positions.log',trace);}
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
 const parse=diagram?log=>parseDiagramNative(log,definition):log=>parsePathLabelNative(log,ids);
 const metrics=parse(svg.log),pdfMetrics=parse(pdfObserved.log);
 assert.deepEqual(metrics,pdfMetrics,'Native SVG/PDF semantic observations differ.');
 metrics.physicalOrder=pathLabelPhysicalCalls(metrics,svg.trace,pdfObserved.log);
 metrics.driverState=pathLabelDriverState(svg.bytes,pdfObserved.bytes);
 let nativeSvgCorrection;
 if(correctSvgFill){
  nativeSvgCorrection={kind:svgDefaultArrowFillWorkaroundKind,changedPaintIndices:svgArrowFillChangedPaintIndices(id),pdfUnmodified:true};
  await json('native-svg-correction.json',nativeSvgCorrection);
  const files=new Map(await Promise.all(Object.keys(artifacts).map(async file=>[file,await readFile(await outputPath(output,file))])));
  verifySvgArrowFillCorrection({report:{definition,artifacts,sourceHashes,nativeSvgCorrection},files});
 }
 await json('metrics.json',metrics);
 await publish(true,{sourceHashes,tools:Object.fromEntries(Object.entries(tools).map(([n,t])=>[n,{version:t.version,sha256:t.sha256}])),definition,pdfPage:pdfObserved.page,
  ...(nativeSvgCorrection?{nativeSvgCorrection}:{}),invariance:{svgDrawing:true,pdfBytes:true,pdfPixels:true},counts:{nodes:metrics.nodes.length,pathCalls:metrics.constructionPaths.length,paintedPaths:metrics.driverState.pathPaints,anchors:metrics.nodes.length*edgeAnchors.length}});
}catch(error){await save('failure.log',edgeSanitize(error.stack??String(error)));await publish(false,{error:edgeSanitize(error.message)});process.exitCode=1;}
