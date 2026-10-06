// Independent calibration and sensitivity. No public converter is invoked.
// This command writes ignored evidence and grants no admission or tolerance.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact,readFreshOracle} from './shape-oracle-bundle.mjs';
import {createRenderer} from './compare.mjs';
import {reconstructCurvedNodes} from './curved-node-oracle.mjs';
import {curvedNodeDefects,mutateCurvedNodeSvg} from './curved-node-image-defects.mjs';
import {installShapeMetrics,measureShapePair} from './shape-image-pair.mjs';
import {shapeViews,deriveShapeTrialPolicy,evaluateShapeTrial} from './shape-primary-trial-policy.mjs';
import {shapePdfPageCamera,shapePdfRegions} from './shape-pdf-camera.mjs';
import {measureShapePdfPair} from './shape-pdf-image-pair.mjs';
import {shapePdfViews,deriveShapePdfTrialPolicy,evaluateShapePdfTrial,shapePdfMetricRecord} from './shape-pdf-trial-policy.mjs';

const sourceFile='artifacts/node-shape-pdf-calibration/run-1da41cda-31e2-4b07-9c81-49615b2305c0/report.json';
const sourceSha256='370a14d497bc2d9731fdbab62cedf382fa85d4db80fdca14d2ad85c57008553b';
const base=path.join(root,'artifacts/curved-node-conformance-calibration'),output=path.join(base,'run-'+randomUUID()),artifacts={},toolHashes={},observations=[],controls=[];
const save=(p,b)=>writeArtifact(output,p,b,artifacts),key=v=>v.frame+'-'+v.scale+'x-'+v.background;
let phase='independent-inputs';
async function publish(report){const b=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',b);await writeArtifact(base,'latest.json',JSON.stringify({completed:report.completed,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');}
async function verifyAssets(folder,entries){for(const[p,h]of Object.entries(entries))assert.equal(sha256(await readFile(await outputPath(folder,p))),h,'Changed independent artifact: '+p);}
async function main(){
  assert.equal(process.argv.length,2);await publish({completed:false,phase,converterInvoked:false,approvedImagePolicy:false});
  const sourceBytes=await readFile(path.join(root,sourceFile));assert.equal(sha256(sourceBytes),sourceSha256);
  const source=JSON.parse(sourceBytes),sourceFolder=path.dirname(path.join(root,sourceFile));
  assert.equal(source.completed,true);assert.equal(source.converterInvoked,false);assert.equal(source.approvedImagePolicy,false);assert.equal(source.measurements.length,28);
  await verifyAssets(sourceFolder,source.artifacts);
  const frameBytes=await readFile(await outputPath(sourceFolder,source.independentEvidence.frames)),oldFrames=JSON.parse(frameBytes),
    derivationBytes=await readFile(await outputPath(sourceFolder,source.independentEvidence.derivation)),oldDerivation=JSON.parse(derivationBytes);
  assert.equal(sha256(frameBytes),source.independentEvidence.framesSha256);assert.equal(sha256(derivationBytes),source.independentEvidence.derivationSha256);
  await verifyAssets(path.join(sourceFolder,'oracle'),{...oldDerivation.evidence.artifacts,...oldFrames.artifacts});
  const ownTools=['calibrate-curved-node-conformance.mjs','curved-node-oracle.mjs','curved-node-image-defects.mjs','shape-primary-trial-policy.mjs'].map(p=>'tools/TikzVisual/'+p);
  Object.assign(toolHashes,source.toolHashes,oldFrames.toolHashes,oldDerivation.evidence.toolHashes);
  for(const p of ownTools)toolHashes[p]=sha256(await readFile(path.join(root,p)));
  for(const[p,h]of Object.entries(toolHashes)){const b=await readFile(path.join(root,p));assert.equal(sha256(b),h,'Changed independent source: '+p);await save('tool-sources/'+p,b);}
  await save('source-calibration-report.json',sourceBytes);await save('source-frames.json',frameBytes);await save('source-derivation.json',derivationBytes);
  phase='cached-PDF-validation';
  const cached=spawnSync('dotnet',['run','--project','tools/TikzShapePdfReference','-c','Release','--no-restore','--','check-cached'],{cwd:root,windowsHide:true,timeout:180000,maxBuffer:1000000});
  await save('cached-PDF-command.txt',Buffer.concat([cached.stdout??Buffer.alloc(0),cached.stderr??Buffer.alloc(0)]));assert.equal(cached.error,undefined);assert.equal(cached.status,0);
  phase='fresh-independent-reconstruction';const oracleFolder=path.join(output,'oracle'),oracle=await readFreshOracle(oracleFolder);
  Object.assign(toolHashes,oracle.derivation.evidence.toolHashes);
  const renderer=await createRenderer();
  try{
    assert.deepEqual(renderer.identity,source.renderer);await installShapeMetrics(renderer);
    const r=await reconstructCurvedNodes(renderer,oracleFolder,oracle.derivation);
    assert.deepEqual(r.frames,oldFrames.frames);assert.deepEqual(r.checks,oldFrames.checks);assert.deepEqual(r.camera,oldFrames.camera);
    assert.equal(r.semanticSvg,await readFile(path.join(sourceFolder,'native-semantic-css-6.svg'),'utf8'));
    assert.equal(r.reference,await readFile(path.join(sourceFolder,'original-driver.svg'),'utf8'));
    const pdfMetricsBytes=await readFile(path.join(root,'tests/Reference/NodeShapes/pdf/metrics.json')),pdf=JSON.parse(pdfMetricsBytes);
    assert.equal(pdf.nativeRecordCount,1810);assert.equal(pdf.converterInvoked,false);
    const pdfCamera=shapePdfPageCamera(pdf.measurement,pdf.rasterSizes),pdfRegions=shapePdfRegions(r,pdfCamera),pdfPages={};
    assert.deepEqual(pdfCamera,source.camera);assert.deepEqual(pdfRegions,source.regions);
    await save('independent-reconstruction.json',JSON.stringify(r,null,2)+'\n');await save('native-semantic.svg',r.semanticSvg);await save('pdf-metrics.json',pdfMetricsBytes);
    for(const scale of[1,4]){const p='pdf-page-'+scale+'x.png',b=await readFile(path.join(root,'tests/Reference/NodeShapes/pdf',p));assert.equal(sha256(b),source.artifacts[p]);pdfPages[scale]='data:image/png;base64,'+b.toString('base64');await save(p,b);}
    const recordPrimary=(m,view)=>({...view,converterInvoked:false,metrics:m.metrics,regions:m.regions.map(({crops,...r})=>r),repeat:m.repeat,naturalFrames:m.naturalFrames});
    const pRows=[];
    phase='primary-measurements';
    for(const view of shapeViews){const m=await measureShapePair(renderer,{reference:r.reference,actual:r.semanticSvg,leftIsDriver:true,origin:r.origin,camera:r.camera,regions:r.regions,...view,cropLimit:0});pRows.push(recordPrimary(m,view));}
    const primary=deriveShapeTrialPolicy(pRows.map(v=>({...v,...v.metrics})), 'Only the fixed 28 curved nodes; native semantic six-decimal reconstruction; all original primary view/region observations, no added margin.');
    const pdfPolicies=Object.fromEntries([['original','original-driver'],['native','native-semantic-css-6']].map(([name,mode])=>[name,deriveShapePdfTrialPolicy(source.measurements.filter(m=>m.mode===mode),pdfCamera,pdfRegions,mode)]));
    await save('limits.json',JSON.stringify({primary,pdf:pdfPolicies},null,2)+'\n');
    const capturePrimary=async(name,svg,views,policy,targets=[])=>{
      const rows=[];for(const view of views){const m=await measureShapePair(renderer,{reference:r.reference,actual:svg,leftIsDriver:true,origin:r.origin,camera:r.camera,regions:r.regions,...view,cropLimit:targets.length||2,cropRegionIds:targets,rightLabel:name}),links={},imageHashes={},crops=new Map(),stem=name+'/primary/'+key(view);
        for(const[k,png]of Object.entries(m.images)){const b=Buffer.from(png,'base64');links[k]=stem+'-'+k+'.png';imageHashes[k]=sha256(b);await save(links[k],b);}
        for(const crop of m.crops){const q={};for(const[k,png]of Object.entries({...crop.paired,sheet:crop.sheet})){q[k]=stem+'-'+crop.id+'-'+k+'.png';await save(q[k],Buffer.from(png,'base64'));}crops.set(crop.id,q);}
        rows.push({...recordPrimary(m,view),imageHashes,artifacts:links,regions:m.regions.map(q=>({...q,crops:crops.get(q.id)??null})),evaluation:evaluateShapeTrial(policy,view,m)});
      }return rows;
    };
    const capturePdf=async(name,svg,views,policy,targets=[],units='cssPixels',origin={x:0,y:0})=>{
      const rows=[];for(const view of views){const m=await measureShapePdfPair(renderer,{svg,units,svgOriginBp:origin,camera:pdfCamera,regions:pdfRegions,...view,pdfPage:pdfPages[view.scale],cropLimit:targets.length||2,cropRegionIds:targets,rightLabel:name}),links={},imageHashes={},crops=new Map(),stem=name+'/PDF/'+key(view);
        for(const[k,png]of Object.entries(m.images)){const b=Buffer.from(png,'base64');links[k]=stem+'-'+k+'.png';imageHashes[k]=sha256(b);await save(links[k],b);}
        for(const crop of m.crops){const q={};for(const[k,png]of Object.entries(crop.images)){q[k]=stem+'-'+crop.id+'-'+k+'.png';await save(q[k],Buffer.from(png,'base64'));}crops.set(crop.id,q);}
        rows.push({...m,images:undefined,crops:undefined,converterInvoked:false,imageHashes,artifacts:links,regions:m.regions.map(q=>({...q,crops:crops.get(q.id)??null})),evaluation:evaluateShapePdfTrial(policy,view,m)});
      }return rows;
    };
    phase='independent-replays';const pReplay=await capturePrimary('native-replay',r.semanticSvg,shapeViews,primary);
    for(const row of pReplay){const old=pRows.find(v=>key(v)===key(row));assert.deepEqual(row.metrics,old.metrics);assert.deepEqual(row.regions.map(({crops,...r})=>r),old.regions);assert.equal(row.evaluation.passed,true);}
    const originalPdf=await capturePdf('original-replay',r.reference,shapePdfViews,pdfPolicies.original,[],'bp',r.origin),nativePdf=await capturePdf('native-replay',r.semanticSvg,shapePdfViews,pdfPolicies.native);
    for(const[mode,rows]of[['original-driver',originalPdf],['native-semantic-css-6',nativePdf]])for(const row of rows){const old=source.measurements.find(m=>m.mode===mode&&key(m)===key(row));assert.deepEqual(shapePdfMetricRecord(row.whole),shapePdfMetricRecord(old.whole));assert.deepEqual(row.regions.map(shapePdfMetricRecord),old.regions.map(shapePdfMetricRecord));assert.deepEqual(row.fullPage,old.fullPage);assert.equal(row.evaluation.passed,true);}
    const classify=(defect,rows)=>rows.map(row=>{const target=defect.target?row.evaluation.checks.find(c=>c.id===defect.target):null;return{...Object.fromEntries(['frame','scale','background'].map(k=>[k,row[k]])),rejected:!row.evaluation.passed,targetRejected:target?!target.passed:null,failingRegions:row.evaluation.checks.filter(c=>!c.passed).map(c=>c.id)};});
    for(const d of curvedNodeDefects(r.indexes)){
      phase='independent-defect/'+d.name;const svg=await renderer.page.evaluate(mutateCurvedNodeSvg,{actual:r.semanticSvg,defect:d,indexes:r.indexes});await save('defects/'+d.name+'.svg',svg);
      const pViews=shapeViews.filter(v=>v.background==='white'&&(!d.naturalOnly||v.frame==='natural')),fViews=shapePdfViews.filter(v=>!d.naturalOnly||v.frame==='natural'),targets=d.target&&!d.pdfOnly?[d.target]:[];
      const p=d.pdfOnly?[]:await capturePrimary('defects/'+d.name,svg,pViews,primary,targets),f=await capturePdf('defects/'+d.name,svg,fViews,pdfPolicies.native,targets),pResults=classify(d,p),fResults=classify(d,f);
      const passed=[...pResults,...fResults].every(v=>v.rejected&&(v.targetRejected??true));
      controls.push({...d,converterInvoked:false,numericGatesBypassed:true,inputSha256:sha256(svg),passed,primaryViews:pResults,pdfViews:fResults,primaryComparisons:p,pdfComparisons:f});
      console.log(d.name+': '+(passed?'all required targets reject':'UNEXPECTED acceptance retained'));
    }
    for(const name of['unpainted-cap','unpainted-solid-phase']){
      phase='independent-visibility/'+name;const d={name},svg=await renderer.page.evaluate(mutateCurvedNodeSvg,{actual:r.semanticSvg,defect:d,indexes:r.indexes});await save('visibility/'+name+'.svg',svg);
      const p=await capturePrimary('visibility/'+name,svg,shapeViews.filter(v=>v.background==='white'),primary),f=await capturePdf('visibility/'+name,svg,shapePdfViews,pdfPolicies.native);
      const passed=p.every(row=>row.evaluation.passed&&row.imageHashes.actual===pReplay.find(v=>key(v)===key(row)).imageHashes.actual)&&f.every(row=>row.evaluation.passed&&row.imageHashes['svg-page']===nativePdf.find(v=>key(v)===key(row)).imageHashes['svg-page']);
      controls.push({name,converterInvoked:false,numericGatesBypassed:true,inputSha256:sha256(svg),passed,expectedExactPixels:true,primaryComparisons:p,pdfComparisons:f});console.log(name+': '+(passed?'pixels exact':'UNEXPECTED visible change retained'));
    }
    phase='final-integrity';await oracle.verify();await verifyAssets(sourceFolder,source.artifacts);
    for(const[p,h]of Object.entries(toolHashes)){const b=await readFile(path.join(root,p));assert.equal(sha256(b),h);await save('tool-sources/'+p,b);}
    // Preserve the complete fresh independent reconstruction chain.
    for(const[p,h]of Object.entries(oracle.derivation.evidence.artifacts))artifacts['oracle/'+p]=h;
    const dBytes=await readFile(path.join(oracleFolder,'derivation.json'));artifacts['oracle/derivation.json']=sha256(dBytes);
    const passed=controls.every(c=>c.passed);await save('index.html','<!doctype html><meta charset="utf-8"><h1>Independent curved-node sensitivity</h1><p>Admission pending; no converter invoked.</p><a href="report.json">Report</a>'+controls.map(c=>'<h2>'+c.name+': '+(c.passed?'expected outcome':'UNEXPECTED')+'</h2>'+[...c.primaryComparisons,...c.pdfComparisons].map(row=>'<p>'+key(row)+'</p>'+row.regions.filter(q=>q.crops).map(q=>'<p>'+q.id+'</p><img loading="lazy" src="'+q.crops.sheet+'">').join('')).join('')).join(''));
    await verifyAssets(output,artifacts);
    await publish({schemaVersion:1,comparisonKind:'oracle-only-curved-node-conformance-calibration',completed:true,sensitivityPassed:passed,verdict:passed?'independent-trial-pass':'independent-trial-failed',overallVerdict:'pending',converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
      sourceCalibration:{file:sourceFile,sha256:sourceSha256},toolHashes,renderer:renderer.identity,derivationSha256:sha256(dBytes),geometry:r,primary:{observations:pRows,replays:pReplay,policy:primary},pdf:{camera:pdfCamera,regions:pdfRegions,policies:pdfPolicies,originalReplays:originalPdf,nativeReplays:nativePdf},controls,artifacts});
    process.exitCode=passed?0:1;console.log('Independent curved-node sensitivity: '+(passed?'pass':'unexpected outcomes retained')+'; '+path.relative(root,output));
  }finally{await renderer.browser.close();}
}
await main().catch(async error=>{process.exitCode=2;console.error(error.stack?.slice(0,5000)??error.message);await publish({completed:false,phase,verdict:'infrastructure-error',converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,error:error.message.slice(0,5000),toolHashes,controls,artifacts});});
