import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

assert.equal(process.argv.length,2,'Usage: node tools/TikzCalcReference/generate.mjs; fixed fixture only.');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.join(root,'artifacts/calc-native/run-'+randomUUID());
const run=promisify(execFile),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir(output,{recursive:true});
const artifacts={},commands=[];
async function save(file,bytes){await writeFile(path.join(output,file),bytes);artifacts[file]=hash(bytes);}
async function command(executable,args,cwd,file){
  try{
    const r=await run(executable,args,{cwd,windowsHide:true,timeout:60000,maxBuffer:2000000});
    await save(file,Buffer.from(r.stdout+r.stderr));commands.push({executable,args,output:file,exitCode:0});return r.stdout+r.stderr;
  }catch(error){
    await save(file,Buffer.from((error.stdout??'')+(error.stderr??'')));
    commands.push({executable,args,output:file,exitCode:error.code,killed:error.killed===true});throw error;
  }
}
const ids=['a','b','c','sum','subtract','scaled','math','interpolation','extrapolation','rotated','distance','projection','transformed-sum','transformed-interpolation','basis-and-unit','shear-y','rotated-projection','rotated-distance','chain','nested','polar','negative','commented','node-center-shift','node-anchor-interpolation'];
let phase='trusted-inputs';
try{
  const source=await readFile(path.join(root,'tests/Fixtures/calc-coordinates.tikz'));
  const cache=await readFile(path.join(root,'tests/Reference/CalcCoordinates/points.json')),cached=JSON.parse(cache);
  const cachedSvg=await readFile(path.join(root,'tests/Reference/CalcCoordinates/reference.svg'));
  const wrapper=await readFile(path.join(root,'tools/TikzCalcReference/wrapper.tex'));
  const probes=await readFile(path.join(root,'tools/TikzCalcReference/probes.tex'));
  assert.equal(cached.schemaVersion,1);assert.equal(cached.role,'native-calc-coordinate-reference');
  assert.equal(cached.pgfVersion,'3.1.11a');assert.equal(hash(source),cached.sourceSha256);
  assert.equal(hash(cachedSvg),cached.observerSvgSha256);
  assert.deepEqual(cached.points.map(p=>p.id),ids);
  assert.deepEqual([...source.toString().matchAll(/\\coordinate \(([a-z-]+)\)/g)].map(m=>m[1]),ids);
  for(const[file,bytes]of [['generate.mjs',await readFile(fileURLToPath(import.meta.url))],['case.tikz',source],['cached-points.json',cache],['cached-reference.svg',cachedSvg],['wrapper.tex',wrapper],['probes.tex',probes]])await save(file,bytes);
  phase='tool-identities';
  assert.match(await command('latex',['--version'],output,'latex-version.log'),/MiKTeX-pdfTeX 4\.21 \(MiKTeX 25\.4\)/);
  assert.match(await command('dvisvgm',['--version'],output,'dvisvgm-version.log'),/dvisvgm 3\.4\.3/);
  const nativeCalc=(await run('kpsewhich',['tikzlibrarycalc.code.tex'],{windowsHide:true,timeout:10000})).stdout.trim();
  const nativeCalcSha256=hash(await readFile(nativeCalc));
  const records={};
  for(const name of ['plain','probed']){
    phase=name;
    const folder=path.join(output,name);await mkdir(folder);
    await writeFile(path.join(folder,'case.tikz'),source);await writeFile(path.join(folder,'probes.tex'),probes);
    await writeFile(path.join(folder,'case.tex'),name==='plain'?wrapper:wrapper.toString().replace('\\begin{document}','\\calcprobestrue\n\\begin{document}'));
    await command('latex',['-disable-write18','-disable-installer','-interaction=nonstopmode','-halt-on-error','-recorder','case.tex'],folder,name+'-latex.log');
    await command('dvisvgm',['--no-fonts','--exact-bbox','--bbox=min','--output=reference.svg','case.dvi'],folder,name+'-dvisvgm.log');
    for(const file of await readdir(folder))artifacts[name+'/'+file]=hash(await readFile(path.join(folder,file)));
    const log=await readFile(path.join(folder,'case.log'),'utf8');assert.match(log,/CALC-PGF-VERSION 3\.1\.11a/);
    const boxes=[...log.matchAll(/^CALC-BOX (-?\d+)\|(-?\d+)\|(-?\d+)\|END$/gm)];assert.equal(boxes.length,1);
    records[name]={boxSp:boxes[0].slice(1).map(Number),svgSha256:artifacts[name+'/reference.svg']};
    if(name==='probed'){
      const points=[...log.matchAll(/^CALC-POINT ([a-z-]+)\|(-?\d+)\|(-?\d+)\|END$/gm)].map(m=>({id:m[1],xSp:Number(m[2]),ySp:Number(m[3])}));
      assert.deepEqual(points.map(p=>p.id),ids);records.points=points;
    }
  }
  phase='observer-and-cache-agreement';
  assert.equal(records.plain.svgSha256,records.probed.svgSha256);
  assert.deepEqual(records.plain.boxSp,records.probed.boxSp);
  assert.equal(records.plain.svgSha256,cached.observerSvgSha256);
  assert.deepEqual(records.plain.boxSp,cached.boxSp);
  assert.deepEqual(records.points,cached.points);
  for(const[file,digest]of Object.entries(artifacts))assert.equal(hash(await readFile(path.join(output,file))),digest);
  const report={schemaVersion:1,completed:true,phase:'complete',role:'native-calc-coordinate-cache-verification',converterInvoked:false,nativeToolInvoked:true,
    sourceSha256:hash(source),cacheSha256:hash(cache),nativeCalcSha256,points:records.points,plain:records.plain,probed:records.probed,commands,artifacts,
    approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending'};
  const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeFile(path.join(output,'report.json'),bytes);
  console.log(JSON.stringify({completed:true,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:hash(bytes),points:ids.length}));
}catch(error){
  await writeFile(path.join(output,'report.json'),JSON.stringify({completed:false,phase,role:'native-calc-coordinate-cache-verification',converterInvoked:false,error:error.message.replaceAll(root,'<repo>').slice(0,1000),commands,artifacts,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending'},null,2)+'\n');
  process.exitCode=1;throw error;
}
