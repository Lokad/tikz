// Explicit follow-up to retained independent sensitivity failure. This adds
// measurements; no old error row, image, reference or allowance is rewritten.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';
import {shapePdfViews,shapePdfMetricRecord} from './shape-pdf-trial-policy.mjs';
import {measureCurvedNodeInk,attachCurvedNodeInk,deriveCurvedNodeInkPolicy,evaluateCurvedNodeInkPolicy,measureCurvedNodePdfPair,curvedInkViewKey} from './curved-node-ink-policy.mjs';

const sourceFile='artifacts/curved-node-conformance-calibration/run-e4ca121b-1a2a-4eaf-ba6c-d1b72a21bcf0/report.json',sourceSha256='13741713b66dac5cf4b414cededebd31bbeba8773d87a97aace5f3a2211d1745';
const base=path.join(root,'artifacts/curved-node-ink-calibration'),output=path.join(base,'run-'+randomUUID()),artifacts={},toolHashes={},controls=[];
const save=(p,b)=>writeArtifact(output,p,b,artifacts);let phase='independent-inputs';
const prefixLinks=links=>Object.fromEntries(Object.entries(links).map(([k,p])=>[k,'previous/'+p]));
const prefixRow=row=>({...row,artifacts:prefixLinks(row.artifacts),regions:row.regions.map(q=>({...q,crops:q.crops?prefixLinks(q.crops):null}))});
async function publish(r){const b=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(output,'report.json',b);await writeArtifact(base,'latest.json',JSON.stringify({completed:r.completed,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');}
async function main(){
  assert.equal(process.argv.length,2);const bytes=await readFile(path.join(root,sourceFile));assert.equal(sha256(bytes),sourceSha256);
  const source=JSON.parse(bytes),folder=path.dirname(path.join(root,sourceFile));assert.equal(source.completed,true);assert.equal(source.sensitivityPassed,false);assert.equal(source.converterInvoked,false);assert.equal(source.approvedImagePolicy,false);
  assert.deepEqual(source.controls.filter(c=>!c.passed).map(c=>c.name),['faint-glyph-loss']);
  for(const[p,h]of Object.entries(source.artifacts)){const b=await readFile(await outputPath(folder,p));assert.equal(sha256(b),h,'Changed failed experiment: '+p);await save('previous/'+p,b);}
  Object.assign(toolHashes,source.toolHashes);for(const p of ['calibrate-curved-node-ink.mjs','curved-node-ink-policy.mjs'].map(p=>'tools/TikzVisual/'+p))toolHashes[p]=sha256(await readFile(path.join(root,p)));
  for(const[p,h]of Object.entries(toolHashes)){const b=await readFile(path.join(root,p));assert.equal(sha256(b),h);await save('tool-sources/'+p,b);}
  await save('previous/report.json',bytes);
  const renderer=await createRenderer();
  try{
    assert.deepEqual(renderer.identity,source.renderer);await installShapeMetrics(renderer);
    const camera=source.pdf.camera,regions=source.pdf.regions,pages={};
    for(const scale of[1,4])pages[scale]='data:image/png;base64,'+(await readFile(path.join(folder,'pdf-page-'+scale+'x.png'))).toString('base64');
    const add=async row=>{
      const b=await readFile(await outputPath(folder,row.artifacts['svg-page']));assert.equal(sha256(b),source.artifacts[row.artifacts['svg-page']]);
      const coverage=await measureCurvedNodeInk(renderer,{reference:pages[row.scale],actual:'data:image/png;base64,'+b.toString('base64'),regions,scale:row.scale,pageSize:row.pageSize});
      return attachCurvedNodeInk(prefixRow(row),coverage);
    };
    phase='independent-baseline-ink';const original=[],native=[];
    for(const row of source.pdf.originalReplays)original.push({...await add(row),mode:'original-driver'});
    for(const row of source.pdf.nativeReplays)native.push({...await add(row),mode:'native-semantic-css-6'});
    const policies={original:deriveCurvedNodeInkPolicy(original,camera,regions,'original-driver'),native:deriveCurvedNodeInkPolicy(native,camera,regions,'native-semantic-css-6')};
    for(const name of['original','native'])assert.deepEqual(policies[name].rows,source.pdf.policies[name].rows,'Old error limits changed.');
    await save('limits.json',JSON.stringify(policies,null,2)+'\n');
    for(const row of[...original,...native])assert.equal(evaluateCurvedNodeInkPolicy(row.mode==='original-driver'?policies.original:policies.native,row,row).passed,true);
    const replay=[];
    for(const view of shapePdfViews){
      const old=native.find(r=>curvedInkViewKey(r)===curvedInkViewKey(view)),measured=await measureCurvedNodePdfPair(renderer,{svg:source.geometry.semanticSvg,units:'cssPixels',svgOriginBp:{x:0,y:0},camera,regions,...view,pdfPage:pages[view.scale],cropLimit:0});
      assert.deepEqual(shapePdfMetricRecord(measured.whole),shapePdfMetricRecord(old.whole));assert.deepEqual(measured.regions.map(shapePdfMetricRecord),old.regions.map(shapePdfMetricRecord));
      assert.deepEqual([measured.whole,...measured.regions].map(r=>r.inkCoverage),[old.whole,...old.regions].map(r=>r.inkCoverage));
      assert.equal(sha256(Buffer.from(measured.images['svg-page'],'base64')),old.imageHashes['svg-page']);
      replay.push({...view,passed:true,regions:99,exactNativePagePng:true,inkCoverageExact:true});
    }
    for(const c of source.controls){
      phase='independent-ink-control/'+c.name;const rows=[];
      for(const old of c.pdfComparisons){const row=await add(old);row.evaluation=evaluateCurvedNodeInkPolicy(policies.native,row,row);rows.push(row);}
      const visibility=c.expectedExactPixels===true,views=rows.map(row=>{const target=c.target?row.evaluation.checks.find(q=>q.id===c.target):null;
        return{...Object.fromEntries(['frame','scale','background'].map(k=>[k,row[k]])),rejected:!row.evaluation.passed,targetRejected:target?!target.passed:null,failingRegions:row.evaluation.checks.filter(q=>!q.passed).map(q=>q.id)};});
      const passed=visibility?rows.every(r=>r.evaluation.passed):views.every(v=>v.rejected&&(v.targetRejected??true));
      controls.push({...c,passed,pdfViews:views,pdfComparisons:rows,primaryComparisons:c.primaryComparisons.map(prefixRow)});
      console.log(c.name+': '+(passed?'expected primary/PDF outcome':'UNEXPECTED outcome retained'));
    }
    // Freshly rerender the defect that exposed the blind spot at both frames.
    const faint=controls.find(c=>c.name==='faint-glyph-loss'),svg=await readFile(path.join(folder,'defects/faint-glyph-loss.svg'),'utf8'),fresh=[];
    for(const view of shapePdfViews.filter(v=>v.scale===1)){
      const m=await measureCurvedNodePdfPair(renderer,{svg,units:'cssPixels',svgOriginBp:{x:0,y:0},camera,regions,...view,pdfPage:pages[view.scale],cropLimit:1,cropRegionIds:['glyph-5']});
      const old=faint.pdfComparisons.find(r=>curvedInkViewKey(r)===curvedInkViewKey(view));assert.deepEqual(m.whole.inkCoverage,old.whole.inkCoverage);assert.deepEqual(m.regions.map(r=>r.inkCoverage),old.regions.map(r=>r.inkCoverage));
      assert.equal(sha256(Buffer.from(m.images['svg-page'],'base64')),old.imageHashes['svg-page']);const evaluation=evaluateCurvedNodeInkPolicy(policies.native,view,m);assert.equal(evaluation.checks.find(q=>q.id==='glyph-5').passed,false);
      const crop=m.crops[0],links={};for(const[k,png]of Object.entries(crop.images)){links[k]='fresh-faint/'+curvedInkViewKey(view)+'-'+k+'.png';await save(links[k],Buffer.from(png,'base64'));}
      fresh.push({...view,passed:true,oldPixelsExactlyReproduced:true,region:'glyph-5',crops:links,evaluation});
    }
    phase='final-integrity';for(const[p,h]of Object.entries(toolHashes))assert.equal(sha256(await readFile(path.join(root,p))),h);
    assert.equal(sha256(await readFile(path.join(root,sourceFile))),sourceSha256);
    const passed=controls.every(c=>c.passed);await save('index.html','<!doctype html><meta charset="utf-8"><h1>Independent curved-node ink gate</h1><p>Original error limits unchanged; admission pending.</p><a href="report.json">Report</a> · <a href="previous/index.html">Retained failed experiment</a>'+fresh.map(r=>'<h2>Faint period / '+curvedInkViewKey(r)+'</h2><img src="'+r.crops.sheet+'">').join(''));
    for(const[p,h]of Object.entries(artifacts))assert.equal(sha256(await readFile(await outputPath(output,p))),h);
    await publish({schemaVersion:1,comparisonKind:'oracle-only-curved-node-ink-calibration',completed:true,sensitivityPassed:passed,verdict:passed?'independent-trial-pass':'independent-trial-failed',overallVerdict:'pending',converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
      sourceCalibration:{file:sourceFile,sha256:sourceSha256},toolHashes,renderer:renderer.identity,camera,regions,policies,observations:{original,native},replay,freshFaintReplays:fresh,controls,oldErrorRowsUnchanged:true,artifacts});
    process.exitCode=passed?0:1;console.log('Independent curved-node ink calibration: '+(passed?'pass':'unexpected outcomes retained')+'; '+path.relative(root,output));
  }finally{await renderer.browser.close();}
}
await main().catch(async error=>{process.exitCode=2;console.error(error.stack?.slice(0,5000)??error.message);await publish({completed:false,phase,verdict:'infrastructure-error',converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,error:error.message.slice(0,5000),toolHashes,controls:controls.map(c=>({name:c.name,passed:c.passed})),artifacts});});
