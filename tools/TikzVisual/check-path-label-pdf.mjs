import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Acceptance gap: independent native PDF policy derivation, registration and source binding.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {root,writeArtifact,sha256} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport,calcEqual} from './calc-saved-images.mjs';
import {loadQualifiedPathLabelPrimary} from './path-label-qualified-primary.mjs';
import {pathLabelPdfFrame,pathLabelImageEncodingIds,buildPathLabelImageReference} from './path-label-image-reference.mjs';
import {pathLabelPdfPolicies} from './path-label-pdf-policy.mjs';
import {pathLabelPdfPixelReader} from './path-label-pdf-pixels.mjs';
import {pathLabelPdfEncoding} from './path-label-pdf-encoding.mjs';
import {createRenderer} from './compare.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {measureEdgePdfPair} from './edge-pdf-image-pair.mjs';
import {shapePdfViews} from './shape-pdf-trial-policy.mjs';

export function verifyPathLabelPdfPixels(bundle){
 assert.equal(bundle.report.converterInvoked,false);assert.equal(bundle.report.nativeToolInvoked,false);
 const ids=pathLabelImageEncodingIds(bundle.json('frame.json')),expected=['original',...ids].flatMap(encoding=>shapePdfViews.map(v=>encoding+'/'+v.frame+'/'+v.scale));
 calcEqual(bundle.report.records.map(r=>r.encoding+'/'+r.frame+'/'+r.scale).sort(),expected.sort(),'Changed native PDF views.');
 const pdf=bundle.json('pdf-frame.json'),read=pathLabelPdfPixelReader(bundle,pdf),rows=bundle.report.records.map(record=>{
  assert.equal(record.file,'views/'+record.encoding+'/'+record.frame+'/'+record.scale+'x/record.json');
  const row=bundle.json(record.file);calcEqual({encoding:row.encoding,frame:row.frame,scale:row.scale,background:row.background},
   {encoding:record.encoding,frame:record.frame,scale:record.scale,background:record.background});return row;
 });calcEqual(pathLabelPdfPolicies(rows,pdf,ids),bundle.json('policies.json'),'Forged native PDF policy.');
 for(const record of bundle.report.records)read(record.file);
 calcEqual(bundle.report.coverage,{encodings:ids.length+1,views:expected.length,regions:pdf.regions.length});return{comparisons:rows.length,regions:rows.length*pdf.regions.length};
}

export async function checkPathLabelPdf(file){
 const bundle=await loadCalcSavedReport(file,'path-label-native-pdf-calibration'),r=bundle.report;
 const {calibration,checked,native}=await loadQualifiedPathLabelPrimary(r.inputs.primary,r.inputs.checked);
 assert.equal(r.inputs.primarySha256,calibration.sha256);assert.equal(r.inputs.checkedSha256,checked.sha256);assert.equal(r.inputs.nativeInputSha256,native.sha256);
 assert.equal(r.fixture,calibration.report.fixture);assert.ok(bundle.files.get('inputs/primary-report.json').equals(calibration.bytes));assert.ok(bundle.files.get('inputs/primary-check-report.json').equals(checked.bytes));
 assert.ok(bundle.files.get('native/report.json').equals(native.bytes));for(const f of Object.keys(native.report.artifacts))assert.ok(bundle.files.get('native/'+f).equals(native.files.get(f)),'Changed native PDF input.');
 for(const [f,b]of bundle.files)if(f.startsWith('source-captures/')&&!f.endsWith('.mjs'))assert.ok(b.equals(await readFile(path.join(root,f.slice(16)))),'Changed PDF calibration dependency: '+f);
 const frame=calibration.json('frame.json');calcEqual(frame,bundle.json('frame.json'));const pdf=pathLabelPdfFrame(native,frame);calcEqual(pdf,bundle.json('pdf-frame.json'),'Changed native PDF registration.');
 const pixels=verifyPathLabelPdfPixels(bundle),renderer=await createRenderer();let recaptured=0;
 try{
  requireRenderer(renderer.identity, r.renderer);await renderer.page.evaluate('globalThis.shapeRasterMetrics=('+createShapeRasterMetrics.toString()+')()');
  const rebuilt=await buildPathLabelImageReference(renderer,native,calibration.json('oracle/native-glyphs.json'),!!frame.nativePathEncoding);
  calcEqual({...rebuilt,encodings:rebuilt.encodings.map(({svg,...e})=>e)},frame,'Current native primary frame differs.');
  for(const encoding of pathLabelImageEncodingIds(frame)){const original=rebuilt.encodings.find(e=>e.id===encoding).svg;
   assert.equal(original,calibration.files.get('encodings/'+encoding+'.svg').toString('utf8'),'Changed independently reconstructed native encoding.');
   const svg=await pathLabelPdfEncoding(renderer,original,frame);
   assert.equal(svg,bundle.files.get('encodings/'+encoding+'.svg').toString('utf8'),'Changed native picture encoding.');}
  for(const record of r.records){const row=bundle.json(record.file),encoding=record.encoding;
   const pair=await measureEdgePdfPair(renderer,{svg:encoding==='original'?native.files.get('probed-reference.svg').toString('utf8'):bundle.files.get('encodings/'+encoding+'.svg').toString('utf8'),
    pdfPage:'data:image/png;base64,'+native.files.get('probed-pdf-page-'+row.scale+'x.png').toString('base64'),...pdf,frame:row.frame,scale:row.scale,
    units:encoding==='original'?'bp':'cssPixels',svgOriginBp:encoding==='original'?frame.origin:{x:0,y:0},cropLimit:0});
   for(const name of['sourceFrame','clipFrame','whole','regions','fullPage','outsideWholeChangedPixels','repeat'])calcEqual(pair[name],row[name],'PDF source recapture differs: '+name);
   assert.ok(Buffer.from(pair.images['svg-page'],'base64').equals(bundle.files.get(row.images['svg-page'])),'PDF source-bound SVG raster differs.');recaptured++;
   console.log(JSON.stringify({phase:'source-recapture',encoding,frame:row.frame,scale:row.scale}));
  }
 }finally{await renderer.browser.close();}return{bundle,pixels,recaptured};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,3,'Usage: node tools/TikzVisual/check-path-label-pdf.mjs <exact-native-PDF-calibration-report>');
 const output=path.join(root,'artifacts/path-label-pdf-check/run-'+randomUUID()),artifacts={},save=(p,b)=>writeArtifact(output,p,b,artifacts);
 async function publish(completed,extra={}){const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'path-label-independent-pdf-check',completed,
  phase:completed?'complete':'checking',converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',artifacts,...extra},null,2)+'\n');
  await writeArtifact(output,'report.json',bytes);console.log(JSON.stringify({completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));}
 await publish(false);try{const result=await checkPathLabelPdf(path.resolve(root,process.argv[2]));await save('input-report.json',result.bundle.bytes);
  for(const name of['check-path-label-pdf.mjs','path-label-pdf-pixels.mjs'])await save('source-captures/tools/TikzVisual/'+name,await readFile(path.join(root,'tools/TikzVisual/'+name)));
  await publish(true,{inputSha256:result.bundle.sha256,pixels:result.pixels,sourceRecaptures:result.recaptured});
 }catch(error){await save('failure.log',String(error.stack??error).replaceAll(root,'<repo>'));await publish(false,{error:error.message});process.exitCode=1;}
}
