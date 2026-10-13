import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Saved native-only observations: strict coverage, source/PNG integrity and remeasurement.
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadEdgeEvidence,edgeReference} from './edge-evidence.mjs';
import {edgeCanonical} from './edge-log.mjs';
import {edgeOperationVariants,edgeOperationTargets,withEdgeDriverFrame,isolateEdgeOperation} from './edge-operation-svg.mjs';
import {edgeOracleVariants,readEdgeOriginal,edgeOracleInstructions,makeEdgeOracleSvg} from './edge-oracle.mjs';
import {buildEdgeOracleFrame} from './edge-oracle-frame.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

const base=path.join(root,'artifacts/edge-operation-checks'),output=path.join(base,'run-'+randomUUID()),artifacts={},controls=[];let phase='arguments',renderer,inputReportSha256,metricsRecomputed=0,svgsReconstructed=0;
const fields=['exactRgbaMatch','rawChangedPixels','maxRawChannelError','premultipliedChangedPixels','maxPremultipliedChannelError','foregroundPixels','referenceForegroundPixels','actualForegroundPixels','meanForegroundChannelError','topology'];
const metric=q=>Object.fromEntries(fields.map(k=>[k,q[k]]));
async function publish(completed,error){const report={schemaVersion:1,comparisonKind:'independent-edge-operation-check',completed,phase,inputReportSha256,metricsRecomputed,svgsReconstructed,controls,
  converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,renderer:renderer?.identity,artifacts,...(error?{error}:{})};const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',bytes);
  await writeArtifact(base,'latest.json',JSON.stringify({completed,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)},null,2)+'\n');
  console.log(JSON.stringify({kind:'edge-operation-check',completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));}
try{
  assert.equal(process.argv.length,3);assert.match(process.argv[2],/^artifacts\/edge-operation-inspection\/run-[a-f0-9-]+\/report.json$/);const folder=path.dirname(path.join(root,process.argv[2]));
  const read=async p=>readFile(await outputPath(folder,p));assert.ok((await stat(await outputPath(folder,'report.json'))).size<=150000000);const bytes=await read('report.json'),report=JSON.parse(bytes);inputReportSha256=sha256(bytes);await publish(false);
  const ownFiles=['tools/TikzVisual/check-edge-operations.mjs','tools/TikzVisual/edge-oracle-png-pair.mjs'],ownHashes={};
  for(const p of ownFiles){const b=edgeCanonical(await readFile(path.join(root,p)));ownHashes[p]=sha256(b);await writeArtifact(output,'source-captures/'+p,b,artifacts);}
  phase='integrity';for(const[p,h]of Object.entries(report.artifacts))assert.equal(sha256(await read(p)),h);for(const[p,h]of Object.entries(report.sourceHashes))assert.equal(sha256(edgeCanonical(await readFile(path.join(root,p)))),h);
  const requiredSources=['inspect-edge-operations.mjs','edge-operation-svg.mjs','edge-oracle.mjs','edge-oracle-frame.mjs','edge-oracle-pair.mjs','edge-evidence.mjs','curved-node-path-units.mjs',
    'shape-frame-math.mjs','shape-image-pair.mjs','shape-raster-metrics.mjs','shape-oracle-bundle.mjs','compare.mjs','browser-profile.json','text-profile.json','node-profile.json','package.json','package-lock.json'].map(p=>'tools/TikzVisual/'+p)
    .concat(['tools/TikzEdgeOracle/Program.cs','tools/TikzEdgeOracle/TikzEdgeOracle.csproj','tools/TikzEdgeOracle/packages.lock.json','tools/TikzShapeComparison/NativeGlyphTrace.cs','Directory.Build.props','global.json','Lokad.TikZ.slnx']);
  assert.deepEqual(Object.keys(report.sourceHashes).sort(),requiredSources.sort());for(const[p,h]of Object.entries(report.sourceHashes))assert.equal(sha256(await read('source-captures/'+p)),h);
  const evidence=await loadEdgeEvidence();for(const[p,b]of evidence.files)assert.ok(b.equals(await read('evidence/'+p)));assert.equal(report.snapshotSha256,evidence.snapshotSha256);
  phase='fresh-native-glyphs';const glyphOutput=path.join(output,'oracle');let glyphCommand;
  try{glyphCommand=await promisify(execFile)('dotnet',['run','--project','tools/TikzEdgeOracle','-c','Release','--','--out',path.relative(root,glyphOutput)],{cwd:root,windowsHide:true,timeout:180000,maxBuffer:1000000});}
  catch(e){await writeArtifact(output,'oracle-command.log',(String(e.stdout??'')+String(e.stderr??'')).replaceAll(root,'<repo>'),artifacts);throw e;}
  await writeArtifact(output,'oracle-command.log',(glyphCommand.stdout+glyphCommand.stderr).replaceAll(root,'<repo>'),artifacts);
  const freshGlyphReport=JSON.parse(await readFile(path.join(glyphOutput,'report.json')));assert.equal(freshGlyphReport.completed,true);assert.equal(freshGlyphReport.glyphs,16);
  assert.equal(freshGlyphReport.snapshotSha256,evidence.snapshotSha256);for(const k of['converterInvoked','approvedImagePolicy','imageConformanceClaim'])assert.equal(freshGlyphReport[k],false);
  assert.ok(freshGlyphReport.oracleAssemblyReferences.length>0&&freshGlyphReport.oracleAssemblyReferences.every(n=>n==='System'||n.startsWith('System.')));
  for(const[p,h]of Object.entries(freshGlyphReport.artifacts)){assert.equal(sha256(await readFile(path.join(glyphOutput,p))),h);artifacts['oracle/'+p]=h;}artifacts['oracle/report.json']=sha256(await readFile(path.join(glyphOutput,'report.json')));
  renderer=await createRenderer();requireRenderer(renderer.identity, report.renderer);await installShapeMetrics(renderer);const native=[];
  for(const c of evidence.cases){const id=c.fixture.id,glyphs=JSON.parse(await read('oracle/'+id+'/native-glyphs.json')),reference=evidence.files.get(edgeReference+id+'/plain-reference.svg').toString('utf8');
    assert.deepEqual(glyphs,JSON.parse(await readFile(path.join(glyphOutput,id,'native-glyphs.json'))));
    const original=await readEdgeOriginal(renderer,reference,c.metrics,glyphs),frame=await buildEdgeOracleFrame(renderer,reference,c.metrics,glyphs,original);assert.deepEqual(original,JSON.parse(await read(id+'/original.json')));
    native.push({id,frame,targets:edgeOperationTargets(c.metrics,original),metrics:c.metrics,glyphs,reference,original});
  }
  const views=[1,4].flatMap(scale=>['transparent','white','black'].map(background=>({scale,background})));
  function coverage(r){
    assert.equal(r.schemaVersion,1);assert.equal(r.completed,true);assert.equal(r.comparisonKind,'oracle-only-edge-operation-precision');assert.equal(r.converterInvoked,false);assert.equal(r.approvedImagePolicy,false);assert.equal(r.imageConformanceClaim,false);
    assert.equal(r.overallVerdict,'pending-calibration');assert.equal(r.snapshotSha256,evidence.snapshotSha256);assert.deepEqual(r.variants,edgeOperationVariants);assert.deepEqual(r.views,views);assert.deepEqual(r.cases.map(c=>c.id),native.map(c=>c.id));
    assert.deepEqual(Object.keys(r.sourceHashes).sort(),requiredSources);
    const linked=p=>{assert.equal(typeof p,'string');assert.ok(p&&!p.startsWith('/')&&!p.includes(':')&&!p.includes('\\')&&!p.split('/').includes('..'));assert.match(r.artifacts[p]??'',/^[a-f0-9]{64}$/);};
    linked('index.html');for(const[p,h]of Object.entries(r.artifacts)){linked(p);assert.match(h,/^[a-f0-9]{64}$/);}
    let operations=0,whole=0;for(const[c,i]of r.cases.map((c,i)=>[c,i])){
      assert.deepEqual(c.frame,native[i].frame);assert.deepEqual(c.targets,native[i].targets);assert.deepEqual(c.derivations.map(d=>d.variant),edgeOperationVariants);
      const expectedWhole=edgeOperationVariants.flatMap(v=>views.map(w=>c.id+'/'+v+'/whole/'+w.scale+'x-'+w.background));
      const expectedOps=edgeOperationVariants.flatMap(v=>c.targets.flatMap(t=>views.map(w=>c.id+'/'+v+'/'+t.id+'/'+w.scale+'x-'+w.background)));
      assert.deepEqual(c.whole.map(o=>o.id),expectedWhole);assert.deepEqual(c.operations.map(o=>o.id),expectedOps);
      for(const d of c.derivations){linked(d.svg);assert.ok(d.serializationChecks.every(q=>q.passed));if(d.variant==='native-driver-frame'){assert.deepEqual(d.numerical.originBp,c.frame.origin);assert.equal(d.numerical.driverCssPerPt,.996264*(4/3));assert.equal(d.numerical.nativeCssPerPt,96/72.27);assert.equal(d.numerical.scaleDelta,Math.abs(d.numerical.driverCssPerPt-d.numerical.nativeCssPerPt));}}
      for(const o of[...c.whole,...c.operations]){
        assert.ok(edgeOperationVariants.includes(o.variant)&&views.some(w=>w.scale===o.scale&&w.background===o.background));
        assert.equal(o.id,c.id+'/'+o.variant+'/'+(o.target?.id??'whole')+'/'+o.scale+'x-'+o.background);assert.ok(o.target===null||c.operations.includes(o));assert.ok(o.target!==null||c.whole.includes(o));
        assert.equal(o.repeat.rawChangedPixels,0);assert.equal(o.actualRepeat.rawChangedPixels,0);assert.equal(o.repeat.exactRgbaMatch,true);assert.equal(o.actualRepeat.exactRgbaMatch,true);
        const regions=o.target?c.frame.regions.filter(q=>q.id===o.target.id||q.id.startsWith(o.target.id+'.')):c.frame.regions;
        if(o.target)assert.deepEqual(o.target,c.targets.find(t=>t.id===o.target.id));assert.deepEqual(o.regions.map(q=>q.id),regions.map(q=>q.id));
        for(let j=0;j<regions.length;j++)assert.deepEqual(o.regions[j].rectangle,regions[j].rectangle);
        assert.ok(Number.isSafeInteger(o.metrics.rawChangedPixels)&&o.metrics.rawChangedPixels>=0);assert.equal(o.metrics.exactRgbaMatch,o.metrics.rawChangedPixels===0);
        for(const k of['reference','actual','difference','alpha-difference','amplified','overlay']){assert.equal(o.images[k],o.id+'-'+k+'.png');linked(o.images[k]);}if(o.scale===1&&o.background==='white'){assert.equal(o.images.comparison,o.id+'-comparison.png');linked(o.images.comparison);}
        assert.equal(o.crops.length,1);assert.ok(regions.some(q=>q.id===o.crops[0].id));for(const[k,p]of Object.entries(o.crops[0].images)){assert.equal(p,o.id+'-'+o.crops[0].id+'-'+k+'.png');linked(p);}
      }
      operations+=c.operations.length;whole+=c.whole.length;
    }
    assert.equal(operations,1908);assert.equal(whole,90);return{operations,whole};
  }
  coverage(report);phase='svg-reconstruction';
  for(const n of native){const c=report.cases.find(c=>c.id===n.id);
    for(const variant of edgeOperationVariants){const d=c.derivations.find(d=>d.variant===variant),v=edgeOracleVariants.find(v=>v.name===(variant==='native-driver-frame'?'native-pt-short-glyph-six':variant));
      const instructions=edgeOracleInstructions(n.metrics,n.glyphs,n.original,v),derived=await makeEdgeOracleSvg(renderer,n.reference,n.original,instructions,n.frame,'native-ink-six');
      assert.deepEqual(d.serializationChecks,JSON.parse(JSON.stringify(instructions.checks)));let actual=derived.svg;
      if(variant==='native-driver-frame'){const transformed=await withEdgeDriverFrame(renderer,actual,n.frame);actual=transformed.svg;assert.deepEqual(d.numerical,transformed.numerical);}else assert.equal(d.numerical,null);
      assert.equal((await read(d.svg)).toString('utf8'),actual);svgsReconstructed++;
      for(const target of n.targets){const prefix=n.id+'/'+variant+'/'+target.id,left=await isolateEdgeOperation(renderer,n.reference,target,{driver:true}),right=await isolateEdgeOperation(renderer,actual,target);
        assert.equal(left.originalDrawingCount,n.targets.length);assert.equal(right.originalDrawingCount,n.targets.length);assert.equal(left.definitionCount,right.definitionCount);
        for(const[k,value]of[['reference',left.svg],['actual',right.svg]]){const p=prefix+'-'+k+'.svg';assert.match(report.artifacts[p]??'',/^[a-f0-9]{64}$/);assert.equal((await read(p)).toString('utf8'),value);svgsReconstructed++;}
      }
    }console.log(n.id+': native whole and isolated SVGs reconstructed.');
  }
  assert.equal(svgsReconstructed,651);phase='saved-measurements';
  for(const c of report.cases){for(const o of[...c.whole,...c.operations]){
      const size={width:c.frame.camera.width*o.scale,height:c.frame.camera.height*o.scale},rectangles=[undefined,...o.regions.map(q=>Object.fromEntries(Object.entries(q.rectangle).map(([k,v])=>[k,v*o.scale])))];
      const decoded=await decodeEdgeOraclePngPair(renderer,await Promise.all(['reference','actual'].map(k=>read(o.images[k]))),size,rectangles,o.scale,o.background);assert.deepEqual(decoded.metrics[0],o.metrics);
      for(let j=0;j<o.regions.length;j++)assert.deepEqual(decoded.metrics[j+1],metric(o.regions[j]));metricsRecomputed+=decoded.metrics.length;
    }console.log(c.id+': complete saved operation and whole-view measurements verified.');}
  phase='coverage-controls';function changed(name,object,key,value){const old=object[key];try{object[key]=value;assert.throws(()=>coverage(report),undefined,name);controls.push({name,passed:true,expected:'reject'});}finally{object[key]=old;}}
  for(const k of['completed','converterInvoked','approvedImagePolicy','imageConformanceClaim'])changed('wrong role '+k,report,k,!report[k]);
  changed('false admission',report,'overallVerdict','passed');changed('different snapshot',report,'snapshotSha256','0'.repeat(64));changed('missing fixture',report,'cases',report.cases.slice(0,-1));
  changed('missing whole view',report.cases[0],'whole',report.cases[0].whole.slice(0,-1));changed('missing operation view',report.cases[0],'operations',report.cases[0].operations.slice(0,-1));
  changed('duplicate operation view',report.cases[0],'operations',[report.cases[0].operations[0],...report.cases[0].operations.slice(0,-1)]);
  changed('wrong construction identity',report.cases[0].targets[0],'nativePathId',999);changed('wrong paint ordinal',report.cases[0].targets[0],'ordinal',999);
  changed('missing native region',report.cases[0].operations[0],'regions',[]);changed('changed region camera',report.cases[0].operations[0].regions[0].rectangle,'x',999);
  changed('failed reference repeat',report.cases[0].operations[0].repeat,'rawChangedPixels',1);changed('failed derived repeat',report.cases[0].operations[0].actualRepeat,'rawChangedPixels',1);
  changed('missing image',report.cases[0].operations[0].images,'reference','missing.png');changed('image traversal',report.cases[0].operations[0].images,'actual','../x.png');
  changed('different driver factor',report.cases[0].derivations[2].numerical,'driverCssPerPt',1.33);changed('wrong physical scale',report.cases[0].derivations[2].numerical,'nativeCssPerPt',1.33);
  changed('missing viewer hash',report.artifacts,'index.html',undefined);
  changed('wrong view variant',report.cases[0].operations[0],'variant',edgeOperationVariants[1]);changed('wrong view scale',report.cases[0].operations[0],'scale',4);changed('wrong view background',report.cases[0].operations[0],'background','white');
  changed('valid wrong-view image substitution',report.cases[0].operations[0].images,'reference',report.cases[0].operations[1].images.reference);
  changed('valid wrong-crop image substitution',report.cases[0].operations[0].crops[0].images,'reference',report.cases[0].operations[1].crops[0].images.reference);
  changed('missing captured source',report,'sourceHashes',{});coverage(report);
  phase='final-integrity';assert.equal(sha256(await read('report.json')),inputReportSha256);for(const[p,h]of Object.entries({...report.sourceHashes,...ownHashes}))assert.equal(sha256(edgeCanonical(await readFile(path.join(root,p)))),h);
  for(const[p,h]of Object.entries(report.artifacts))assert.equal(sha256(await read(p)),h);for(const[p,h]of Object.entries(artifacts))assert.equal(sha256(await readFile(path.join(output,p))),h);
  for(const[p,h]of Object.entries(freshGlyphReport.sourceHashes))assert.equal(sha256(edgeCanonical(await readFile(path.join(root,p)))),h);await loadEdgeEvidence();await publish(true);
}catch(error){process.exitCode=2;await publish(false,error.message.replaceAll(root,'<repo>'));console.error(error.stack);}
finally{await renderer?.browser.close();}
