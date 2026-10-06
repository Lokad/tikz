import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadEdgeEvidence,edgeReference} from './edge-evidence.mjs';
import {readEdgeOriginal} from './edge-oracle.mjs';
import {buildEdgeOracleFrame} from './edge-oracle-frame.mjs';
import {buildEdgePrimaryReference,restoreEdgeDriverDot,edgePrimaryContract} from './edge-primary-reference.mjs';
import {isolateEdgeOperation,edgeOperationTargets} from './edge-operation-svg.mjs';
import {measureEdgeOraclePair} from './edge-oracle-pair.mjs';
import {mutateEdgePrimary} from './edge-primary-defects.mjs';
import {deriveEdgePrimaryPolicy,evaluateEdgePrimary,edgePrimaryViews} from './edge-primary-policy.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';
const output=path.join(root,'artifacts/edge-primary-controls/run-'+randomUUID()),checks=[];let renderer;
const passed=(name,extra={})=>checks.push({name,passed:true,...extra});
try{
  assert.equal(process.argv.length,2);const evidence=await loadEdgeEvidence(),c=evidence.cases.find(c=>c.fixture.id==='clipping'),reference=evidence.files.get(edgeReference+'clipping/plain-reference.svg').toString('utf8');
  renderer=await createRenderer();await installShapeMetrics(renderer);const glyphs={nodes:[],svgFontDefinitions:{}},original=await readEdgeOriginal(renderer,reference,c.metrics,glyphs),frame=await buildEdgeOracleFrame(renderer,reference,c.metrics,glyphs,original);
  const derived=await buildEdgePrimaryReference(renderer,reference,c.metrics,glyphs,original,frame);assert.equal(derived.corrections.length,1);assert.equal(derived.corrections[0].original,'M0 205');assert.equal(derived.corrections[0].restored,'M0 205L0 205');
  assert.deepEqual([derived.corrections[0].constructionCap,derived.corrections[0].shippedCap],[0,1]);passed('only the independently verified deferred round-cap line is restored');
  const restored=await readEdgeOriginal(renderer,derived.referenceSvg,c.metrics,glyphs),expected=structuredClone(original);expected.paths[9].d='M0 205L0 205';assert.deepEqual(restored,expected);passed('original paint, order, clips and glyph definitions unchanged');
  const untouched=await restoreEdgeDriverDot(renderer,reference,{caseId:'styles'},original);assert.equal(untouched.svg,reference);assert.deepEqual(untouched.corrections,[]);passed('other fixtures are byte-preserving passthroughs');
  for(const[name,change]of[
    ['wrong shipped cap',m=>m.driverState.paints[9].cap=0],['wrong width',m=>m.driverState.paints[9].widthSp++],['wrong color',m=>m.driverState.paints[9].strokeRgb=[1,0,0]],
    ['wrong opacity',m=>m.driverState.paints[9].strokeOpacity=.5],['wrong clip state',m=>m.driverState.paints[9].clips=[0]],['nonzero line',m=>m.paths.find(p=>p.index===15).segments[1].xSp=1],
    ['missing native line',m=>m.paths.find(p=>p.index===15).segments.pop()]
  ]){const metrics=structuredClone(c.metrics);change(metrics);await assert.rejects(restoreEdgeDriverDot(renderer,reference,metrics,original));passed(name+' rejected');}
  for(const[name,change]of[['wrong move',o=>o.paths[9].d='M1 205'],['wrong driver cap',o=>o.paths[9].paint['stroke-linecap']='butt'],['wrong driver width',o=>o.paths[9].paint['stroke-width']='2']]){
    const o=structuredClone(original);change(o);await assert.rejects(restoreEdgeDriverDot(renderer,reference,c.metrics,o));passed(name+' rejected');}
  await assert.rejects(restoreEdgeDriverDot(renderer,reference.replace("M0 205'","M1 205'"),c.metrics,original));passed('stale source metadata rejected');
  const target=edgeOperationTargets(c.metrics,original).find(t=>t.id==='path-15'),left=(await isolateEdgeOperation(renderer,derived.referenceSvg,target,{driver:true})).svg,
    missing=(await isolateEdgeOperation(renderer,reference,target,{driver:true})).svg,right=(await isolateEdgeOperation(renderer,derived.nativeSvg,target)).svg,regions=frame.regions.filter(r=>r.id==='path-15');
  for(const scale of[1,4])for(const background of['transparent','white','black']){
    const input={actual:right,leftIsDriver:true,origin:frame.origin,camera:frame.camera,regions,frame:'expanded',scale,background,cropLimit:0};
    const restoredPair=await measureEdgeOraclePair(renderer,{...input,reference:left});assert.ok(restoredPair.metrics.referenceForegroundPixels>0&&restoredPair.metrics.actualForegroundPixels>0);
    assert.equal(restoredPair.repeat.rawChangedPixels,0);assert.equal(restoredPair.actualRepeat.rawChangedPixels,0);passed('restored independent dot remains visible '+scale+'/'+background,{metrics:restoredPair.metrics});
    const lostPair=await measureEdgeOraclePair(renderer,{...input,reference:missing});assert.equal(lostPair.metrics.referenceForegroundPixels,0);assert.ok(lostPair.metrics.actualForegroundPixels>0&&lostPair.metrics.rawChangedPixels>0);
    passed('original omitted dot stays explicitly different '+scale+'/'+background,{metrics:lostPair.metrics});
  }
  const shifted=await mutateEdgePrimary(renderer,derived.nativeSvg,original,c.metrics,{caseId:'clipping',target:'path-15',change:'baseline'});
  assert.ok(shifted.includes('translate(0 .25)'));passed('baseline control shifts vertically in CSS units');
  const metric={exactRgbaMatch:true,rawChangedPixels:0,maxRawChannelError:0,premultipliedChangedPixels:0,maxPremultipliedChannelError:0,foregroundPixels:0,referenceForegroundPixels:0,actualForegroundPixels:0,meanForegroundChannelError:0,
    topology:{threshold:16,connectivity:8,edgeNeighborhood:4,referenceComponents:0,actualComponents:0,componentDifference:0,referenceEdgePixels:0,actualEdgePixels:0,edgeState:'both-empty',maxEdgeDisplacementRasterPixels:0,maxEdgeDisplacementCssPixels:0}};
  const synthetic=['continuation','styles','coordinates','nodes','clipping'].map(id=>({id,measurements:edgePrimaryViews.map(view=>({...view,converterInvoked:false,metrics:structuredClone(metric),repeat:structuredClone(metric),actualRepeat:structuredClone(metric),
    regions:[{id:'path-1',kind:'path',nodeId:null,rectangle:{x:0,y:0,width:2,height:2},...structuredClone(metric)}]}))})),policy=deriveEdgePrimaryPolicy(synthetic),row=structuredClone(synthetic[0].measurements[0]);
  row.id='owner/row';const verdict=evaluateEdgePrimary(policy,'continuation',row);assert.deepEqual(verdict.checks.map(q=>q.id),['whole-picture','path-1']);assert.ok(verdict.passed);assert.ok(verdict.checks.every(q=>!Object.hasOwn(q,'regions')));passed('observation identity does not overwrite native check IDs or duplicate report payloads');
  row.regions[0].rawChangedPixels=1;assert.equal(evaluateEdgePrimary(policy,'continuation',row).checks[1].passed,false);passed('image-only target defect fails independently of whole-picture metrics');
  for(const[name,change]of[['missing view',cs=>cs[0].measurements.pop()],['duplicate view',cs=>cs[0].measurements[1]=structuredClone(cs[0].measurements[0])],['candidate input',cs=>cs[0].measurements[0].converterInvoked=true],['unstable replay',cs=>cs[0].measurements[0].actualRepeat.rawChangedPixels=1]]){
    const cs=structuredClone(synthetic);change(cs);assert.throws(()=>deriveEdgePrimaryPolicy(cs));passed(name+' calibration rejected');}
  await writeArtifact(output,'report.json',JSON.stringify({schemaVersion:1,completed:true,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,snapshotSha256:evidence.snapshotSha256,contract:edgePrimaryContract,renderer:renderer.identity,checks},null,2)+'\n');
  console.log(checks.length+' independent edge correction/visibility controls passed; '+path.relative(root,output));
}catch(error){process.exitCode=2;await writeArtifact(output,'report.json',JSON.stringify({completed:false,error:error.message,checks,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false},null,2)+'\n');console.error(error.stack);}
finally{await renderer?.browser.close();}
