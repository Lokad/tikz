// Independent trusted-fixture oracle. Node built-ins and pinned native tools;
// no converter, candidate scene, candidate font resource or image allowance.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {sanitizeLabelledBorderLog as sanitize} from './labelled-border-log.mjs';

const manifestFile='tests/Reference/LabelledBorders/cases.json',wrapperFile='tools/TikzLabelledBorderReference/labelled-borders.tex';
const id='pgf-3.1.11a-labelled-border-interactions-v1',canonical=b=>Buffer.from(b.toString('utf8').replaceAll('\r\n','\n'));
const base=path.join(root,'artifacts/labelled-border-reference'),output=path.join(base,'run-'+randomUUID()),artifacts={},commands=[];
const own='tools/TikzVisual/labelled-border-reference.mjs';let phase='inputs';
const read=p=>readFile(path.join(root,p)),json=async p=>JSON.parse(await read(p)),save=(p,b)=>writeArtifact(output,p,b,artifacts);
const inputFiles=[manifestFile,wrapperFile,own,'tools/TikzVisual/labelled-border-log.mjs','tools/TikzVisual/shape-oracle-bundle.mjs','tests/Reference/NodeShapes/oracle-profile.json',
  'tests/Reference/NodeShapes/pdf-oracle-profile.json','tools/TikzFontData/font-profile.json'];
const integer=text=>{const n=Number(text);assert.ok(Number.isSafeInteger(n)&&Math.abs(n)<=1073741823,'Native dimension outside TeX range.');return n;};
const same=(a,b,message)=>assert.equal(sha256(JSON.stringify(a)),sha256(JSON.stringify(b)),message);
async function publish(r){const b=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(output,'report.json',b);await writeArtifact(base,'latest.json',JSON.stringify({completed:r.completed,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');}
async function execute(executable,args,cwd,tag){
  const stdout=[],stderr=[];let length=0,exitCode=null;
  try{await new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{cwd,windowsHide:true,shell:false});let settled=false;
    const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);if(error){child.kill();reject(error);}else resolve();};
    const timer=setTimeout(()=>finish(Error('Native command timed out: '+tag)),60000);
    const capture=target=>b=>{length+=b.length;if(length>1000000)finish(Error('Native command output bound: '+tag));else target.push(b);};
    child.stdout.on('data',capture(stdout));child.stderr.on('data',capture(stderr));child.on('error',finish);child.on('close',code=>{exitCode=code;finish(code===0?null:Error('Native command failed: '+tag+' ('+code+') '+sanitize(Buffer.concat([...stdout,...stderr]).toString()).slice(-1500)));});
  });}finally{commands.push({tag,executable:path.basename(executable),args,exitCode});await save('commands/'+tag+'.txt',sanitize(Buffer.concat([...stdout,...stderr]).toString('utf8')));}
  return Buffer.concat([...stdout,...stderr]).toString('utf8');
}
async function identify(name,expected){
  const locations=(process.env.PATH??'').split(path.delimiter).map(p=>path.join(p.replace(/^"|"$/g,''),name+(process.platform==='win32'?'.exe':'')));
  let executable;for(const p of locations){try{await readFile(p);executable=p;break;}catch(e){if(!['ENOENT','ENOTDIR'].includes(e.code))throw e;}}
  assert.ok(executable,'Missing native tool: '+name);const text=await execute(executable,[['pdftoppm','pdfinfo','pdffonts'].includes(name)?'-v':'--version'],root,'identity-'+name);assert.ok(text.includes(expected),'Unpinned native version: '+name);
  return{executable,name,version:text.split(/\r?\n/)[0],sha256:sha256(await readFile(executable))};
}
function probes(manifest,c){return c.nodes.flatMap(n=>manifest.anchors.map(a=>'\\lokadanchor{'+n.id+'}{'+a+'}')).join('\n')+'\n';}
function svgCanonical(b){
  const s=b.toString('utf8');assert.ok(s.includes("xmlns='http://www.w3.org/2000/svg'"));
  return s.replace(/<defs>([\s\S]*?)<\/defs>/g,(_,body)=>{
    const paths=[...body.matchAll(/<path\b[^>]*\/>/g)].map(m=>m[0]);assert.equal(body.replace(/<path\b[^>]*\/>/g,'').trim(),'','Only outlined glyph definitions may be reordered.');
    const name=p=>/\bid='([^']+)'/.exec(p)?.[1];assert.ok(paths.every(name));assert.equal(new Set(paths.map(name)).size,paths.length);
    return'<defs>'+paths.sort((a,b)=>name(a)<name(b)?-1:name(a)>name(b)?1:0).join('')+'</defs>';
  });
}
function measure(log,manifest,c){
  const flat=log.replace(/\r?\n/g,''),matches=p=>[...flat.matchAll(new RegExp(p,'g'))];
  assert.ok(flat.includes('LOKAD-PGF-VERSION 3.1.11a'));const shapes=matches('LOKAD-SHAPE ([a-z0-9-]+)\\|(rectangle|circle|ellipse)\\|END');
  assert.deepEqual(shapes.map(m=>({id:m[1],shape:m[2]})),c.nodes);
  const boxMatch=matches('LOKAD-BOX (-?\\d+)\\|(-?\\d+)\\|(-?\\d+)\\|END');assert.equal(boxMatch.length,1);
  const bounds=matches('LOKAD-BOUNDS (-?\\d+)\\|(-?\\d+)\\|(-?\\d+)\\|(-?\\d+)\\|END');assert.equal(bounds.length,1);
  const quantities=['width','height','depth','linewidth','quad','xheight','innerx','innery','outerx','outery','minimumwidth','minimumheight'];
  const nodes=c.nodes.map(n=>{
    const select=p=>matches(p).filter(m=>m[1]===n.id),values=Object.fromEntries(select('LOKAD-VALUE ([a-z0-9-]+)\\|([a-z]+)\\|(-?\\d+)\\|END').map(m=>[m[2],integer(m[3])]));
    assert.deepEqual(Object.keys(values),quantities);
    const points=kind=>Object.fromEntries(select('LOKAD-'+kind+' ([a-z0-9-]+)\\|([a-z -]+)\\|(-?\\d+)\\|(-?\\d+)\\|END').map(m=>[m[2],{xSp:integer(m[3]),ySp:integer(m[4])}]));
    const anchors=points('ANCHOR'),background=points('POINT');assert.deepEqual(Object.keys(anchors),manifest.anchors);
    assert.deepEqual(Object.keys(background),n.shape==='rectangle'?['southwest','northeast']:['center','xaxis','yaxis']);
    const frames=select('LOKAD-FRAME ([a-z0-9-]+)\\|([^|]+)\\|([^|]+)\\|([^|]+)\\|([^|]+)\\|([^|]+)\\|([^|]+)\\|END');assert.equal(frames.length,1);
    const m=frames[0],dimension=s=>{assert.match(s,/^-?[\d.]+pt$/);return integer(Math.round(Number(s.slice(0,-2))*65536));};
    const frame={a:Number(m[2]),b:Number(m[3]),c:Number(m[4]),d:Number(m[5]),eSp:dimension(m[6]),fSp:dimension(m[7])};assert.ok(Object.values(frame).every(Number.isFinite));
    return{...n,values,anchors,background,frame};
  });
  const tokens=matches('LOKAD-SEG (\\d+)\\|(move|line|control1|control2|curve|close|rectcorner|rectsize)\\|(-?\\d+)\\|(-?\\d+)\\|END');
  const paths=matches('LOKAD-PATH (\\d+)\\|([a-z0-9-]+)\\|([^|]*)\\|(-?\\d+)\\|END').map(m=>({index:integer(m[1]),owner:m[2],usage:m[3],lineWidthSp:integer(m[4]),segments:tokens.filter(t=>t[1]===m[1]).map(t=>({kind:t[2],point:{xSp:integer(t[3]),ySp:integer(t[4])}}))}));
  assert.equal(paths.length,c.nodes.length+c.drawingPaths);assert.equal(tokens.length,paths.reduce((n,p)=>n+p.segments.length,0));
  assert.deepEqual(paths.map(p=>p.index),Array.from({length:paths.length},(_,i)=>i+1));
  assert.deepEqual(paths.filter(p=>p.owner!=='drawing').map(p=>p.owner),c.nodes.map(n=>'node-'+n.id));
  assert.equal(paths.filter(p=>p.owner==='drawing').length,c.drawingPaths);assert.ok(paths.every(p=>p.segments.length>=2&&p.lineWidthSp>0&&p.usage.includes('draw')));
  return{schemaVersion:1,profile:id,units:'Integer TeX sp, y-up; global soft paths and anchors; local background/frame',
    pictureBox:{widthSp:integer(boxMatch[0][1]),heightSp:integer(boxMatch[0][2]),depthSp:integer(boxMatch[0][3])},
    pictureBounds:{minXSp:integer(bounds[0][1]),minYSp:integer(bounds[0][2]),maxXSp:integer(bounds[0][3]),maxYSp:integer(bounds[0][4])},nodes,paths};
}
function page(log){
  const rows=[...log.replace(/\r?\n/g,'').matchAll(/LOKAD-PDF-PAGE (-?\d+)\|(-?\d+)\|(\d+)\|(\d+)\|END/g)];assert.equal(rows.length,1);const m=rows[0];
  const p={boxXSp:integer(m[1]),boxBaselineYSp:integer(m[2]),widthSp:integer(m[3]),heightSp:integer(m[4])};assert.equal(p.widthSp,600*65536);assert.equal(p.heightSp,800*65536);return p;
}
function pngSize(b){assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(b.subarray(12,16).toString(),'IHDR');return{width:b.readUInt32BE(16),height:b.readUInt32BE(20)};}
function pdfWrapper(svg){
  let s=svg.replace('\\def\\pgfsysdriver{pgfsys-dvisvgm.def}\n','').replace('\\paperwidth=600pt \\paperheight=800pt','\\paperwidth=600pt \\paperheight=800pt\n\\pdfpagewidth=\\paperwidth \\pdfpageheight=\\paperheight')
    .replace('      \\setbox\\pgfnodeparttextbox=\\hbox{\\special{lokad-node-origin #3}\\box\\pgfnodeparttextbox}%\n','')
    .replace('\\hbox{\\box\\lokadpicture}','\\hbox{%\n  \\pdfsavepos\n  \\write16{LOKAD-PDF-PAGE \\number\\pdflastxpos|\\number\\pdflastypos|\\number\\pdfpagewidth|\\number\\pdfpageheight|END}%\n  \\box\\lokadpicture\n}');
  assert.ok(!s.includes('pgfsys-dvisvgm')&&!s.includes('\\special{')&&s.includes('\\pdfsavepos'));return'\\pdfinfoomitdate=1\n\\pdftrailerid{}\n\\pdfsuppressptexinfo=15\n'+s;
}
async function generate(manifest){
  const native=await json('tests/Reference/NodeShapes/oracle-profile.json'),pdf=await json('tests/Reference/NodeShapes/pdf-oracle-profile.json');
  const required={latex:native.latexVersion,dvisvgm:native.dvisvgmVersion,dvitype:native.dviTypeVersion,kpsewhich:native.kpseVersion,
    pdflatex:pdf.pdfLatexVersion,pdftoppm:pdf.pdfRasterizerVersion,pdfinfo:pdf.pdfInfoVersion,pdffonts:pdf.pdfFontsVersion};
  const tools={};for(const[n,v]of Object.entries(required))tools[n]=await identify(n,v);
  const fonts=await json('tools/TikzFontData/font-profile.json');assert.equal(fonts.id,manifest.fontProfile);
  for(const f of fonts.inputs){const p=(await execute(tools.kpsewhich.executable,[f.name],root,'font-'+f.name)).trim(),b=await readFile(p);assert.equal(sha256(b),f.sha256);if(f.name.endsWith('.tfm'))await save('fonts/'+f.name,b);}
  const wrapper=canonical(await read(wrapperFile)).toString('utf8'),pdfTex=pdfWrapper(wrapper),cases=[];
  for(const c of manifest.cases){
    phase='reference/'+c.id;const results={},inputs={};
    for(const route of['svg','pdf'])for(const mode of['plain','probed']){
      const folder=await outputPath(output,'work/'+c.id+'/'+route+'-'+mode);await mkdir(folder,{recursive:true});
      await copyFile(path.join(root,c.source),path.join(folder,'case.tikz'));await writeFile(path.join(folder,'probes.tex'),probes(manifest,c));
      await writeFile(path.join(folder,'case.tex'),(mode==='probed'?'\\AtBeginDocument{\\lokadprobestrue}\n':'')+(route==='svg'?wrapper:pdfTex));
      const tag=c.id+'-'+route+'-'+mode,engine=tools[route==='svg'?'latex':'pdflatex'];
      await execute(engine.executable,['-disable-write18','-disable-installer','-interaction=nonstopmode','-halt-on-error','-recorder','case.tex'],folder,tag+'-compile');
      const log=await readFile(path.join(folder,'case.log'),'utf8');assert.ok(log.includes('LOKAD-PGF-VERSION 3.1.11a'));const sanitized=sanitize(log);await save(c.id+'/'+route+'-'+mode+'.log',sanitized);
      const fls=await readFile(path.join(folder,'case.fls'),'utf8');for(const line of fls.split(/\r?\n/).filter(s=>s.startsWith('INPUT '))){const p=path.resolve(folder,line.slice(6));if(p.startsWith(output+path.sep))continue;const b=await readFile(p),name=(/\.(tfm|pfb|enc|map)$/.test(p)?'font/':'tex/')+path.basename(p),h=sha256(b);if(inputs[name])assert.equal(inputs[name],h);inputs[name]=h;}
      if(route==='svg'){
        await execute(tools.dvisvgm.executable,['--no-fonts','--exact-bbox','--bbox=min','--page=1','--output=reference.svg','case.dvi'],folder,tag+'-svg');
        const svg=await readFile(path.join(folder,'reference.svg'));await save(c.id+'/'+mode+'-reference.svg',svg);
        let trace=null;if(mode==='probed'){trace=sanitize(await execute(tools.dvitype.executable,['-disable-installer','-out-mode=4','case.dvi'],folder,tag+'-glyphs'));await save(c.id+'/native-positions.log',trace);
          assert.match(trace,/totalpages=1(?:\s|$)/);assert.deepEqual([...trace.matchAll(/lokad-node-origin ([a-z0-9-]+)/g)].map(m=>m[1]),c.nodes.map(n=>n.id));
          const names=[...trace.matchAll(/Font \d+: ([a-z0-9-]+?)(?: scaled \d+)?---loaded at size \d+ DVI units/g)].map(m=>m[1]);assert.ok(names.length>0&&names.every(n=>fonts.fonts.some(f=>path.basename(f.tfm,'.tfm')===n)));}
        results[route+'-'+mode]={log,svg,trace};
      }else{
        const bytes=await readFile(path.join(folder,'case.pdf'));await save(c.id+'/'+mode+'-reference.pdf',bytes);const pages={};
        for(const scale of[1,4]){await execute(tools.pdftoppm.executable,['-png','-r',String(96*scale),'-f','1','-singlefile','case.pdf','page-'+scale+'x'],folder,tag+'-'+scale+'x');
          const b=await readFile(path.join(folder,'page-'+scale+'x.png')),size=pngSize(b);assert.deepEqual(size,{width:Math.ceil(600*96/72.27*scale),height:Math.ceil(800*96/72.27*scale)});assert.ok(size.width*size.height<=20000000);pages[scale]={sha256:sha256(b),size};await save(c.id+'/'+mode+'-pdf-page-'+scale+'x.png',b);}
        const info=await execute(tools.pdfinfo.executable,['case.pdf'],folder,tag+'-info');assert.match(info,/^Pages:\s+1\s*$/m);await save(c.id+'/'+mode+'-pdf-info.txt',sanitize(info));
        const fontInfo=await execute(tools.pdffonts.executable,['case.pdf'],folder,tag+'-fonts');await save(c.id+'/'+mode+'-pdf-fonts.txt',sanitize(fontInfo));assert.match(fontInfo,/LMRoman10-Regular/);assert.ok(fontInfo.split(/\r?\n/).slice(2).filter(Boolean).every(s=>/\s+yes\s+yes\s+/.test(s)));
        results[route+'-'+mode]={log,bytes,pages,page:page(log)};
      }
    }
    const s=results['svg-probed'],plain=results['svg-plain'],f=results['pdf-probed'],fp=results['pdf-plain'];
    assert.equal(sha256(svgCanonical(s.svg)),sha256(svgCanonical(plain.svg)),'Probes changed visible SVG.');
    const box=log=>measureBox(log);assert.deepEqual(box(s.log),box(plain.log));assert.deepEqual(box(f.log),box(fp.log));assert.deepEqual(f.page,fp.page);assert.equal(sha256(f.bytes),sha256(fp.bytes));assert.deepEqual(f.pages,fp.pages);
    const measurements=measure(s.log,manifest,c),pdfMeasurements=measure(f.log,manifest,c);same(measurements,pdfMeasurements,'SVG/PDF native layout or paths disagree.');
    const b=measurements.pictureBounds,boxData=measurements.pictureBox,spToCss=96/(72.27*65536);
    assert.equal(boxData.widthSp,b.maxXSp-b.minXSp);assert.equal(boxData.heightSp+boxData.depthSp,b.maxYSp-b.minYSp);
    const camera={origin:{x:(f.page.boxXSp-b.minXSp)*spToCss,y:(f.page.heightSp-f.page.boxBaselineYSp+b.minYSp+boxData.depthSp)*spToCss},page:f.page,rasterSizes:Object.fromEntries([1,4].map(scale=>[scale+'x',f.pages[scale].size]))};
    const sourceHashes={};for(const p of[...inputFiles,c.source])sourceHashes[p]=sha256(canonical(await read(p)));
    await save(c.id+'/metrics.json',JSON.stringify({...measurements,converterInvoked:false,approvedImagePolicy:false,pdfCamera:camera},null,2)+'\n');
    await save(c.id+'/probes.tex',probes(manifest,c));await save(c.id+'/pdf-wrapper.tex',pdfTex);
    const toolIdentities=Object.fromEntries(Object.entries(tools).map(([n,{executable,...t}])=>[n,t]));
    const provenance={schemaVersion:1,profile:id,caseId:c.id,converterInvoked:false,sourceHashes,tools:toolIdentities,inputs,
      invariance:{pictureBox:true,svgDrawing:true,svgByteIdentical:sha256(s.svg)===sha256(plain.svg),pdfBytes:true,pdfPixels:true,pdfPagePosition:true,nativeSvgPdfRecords:true},
      artifacts:Object.fromEntries(Object.entries(artifacts).filter(([p])=>p.startsWith(c.id+'/')))};
    await save(c.id+'/provenance.json',JSON.stringify(provenance,null,2)+'\n');cases.push({id:c.id,nodes:measurements.nodes.length,paths:measurements.paths.length,sourceHashes,nativeMetricsSha256:artifacts[c.id+'/metrics.json'],invariance:provenance.invariance});
    console.log('Independent labelled borders '+c.id+': native records and plain/probed SVG/PDF invariance passed.');
  }
  return cases;
}
function measureBox(log){const m=[...log.replace(/\r?\n/g,'').matchAll(/LOKAD-BOX (-?\d+)\|(-?\d+)\|(-?\d+)\|END/g)];assert.equal(m.length,1);return m[0].slice(1).map(integer);}
async function main(){
  assert.equal(process.argv.length,3);assert.ok(['generate','check-cached'].includes(process.argv[2]));const manifest=await json(manifestFile);assert.equal(manifest.schemaVersion,1);assert.equal(manifest.profile,id);assert.equal(manifest.cases.length,3);assert.deepEqual(manifest.libraries,['shapes.geometric']);
  for(const c of manifest.cases){assert.match(c.id,/^[a-z]+$/);assert.equal(c.source,'tests/Fixtures/Nodes/labelled-border-'+c.id+'.tikz');const source=(await read(c.source)).toString('utf8');assert.ok(source.length<=65536);assert.deepEqual([...source.matchAll(/\\node\[[^\]]*\]\s*\(([^)]+)\)/g)].map(m=>m[1]),c.nodes.map(n=>n.id));}
  if(process.argv[2]==='check-cached'){
    const snapshot=await json('tests/Reference/LabelledBorders/snapshot.json');assert.equal(snapshot.profile,id);assert.equal(snapshot.converterInvoked,false);assert.equal(snapshot.approvedImagePolicy,false);
    for(const[file,h]of Object.entries(snapshot.artifacts)){assert.ok(/^(fonts\/|lines\/|paths\/|transforms\/)[\w.-]+$/.test(file));assert.equal(sha256(await read('tests/Reference/LabelledBorders/'+file)),h);}
    for(const c of manifest.cases){const folder='tests/Reference/LabelledBorders/'+c.id,p=await json(folder+'/provenance.json');assert.equal(p.profile,id);assert.equal(p.caseId,c.id);assert.equal(p.converterInvoked,false);
      assert.deepEqual(Object.keys(p.sourceHashes),[...inputFiles,c.source]);assert.deepEqual(Object.keys(p.artifacts).sort(),Object.keys(snapshot.artifacts).filter(k=>k.startsWith(c.id+'/')&&!k.endsWith('/provenance.json')).sort());
      for(const[file,h]of Object.entries(p.sourceHashes))assert.equal(sha256(canonical(await read(file))),h);
      for(const[file,h]of Object.entries(p.artifacts)){assert.ok(file.startsWith(c.id+'/')&&!file.split('/').includes('..'));assert.equal(sha256(await read('tests/Reference/LabelledBorders/'+file)),h);}
      assert.ok(Object.entries(p.invariance).filter(([k])=>k!=='svgByteIdentical').every(([,v])=>v===true));const svgLog=(await read(folder+'/svg-probed.log')).toString('utf8'),pdfLog=(await read(folder+'/pdf-probed.log')).toString('utf8');
      const m=measure(svgLog,manifest,c),saved=await json(folder+'/metrics.json');same(m,Object.fromEntries(Object.keys(m).map(k=>[k,saved[k]])));same(m,measure(pdfLog,manifest,c));
      assert.deepEqual(measureBox(svgLog),measureBox((await read(folder+'/svg-plain.log')).toString('utf8')));assert.deepEqual(measureBox(pdfLog),measureBox((await read(folder+'/pdf-plain.log')).toString('utf8')));
      assert.deepEqual(page(pdfLog),page((await read(folder+'/pdf-plain.log')).toString('utf8')));assert.deepEqual(page(pdfLog),saved.pdfCamera.page);
      assert.equal(sha256(svgCanonical(await read(folder+'/probed-reference.svg'))),sha256(svgCanonical(await read(folder+'/plain-reference.svg'))));
      assert.equal(sha256(await read(folder+'/probed-reference.pdf')),sha256(await read(folder+'/plain-reference.pdf')));
      for(const scale of[1,4]){const a=await read(folder+'/probed-pdf-page-'+scale+'x.png'),b=await read(folder+'/plain-pdf-page-'+scale+'x.png');assert.equal(sha256(a),sha256(b));assert.deepEqual(pngSize(a),saved.pdfCamera.rasterSizes[scale+'x']);}
    }console.log('Cached labelled-border native evidence passed; image conformance pending.');return;
  }
  const cases=await generate(manifest);for(const[p,h]of Object.entries(artifacts))assert.equal(sha256(await readFile(await outputPath(output,p))),h);
  const referenceArtifacts=Object.fromEntries(Object.entries(artifacts).filter(([p])=>p.startsWith('fonts/')||manifest.cases.some(c=>p.startsWith(c.id+'/'))));
  await save('snapshot.json',JSON.stringify({schemaVersion:1,profile:id,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,cases,artifacts:referenceArtifacts},null,2)+'\n');
  await publish({schemaVersion:1,profile:id,completed:true,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',cases,commands,artifacts});
  // Explicit trusted reference generation only. Ordinary consumers never write baselines.
  for(const p of['snapshot.json',...Object.keys(referenceArtifacts)]){const destination=path.join(root,'tests/Reference/LabelledBorders',p);await mkdir(path.dirname(destination),{recursive:true});await copyFile(await outputPath(output,p),destination);}
}
await main().catch(async error=>{process.exitCode=2;console.error(error.stack?.slice(0,4000)??error.message);await publish({completed:false,phase,error:error.message.slice(0,4000),converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,commands,artifacts});});
