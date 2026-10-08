import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {loadCalcSavedReport,calcHash} from './calc-saved-images.mjs';
import {verifyCalcPdfCalibrationPixels,verifyCalcPdfCalibrationRecapture} from './calc-pdf-saved.mjs';
import {calcPdfKey,calcPdfInk,deriveCalcPdfPolicy,evaluateCalcPdf} from './calc-pdf-policy.mjs';
import {decodeCalcPng,encodeCalcPng} from './calc-png.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';

assert.equal(process.argv.length,3,'Usage: node tools/TikzVisual/calc-pdf-self-test.mjs <completed-pdf-check/report.json>');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.join(root,'artifacts/calc-pdf-controls/run-'+randomUUID());
await mkdir(output,{recursive:true});const artifacts={},controls=[],compare=createShapeRasterMetrics().compare;
const relative=file=>path.relative(root,file).split(path.sep).join('/'),bytes=o=>Buffer.from(JSON.stringify(o,null,2)+'\n');
async function save(file,b){await mkdir(path.dirname(path.join(output,file)),{recursive:true});await writeFile(path.join(output,file),b);artifacts[file]=calcHash(b);}
async function publish(completed,error){const b=bytes({schemaVersion:1,role:'calc-native-pdf-corruption-controls',completed,phase:completed?'complete':'controls',
  converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',input:process.argv[2],artifacts,controls,...(error?{error}:{})});
  await writeFile(path.join(output,'report.json'),b);console.log(JSON.stringify({completed,report:relative(path.join(output,'report.json')),sha256:calcHash(b)}));}
function clone(base){const b={...base,report:structuredClone(base.report),files:new Map(base.files),changed:new Set()};
  b.json=file=>JSON.parse(b.files.get(file).toString());b.png=file=>decodeCalcPng(b.files.get(file));return b;}
function put(b,file,item){assert.ok(b.files.has(file));b.files.set(file,item);b.report.artifacts[file]=calcHash(item);b.changed.add(file);}
const putJson=(b,file,o)=>put(b,file,bytes(o));
async function reject(name,b,operation,pattern,details={}){
  b.bytes=bytes(b.report);b.sha256=calcHash(b.bytes);
  for(const[file,digest]of Object.entries(b.report.artifacts))assert.equal(calcHash(b.files.get(file)),digest);
  let failure;try{await operation(b);}catch(e){failure=e;}
  assert.ok(failure,'Control accepted: '+name);assert.match(failure.message,pattern,'Wrong rejection: '+name);
  await save('mutations/'+name+'/report.json',b.bytes);for(const file of b.changed)await save('mutations/'+name+'/'+file,b.files.get(file));
  controls.push({name,passed:true,overlay:true,hashesRecomputed:true,baseReport:relative(b.file),rejection:failure.message.slice(0,500),...details});
  console.log(JSON.stringify({control:name,passed:true}));
}
function recompute(b,file){
  const row=b.json(file),reference=b.png(row.images.pdf),actual=b.png(row.images['svg-page']);
  const options={width:reference.width,height:reference.height,scale:row.scale,background:'white',maskThreshold:16},whole=compare(reference.rgba,actual.rgba,options);
  Object.assign(row.whole,whole);for(const r of row.regions)Object.assign(r,compare(reference.rgba,actual.rgba,{...options,rectangle:r.rasterRectangles[row.scale+'x']}));
  row.fullPage={exactRgbaMatch:whole.exactRgbaMatch,rawChangedPixels:whole.rawChangedPixels,maxRawChannelError:whole.maxRawChannelError};
  row.ink=calcPdfInk(reference.rgba,actual.rgba,reference.width,b.json('registration.json').regions,row.scale);putJson(b,file,row);
}
await publish(false);
try{
  const check=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'independent-native-calc-pdf-check');await save('input-check-report.json',check.bytes);
  const saved=await loadCalcSavedReport(path.join(root,check.report.input.file),'native-calc-pdf-calibration');assert.equal(saved.sha256,check.report.input.sha256);
  const handle=JSON.parse(check.files.get('recapture-command.log').toString().trim().split(/\r?\n/).at(-1));
  const fresh=await loadCalcSavedReport(path.join(root,handle.report),'native-calc-pdf-calibration');assert.equal(fresh.sha256,handle.sha256);
  for(const file of ['calc-pdf-saved.mjs','calc-pdf-policy.mjs','calc-pdf-self-test.mjs'])await save('source-captures/'+file,await readFile(path.join(root,'tools/TikzVisual',file)));
  verifyCalcPdfCalibrationRecapture(saved,fresh,fresh.report.input.file);controls.push({name:'unchanged-source-recapture',passed:true});
  const toyRegions=[{id:'whole-picture',rasterRectangles:{'1x':{x:0,y:0,width:4,height:4}}}],toy=[];
  for(const [x,y]of [[1,1],[2,1],[1,2]]){const rgba=new Uint8Array(4*4*4).fill(255);for(let c=0;c<3;c++)rgba[(y*4+x)*4+c]=254;
    toy.push(calcPdfInk(rgba,rgba,4,toyRegions,1)[0].actual);}
  assert.deepEqual(toy,[[{mass:1,x:1,y:1},{mass:1,x:1,y:1},{mass:1,x:1,y:1}],
    [{mass:1,x:2,y:1},{mass:1,x:2,y:1},{mass:1,x:2,y:1}],[{mass:1,x:1,y:2},{mass:1,x:1,y:2},{mass:1,x:1,y:2}]]);
  controls.push({name:'equal-mass-axis-shifts-below-edge-threshold',passed:true,inkPerChannel:1});
  const nativeRows=saved.report.records.map(r=>({...saved.json(r.file),...r})),registration=saved.json('registration.json');
  const policy=deriveCalcPdfPolicy(nativeRows,registration.camera,registration.regions),restored=JSON.parse(JSON.stringify(policy));
  assert.deepEqual(policy,restored,'PDF policy loses fields through JSON');
  for(const row of nativeRows){const evaluation=evaluateCalcPdf(restored,row);assert.equal(evaluation.passed,true);
    for(const gate of evaluation.checks)assert.deepEqual(Object.keys(gate).sort(),['background','frame','id','metrics','passed','scale']);
    assert.ok(JSON.stringify(evaluation).length<100000,'PDF gate embeds whole captures');}
  controls.push({name:'policy-json-and-compact-gates',passed:true,views:16,gates:480});
  let mutant=clone(saved);mutant.report.records.pop();
  await reject('missing-native-view',mutant,verifyCalcPdfCalibrationPixels,/PDF native calibration coverage differs/);
  mutant=clone(saved);mutant.report.records[1]=structuredClone(mutant.report.records[0]);
  await reject('duplicate-native-view',mutant,verifyCalcPdfCalibrationPixels,/PDF native calibration coverage differs/);
  mutant=clone(saved);mutant.report.converterInvoked=true;
  await reject('candidate-fed-calibration',mutant,verifyCalcPdfCalibrationPixels,/Expected values to be strictly equal/);
  const first=saved.report.records[0].file;
  mutant=clone(saved);let row=mutant.json(first);row.regions[0].rectangle.x++;putJson(mutant,first,row);
  await reject('changed-native-region',mutant,verifyCalcPdfCalibrationPixels,/PDF region coverage or camera differs/);
  mutant=clone(saved);row=mutant.json(first);row.whole.rawChangedPixels++;putJson(mutant,first,row);
  await reject('false-native-pixel-metric',mutant,verifyCalcPdfCalibrationPixels,/Independent PDF PNG metrics differ/);
  for(const quantity of ['mass','x','y']){
    mutant=clone(saved);row=mutant.json(first);row.ink[0].actual[0][quantity]++;putJson(mutant,first,row);
    await reject('false-native-ink-'+quantity,mutant,verifyCalcPdfCalibrationPixels,/Independent PDF RGB ink\/moments differ/);
  }
  mutant=clone(saved);row=mutant.json(first);const png=mutant.png(row.images.svg);png.rgba[0]=0;png.rgba[3]=255;
  const changedPng=encodeCalcPng(png.width,png.height,png.rgba);put(mutant,row.images.svg,changedPng);put(mutant,row.images['svg-page'],changedPng);
  await reject('rehashed-changed-native-png',mutant,verifyCalcPdfCalibrationPixels,/Independent PDF PNG metrics differ/);
  mutant=clone(saved);const weakened=mutant.json('trial-policy.json');weakened.ink.rows[0].regions[0].limits[0].mass.min=0;
  mutant.report.policy=weakened;putJson(mutant,'trial-policy.json',weakened);
  await reject('rehashed-weakened-ink-policy',mutant,b=>verifyCalcPdfCalibrationRecapture(b,fresh,fresh.report.input.file),/PDF calibration source reconstruction differs: trial-policy.json/);
  mutant=clone(saved);const camera=mutant.json('registration.json');camera.camera.origin.x++;putJson(mutant,'registration.json',camera);
  await reject('rehashed-changed-camera',mutant,verifyCalcPdfCalibrationPixels,/PDF native camera differs/);
  mutant=clone(saved);const defectFile=mutant.report.defects[0].comparisons[0].file;row=mutant.json(defectFile);row.evaluation.passed=true;putJson(mutant,defectFile,row);
  await reject('false-defect-summary',mutant,b=>verifyCalcPdfCalibrationRecapture(b,fresh,fresh.report.input.file),/PDF calibration source reconstruction differs/);

  // Substitute PDF samples for a native SVG page, update both repeats and all
  // affected metrics, envelopes and defect verdicts, then prove the reader accepts.
  mutant=clone(saved);
  const substituted=mutant.report.records.find(r=>r.route==='original-driver'&&r.frame==='natural'&&r.scale===4);
  const target=mutant.json(substituted.file);
  assert.notEqual(mutant.report.artifacts[target.images.pdf],mutant.report.artifacts[target.images.svg],'Substitution must change actual pixels');
  const replay=mutant.report.replays.find(r=>r.route===substituted.route&&calcPdfKey(r)===calcPdfKey(substituted));
  for(const index of [substituted,replay]){const r=mutant.json(index.file);
    for(const key of ['svg','svg-page'])put(mutant,r.images[key],Buffer.from(mutant.files.get(target.images.pdf)));recompute(mutant,index.file);}
  mutant.report.policy=deriveCalcPdfPolicy(mutant.report.records.map(r=>({...mutant.json(r.file),...r})),registration.camera,registration.regions);
  putJson(mutant,'trial-policy.json',mutant.report.policy);
  for(const defect of mutant.report.defects)for(const index of defect.comparisons){const r=mutant.json(index.file);r.evaluation=evaluateCalcPdf(mutant.report.policy,r);putJson(mutant,index.file,r);}
  verifyCalcPdfCalibrationPixels(mutant);
  await reject('rehashed-native-png-metrics-policy',mutant,b=>verifyCalcPdfCalibrationRecapture(b,fresh,fresh.report.input.file),/PDF calibration source reconstruction differs/,
    {independentDecodedMetricsAccepted:true,forgery:'Native actual SVG page replaced by PDF samples; replay PNGs, pixel/region/ink metrics, policy and defect evaluations recomputed'});
  assert.equal(controls.length,16);
  for(const[file,digest]of Object.entries(artifacts))assert.equal(calcHash(await readFile(path.join(output,file))),digest);
  await publish(true);
}catch(error){process.exitCode=1;await publish(false,error.message.slice(0,2000));console.error(error.stack);}
