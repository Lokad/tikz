// Immutable admission of one independently calibrated 28-node family.
// The converter supplies no reference, camera, region or error allowance.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {reconstructCurvedNodes} from './curved-node-oracle.mjs';
import {curvedPathInstructions,applyCurvedPathInstructions,curvedPathRepresentations} from './curved-node-path-units.mjs';
import {shapePdfPageCamera,shapePdfRegions} from './shape-pdf-camera.mjs';
import {shapeViews,evaluateShapeTrial} from './shape-primary-trial-policy.mjs';
import {shapePdfViews,shapePdfMetricRecord} from './shape-pdf-trial-policy.mjs';
import {deriveNativeCurvedPolicies} from './curved-node-native-unit-policy.mjs';
import {deriveCurvedNodeInkPolicy,evaluateCurvedNodeInkPolicy,curvedInkViewKey} from './curved-node-ink-policy.mjs';
import {curvedNodeDefects,mutateCurvedNodeSvg} from './curved-node-image-defects.mjs';

export const curvedProfileFile='tools/TikzVisual/curved-node-profile.json';
export const curvedCalibrationFile='tests/Reference/NodeShapes/conformance/calibration.json.gz';
export const curvedCalibrationSha256='b0320347313db428dc5283bd4a07cea47edd17aca5e9e8f68a490c7178bb2dca';
export const curvedDecodedSha256='ccf34f28cf8eb9b72ea315be1304ade65f1c915878f839f7c198539c857734c4';
export const curvedPolicyId='chromium-153-native-pgf-curved-nodes-v1';
export const curvedScope='Only the fixed 28 circle/ellipse nodes and 70 glyphs in shapes.tikz, native PGF pt-short paths and six-decimal glyph matrices; separately registered original SVG and Splash PDF references. No inherited allowance.';
export const curvedCounts={numeric:4461,frame:406,primary:1188,pdfPerRoute:408,serialization:812,regions:98,sensitivity:15};
export const curvedGuardTools=['curved-node-admission-policy.mjs','promote-curved-nodes.mjs',
  'compare-curved-node-conformance.mjs','curved-node-admission-self-test.mjs'].map(p=>'tools/TikzVisual/'+p)
  .concat(['tools/TikzVisual/shape-pdf-trial-policy.mjs','tools/TikzShapeComparison/Program.cs','tools/TikzShapeComparison/TikzShapeComparison.csproj','tools/TikzShapeComparison/packages.lock.json']);
export const curvedCanonical=b=>Buffer.from(b.toString('utf8').replaceAll('\r\n','\n'));
export const curvedView=r=>({frame:r.frame,scale:r.scale,background:r.background});
const hashPattern=/^[a-f0-9]{64}$/;
// Compare large wire-format records without allocating enormous assertion diffs.
export const curvedSame=(actual,expected,message)=>assert.equal(sha256(JSON.stringify(actual)),sha256(JSON.stringify(expected)),message);
export function requireCurvedViews(rows,views){
  assert.equal(rows.length,views.length,'Incomplete curved-node views.');
  assert.equal(new Set(rows.map(curvedInkViewKey)).size,views.length,'Duplicate curved-node view.');
  assert.deepEqual(rows.map(curvedView).sort((a,b)=>curvedInkViewKey(a).localeCompare(curvedInkViewKey(b))),
    views.map(curvedView).sort((a,b)=>curvedInkViewKey(a).localeCompare(curvedInkViewKey(b))));
}
export function requireCurvedRenderer(actual,expected){
  const fields=['profile','playwright','browser','browserSha256','os','architecture','node','headless',
    'deviceScaleFactor','viewport','launchArguments','profileSha256'];
  assert.deepEqual(Object.keys(actual).sort(),[...fields,'osRelease'].sort());
  for(const k of fields)assert.deepEqual(actual[k],expected[k],'Incompatible curved-node renderer: '+k);
  // Host patch version is provenance, not a license to change rendering settings.
  assert.equal(typeof actual.osRelease,'string');
}
export function decodeCurvedCalibration(compressed){
  assert.ok(compressed.length<=8000000);assert.equal(sha256(compressed),curvedCalibrationSha256,'Unreviewed curved-node evidence.');
  const bytes=gunzipSync(compressed,{maxOutputLength:64000000});assert.equal(sha256(bytes),curvedDecodedSha256);
  return{calibration:JSON.parse(bytes),bytes,compressed};
}
export async function readCurvedInputs(c,read=readFile){
  assert.equal(Object.keys(c.inputs).length,41);assert.equal(Object.keys(c.toolHashes).length,33);
  const buffers={};
  for(const[p,d]of Object.entries(c.inputs)){
    assert.ok(/^(tests|tools)\/[\w./-]+$/.test(p)||['Directory.Build.props','global.json'].includes(p));
    assert.ok(!p.split('/').includes('..'));assert.match(d.sha256,hashPattern);assert.ok(['raw','utf8-lf'].includes(d.encoding));
    const raw=await read(path.join(root,p)),b=d.encoding==='raw'?raw:curvedCanonical(raw);
    assert.equal(sha256(b),d.sha256,'Changed curved-node input: '+p);buffers[p]=b;
  }
  for(const[p,h]of Object.entries(c.toolHashes)){
    assert.match(h,hashPattern);assert.ok(/^(tools\/[\w./-]+|Directory\.Build\.props|global\.json)$/.test(p)&&!p.split('/').includes('..'));
    assert.equal(sha256(curvedCanonical(await read(path.join(root,p)))),h,'Changed curved-node calibration tool: '+p);
  }
  return buffers;
}
function validPrimaryMetric(m,area,scale){
  for(const k of['rawChangedPixels','premultipliedChangedPixels','foregroundPixels','referenceForegroundPixels','actualForegroundPixels'])
    assert.ok(Number.isSafeInteger(m[k])&&m[k]>=0&&m[k]<=area,'Invalid primary pixel count: '+k);
  for(const k of['maxRawChannelError','maxPremultipliedChannelError','meanForegroundChannelError'])
    assert.ok(Number.isFinite(m[k])&&m[k]>=0&&m[k]<=255,'Invalid primary channel metric: '+k);
  assert.equal(typeof m.exactRgbaMatch,'boolean');assert.equal(m.exactRgbaMatch,m.rawChangedPixels===0);
  const t=m.topology;assert.deepEqual([t.threshold,t.connectivity,t.edgeNeighborhood],[16,8,4]);
  for(const k of['referenceComponents','actualComponents','componentDifference','referenceEdgePixels','actualEdgePixels'])
    assert.ok(Number.isSafeInteger(t[k])&&t[k]>=0&&t[k]<=area,'Invalid primary topology count.');
  assert.equal(t.componentDifference,Math.abs(t.referenceComponents-t.actualComponents));
  const state=t.referenceEdgePixels?t.actualEdgePixels?'measured':'actual-empty':t.actualEdgePixels?'reference-empty':'both-empty';
  assert.equal(t.edgeState,state);
  if(['measured','both-empty'].includes(state)){
    assert.ok(Number.isFinite(t.maxEdgeDisplacementRasterPixels)&&t.maxEdgeDisplacementRasterPixels>=0);
    assert.equal(t.maxEdgeDisplacementCssPixels,t.maxEdgeDisplacementRasterPixels/scale);
    if(state==='both-empty')assert.equal(t.maxEdgeDisplacementRasterPixels,0);
  }else assert.equal(t.maxEdgeDisplacementRasterPixels,null);
}
export function evaluateCurvedPrimary(c,row){
  const view=curvedView(row),r=c.geometry,area=r.camera.width*r.camera.height*row.scale**2;
  assert.ok(shapeViews.some(v=>curvedInkViewKey(v)===curvedInkViewKey(view)));
  validPrimaryMetric(row.metrics,area,row.scale);validPrimaryMetric(row.repeat,area,row.scale);
  assert.equal(row.repeat.exactRgbaMatch,true);assert.equal(row.repeat.maxRawChannelError,0);
  assert.equal(row.repeat.maxPremultipliedChannelError,0);assert.equal(row.repeat.meanForegroundChannelError,0);
  assert.equal(row.regions.length,98);
  const reference=c.observations.primary.find(v=>curvedInkViewKey(v)===curvedInkViewKey(view));assert.ok(reference);
  const ref=(m,e)=>assert.deepEqual([m.referenceForegroundPixels,m.topology.referenceComponents,m.topology.referenceEdgePixels],
    [e.referenceForegroundPixels,e.topology.referenceComponents,e.topology.referenceEdgePixels],'Original primary raster changed.');
  ref(row.metrics,reference.metrics);
  for(const[i,m]of row.regions.entries()){
    const q=r.regions[i];assert.equal(m.id,q.id);validPrimaryMetric(m,q.rectangle.width*q.rectangle.height*row.scale**2,row.scale);ref(m,reference.regions[i]);
  }
  // Always pass just the view tuple: spreading a measured row replicates its evidence in every check.
  return evaluateShapeTrial(c.policies.primary,view,row);
}
function imageSignatures(row,pdf){
  const keys=pdf?['svg-page','pdf','svg','difference','amplified','overlay']:['reference','actual','difference','alpha-difference','amplified','overlay'];
  for(const k of keys)assert.match(row.imageHashes[k],hashPattern,'Missing replay signature.');
  return Object.fromEntries(keys.map(k=>[k,row.imageHashes[k]]));
}
function replayMetrics(row,pdf){
  return pdf?{sourceFrame:row.sourceFrame,clipFrame:row.clipFrame,pageSize:row.pageSize,fullPage:row.fullPage,
    outsideWholeChangedPixels:row.outsideWholeChangedPixels,repeat:row.repeat,
    regions:[row.whole,...row.regions].map(r=>({id:r.id,metrics:shapePdfMetricRecord(r),inkCoverage:r.inkCoverage}))}
    :{metrics:row.metrics,repeat:row.repeat,naturalFrames:row.naturalFrames,regions:row.regions};
}
export const curvedControls=r=>[...curvedNodeDefects(r.indexes),{name:'unpainted-cap',expectedExactPixels:true},{name:'unpainted-solid-phase',expectedExactPixels:true}];
export function curvedControlViews(d,pdf){
  return(pdf?shapePdfViews:shapeViews.filter(v=>v.background==='white')).filter(v=>(pdf||!d.pdfOnly)&&(!d.naturalOnly||v.frame==='natural'));
}
export function evaluateCurvedControlRows(c,control,baseline=c.observations){
  const d=curvedControls(c.geometry).find(d=>d.name===control.name);assert.ok(d);const outcomes=[];
  for(const pdf of[false,true]){
    const rows=control[pdf?'pdfComparisons':'primaryComparisons'];requireCurvedViews(rows,curvedControlViews(d,pdf));
    for(const row of rows){
      const verdict=pdf?evaluateCurvedNodeInkPolicy(c.policies.nativePdf,curvedView(row),row):evaluateCurvedPrimary(c,row);
      imageSignatures(row,pdf);let passed=verdict.passed===(d.expectedExactPixels===true);
      if(d.expectedExactPixels){
        const old=baseline[pdf?'nativePdf':'primary'].find(v=>curvedInkViewKey(v)===curvedInkViewKey(row));
        passed&&=row.imageHashes[pdf?'svg-page':'actual']===old.imageHashes[pdf?'svg-page':'actual'];
      }else if(d.target)passed&&=verdict.checks.some(q=>q.id===d.target&&!q.passed);
      outcomes.push(passed);
    }
  }
  const passed=outcomes.every(v=>v);assert.equal(control.passed,passed,'Contradictory sensitivity summary.');return passed;
}
export function validateCurvedControlRows(c,control){
  assert.equal(evaluateCurvedControlRows(c,control),true,'Wrong independent defect/visibility outcome: '+control.name);
}
export async function validateCurvedCalibration(c,renderer,buffers,workspace){
  assert.equal(c.schemaVersion,1);assert.equal(c.comparisonKind,'oracle-only-curved-node-immutable-calibration');
  assert.equal(c.completed,true);assert.equal(c.sensitivityPassed,true);assert.equal(c.converterInvoked,false);
  assert.equal(c.approvedImagePolicy,false);assert.equal(c.imageConformanceClaim,false);
  assert.equal(Object.keys(c.inputs).length,41);for(const[p,d]of Object.entries(c.inputs))assert.equal(sha256(buffers[p]),d.sha256,'Changed native input buffer.');
  assert.deepEqual(c.sourceReports,{calibration:'d7b01d4899fd9cc4725b777187e7c0d0d3d0bc1d151e8c4c658f8c665d457e61',
    registration:'370a14d497bc2d9731fdbab62cedf382fa85d4db80fdca14d2ad85c57008553b'});
  requireCurvedRenderer(renderer.identity,c.renderer);
  const text=p=>buffers[p].toString('utf8'),json=p=>JSON.parse(text(p)),native=json('tests/Reference/NodeShapes/native/metrics.json');
  const original=text('tests/Reference/NodeShapes/native/reference.svg');
  const match=/<g stroke-miterlimit='10' transform='translate\(([-\d.]+),([-\d.]+)\)scale\(0\.996264,-0\.996264\)'>/.exec(original);assert.ok(match);
  const originBp={x:Number(match[1]),y:Number(match[2])};
  const originalViewBoxBp=/viewBox='([^']+)'/.exec(original)?.[1].split(/[ ,]+/).map(Number);assert.equal(originalViewBoxBp?.length,4);
  const glyphFile='tests/Reference/NodeShapes/conformance/native-glyphs.json',cssFile='tests/Reference/NodeShapes/conformance/native-css-6.svg';
  assert.deepEqual(c.frozen,{'native-glyphs.json':glyphFile,'native-css-6.svg':cssFile});
  assert.deepEqual(c.derivation,{originBp,originalViewBoxBp,counts:{nodes:28,pathTokens:420,glyphs:70},nativeGlyphsSha256:sha256(buffers[glyphFile])});
  for(const[name,file]of Object.entries({'reference.svg':'tests/Reference/NodeShapes/native/reference.svg',
    'metrics.json':'tests/Reference/NodeShapes/native/metrics.json','native-glyphs.json':glyphFile,'native-css-6.svg':cssFile}))await writeArtifact(workspace,name,buffers[file]);
  const r=await reconstructCurvedNodes(renderer,workspace,c.derivation);curvedSame(r,c.geometry,'Changed independent curved-node geometry.');
  assert.deepEqual(c.selectedRepresentation,curvedPathRepresentations.find(v=>v.name==='pt-short'));
  const instructions=curvedPathInstructions(native,c.selectedRepresentation);curvedSame(instructions.checks,c.serializationChecks,'Changed native serialization controls.');
  const selectedSvg=await applyCurvedPathInstructions(renderer,r.semanticSvg,instructions);
  const pdfMetrics=json('tests/Reference/NodeShapes/pdf/metrics.json');assert.equal(pdfMetrics.nativeRecordCount,1810);assert.equal(pdfMetrics.converterInvoked,false);
  const camera=shapePdfPageCamera(pdfMetrics.measurement,pdfMetrics.rasterSizes),regions=shapePdfRegions(r,camera);
  curvedSame(camera,c.camera,'Changed native PDF camera.');curvedSame(regions,c.regions,'Changed PDF regions.');
  const snapshot=json('tests/Reference/NodeShapes/pdf-snapshot.json');curvedSame(c.pdfRenderer,snapshot.tools.find(t=>t.name==='pdftoppm'));
  assert.equal(c.pdfRenderer.sha256,'339a5bbff0b0a1427253268043ab48bca3f677acc040f32435d171b6cefd8949');
  const policies=deriveNativeCurvedPolicies(c.observations.primary,c.observations.nativePdf,camera,regions);
  policies.originalPdf=deriveCurvedNodeInkPolicy(c.observations.originalPdf,camera,regions,'original-driver');curvedSame(c.policies,policies,'Changed independently derived limits.');
  for(const[k,views]of Object.entries({primary:shapeViews,nativePdf:shapePdfViews,originalPdf:shapePdfViews})){
    requireCurvedViews(c.observations[k],views);requireCurvedViews(c.replays[k],views);
    for(const row of c.observations[k]){
      assert.equal(row.converterInvoked,false);const other=c.replays[k].find(v=>curvedInkViewKey(v)===curvedInkViewKey(row));assert.equal(other.converterInvoked,false);
      curvedSame(replayMetrics(row,k!=='primary'),replayMetrics(other,k!=='primary'),'Changed independent replay metrics.');
      assert.deepEqual(imageSignatures(row,k!=='primary'),imageSignatures(other,k!=='primary'));
      for(const m of[row,other])assert.equal((k==='primary'?evaluateCurvedPrimary(c,m):evaluateCurvedNodeInkPolicy(policies[k],curvedView(m),m)).passed,true);
    }
  }
  const viewport=c.viewport;assert.equal(viewport.passed,true);assert.equal(viewport.paddingCssPixels,8);assert.equal(viewport.boundaryDeltaSp,4);
  assert.equal(viewport.boundaryDeltaCssPixels,4*96/(72.27*65536));assert.equal(viewport.drawingInstructionsUnchanged,true);
  const keys=['original-driver','native-css-6','native-semantic-css-6'].flatMap(mode=>['padded',...['left','right','top','bottom'].flatMap(side=>[side+'-minus',side+'-plus'])].flatMap(name=>[1,4].map(scale=>mode+'/'+name+'/'+scale)));
  assert.deepEqual(viewport.controls.map(v=>v.mode+'/'+v.name+'/'+v.scale),keys);
  for(const v of viewport.controls){assert.equal(v.exactRgbaMatch,true);assert.equal(v.regionsExact,true);assert.equal(v.requiredRegionCount,99);assert.match(v.svgSha256,hashPattern);assert.deepEqual(v.page,{exactRgbaMatch:true,rawChangedPixels:0,maxRawChannelError:0});}
  assert.equal(c.cameraControls.passed,true);assert.equal(c.cameraControls.controls,54);assert.equal(c.cameraControls.requiredRegionChecks,5346);
  assert.equal(c.cameraControls.paddedBaselineOrdinaryPdfPairs,6);assert.equal(c.cameraControls.rootOnlyExpandedPageMatches,2);
  assert.deepEqual(viewport.ordinary.map(v=>({mode:v.mode,scale:v.scale})),['original-driver','native-css-6','native-semantic-css-6'].flatMap(mode=>[1,4].map(scale=>({mode,scale}))));
  for(const v of viewport.ordinary){const q=v.whole.rasterRectangles[v.scale+'x'];validPrimaryMetric(v.whole,q.width*q.height,v.scale);assert.equal(v.fullPage.rawChangedPixels,v.whole.rawChangedPixels);assert.match(v.image,/^viewport\/[a-z0-9-]+\.png$/);}
  assert.deepEqual(c.controls.map(v=>v.name),curvedControls(r).map(v=>v.name));
  for(const control of c.controls){
    assert.equal(control.converterInvoked,false);assert.equal(control.numericGatesBypassed,true);
    const d=curvedControls(r).find(v=>v.name===control.name);
    for(const k of['target','expectedExactPixels','naturalOnly','pdfOnly'])assert.equal(control[k],d[k]);
    const svg=await renderer.page.evaluate(mutateCurvedNodeSvg,{actual:selectedSvg,defect:d,indexes:r.indexes});
    assert.equal(control.inputSvg,svg);assert.equal(control.inputSha256,sha256(svg));validateCurvedControlRows(c,control);
  }
  return{reconstruction:r,selectedSvg,policies,camera,regions};
}
export function curvedProfile(c,guardToolHashes){
  return{schemaVersion:1,id:curvedPolicyId,scope:curvedScope,approvedImagePolicy:true,counts:curvedCounts,
    requiredViews:{primary:shapeViews,pdf:shapePdfViews},calibration:{file:curvedCalibrationFile,sha256:curvedCalibrationSha256,decodedSha256:curvedDecodedSha256},
    guardToolHashes,camera:{primary:c.geometry.camera,pdf:c.camera},regions:{primary:c.geometry.regions,pdf:c.regions},limits:c.policies};
}
export async function loadCurvedPolicy(renderer,workspace,read=readFile){
  const profileBytes=curvedCanonical(await read(path.join(root,curvedProfileFile))),profile=JSON.parse(profileBytes);
  assert.equal(profile.schemaVersion,1);assert.equal(profile.id,curvedPolicyId);assert.equal(profile.scope,curvedScope);assert.equal(profile.approvedImagePolicy,true);
  assert.deepEqual(profile.counts,curvedCounts);assert.deepEqual(profile.requiredViews,{primary:shapeViews,pdf:shapePdfViews});
  assert.deepEqual(profile.calibration,{file:curvedCalibrationFile,sha256:curvedCalibrationSha256,decodedSha256:curvedDecodedSha256});
  assert.deepEqual(Object.keys(profile.guardToolHashes).sort(),[...curvedGuardTools].sort());
  for(const[p,h]of Object.entries(profile.guardToolHashes)){assert.match(h,hashPattern);assert.equal(sha256(curvedCanonical(await read(path.join(root,p)))),h,'Changed curved-node gate: '+p);}
  const decoded=decodeCurvedCalibration(await read(path.join(root,curvedCalibrationFile))),c=decoded.calibration;
  curvedSame(profile,curvedProfile(c,profile.guardToolHashes),'Changed reviewed curved-node profile.');
  const buffers=await readCurvedInputs(c,read),validated=await validateCurvedCalibration(c,renderer,buffers,workspace),pdfPages={};
  for(const scale of[1,4]){
    const b=buffers['tests/Reference/NodeShapes/pdf/pdf-page-'+scale+'x.png'],size=c.camera.rasterSizes[scale+'x'];
    assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(b.subarray(12,16).toString(),'IHDR');
    assert.equal(b.readUInt32BE(16),size.width);assert.equal(b.readUInt32BE(20),size.height);pdfPages[scale]='data:image/png;base64,'+b.toString('base64');
  }
  return{profile,profileBytes,profileSha256:sha256(profileBytes),...decoded,buffers,...validated,pdfPages};
}
export function combineCurvedNodes(e,numeric,frame,primaryRows,originalRows,candidateRows,controls){
  const c=e.calibration;assert.deepEqual(controls.map(q=>q.name),curvedControls(c.geometry).map(q=>q.name));
  const sensitivity=controls.map(control=>evaluateCurvedControlRows(c,control,{primary:primaryRows,nativePdf:candidateRows}));
  for(const[g,count]of[[numeric,4461],[frame,406]]){assert.ok(['passed','failed'].includes(g.state));assert.equal(g.executedChecks,count);}
  requireCurvedViews(primaryRows,shapeViews);requireCurvedViews(originalRows,shapePdfViews);requireCurvedViews(candidateRows,shapePdfViews);
  const evals={primary:primaryRows.map(q=>evaluateCurvedPrimary(c,q)),
    originalPdf:originalRows.map(q=>evaluateCurvedNodeInkPolicy(c.policies.originalPdf,curvedView(q),q)),
    candidatePdf:candidateRows.map(q=>evaluateCurvedNodeInkPolicy(c.policies.nativePdf,curvedView(q),q))};
  const gates={numeric,frame};for(const[k,rows]of Object.entries(evals))gates[k]={state:rows.every(q=>q.passed)?'passed':'failed',executedChecks:rows.reduce((n,q)=>n+q.checks.length,0)};
  assert.deepEqual([gates.primary.executedChecks,gates.originalPdf.executedChecks,gates.candidatePdf.executedChecks],[1188,408,408]);
  gates.candidateSensitivity={state:sensitivity.every(v=>v)?'passed':'failed',executedChecks:15};const firstFailedGate=Object.keys(gates).find(k=>gates[k].state!=='passed')??null;
  return{verdict:firstFailedGate?'mismatch':'combined-conformance-pass',overallVerdict:firstFailedGate?'failed':'pass',passed:!firstFailedGate,firstFailedGate,gates,
    approvedImagePolicy:true,imageConformanceClaim:!firstFailedGate,scope:curvedScope,
    primaryLabel:firstFailedGate?null:primaryRows.every(q=>q.metrics.rawChangedPixels===0)?'exact-primary-pixels':'calibrated-primary-match',
    pdfLabel:firstFailedGate?null:'calibrated-PDF-cross-check'};
}
