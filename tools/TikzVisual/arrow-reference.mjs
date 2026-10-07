// Explicit native reference production for the fixed authored arrow corpus.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact,outputPath} from './shape-oracle-bundle.mjs';
import {arrowProfile,arrowManifest,arrowWrapper,arrowHooks,arrowReferenceSources,canonicalArrow,validateArrowManifest,parseArrowLog,arrowLayout,arrowPage} from './arrow-log.mjs';
import {verifyArrowDriverState} from './arrow-driver-state.mjs';
const base=path.join(root,'artifacts/arrow-reference'),output=path.join(base,'run-'+randomUUID()),artifacts={},commands=[];
const save=(p,b)=>writeArtifact(output,p,b,artifacts),read=p=>readFile(path.join(root,p)),json=async p=>JSON.parse(await read(p));
const sanitize=s=>s.replaceAll(root,'<repo>').replaceAll(root.replaceAll('\\','/'),'<repo>')
 .replaceAll(process.env.USERPROFILE??root,'<user>').replaceAll((process.env.USERPROFILE??root).replaceAll('\\','/'),'<user>')
 .replace(/\r\n/g,'\n').replace(/\b\d{1,2} (?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC) \d{4} \d{2}:\d{2}\b/gi,'<date>')
 .replace(/TeX output \d{4}\.\d{2}\.\d{2}:\d{4}/g,'TeX output <date>');
let phase='arguments',baselineWritten=false;
async function publish(report){const b=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',b);
 console.log(JSON.stringify({kind:'arrow-native-reference',completed:report.completed,report:path.relative(root,path.join(output,'report.json')).replaceAll('\\','/'),sha256:sha256(b)}));}
async function execute(executable,args,cwd,tag){
 const chunks=[];let length=0,error;
 const code=await new Promise(resolve=>{const child=spawn(executable,args,{cwd,windowsHide:true,shell:false});
  const timer=setTimeout(()=>{error=Error('Native command timeout: '+tag);child.kill();},60000);
  const capture=b=>{length+=b.length;if(length>2000000){error=Error('Native command output bound: '+tag);child.kill();}else chunks.push(b);};
  child.stdout.on('data',capture);child.stderr.on('data',capture);child.on('error',e=>error=e);child.on('close',c=>{clearTimeout(timer);resolve(c);});});
 const text=Buffer.concat(chunks).toString('utf8');commands.push({tag,executable:path.basename(executable),args,exitCode:code});await save('commands/'+tag+'.txt',sanitize(text));
 if(error)throw error;assert.equal(code,0,'Native command failed: '+tag+' '+sanitize(text).slice(-1800));return text;
}
async function identify(name,expected){
 let executable;for(const dir of (process.env.PATH??'').split(path.delimiter)){const p=path.join(dir.replace(/^"|"$/g,''),name+(process.platform==='win32'?'.exe':''));try{if((await stat(p)).isFile()){executable=p;break;}}catch(e){if(!['ENOENT','ENOTDIR'].includes(e.code))throw e;}}
 assert.ok(executable,'Missing native tool: '+name);const version=await execute(executable,[['pdftoppm','pdfinfo'].includes(name)?'-v':'--version'],root,'identity-'+name);
 assert.ok(version.includes(expected),'Unpinned native tool: '+name);return{name,executable,version:version.split(/\r?\n/)[0],sha256:sha256(await readFile(executable))};
}
function pngSize(b){assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');return{width:b.readUInt32BE(16),height:b.readUInt32BE(20)};}
async function main(){
 assert.equal(process.argv.length,3);const mode=process.argv[2];assert.ok(['probe','generate','verify-live','check-cached'].includes(mode));
 await publish({schemaVersion:1,completed:false,mode,phase,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,artifacts});
 if(mode==='check-cached'){const e=await(await import('./arrow-evidence.mjs')).loadArrowEvidence();await publish({schemaVersion:1,completed:true,mode,baselineWritten:false,
  converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,snapshotSha256:e.snapshotSha256,cases:e.cases,artifacts});return;}
 const expected=mode==='verify-live'?await(await import('./arrow-evidence.mjs')).loadArrowEvidence():null;
 if(mode==='generate')assert.equal(await stat(path.join(root,'tests/Reference/Arrows/snapshot.json')).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;}),false,'Generation cannot replace an existing baseline.');
 const manifest=await json(arrowManifest);validateArrowManifest(manifest);const sourceHashes={};
 for(const p of [...arrowReferenceSources,...manifest.cases.map(c=>c.source)]){const b=canonicalArrow(await read(p));sourceHashes[p]=sha256(b);await save('source-captures/'+p,b);}
 const tools={};for(const [n,v]of Object.entries({latex:'MiKTeX 25.4',pdflatex:'MiKTeX 25.4',dvisvgm:'dvisvgm 3.4.3',pdftoppm:'pdftoppm version 24.04.0',pdfinfo:'pdfinfo version 24.04.0'}))tools[n]=await identify(n,v);
 const cases=[],nativeArtifacts={};const nativeSave=async(p,b)=>{await save('native/'+p,b);nativeArtifacts[p]=sha256(b);};
 for(const c of manifest.cases){
  phase='native/'+c.id;console.log('Native arrow case: '+c.id);const observations={},inputs={};const source=(await read(c.source)).toString('utf8');assert.ok(source.length<=65536);
  assert.equal(source.includes('\\usetikzlibrary{arrows.meta}'),c.meta);assert.equal((source.match(/\\begin\{tikzpicture\}/g)??[]).length,1);
  for(const route of ['svg','pdf'])for(const state of ['plain','probed']){
   const folder=await outputPath(output,'work/'+c.id+'/'+route+'-'+state);await mkdir(folder,{recursive:true});
   for(const [from,to]of [[arrowWrapper,'wrapper.tex'],[arrowHooks,'arrow-hooks.tex'],[c.source,'case.tikz']])await writeFile(path.join(folder,to),canonicalArrow(await read(from)));
   await writeFile(path.join(folder,'case.tex'),(route==='pdf'?'\\def\\arrowpdf{1}\n':'')+(state==='probed'?'\\def\\arrowprobes{1}\n':'')+'\\input{wrapper.tex}\n');
   const tag=c.id+'-'+route+'-'+state;
   await execute(tools[route==='svg'?'latex':'pdflatex'].executable,['-disable-write18','-disable-installer','-interaction=nonstopmode','-halt-on-error','-recorder','case.tex'],folder,tag+'-compile');
   const rawLog=await readFile(path.join(folder,'case.log'),'utf8'),log=sanitize(rawLog);assert.ok(log.includes('ARROW-PGF 3.1.11a|END'));await nativeSave(c.id+'/'+route+'-'+state+'.log',log);
   const fls=await readFile(path.join(folder,'case.fls'),'utf8');
   for(const line of fls.split(/\r?\n/).filter(s=>s.startsWith('INPUT '))){const p=path.resolve(folder,line.slice(6));if(p.startsWith(output+path.sep))continue;
    const name=path.basename(p),h=sha256(await readFile(p));if(inputs[name])assert.equal(inputs[name],h);inputs[name]=h;}
   if(route==='svg'){
    await execute(tools.dvisvgm.executable,['--no-fonts','--exact-bbox','--bbox=min','--page=1','--precision=6','--output=reference.svg','case.dvi'],folder,tag+'-svg');
    const bytes=await readFile(path.join(folder,'reference.svg'));await nativeSave(c.id+'/'+state+'-reference.svg',bytes);
    const dvi=await readFile(path.join(folder,'case.dvi'));assert.equal(dvi[0],247);assert.equal(dvi[1],2);const normalized=Buffer.from(dvi);assert.ok(dvi[14]>0);normalized.fill(32,15,15+dvi[14]);
    await nativeSave(c.id+'/'+state+'-native.dvi',dvi);observations[route+'-'+state]={bytes,log,dvi,normalizedDvi:sha256(normalized)};
   }else{
    const bytes=await readFile(path.join(folder,'case.pdf'));await nativeSave(c.id+'/'+state+'-reference.pdf',bytes);const pages={};
    for(const scale of [1,4]){await execute(tools.pdftoppm.executable,['-png','-r',String(96*scale),'-f','1','-singlefile','case.pdf','page-'+scale+'x'],folder,tag+'-'+scale+'x');
     const b=await readFile(path.join(folder,'page-'+scale+'x.png')),size=pngSize(b);assert.deepEqual(size,{width:Math.ceil(500*96/72.27*scale),height:Math.ceil(600*96/72.27*scale)});
     pages[scale]={sha256:sha256(b),size};await nativeSave(c.id+'/'+state+'-pdf-page-'+scale+'x.png',b);}
    const info=await execute(tools.pdfinfo.executable,['case.pdf'],folder,tag+'-info');assert.match(info,/^Pages:\s+1\s*$/m);await save('commands/'+tag+'-pdfinfo.txt',sanitize(info));
    observations[route+'-'+state]={bytes,log,pages,page:arrowPage(log)};
   }
  }
  const s=observations['svg-probed'],sp=observations['svg-plain'],p=observations['pdf-probed'],pp=observations['pdf-plain'];
  assert.equal(sha256(s.bytes),sha256(sp.bytes),'Probes changed native SVG.');assert.equal(s.normalizedDvi,sp.normalizedDvi,'Probes changed native DVI instructions.');
  assert.equal(sha256(p.bytes),sha256(pp.bytes),'Probes changed ordinary PDF.');assert.deepEqual(p.pages,pp.pages);assert.deepEqual(p.page,pp.page);
  assert.deepEqual(arrowLayout(s.log),arrowLayout(sp.log));assert.deepEqual(arrowLayout(p.log),arrowLayout(pp.log));
  const metrics=parseArrowLog(s.log);assert.deepEqual(metrics,parseArrowLog(p.log),'Native SVG/PDF arrow observations differ.');
  const driverState=verifyArrowDriverState(metrics,sp.bytes,pp.bytes,p.page),bounds=metrics.pictureBounds,box=metrics.pictureBox,spToCss=96/(72.27*65536);
  const pdfCamera={page:p.page,origin:{x:(p.page.boxXSp-bounds.minXSp)*spToCss,y:(p.page.heightSp-p.page.boxBaselineYSp+bounds.minYSp+box.depthSp)*spToCss},rasterSizes:p.pages};
  await nativeSave(c.id+'/metrics.json',JSON.stringify({...metrics,driverState,pdfCamera},null,2)+'\n');
  const invariance={svgBytes:true,dviDrawingInstructions:true,pdfBytes:true,pdfPixels:true,pictureBox:true,nativeSvgPdfObservations:true,shippedGeometryAndPaint:true};
  cases.push({id:c.id,invariance,nativeInputs:inputs,counts:{inputs:metrics.inputs.length,paths:metrics.paths.length,templates:metrics.templates.length,tips:metrics.placements.length,paints:driverState.paints.length,clips:metrics.clips.length,driverChecks:driverState.checks.length},normalizedDviSha256:s.normalizedDvi});
 }
 for(const [p,h]of Object.entries(sourceHashes))assert.equal(sha256(canonicalArrow(await read(p))),h,'Native source changed during production: '+p);
 const snapshot={schemaVersion:1,profile:arrowProfile,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,sourceHashes,
  tools:Object.fromEntries(Object.entries(tools).map(([n,t])=>[n,{name:t.name,version:t.version,sha256:t.sha256}])),cases,artifacts:nativeArtifacts};
 const snapshotBytes=Buffer.from(JSON.stringify(snapshot,null,2)+'\n');await save('snapshot.json',snapshotBytes);
 if(expected){assert.deepEqual(snapshot.sourceHashes,expected.snapshot.sourceHashes);assert.deepEqual(snapshot.tools,expected.snapshot.tools);assert.deepEqual(snapshot.cases,expected.snapshot.cases);
  for(const [p,h]of Object.entries(nativeArtifacts)){const old=await read('tests/Reference/Arrows/'+p),now=await readFile(path.join(output,'native',p));
   if(p.endsWith('.dvi')){const canonical=b=>{const a=Buffer.from(b);a.fill(32,15,15+a[14]);return a;};assert.ok(canonical(old).equals(canonical(now)),'Live DVI instructions changed: '+p);}
   else assert.equal(sha256(old),h,'Live native artifact changed: '+p);}}
 if(mode==='generate'){
  for(const p of Object.keys(nativeArtifacts)){const destination=path.join(root,'tests/Reference/Arrows',p);await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,await readFile(path.join(output,'native',p)));}
  await writeFile(path.join(root,'tests/Reference/Arrows/snapshot.json'),snapshotBytes);
  await writeFile(path.join(root,'tools/TikzVisual/arrow-reference-pin.mjs'),'// Explicitly generated native snapshot; independent from its source guard graph.\nexport const arrowSnapshotSha256='+JSON.stringify(sha256(snapshotBytes))+';\n');baselineWritten=true;
 }
 await publish({schemaVersion:1,completed:true,mode,baselineWritten,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,phase:'completed',snapshotSha256:sha256(snapshotBytes),cases,commands,artifacts});
}
try{await main();}catch(error){await publish({schemaVersion:1,completed:false,phase,baselineWritten,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,error:sanitize(error.message),commands,artifacts});process.exitCode=2;}
