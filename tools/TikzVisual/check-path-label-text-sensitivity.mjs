// Independent whole/local pixel checks and exact source recapture for complete text controls.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {root,writeArtifact,sha256} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport,calcEqual} from './calc-saved-images.mjs';
import {createRenderer} from './compare.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {shapeViews,evaluateShapeTrial} from './shape-primary-trial-policy.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {measureArrowVectorPair} from './arrow-vector-pair.mjs';
import {pathLabelPrimaryCaptures,pathLabelImageEncodings} from './path-label-image-reference.mjs';
import {readPathLabelPrimaryPolicies} from './path-label-primary-policy.mjs';
import {loadQualifiedPathLabelPrimary} from './path-label-qualified-primary.mjs';
import {pathLabelTextTargets,mutatePathLabelText} from './path-label-text-controls.mjs';
import {pathLabelPrimaryPixelReader} from './path-label-primary-pixels.mjs';

const key=v=>v.frame+'/'+v.scale+'x-'+v.background;
export function verifyPathLabelTextPixels(bundle){
 const r=bundle.report;assert.equal(r.converterInvoked,false);assert.equal(r.nativeToolInvoked,false);
 const labels=pathLabelTextTargets(bundle.json('basis/oracle/native-glyphs.json'));
 calcEqual(r.controls.map(c=>({nodeId:c.nodeId,targets:c.targets,kind:c.kind})),labels.flatMap(l=>['missing','quarter-pixel-shift'].map(kind=>({...l,kind}))),'Changed complete-text coverage.');
 calcEqual(r.coverage,{labels:labels.length,controls:labels.length*2,views:labels.length*48},'Changed view counts.');
 const frame=bundle.json('basis/frame.json'),read=pathLabelPrimaryPixelReader(bundle,frame);
 const policies=readPathLabelPrimaryPolicies({json:file=>bundle.json('basis/'+file)});let visible=0,invisible=0,comparisons=0;
 for(const control of r.controls){assert.equal(control.numericChecksBypassed,true);
  calcEqual(control.comparisons.map(c=>c.capture+'/'+key(c)),pathLabelPrimaryCaptures.flatMap(c=>shapeViews.map(v=>c+'/'+key(v))),'Changed control views.');
  for(const record of control.comparisons){
   const expected='controls/'+control.nodeId+'/'+control.kind+'/'+record.capture+'/'+key(record)+'/record.json';assert.equal(record.file,expected);
   const row=read(record.file),view={frame:record.frame,scale:record.scale,background:record.background};
   calcEqual({capture:row.capture,frame:row.frame,scale:row.scale,background:row.background},{capture:record.capture,...view},'Changed row view.');
   const base=bundle.json('basis/encodings/'+pathLabelImageEncodings[0]+'/'+record.capture+'/'+key(record)+'/record.json');
   assert.equal(row.images.reference,'basis/'+base.images.reference);
   const evaluation=evaluateShapeTrial(policies[record.capture],view,row);calcEqual(row.evaluation,evaluation,'Forged defect verdict.');
   const differs=sha256(bundle.files.get(row.images.actual))!==sha256(bundle.files.get('basis/'+base.images.actual));
   assert.equal(record.observedVisible,differs);assert.equal(row.observedVisible,differs);assert.equal(record.rejected,!evaluation.passed);
   if(differs){assert.equal(evaluation.passed,false);assert.ok(evaluation.checks.some(c=>control.targets.includes(c.id)&&!c.passed));visible++;}
   else{calcEqual(row.metrics,base.metrics,'Invisible control changed observations.');invisible++;}comparisons++;
  }
 }return{comparisons,regions:comparisons*frame.regions.length,visibleControls:visible,invisibleControls:invisible};
}

export async function checkPathLabelText(file){
 const bundle=await loadCalcSavedReport(file,'path-label-complete-text-sensitivity');
 const {calibration,checked,native}=await loadQualifiedPathLabelPrimary(bundle.report.inputs.calibration,bundle.report.inputs.checked);
 assert.equal(bundle.report.inputs.calibrationSha256,calibration.sha256);assert.equal(bundle.report.inputs.checkedSha256,checked.sha256);
 assert.ok(bundle.files.get('inputs/calibration-report.json').equals(calibration.bytes));assert.ok(bundle.files.get('inputs/check-report.json').equals(checked.bytes));
 assert.equal(bundle.report.fixture,calibration.report.fixture);
 for(const [file,bytes]of bundle.files){
  if(file==='basis/original.svg')assert.ok(bytes.equals(native.files.get('probed-reference.svg')));
  else if(file.startsWith('basis/'))assert.ok(bytes.equals(calibration.files.get(file.slice(6))),'Changed qualified basis: '+file);
  else if(file.startsWith('source-captures/'))assert.ok(bytes.equals(await readFile(path.join(root,file.slice(16)))),'Changed sensitivity dependency.');
 }
 const pixels=verifyPathLabelTextPixels(bundle),frame=bundle.json('basis/frame.json'),renderer=await createRenderer();let recaptured=0;
 try{
  calcEqual(renderer.identity,calibration.report.renderer,'Changed renderer.');await renderer.page.evaluate('globalThis.shapeRasterMetrics=('+createShapeRasterMetrics.toString()+')()');
  const original=bundle.files.get('basis/encodings/'+pathLabelImageEncodings[0]+'.svg').toString('utf8');
  for(const control of bundle.report.controls){
   const svg=await mutatePathLabelText(renderer,original,control);
   assert.equal(svg,bundle.files.get('controls/'+control.nodeId+'/'+control.kind+'/altered.svg').toString('utf8'),'Changed complete-text mutation.');
   for(const record of control.comparisons){const row=bundle.json(record.file),measure=row.capture==='intrinsic-image'?measureEdgeTrialPrimary:measureArrowVectorPair;
    const pair=await measure(renderer,{reference:native.files.get('probed-reference.svg').toString('utf8'),actual:svg,leftIsDriver:true,
     origin:frame.origin,camera:frame.camera,regions:frame.regions,frame:row.frame,scale:row.scale,background:row.background,cropLimit:0});
    calcEqual(pair.metrics,row.metrics,'Source recapture differs.');
    for(const name of['reference','actual'])assert.ok(Buffer.from(pair.images[name],'base64').equals(bundle.files.get(row.images[name])),'Changed source-bound PNG.');recaptured++;
   }console.log(JSON.stringify({phase:'source-recapture',node:control.nodeId,kind:control.kind,views:24}));
  }
 }finally{await renderer.browser.close();}return{bundle,pixels,recaptured};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,3,'Usage: node tools/TikzVisual/check-path-label-text-sensitivity.mjs <exact-sensitivity-report>');
 const output=path.join(root,'artifacts/path-label-text-check/run-'+randomUUID()),artifacts={},save=(p,b)=>writeArtifact(output,p,b,artifacts);
 async function publish(completed,extra={}){const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'path-label-independent-text-check',completed,
  phase:completed?'complete':'checking',converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',artifacts,...extra},null,2)+'\n');
  await writeArtifact(output,'report.json',bytes);console.log(JSON.stringify({completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));}
 await publish(false);try{const result=await checkPathLabelText(path.resolve(root,process.argv[2]));await save('input-report.json',result.bundle.bytes);
  for(const name of['check-path-label-text-sensitivity.mjs','path-label-primary-pixels.mjs'])await save('source-captures/tools/TikzVisual/'+name,await readFile(path.join(root,'tools/TikzVisual/'+name)));
  await publish(true,{inputSha256:result.bundle.sha256,pixels:result.pixels,sourceRecaptures:result.recaptured});
 }catch(error){await save('failure.log',String(error.stack??error).replaceAll(root,'<repo>'));await publish(false,{error:error.message});process.exitCode=1;}
}
