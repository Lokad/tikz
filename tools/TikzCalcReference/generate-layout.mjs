// Trusted fixed-fixture native geometry and ordinary PDF/page research.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
assert.equal(process.argv.length,2,'Usage: node tools/TikzCalcReference/generate-layout.mjs; fixed trusted fixture only.');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.join(root,'artifacts/calc-native-layout/run-'+randomUUID());
const run=promisify(execFile),hash=bytes=>createHash('sha256').update(bytes).digest('hex'),artifacts={},commands=[];
await mkdir(output,{recursive:true});
async function save(file,bytes){const target=path.join(output,file);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);artifacts[file]=hash(bytes);}
async function command(executable,args,cwd,file){
  try{const r=await run(executable,args,{cwd,windowsHide:true,timeout:60000,maxBuffer:2000000});
    const text=r.stdout+r.stderr;await save(file,Buffer.from(text));commands.push({executable,args,output:file,exitCode:0});return text;
  }catch(error){await save(file,Buffer.from((error.stdout??'')+(error.stderr??'')));commands.push({executable,args,output:file,exitCode:error.code,killed:error.killed===true});throw error;}
}
function record(log,name,count){const found=[...log.matchAll(new RegExp('^CALC-'+name+' ([^\\r\\n]+)\\|END$','gm'))];
  assert.equal(found.length,1,'Native record count differs: '+name);const values=found[0][1].split('|').map(Number);
  assert.equal(values.length,count);assert.ok(values.every(Number.isSafeInteger));return values;}
function measure(log,pdf){
  assert.match(log,/CALC-PGF-VERSION 3\.1\.11a/);
  assert.match(log,pdf?/CALC-DRIVER pgfsys-pdftex\.def\|END/:/CALC-DRIVER pgfsys-dvisvgm\.def\|END/);
  const boundsSp=record(log,'BOUNDS',4),boxSp=record(log,'BOX',3);
  const result={boundsSp,boxSp};
  if(pdf){result.boxPageSp=record(log,'BOX-PAGE',4);result.picturePositionSp=record(log,'PICTURE-POS',2);}
  return result;
}
let phase='trusted-inputs';
try{
  const source=await readFile(path.join(root,'tests/Fixtures/calc-coordinates.tikz'));
  const cacheBytes=await readFile(path.join(root,'tests/Reference/CalcCoordinates/points.json')),cache=JSON.parse(cacheBytes);
  const wrapper=await readFile(path.join(root,'tools/TikzCalcReference/layout-wrapper.tex'));
  const probes=await readFile(path.join(root,'tools/TikzCalcReference/probes.tex'));
  assert.equal(hash(source),cache.sourceSha256);assert.equal(cache.pgfVersion,'3.1.11a');assert.equal(cache.points.length,25);
  for(const[file,bytes]of[['case.tikz',source],['cached-points.json',cacheBytes],['layout-wrapper.tex',wrapper],['probes.tex',probes],['generate-layout.mjs',await readFile(fileURLToPath(import.meta.url))]])await save(file,bytes);
  phase='tool-identities';
  for(const tool of ['latex','pdflatex'])assert.match(await command(tool,['--version'],output,tool+'-version.log'),/MiKTeX-pdfTeX 4\.21 \(MiKTeX 25\.4\)/);
  assert.match(await command('dvisvgm',['--version'],output,'dvisvgm-version.log'),/dvisvgm 3\.4\.3/);
  for(const tool of ['pdftoppm','pdfinfo','pdffonts'])assert.match(await command(tool,['-v'],output,tool+'-version.log'),/version 24\.04\.0/);
  const measurements={};
  for(const route of ['svg','pdf'])for(const observer of ['plain','probed']){
    const key=route+'-'+observer,folder=path.join(output,key);await mkdir(folder);phase=key;
    await writeFile(path.join(folder,'case.tikz'),source);await writeFile(path.join(folder,'probes.tex'),probes);
    const text=(route==='pdf'?'\\def\\calcpdf{1}\n':'')+wrapper.toString().replace('\\begin{document}',(observer==='probed'?'\\calcprobestrue\n':'')+'\\begin{document}');
    await writeFile(path.join(folder,'case.tex'),text);
    await command(route==='pdf'?'pdflatex':'latex',['-disable-write18','-disable-installer','-interaction=nonstopmode','-halt-on-error','-recorder','case.tex'],folder,key+'-engine.log');
    if(route==='svg')await command('dvisvgm',['--no-fonts','--exact-bbox','--bbox=min','--output=reference.svg','case.dvi'],folder,key+'-dvisvgm.log');
    else{
      for(const scale of [1,4])await command('pdftoppm',['-r',String(96*scale),'-png','-singlefile','case.pdf','page-'+scale+'x'],folder,key+'-raster-'+scale+'x.log');
      await command('pdfinfo',['case.pdf'],folder,key+'-pdfinfo.log');await command('pdffonts',['case.pdf'],folder,key+'-pdffonts.log');
    }
    const log=await readFile(path.join(folder,'case.log'),'utf8');measurements[key]=measure(log,route==='pdf');
    if(observer==='probed'){
      const points=[...log.matchAll(/^CALC-POINT ([a-z-]+)\|(-?\d+)\|(-?\d+)\|END$/gm)].map(m=>({id:m[1],xSp:Number(m[2]),ySp:Number(m[3])}));
      assert.deepEqual(points,cache.points);measurements[key].points=points;
    }
    for(const file of await readdir(folder))artifacts[key+'/'+file]=hash(await readFile(path.join(folder,file)));
  }
  phase='native-agreement';
  for(const key of Object.keys(measurements)){
    assert.deepEqual(measurements[key].boundsSp,measurements['svg-plain'].boundsSp);
    assert.deepEqual(measurements[key].boxSp,cache.boxSp);
  }
  assert.equal(artifacts['svg-plain/reference.svg'],artifacts['svg-probed/reference.svg']);
  assert.equal(artifacts['svg-plain/reference.svg'],cache.observerSvgSha256,'Layout wrapper changed the cached native drawing.');
  assert.equal(artifacts['pdf-plain/case.pdf'],artifacts['pdf-probed/case.pdf']);
  for(const scale of [1,4])assert.equal(artifacts['pdf-plain/page-'+scale+'x.png'],artifacts['pdf-probed/page-'+scale+'x.png']);
  assert.deepEqual(measurements['pdf-plain'].picturePositionSp,measurements['pdf-probed'].picturePositionSp);
  assert.deepEqual(measurements['pdf-plain'].boxPageSp,measurements['pdf-probed'].boxPageSp);
  const m=measurements['pdf-plain'],[minX,minY,maxX,maxY]=m.boundsSp,[boxX,boxY,pageW,pageH]=m.boxPageSp,[pictureX,pictureY]=m.picturePositionSp;
  assert.ok(maxX>minX&&maxY>minY);assert.deepEqual([pageW,pageH],[500*65536,600*65536]);
  assert.equal(pictureY,boxY);assert.equal(m.boxSp[2],0);assert.equal(maxY-minY,m.boxSp[1]);
  const leadingSp=pictureX-boxX,pictureWidthSp=maxX-minX;
  assert.equal(m.boxSp[0],leadingSp+pictureWidthSp);
  assert.deepEqual(m.boundsSp,cache.pictureBoundsSp);
  assert.deepEqual([pictureWidthSp,maxY-minY,0],cache.pictureBoxSp);
  assert.equal(leadingSp,cache.leadingBoxGlueSp);
  const originSp={x:pictureX-minX,y:pageH-pictureY+minY+m.boxSp[2]},factor=96/(72.27*65536);
  const originPixels={x:originSp.x*factor,y:originSp.y*factor};
  const rasterSizes={};
  const info=await readFile(path.join(output,'pdf-plain-pdfinfo.log'),'utf8');
  assert.match(info,/^Pages:\s+1\s*$/m);assert.match(info,/^Page rot:\s+0\s*$/m);
  const media=/^Page size:\s+([\d.]+) x ([\d.]+) pts/m.exec(info);assert.ok(media);
  assert.ok(Math.abs(Number(media[1])-pageW*72/(72.27*65536))<=.000500001);
  assert.ok(Math.abs(Number(media[2])-pageH*72/(72.27*65536))<=.000500001);
  const fonts=await readFile(path.join(output,'pdf-plain-pdffonts.log'),'utf8');
  assert.equal(fonts.trim().split(/\r?\n/).length,2,'Glyph-free PDF must have no embedded font rows.');
  for(const scale of [1,4]){
    const bytes=await readFile(path.join(output,'pdf-plain/page-'+scale+'x.png'));
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    const size={width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
    assert.deepEqual(size,{width:Math.ceil(pageW*factor*scale),height:Math.ceil(pageH*factor*scale)});rasterSizes[scale+'x']=size;
  }
  for(const[file,digest]of Object.entries(artifacts))assert.equal(hash(await readFile(path.join(output,file))),digest);
  phase='complete';
  const report={schemaVersion:1,role:'native-calc-layout-page-research',completed:true,phase,converterInvoked:false,nativeToolInvoked:true,
    sourceSha256:hash(source),measurements,registration:{originSp,originPixels,leadingSp,pictureWidthSp,pictureHeightSp:maxY-minY,pageWidthSp:pageW,pageHeightSp:pageH},
    rasterSizes,commands,artifacts,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending'};
  const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeFile(path.join(output,'report.json'),bytes);
  console.log(JSON.stringify({completed:true,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:hash(bytes),registration:report.registration}));
}catch(error){await writeFile(path.join(output,'report.json'),JSON.stringify({completed:false,phase,role:'native-calc-layout-page-research',converterInvoked:false,error:error.message.replaceAll(root,'<repo>').slice(0,2000),commands,artifacts,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending'},null,2)+'\n');process.exitCode=1;console.error(error.stack);}
