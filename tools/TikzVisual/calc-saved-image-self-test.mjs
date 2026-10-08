// Actual saved-image verifiers, including internally consistent pixel/metric forgeries.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {loadCalcSavedReport,verifyCalcPrimaryPixels,verifyCalcPdfPixels,verifyCalcRerender,calcHash,calcEqual} from './calc-saved-images.mjs';
import {decodeCalcPng,encodeCalcPng} from './calc-png.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';

assert.equal(process.argv.length,3,'Usage: node tools/TikzVisual/calc-saved-image-self-test.mjs <completed-image-check/report.json>');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.join(root,'artifacts/calc-image-controls/run-'+randomUUID());
await mkdir(output,{recursive:true});
const artifacts={},controls=[],compare=createShapeRasterMetrics().compare;
const relative=file=>path.relative(root,file).split(path.sep).join('/');
const jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
async function save(file,bytes){
  await mkdir(path.dirname(path.join(output,file)),{recursive:true});
  await writeFile(path.join(output,file),bytes);artifacts[file]=calcHash(bytes);
}
async function publish(completed,error){
  const bytes=jsonBytes({schemaVersion:1,role:'calc-saved-image-corruption-controls',completed,phase:completed?'complete':'controls',
    approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',input:process.argv[2],artifacts,controls,...(error?{error}: {})});
  await writeFile(path.join(output,'report.json'),bytes);
  console.log(JSON.stringify({completed,report:relative(path.join(output,'report.json')),sha256:calcHash(bytes)}));
}
function clone(bundle){
  const result={...bundle,report:structuredClone(bundle.report),files:new Map(bundle.files),changed:new Set()};
  result.json=file=>JSON.parse(result.files.get(file).toString());
  result.png=file=>decodeCalcPng(result.files.get(file));
  return result;
}
function put(bundle,file,bytes){
  assert.ok(bundle.files.has(file),'Mutation must alter an existing artifact');
  bundle.files.set(file,bytes);bundle.report.artifacts[file]=calcHash(bytes);bundle.changed.add(file);
}
const putJson=(bundle,file,value)=>put(bundle,file,jsonBytes(value));
function refresh(bundle){bundle.bytes=jsonBytes(bundle.report);bundle.sha256=calcHash(bundle.bytes);}
async function reject(name,bundle,operation,expected,details={}){
  refresh(bundle);
  for(const[file,digest]of Object.entries(bundle.report.artifacts))assert.equal(calcHash(bundle.files.get(file)),digest,'Control artifact is not fully rehashed');
  let failure;try{await operation(bundle);}catch(error){failure=error;}
  assert.ok(failure,'Control unexpectedly accepted: '+name);assert.match(failure.message,expected,'Wrong rejection for '+name);
  await save('mutations/'+name+'/report.json',bundle.bytes);
  for(const file of bundle.changed)await save('mutations/'+name+'/'+file,bundle.files.get(file));
  controls.push({name,passed:true,rejection:failure.message.slice(0,500),baseReport:{file:relative(bundle.file),sha256:calcHash(await readFile(bundle.file))},
    changedArtifacts:[...bundle.changed],overlay:true,hashesRecomputed:true,...details});
}
function recomputePrimary(bundle,file){
  const record=bundle.json(file),a=bundle.png(record.images.reference),b=bundle.png(record.images.actual);
  const options={width:a.width,height:a.height,scale:record.scale,background:record.background,maskThreshold:16};
  record.metrics=compare(a.rgba,b.rgba,options);
  for(const region of record.regions)Object.assign(region,compare(a.rgba,b.rgba,{...options,
    rectangle:Object.fromEntries(Object.entries(region.rectangle).map(([k,v])=>[k,v*record.scale]))}));
  putJson(bundle,file,record);bundle.report.records.find(r=>r.file===file).metrics=record.metrics;
  bundle.report.observations.exactPrimaryViews=bundle.report.records.filter(r=>r.metrics.exactRgbaMatch).length;
  bundle.report.observations.maximumChangedPixels=Math.max(...bundle.report.records.map(r=>r.metrics.rawChangedPixels));
}
function recomputePdf(bundle,file){
  const record=bundle.json(file),a=bundle.png(record.images.pdf),b=bundle.png(record.images.svg);
  const options={width:a.width,height:a.height,scale:record.scale,background:'white',maskThreshold:16};
  const whole=compare(a.rgba,b.rgba,options);Object.assign(record.whole,whole);
  record.fullPage={exactRgbaMatch:whole.exactRgbaMatch,rawChangedPixels:whole.rawChangedPixels,maxRawChannelError:whole.maxRawChannelError};
  for(const region of record.regions)Object.assign(region,compare(a.rgba,b.rgba,{...options,rectangle:region.rasterRectangles[record.scale+'x']}));
  putJson(bundle,file,record);Object.assign(bundle.report.records.find(r=>r.file===file),{whole:record.whole,fullPage:record.fullPage});
  for(const parity of bundle.report.routeParity){
    const prefix=parity.frame+'/'+parity.scale+'x/svg-page.png';
    const left=bundle.png('views/original-svg/'+prefix),right=bundle.png('views/candidate-svg/'+prefix);
    parity.observed=compare(left.rgba,right.rgba,{width:left.width,height:left.height,scale:parity.scale,background:'white',maskThreshold:16});
  }
}

await publish(false);
try{
  const check=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'independent-calc-image-research-check');
  await save('input-check-report.json',check.bytes);
  for(const file of ['calc-saved-images.mjs','calc-png.mjs','shape-raster-metrics.mjs']){
    const key='tools/TikzVisual/'+file,bytes=await readFile(path.join(root,key));
    assert.equal(calcHash(bytes),check.report.sourceHashes[key],'Checker algorithm changed; rerun image checker first');
    await save('source-captures/'+key,bytes);
  }
  await save('source-captures/tools/TikzVisual/calc-saved-image-self-test.mjs',await readFile(fileURLToPath(import.meta.url)));
  const primary=await loadCalcSavedReport(path.join(root,check.report.inputs.primary.file),'calc-coordinate-rendering-research');
  const pdf=await loadCalcSavedReport(path.join(root,check.report.inputs.pdf.file),'calc-ordinary-pdf-rendering-research');
  assert.equal(primary.sha256,check.report.inputs.primary.sha256);assert.equal(pdf.sha256,check.report.inputs.pdf.sha256);
  async function recaptured(name,role){
    const handle=JSON.parse(check.files.get(name+'-command.log').toString().trim().split(/\r?\n/).at(-1));
    assert.equal(handle.completed,true);const bundle=await loadCalcSavedReport(path.join(root,handle.report),role);
    assert.equal(bundle.sha256,handle.sha256);assert.equal(bundle.sha256,calcHash(check.files.get(name+'-report.json')));return bundle;
  }
  const primaryFresh=await recaptured('primary-recapture','calc-coordinate-rendering-research');
  const pdfFresh=await recaptured('pdf-recapture','calc-ordinary-pdf-rendering-research');
  const primaryArgs=check.report.commands.find(c=>c.log==='primary-recapture-command.log').args;
  const pdfArgs=check.report.commands.find(c=>c.log==='pdf-recapture-command.log').args;
  const primaryAliases={[primaryArgs[1]]:primary.json('agent-inspection.json').rerun.arguments[1]};
  const oldPdfArgs=pdf.json('agent-inspection.json').rerun.arguments;
  const pdfAliases={[pdfArgs[1]]:oldPdfArgs[1],[pdfArgs[2]]:oldPdfArgs[2]};
  calcEqual(verifyCalcPrimaryPixels(primary),check.report.primaryMetrics,'Baseline primary metrics differ');
  calcEqual(verifyCalcPdfPixels(pdf),check.report.pdfMetrics,'Baseline PDF metrics differ');
  verifyCalcRerender(primary,primaryFresh,primaryAliases);verifyCalcRerender(pdf,pdfFresh,pdfAliases);
  controls.push({name:'unchanged-primary-and-pdf',passed:true,decodedMetrics:true,sourceBinding:true});

  const first=primary.report.records[0].file;
  let mutant=clone(primary),record=mutant.json(first);record.regions.pop();putJson(mutant,first,record);
  await reject('missing-primary-region',mutant,verifyCalcPrimaryPixels,/23 !== 24/);
  mutant=clone(primary);mutant.report.records[1].file=first;
  await reject('duplicate-primary-view',mutant,verifyCalcPrimaryPixels,/Primary view coverage differs/);
  mutant=clone(primary);record=mutant.json(first);record.metrics.rawChangedPixels++;
  mutant.report.records[0].metrics.rawChangedPixels++;putJson(mutant,first,record);
  await reject('false-primary-pixels',mutant,verifyCalcPrimaryPixels,/Decoded PNG metrics differ/);
  mutant=clone(primary);mutant.report.observations.exactPrimaryViews++;
  await reject('false-primary-summary',mutant,verifyCalcPrimaryPixels,/Expected values to be strictly equal/);
  mutant=clone(primary);record=mutant.json(first);
  const decoded=mutant.png(record.images.actual);let transparent=-1;
  for(let i=0;i<decoded.rgba.length;i+=4)if(decoded.rgba[i+3]===0){transparent=i;break;}
  assert.ok(transparent>=0);decoded.rgba[transparent]^=255;
  put(mutant,record.images.actual,encodeCalcPng(decoded.width,decoded.height,decoded.rgba));
  await reject('hidden-transparent-rgb',mutant,verifyCalcPrimaryPixels,/Decoded PNG metrics differ/,{alpha:0,changedRgbSample:transparent});

  mutant=clone(primary);const nonexact=mutant.report.records.find(r=>!r.metrics.exactRgbaMatch);assert.ok(nonexact);
  record=mutant.json(nonexact.file);assert.notEqual(calcHash(mutant.files.get(record.images.actual)),calcHash(mutant.files.get(record.images.reference)));
  put(mutant,record.images.actual,Buffer.from(mutant.files.get(record.images.reference)));recomputePrimary(mutant,nonexact.file);
  verifyCalcPrimaryPixels(mutant);
  await reject('rehashed-primary-png-and-metrics',mutant,b=>verifyCalcRerender(b,primaryFresh,primaryAliases),/Source\/image reconstruction differs/,
    {independentDecodedMetricsAccepted:true,forgery:'actual PNG replaced with reference; all affected numeric pixel/region metrics and report summaries recomputed'});
  mutant=clone(primary);const camera=mutant.json('native-frame.json');camera.rawFrame.origin.x+=1;putJson(mutant,'native-frame.json',camera);
  await reject('rehashed-primary-camera',mutant,b=>verifyCalcRerender(b,primaryFresh,primaryAliases),/Source\/image reconstruction differs: native-frame.json/);
  mutant=clone(primary);const svgFile='inputs/actual.svg',svg=mutant.files.get(svgFile).toString();
  assert.match(svg,/<svg\b/);put(mutant,svgFile,Buffer.from(svg.replace('<svg','<svg data-forged="true"')));
  await reject('rehashed-primary-svg',mutant,b=>verifyCalcRerender(b,primaryFresh,primaryAliases),/Source\/image reconstruction differs: inputs\/actual.svg/);

  const firstPdf=pdf.report.records[0].file;
  mutant=clone(pdf);record=mutant.json(firstPdf);record.whole.rawChangedPixels++;putJson(mutant,firstPdf,record);
  mutant.report.records[0].whole.rawChangedPixels++;
  await reject('false-pdf-pixels',mutant,verifyCalcPdfPixels,/Decoded PNG metrics differ/);
  mutant=clone(pdf);mutant.report.records[1].file=firstPdf;
  await reject('duplicate-pdf-view',mutant,verifyCalcPdfPixels,/PDF view coverage differs/);
  mutant=clone(pdf);record=mutant.json(firstPdf);record.regions.pop();putJson(mutant,firstPdf,record);
  await reject('missing-pdf-region',mutant,verifyCalcPdfPixels,/24 !== 25/);
  mutant=clone(pdf);record=mutant.json(firstPdf);
  const pdfBytes=Buffer.from(mutant.files.get(record.images.pdf));
  assert.notEqual(calcHash(pdfBytes),calcHash(mutant.files.get(record.images.svg)));
  put(mutant,record.images.svg,pdfBytes);put(mutant,record.images['svg-page'],pdfBytes);recomputePdf(mutant,firstPdf);
  verifyCalcPdfPixels(mutant);
  await reject('rehashed-pdf-png-and-metrics',mutant,b=>verifyCalcRerender(b,pdfFresh,pdfAliases),/Source\/image reconstruction differs/,
    {independentDecodedMetricsAccepted:true,forgery:'original-SVG page PNGs replaced with native PDF page; pixel/region metrics and route parity recomputed'});

  for(const[name,mutate]of[
    ['incomplete-report',r=>{r.completed=false;}],['wrong-report-role',r=>{r.role='unrelated';}],
    ['unapproved-image-claim',r=>{r.imageConformanceClaim=true;}],['unsafe-artifact-path',r=>{r.artifacts={'../outside.png':'0'.repeat(64)};}]
  ]){
    const report=structuredClone(primary.report);mutate(report);const file='loader/'+name+'/report.json';await save(file,jsonBytes(report));
    let error;try{await loadCalcSavedReport(path.join(output,file),'calc-coordinate-rendering-research');}catch(e){error=e;}
    assert.ok(error&&error.code==='ERR_ASSERTION','Expected actual schema/path loader rejection: '+name);
    controls.push({name,passed:true,actualLoader:true,rejection:error.message.slice(0,500)});
  }
  assert.equal(controls.length,17);
  for(const[file,digest]of Object.entries(artifacts))assert.equal(calcHash(await readFile(path.join(output,file))),digest);
  await publish(true);
}catch(error){process.exitCode=1;await publish(false,error.message.slice(0,2000));console.error(error.stack);}
