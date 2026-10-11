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
import {evaluateShapeTrial} from './shape-primary-trial-policy.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {measureArrowVectorPair} from './arrow-vector-pair.mjs';
import {loadLabelImageEvidence,labelImageSourceFile} from './diagram-image-evidence.mjs';
import {readPathLabelPrimaryPolicies} from './path-label-primary-policy.mjs';
import {verificationMode,currentPrimaryViews,verificationViewPolicy} from './verification-views.mjs';

assert.ok([4,5].includes(process.argv.length),'Usage: compare-path-label-primary.mjs <native-calibration-report> <fresh-numeric-report> [--iteration]');
const mode=verificationMode(process.argv[4]),viewPolicy=verificationViewPolicy(process.argv[4]);
const output=path.join(root,'artifacts/path-label-primary-iteration/run-'+randomUUID()),artifacts={},save=(p,b)=>writeArtifact(output,p,b,artifacts);
let renderer,referenceCalibration,phase='inputs';const records=[];
async function publish(completed,result={}){const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'path-label-current-primary-iteration',completed,
 phase:completed?'complete':phase,verificationMode:mode,viewPolicy,referenceCalibration,converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',artifacts,records,result},null,2)+'\n');
 await writeArtifact(output,'report.json',bytes);console.log(JSON.stringify({completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));}
await publish(false);
try{
 const calibration=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'path-label-native-primary-calibration');
 const numericRole=JSON.parse(await readFile(path.resolve(root,process.argv[3]))).role;
 assert.ok(['path-label-numeric-iteration','diagram-current-numeric'].includes(numericRole));
 const numeric=await loadCalcSavedReport(path.resolve(root,process.argv[3]),numericRole),diagram=numericRole==='diagram-current-numeric';
 const id=calibration.report.fixture,native=await loadLabelImageEvidence(diagram?path.relative(root,path.join(path.dirname(calibration.file),'native/report.json')):id);
 assert.equal(calibration.report.converterInvoked,false);assert.equal(calibration.report.nativeInputSha256,native.sha256);
 if(diagram)assert.ok(numeric.files.get('source.tikz').equals(native.files.get('source-captures/'+labelImageSourceFile(id))));
 else assert.equal(numeric.report.result.fixture,id);
 assert.equal(numeric.report.result.numericPassed,true);assert.equal(numeric.report.result.publicTraceParity,true);
 assert.equal(numeric.report.result.nativeInputSha256,native.sha256);
 const actual=numeric.files.get(diagram?'actual.svg':'current/actual.svg'),publicSvg=numeric.files.get(diagram?'public.svg':'current/public.svg');
 assert.ok(actual.equals(publicSvg));
 if(viewPolicy)referenceCalibration={file:path.relative(root,calibration.file).replaceAll('\\','/'),sha256:calibration.sha256};
 else await ownCalcBundle(calibration,'calibration',save);
 await ownCalcBundle(numeric,'numeric',save);
 for(const file of['tools/TikzVisual/compare-path-label-primary.mjs','tools/TikzVisual/path-label-primary-policy.mjs','tools/TikzVisual/verification-views.mjs'])
  await save('source-captures/'+file,await readFile(path.join(root,file)));
 const frame=calibration.json('frame.json'),policies=readPathLabelPrimaryPolicies(calibration);
 const sources=diagram?numeric.json('source-map.json'):null;
 const sourceLocations=ids=>sources?ids.flatMap(id=>{
  const m=/^native-(paint|glyph)-(\d+)$/.exec(id);if(!m)return[];
  const row=sources[m[1]==='paint'?'paths':'glyphs'][Number(m[2])];assert.equal(row.index,Number(m[2]));return[{id,source:row.source}];
 }):[];
 renderer=await createRenderer();calcEqual(renderer.identity,calibration.report.renderer,'Native renderer changed.');
 await renderer.page.evaluate('globalThis.shapeRasterMetrics=('+createShapeRasterMetrics.toString()+')()');phase='current-images';
 for(const {capture,...view} of currentPrimaryViews(mode,id,viewPolicy)){
  const measure=capture==='intrinsic-image'?measureEdgeTrialPrimary:measureArrowVectorPair;
  const pair=await measure(renderer,{reference:native.files.get('probed-reference.svg').toString('utf8'),actual:actual.toString('utf8'),
   leftIsDriver:true,origin:frame.origin,camera:frame.camera,regions:frame.regions,...view,cropLimit:view.background==='white'?2:0,
   referenceLabel:'Original native TikZ',rightLabel:'Fresh public converter'});
  const prefix='views/'+capture+'/'+view.frame+'/'+view.scale+'x-'+view.background,images={};
  for(const[name,b64]of Object.entries(pair.images)){const file=prefix+'/'+name+'.png';await save(file,Buffer.from(b64,'base64'));images[name]=file;}
  for(const crop of pair.crops)for(const[name,b64]of Object.entries({...crop.paired,sheet:crop.sheet}))await save(prefix+'/crops/'+crop.id+'/'+name+'.png',Buffer.from(b64,'base64'));
  const row={capture,...view,metrics:pair.metrics,regions:pair.regions,repeat:pair.repeat,actualRepeat:pair.actualRepeat,images};
  const evaluation=evaluateShapeTrial(policies[capture],view,row),file=prefix+'/record.json';
  const failed=evaluation.checks.filter(c=>!c.passed),locations=sourceLocations(failed.map(c=>c.id));
  await save(file,JSON.stringify({...row,evaluation,sourceLocations:locations},null,2)+'\n');records.push({capture,...view,file,passed:evaluation.passed,failed,sourceLocations:locations});
 }
 const passed=records.every(r=>r.passed);await publish(true,{primaryPassed:passed,fixture:id,views:records.length,sourceNumericSha256:numeric.sha256,
  nativeCalibrationSha256:calibration.sha256,scope:'Affected primary/local iteration check only; native PDF gates and final feature acceptance remain open.'});
 process.exitCode=passed?0:1;
}catch(error){await save('failure.log',String(error.stack??error).replaceAll(root,'<repo>'));await publish(false,{error:error.message});process.exitCode=1;}
finally{await renderer?.browser.close();}
