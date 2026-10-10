// Native-only iteration measurements for fixed trusted positioning fixtures.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,writeArtifact,sha256} from './shape-oracle-bundle.mjs';
import {captureProcess} from './qualification-process.mjs';
import {edgeAnchors,edgeSanitize} from './edge-log.mjs';
import {canonicalEdgeSvg} from './edge-replay.mjs';
import {arrowHooks,parseArrowLog} from './arrow-log.mjs';
const cases={
 'flowchart-styled-labels':{additive:true,mathEvidence:true,arrowPlacements:5,names:['input','filter','output','review',...Array.from({length:5},(_,i)=>'diagram-label-'+(i+1))],hash:'9a067e170478c3c082fe05733bcb9a5d564d198651ef4c5b6dd27485967c0c3e'},
 'math-atom-contract':{folder:'MathLabels',mathEvidence:true,names:['greekOne','greekTwo','variants','capitals','binary','relations','arrows','negation','ordinary','punctuation','binStartEnd','binContext','lowerOne','lowerTwo','upperOne','upperTwo','digits','kernLigatures','upright','uprightGreek','glue','scriptSpacing','largeAtoms','largeScripts','multiline','negativeSpace','assembledRoot','largeAssembledRoot'],hash:'69c1ca3af3e8c1bdfbc61f90ca78f0ab08d66f02d10a1dd92246414b7921e182'},
 'network-math-labels':{mathEvidence:true,names:['hub','worker1','worker2','worker3','output',...Array.from({length:5},(_,i)=>'diagram-label-'+(i+1))],hash:'7b4faa43cb8f0fbb9338629b03d4fc7ce4cca6924c0b3f4fe927635ebfe83702',scalarCalls:Array.from({length:3},()=>['\\angle','\\xoffset','\\yoffset']).flat()},
 'math-label-contract':{folder:'MathLabels',mathEvidence:true,names:['identifier','number','greek','operators','grouping','upright','superscript','subscript','paired','reversePaired','nestedScripts','groupedBase','fraction','nestedFraction','fractionScript','root','rootFraction','nestedRoot','mixed','spacing','uppercaseGreek','tallCombined','large','largeFraction','largeNestedScripts','largeTallRoot'],hash:'aa272e4de214b9582ea75ac3ed88b86b7a1ae05de5072d0f7a9d0ee565997aec'},
 'math-function-boundaries':{folder:'MathFunctions',names:['sentinel'],hash:'0c60e598e8d440ba4215f9cf6b958f4d0b136b9a2f4d17c861354dba5a95994e',scalarCalls:Array(1440).fill('\\value')},
 'network-math-functions':{names:['hub','worker1','worker2','worker3','output'],hash:'2263a4ae32200cfcc435655c3447d4eed0f5b7584f0d88584d9b1b17da579bbf',scalarCalls:[...Array.from({length:3},()=>['\\angle','\\xoffset','\\yoffset','\\padding']).flat(),'\\gap']},
 'math-functions-contract':{folder:'MathFunctions',names:['absLiteral','absNegative','absTiny','minimum','maximum','minimumTie','sinZero','sinThirty','cosThirty','sinFortyFive','cosFortyFive','sinNinety','cosNinety','sinHalfTurn','sinThreeQuarters','sinNegative','cosNegative','sinPeriod','cosLarge','sinHalf','cosHalf','sinNegativeHalf','cosNegativeHalf','sinNearPeriod','cosNearHalfTurn','sinSafeMinimum','nested','before','inside','restored','loop1','loop2','loopRestored','sinShiftBoundary','sinLargeNegative','minimumRegister','maximumRegister'],hash:'48927b1ad0cbcf7b139e0eccf4c8daee8358a82362dc46f91dce623232ff6d2e',scalarCalls:[...Array(29).fill('\\value'),'\\probe','\\value','\\value','\\probe','\\value','\\value','\\value','\\value']},
 'math-scalar-boundaries':{folder:'MathMacros',names:['sentinel'],hash:'9fd0ed39f9eeeafd7cffb2e6c174ef821e4d08382345a87336a3ef5c364f3391',scalarCalls:Array(32).fill('\\value')},
 'math-macro-reciprocal-overflow':{folder:'MathMacros',names:[],hash:'1c93ab11cc23fea46905e7f0ef85875d23dbfa12022f5b067bde2c0682bdd215',nativeError:'! Dimension too large.'},
 'flowchart-math-macros':{names:['input','stage1','stage2','stage3','output'],hash:'a9a0389cf48da3f7036092e2ee00203ed517ee6668452c1352b7acd35d70deef',scalarCalls:['\\step','\\dy','\\offset','\\offset','\\offset','\\factor','\\returny']},
 'math-macro-contract':{folder:'MathMacros',names:['literal','add','subtract','multiply','negativeMultiply','third','negativeThird','fractionalDivide','smallDivide','chain','unary','precedence','reassign','before','inside','restored','loop1','loop2','loopRestored','grouped','groupRestored','tinyAdd','tinySubtract','nearOneDivide','roundedChain'],hash:'fdf31eeab83ed8c8377fc0c2951e2864d9191f73d621ed00d27797168430c0b8',scalarCalls:[...Array(14).fill('\\value'),'\\base','\\base','\\probe','\\value','\\value','\\probe','\\base','\\probe',...Array(4).fill('\\value')]},
 'math-macro-zero-divisor':{folder:'MathMacros',names:[],hash:'c502d571ca4c7a6c1e17bc568e1e80a85072c7611fe34a0da09f05e9bcb79cd6',nativeError:"! Package PGF Math Error: You've asked me to divide"},
 'math-macro-overflow':{folder:'MathMacros',names:[],hash:'2490bfca392c3f905fd49ad6192e4d5346dd05de036768d13e1c19f94c6c0699',nativeError:'! Dimension too large.'},
 'foreach-overflow-positive':{folder:'Foreach',names:[],hash:'82da67c90c5aabf638c16229e15abca30e76820d8de11b0a4de01e8d02e34118',nativeError:'! Dimension too large.'},
 'foreach-overflow-negative':{folder:'Foreach',names:[],hash:'186455aa5ee7833331432de435568e400e93adfe0189b9068d4e56a7663e54a7',nativeError:'! Dimension too large.'},
 'flowchart-foreach':{names:['input','stage1','stage2','stage3','output'],hash:'64ee9c160bb1a8c652bc0cdd38c6396abccc1bde6c686d8f109169e3a72803ad'},
 'foreach-contract':{folder:'Foreach',names:['asc1','asc2','asc3','down3','down2','down1','step1','step3','step5','literalred','literalblue','spaced','outerbefore','inner3','inner4','outerafter','before1','after1','before2','after2','restored','negative-1','negative-3','negative-5','equal','away1','away3','width8mm','width12mm'],hash:'0a73d42a1dcb045c47b56b0f3ce3fe034eb5c56e0d8f61a1cf3b59b0136d8eeb'},
 'flowchart-basic':{names:['input','check','output','retry'],hash:'16ef26c526d0892f2fa643240cf0e9c4a74ea52a62252d4aff8c8ee792762b54'},
 'network-bent':{names:['queue','primary','replica'],hash:'da163c256834b3c94477f4e368cbe69cc700a867b93a0b73a210d3e7a4aa0e54'},
 'flowchart-transformed':{names:['start','finish'],hash:'481e44ba361e36319fadb8f75f2dc73049fa3b14a428baefb8f8ce11efc2c5aa'},
 'flowchart-parameterized':{names:['input','check','retry','output'],hash:'9783a9f385b8bcc1ad4cb5a4fe589c85ae179f7e5eb15a7cf68d5450bd7105c6'},
 'style-contract':{folder:'Styles',names:['single','braced','nested','scoped','restored','ignored','appended'],hash:'082e7ac3084bf8b4a3c6bdd36e190578f2d9039278657f00ea38df245f6c200d'},
 'style-missing-argument':{folder:'Styles',names:['missing'],hash:'d5a32208196929ca5ac56af483807a38fde729abd226a0455e37916f90fe27e8'},
 'style-second-parameter':{folder:'Styles',names:[],hash:'a9a6de1ceb462b05c416ab38e9d20b6ccd454fd39c2dc9cd0d54d5846bf78f1a',nativeError:'! Illegal parameter number in definition of \\pgfkeys@temp.'},
 contract:{folder:'Positioning',names:['seed','north','south','east','west','northeast','northwest','southeast','southwest','single','two','anchorTarget','coordinateTarget','scopedDistance','restoredDistance','basisPair','basisSingle','resetSeed','reset','full','localOrder','captureDistance','negativeDistance','styled'],hash:'1e23351eb4d5e7bd4a41960cae0a6dbcb2b19de29e932c89059d2f0574f4dd2b'},
 registration:{folder:'Positioning',names:['seed','inside','outside','reloaded'],hash:'baf1d70f439bc0af2bd7868268ffdd42f59bd07c2d190ab42b775193cb3be851'},
 'scoped-unavailable':{folder:'Positioning',names:['seed','inside'],hash:'d6640ba5aeaca12213eaa0ae1ff08c3c72730b1830fdb7b85d91030ff66fde82',nativeError:"! Package PGF Math Error: Unknown function `of'"},
 'scoped-reloaded':{folder:'Positioning',names:['seed','inside'],hash:'350aa9de1441cf2768c068ffb7af4de25d0fbe9b71709b32c9d4e0261301bb77',nativeError:"! Package PGF Math Error: Unknown function `of'"}
};
const nativePaths=process.argv[2]==='--paths',framing=nativePaths||process.argv[2]==='--framing',arguments_=process.argv.slice(framing?3:2);
const noMaintenance=arguments_[0]==='--no-maintenance';if(noMaintenance)arguments_.shift();
const defaultCases=Object.keys(cases).filter(id=>!cases[id].additive);
const selected=arguments_.length?arguments_:(framing?defaultCases.filter(id=>cases[id].mathEvidence):defaultCases);
assert.ok(selected.length>0&&selected.every(id=>Object.hasOwn(cases,id))&&new Set(selected).size===selected.length,'Only fixed trusted fixtures may be selected.');
assert.ok(!framing||selected.every(id=>cases[id].mathEvidence),'Supplemental framing admits only fixed trusted math fixtures.');
const output=path.join(root,'artifacts/positioning-native/run-'+randomUUID()),artifacts={},commands=[],results=[];
const save=(f,b)=>writeArtifact(output,f,b,artifacts),bin=path.join(process.env.LOCALAPPDATA,'Programs/MiKTeX/miktex/bin/x64');
const mathEvidence=selected.some(id=>cases[id].mathEvidence);
const tools=Object.fromEntries(await Promise.all(['latex','dvisvgm',...(mathEvidence?['dvitype','kpsewhich']:[])].map(async name=>{const executable=path.join(bin,name+'.exe');return[name,{executable,sha256:sha256(await readFile(executable))}];})));
async function execute(name,args,cwd,tag,expectedError){
 if(noMaintenance)args=['--miktex-disable-maintenance','--miktex-disable-diagnose',...args];
 const p=await captureProcess(tools[name].executable,args,{cwd});await save('commands/'+tag+'.log',edgeSanitize(p.output));
 commands.push({name,args,tag,exitCode:p.exitCode,failure:p.failure});assert.equal(p.failure,null);
 if(expectedError){assert.equal(p.exitCode,1);assert.ok(p.output.includes(expectedError),'Unexpected native failure');}
 else assert.equal(p.exitCode,0,p.output.slice(-1000));return p.output;}
async function publish(completed,error){const b=Buffer.from(JSON.stringify({schemaVersion:1,role:nativePaths?'math-label-path-native':framing?'math-label-framing-native':'diagram-positioning-native-iteration',phase:completed?'complete':'native-observation',completed,converterInvoked:false,nativeToolInvoked:true,
 approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',tools:Object.fromEntries(Object.entries(tools).map(([n,t])=>[n,{sha256:t.sha256}])),commands,results,artifacts,error},null,2)+'\n');
 await writeArtifact(output,'report.json',b);console.log(JSON.stringify({completed,report:path.relative(root,path.join(output,'report.json')).replaceAll('\\','/'),sha256:sha256(b)}));}
function records(log,kind){assert.ok(log.length<=2000000);const flat=log.replace(/\r?\n/g,''),rows=[...flat.matchAll(new RegExp(kind+' ([^]*?)\\|END','g'))].map(m=>m[1].split('|'));
 assert.equal(rows.length,(flat.match(new RegExp(kind+' ','g'))??[]).length);return rows;}
function integer(s){assert.match(s,/^-?\d+$/);const n=Number(s);assert.ok(Number.isSafeInteger(n)&&Math.abs(n)<=1073741823);return n;}
await publish(false);
try{
 const profile=JSON.parse(await readFile(path.join(root,'tests/Reference/NodeShapes/oracle-profile.json')));
 for(const name of Object.keys(tools)){const version=await execute(name,['--version'],root,'version-'+name);
  assert.ok(version.includes(name==='latex'?profile.latexVersion:name==='dvisvgm'?profile.dvisvgmVersion:name==='dvitype'?profile.dviTypeVersion:profile.kpseVersion),'Changed pinned native tool '+name);}
 const wrapperSource=await readFile(path.join(root,'tools/TikzPathLabelReference/placement.tex'),'utf8');
 await save('wrapper-source.tex',wrapperSource);await save('script.mjs',await readFile(new URL(import.meta.url)));
 const framingSource=framing?await readFile(path.join(root,'tools/TikzPathLabelReference/math-framing.tex')):null;
 if(framingSource)await save('math-framing.tex',framingSource);
 const pathHooks=nativePaths?await readFile(path.join(root,arrowHooks)):null;
 if(pathHooks)await save('arrow-hooks.tex',pathHooks);
 for(const id of selected){const c=cases[id];
  const source=await readFile(path.join(root,'tests/Fixtures/'+(c.folder??'Diagrams')+'/'+id+'.tikz'));assert.equal(sha256(Buffer.from(source.toString().replaceAll('\r\n','\n'))),c.hash);
  let wrapper=wrapperSource.replace('straight,quarter,reverse,inverted,bend,absolute,from,target,border,reset,full,zero,one',c.names.join(','));
  const start=wrapper.indexOf('        \\labelanchor{\\labelname}{text}'),end=wrapper.indexOf('      }%',start);assert.ok(start>=0&&end>start);
  wrapper=wrapper.slice(0,start)+edgeAnchors.map(a=>'        \\labelanchor{\\labelname}{'+a+'}').join('\n')+'\n'+wrapper.slice(end);
  if(c.mathEvidence){
   // Reuse native node origins, including anonymous path labels; no candidate layout.
   wrapper=wrapper.replace('\\newbox\\labelpicture','\\newbox\\labelpicture\n\\newcount\\diagramlabelcounter');
   wrapper=wrapper.replace('      \\pgfgettransformentries',String.raw`      \edef\labelnodeid{#3}%
      \ifx\labelnodeid\pgfutil@empty
        \global\advance\diagramlabelcounter by 1
        \edef\labelnodeid{diagram-label-\the\diagramlabelcounter}%
      \fi
      \def\labelshape{#1}\def\labelcoordinate{coordinate}%
      \ifx\labelshape\labelcoordinate\else
        \setbox\pgfnodeparttextbox=\hbox{\special{lokad-node-origin \labelnodeid}\box\pgfnodeparttextbox}%
      \fi
      \pgfgettransformentries`);
   wrapper=wrapper.replace('PATH-LABEL-NODE #3|','PATH-LABEL-NODE \\labelnodeid|').replace('\\labeloriginalnode{#1}{#2}{#3}{#4}','\\labeloriginalnode{#1}{#2}{\\labelnodeid}{#4}');
  }
  const mathMapFile=c.mathEvidence?(await execute('kpsewhich',['lm.map'],root,id+'-font-map')).trim():null;
  const mathMap=c.mathEvidence?await readFile(mathMapFile):null;if(mathMap)await save(id+'/fonts/lm.map',mathMap);
  if(framing){
   const golden=await readFile(path.join(root,'tests/Reference/MathLabels/native-layout',id,'font-observations.json'));
   const observed=JSON.parse(golden);assert.equal(sha256(mathMap),observed.mapSha256,'Frozen math font map changed.');
   await save(id+'/frozen-font-observations.json',golden);
   wrapper=wrapper.replace('\\begin{document}','\\input{math-framing.tex}\n\\begin{document}');
   if(nativePaths){
    const hook=['\\AtBeginDocument{\\iflabelprobes',
     '  \\input{arrow-hooks.tex}\\typeout{ARROW-PGF \\pgfversion|END}%',
     '  \\let\\mathpathend\\endtikzpicture',
     '  \\def\\endtikzpicture{\\typeout{ARROW-BOUNDS \\number\\pgf@picminx|\\number\\pgf@picminy|\\number\\pgf@picmaxx|\\number\\pgf@picmaxy|END}\\mathpathend}%',
     '\\fi}'].join('\n')+'\n';
    wrapper=wrapper.replace('\\begin{document}',hook+'\\begin{document}');
    const box='\\typeout{PATH-LABEL-BOX \\number\\wd\\labelpicture|\\number\\ht\\labelpicture|\\number\\dp\\labelpicture|END}';
    assert.ok(wrapper.includes(box));
    wrapper=wrapper.replace(box,box+'\n\\iflabelprobes'+box.replace('PATH-LABEL-BOX','ARROW-BOX')+'\\fi');
   }
  }
  const svg={};let native;
  for(const state of ['plain','probed']){
   const folder=path.join(output,id,state);await mkdir(folder,{recursive:true});await save(id+'/'+state+'/case.tikz',source);
   if(framingSource)await save(id+'/'+state+'/math-framing.tex',framingSource);
   if(pathHooks)await save(id+'/'+state+'/arrow-hooks.tex',pathHooks);
   // Scalar observations close the numeric assignment rounding/scope gap.
   // Keep the hook out of the plain run and require drawing noninterference.
   const scalarProbe=String.raw`\let\nativeoriginalmathsetmacro\pgfmathsetmacro
\def\pgfmathsetmacro#1#2{%
  \nativeoriginalmathsetmacro#1{#2}%
  \immediate\write16{TIKZ-MATH-CALL \string#1|#1|END}%
}`;
   const observedWrapper=state==='probed'&&c.scalarCalls?wrapper.replace('\\begin{document}','\\begin{document}\n'+scalarProbe):wrapper;
   await save(id+'/'+state+'/case.tex',(state==='probed'?'\\AtBeginDocument{\\labelprobestrue}\n':'')+observedWrapper);
   await execute('latex',['-disable-write18','-disable-installer','-interaction=nonstopmode','-halt-on-error','-recorder','case.tex'],folder,id+'-'+state+'-compile',c.nativeError);
   const log=edgeSanitize(await readFile(path.join(folder,'case.log'),'utf8'));await save(id+'/'+state+'/case.log',log);
   if(c.nativeError){await save(id+'/'+state+'/case.fls',await readFile(path.join(folder,'case.fls')));
    assert.ok(log.includes(c.nativeError));results.push({id,nativeRejected:true,expectedError:c.nativeError,sourceSha256:c.hash});break;}
   for(const f of ['case.dvi','case.fls'])await save(id+'/'+state+'/'+f,await readFile(path.join(folder,f)));
   const inputs={};for(const line of (await readFile(path.join(folder,'case.fls'),'utf8')).split(/\r?\n/).filter(l=>l.startsWith('INPUT '))){
    const f=path.resolve(folder,line.slice(6));if(f.startsWith(output+path.sep))continue;const key=path.basename(f),h=sha256(await readFile(f));
    if(inputs[key])assert.equal(inputs[key],h);inputs[key]=h;}
   await save(id+'/'+state+'/native-inputs.json',JSON.stringify(inputs,null,2)+'\n');
   await execute('dvisvgm',['--no-fonts','--exact-bbox',...(mathMapFile?['--fontmap='+mathMapFile,'--cache=none']:[]),'--output=case.svg','case.dvi'],folder,id+'-'+state+'-svg');
   svg[state]=await readFile(path.join(folder,'case.svg'));await save(id+'/'+state+'/case.svg',svg[state]);
   if(state==='probed'){
    if(c.mathEvidence){
     const trace=edgeSanitize(await execute('dvitype',['-disable-installer','-out-mode=4','case.dvi'],folder,id+'-glyph-trace'));await save(id+'/native-positions.log',trace);
     const fonts=[...trace.matchAll(/^Font (\d+): ([A-Za-z0-9-]+)(?: scaled \d+)?---loaded at size (\d+) DVI units/gm)].map(m=>({number:Number(m[1]),name:m[2],sizeSp:integer(m[3])}));
     assert.ok(fonts.length>0&&fonts.length<=32);assert.equal(new Set(fonts.map(f=>f.number)).size,fonts.length);
     const origins=[...trace.matchAll(/xxx 'lokad-node-origin ([A-Za-z0-9_-]+)'/g)].map(m=>m[1]);assert.deepEqual(origins,c.names);
     const map=mathMap;
     const nativeFiles={};
     for(const font of fonts){
      const tfm=font.name+'.tfm',row=map.toString().split(/\r?\n/).find(l=>l.startsWith(font.name+' '));assert.ok(row,'Missing pinned map entry: '+font.name);
      const files=[tfm,...[...row.matchAll(/<<?([A-Za-z0-9_.-]+\.(?:enc|pfb))/g)].map(m=>m[1])];assert.ok(files.length>=2&&files.length<=4);
      for(const file of files){if(nativeFiles[file])continue;const location=(await execute('kpsewhich',[file],root,id+'-font-'+file.replaceAll('.','-'))).trim(),bytes=await readFile(location);assert.ok(bytes.length>0&&bytes.length<=2000000);await save(id+'/fonts/'+file,bytes);nativeFiles[file]=sha256(bytes);}
     }
     await save(id+'/math-font-observations.json',JSON.stringify({fonts,origins,nativeFiles,mapSha256:sha256(map),glyphs:(trace.match(/: (?:setchar|set[1-4] )/g)??[]).length,rules:(trace.match(/: (?:setrule|putrule) /g)??[]).length},null,2)+'\n');
    }
    assert.ok(log.includes('PATH-LABEL-PGF 3.1.11a'));const anchors=records(log,'PATH-LABEL-ANCHOR');assert.equal(anchors.length,c.names.length*edgeAnchors.length);
    const nodes=records(log,'PATH-LABEL-NODE').filter(r=>c.names.includes(r[0]));assert.deepEqual(nodes.map(r=>r[0]),c.names);
    for(const r of nodes){assert.equal(r.length,11);for(const s of r.slice(5,9))assert.ok(Number.isFinite(Number(s))&&Math.abs(Number(s))<=10000);
     for(const s of r.slice(9))assert.match(s,/^-?\d+(?:\.\d+)?pt$/);}
    for(const name of c.names)assert.deepEqual(anchors.filter(r=>r[0]===name).map(r=>r[1]),edgeAnchors);
    for(const r of anchors)assert.equal(r.length,4);
    native={sourceSha256:c.hash,nodes:nodes.map(r=>({name:r[0],anchor:r[1],widthSp:integer(r[2]),heightSp:integer(r[3]),depthSp:integer(r[4]),frame:r.slice(5)})),
     anchors:anchors.map(r=>({name:r[0],anchor:r[1],xSp:integer(r[2]),ySp:integer(r[3])})),pictureBox:records(log,'PATH-LABEL-BOX')};
    if(framing){
     const b=records(log,'MATH-BOUNDS');assert.equal(b.length,1);assert.equal(b[0].length,4);
     const widths=records(log,'MATH-LINEWIDTH');assert.ok(widths.length>0);assert.ok(widths.every(r=>r.length===1));
     await save(id+'/framing.json',JSON.stringify({sourceSha256:c.hash,pictureBounds:Object.fromEntries(['minXSp','minYSp','maxXSp','maxYSp'].map((key,i)=>[key,integer(b[0][i])])),
      pictureBox:native.pictureBox,lineWidthsSp:[...new Set(widths.map(r=>integer(r[0])))].sort((a,b)=>a-b)},null,2)+'\n');
     if(nativePaths){
      const placements=c.arrowPlacements??(id==='network-math-labels'?6:0);
      const paths=parseArrowLog(log,{allowWrapperGlue:true,allowNoArrows:placements===0});
      assert.deepEqual(paths.pictureBounds,Object.fromEntries(['minXSp','minYSp','maxXSp','maxYSp'].map((key,i)=>[key,integer(b[0][i])])));
      assert.equal(paths.placements.length,placements);
      await save(id+'/paths.json',JSON.stringify({sourceSha256:c.hash,...paths},null,2)+'\n');
     }
    }
    if(c.scalarCalls){const declared=new Set(c.scalarCalls),allCalls=records(log,'TIKZ-MATH-CALL');
     assert.deepEqual([...new Set([...source.toString().matchAll(/\\pgfmathsetmacro\s*(\\[A-Za-z]+)/g)].map(m=>m[1]))].sort(),[...declared].sort());
     const calls=allCalls.filter(r=>declared.has(r[0])),internal=allCalls.filter(r=>!declared.has(r[0]));
     for(const r of internal){assert.equal(r.length,2);assert.match(r[0],/^\\(?:pgf|tikz)[A-Za-z@]+$/);}
     assert.deepEqual(calls.map(r=>r[0]),c.scalarCalls);
     for(const r of calls){assert.equal(r.length,2);assert.match(r[1],/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/);assert.ok(Number.isFinite(Number(r[1])));}
     native.scalarCalls=calls.map((r,i)=>({ordinal:i+1,name:r[0],printed:r[1]}));
     native.internalScalarCalls=internal.map(r=>({name:r[0],printed:r[1]}));}
    await save(id+'/measurements.json',JSON.stringify(native,null,2)+'\n');
   }
  }
  if(c.nativeError)continue;
  assert.equal(canonicalEdgeSvg(svg.plain),canonicalEdgeSvg(svg.probed),'Probes changed diagram drawing');
  if(framing){
   const goldenSvg=await readFile(path.join(root,'tests/Reference/MathLabels/native-layout',id,'oracle.svg'));
   assert.equal(sha256(Buffer.from(canonicalEdgeSvg(svg.plain))),sha256(Buffer.from(canonicalEdgeSvg(goldenSvg))),'Supplement changed frozen math drawing.');
   const golden=JSON.parse(await readFile(path.join(root,'tests/Reference/MathLabels',(c.folder==='MathLabels'?'':'Diagrams/'),id+'.json')));
   assert.deepEqual({nodes:native.nodes,anchors:native.anchors,pictureBox:native.pictureBox}, {nodes:golden.nodes,anchors:golden.anchors,pictureBox:golden.pictureBox});
   const observed=JSON.parse(await readFile(path.join(output,id,'math-font-observations.json'))),frozen=JSON.parse(await readFile(path.join(output,id,'frozen-font-observations.json')));
   assert.deepEqual(observed,frozen,'Supplement changed native fonts or label events.');
  }
  results.push({id,nodes:native.nodes.length,anchors:native.anchors.length,...(native.scalarCalls?{scalarCalls:native.scalarCalls.length}:{}),probeSvgNoninterference:true,sourceSha256:c.hash});
 }
 for(const[f,h]of Object.entries(artifacts))assert.equal(sha256(await readFile(path.join(output,f))),h);
 await publish(true);
}catch(e){await publish(false,e.message);process.exitCode=1;}
