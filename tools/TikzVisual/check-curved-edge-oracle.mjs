// Explicit completed run only: native reconstruction, saved PNG measurements and corruption controls.
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {edgeCanonical} from './curved-edge-log.mjs';
import {loadEdgeEvidence,edgeReference} from './curved-edge-evidence.mjs';
import {edgeOracleVariants,edgeOracleRoots,edgeOracleInstructions,makeEdgeOracleSvg} from './edge-oracle.mjs';
import {buildCurvedEdgeFrame} from './curved-edge-frame.mjs';
import {readCurvedEdgeOriginal} from './curved-edge-original.mjs';
import {edgeOraclePdfRegions} from './edge-oracle-pdf.mjs';
import {validateEdgeOracleCoverage} from './curved-edge-oracle-coverage.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

const base=path.join(root,'artifacts/curved-edge-oracle-checks'),output=path.join(base,'run-'+randomUUID()),artifacts={},ownHashes={},controls=[];
let phase='arguments',renderer,inputReportSha256,metricsRecomputed=0,pagesRecomputed=0,svgReconstructions=0;const save=(p,b)=>writeArtifact(output,p,b,artifacts);
async function publish(report){const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',bytes);await writeArtifact(base,'latest.json',JSON.stringify({completed:report.completed,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)},null,2)+'\n');
  console.log(JSON.stringify({kind:'curved-edge-oracle-check',completed:report.completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));}
const metricFields=['exactRgbaMatch','rawChangedPixels','maxRawChannelError','premultipliedChangedPixels','maxPremultipliedChannelError','foregroundPixels','referenceForegroundPixels','actualForegroundPixels','meanForegroundChannelError','topology'];
const metric=r=>Object.fromEntries(metricFields.map(k=>[k,r[k]]));
try{
  assert.equal(process.argv.length,3,'Usage: node tools/TikzVisual/check-curved-edge-oracle.mjs artifacts/curved-edge-oracle-inspection/run-<id>/report.json');
  assert.match(process.argv[2],/^artifacts\/curved-edge-oracle-inspection\/run-[a-f0-9-]+\/report.json$/);
  const input=path.dirname(path.join(root,process.argv[2]));await outputPath(input,'report.json');assert.ok((await stat(path.join(input,'report.json'))).size<=150000000);
  const bytes=await readFile(path.join(input,'report.json')),r=JSON.parse(bytes);inputReportSha256=sha256(bytes);const read=async p=>readFile(await outputPath(input,p));
  assert.deepEqual([r.schemaVersion,r.comparisonKind,r.completed,r.converterInvoked,r.approvedImagePolicy,r.imageConformanceClaim,r.overallVerdict],
    [1,'oracle-only-curved-edge-precision-framing',true,false,false,false,'pending-image-calibration'],'Expected a completed native-only curved report.');
  await publish({schemaVersion:1,completed:false,phase,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,inputReportSha256});
  phase='source-and-artifact-integrity';for(const p of['check-curved-edge-oracle.mjs','edge-oracle-png-pair.mjs']){const file='tools/TikzVisual/'+p,b=edgeCanonical(await readFile(path.join(root,file)));ownHashes[file]=sha256(b);await save('tool-sources/'+file,b);}
  for(const[p,h]of Object.entries(r.artifacts)){assert.equal(sha256(await read(p)),h,'Changed native-run artifact: '+p);}
  const expectedTools=['inspect-curved-edge-oracle.mjs','edge-oracle.mjs','edge-oracle-frame.mjs','edge-oracle-pair.mjs','edge-oracle-pdf.mjs','edge-oracle-coverage.mjs','curved-edge-evidence.mjs','curved-edge-original.mjs','curved-edge-frame.mjs','curved-edge-oracle-coverage.mjs',
    'curved-node-path-units.mjs','shape-frame-math.mjs','shape-image-pair.mjs','shape-raster-metrics.mjs','shape-pdf-image-pair.mjs','shape-pdf-camera.mjs','shape-oracle-bundle.mjs',
    'compare.mjs','browser-profile.json','text-profile.json','node-profile.json','package.json','package-lock.json'].map(p=>'tools/TikzVisual/'+p)
    .concat(['tools/TikzCurvedEdgeOracle/Program.cs','tools/TikzCurvedEdgeOracle/TikzCurvedEdgeOracle.csproj','tools/TikzCurvedEdgeOracle/packages.lock.json','tools/TikzShapeComparison/NativeGlyphTrace.cs','Directory.Build.props','global.json','Lokad.TikZ.slnx']);
  assert.deepEqual(Object.keys(r.toolHashes).sort(),expectedTools.sort());for(const[p,h]of Object.entries(r.toolHashes))assert.equal(sha256(edgeCanonical(await readFile(path.join(root,p)))),h,'Native-run tool changed.');
  const e=await loadEdgeEvidence();assert.equal(r.snapshotSha256,e.snapshotSha256);for(const[p,b]of e.files)assert.ok(b.equals(await read('evidence/'+p)),'Native evidence capture changed.');
  phase='fresh-independent-glyphs';let command;
  try{command=await promisify(execFile)('dotnet',['run','--project','tools/TikzCurvedEdgeOracle','-c','Release','--','--out',path.relative(root,path.join(output,'oracle'))],{cwd:root,windowsHide:true,timeout:180000,maxBuffer:1000000});}
  catch(error){await save('oracle-command.log',(String(error.stdout??'')+String(error.stderr??'')).replaceAll(root,'<repo>'));throw error;}
  await save('oracle-command.log',(command.stdout+command.stderr).replaceAll(root,'<repo>'));
  const freshBytes=await readFile(path.join(output,'oracle/report.json')),fresh=JSON.parse(freshBytes);assert.equal(fresh.completed,true);assert.equal(fresh.glyphs,10);assert.equal(fresh.converterInvoked,false);assert.equal(fresh.snapshotSha256,e.snapshotSha256);
  assert.equal(fresh.approvedImagePolicy,false);assert.equal(fresh.imageConformanceClaim,false);
  assert.ok(fresh.oracleAssemblyReferences.length>0&&fresh.oracleAssemblyReferences.every(n=>n==='System'||n.startsWith('System.')));
  for(const[p,h]of Object.entries(fresh.artifacts)){const b=await readFile(await outputPath(path.join(output,'oracle'),p));assert.equal(sha256(b),h);artifacts['oracle/'+p]=h;}artifacts['oracle/report.json']=sha256(freshBytes);
  renderer=await createRenderer();assert.deepEqual(renderer.identity,r.renderer);await installShapeMetrics(renderer);const frames=[];
  phase='native-reconstruction';for(const c of e.cases){const id=c.fixture.id,reference=e.files.get(edgeReference+id+'/plain-reference.svg').toString('utf8'),glyphBytes=await readFile(path.join(output,'oracle',id,'native-glyphs.json'));
    assert.ok(glyphBytes.equals(await read('oracle/'+id+'/native-glyphs.json')),'Independent glyph replay changed.');const glyphs=JSON.parse(glyphBytes),original=await readCurvedEdgeOriginal(renderer,reference,c.metrics,glyphs),frame=await buildCurvedEdgeFrame(renderer,reference,c.metrics,glyphs,original);
    assert.deepEqual(original,JSON.parse(await read(id+'/original-operations.json')));assert.deepEqual(frame,JSON.parse(await read(id+'/frame.json')));frames.push(frame);
    for(const v of edgeOracleVariants){const instructions=edgeOracleInstructions(c.metrics,glyphs,original,v);
      // JSON represents both signs of zero as 0; compare its declared numeric contract.
      assert.deepEqual(JSON.parse(JSON.stringify(instructions)),JSON.parse(await read(id+'/'+v.name+'/instructions.json')));
      for(const rootMode of edgeOracleRoots){const derived=await makeEdgeOracleSvg(renderer,reference,original,instructions,frame,rootMode),d=r.derivations.find(d=>d.id===id+'/'+v.name+'/'+rootMode);
        assert.equal(sha256(derived.svg),r.artifacts[d.svg]);assert.equal(sha256(derived.drawing),d.drawingSha256);assert.deepEqual(derived.root,d.root);assert.deepEqual(derived.rootChecks,d.rootChecks);svgReconstructions++;}
    }
    const pdf=edgeOraclePdfRegions(c.metrics,frame);for(const scale of[1,4])assert.deepEqual(pdf,JSON.parse(await read(id+'/pdf/registration-'+scale+'x.json')));
  }
  function validateRegistration(report){
    for(const o of report.observations){const f=frames.find(f=>f.caseId===o.caseId),d=report.derivations.find(d=>d.id===o.caseId+'/'+o.variant+'/'+o.root),v=d.root.values;
      assert.deepEqual(o.naturalFrames.actual,{x:v[0],y:v[1],width:v[2],height:v[3]},'Changed actual natural frame.');
      const source=e.files.get(edgeReference+o.caseId+'/plain-reference.svg').toString('utf8'),width=Number(/width='([^']+)pt'/.exec(source)[1])*(4/3),height=Number(/height='([^']+)pt'/.exec(source)[1])*(4/3);
      assert.deepEqual(o.naturalFrames.reference,{x:f.driverRoot.minX,y:f.driverRoot.minY,width,height},'Changed original natural frame.');
    }
    for(const o of report.pdfObservations){const f=frames.find(f=>f.caseId===o.caseId),native=edgeOraclePdfRegions(e.cases.find(c=>c.fixture.id===o.caseId).metrics,f);
      assert.deepEqual(o.pageSize,native.camera.rasterSizes[o.scale+'x']);
      for(const[q,i]of [o.whole,...o.regions].map((q,i)=>[q,i]))for(const[k,v]of Object.entries(native.regions[i]))assert.deepEqual(q[k],v,'Changed registered native PDF region.');
    }
  }
  const validate=()=>{validateEdgeOracleCoverage(r,frames);validateRegistration(r);};validate();phase='saved-primary-measurements';const completed=new Set();
  for(const o of r.observations){const frame=frames.find(f=>f.caseId===o.caseId),size={width:frame.camera.width*o.scale,height:frame.camera.height*o.scale};
    const rectangles=[undefined,...frame.regions.map(q=>Object.fromEntries(Object.entries(q.rectangle).map(([k,v])=>[k,v*o.scale])))];
    const result=await decodeEdgeOraclePngPair(renderer,await Promise.all(['reference','actual'].map(k=>read(o.images[k]))),size,rectangles,o.scale,o.background);
    assert.deepEqual(result.metrics[0],o.metrics,'Saved primary whole metric changed.');for(let i=0;i<o.regions.length;i++)assert.deepEqual(result.metrics[i+1],metric(o.regions[i]),'Saved native region metric changed.');
    metricsRecomputed+=result.metrics.length;const key=o.caseId+'/'+o.variant+'/'+o.root;
    if(o.background==='black'&&o.scale===4&&o.frame==='expanded'){completed.add(key);console.log(key+': all saved primary samples verified.');}
  }
  assert.equal(completed.size,75);phase='saved-pdf-measurements';
  for(const o of r.pdfObservations){const rectangles=[o.whole,...o.regions].map(q=>q.rasterRectangles[o.scale+'x']);
    const result=await decodeEdgeOraclePngPair(renderer,await Promise.all([read(o.pdfPage),read(o.images['svg-page'])]),o.pageSize,rectangles,o.scale,'white',true);
    assert.deepEqual(result.fullPage,o.fullPage);const rows=[o.whole,...o.regions];for(let i=0;i<rows.length;i++)assert.deepEqual(result.metrics[i],metric(rows[i]),'Saved native PDF-region metric changed.');
    assert.equal(result.fullPage.rawChangedPixels-result.metrics[0].rawChangedPixels,o.outsideWholeChangedPixels);metricsRecomputed+=result.metrics.length;pagesRecomputed++;
  }
  phase='coverage-corruption-controls';
  function changed(name,object,key,value){const had=Object.hasOwn(object,key),old=object[key];try{if(value===undefined)delete object[key];else object[key]=value;assert.throws(validate,undefined,'Accepted corruption: '+name);controls.push({name,expected:'reject',passed:true});}
    finally{if(had)object[key]=old;else delete object[key];}}
  for(const k of['completed','converterInvoked','approvedImagePolicy','imageConformanceClaim'])changed('wrong role '+k,r,k,!r[k]);
  changed('false overall conformance',r,'overallVerdict','passed');changed('changed native snapshot',r,'snapshotSha256','0'.repeat(64));changed('missing native glyph',r,'glyphs',9);
  changed('missing view',r,'observations',r.observations.slice(0,-1));changed('duplicate view',r,'observations',[r.observations[0],...r.observations.slice(0,-1)]);
  changed('missing expected view',r,'expectedViews',r.expectedViews.slice(0,-1));changed('dropped derivation',r,'derivations',r.derivations.slice(0,-1));
  changed('dropped PDF route',r,'pdfObservations',r.pdfObservations.slice(0,-1));changed('invalid reference repeat',r.observations[0].repeat,'rawChangedPixels',1);
  changed('invalid derived repeat',r.observations[0].actualRepeat,'rawChangedPixels',1);changed('negative changed samples',r.observations[0].metrics,'rawChangedPixels',-1);
  changed('non-finite foreground error',r.observations[0].metrics,'meanForegroundChannelError',NaN);changed('changed mask threshold',r.observations[0].metrics.topology,'threshold',17);
  changed('missing local region',r.observations[0],'regions',r.observations[0].regions.slice(0,-1));changed('changed local camera',r.observations[0].regions[0].rectangle,'x',1);
  changed('changed root width',r.derivations[0].root.values,2,r.derivations[0].root.values[2]+1);changed('widened serialization limit',r.derivations[0].rootChecks[0],'limit',1);
  changed('changed drawing between roots',r.derivations[1],'drawingSha256','0'.repeat(64));changed('false derived geometry count',r.derivations[3],'serializationChecks',1);
  changed('non-framework oracle',r.oracle,'assemblyReferences',['Lokad.TikZ']);changed('undefined viewer',r.agent,'viewer',undefined);changed('missing viewer link',r.agent,'viewer','missing.html');
  changed('viewer traversal',r.agent,'viewer','../index.html');changed('absolute viewer',r.agent,'viewer','C:/index.html');changed('missing contact sheet',r.agent,'contactSheet',undefined);
  changed('missing matching scale',r.agent.rankedRegions[0],'matching4x',undefined);changed('hidden PDF repeat failure',r.pdfObservations[0].repeat.pdf,'rawChangedPixels',1);
  changed('missing PDF region',r.pdfObservations[0],'regions',r.pdfObservations[0].regions.slice(0,-1));changed('changed coverage count',r.coverage,'views',899);
  changed('missing artifact hash',r.artifacts,r.agent.contactSheet,undefined);changed('malformed artifact hash',r.artifacts,r.agent.contactSheet,'wrong');
  changed('changed actual natural frame',r.observations[0].naturalFrames.actual,'x',r.observations[0].naturalFrames.actual.x+1);
  changed('changed reference natural frame',r.observations[0].naturalFrames.reference,'width',r.observations[0].naturalFrames.reference.width+1);
  changed('changed PDF local raster',r.pdfObservations[0].regions[0].rasterRectangles['1x'],'width',r.pdfObservations[0].regions[0].rasterRectangles['1x'].width+1);
  validate();assert.equal(metricsRecomputed,72496);assert.equal(pagesRecomputed,20);assert.equal(svgReconstructions,75);
  phase='final-integrity';assert.equal(sha256(await readFile(path.join(input,'report.json'))),inputReportSha256);for(const[p,h]of Object.entries({...r.toolHashes,...ownHashes}))assert.equal(sha256(edgeCanonical(await readFile(path.join(root,p)))),h);
  for(const[p,h]of Object.entries(r.artifacts))assert.equal(sha256(await read(p)),h,'Artifact changed during independent check.');await loadEdgeEvidence();
  await publish({schemaVersion:1,comparisonKind:'independent-curved-edge-oracle-check',completed:true,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
    inputReport:process.argv[2],inputReportSha256,renderer:renderer.identity,snapshotSha256:e.snapshotSha256,metricsRecomputed,pagesRecomputed,svgReconstructions,controls,sourceHashes:{...r.toolHashes,...ownHashes},artifacts});
}catch(error){process.exitCode=2;await publish({schemaVersion:1,completed:false,phase,error:error.message.replaceAll(root,'<repo>'),converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,inputReportSha256,metricsRecomputed,pagesRecomputed,svgReconstructions,controls,artifacts});console.error(error.stack);}
finally{await renderer?.browser.close();}
