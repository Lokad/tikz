// Current public conversion, independent saved PNG metrics and source recapture.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {loadCalcSavedReport,verifyCalcPrimaryPixels,verifyCalcPdfPixels,verifyCalcRerender,calcHash,calcEqual} from './calc-saved-images.mjs';
import {readCalcLayoutEvidence} from './calc-layout-evidence.mjs';

assert.equal(process.argv.length,4,'Usage: node tools/TikzVisual/check-calc-images.mjs <primary-report.json> <pdf-report.json>');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.join(root,'artifacts/calc-image-checks/run-'+randomUUID());
const run=promisify(execFile),artifacts={},commands=[];await mkdir(output,{recursive:true});
const relative=file=>path.relative(root,file).split(path.sep).join('/');
async function save(file,bytes){const target=path.join(output,file);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);artifacts[file]=calcHash(bytes);}
const saveJson=(file,value)=>save(file,Buffer.from(JSON.stringify(value,null,2)+'\n'));
let phase='saved-inputs',converterInvoked=false;
async function publish(details){const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'independent-calc-image-research-check',phase,converterInvoked,nativeToolInvoked:false,
  approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',artifacts,commands,...details},null,2)+'\n');
  await writeFile(path.join(output,'report.json'),bytes);console.log(JSON.stringify({completed:details.completed,phase,report:relative(path.join(output,'report.json')),sha256:calcHash(bytes)}));}
async function child(executable,args,name){
  const result=await run(executable,args,{cwd:root,windowsHide:true,timeout:60000,maxBuffer:2000000});await save(name+'-command.log',Buffer.from(result.stdout+result.stderr));
  commands.push({executable:executable===process.execPath?'node':executable,args,exitCode:0,log:name+'-command.log'});
  let handle;try{handle=JSON.parse(result.stdout.trim());}catch{const lines=result.stdout.trim().split(/\r?\n/);handle=JSON.parse(lines.at(-1));}
  assert.equal(handle.completed,true);assert.match(handle.report,/^artifacts\/[a-z-]+\/run-[a-f0-9-]+\/report\.json$/);
  const bytes=await readFile(path.join(root,handle.report));assert.equal(calcHash(bytes),handle.sha256);await save(name+'-report.json',bytes);return handle;
}
async function materialize(prefix,bytes,files){
  const report=JSON.parse(bytes);assert.equal(report.completed,true);assert.equal(report.phase,'complete');
  await save(prefix+'/report.json',bytes);
  for(const[file,digest]of Object.entries(report.artifacts)){assert.match(file,/^[a-zA-Z0-9_./-]+$/);assert.ok(!file.split('/').some(p=>!p||p==='.'||p==='..'));
    const b=files.get(file);assert.ok(b,'Missing bound input '+file);assert.equal(calcHash(b),digest);await save(prefix+'/'+file,b);}
  return relative(path.join(output,prefix,'report.json'));
}
await publish({completed:false});
try{
  for(const file of process.argv.slice(2))assert.ok(path.resolve(root,file).startsWith(path.join(root,'artifacts')+path.sep));
  const primary=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'calc-coordinate-rendering-research');
  const pdf=await loadCalcSavedReport(path.resolve(root,process.argv[3]),'calc-ordinary-pdf-rendering-research');
  await save('primary-input-report.json',primary.bytes);await save('pdf-input-report.json',pdf.bytes);
  const sourceHashes={};for(const file of ['check-calc-images.mjs','calc-saved-images.mjs','calc-png.mjs','calc-layout-evidence.mjs','shape-raster-metrics.mjs']){
    const key='tools/TikzVisual/'+file,b=await readFile(path.join(root,key));sourceHashes[key]=calcHash(b);await save('source-captures/'+key,b);}
  const cacheBytes=await readFile(path.join(root,'tests/Reference/CalcCoordinates/points.json')),cache=JSON.parse(cacheBytes);
  const pinBytes=await readFile(path.join(root,'tests/Reference/CalcCoordinates/pdf-pin.json')),pin=JSON.parse(pinBytes);
  await save('reference-points.json',cacheBytes);await save('reference-pdf-pin.json',pinBytes);
  assert.equal(pin.role,'native-calc-pdf-source-pin');assert.equal(pin.sourceSha256,cache.sourceSha256);
  assert.equal(pin.schemaVersion,1);assert.equal(calcHash(pdf.files.get('native/report.json')),pin.nativeReportSha256);
  assert.equal(calcHash(pdf.files.get('native/pdf-plain/case.pdf')),pin.pdfSha256);
  for(const scale of[1,4])assert.equal(calcHash(pdf.files.get('native/pdf-plain/page-'+scale+'x.png')),pin.rasterSha256[scale+'x']);
  for(const b of[primary,pdf])for(const[file,digest]of Object.entries(b.report.sourceHashes))assert.equal(calcHash(await readFile(path.join(root,file))),digest,'Saved renderer source differs: '+file);
  const nativeFiles=new Map([...pdf.files].filter(([file])=>file.startsWith('native/')).map(([file,b])=>[file.slice(7),b]));
  const decoded=readCalcLayoutEvidence(Object.fromEntries(nativeFiles),cache);calcEqual(decoded.measurements,pdf.json('native/report.json').measurements,'Native measurements differ');
  phase='fresh-public-conversion';converterInvoked=true;
  const freshHandle=await child('dotnet',['run','--project','tools/TikzReference','-c','Release','--no-restore','--','export-calc-coordinates'],'fresh-conversion');
  const freshExport=await loadCalcSavedReport(path.join(root,freshHandle.report),'calc-coordinate-candidate-export');
  for(const[b,prefix]of[[primary,'inputs/'],[pdf,'candidate/']]){
    for(const file of ['source.tikz','actual.svg','actual-scene.json','numeric.json','reference.svg'])assert.equal(calcHash(b.files.get(prefix+file)),calcHash(freshExport.files.get(file)),'Fresh public output differs: '+prefix+file);
    calcEqual(JSON.parse(b.files.get(prefix+'native-points.json')).points,cache.points,'Native anchor cache differs');
    calcEqual(JSON.parse(b.files.get(prefix+'candidate-source-hashes.json')),freshExport.json('candidate-source-hashes.json'),'Saved compiler sources differ');
  }
  phase='independent-png-metrics';
  const primaryMetrics=verifyCalcPrimaryPixels(primary);await saveJson('primary-decoded-metrics.json',primaryMetrics);
  const pdfMetrics=verifyCalcPdfPixels(pdf);await saveJson('pdf-decoded-metrics.json',pdfMetrics);
  phase='primary-source-recapture';
  const primaryFiles=new Map([...primary.files].filter(([f])=>f.startsWith('inputs/')).map(([f,b])=>[f.slice(7),b]));
  const primaryExport=await materialize('bound-primary-export',primary.files.get('inputs/export-report.json'),primaryFiles);
  const rerenderPrimaryHandle=await child(process.execPath,['tools/TikzVisual/inspect-calc-coordinates.mjs',primaryExport],'primary-recapture');
  const rerenderPrimary=await loadCalcSavedReport(path.join(root,rerenderPrimaryHandle.report),'calc-coordinate-rendering-research');
  const primaryOriginalArgument=primary.json('agent-inspection.json').rerun.arguments[1];
  const primaryReplay=verifyCalcRerender(primary,rerenderPrimary,{[primaryExport]:primaryOriginalArgument});await saveJson('primary-source-binding.json',primaryReplay);
  phase='pdf-source-recapture';
  const candidateFiles=new Map([...pdf.files].filter(([f])=>f.startsWith('candidate/')).map(([f,b])=>[f.slice(10),b]));
  const pdfExport=await materialize('bound-pdf-export',pdf.files.get('candidate/report.json'),candidateFiles);
  const nativeInput=await materialize('bound-native-layout',pdf.files.get('native/report.json'),nativeFiles);
  const rerenderPdfHandle=await child(process.execPath,['tools/TikzVisual/inspect-calc-pdf.mjs',pdfExport,nativeInput],'pdf-recapture');
  const rerenderPdf=await loadCalcSavedReport(path.join(root,rerenderPdfHandle.report),'calc-ordinary-pdf-rendering-research');
  const oldArguments=pdf.json('agent-inspection.json').rerun.arguments;
  const pdfReplay=verifyCalcRerender(pdf,rerenderPdf,{[pdfExport]:oldArguments[1],[nativeInput]:oldArguments[2]});await saveJson('pdf-source-binding.json',pdfReplay);
  for(const[file,digest]of Object.entries(sourceHashes))assert.equal(calcHash(await readFile(path.join(root,file))),digest);
  for(const[file,digest]of Object.entries(artifacts))assert.equal(calcHash(await readFile(path.join(output,file))),digest);
  phase='complete';await publish({completed:true,inputs:{primary:{file:process.argv[2],sha256:primary.sha256},pdf:{file:process.argv[3],sha256:pdf.sha256}},
    sourceHashes,freshConversion:freshHandle,primaryMetrics,pdfMetrics,primaryReplay,pdfReplay,
    remaining:['independent primary/PDF calibration','full image-only defect matrix','broader interactions','root integration']});
}catch(error){process.exitCode=1;await publish({completed:false,error:error.message.replaceAll(root,'<repo>').slice(0,2000)});console.error(error.stack);}
