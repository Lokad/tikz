// Explicit trusted-fixture native production. No converter invocation.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {verifyEdgeDriverState} from './edge-driver-state.mjs';
import {canonicalEdgeSvg as drawing,verifyEdgeReplay} from './edge-replay.mjs';
import {edgeProfile,edgeInputFiles,edgeIds,edgeManifest,edgeWrapper,edgeHooks,edgeCanonical as canonical,edgeSanitize as sanitize,
  validateEdgeManifest,parseEdgeLog,edgeBox,edgePdfPage,edgePhysicalOrder} from './edge-log.mjs';

const base=path.join(root,'artifacts/edge-reference'),output=path.join(base,'run-'+randomUUID()),artifacts={},commands=[];
const save=(p,b)=>writeArtifact(output,p,b,artifacts),read=p=>readFile(path.join(root,p)),json=async p=>JSON.parse(await read(p));
let phase='trusted-inputs',baselineWritten=false;
async function publish(report){const b=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',b);
  await writeArtifact(base,'latest.json',JSON.stringify({completed:report.completed,
    report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');
  return {report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)};}
async function execute(executable,args,cwd,tag){
  const chunks=[];let length=0,reason=null;
  const status=await new Promise(resolve=>{
    const child=spawn(executable,args,{cwd,windowsHide:true,shell:false});
    const timer=setTimeout(()=>{reason=Error('Native edge command timed out: '+tag);child.kill();},60000);
    const capture=b=>{length+=b.length;if(length>2000000){reason=Error('Native edge command output bound: '+tag);child.kill();}else chunks.push(b);};
    child.stdout.on('data',capture);child.stderr.on('data',capture);child.on('error',e=>{reason=e;});
    child.on('close',code=>{clearTimeout(timer);resolve(code);});
  });
  const text=Buffer.concat(chunks).toString('utf8');commands.push({tag,executable:path.basename(executable),args,exitCode:status});
  await save('commands/'+tag+'.txt',sanitize(text));if(reason)throw reason;
  assert.equal(status,0,'Native edge command failed: '+tag+' '+sanitize(text).slice(-1500));return text;
}
async function identify(name,expected){
  let executable;for(const dir of (process.env.PATH??'').split(path.delimiter)){
    const p=path.join(dir.replace(/^"|"$/g,''),name+(process.platform==='win32'?'.exe':''));
    try{await readFile(p);executable=p;break;}catch(e){if(!['ENOENT','ENOTDIR'].includes(e.code))throw e;}
  }
  assert.ok(executable,'Missing native edge tool: '+name);
  const text=await execute(executable,[['pdftoppm','pdfinfo','pdffonts'].includes(name)?'-v':'--version'],root,'identity-'+name);
  assert.ok(text.includes(expected),'Unpinned native edge tool: '+name);
  return {executable,name,version:text.split(/\r?\n/)[0],sha256:sha256(await readFile(executable))};
}
function pngSize(b){assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)};}
const writeJson=(p,v)=>save(p,JSON.stringify(v,null,2)+'\n');
async function main(){
  await publish({completed:false,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,artifacts});
  assert.equal(process.argv.length,3);assert.ok(['generate','verify-live','check-cached'].includes(process.argv[2]));
  const mode=process.argv[2],manifest=await json(edgeManifest);validateEdgeManifest(manifest);
  const expected=mode==='verify-live'?await(await import('./edge-evidence.mjs')).loadEdgeEvidence():null;
  if(mode==='check-cached'){
    const {loadEdgeEvidence}=await import('./edge-evidence.mjs');const e=await loadEdgeEvidence();
    const location=await publish({schemaVersion:1,completed:true,profile:edgeProfile,mode,baselineWritten:false,
      converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',
      snapshotSha256:e.snapshotSha256,cases:e.snapshot.cases,artifacts});
    console.log('Cached straight to/edge native evidence: '+e.metrics.reduce((n,c)=>n+c.paths.length,0)+' path calls; converter not invoked.');
    console.log(JSON.stringify({kind:'edge-reference-output',completed:true,...location}));return;
  }
  const sourceHashes={};for(const p of [...edgeInputFiles,...manifest.cases.map(c=>c.source)]){
    const b=canonical(await read(p));sourceHashes[p]=sha256(b);await save('source-captures/'+p,b);
  }
  for(const c of manifest.cases){const source=(await read(c.source)).toString('utf8');assert.ok(source.length<=65536);
    assert.deepEqual([...source.matchAll(/\\node\[[^\]]*\]\s*\(([^)]+)\)/g)].map(m=>m[1]),c.nodes.map(n=>n.id));
    assert.deepEqual([...source.matchAll(/\\coordinate\s*\(([^)]+)\)/g)].map(m=>m[1]),c.coordinates??[]);}
  const native=await json('tests/Reference/NodeShapes/oracle-profile.json'),pdf=await json('tests/Reference/NodeShapes/pdf-oracle-profile.json');
  const required={latex:native.latexVersion,dvisvgm:native.dvisvgmVersion,dvitype:native.dviTypeVersion,kpsewhich:native.kpseVersion,
    pdflatex:pdf.pdfLatexVersion,pdftoppm:pdf.pdfRasterizerVersion,pdfinfo:pdf.pdfInfoVersion,pdffonts:pdf.pdfFontsVersion};
  const tools={};for(const[n,v]of Object.entries(required))tools[n]=await identify(n,v);
  const fonts=await json('tools/TikzFontData/font-profile.json');assert.equal(fonts.id,manifest.fontProfile);
  for(const f of fonts.inputs){const location=(await execute(tools.kpsewhich.executable,[f.name],root,'font-'+f.name)).trim();
    const b=await readFile(location);assert.equal(sha256(b),f.sha256);if(f.name.endsWith('.tfm'))await save('fonts/'+f.name,b);}
  let wrapper=canonical(await read(edgeWrapper)).toString('utf8').replace('\\begin{document}','\\selectcolormodel{rgb}\n\\input{edge-hooks.tex}\n\\begin{document}');
  const pdfWrapper='\\pdfinfoomitdate=1\n\\pdftrailerid{}\n\\pdfsuppressptexinfo=15\n\\AtBeginDocument{\\edgepdftrue}\n'
    +wrapper.replace('\\def\\pgfsysdriver{pgfsys-dvisvgm.def}\n','')
      .replace('\\paperwidth=600pt \\paperheight=800pt','\\paperwidth=600pt \\paperheight=800pt\n\\pdfpagewidth=\\paperwidth \\pdfpageheight=\\paperheight')
      .replace('      \\setbox\\pgfnodeparttextbox=\\hbox{\\special{lokad-node-origin #3}\\box\\pgfnodeparttextbox}%\n','')
      .replace('\\hbox{\\box\\lokadpicture}','\\hbox{\\pdfsavepos\\write16{LOKAD-PDF-PAGE \\number\\pdflastxpos|\\number\\pdflastypos|\\number\\pdfpagewidth|\\number\\pdfpageheight|END}\\box\\lokadpicture}');
  assert.ok(!pdfWrapper.includes('pgfsys-dvisvgm')&&!pdfWrapper.includes('\\special{'));
  const caseRecords=[];
  for(const c of manifest.cases){
    phase='native/'+c.id;const observations={},inputs={};
    const probes=[...c.nodes.flatMap(n=>manifest.anchors.map(a=>'\\lokadanchor{'+n.id+'}{'+a+'}')),
      ...(c.coordinates??[]).map(id=>'\\lokadanchor{'+id+'}{center}')].join('\n')+'\n';
    for(const route of ['svg','pdf'])for(const state of ['plain','probed']){
      const folder=await outputPath(output,'work/'+c.id+'/'+route+'-'+state);await mkdir(folder,{recursive:true});
      await copyFile(path.join(root,c.source),path.join(folder,'case.tikz'));await copyFile(path.join(root,edgeHooks),path.join(folder,'edge-hooks.tex'));
      await writeFile(path.join(folder,'probes.tex'),probes);
      await writeFile(path.join(folder,'case.tex'),(state==='probed'?'\\AtBeginDocument{\\lokadprobestrue}\n':'')+(route==='svg'?wrapper:pdfWrapper));
      const tag=c.id+'-'+route+'-'+state;
      await execute(tools[route==='svg'?'latex':'pdflatex'].executable,['-disable-write18','-disable-installer','-interaction=nonstopmode','-halt-on-error','-recorder','case.tex'],folder,tag+'-compile');
      const log=await readFile(path.join(folder,'case.log'),'utf8');assert.ok(log.includes('LOKAD-PGF-VERSION 3.1.11a'));
      await save(c.id+'/'+route+'-'+state+'.log',sanitize(log));
      const fls=await readFile(path.join(folder,'case.fls'),'utf8');
      for(const line of fls.split(/\r?\n/).filter(s=>s.startsWith('INPUT '))){const p=path.resolve(folder,line.slice(6));if(p.startsWith(output+path.sep))continue;
        const name=(/\.(tfm|pfb|enc|map)$/.test(p)?'font/':'tex/')+path.basename(p),h=sha256(await readFile(p));
        if(inputs[name])assert.equal(inputs[name],h);inputs[name]=h;}
      if(route==='svg'){
        await execute(tools.dvisvgm.executable,['--no-fonts','--exact-bbox','--bbox=min','--page=1','--output=reference.svg','case.dvi'],folder,tag+'-svg');
        const bytes=await readFile(path.join(folder,'reference.svg'));await save(c.id+'/'+state+'-reference.svg',bytes);
        let trace=null;if(state==='probed'){
          trace=sanitize(await execute(tools.dvitype.executable,['-disable-installer','-out-mode=4','case.dvi'],folder,tag+'-positions'));
          assert.match(trace,/totalpages=1(?:\s|$)/);await save(c.id+'/native-positions.log',trace);
          assert.deepEqual([...trace.matchAll(/lokad-node-origin ([a-z0-9-]+)/g)].map(m=>m[1]),c.nodes.map(n=>n.id));
        }
        observations[route+'-'+state]={log,bytes,trace};
      }else{
        const bytes=await readFile(path.join(folder,'case.pdf'));await save(c.id+'/'+state+'-reference.pdf',bytes);const pages={};
        for(const scale of [1,4]){
          await execute(tools.pdftoppm.executable,['-png','-r',String(96*scale),'-f','1','-singlefile','case.pdf','page-'+scale+'x'],folder,tag+'-'+scale+'x');
          const b=await readFile(path.join(folder,'page-'+scale+'x.png')),size=pngSize(b);
          assert.deepEqual(size,{width:Math.ceil(600*96/72.27*scale),height:Math.ceil(800*96/72.27*scale)});
          pages[scale]={sha256:sha256(b),size};await save(c.id+'/'+state+'-pdf-page-'+scale+'x.png',b);
        }
        const info=await execute(tools.pdfinfo.executable,['case.pdf'],folder,tag+'-info');assert.match(info,/^Pages:\s+1\s*$/m);await save(c.id+'/'+state+'-pdf-info.txt',sanitize(info));
        const fontInfo=await execute(tools.pdffonts.executable,['case.pdf'],folder,tag+'-fonts');await save(c.id+'/'+state+'-pdf-fonts.txt',sanitize(fontInfo));
        if(c.nodes.length)assert.match(fontInfo,/LMRoman10-Regular/);
        observations[route+'-'+state]={log,bytes,pages,page:edgePdfPage(log)};
      }
    }
    const s=observations['svg-probed'],plain=observations['svg-plain'],f=observations['pdf-probed'],fp=observations['pdf-plain'];
    assert.equal(sha256(drawing(s.bytes)),sha256(drawing(plain.bytes)),'Edge probes changed visible SVG.');
    assert.deepEqual(edgeBox(s.log),edgeBox(plain.log));assert.deepEqual(edgeBox(f.log),edgeBox(fp.log));
    assert.equal(sha256(f.bytes),sha256(fp.bytes),'Edge probes changed PDF bytes.');assert.deepEqual(f.pages,fp.pages);assert.deepEqual(f.page,fp.page);
    const metrics=parseEdgeLog(s.log,c);assert.deepEqual(metrics,parseEdgeLog(f.log,c),'SVG/PDF native state differs.');
    const order=edgePhysicalOrder(metrics,s.log,s.trace);assert.deepEqual(order,edgePhysicalOrder(metrics,f.log,null,true),'SVG/PDF physical path order differs.');
    const b=metrics.pictureBounds,box=metrics.pictureBox,spToCss=96/(72.27*65536);
    const camera={origin:{x:(f.page.boxXSp-b.minXSp)*spToCss,y:(f.page.heightSp-f.page.boxBaselineYSp+b.minYSp+box.depthSp)*spToCss},
      page:f.page,rasterSizes:Object.fromEntries([1,4].map(scale=>[scale+'x',f.pages[scale].size]))};
    const driverState=verifyEdgeDriverState({...metrics,physicalOrder:order},plain.bytes,fp.bytes);
    await writeJson(c.id+'/metrics.json',{...metrics,physicalOrder:order,driverState,pdfCamera:camera});await save(c.id+'/probes.tex',probes);
    await save(c.id+'/svg-wrapper.tex',wrapper);await save(c.id+'/pdf-wrapper.tex',pdfWrapper);
    const invariant={svgDrawing:true,svgBytes:sha256(s.bytes)===sha256(plain.bytes),pictureBox:true,pdfBytes:true,pdfPixels:true,pdfPagePosition:true,nativeSvgPdfState:true,physicalPathOrder:true,shippedDriverState:true};
    const provenance={schemaVersion:1,profile:edgeProfile,caseId:c.id,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,sourceHashes,
      tools:Object.fromEntries(Object.entries(tools).map(([n,{executable,...v}])=>[n,v])),inputs,invariance:invariant,
      artifacts:Object.fromEntries(Object.entries(artifacts).filter(([p])=>p.startsWith(c.id+'/')))};
    await writeJson(c.id+'/provenance.json',provenance);
    caseRecords.push({id:c.id,nodes:metrics.nodes.length,coordinates:metrics.coordinates.length,pathCalls:metrics.paths.length,paintedPaths:order.paintedPaths.length,
      nativeMetricsSha256:artifacts[c.id+'/metrics.json'],invariance:invariant});
    console.log('Independent straight to/edge '+c.id+': '+metrics.paths.length+' native path calls; probe invariance and physical order passed.');
  }
  for(const[p,h]of Object.entries(sourceHashes))assert.equal(sha256(canonical(await read(p))),h,'Source changed during native production: '+p);
  const selected=Object.fromEntries(Object.entries(artifacts).filter(([p])=>p.startsWith('fonts/')||edgeIds.some(id=>p.startsWith(id+'/'))));
  const snapshot={schemaVersion:1,profile:edgeProfile,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,sourceHashes,cases:caseRecords,artifacts:selected};
  const snapshotBytes=Buffer.from(JSON.stringify(snapshot,null,2)+'\n');await save('snapshot.json',snapshotBytes);
  if(mode==='generate'){
    phase='explicit-baseline-write';for(const p of [...Object.keys(selected),'snapshot.json']){
      const destination=path.join(root,'tests/Reference/Edges',p);await mkdir(path.dirname(destination),{recursive:true});await copyFile(await outputPath(output,p),destination);
    }baselineWritten=true;
  }else await writeJson('live-replay.json',await verifyEdgeReplay(expected.snapshot,p=>Promise.resolve(expected.files.get('tests/Reference/Edges/'+p)),
    snapshot,async p=>readFile(await outputPath(output,p))));
  const location=await publish({schemaVersion:1,completed:true,profile:edgeProfile,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
    overallVerdict:'pending',mode,baselineWritten,snapshotSha256:sha256(snapshotBytes),sourceHashes,cases:caseRecords,commands,artifacts});
  console.log(JSON.stringify({kind:'edge-reference-output',completed:true,...location}));
}
await main().catch(async error=>{process.exitCode=2;console.error(error.stack);const location=await publish({completed:false,phase,baselineWritten,converterInvoked:false,
  approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',error:sanitize(error.message),commands,artifacts});
  console.log(JSON.stringify({kind:'edge-reference-output',completed:false,...location}));});
