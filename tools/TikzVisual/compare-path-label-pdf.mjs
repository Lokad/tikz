import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Affected iteration: both independently calibrated PDF gates on fresh public converter output.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root,writeArtifact,sha256} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport,calcEqual} from './calc-saved-images.mjs';
import {ownCalcBundle} from './calc-admission-child.mjs';
import {loadLabelImageEvidence,labelImageSourceFile} from './diagram-image-evidence.mjs';
import {createRenderer} from './compare.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {measureEdgePdfPair} from './edge-pdf-image-pair.mjs';
import {shapePdfViews,evaluateShapePdfTrial} from './shape-pdf-trial-policy.mjs';
import {verificationMode,verificationViewPolicy,reusesOriginalReference} from './verification-views.mjs';

assert.ok([4,5].includes(process.argv.length),'Usage: compare-path-label-pdf.mjs <native-PDF-calibration-report> <fresh-numeric-report> [--iteration]');
const verification=verificationMode(process.argv[4]),viewPolicy=verificationViewPolicy(process.argv[4]);
const reuseReference=reusesOriginalReference(verification,viewPolicy);
const output=path.join(root,'artifacts/path-label-pdf-iteration/run-'+randomUUID()),artifacts={},save=(p,b)=>writeArtifact(output,p,b,artifacts),json=(p,v)=>save(p,JSON.stringify(v,null,2)+'\n');
let renderer,referenceCalibration,phase='inputs',inputs,fixture;const records=[];
async function publish(completed,extra={}){const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'path-label-current-pdf-iteration',completed,
 phase:completed?'complete':phase,converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',
 verificationMode:verification,viewPolicy,referenceCalibration,reusedOriginalReference:reuseReference,artifacts,inputs,fixture,records,...extra},null,2)+'\n');await writeArtifact(output,'report.json',bytes);
 console.log(JSON.stringify({completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));}
await publish(false);
try{
 const calibration=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'path-label-native-pdf-calibration');
 const role=JSON.parse(await readFile(path.resolve(root,process.argv[3]))).role;assert.ok(['path-label-numeric-iteration','diagram-current-numeric'].includes(role));
 const numeric=await loadCalcSavedReport(path.resolve(root,process.argv[3]),role),diagram=role==='diagram-current-numeric',numericPrefix=diagram?'':'current/';fixture=calibration.report.fixture;
 const native=await loadLabelImageEvidence(diagram?path.relative(root,path.join(path.dirname(calibration.file),'native/report.json')):fixture);assert.equal(calibration.report.inputs.nativeInputSha256,native.sha256);
 if(diagram)assert.ok(numeric.files.get('source.tikz').equals(native.files.get('source-captures/'+labelImageSourceFile(fixture))));else assert.equal(numeric.report.result.fixture,fixture);
 assert.equal(numeric.report.result.numericPassed,true);assert.equal(numeric.report.result.publicTraceParity,true);assert.equal(numeric.report.result.nativeInputSha256,native.sha256);
 assert.ok(numeric.files.get(numericPrefix+'actual.svg').equals(numeric.files.get(numericPrefix+'public.svg')));
 for(const [file,bytes]of calibration.files)if(file.startsWith('source-captures/')&&!file.endsWith('.mjs'))assert.ok(bytes.equals(await readFile(path.join(root,file.slice(16)))),'Changed native PDF dependency.');
 for(const [file,bytes]of numeric.files)if(file.startsWith(numericPrefix+'source-captures/'))assert.ok(bytes.equals(await readFile(path.join(root,file.slice((numericPrefix+'source-captures/').length)))),'Changed converter dependency.');
 inputs={calibration:process.argv[2],calibrationSha256:calibration.sha256,numeric:process.argv[3],numericSha256:numeric.sha256};
 if(viewPolicy)referenceCalibration={file:path.relative(root,calibration.file).replaceAll('\\','/'),sha256:calibration.sha256};
 else await ownCalcBundle(calibration,'calibration',save);
 await ownCalcBundle(numeric,'numeric',save);
 for(const file of ['compare-path-label-pdf.mjs','verification-views.mjs'])await save('source-captures/tools/TikzVisual/'+file,await readFile(path.join(root,'tools/TikzVisual/'+file)));
 const frame=calibration.json('frame.json'),pdf=calibration.json('pdf-frame.json'),policies=calibration.json('policies.json');
 renderer=await createRenderer();requireRenderer(renderer.identity, calibration.report.renderer);await renderer.page.evaluate('globalThis.shapeRasterMetrics=('+createShapeRasterMetrics.toString()+')()');phase='current-pdf';
 for(const mode of['original','candidate'])for(const view of shapePdfViews){
  if(mode==='original'&&reuseReference){
   const file='views/original/'+view.frame+'/'+view.scale+'x/record.json',original=calibration.json(file);
   const row={...original,mode,images:{...original.images}},evaluation=evaluateShapePdfTrial(policies.original,view,row);
   for(const image of Object.values(row.images))await save(image,calibration.files.get(image));
   await json(file,{...row,evaluation});records.push({mode,...view,file,passed:evaluation.passed,failed:evaluation.checks.filter(c=>!c.passed)});
   continue;
  }
  const pair=await measureEdgePdfPair(renderer,{svg:mode==='original'?native.files.get('probed-reference.svg').toString('utf8'):numeric.files.get(numericPrefix+'public.svg').toString('utf8'),
   pdfPage:'data:image/png;base64,'+native.files.get('probed-pdf-page-'+view.scale+'x.png').toString('base64'),...view,...pdf,
   units:mode==='original'?'bp':'cssPixels',svgOriginBp:mode==='original'?frame.origin:{x:0,y:0},cropLimit:2,rightLabel:mode==='original'?'Original native SVG':'Fresh public converter'});
  const prefix='views/'+mode+'/'+view.frame+'/'+view.scale+'x',images={};
  for(const[name,b64]of Object.entries(pair.images)){const file=prefix+'/'+name+'.png';await save(file,Buffer.from(b64,'base64'));images[name]=file;}
  for(const crop of pair.crops)for(const[name,b64]of Object.entries(crop.images))await save(prefix+'/crops/'+crop.id+'/'+name+'.png',Buffer.from(b64,'base64'));
  const {images:ignored,crops,...result}=pair,row={mode,...result,images},evaluation=evaluateShapePdfTrial(policies[mode],view,row),file=prefix+'/record.json';
  await json(file,{...row,evaluation});records.push({mode,...view,file,passed:evaluation.passed,failed:evaluation.checks.filter(c=>!c.passed)});
  console.log(JSON.stringify({phase,mode,...view,passed:evaluation.passed,failed:records.at(-1).failed.map(c=>({id:c.id,metrics:c.metrics.filter(m=>!m.passed)}))}));
 }
 const gates=Object.fromEntries(['original','candidate'].map(mode=>[mode,{passed:records.filter(r=>r.mode===mode).every(r=>r.passed),views:4}]));
 await publish(true,{gates,pdfPassed:Object.values(gates).every(g=>g.passed),scope:'Affected PDF iteration only; independent current checking and final feature acceptance remain open.'});
 process.exitCode=Object.values(gates).every(g=>g.passed)?0:1;
}catch(error){await save('failure.log',String(error.stack??error).replaceAll(root,'<repo>'));await publish(false,{error:error.message});process.exitCode=1;}
finally{await renderer?.browser.close();}
