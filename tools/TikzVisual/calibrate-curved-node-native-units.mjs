// Independent calibration/sensitivity for the pre-existing native path-unit
// contract. No candidate is loaded and no prior limit or artifact changes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact,readFreshOracle} from './shape-oracle-bundle.mjs';
import {createRenderer} from './compare.mjs';
import {reconstructCurvedNodes} from './curved-node-oracle.mjs';
import {curvedPathRepresentations,curvedPathInstructions,applyCurvedPathInstructions} from './curved-node-path-units.mjs';
import {deriveNativeCurvedPolicies,nativeCurvedMode} from './curved-node-native-unit-policy.mjs';
import {curvedNodeDefects,mutateCurvedNodeSvg} from './curved-node-image-defects.mjs';
import {installShapeMetrics,measureShapePair} from './shape-image-pair.mjs';
import {shapeViews,evaluateShapeTrial} from './shape-primary-trial-policy.mjs';
import {shapePdfViews} from './shape-pdf-trial-policy.mjs';
import {measureCurvedNodePdfPair,evaluateCurvedNodeInkPolicy,curvedInkViewKey} from './curved-node-ink-policy.mjs';
const sourceFile='artifacts/curved-node-path-units/run-f90c193b-95c5-48e6-b082-9d406f5584c1/report.json',sourceSha256='86f9b0c4bdc62fb0b4fd0843627f5c02f1e48c7a9d7f25b428aea2ed4e021f5f';
const base=path.join(root,'artifacts/curved-node-native-unit-calibration'),output=path.join(base,'run-'+randomUUID()),artifacts={},toolHashes={},sourceByteRecords=[],controls=[];
const save=(p,b)=>writeArtifact(output,p,b,artifacts),canonical=b=>Buffer.from(b.toString('utf8').replaceAll('\r\n','\n'));let phase='independent-inputs';
async function publish(r){const b=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(output,'report.json',b);await writeArtifact(base,'latest.json',JSON.stringify({completed:r.completed,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');}
const unclippedRegions=r=>r.regions.map(({crops,...q})=>q);
async function saveImages(prefix,m,pdf){const links={},imageHashes={},crops=new Map();for(const[k,png]of Object.entries(m.images)){const b=Buffer.from(png,'base64');links[k]=prefix+'-'+k+'.png';imageHashes[k]=sha256(b);await save(links[k],b);}
  for(const crop of m.crops){const q={};for(const[k,png]of Object.entries(pdf?crop.images:{...crop.paired,sheet:crop.sheet})){q[k]=prefix+'-'+crop.id+'-'+k+'.png';await save(q[k],Buffer.from(png,'base64'));}crops.set(crop.id,q);}return{artifacts:links,imageHashes,regions:m.regions.map(q=>({...q,crops:crops.get(q.id)??null})),cropCoverage:{saved:crops.size,required:m.regions.length,truncated:crops.size<m.regions.length}};}
async function main(){
  assert.equal(process.argv.length,2);await publish({completed:false,phase,converterInvoked:false,approvedImagePolicy:false});
  const sourceBytes=await readFile(path.join(root,sourceFile));assert.equal(sha256(sourceBytes),sourceSha256);const source=JSON.parse(sourceBytes),sourceFolder=path.dirname(path.join(root,sourceFile));
  assert.equal(source.completed,true);assert.equal(source.converterInvoked,false);assert.equal(source.approvedImagePolicy,false);assert.equal(source.results.length,8);
  for(const[p,h]of Object.entries(source.artifacts))assert.equal(sha256(await readFile(await outputPath(sourceFolder,p))),h);
  Object.assign(toolHashes,source.toolHashes);for(const p of['tools/TikzVisual/curved-node-native-unit-policy.mjs','tools/TikzVisual/calibrate-curved-node-native-units.mjs'])toolHashes[p]=sha256(canonical(await readFile(path.join(root,p))));
  for(const[p,h]of Object.entries(toolHashes)){const raw=await readFile(path.join(root,p)),b=canonical(raw);assert.equal(sha256(b),h);sourceByteRecords.push({...source.sourceBytes.find(s=>s.file===p),file:p,workingRawSha256:sha256(raw),canonicalLfSha256:h});await save('tool-sources/'+p,b);}
  await save('independent-path-unit-experiment.json',sourceBytes);
  const variant=curvedPathRepresentations.find(v=>v.name==='pt-short'),selected=source.results.find(r=>r.variant.name==='pt-short');assert.ok(selected);assert.deepEqual(selected.variant,variant);
  assert.equal(selected.serializationChecks.length,812);assert.ok(selected.serializationChecks.every(c=>c.passed));
  const primaryRows=selected.primaryComparisons.map(r=>({...r,converterInvoked:false})),pdfRows=selected.pdfComparisons.map(r=>({...r,converterInvoked:false,mode:nativeCurvedMode}));
  const policies=deriveNativeCurvedPolicies(primaryRows,pdfRows,source.camera,source.regions);
  const oldInkBytes=await readFile(path.join(sourceFolder,'source-ink-calibration.json'));assert.equal(sha256(oldInkBytes),source.sourceInkCalibration.sha256);const oldInk=JSON.parse(oldInkBytes);policies.originalPdf=oldInk.policies.original;
  await save('original-ink-calibration.json',oldInkBytes);await save('limits.json',JSON.stringify(policies,null,2)+'\n');
  phase='fresh-independent-reconstruction';const oracleFolder=path.join(output,'oracle'),oracle=await readFreshOracle(oracleFolder),renderer=await createRenderer();
  try{
    assert.deepEqual(renderer.identity,source.renderer);await installShapeMetrics(renderer);const r=await reconstructCurvedNodes(renderer,oracleFolder,oracle.derivation);assert.deepEqual(r,source.geometry);
    const native=JSON.parse(await readFile(path.join(oracleFolder,'metrics.json'))),instructions=curvedPathInstructions(native,variant);assert.deepEqual(JSON.parse(JSON.stringify(instructions.checks)),selected.serializationChecks);
    const svg=await applyCurvedPathInstructions(renderer,r.semanticSvg,instructions);assert.equal(svg,await readFile(path.join(sourceFolder,selected.svg),'utf8'));await save('native-pt-short.svg',svg);await save('reference.svg',r.reference);
    const pages={};for(const scale of[1,4]){const b=await readFile(path.join(sourceFolder,'pdf-page-'+scale+'x.png'));pages[scale]='data:image/png;base64,'+b.toString('base64');await save('pdf-page-'+scale+'x.png',b);}
    const capturePrimary=async(name,actual,views,targets=[])=>{const rows=[];for(const view of views){const m=await measureShapePair(renderer,{reference:r.reference,actual,leftIsDriver:true,origin:r.origin,camera:r.camera,regions:r.regions,...view,cropLimit:targets.length||2,cropRegionIds:targets,rightLabel:name});
      rows.push({...view,...m,images:undefined,crops:undefined,converterInvoked:false,...await saveImages(name+'/primary/'+curvedInkViewKey(view),m,false),evaluation:evaluateShapeTrial(policies.primary,view,m)});}return rows;};
    const capturePdf=async(name,actual,views,targets=[],original=false)=>{const rows=[];for(const view of views){const m=await measureCurvedNodePdfPair(renderer,{svg:actual,units:original?'bp':'cssPixels',svgOriginBp:original?r.origin:{x:0,y:0},camera:source.camera,regions:source.regions,...view,pdfPage:pages[view.scale],cropLimit:targets.length||2,cropRegionIds:targets});
      rows.push({...m,images:undefined,crops:undefined,mode:original?'original-driver':nativeCurvedMode,converterInvoked:false,...await saveImages(name+'/PDF/'+curvedInkViewKey(view),m,true),evaluation:evaluateCurvedNodeInkPolicy(original?policies.originalPdf:policies.nativePdf,view,m)});}return rows;};
    phase='independent-replays';const primaryReplay=await capturePrimary('native-replay',svg,shapeViews),pdfReplay=await capturePdf('native-replay',svg,shapePdfViews),originalReplay=await capturePdf('original-replay',r.reference,shapePdfViews,[],true);
    for(const row of primaryReplay){const old=selected.primaryComparisons.find(q=>curvedInkViewKey(q)===curvedInkViewKey(row));assert.deepEqual(row.metrics,old.metrics);assert.deepEqual(unclippedRegions(row),unclippedRegions(old));assert.equal(row.imageHashes.actual,source.artifacts[old.artifacts.actual]);assert.equal(row.evaluation.passed,true);}
    for(const rows of[pdfReplay,originalReplay])for(const row of rows){const old=(row.mode===nativeCurvedMode?selected.pdfComparisons:oldInk.observations.original).find(q=>curvedInkViewKey(q)===curvedInkViewKey(row));assert.deepEqual(row.whole,old.whole);assert.deepEqual(unclippedRegions(row),unclippedRegions(old));assert.equal(row.evaluation.passed,true);if(row.mode===nativeCurvedMode)assert.equal(row.imageHashes['svg-page'],source.artifacts[old.artifacts['svg-page']]);}
    const classify=(d,rows)=>rows.map(row=>{const target=d.target?row.evaluation.checks.find(c=>c.id===d.target):null;return{...Object.fromEntries(['frame','scale','background'].map(k=>[k,row[k]])),rejected:!row.evaluation.passed,targetRejected:target?!target.passed:null,failingRegions:row.evaluation.checks.filter(c=>!c.passed).map(c=>c.id)};});
    for(const d of curvedNodeDefects(r.indexes)){
      phase='independent-defect/'+d.name;const changed=await renderer.page.evaluate(mutateCurvedNodeSvg,{actual:svg,defect:d,indexes:r.indexes});await save('defects/'+d.name+'.svg',changed);
      const pViews=shapeViews.filter(v=>v.background==='white'&&(!d.naturalOnly||v.frame==='natural')),fViews=shapePdfViews.filter(v=>!d.naturalOnly||v.frame==='natural'),targets=d.target&&!d.pdfOnly?[d.target]:[];
      const primary=d.pdfOnly?[]:await capturePrimary('defects/'+d.name,changed,pViews,targets),pdf=await capturePdf('defects/'+d.name,changed,fViews,targets),pResults=classify(d,primary),fResults=classify(d,pdf),passed=[...pResults,...fResults].every(v=>v.rejected&&(v.targetRejected??true));
      controls.push({...d,converterInvoked:false,numericGatesBypassed:true,inputSha256:sha256(changed),passed,primaryViews:pResults,pdfViews:fResults,primaryComparisons:primary,pdfComparisons:pdf});console.log(d.name+': '+(passed?'all required targets reject':'UNEXPECTED acceptance retained'));
    }
    for(const name of['unpainted-cap','unpainted-solid-phase']){
      phase='independent-visibility/'+name;const changed=await renderer.page.evaluate(mutateCurvedNodeSvg,{actual:svg,defect:{name},indexes:r.indexes});await save('visibility/'+name+'.svg',changed);
      const primary=await capturePrimary('visibility/'+name,changed,shapeViews.filter(v=>v.background==='white')),pdf=await capturePdf('visibility/'+name,changed,shapePdfViews),passed=primary.every(row=>row.evaluation.passed&&row.imageHashes.actual===primaryReplay.find(v=>curvedInkViewKey(v)===curvedInkViewKey(row)).imageHashes.actual)&&pdf.every(row=>row.evaluation.passed&&row.imageHashes['svg-page']===pdfReplay.find(v=>curvedInkViewKey(v)===curvedInkViewKey(row)).imageHashes['svg-page']);
      controls.push({name,converterInvoked:false,numericGatesBypassed:true,inputSha256:sha256(changed),passed,expectedExactPixels:true,primaryComparisons:primary,pdfComparisons:pdf});console.log(name+': '+(passed?'pixels exact':'UNEXPECTED visibility retained'));
    }
    phase='final-integrity';await oracle.verify();for(const[p,h]of Object.entries(oracle.derivation.evidence.artifacts))artifacts['oracle/'+p]=h;artifacts['oracle/derivation.json']=sha256(oracle.bytes);
    for(const[p,h]of Object.entries(toolHashes))assert.equal(sha256(canonical(await readFile(path.join(root,p)))),h);assert.equal(sha256(await readFile(path.join(root,sourceFile))),sourceSha256);
    const passed=controls.every(c=>c.passed);await save('index.html','<!doctype html><meta charset="utf-8"><h1>Independent native-unit curved-node calibration</h1><p>Short native PGF paths; no converter or admission.</p><a href="report.json">Report</a>'+controls.map(c=>'<h2>'+c.name+': '+(c.passed?'expected outcome':'UNEXPECTED')+'</h2>'+[...c.primaryComparisons,...c.pdfComparisons].map(row=>'<p>'+curvedInkViewKey(row)+'</p>'+row.regions.filter(q=>q.crops).map(q=>'<p>'+q.id+'</p><img loading="lazy" src="'+q.crops.sheet+'">').join('')).join('')).join(''));
    for(const[p,h]of Object.entries(artifacts))assert.equal(sha256(await readFile(await outputPath(output,p))),h);
    await publish({schemaVersion:1,comparisonKind:'oracle-only-curved-node-native-unit-calibration',completed:true,sensitivityPassed:passed,verdict:passed?'independent-trial-pass':'independent-trial-failed',overallVerdict:'pending',converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,sourceCalibration:{file:sourceFile,sha256:sourceSha256},sourceByteContract:source.sourceByteContract,sourceBytes:sourceByteRecords,toolHashes,renderer:renderer.identity,selectedRepresentation:variant,serializationChecks:instructions.checks,geometry:r,camera:source.camera,regions:source.regions,policies,observations:{primary:primaryRows,nativePdf:pdfRows,originalPdf:oldInk.observations.original},replays:{primary:primaryReplay,nativePdf:pdfReplay,originalPdf:originalReplay},controls,priorCssLimitsUnchanged:true,originalPdfPolicyUnchanged:true,artifacts});
    process.exitCode=passed?0:1;console.log('Independent native-unit sensitivity: '+(passed?'pass':'unexpected outcomes retained')+'; '+path.relative(root,output));
  }finally{await renderer.browser.close();}
}
await main().catch(async error=>{process.exitCode=2;console.error(error.stack?.slice(0,5000)??error.message);await publish({completed:false,phase,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,error:error.message.slice(0,5000),toolHashes,completedControls:controls.map(c=>({name:c.name,passed:c.passed})),artifacts});});
