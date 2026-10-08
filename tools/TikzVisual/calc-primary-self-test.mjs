import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {loadCalcSavedReport,calcHash} from './calc-saved-images.mjs';
import {verifyCalcCalibrationPixels,verifyCalcCalibrationRecapture} from './calc-primary-saved.mjs';
import {deriveCalcPrimaryPolicy,evaluateCalcPrimary} from './calc-primary-policy.mjs';
import {decodeCalcPng,encodeCalcPng} from './calc-png.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';

assert.equal(process.argv.length,3,'Usage: node tools/TikzVisual/calc-primary-self-test.mjs <completed-primary-check/report.json>');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.join(root,'artifacts/calc-primary-controls/run-'+randomUUID());
await mkdir(output,{recursive:true});const artifacts={},controls=[],compare=createShapeRasterMetrics().compare;
const relative=file=>path.relative(root,file).split(path.sep).join('/'),bytes=o=>Buffer.from(JSON.stringify(o,null,2)+'\n');
async function save(file,b){await mkdir(path.dirname(path.join(output,file)),{recursive:true});await writeFile(path.join(output,file),b);artifacts[file]=calcHash(b);}
async function publish(completed,error){const b=bytes({schemaVersion:1,role:'calc-native-primary-corruption-controls',completed,phase:completed?'complete':'controls',
  approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',input:process.argv[2],artifacts,controls,...(error?{error}:{})});
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
}
await publish(false);
try{
  const check=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'independent-native-calc-primary-check');await save('input-check-report.json',check.bytes);
  const saved=await loadCalcSavedReport(path.join(root,check.report.input.file),'native-calc-primary-calibration');assert.equal(saved.sha256,check.report.input.sha256);
  const handle=JSON.parse(check.files.get('recapture-command.log').toString().trim().split(/\r?\n/).at(-1));
  const fresh=await loadCalcSavedReport(path.join(root,handle.report),'native-calc-primary-calibration');assert.equal(fresh.sha256,handle.sha256);
  for(const file of ['calc-primary-saved.mjs','calc-primary-policy.mjs','calc-primary-self-test.mjs'])await save('source-captures/'+file,await readFile(path.join(root,'tools/TikzVisual',file)));
  verifyCalcCalibrationRecapture(saved,fresh,fresh.report.input.file);controls.push({name:'unchanged-source-recapture',passed:true});
  const nativeRows=saved.report.records.map(r=>({...saved.json(r.file),...r})),nativePolicy=deriveCalcPrimaryPolicy(nativeRows),restored=JSON.parse(JSON.stringify(nativePolicy));
  assert.deepEqual(nativePolicy,restored,'Policy loses fields through JSON');
  for(const row of nativeRows){const evaluation=evaluateCalcPrimary(restored,row);assert.equal(evaluation.passed,true);
    for(const gate of evaluation.checks)assert.deepEqual(Object.keys(gate).sort(),['background','frame','id','metrics','passed','scale']);
    assert.ok(JSON.stringify(evaluation).length<50000,'Gate summary embeds whole captures');}
  controls.push({name:'policy-json-and-compact-gates',passed:true,views:72,gates:1800});
  let mutant=clone(saved);mutant.report.records.pop();
  await reject('missing-native-view',mutant,verifyCalcCalibrationPixels,/Native calibration coverage differs/);
  mutant=clone(saved);mutant.report.records[1]=structuredClone(mutant.report.records[0]);
  await reject('duplicate-native-view',mutant,verifyCalcCalibrationPixels,/Native calibration coverage differs/);
  mutant=clone(saved);mutant.report.converterInvoked=true;
  await reject('candidate-fed-calibration',mutant,verifyCalcCalibrationPixels,/Expected values to be strictly equal/);
  const first=saved.report.records[0].file;
  mutant=clone(saved);let record=mutant.json(first);record.regions[0].rectangle.x++;putJson(mutant,first,record);
  await reject('changed-native-region',mutant,verifyCalcCalibrationPixels,/Calibration region coverage or camera differs/);
  mutant=clone(saved);record=mutant.json(first);record.metrics.rawChangedPixels++;putJson(mutant,first,record);
  await reject('false-native-pixel-metric',mutant,verifyCalcCalibrationPixels,/Independent calibration PNG metrics differ/);
  mutant=clone(saved);record=mutant.json(first);const png=mutant.png(record.images.actual);
  png.rgba[0]^=255;png.rgba[3]=255;put(mutant,record.images.actual,encodeCalcPng(png.width,png.height,png.rgba));
  await reject('rehashed-changed-native-png',mutant,verifyCalcCalibrationPixels,/Independent calibration PNG metrics differ/);
  mutant=clone(saved);const changedPolicy=mutant.json('trial-policy.json');changedPolicy.policies[0].policy.rows[0].whole.maxRawChannelError++;
  mutant.report.policy=changedPolicy;putJson(mutant,'trial-policy.json',changedPolicy);
  await reject('rehashed-weakened-policy',mutant,b=>verifyCalcCalibrationRecapture(b,fresh,fresh.report.input.file),/Native calibration source reconstruction differs: trial-policy.json/);
  mutant=clone(saved);const nativeFrame=mutant.json('native-frame.json');nativeFrame.camera.x++;putJson(mutant,'native-frame.json',nativeFrame);
  await reject('rehashed-changed-camera',mutant,b=>verifyCalcCalibrationRecapture(b,fresh,fresh.report.input.file),/Native calibration source reconstruction differs: native-frame.json/);

  mutant=clone(saved);const nonexact=mutant.report.records.find(r=>!mutant.json(r.file).metrics.exactRgbaMatch);assert.ok(nonexact);
  record=mutant.json(nonexact.file);put(mutant,record.images.actual,Buffer.from(mutant.files.get(record.images.reference)));
  const reference=mutant.png(record.images.reference),actual=mutant.png(record.images.actual),options={width:reference.width,height:reference.height,scale:record.scale,background:record.background,maskThreshold:16};
  record.metrics=compare(reference.rgba,actual.rgba,options);
  for(const region of record.regions)Object.assign(region,compare(reference.rgba,actual.rgba,{...options,rectangle:Object.fromEntries(Object.entries(region.rectangle).map(([k,v])=>[k,v*record.scale]))}));
  putJson(mutant,nonexact.file,record);
  mutant.report.policy=deriveCalcPrimaryPolicy(mutant.report.records.map(r=>({...mutant.json(r.file),...r})));putJson(mutant,'trial-policy.json',mutant.report.policy);
  for(const defect of mutant.report.defects)for(const row of defect.comparisons){const r=mutant.json(row.file);r.evaluation=evaluateCalcPrimary(mutant.report.policy,r);putJson(mutant,row.file,r);}
  verifyCalcCalibrationPixels(mutant);
  await reject('rehashed-native-png-metrics-policy',mutant,b=>verifyCalcCalibrationRecapture(b,fresh,fresh.report.input.file),/Native calibration source reconstruction differs/,
    {independentDecodedMetricsAccepted:true,forgery:'Native actual PNG replaced with reference; affected pixel/region metrics, policy and defect evaluations recomputed'});
  assert.equal(controls.length,11);
  for(const[file,digest]of Object.entries(artifacts))assert.equal(calcHash(await readFile(path.join(output,file))),digest);
  await publish(true);
}catch(error){process.exitCode=1;await publish(false,error.message.slice(0,2000));console.error(error.stack);}
