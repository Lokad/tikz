// Affected iteration check against native-only limits; final feature admission is separate.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root,writeArtifact,sha256} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport,calcEqual} from './calc-saved-images.mjs';
import {ownCalcBundle} from './calc-admission-child.mjs';
import {createRenderer} from './compare.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {shapeViews,evaluateShapeTrial} from './shape-primary-trial-policy.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {measureArrowVectorPair} from './arrow-vector-pair.mjs';
import {pathLabelPrimaryCaptures} from './path-label-image-reference.mjs';
import {loadPathLabelEvidence} from './path-label-evidence.mjs';
import {readPathLabelPrimaryPolicies} from './path-label-primary-policy.mjs';

assert.equal(process.argv.length,4,'Usage: node tools/TikzVisual/compare-path-label-primary.mjs <native-calibration-report> <fresh-numeric-iteration-report>');
const output=path.join(root,'artifacts/path-label-primary-iteration/run-'+randomUUID()),artifacts={},save=(p,b)=>writeArtifact(output,p,b,artifacts);
let renderer,phase='inputs';const records=[];
async function publish(completed,result={}){const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'path-label-current-primary-iteration',completed,
 phase:completed?'complete':phase,converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',artifacts,records,result},null,2)+'\n');
 await writeArtifact(output,'report.json',bytes);console.log(JSON.stringify({completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));}
await publish(false);
try{
 const calibration=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'path-label-native-primary-calibration');
 const numeric=await loadCalcSavedReport(path.resolve(root,process.argv[3]),'path-label-numeric-iteration');
 const id=calibration.report.fixture,native=await loadPathLabelEvidence(id);
 assert.equal(calibration.report.converterInvoked,false);assert.equal(calibration.report.nativeInputSha256,native.sha256);
 assert.equal(numeric.report.result.fixture,id);assert.equal(numeric.report.result.numericPassed,true);assert.equal(numeric.report.result.publicTraceParity,true);
 assert.equal(numeric.report.result.nativeInputSha256,native.sha256);
 assert.ok(numeric.files.get('current/actual.svg').equals(numeric.files.get('current/public.svg')));
 await ownCalcBundle(calibration,'calibration',save);await ownCalcBundle(numeric,'numeric',save);
 for(const file of['tools/TikzVisual/compare-path-label-primary.mjs','tools/TikzVisual/path-label-primary-policy.mjs'])
  await save('source-captures/'+file,await readFile(path.join(root,file)));
 const frame=calibration.json('frame.json'),policies=readPathLabelPrimaryPolicies(calibration);
 renderer=await createRenderer();calcEqual(renderer.identity,calibration.report.renderer,'Native renderer changed.');
 await renderer.page.evaluate('globalThis.shapeRasterMetrics=('+createShapeRasterMetrics.toString()+')()');phase='current-images';
 for(const capture of pathLabelPrimaryCaptures)for(const view of shapeViews){
  const measure=capture==='intrinsic-image'?measureEdgeTrialPrimary:measureArrowVectorPair;
  const pair=await measure(renderer,{reference:native.files.get('probed-reference.svg').toString('utf8'),actual:numeric.files.get('current/actual.svg').toString('utf8'),
   leftIsDriver:true,origin:frame.origin,camera:frame.camera,regions:frame.regions,...view,cropLimit:view.background==='white'?2:0,
   referenceLabel:'Original native TikZ',rightLabel:'Fresh public converter'});
  const prefix='views/'+capture+'/'+view.frame+'/'+view.scale+'x-'+view.background,images={};
  for(const[name,b64]of Object.entries(pair.images)){const file=prefix+'/'+name+'.png';await save(file,Buffer.from(b64,'base64'));images[name]=file;}
  for(const crop of pair.crops)for(const[name,b64]of Object.entries({...crop.paired,sheet:crop.sheet}))await save(prefix+'/crops/'+crop.id+'/'+name+'.png',Buffer.from(b64,'base64'));
  const row={capture,...view,metrics:pair.metrics,regions:pair.regions,repeat:pair.repeat,actualRepeat:pair.actualRepeat,images};
  const evaluation=evaluateShapeTrial(policies[capture],view,row),file=prefix+'/record.json';
  await save(file,JSON.stringify({...row,evaluation},null,2)+'\n');records.push({capture,...view,file,passed:evaluation.passed,failed:evaluation.checks.filter(c=>!c.passed)});
 }
 const passed=records.every(r=>r.passed);await publish(true,{primaryPassed:passed,fixture:id,views:records.length,sourceNumericSha256:numeric.sha256,
  nativeCalibrationSha256:calibration.sha256,scope:'Affected primary/local iteration check only; native PDF gates and final feature acceptance remain open.'});
 process.exitCode=passed?0:1;
}catch(error){await save('failure.log',String(error.stack??error).replaceAll(root,'<repo>'));await publish(false,{error:error.message});process.exitCode=1;}
finally{await renderer?.browser.close();}
