import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {loadCalcSavedReport,calcHash} from './calc-saved-images.mjs';
import {calcTrialOwned,verifyCalcTrialPixels,verifyCalcTrialRecapture} from './calc-trial-saved.mjs';
import {readCalcTrialReference} from './calc-trial-reference.mjs';
import {evaluateCalcPrimary,calcPrimaryKey} from './calc-primary-policy.mjs';
import {evaluateCalcPdf} from './calc-pdf-policy.mjs';
import {decodeCalcPng,encodeCalcPng} from './calc-png.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
assert.equal(process.argv.length,3,'Usage: node tools/TikzVisual/calc-trial-self-test.mjs <completed-public-check/report.json>');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.join(root,'artifacts/calc-public-controls/run-'+randomUUID());
await mkdir(output,{recursive:true});const artifacts={},controls=[],compare=createShapeRasterMetrics().compare;
const relative=f=>path.relative(root,f).split(path.sep).join('/'),bytes=o=>Buffer.from(JSON.stringify(o,null,2)+'\n');
async function save(f,b){await mkdir(path.dirname(path.join(output,f)),{recursive:true});await writeFile(path.join(output,f),b);artifacts[f]=calcHash(b);}
async function publish(completed,error){const b=bytes({schemaVersion:1,role:'calc-public-trial-corruption-controls',completed,phase:completed?'complete':'controls',
  converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',input:process.argv[2],artifacts,controls,...(error?{error}:{})});
  await writeFile(path.join(output,'report.json'),b);console.log(JSON.stringify({completed,report:relative(path.join(output,'report.json')),sha256:calcHash(b)}));}
function clone(base){const b={...base,report:structuredClone(base.report),files:new Map(base.files),changed:new Set()};b.json=f=>JSON.parse(b.files.get(f));b.png=f=>decodeCalcPng(b.files.get(f));return b;}
function put(b,f,item){assert.ok(b.files.has(f));b.files.set(f,item);b.report.artifacts[f]=calcHash(item);b.changed.add(f);}
const putJson=(b,f,item)=>put(b,f,bytes(item));
function ownedPut(b,prefix,file,item){put(b,prefix+'/'+file,item);const report=b.json(prefix+'/report.json');report.artifacts[file]=calcHash(item);putJson(b,prefix+'/report.json',report);b.report.inputs[prefix].sha256=calcHash(b.files.get(prefix+'/report.json'));}
async function reject(name,b,operation,pattern,details={}){
  b.bytes=bytes(b.report);b.sha256=calcHash(b.bytes);for(const[f,digest]of Object.entries(b.report.artifacts??{}))assert.equal(calcHash(b.files.get(f)),digest);
  let failure;try{await operation(b);}catch(e){failure=e;}assert.ok(failure,'Control accepted: '+name);assert.match(failure.message,pattern,'Wrong rejection: '+name);
  await save('mutations/'+name+'/report.json',b.bytes);for(const f of b.changed)await save('mutations/'+name+'/'+f,b.files.get(f));
  controls.push({name,passed:true,hashesRecomputed:true,overlay:true,baseReport:relative(b.file),rejection:failure.message.slice(0,500),...details});console.log(JSON.stringify({control:name,passed:true}));
}
await publish(false);
try{
  const check=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'independent-calc-current-candidate-check');await save('input-check-report.json',check.bytes);
  const saved=await loadCalcSavedReport(path.join(root,check.report.input.file),'calc-current-candidate-trial');assert.equal(saved.sha256,check.report.input.sha256);
  const command=check.files.get('source-recapture-command.log').toString(),handle=JSON.parse(command.slice(command.lastIndexOf('{"completed":')).trim());
  const fresh=await loadCalcSavedReport(path.join(root,handle.report),'calc-current-candidate-trial');assert.equal(fresh.sha256,handle.sha256);
  const args=check.report.commands.find(c=>c.log==='source-recapture-command.log').arguments.slice(1);
  for(const f of ['calc-trial-self-test.mjs','calc-trial-saved.mjs','calc-trial-reference.mjs'])await save('source-captures/'+f,await readFile(path.join(root,'tools/TikzVisual',f)));
  const recap=b=>verifyCalcTrialRecapture(b,fresh,args);recap(saved);controls.push({name:'unchanged-owned-source-recapture',passed:true});
  const reference=readCalcTrialReference(calcTrialOwned(saved,'reference'));
  for(const row of saved.report.primary.map(i=>({...saved.json(i.file),...i}))){const e=evaluateCalcPrimary(JSON.parse(JSON.stringify(reference.primaryPolicy)),row);assert.equal(e.passed,true);assert.equal(e.checks.length,25);assert.ok(JSON.stringify(e).length<50000);}
  for(const row of saved.report.pdf.map(i=>({...saved.json(i.file),...i}))){const e=evaluateCalcPdf(JSON.parse(JSON.stringify(reference.pdfPolicy)),row);assert.equal(e.passed,true);assert.equal(e.checks.length,30);assert.ok(JSON.stringify(e).length<100000);}
  controls.push({name:'frozen-policy-json-and-compact-gates',passed:true,primaryViews:24,pdfViews:8});
  let b=clone(saved);delete b.report.artifacts;await reject('missing-artifact-manifest',b,verifyCalcTrialPixels,/Missing public artifact manifest/);
  b=clone(saved);b.report.completed=false;await reject('incomplete-trial',b,verifyCalcTrialPixels,/Expected values to be strictly equal/);
  b=clone(saved);b.report.primary.pop();await reject('missing-primary-view',b,verifyCalcTrialPixels,/Public view coverage differs/);
  b=clone(saved);b.report.primary[1]=structuredClone(b.report.primary[0]);await reject('duplicate-primary-view',b,verifyCalcTrialPixels,/Public view coverage differs/);
  b=clone(saved);b.report.pdf.pop();await reject('missing-pdf-view',b,verifyCalcTrialPixels,/Public view coverage differs/);
  b=clone(saved);let scene=b.json('candidate/actual-scene.json');scene.coordinates.a.x++;
  ownedPut(b,'candidate','actual-scene.json',bytes(scene));await reject('rehashed-candidate-anchor',b,verifyCalcTrialPixels,/Public native anchor differs/);
  b=clone(saved);const calibration=b.json('reference/pdfCalibration/report.json');calibration.policy.ink.rows[0].regions[0].limits[0].mass.min=0;
  ownedPut(b,'reference','pdfCalibration/report.json',bytes(calibration));await reject('rehashed-native-policy',b,verifyCalcTrialPixels,/Frozen native research pin differs: pdfCalibration/);
  b=clone(saved);const frame=b.json('reference/primaryCalibration/native-frame.json');frame.camera.x++;
  ownedPut(b,'reference','primaryCalibration/native-frame.json',bytes(frame));await reject('rehashed-native-camera',b,verifyCalcTrialPixels,/Frozen native projection differs/);
  const first=saved.report.primary[0].file;b=clone(saved);let row=b.json(first);row.metrics.rawChangedPixels++;putJson(b,first,row);
  await reject('false-primary-pixel-count',b,verifyCalcTrialPixels,/Independent public PNG metrics differ/);
  b=clone(saved);row=b.json(first);row.actualRepeat.exactRgbaMatch=false;putJson(b,first,row);
  await reject('contradictory-primary-repeat',b,verifyCalcTrialPixels,/Independent public PNG metrics differ/);
  b=clone(saved);row=b.json(first);const png=b.png(row.images.actual);png.rgba[0]=255;png.rgba[3]=255;put(b,row.images.actual,encodeCalcPng(png.width,png.height,png.rgba));
  await reject('rehashed-changed-primary-png',b,verifyCalcTrialPixels,/Independent public PNG metrics differ/);
  for(const quantity of ['mass','x','y']){b=clone(saved);const file=b.report.pdf[0].file;row=b.json(file);row.ink[0].actual[0][quantity]++;putJson(b,file,row);
    await reject('false-pdf-ink-'+quantity,b,verifyCalcTrialPixels,/Independent public RGB ink\/moments differ/);}
  b=clone(saved);b.report.defects.pop();await reject('missing-defect-family',b,verifyCalcTrialPixels,/Public defect family coverage differs/);
  b=clone(saved);b.report.gates.primary.views=0;await reject('false-combined-gate-summary',b,recap,/Public trial report differs after declared path normalization/);
  b=clone(saved);const agent=b.json('agent-inspection.json');agent.attribution[0].intended.source.offset++;putJson(b,'agent-inspection.json',agent);
  await reject('false-agent-source-attribution',b,recap,/Public trial source reconstruction differs: agent-inspection.json/);

  b=clone(saved);const target=b.report.primary.find(i=>i.capture==='intrinsic-image'&&i.frame==='expanded'&&i.scale===4&&i.background==='white');
  const base=b.json(target.file);assert.notEqual(b.report.artifacts[base.images.actual],b.report.artifacts[base.images.reference]);
  const repeated=b.report.primaryReplay.find(i=>calcPrimaryKey(i)===calcPrimaryKey(target));
  const hidden=b.report.defects.find(d=>d.name==='cropped-root').primary.find(i=>calcPrimaryKey(i)===calcPrimaryKey(target));
  for(const i of [target,repeated,hidden]){const r=b.json(i.file);put(b,r.images.actual,Buffer.from(b.files.get(base.images.reference)));
    const a=b.png(r.images.reference),actual=b.png(r.images.actual),options={width:a.width,height:a.height,scale:r.scale,background:r.background,maskThreshold:16};
    r.metrics=compare(a.rgba,actual.rgba,options);r.repeat=compare(a.rgba,a.rgba,options);r.actualRepeat=compare(actual.rgba,actual.rgba,options);
    for(const region of r.regions)Object.assign(region,compare(a.rgba,actual.rgba,{...options,
      rectangle:Object.fromEntries(Object.entries(region.rectangle).map(([k,v])=>[k,v*r.scale]))}));
    if(r.evaluation)r.evaluation=evaluateCalcPrimary(reference.primaryPolicy,r);putJson(b,i.file,r);}
  verifyCalcTrialPixels(b);
  await reject('rehashed-primary-png-metrics-verdicts',b,recap,/Public trial source reconstruction differs/,
    {independentDecodedMetricsAccepted:true,forgery:'Public actual PNG replaced by native reference; matching replay and hidden cropped-root PNGs, affected whole/region metrics and verdicts recomputed. Native policy unchanged.'});
  assert.equal(controls.length,20);
  for(const[f,digest]of Object.entries(artifacts))assert.equal(calcHash(await readFile(path.join(output,f))),digest);await publish(true);
}catch(error){process.exitCode=1;await publish(false,error.message.slice(0,2000));console.error(error.stack);}
