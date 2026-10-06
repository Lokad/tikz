// Structural, geometric and policy contracts for unapproved research reports.
import assert from 'node:assert/strict';
import {labelledBorderSnapshotSha256} from './labelled-border-evidence.mjs';
import {unionBounds,containment} from './shape-frame-math.mjs';
import {shapeViews,deriveShapeTrialPolicy,evaluateShapeTrial,combineShapeTrial} from './shape-primary-trial-policy.mjs';
import {labelledBorderDefects,labelledDefectExpectation} from './labelled-border-image-defects.mjs';

const ids=['lines','paths','transforms'],keys=['minX','minY','maxX','maxY'],quantities=['x','y','width','height'];
const pathCounts=[8,9,9],glyphCounts=[12,16,12],numericCounts=[512,578,534];
const normalized=v=>JSON.parse(JSON.stringify(v));
const viewOf=v=>({frame:v.frame,scale:v.scale,background:v.background});
function research(r,kind){
  assert.equal(r.schemaVersion,1);assert.equal(r.comparisonKind,kind);assert.equal(r.completed,true);
  assert.equal(r.approvedImagePolicy,false);assert.equal(r.imageConformanceClaim,false);assert.equal(r.overallVerdict,'pending');
  assert.equal(r.snapshotSha256,labelledBorderSnapshotSha256);
  assert.ok(Object.keys(r.toolHashes).length>0);for(const[p,h]of Object.entries(r.toolHashes)){assert.ok(p.startsWith('tools/TikzVisual/')&&!p.includes('..'));digest(h);}
  assert.ok(Object.keys(r.artifacts).length>0);for(const[p,h]of Object.entries(r.artifacts)){relative(r,p);digest(h);}
  assert.ok(r.renderer&&typeof r.renderer==='object');
}
function digest(h){assert.match(h,/^[a-f0-9]{64}$/);}
function relative(r,p){assert.equal(typeof p,'string');assert.ok(p.length>0&&!p.startsWith('/')&&!p.includes('\\')&&!p.includes(':')&&!p.split('/').some(s=>s==='..'||s==='.'||s===''));digest(r.artifacts[p]??'');}
function box(b){for(const k of keys)assert.ok(Number.isFinite(b[k]));assert.ok(b.minX<=b.maxX&&b.minY<=b.maxY);}
function metric(m,area){
  for(const k of['rawChangedPixels','premultipliedChangedPixels','foregroundPixels','referenceForegroundPixels','actualForegroundPixels'])assert.ok(Number.isSafeInteger(m[k])&&m[k]>=0&&m[k]<=area,k);
  assert.equal(m.exactRgbaMatch,m.rawChangedPixels===0);
  for(const k of['maxRawChannelError','maxPremultipliedChannelError'])assert.ok(Number.isSafeInteger(m[k])&&m[k]>=0&&m[k]<=255);
  assert.ok(Number.isFinite(m.meanForegroundChannelError)&&m.meanForegroundChannelError>=0&&m.meanForegroundChannelError<=255);
  const t=m.topology;assert.equal(t.threshold,16);assert.equal(t.connectivity,8);assert.equal(t.edgeNeighborhood,4);
  for(const k of['referenceComponents','actualComponents','referenceEdgePixels','actualEdgePixels'])assert.ok(Number.isSafeInteger(t[k])&&t[k]>=0&&t[k]<=area);
  assert.equal(t.componentDifference,Math.abs(t.referenceComponents-t.actualComponents));
  assert.ok(['measured','both-empty','reference-empty','actual-empty'].includes(t.edgeState));
  if(t.edgeState==='measured'){assert.ok(Number.isFinite(t.maxEdgeDisplacementRasterPixels)&&t.maxEdgeDisplacementRasterPixels>=0);assert.ok(Number.isFinite(t.maxEdgeDisplacementCssPixels)&&t.maxEdgeDisplacementCssPixels>=0);}
}
function rows(r,rows,frame,views,crops){
  assert.deepEqual(rows.map(v=>({frame:v.frame,scale:v.scale,background:v.background})),views);
  for(const row of rows){const area=frame.camera.width*frame.camera.height*row.scale**2;metric(row.metrics,area);metric(row.repeat,area);assert.equal(row.repeat.rawChangedPixels,0);
    assert.deepEqual(row.regions.map(q=>q.id),frame.regions.map(q=>q.id));
    assert.deepEqual(Object.keys(row.images),['reference','actual','difference','alpha-difference','amplified','overlay',...(row.scale===1&&row.background==='white'?['comparison']:[])]);for(const p of Object.values(row.images))relative(r,p);
    for(let i=0;i<row.regions.length;i++){const a=row.regions[i],e=frame.regions[i];for(const k of Object.keys(e))assert.deepEqual(a[k],e[k]);metric(a,e.rectangle.width*e.rectangle.height*row.scale**2);
      if(a.crops){assert.deepEqual(Object.keys(a.crops),['reference','actual','difference','amplified','sheet','presentation']);for(const[k,p]of Object.entries(a.crops))if(k!=='presentation')relative(r,p);
        assert.deepEqual(a.crops.presentation,{background:'white',integerEnlargement:row.scale===1?4:1,rawDifferenceAmplification:16,rasterRectangle:Object.fromEntries(Object.entries(e.rectangle).map(([k,v])=>[k,v*row.scale]))});}}
    assert.equal(row.regions.filter(q=>q.crops).length,crops);
    for(const f of Object.values(row.naturalFrames)){for(const k of['x','y','width','height'])assert.ok(Number.isFinite(f[k]));assert.ok(f.width>0&&f.height>0);}
  }
}

export function validateLabelledInkCalibration(r,frames){
  research(r,'oracle-only-labelled-border-ink-calibration');assert.equal(r.converterInvoked,false);assert.equal(r.selectedRepresentation,'native-pt-short-glyph-six');
  assert.deepEqual(r.cases.map(c=>c.caseId),ids);assert.deepEqual(r.cases.map(c=>c.frame),frames);
  relative(r,r.oracle.report);digest(r.oracle.assemblySha256);assert.ok(r.oracle.assemblyReferences.length>0&&r.oracle.assemblyReferences.every(n=>n==='System'||n.startsWith('System.')));
  for(let i=0;i<3;i++){const c=r.cases[i],ink=c.ink;assert.equal(ink.caseId,c.caseId);assert.equal(ink.converterInvoked,false);assert.equal(ink.approvedImagePolicy,false);
    const expectedIds=[...Array.from({length:pathCounts[i]},(_,j)=>'path-'+j),...Array.from({length:glyphCounts[i]},(_,j)=>'glyph-'+j)];assert.deepEqual(ink.records.map(q=>q.id),expectedIds);
    for(let j=0;j<ink.records.length;j++){const a=ink.records[j];box(a.bound);
      if(j<pathCounts[i]){assert.equal(a.nativePathIndex,j);assert.equal(a.kind,j<4?'background':'connection');assert.deepEqual(a.bound,a.envelope.stroke);box(a.envelope.geometry);box(a.envelope.storedGeometry);assert.ok(a.envelope.radius>0&&Number.isFinite(a.envelope.radius));}
      else{assert.equal(a.kind,'glyph');assert.equal(a.glyphIndex,j-pathCounts[i]);assert.equal(a.matrix.length,6);assert.ok(a.matrix.every(Number.isFinite));}}
    assert.deepEqual(ink.ink,normalized(unionBounds(ink.records.map(q=>q.bound))));assert.deepEqual(ink.root,normalized(unionBounds([c.frame.picture,ink.ink])));
    assert.deepEqual(ink.containmentChecks,normalized(ink.records.map(q=>({id:q.id,...containment(q.bound,ink.root,1e-10)}))));assert.ok(ink.containmentChecks.every(q=>q.passed));
    assert.deepEqual(ink.browserChecks.map(q=>q.id),expectedIds);
    for(let j=0;j<ink.browserChecks.length;j++){const q=ink.browserChecks[j];assert.deepEqual(q.expected,j<pathCounts[i]?ink.records[j].envelope.geometry:ink.records[j].bound);box(q.actual);assert.equal(q.limit,.00004);
      assert.deepEqual(q.errors,Object.fromEntries(keys.map(k=>[k,Math.abs(q.actual[k]-q.expected[k])])));assert.equal(q.passed,keys.every(k=>q.errors[k]<=q.limit));assert.equal(q.passed,true);}
    assert.equal(c.rootChecks.length,4);const b=ink.root,values=[b.minX,b.minY,b.maxX-b.minX,b.maxY-b.minY];
    for(let j=0;j<4;j++){const q=c.rootChecks[j];assert.equal(q.quantity,quantities[j]);assert.equal(q.expected,values[j]);assert.equal(q.serialized,Number((Math.abs(values[j])<.0000005?0:values[j]).toFixed(6)));assert.equal(q.delta,Math.abs(q.expected-q.serialized));assert.equal(q.limit,.000000500002);assert.equal(q.passed,true);assert.ok(q.delta<=q.limit);}
    assert.equal(c.serializationChecks,[174,213,191][i]);relative(r,c.svg);relative(r,c.caseId+'/ink.json');relative(r,c.caseId+'/instructions.json');relative(r,c.caseId+'/policy.json');
    rows(r,c.observations,c.frame,shapeViews,2);assert.ok(c.observations.every(q=>q.converterInvoked===false));
    assert.deepEqual(c.policy,deriveShapeTrialPolicy(c.observations.map(q=>({...q,...q.metrics})),c.caseId+' labeled-border native-ink trial'));
    for(const row of c.observations)assert.equal(evaluateShapeTrial(c.policy,viewOf(row),row).passed,true);
  }
  assert.deepEqual(r.coverage,{cases:3,views:36,localObservations:1944,inkRecords:66,geometryChecks:264,rootChecks:12});return r.coverage;
}

export function validateLabelledInkTrial(r,calibration){
  research(r,'public-labelled-border-primary-trial');digest(r.calibrationSha256);assert.deepEqual(r.renderer,calibration.renderer);assert.deepEqual(r.cases.map(c=>c.caseId),ids);
  assert.equal(r.numeric.checks,1624);assert.equal(typeof r.numeric.passed,'boolean');relative(r,r.numeric.report);assert.deepEqual(r.pdf,{state:'pending'});
  for(let i=0;i<3;i++){const c=r.cases[i],source=calibration.cases[i],checks=c.nativeInkChecks;
    const expected=source.ink.records.flatMap(q=>keys.map(k=>({quantity:q.id+'.'+k,expected:q.bound[k],limit:1e-8}))).concat(source.rootChecks.map(q=>({quantity:'root.'+q.quantity,expected:q.serialized,limit:.000001})));
    assert.equal(checks.length,expected.length);
    for(let j=0;j<checks.length;j++){const q=checks[j],e=expected[j];for(const k of Object.keys(e))assert.equal(q[k],e[k]);assert.ok(Number.isFinite(q.observed));assert.equal(q.delta,Math.abs(q.observed-q.expected));assert.equal(q.passed,q.delta<=q.limit);}
    rows(r,c.comparisons,source.frame,shapeViews,2);for(const row of c.comparisons)assert.deepEqual(row.evaluation,evaluateShapeTrial(source.policy,viewOf(row),row));
    assert.equal(c.combined.numeric.executedChecks,numericCounts[i]);assert.ok(['passed','failed'].includes(c.combined.numeric.state));
    assert.deepEqual(c.combined,combineShapeTrial(c.combined.numeric,{state:checks.every(q=>q.passed)?'passed':'failed',executedChecks:checks.length},c.comparisons));
  }
  assert.equal(r.numeric.passed,r.cases.every(c=>c.combined.numeric.state==='passed'));assert.equal(r.trialPassed,r.cases.every(c=>c.combined.passed));
  assert.deepEqual(r.coverage,{views:36,localObservations:1944,inkRootChecks:276});return r.coverage;
}

export function validateLabelledSensitivity(r,calibration){
  research(r,'labelled-border-image-only-sensitivity');digest(r.calibrationSha256);assert.equal(typeof r.converterInvoked,'boolean');assert.equal(r.sourceKind,r.converterInvoked?'fresh-public':'independent-native');assert.deepEqual(r.renderer,calibration.renderer);
  const white=shapeViews.filter(v=>v.background==='white');assert.deepEqual(r.baselines.map(b=>b.caseId),ids);
  for(let i=0;i<3;i++){const b=r.baselines[i],source=calibration.cases[i];rows(r,b.views,source.frame,white,0);for(const row of b.views){assert.deepEqual(row.evaluation,evaluateShapeTrial(source.policy,viewOf(row),row));assert.equal(row.evaluation.passed,true);}}
  const defects=labelledBorderDefects();assert.equal(r.controls.length,defects.length);
  for(let i=0;i<defects.length;i++){const c=r.controls[i],defect=defects[i],source=calibration.cases.find(q=>q.caseId===defect.caseId);for(const k of Object.keys(defect))assert.deepEqual(c[k],defect[k]);assert.equal(c.numericGatesBypassed,true);
    relative(r,c.caseId+'/'+c.name+'.svg');rows(r,c.views,source.frame,white.filter(v=>!defect.naturalOnly||v.frame==='natural'),defect.target?1:0);
    for(const row of c.views){assert.deepEqual(row.evaluation,evaluateShapeTrial(source.policy,viewOf(row),row));const target=defect.target?row.evaluation.checks.find(q=>q.id===defect.target):row.evaluation.checks[0];assert.ok(target);assert.equal(row.targetRejected,!target.passed);
      const baseline=r.baselines.find(b=>b.caseId===c.caseId).views.find(v=>v.frame===row.frame&&v.scale===row.scale);assert.equal(row.exactBaselinePixels,r.artifacts[row.images.actual]===r.artifacts[baseline.images.actual]);
      assert.equal(row.expectedImageOutcome,labelledDefectExpectation(defect,row));assert.equal(row.expectedOutcomePassed,row.expectedImageOutcome==='pixel-identical'?row.evaluation.passed&&row.exactBaselinePixels:!row.evaluation.passed&&row.targetRejected&&!row.exactBaselinePixels);}
    assert.equal(c.passed,c.views.every(v=>v.expectedOutcomePassed));
  }
  assert.equal(r.sensitivityPassed,r.controls.every(c=>c.passed));assert.deepEqual(r.coverage,{controls:26,views:102});return r.coverage;
}
