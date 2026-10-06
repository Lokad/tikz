// Cached immutable conformance through the public converter API.
// All evidence is validated before conversion; no live reference processes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics,measureShapePair} from './shape-image-pair.mjs';
import {shapeViews} from './shape-primary-trial-policy.mjs';
import {shapePdfViews} from './shape-pdf-trial-policy.mjs';
import {evaluateCurvedNodeInkPolicy,measureCurvedNodePdfPair,curvedInkViewKey} from './curved-node-ink-policy.mjs';
import {curvedNodeDefects,mutateCurvedNodeSvg} from './curved-node-image-defects.mjs';
import {loadCurvedPolicy,evaluateCurvedPrimary,combineCurvedNodes,curvedCalibrationSha256,curvedCanonical} from './curved-node-admission-policy.mjs';
import {unionBounds} from './shape-frame-math.mjs';
const canonical=curvedCanonical;
const base=path.join(root,'artifacts/curved-node-conformance'),output=path.join(base,'run-'+randomUUID()),artifacts={},toolHashes={};
const save=(p,b)=>writeArtifact(output,p,b,artifacts);let phase='independent-inputs';
async function publish(r){const b=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(output,'report.json',b);await writeArtifact(base,'latest.json',JSON.stringify({completed:r.completed,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');}
async function main(){
  assert.ok(process.argv.length===2||(process.argv.length===4&&process.argv[2]==='--crop-region'));
  const focus=process.argv.length===4?process.argv[3]:null;
  const renderer=await createRenderer();try{
  const e=await loadCurvedPolicy(renderer,path.join(output,'oracle')),c=e.calibration;
  Object.assign(toolHashes,c.toolHashes,e.profile.guardToolHashes);
  for(const[p,h]of Object.entries(toolHashes)){const b=canonical(await readFile(path.join(root,p)));assert.equal(sha256(b),h);await save('tool-sources/'+p,b);}
  const r=e.reconstruction;
  if(focus!==null)assert.ok(r.regions.some(q=>q.id===focus),'Unknown trusted crop region.');
  await save('independent-calibration.json.gz',e.compressed);await save('profile.json',e.profileBytes);
  phase='public-candidate';const candidateFolder=path.join(output,'candidate'),command=['run','--project','tools/TikzShapeComparison','-c','Release','--no-restore','--','compare-numeric','--out',path.relative(root,candidateFolder)];
  const child=spawnSync('dotnet',command,{cwd:root,windowsHide:true,timeout:180000,maxBuffer:1000000});await save('candidate-command.txt',Buffer.concat([child.stdout??Buffer.alloc(0),child.stderr??Buffer.alloc(0)]));assert.equal(child.error,undefined);assert.ok([0,1].includes(child.status));
  const nBytes=await readFile(path.join(candidateFolder,'report.json')),n=JSON.parse(nBytes);assert.equal(n.completed,true);assert.equal(n.numeric.checks.length,4461);
  const pBytes=await readFile(await outputPath(candidateFolder,n.provenance)),p=JSON.parse(pBytes);assert.equal(sha256(pBytes),n.provenanceSha256);
  assert.equal(p.converterAssemblySha256,sha256(await readFile(path.join(root,'src/Lokad.TikZ/bin/Release/net10.0/Lokad.TikZ.dll'))));
  assert.ok(p.converterAssemblyReferences.every(n=>n==='System'||n.startsWith('System.')),'Unexpected production dependency.');
  for(const[file,h]of Object.entries(p.artifacts)){const b=await readFile(await outputPath(candidateFolder,file));assert.equal(sha256(b),h);artifacts['candidate/'+file]=h;}
  artifacts['candidate/report.json']=sha256(nBytes);artifacts['candidate/'+n.provenance]=sha256(pBytes);
  const actual=await readFile(path.join(candidateFolder,'actual.svg'),'utf8'),scene=JSON.parse(await readFile(path.join(candidateFolder,'actual-scene.json')));assert.deepEqual([scene.nodes.length,scene.paths.length,scene.glyphs.length],[28,28,70]);
  const sources=r.regions.map(q=>{const op=q.kind==='glyph'?scene.glyphs[Number(q.id.slice(6))]:scene.paths[scene.nodes.findIndex(n=>n.name===q.nodeId)];assert.ok(op);return{regionId:q.id,nodeId:q.nodeId,semanticId:op.semanticId,svgElementId:op.svgElementId,source:op.source};});
  const frameChecks=[],scalar=(quantity,expected,actual,tolerance)=>frameChecks.push({quantity,expected,actual,tolerance,passed:Number.isFinite(actual)&&Math.abs(expected-actual)<=tolerance});
  const bounds=(id,wanted,got)=>{assert.equal(got.isEmpty,false);for(const k of['minX','minY','maxX','maxY'])scalar(id+'.'+k,wanted[k],got[k],4/3*1e-9);};
  for(const q of r.checks){const op=q.kind==='glyph'?scene.glyphs[Number(q.id.slice(6))]:scene.paths[scene.nodes.findIndex(n=>n.name===q.nodeId)];bounds(q.id,q.native,op.inkBounds);}
  bounds('public.picture',r.frames.picture,scene.pictureBounds);bounds('public.ink',r.frames.nativeInk,scene.inkBounds);
    await installShapeMetrics(renderer);
    const rootFrame=await renderer.page.evaluate(svg=>{const d=new DOMParser().parseFromString(svg,'image/svg+xml'),s=d.documentElement;return{view:s.getAttribute('viewBox').split(/[ ,]+/).map(Number),width:parseFloat(s.getAttribute('width')),height:parseFloat(s.getAttribute('height'))};},actual),wanted=unionBounds([r.frames.picture,r.frames.nativeInk]);
    [wanted.minX,wanted.minY,wanted.maxX-wanted.minX,wanted.maxY-wanted.minY].forEach((v,i)=>scalar('svg.root.'+i,v,rootFrame.view[i],.000000500001));scalar('svg.width',rootFrame.view[2],rootFrame.width,0);scalar('svg.height',rootFrame.view[3],rootFrame.height,0);assert.equal(frameChecks.length,406);
    const saveImages=async(prefix,m,pdf)=>{const links={},crops=new Map();for(const[k,png]of Object.entries(m.images)){links[k]=prefix+'-'+k+'.png';await save(links[k],Buffer.from(png,'base64'));}
      for(const crop of m.crops){const q={};for(const[k,png]of Object.entries(pdf?crop.images:{...crop.paired,sheet:crop.sheet})){q[k]=prefix+'-'+crop.id+'-'+k+'.png';await save(q[k],Buffer.from(png,'base64'));}crops.set(crop.id,q);}return{artifacts:links,imageHashes:Object.fromEntries(Object.entries(links).map(([k,p])=>[k,artifacts[p]])),regions:m.regions.map(q=>({...q,crops:crops.get(q.id)??null})),cropCoverage:{saved:crops.size,required:m.regions.length,truncated:crops.size<m.regions.length}};
    };
    phase='primary';const primary=[];
    for(const view of shapeViews){const input={reference:r.reference,actual,leftIsDriver:true,origin:r.origin,camera:r.camera,regions:r.regions,...view,rightLabel:'Public candidate'};
      let m=await measureShapePair(renderer,{...input,cropLimit:0});const e=evaluateCurvedPrimary(c,{...view,...m}),failed=e.checks.filter(q=>!q.passed&&q.id!=='whole-picture').map(q=>q.id),targets=focus?[focus]:failed.length?failed.slice(0,8):['glyph-5'];
      const measured=await measureShapePair(renderer,{...input,cropLimit:8,cropRegionIds:targets});assert.deepEqual(measured.metrics,m.metrics);assert.deepEqual(measured.regions,m.regions);m=measured;
      primary.push({...view,...m,images:undefined,crops:undefined,...await saveImages('primary/'+curvedInkViewKey(view),m,false),evaluation:e});}
    phase='PDF';const pages=e.pdfPages,pdfRows=[];
    for(const variant of[{mode:'original',svg:r.reference,units:'bp',origin:r.origin},{mode:'candidate',svg:actual,units:'cssPixels',origin:{x:0,y:0}}])for(const view of shapePdfViews){const input={svg:variant.svg,units:variant.units,svgOriginBp:variant.origin,camera:c.camera,regions:c.regions,...view,pdfPage:pages[view.scale]};
      let m=await measureCurvedNodePdfPair(renderer,{...input,cropLimit:0});const e=evaluateCurvedNodeInkPolicy(c.policies[variant.mode==='original'?'originalPdf':'nativePdf'],view,m),failed=e.checks.filter(q=>!q.passed&&q.id!=='whole-picture'&&r.regions.some(r=>r.id===q.id)).map(q=>q.id),targets=focus?[focus]:failed.length?failed.slice(0,8):['glyph-5'];
      const measured=await measureCurvedNodePdfPair(renderer,{...input,cropLimit:8,cropRegionIds:targets});assert.deepEqual(measured.whole,m.whole);assert.deepEqual(measured.regions,m.regions);m=measured;
      pdfRows.push({mode:variant.mode,...m,images:undefined,crops:undefined,...await saveImages(variant.mode+'-PDF/'+curvedInkViewKey(view),m,true),evaluation:e});}
    const publicControls=[];
    for(const defect of[...curvedNodeDefects(r.indexes),{name:'unpainted-cap',expectedExactPixels:true},{name:'unpainted-solid-phase',expectedExactPixels:true}]){
      phase='fresh-public-control/'+defect.name;const changed=await renderer.page.evaluate(mutateCurvedNodeSvg,{actual,defect,indexes:r.indexes,publicCandidate:true});await save('controls/'+defect.name+'.svg',changed);
      const targets=defect.target&&!defect.pdfOnly?[defect.target]:[],pRows=[],fRows=[];
      if(!defect.pdfOnly)for(const view of shapeViews.filter(v=>v.background==='white'&&(!defect.naturalOnly||v.frame==='natural'))){
        const m=await measureShapePair(renderer,{reference:r.reference,actual:changed,leftIsDriver:true,origin:r.origin,camera:r.camera,regions:r.regions,...view,cropLimit:targets.length||2,cropRegionIds:targets,rightLabel:defect.name}),e=evaluateCurvedPrimary(c,{...view,...m});
        pRows.push({...view,...m,images:undefined,crops:undefined,...await saveImages('controls/'+defect.name+'/primary/'+curvedInkViewKey(view),m,false),evaluation:e});
      }
      for(const view of shapePdfViews.filter(v=>!defect.naturalOnly||v.frame==='natural')){
        const m=await measureCurvedNodePdfPair(renderer,{svg:changed,units:'cssPixels',svgOriginBp:{x:0,y:0},camera:c.camera,regions:c.regions,...view,pdfPage:pages[view.scale],cropLimit:targets.length||2,cropRegionIds:targets}),e=evaluateCurvedNodeInkPolicy(c.policies.nativePdf,view,m);
        fRows.push({...m,images:undefined,crops:undefined,...await saveImages('controls/'+defect.name+'/PDF/'+curvedInkViewKey(view),m,true),evaluation:e});
      }
      const rejected=row=>!row.evaluation.passed&&(!defect.target||row.evaluation.checks.find(q=>q.id===defect.target)?.passed===false);
      const passed=defect.expectedExactPixels===true?pRows.every(row=>row.evaluation.passed&&artifacts[row.artifacts.actual]===artifacts[primary.find(v=>curvedInkViewKey(v)===curvedInkViewKey(row)).artifacts.actual])&&fRows.every(row=>row.evaluation.passed&&artifacts[row.artifacts['svg-page']]===artifacts[pdfRows.find(v=>v.mode==='candidate'&&curvedInkViewKey(v)===curvedInkViewKey(row)).artifacts['svg-page']]):[...pRows,...fRows].every(rejected);
      publicControls.push({...defect,numericGatesBypassed:true,passed,primaryComparisons:pRows,pdfComparisons:fRows});console.log('Fresh public '+defect.name+': '+(passed?'expected outcome':'UNEXPECTED outcome retained'));
    }
    const faint=publicControls.find(q=>q.name==='faint-glyph-loss').pdfComparisons;
    const gate=(ok,count)=>({state:ok?'passed':'failed',executedChecks:count}),combined=combineCurvedNodes(e,gate(n.numeric.checks.every(q=>q.passed),4461),gate(frameChecks.every(q=>q.passed),406),primary,pdfRows.filter(q=>q.mode==='original'),pdfRows.filter(q=>q.mode==='candidate'),publicControls);
    const{firstFailedGate,passed}=combined,faintPassed=faint.every(q=>!q.evaluation.checks.find(c=>c.id==='glyph-5').passed);assert.equal(faintPassed,true);
    await save('index.html','<!doctype html><meta charset="utf-8"><h1>Cached native-unit curved-node conformance</h1><p>Fixed 28-node scope; calibrated primary match and separate PDF cross-check.</p><a href="report.json">Report</a> · <a href="candidate/source.tikz">Source</a> · <a href="candidate/actual-scene.json">Scene</a>'+[...primary,...pdfRows,...publicControls.flatMap(c=>[...c.primaryComparisons,...c.pdfComparisons].map(row=>({...row,controlName:c.name})))].map(row=>'<h2>'+(row.controlName??'Unchanged candidate')+' / '+curvedInkViewKey(row)+'</h2>'+row.regions.filter(q=>q.crops).map(q=>'<p>'+q.id+'</p><img loading="lazy" src="'+q.crops.sheet+'">').join('')).join(''));
    for(const[p,h]of Object.entries(toolHashes))assert.equal(sha256(canonical(await readFile(path.join(root,p)))),h);for(const[p,h]of Object.entries(artifacts))assert.equal(sha256(await readFile(await outputPath(output,p))),h);
    const rankedRegions=[...primary.map(row=>({route:'primary',row})),...pdfRows.map(row=>({route:row.mode+'-PDF',row}))].flatMap(({route,row})=>row.evaluation.checks.filter(q=>!q.passed).map(q=>({route,view:curvedInkViewKey(row),regionId:q.id,metrics:q.metrics,source:sources.find(s=>s.regionId===q.id)??null,crops:row.regions.find(r=>r.id===q.id)?.crops??null,
      focusedRerun:r.regions.some(r=>r.id===q.id)?'node tools/TikzVisual/compare-curved-node-conformance.mjs --crop-region '+q.id:null})));
    await publish({schemaVersion:1,comparisonKind:'cached-public-curved-node-conformance',completed:true,...combined,calibrationSha256:curvedCalibrationSha256,profileSha256:e.profileSha256,sourceByteContract:c.sourceByteContract,toolHashes,renderer:renderer.identity,candidateProvenance:p,numericEvidence:'candidate/report.json',frameChecks,sources,primaryComparisons:primary,pdfComparisons:pdfRows,freshFaintControl:{numericGatesBypassed:true,passed:faintPassed,comparisons:faint},freshCandidateControls:publicControls,artifacts,
      agent:{viewer:'index.html',source:'candidate/source.tikz',scene:'candidate/actual-scene.json',rerun:'node tools/TikzVisual/compare-curved-node-conformance.mjs',firstRequiredFailure:firstFailedGate,contactSheet:primary.find(q=>q.frame==='natural'&&q.scale===1&&q.background==='white').artifacts.comparison,
        focusedRerun:focus?'node tools/TikzVisual/compare-curved-node-conformance.mjs --crop-region '+focus:null,followUpCommands:['dotnet test Lokad.TikZ.slnx','node tools/TikzVisual/curved-node-admission-self-test.mjs'],cropLimit:8,cropTruncationReported:true,focus,rankedRegions}});
    process.exitCode=passed?0:1;console.log('Cached public curved-node conformance: '+(firstFailedGate??'all gates and faint control pass')+'; '+path.relative(root,output));
  }finally{await renderer.browser.close();}
}
await main().catch(async error=>{process.exitCode=2;console.error(error.stack?.slice(0,5000)??error.message);await publish({completed:false,phase,verdict:'infrastructure-error',overallVerdict:'pending',approvedImagePolicy:false,imageConformanceClaim:false,error:error.message.slice(0,5000),toolHashes,artifacts});});
