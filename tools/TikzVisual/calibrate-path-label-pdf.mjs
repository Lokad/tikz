// Acceptance gap: native-only PDF registration and independent limits for both PDF gates.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root,writeArtifact,sha256} from './shape-oracle-bundle.mjs';
import {calcEqual} from './calc-saved-images.mjs';
import {ownCalcBundle} from './calc-admission-child.mjs';
import {loadQualifiedPathLabelPrimary} from './path-label-qualified-primary.mjs';
import {pathLabelPdfFrame,pathLabelImageEncodings} from './path-label-image-reference.mjs';
import {createRenderer} from './compare.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {measureEdgePdfPair} from './edge-pdf-image-pair.mjs';
import {shapePdfViews} from './shape-pdf-trial-policy.mjs';
import {pathLabelPdfPolicies} from './path-label-pdf-policy.mjs';
import {pathLabelPdfEncoding} from './path-label-pdf-encoding.mjs';

assert.equal(process.argv.length,4,'Usage: node tools/TikzVisual/calibrate-path-label-pdf.mjs <primary-calibration-report> <independent-primary-check-report>');
const output=path.join(root,'artifacts/path-label-pdf-calibration/run-'+randomUUID()),artifacts={},save=(p,b)=>writeArtifact(output,p,b,artifacts),json=(p,v)=>save(p,JSON.stringify(v,null,2)+'\n');
let renderer,phase='inputs',inputs,fixture;const records=[];
async function publish(completed,extra={}){const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'path-label-native-pdf-calibration',completed,
 phase:completed?'complete':phase,converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',
 artifacts,inputs,fixture,renderer:renderer?.identity,records,...extra},null,2)+'\n');await writeArtifact(output,'report.json',bytes);
 console.log(JSON.stringify({completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));}
await publish(false);
try{
 const {calibration,checked,native}=await loadQualifiedPathLabelPrimary(...process.argv.slice(2));fixture=calibration.report.fixture;
 inputs={primary:process.argv[2],primarySha256:calibration.sha256,checked:process.argv[3],checkedSha256:checked.sha256,nativeInputSha256:native.sha256};
 await save('inputs/primary-report.json',calibration.bytes);await save('inputs/primary-check-report.json',checked.bytes);await ownCalcBundle(native,'native',save);
 const frame=calibration.json('frame.json'),pdf=pathLabelPdfFrame(native,frame);await json('frame.json',frame);await json('pdf-frame.json',pdf);
 for(const file of['calibrate-path-label-pdf.mjs','path-label-pdf-policy.mjs','path-label-qualified-primary.mjs','path-label-image-reference.mjs',
  'path-label-pdf-encoding.mjs','edge-pdf-image-pair.mjs','shape-pdf-trial-policy.mjs','shape-pdf-camera.mjs','shape-raster-metrics.mjs','compare.mjs','browser-profile.json','package-lock.json'])
  await save('source-captures/tools/TikzVisual/'+file,await readFile(path.join(root,'tools/TikzVisual/'+file)));
 renderer=await createRenderer();calcEqual(renderer.identity,calibration.report.renderer,'Changed native renderer.');
 await renderer.page.evaluate('globalThis.shapeRasterMetrics=('+createShapeRasterMetrics.toString()+')()');phase='native-pdf';
 const encodings=new Map();for(const id of pathLabelImageEncodings){
  const svg=await pathLabelPdfEncoding(renderer,calibration.files.get('encodings/'+id+'.svg').toString('utf8'),frame);
  encodings.set(id,svg);await save('encodings/'+id+'.svg',svg);
 }
 const rows=[];
 for(const encoding of['original',...pathLabelImageEncodings])for(const view of shapePdfViews){
  const pair=await measureEdgePdfPair(renderer,{svg:encoding==='original'?native.files.get('probed-reference.svg').toString('utf8'):encodings.get(encoding),
   pdfPage:'data:image/png;base64,'+native.files.get('probed-pdf-page-'+view.scale+'x.png').toString('base64'),...view,...pdf,
   units:encoding==='original'?'bp':'cssPixels',svgOriginBp:encoding==='original'?frame.origin:{x:0,y:0},cropLimit:2,
   rightLabel:encoding==='original'?'Original native SVG':'Independent native encoding'});
  const prefix='views/'+encoding+'/'+view.frame+'/'+view.scale+'x',images={};
  for(const[name,b64]of Object.entries(pair.images)){const file=prefix+'/'+name+'.png';await save(file,Buffer.from(b64,'base64'));images[name]=file;}
  for(const crop of pair.crops)for(const[name,b64]of Object.entries(crop.images))await save(prefix+'/crops/'+crop.id+'/'+name+'.png',Buffer.from(b64,'base64'));
  const {images:ignored,crops,...result}=pair,row={encoding,...result,images},file=prefix+'/record.json';await json(file,row);rows.push(row);records.push({encoding,...view,file});
  console.log(JSON.stringify({phase,encoding,...view,outside:row.outsideWholeChangedPixels,changed:row.whole.rawChangedPixels}));
 }
 await json('policies.json',pathLabelPdfPolicies(rows,pdf));await publish(true,{coverage:{encodings:3,views:12,regions:pdf.regions.length},
  scope:'Frozen native-only original-SVG/PDF and native-encoding/PDF policies. Independent PDF checking, current output and feature acceptance separate.'});
}catch(error){await save('failure.log',String(error.stack??error).replaceAll(root,'<repo>'));await publish(false,{error:error.message});process.exitCode=1;}
finally{await renderer?.browser.close();}
