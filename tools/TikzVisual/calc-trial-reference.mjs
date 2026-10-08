// Frozen research inputs, never an admitted image policy or candidate allowance.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {loadCalcSavedReport,calcHash,calcEqual} from './calc-saved-images.mjs';
import {deriveCalcPrimaryPolicy} from './calc-primary-policy.mjs';
import {deriveCalcPdfPolicy} from './calc-pdf-policy.mjs';
import {readCalcLayoutEvidence} from './calc-layout-evidence.mjs';
export const calcTrialPins={
  primaryCheck:'10b6f62eff01ad5c1c30892af92b74a3477b23562c1f99fe4f9c6c452b8aa0b8',
  primaryCalibration:'625d7361a487be42eb61ff4ae8e7188f6bbb7bcc8761202cafaa87cd615d2885',
  pdfCheck:'d1f033b748356fce2d67598deec2cb9ae9df72fe6f45bce887bef584cfa4e8d4',
  pdfCalibration:'56fbfeb02a5ba9c9e048242eae96331a91c99f311509c5e57464c6a13c2fae9b',
  primaryControls:'0fdd704ceb1db5a46d2b8bee53a8e661cb88f1db0723bc70236bd875365af80e',
  pdfControls:'13dfbc031218c6db253e6a8e201c54c65356a995b8e78090d3caa89908647979'
};
const pinned=(bytes,name)=>assert.equal(calcHash(bytes),calcTrialPins[name],'Frozen native research pin differs: '+name);
export function readCalcTrialReference(bundle){
  const r=bundle.report;assert.equal(r.converterInvoked,false);assert.equal(r.nativeToolInvoked,false);
  const reports={};for(const key of Object.keys(calcTrialPins)){const file=key+'/report.json';pinned(bundle.files.get(file),key);reports[key]=bundle.json(file);
    assert.equal(reports[key].completed,true);assert.equal(reports[key].phase,'complete');assert.equal(reports[key].imageConformanceClaim,false);assert.equal(reports[key].approvedImagePolicy,false);}
  assert.equal(reports.primaryCheck.input.sha256,calcTrialPins.primaryCalibration);assert.equal(reports.pdfCheck.input.sha256,calcTrialPins.pdfCalibration);
  const files=new Map();for(const key of ['primaryCalibration','pdfCalibration']){
    const report=reports[key],names=[key==='primaryCalibration'?'native-frame.json':'registration.json','trial-policy.json','points.json','pdf-pin.json',
      ...report.records.map(row=>row.file),...Object.keys(report.artifacts).filter(f=>f.startsWith('native/'))];
    for(const file of names){const bytes=bundle.files.get(key+'/'+file);assert.ok(bytes,'Missing frozen native projection: '+key+'/'+file);
      assert.equal(calcHash(bytes),report.artifacts[file],'Frozen native projection differs: '+key+'/'+file);files.set(key+'/'+file,bytes);}
  }
  const primary=reports.primaryCalibration,pdf=reports.pdfCalibration;
  const primaryRows=primary.records.map(i=>({...bundle.json('primaryCalibration/'+i.file),...i}));
  const pdfRows=pdf.records.map(i=>({...bundle.json('pdfCalibration/'+i.file),...i}));
  const primaryPolicy=deriveCalcPrimaryPolicy(primaryRows),registration=bundle.json('pdfCalibration/registration.json');
  const pdfPolicy=deriveCalcPdfPolicy(pdfRows,registration.camera,registration.regions);
  calcEqual(primaryPolicy,primary.policy,'Frozen primary policy derivation differs');calcEqual(pdfPolicy,pdf.policy,'Frozen PDF policy derivation differs');
  calcEqual(primaryPolicy,bundle.json('primaryCalibration/trial-policy.json'),'Frozen primary policy file differs');
  calcEqual(pdfPolicy,bundle.json('pdfCalibration/trial-policy.json'),'Frozen PDF policy file differs');
  const cache=bundle.json('primaryCalibration/points.json'),pin=bundle.json('primaryCalibration/pdf-pin.json');
  calcEqual(cache,bundle.json('pdfCalibration/points.json'),'Frozen native caches differ');calcEqual(pin,bundle.json('pdfCalibration/pdf-pin.json'),'Frozen PDF pins differ');
  const native=new Map([...files].filter(([f])=>f.startsWith('primaryCalibration/native/')).map(([f,b])=>[f.slice(26),b]));
  for(const[f,b]of native)assert.equal(calcHash(b),calcHash(files.get('pdfCalibration/native/'+f)),'Frozen native inputs differ');
  assert.equal(calcHash(native.get('report.json')),pin.nativeReportSha256);assert.equal(calcHash(native.get('pdf-plain/case.pdf')),pin.pdfSha256);
  for(const scale of [1,4])assert.equal(calcHash(native.get('pdf-plain/page-'+scale+'x.png')),pin.rasterSha256[scale+'x']);
  const evidence=readCalcLayoutEvidence(Object.fromEntries(native),cache);calcEqual(evidence,registration.evidence,'Frozen native evidence differs');
  return{cache,pin,native,primaryPolicy,pdfPolicy,primaryFrame:bundle.json('primaryCalibration/native-frame.json'),registration,
    nativeSourceHashes:Object.assign({},...Object.values(reports).map(report=>report.sourceHashes??{}))};
}
export async function currentCalcSources(root,hashes){
  assert.ok(Object.keys(hashes).length>0);for(const[file,digest]of Object.entries(hashes)){
    assert.match(file,/^(?:src\/Lokad\.TikZ\/|tools\/TikzReference\/|tools\/TikzVisual\/|Directory\.Build\.props$|global\.json$)/);
    assert.ok(!file.split('/').some(p=>!p||p==='.'||p==='..'));assert.match(digest,/^[a-f0-9]{64}$/);
    assert.equal(calcHash(await readFile(path.join(root,file))),digest,'Guarded calc source changed: '+file);
  }
}
export async function loadCalcTrialReference(root,file){const bundle=await loadCalcSavedReport(path.resolve(root,file),'calc-native-trial-reference-projection');
  const reference=readCalcTrialReference(bundle);await currentCalcSources(root,reference.nativeSourceHashes);return{bundle,...reference};}
