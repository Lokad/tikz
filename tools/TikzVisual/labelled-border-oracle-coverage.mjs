import assert from 'node:assert/strict';
import {labelledOracleVariants,labelledOracleRoots} from './labelled-border-oracle.mjs';
import {labelledBorderSnapshotSha256} from './labelled-border-evidence.mjs';

export function validateLabelledOracleCoverage(report,frames){
  assert.equal(report.schemaVersion,1);assert.equal(report.completed,true);assert.equal(report.converterInvoked,false);
  assert.equal(report.approvedImagePolicy,false);assert.equal(report.imageConformanceClaim,false);assert.equal(report.overallVerdict,'pending');
  assert.equal(report.snapshotSha256,labelledBorderSnapshotSha256);
  assert.equal(report.glyphs,40);assert.deepEqual(report.variants,labelledOracleVariants);assert.deepEqual(report.roots,labelledOracleRoots);
  assert.deepEqual(report.frames,frames);assert.deepEqual(frames.map(f=>f.caseId),['lines','paths','transforms']);
  const views=['natural','expanded'].flatMap(frame=>[1,4].flatMap(scale=>['transparent','white','black'].map(background=>({frame,scale,background}))));
  const expected=frames.flatMap(f=>labelledOracleVariants.flatMap(v=>labelledOracleRoots.flatMap(root=>views.map(w=>f.caseId+'/'+v.name+'/'+root+'/'+w.frame+'-'+w.scale+'x-'+w.background))));
  assert.deepEqual(report.expectedViews,expected);assert.deepEqual(report.observations.map(o=>o.id),expected);
  const relative=p=>{assert.equal(typeof p,'string');assert.ok(p.length>0&&!p.startsWith('/')&&!p.includes('\\')&&!p.includes(':')&&!p.split('/').includes('..'));assert.match(report.artifacts[p]??'',/^[a-f0-9]{64}$/);};
  for(const[p,h]of Object.entries(report.artifacts)){relative(p);assert.match(h,/^[a-f0-9]{64}$/);}
  relative(report.oracle.report);relative(report.agent.viewer);relative(report.agent.contactSheet);
  assert.ok(report.oracle.assemblyReferences.length>0&&report.oracle.assemblyReferences.every(n=>n==='System'||n.startsWith('System.')));
  assert.equal(report.derivations.length,frames.length*labelledOracleVariants.length*labelledOracleRoots.length);
  assert.deepEqual(report.derivations.map(d=>d.id),frames.flatMap(f=>labelledOracleVariants.flatMap(v=>labelledOracleRoots.map(r=>f.caseId+'/'+v.name+'/'+r))));
  let locals=0;
  const metric=(m,area)=>{for(const k of['rawChangedPixels','premultipliedChangedPixels','foregroundPixels','referenceForegroundPixels','actualForegroundPixels'])assert.ok(Number.isSafeInteger(m[k])&&m[k]>=0&&m[k]<=area);assert.equal(m.exactRgbaMatch,m.rawChangedPixels===0);for(const k of['maxRawChannelError','maxPremultipliedChannelError','meanForegroundChannelError'])assert.ok(Number.isFinite(m[k])&&m[k]>=0&&m[k]<=255);};
  for(const f of frames)for(const v of labelledOracleVariants)for(const root of labelledOracleRoots){
    const id=f.caseId+'/'+v.name+'/'+root,d=report.derivations.find(d=>d.id===id);assert.ok(d);relative(d.svg);relative(d.instructions);
    const box=root==='driver-root-twelve'?f.driverRoot:f.picture,values=[box.minX,box.minY,box.maxX-box.minX,box.maxY-box.minY],limit=10**(-(root==='driver-root-twelve'?12:6))/2+2e-12;
    assert.equal(d.root.mode,root);assert.equal(d.root.values.length,4);assert.equal(d.rootChecks.length,4);
    for(let i=0;i<4;i++){const c=d.rootChecks[i];assert.equal(c.quantity,['x','y','width','height'][i]);assert.equal(c.expected,values[i]);assert.equal(Number(c.serialized),d.root.values[i]);assert.equal(c.delta,Math.abs(c.expected-Number(c.serialized)));assert.equal(c.limit,limit);assert.equal(c.passed,true);assert.ok(c.delta<=limit);}
    const counts={lines:174,paths:213,transforms:191},cssCounts={lines:184,paths:222,transforms:200};
    assert.equal(d.serializationChecks,v.paths==='original'?0:v.paths==='css-six'?cssCounts[f.caseId]:counts[f.caseId]);
    assert.match(d.drawingSha256,/^[a-f0-9]{64}$/);
    if(root===labelledOracleRoots[1])assert.equal(d.drawingSha256,report.derivations.find(p=>p.id===id.replace('/'+root,'/'+labelledOracleRoots[0])).drawingSha256);
    const rows=report.observations.filter(o=>o.caseId===f.caseId&&o.variant===v.name&&o.root===root);assert.equal(rows.length,12);
    for(let i=0;i<rows.length;i++){const o=rows[i];assert.equal(o.id,id+'/'+o.frame+'-'+o.scale+'x-'+o.background);assert.deepEqual({frame:o.frame,scale:o.scale,background:o.background},views[i]);
      metric(o.metrics,f.camera.width*f.camera.height*o.scale**2);metric(o.repeat,f.camera.width*f.camera.height*o.scale**2);assert.equal(o.repeat.exactRgbaMatch,true);
      if(v.paths==='original'&&o.frame==='expanded')assert.equal(o.metrics.exactRgbaMatch,true,'Equivalent driver normalization changed pixels.');
      assert.deepEqual(o.regions.map(r=>r.id),f.regions.map(r=>r.id));
      for(const p of Object.values(o.images))relative(p);
      for(let j=0;j<o.regions.length;j++){const r=o.regions[j],e=f.regions[j];assert.deepEqual(r.rectangle,e.rectangle);metric(r,e.rectangle.width*e.rectangle.height*o.scale**2);if(r.crops)for(const p of Object.values(r.crops))relative(p);}
      assert.equal(o.regions.filter(r=>r.crops).length,2);locals+=o.regions.length;
      if(root===labelledOracleRoots[1]&&o.frame==='expanded'){const paired=report.observations.find(p=>p.id===o.id.replace('/'+root+'/', '/'+labelledOracleRoots[0]+'/'));
        assert.deepEqual(o.metrics,paired.metrics);assert.equal(report.artifacts[o.images.actual],report.artifacts[paired.images.actual]);}
    }
  }
  assert.equal(report.coverage.views,expected.length);assert.equal(report.coverage.localObservations,locals);assert.equal(report.coverage.independentRegions,162);
  return{views:expected.length,localObservations:locals,independentRegions:162,approvedImagePolicy:false,imageConformanceClaim:false};
}
