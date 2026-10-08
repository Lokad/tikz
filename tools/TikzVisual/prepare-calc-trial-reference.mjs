// Compact projection of exactly pinned native research. No converter or renderer.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {loadCalcSavedReport,calcHash} from './calc-saved-images.mjs';
import {calcTrialPins,readCalcTrialReference,currentCalcSources} from './calc-trial-reference.mjs';
assert.equal(process.argv.length,6,'Usage: node tools/TikzVisual/prepare-calc-trial-reference.mjs <primary-check/report> <pdf-check/report> <primary-controls/report> <pdf-controls/report>');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.join(root,'artifacts/calc-trial-reference/run-'+randomUUID());
await mkdir(output,{recursive:true});const artifacts={},files=new Map(),sourceHashes={},inputs={};let phase='frozen-native-inputs';
const relative=f=>path.relative(root,f).split(path.sep).join('/');
async function save(f,b){await mkdir(path.dirname(path.join(output,f)),{recursive:true});await writeFile(path.join(output,f),b);artifacts[f]=calcHash(b);files.set(f,b);}
async function publish(completed,error){const b=Buffer.from(JSON.stringify({schemaVersion:1,role:'calc-native-trial-reference-projection',completed,phase,
  converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',inputs,sourceHashes,artifacts,
  scope:'Compact projection of the exactly pinned, previously independently verified native research. Original calibration PNGs stay in their source bundles; selected records, native inputs and proof manifests are owned here.',...(error?{error}:{})},null,2)+'\n');
  await writeFile(path.join(output,'report.json'),b);console.log(JSON.stringify({completed,phase,report:relative(path.join(output,'report.json')),sha256:calcHash(b)}));}
await publish(false);
try{
  const keys=['primaryCheck','pdfCheck','primaryControls','pdfControls'],roles=['independent-native-calc-primary-check','independent-native-calc-pdf-check','calc-native-primary-corruption-controls','calc-native-pdf-corruption-controls'];
  for(let i=0;i<keys.length;i++){const b=await loadCalcSavedReport(path.resolve(root,process.argv[i+2]),roles[i]);assert.equal(b.sha256,calcTrialPins[keys[i]]);
    inputs[keys[i]]={file:process.argv[i+2],sha256:b.sha256};await save(keys[i]+'/report.json',b.bytes);
    if(i<2){const key=i===0?'primaryCalibration':'pdfCalibration',cal=await loadCalcSavedReport(path.resolve(root,b.report.input.file),i===0?'native-calc-primary-calibration':'native-calc-pdf-calibration');
      assert.equal(cal.sha256,calcTrialPins[key]);await save(key+'/report.json',cal.bytes);
      const names=[i===0?'native-frame.json':'registration.json','trial-policy.json','points.json','pdf-pin.json',...cal.report.records.map(r=>r.file),...Object.keys(cal.report.artifacts).filter(f=>f.startsWith('native/'))];
      for(const f of names)await save(key+'/'+f,cal.files.get(f));}
  }
  for(const file of ['prepare-calc-trial-reference.mjs','calc-trial-reference.mjs']){const key='tools/TikzVisual/'+file,b=await readFile(path.join(root,key));sourceHashes[key]=calcHash(b);await save('source-captures/'+key,b);}
  const reference=readCalcTrialReference({report:{converterInvoked:false,nativeToolInvoked:false},files,json:f=>JSON.parse(files.get(f))});
  await currentCalcSources(root,{...reference.nativeSourceHashes,...sourceHashes});
  for(const[f,digest]of Object.entries(artifacts))assert.equal(calcHash(await readFile(path.join(output,f))),digest);
  phase='complete';await publish(true);
}catch(error){process.exitCode=1;await publish(false,error.message.replaceAll(root,'<repo>').slice(0,2000));console.error(error.stack);}
