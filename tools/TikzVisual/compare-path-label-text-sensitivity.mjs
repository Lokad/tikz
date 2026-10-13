import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Acceptance gap: loss/displacement of every glyph in each complete path-label text.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root,writeArtifact,sha256} from './shape-oracle-bundle.mjs';
import {calcEqual} from './calc-saved-images.mjs';
import {createRenderer} from './compare.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {shapeViews,evaluateShapeTrial} from './shape-primary-trial-policy.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {measureArrowVectorPair} from './arrow-vector-pair.mjs';
import {pathLabelPrimaryCaptures,pathLabelImageEncodings} from './path-label-image-reference.mjs';
import {readPathLabelPrimaryPolicies} from './path-label-primary-policy.mjs';
import {loadQualifiedPathLabelPrimary} from './path-label-qualified-primary.mjs';
import {pathLabelTextTargets,mutatePathLabelText} from './path-label-text-controls.mjs';

assert.equal(process.argv.length,4,'Usage: node tools/TikzVisual/compare-path-label-text-sensitivity.mjs <native-calibration-report> <independent-check-report>');
const output=path.join(root,'artifacts/path-label-text-sensitivity/run-'+randomUUID()),artifacts={},save=(p,b)=>writeArtifact(output,p,b,artifacts);
const json=(p,v)=>save(p,JSON.stringify(v,null,2)+'\n'),key=v=>v.frame+'/'+v.scale+'x-'+v.background;
let renderer,phase='inputs',inputs,fixture;const controls=[];
async function publish(completed,extra={}){const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'path-label-complete-text-sensitivity',completed,
 phase:completed?'complete':phase,converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',
 artifacts,inputs,fixture,controls,...extra},null,2)+'\n');await writeArtifact(output,'report.json',bytes);
 console.log(JSON.stringify({completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));}
await publish(false);
try{
 const {calibration,checked,native}=await loadQualifiedPathLabelPrimary(...process.argv.slice(2));fixture=calibration.report.fixture;
 inputs={calibration:process.argv[2],calibrationSha256:calibration.sha256,checked:process.argv[3],checkedSha256:checked.sha256};
 await save('inputs/calibration-report.json',calibration.bytes);await save('inputs/check-report.json',checked.bytes);
 for(const file of['frame.json','policies.json','oracle/native-glyphs.json','encodings/'+pathLabelImageEncodings[0]+'.svg'])await save('basis/'+file,calibration.files.get(file));
 await save('basis/original.svg',native.files.get('probed-reference.svg'));
 const baselines=new Map();
 for(const record of calibration.report.records.filter(r=>r.encoding===pathLabelImageEncodings[0])){
  const row=calibration.json(record.file);baselines.set(row.capture+'/'+key(row),row);
  for(const image of['reference','actual'])await save('basis/'+row.images[image],calibration.files.get(row.images[image]));
  await json('basis/'+record.file,row);
 }
 for(const file of['compare-path-label-text-sensitivity.mjs','path-label-text-controls.mjs','path-label-qualified-primary.mjs','path-label-primary-policy.mjs'])
  await save('source-captures/tools/TikzVisual/'+file,await readFile(path.join(root,'tools/TikzVisual/'+file)));
 const frame=calibration.json('frame.json'),policies=readPathLabelPrimaryPolicies(calibration),original=calibration.files.get('encodings/'+pathLabelImageEncodings[0]+'.svg').toString('utf8');
 renderer=await createRenderer();requireRenderer(renderer.identity, calibration.report.renderer, 'Changed frozen renderer.');
 await renderer.page.evaluate('globalThis.shapeRasterMetrics=('+createShapeRasterMetrics.toString()+')()');phase='whole-text-controls';
 for(const label of pathLabelTextTargets(calibration.json('oracle/native-glyphs.json')))for(const kind of['missing','quarter-pixel-shift']){
  const control={...label,kind,numericChecksBypassed:true,comparisons:[]};controls.push(control);
  const svg=await mutatePathLabelText(renderer,original,control),prefix='controls/'+label.nodeId+'/'+kind;await save(prefix+'/altered.svg',svg);
  for(const capture of pathLabelPrimaryCaptures)for(const view of shapeViews){
   const measure=capture==='intrinsic-image'?measureEdgeTrialPrimary:measureArrowVectorPair;
   const pair=await measure(renderer,{reference:native.files.get('probed-reference.svg').toString('utf8'),actual:svg,leftIsDriver:true,
    origin:frame.origin,camera:frame.camera,regions:frame.regions,...view,cropLimit:0,referenceLabel:'Original native TikZ',rightLabel:'Complete-label text defect'});
   const base=baselines.get(capture+'/'+key(view));assert.ok(Buffer.from(pair.images.reference,'base64').equals(calibration.files.get(base.images.reference)),'Changed frozen reference raster.');
   const current=prefix+'/'+capture+'/'+key(view),images={reference:'basis/'+base.images.reference,actual:current+'/actual.png'};
   await save(images.actual,Buffer.from(pair.images.actual,'base64'));
   if(view.frame==='expanded'&&view.scale===1&&view.background==='white')await save(current+'/comparison.png',Buffer.from(pair.images.comparison,'base64'));
   const row={capture,...view,metrics:pair.metrics,regions:pair.regions,repeat:pair.repeat,actualRepeat:pair.actualRepeat,images};
   const evaluation=evaluateShapeTrial(policies[capture],view,row),visible=artifacts[images.actual]!==sha256(calibration.files.get(base.images.actual));
   if(visible){assert.equal(evaluation.passed,false,'Visible complete-text defect passed.');assert.ok(evaluation.checks.some(c=>label.targets.includes(c.id)&&!c.passed),'No text region rejected.');}
   else calcEqual(row.metrics,base.metrics,'Invisible complete-text defect changed observations.');
   const file=current+'/record.json';await json(file,{...row,evaluation,observedVisible:visible});control.comparisons.push({capture,...view,file,observedVisible:visible,rejected:!evaluation.passed});
  }console.log(JSON.stringify({phase,node:label.nodeId,kind,glyphs:label.targets.length,views:24}));
 }
 await publish(true,{coverage:{labels:controls.length/2,controls:controls.length,views:controls.length*24},scope:'Whole path-label text only; frozen primary allowances unchanged. Independent checking and final feature admission separate.'});
}catch(error){await save('failure.log',String(error.stack??error).replaceAll(root,'<repo>'));await publish(false,{error:error.message});process.exitCode=1;}
finally{await renderer?.browser.close();}
