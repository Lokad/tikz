import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Independently reconstruct native inputs/limits/defects and re-decode saved samples.
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {edgeCanonical} from './edge-log.mjs';
import {loadEdgeEvidence,edgeReference} from './edge-evidence.mjs';
import {readEdgeOriginal} from './edge-oracle.mjs';
import {buildEdgeOracleFrame} from './edge-oracle-frame.mjs';
import {buildEdgePrimaryReference,edgePrimaryContract} from './edge-primary-reference.mjs';
import {deriveEdgePrimaryPolicy,evaluateEdgePrimary,edgePrimaryViews,edgePrimaryViewKey} from './edge-primary-policy.mjs';
import {edgePrimaryDefects,mutateEdgePrimary} from './edge-primary-defects.mjs';
import {edgePrimaryVisibility,edgeVisibilityPair} from './edge-primary-visibility.mjs';
import {deriveShapeTrialPolicy,evaluateShapeTrial} from './shape-primary-trial-policy.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';
const base=path.join(root,'artifacts/edge-primary-checks'),output=path.join(base,'run-'+randomUUID()),artifacts={},controls=[],native=[];
let phase='arguments',renderer,inputReportSha256,metricsRecomputed=0,svgsReconstructed=0;
const fields=['exactRgbaMatch','rawChangedPixels','maxRawChannelError','premultipliedChangedPixels','maxPremultipliedChannelError','foregroundPixels','referenceForegroundPixels','actualForegroundPixels','meanForegroundChannelError','topology'];
const metric=q=>Object.fromEntries(fields.map(k=>[k,q[k]])),normalize=o=>JSON.parse(JSON.stringify(o));
async function publish(completed,error){const report={schemaVersion:1,comparisonKind:'independent-edge-primary-check',completed,phase,inputReportSha256,metricsRecomputed,svgsReconstructed,controls,
  converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,renderer:renderer?.identity,artifacts,...(error?{error}:{})};const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',bytes);
  await writeArtifact(base,'latest.json',JSON.stringify({completed,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)},null,2)+'\n');console.log(JSON.stringify({kind:'edge-primary-check',completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));}
try{
  assert.equal(process.argv.length,3);assert.match(process.argv[2],/^artifacts\/edge-primary-calibration\/run-[a-f0-9-]+\/report.json$/);const folder=path.dirname(path.join(root,process.argv[2])),read=async p=>readFile(await outputPath(folder,p));
  assert.ok((await stat(await outputPath(folder,'report.json'))).size<=150000000);const bytes=await read('report.json'),report=JSON.parse(bytes);inputReportSha256=sha256(bytes);await publish(false);
  const ownFiles=['tools/TikzVisual/check-edge-primary.mjs','tools/TikzVisual/edge-oracle-png-pair.mjs'],ownHashes={};for(const p of ownFiles){const b=edgeCanonical(await readFile(path.join(root,p)));ownHashes[p]=sha256(b);await writeArtifact(output,'source-captures/'+p,b,artifacts);}
  const requiredSources=['calibrate-edge-primary.mjs','edge-primary-reference.mjs','edge-primary-policy.mjs','edge-primary-defects.mjs','edge-primary-visibility.mjs','shape-primary-trial-policy.mjs','edge-oracle.mjs','edge-oracle-frame.mjs','edge-oracle-pair.mjs','edge-evidence.mjs','curved-node-path-units.mjs',
    'shape-frame-math.mjs','shape-image-pair.mjs','shape-raster-metrics.mjs','shape-oracle-bundle.mjs','compare.mjs','browser-profile.json','text-profile.json','node-profile.json','package.json','package-lock.json'].map(p=>'tools/TikzVisual/'+p)
    .concat(['tools/TikzEdgeOracle/Program.cs','tools/TikzEdgeOracle/TikzEdgeOracle.csproj','tools/TikzEdgeOracle/packages.lock.json','tools/TikzShapeComparison/NativeGlyphTrace.cs','Directory.Build.props','global.json','Lokad.TikZ.slnx']).sort();
  phase='integrity';assert.deepEqual(Object.keys(report.sourceHashes).sort(),requiredSources);for(const[p,h]of Object.entries(report.sourceHashes)){assert.equal(sha256(edgeCanonical(await readFile(path.join(root,p)))),h);assert.equal(sha256(await read('source-captures/'+p)),h);}
  for(const[p,h]of Object.entries(report.artifacts))assert.equal(sha256(await read(p)),h);const evidence=await loadEdgeEvidence();for(const[p,b]of evidence.files)assert.ok(b.equals(await read('evidence/'+p)));
  phase='fresh-native-glyphs';const glyphOutput=path.join(output,'oracle');let command;
  try{command=await promisify(execFile)('dotnet',['run','--project','tools/TikzEdgeOracle','-c','Release','--','--out',path.relative(root,glyphOutput)],{cwd:root,windowsHide:true,timeout:180000,maxBuffer:1000000});}
  catch(e){await writeArtifact(output,'oracle-command.log',(String(e.stdout??'')+String(e.stderr??'')).replaceAll(root,'<repo>'),artifacts);throw e;}
  await writeArtifact(output,'oracle-command.log',(command.stdout+command.stderr).replaceAll(root,'<repo>'),artifacts);const glyphReport=JSON.parse(await readFile(path.join(glyphOutput,'report.json')));assert.equal(glyphReport.completed,true);assert.equal(glyphReport.glyphs,16);
  for(const k of['converterInvoked','approvedImagePolicy','imageConformanceClaim'])assert.equal(glyphReport[k],false);assert.equal(glyphReport.snapshotSha256,evidence.snapshotSha256);
  assert.ok(glyphReport.oracleAssemblyReferences.length>0&&glyphReport.oracleAssemblyReferences.every(n=>n==='System'||n.startsWith('System.')));
  for(const[p,h]of Object.entries(glyphReport.artifacts)){assert.equal(sha256(await readFile(path.join(glyphOutput,p))),h);artifacts['oracle/'+p]=h;}artifacts['oracle/report.json']=sha256(await readFile(path.join(glyphOutput,'report.json')));
  renderer=await createRenderer();requireRenderer(renderer.identity, report.renderer);await installShapeMetrics(renderer);
  phase='reference-reconstruction';for(const c of evidence.cases){const id=c.fixture.id,reference=evidence.files.get(edgeReference+id+'/plain-reference.svg').toString('utf8'),glyphs=JSON.parse(await readFile(path.join(glyphOutput,id,'native-glyphs.json')));
    assert.deepEqual(glyphs,JSON.parse(await read('oracle/'+id+'/native-glyphs.json')));const original=await readEdgeOriginal(renderer,reference,c.metrics,glyphs),frame=await buildEdgeOracleFrame(renderer,reference,c.metrics,glyphs,original);frame.regions=frame.regions.map(r=>({...r,nodeId:r.nodeId??null}));
    const built=await buildEdgePrimaryReference(renderer,reference,c.metrics,glyphs,original,frame),row=report.cases.find(c=>c.id===id);assert.deepEqual(original,JSON.parse(await read(id+'/original.json')));assert.deepEqual(frame,row.frame);
    for(const k of['corrections','serializationChecks','paintChecks','rootChecks'])assert.deepEqual(row[k],normalize(built[k]));
    for(const[k,s]of Object.entries({original:reference,reference:built.referenceSvg,native:built.nativeSvg})){assert.equal(row.svg[k],id+'/'+({original:'original',reference:'derived-driver',native:'native'}[k])+'.svg');assert.equal((await read(row.svg[k])).toString('utf8'),s);svgsReconstructed++;}
    native.push({id,reference,original,metrics:c.metrics,frame,built});
  }
  function coverage(r){
    assert.equal(r.schemaVersion,1);assert.equal(r.comparisonKind,'oracle-only-edge-primary-calibration');assert.equal(r.completed,true);assert.equal(r.overallVerdict,'pending');assert.equal(r.snapshotSha256,evidence.snapshotSha256);
    for(const k of['converterInvoked','approvedImagePolicy','imageConformanceClaim'])assert.equal(r[k],false);assert.deepEqual(r.contract,edgePrimaryContract);assert.deepEqual(r.requiredViews,edgePrimaryViews);assert.deepEqual(Object.keys(r.sourceHashes).sort(),requiredSources);
    assert.deepEqual(r.cases.map(c=>c.id),native.map(c=>c.id));const linked=p=>{assert.equal(typeof p,'string');assert.ok(p&&!p.startsWith('/')&&!p.includes(':')&&!p.includes('\\')&&!p.split('/').includes('..'));assert.match(r.artifacts[p]??'',/^[a-f0-9]{64}$/);};linked('index.html');
    const derived=deriveEdgePrimaryPolicy(r.cases);assert.deepEqual(r.policy,derived);let views=0;
    function rows(c,observations,prefix,required=edgePrimaryViews,evaluation,visibilityPolicy){assert.deepEqual(observations.map(edgePrimaryViewKey),required.map(edgePrimaryViewKey));for(const o of observations){
      assert.equal(o.id,prefix+'/'+edgePrimaryViewKey(o));assert.equal(o.converterInvoked,false);assert.equal(o.repeat.rawChangedPixels,0);assert.equal(o.actualRepeat.rawChangedPixels,0);assert.equal(o.repeat.exactRgbaMatch,true);assert.equal(o.actualRepeat.exactRgbaMatch,true);
      assert.deepEqual(o.regions.map(q=>({id:q.id,nodeId:q.nodeId,kind:q.kind,rectangle:q.rectangle})),c.frame.regions.map(q=>({id:q.id,nodeId:q.nodeId,kind:q.kind,rectangle:q.rectangle})));
      for(const k of['reference','actual','difference','alpha-difference','amplified','overlay']){assert.equal(o.images[k],o.id+'-'+k+'.png');linked(o.images[k]);}if(o.scale===1&&o.background==='white'){assert.equal(o.images.comparison,o.id+'-comparison.png');linked(o.images.comparison);}
      assert.equal(o.crops.length,2);for(const crop of o.crops){assert.ok(c.frame.regions.some(q=>q.id===crop.id));for(const[k,p]of Object.entries(crop.images)){assert.equal(p,o.id+'-'+crop.id+'-'+k+'.png');linked(p);}}
      if(evaluation!==undefined){const verdict=visibilityPolicy?evaluateShapeTrial(visibilityPolicy,{frame:o.frame,scale:o.scale,background:o.background},o):evaluateEdgePrimary(r.policy,c.id,o);assert.deepEqual(o.evaluation,verdict);assert.equal(verdict.passed,typeof evaluation==='function'?evaluation(o):evaluation);}
      views++;
    }}
    for(const[c,i]of r.cases.map((c,i)=>[c,i])){assert.deepEqual(c.frame,native[i].frame);assert.deepEqual(c.corrections,native[i].built.corrections);for(const p of Object.values(c.svg))linked(p);
      rows(c,c.measurements,c.id+'/calibration');rows(c,c.replays,c.id+'/replay');for(let j=0;j<c.measurements.length;j++){const a=c.measurements[j],b=c.replays[j];assert.deepEqual(a.metrics,b.metrics);assert.deepEqual(a.regions,b.regions);assert.deepEqual(a.naturalFrames,b.naturalFrames);assert.equal(evaluateEdgePrimary(r.policy,c.id,b).passed,true);for(const k of['reference','actual','difference','alpha-difference','amplified','overlay'])assert.equal(r.artifacts[a.images[k]],r.artifacts[b.images[k]]);}
      rows(c,c.originalDiagnostics,c.id+'/original-driver',c.id==='clipping'?edgePrimaryViews:[]);for(const o of c.originalDiagnostics)assert.ok(o.regions.find(q=>q.id==='path-15').rawChangedPixels>0);
    }
    assert.deepEqual(r.defects.map(d=>Object.fromEntries(Object.keys(edgePrimaryDefects[edgePrimaryDefects.findIndex(q=>q.name===d.name)]??{}).map(k=>[k,d[k]]))),edgePrimaryDefects);
    for(const d of r.defects){const c=r.cases.find(c=>c.id===d.caseId);assert.equal(d.numericGatesBypassed,true);assert.equal(d.converterInvoked,false);linked(d.input);
      rows(c,d.comparisons,c.id+'/defects/'+d.name,edgePrimaryViews.filter(v=>!d.frames||d.frames.includes(v.frame)),o=>(d.invisibleBackgrounds??[]).includes(o.background));
      for(const o of d.comparisons){if((d.invisibleBackgrounds??[]).includes(o.background)){const b=c.measurements.find(b=>edgePrimaryViewKey(b)===edgePrimaryViewKey(o));assert.equal(r.artifacts[o.images.actual],r.artifacts[b.images.actual]);}
        else assert.ok(o.evaluation.checks.some(q=>q.id===d.target&&!q.passed));}}
    assert.deepEqual(r.visibility.map(d=>Object.fromEntries(Object.keys(edgePrimaryVisibility[edgePrimaryVisibility.findIndex(q=>q.name===d.name)]??{}).map(k=>[k,d[k]]))),edgePrimaryVisibility);
    for(const d of r.visibility){const c=r.cases.find(c=>c.id===d.caseId);assert.equal(d.numericGatesBypassed,true);assert.equal(d.converterInvoked,false);assert.equal(d.fidelity,'Controlled renderer-only paint perturbation; not a new native TikZ fixture.');for(const p of Object.values(d.inputs))linked(p);
      assert.deepEqual(d.policy,deriveShapeTrialPolicy(d.unchanged.map(o=>({...o,...o.metrics})),d.name+'; controlled renderer-only opacity '+d.opacity,edgePrimaryViews));
      rows(c,d.unchanged,c.id+'/visibility/'+d.name+'/unchanged',edgePrimaryViews,true,d.policy);rows(c,d.comparisons,c.id+'/visibility/'+d.name+'/missing',edgePrimaryViews,o=>d.expectedPassed||(d.invisibleBackgrounds??[]).includes(o.background),d.policy);
      for(const o of d.comparisons){const b=d.unchanged.find(b=>edgePrimaryViewKey(b)===edgePrimaryViewKey(o)),expected=d.expectedPassed||(d.invisibleBackgrounds??[]).includes(o.background);
        assert.equal(o.observedVisible,!expected);assert.equal(r.artifacts[o.images.actual]!==r.artifacts[b.images.actual],!expected);if(!expected)assert.ok(o.evaluation.checks.some(q=>q.id===d.target&&!q.passed));}
    }
    assert.equal(views,354);return views;
  }
  coverage(report);phase='controlled-svg-reconstruction';for(const d of report.defects){const n=native.find(n=>n.id===d.caseId),s=await mutateEdgePrimary(renderer,n.built.nativeSvg,n.original,n.metrics,d);assert.equal((await read(d.input)).toString('utf8'),s);svgsReconstructed++;}
  for(const d of report.visibility){const n=native.find(n=>n.id===d.caseId),pair=await edgeVisibilityPair(renderer,n.built.referenceSvg,n.built.nativeSvg,n.metrics,d);for(const[k,s]of Object.entries(pair)){assert.equal((await read(d.inputs[k])).toString('utf8'),s);svgsReconstructed++;}}
  assert.equal(svgsReconstructed,37);phase='saved-measurements';const all=report.cases.flatMap(c=>[...c.measurements,...c.replays,...c.originalDiagnostics].map(o=>({c,o})))
    .concat(report.defects.flatMap(d=>d.comparisons.map(o=>({c:report.cases.find(c=>c.id===d.caseId),o}))),report.visibility.flatMap(d=>[...d.unchanged,...d.comparisons].map(o=>({c:report.cases.find(c=>c.id===d.caseId),o}))));
  assert.equal(all.length,354);for(const[c,i]of report.cases.map((c,i)=>[c,i])){for(const{ o }of all.filter(q=>q.c.id===c.id)){
    const size={width:c.frame.camera.width*o.scale,height:c.frame.camera.height*o.scale},rectangles=[undefined,...o.regions.map(q=>Object.fromEntries(Object.entries(q.rectangle).map(([k,v])=>[k,v*o.scale])))],
      decoded=await decodeEdgeOraclePngPair(renderer,await Promise.all(['reference','actual'].map(k=>read(o.images[k]))),size,rectangles,o.scale,o.background);assert.deepEqual(decoded.metrics[0],o.metrics);for(let j=0;j<o.regions.length;j++)assert.deepEqual(decoded.metrics[j+1],metric(o.regions[j]));metricsRecomputed+=decoded.metrics.length;
  }console.log(c.id+': complete native calibration/replay/control PNG metrics reproduced.');}
  phase='corruption-controls';function changed(name,object,key,value){const old=object[key];try{object[key]=value;assert.throws(()=>coverage(report),undefined,name);controls.push({name,passed:true,expected:'reject'});}finally{object[key]=old;}}
  for(const k of['completed','converterInvoked','approvedImagePolicy','imageConformanceClaim'])changed('wrong report role '+k,report,k,!report[k]);changed('false admission',report,'overallVerdict','passed');changed('different snapshot',report,'snapshotSha256','0'.repeat(64));
  changed('missing fixture',report,'cases',report.cases.slice(0,-1));changed('missing view',report.cases[0],'measurements',report.cases[0].measurements.slice(0,-1));changed('missing replay',report.cases[0],'replays',[]);
  changed('changed camera',report.cases[0].frame.camera,'x',999);changed('missing dot correction',report.cases[4],'corrections',[]);changed('changed calibration limit',report.policy.cases[0].policy.rows[0].whole,'maxRawChannelError',255);
  changed('wrong control target',report.defects[0],'target','path-999');changed('numeric rejection hides sensitivity',report.defects[0],'numericGatesBypassed',false);changed('missing defect',report,'defects',report.defects.slice(0,-1));changed('missing visibility control',report,'visibility',report.visibility.slice(0,-1));
  changed('invisible loss falsely rejected',report.visibility[2],'expectedPassed',false);changed('visible control falsely classified',report.visibility[0].comparisons[0],'observedVisible',false);
  changed('same-run wrong image',report.cases[0].measurements[0].images,'reference',report.cases[0].measurements[1].images.reference);changed('missing viewer hash',report.artifacts,'index.html',undefined);changed('missing source provenance',report,'sourceHashes',{});coverage(report);
  phase='final-integrity';assert.equal(sha256(await read('report.json')),inputReportSha256);for(const[p,h]of Object.entries({...report.sourceHashes,...ownHashes,...glyphReport.sourceHashes}))assert.equal(sha256(edgeCanonical(await readFile(path.join(root,p)))),h);
  for(const[p,h]of Object.entries(report.artifacts))assert.equal(sha256(await read(p)),h);for(const[p,h]of Object.entries(artifacts))assert.equal(sha256(await readFile(path.join(output,p))),h);await loadEdgeEvidence();await publish(true);
}catch(error){process.exitCode=2;await publish(false,error.message.replaceAll(root,'<repo>'));console.error(error.stack);}
finally{await renderer?.browser.close();}
