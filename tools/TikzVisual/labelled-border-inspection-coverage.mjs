import assert from 'node:assert/strict';

export function validateLabelledBorderInspectionCoverage(report,frames){
  assert.equal(report.schemaVersion,1);assert.equal(report.completed,true);assert.equal(report.overallVerdict,'pending');
  assert.equal(report.approvedImagePolicy,false);assert.equal(report.imageConformanceClaim,false);
  assert.equal(report.numeric.executedChecks,1624);assert.ok(['passed','failed'].includes(report.numeric.state));
  assert.equal(report.primary.state,'pending');assert.equal(report.pdf.state,'pending');
  assert.deepEqual(report.frames.map(f=>f.caseId),['lines','paths','transforms']);assert.deepEqual(frames.map(f=>f.caseId),['lines','paths','transforms']);
  assert.equal(report.presentation.cropLimit,8);const focus=report.presentation.requestedRegion;
  assert.ok(focus===null||frames.some(f=>f.regions.some(r=>f.caseId+':'+r.id===focus)),'Unknown focused region.');
  const expected=frames.flatMap(f=>['natural','expanded'].flatMap(frame=>[1,4].flatMap(scale=>['transparent','white','black'].map(background=>f.caseId+'/'+frame+'-'+scale+'x-'+background))));
  assert.deepEqual(report.coverage.expectedViews,expected);assert.deepEqual(report.coverage.executedViews,expected);assert.deepEqual(report.comparisons.map(c=>c.view),expected);
  const relative=p=>{assert.equal(typeof p,'string');assert.ok(p.length>0&&!p.startsWith('/')&&!p.includes('\\')&&!p.includes(':')&&!p.split('/').includes('..'));assert.match(report.artifacts[p]??'',/^[a-f0-9]{64}$/);};
  for(const[p,digest]of Object.entries(report.artifacts)){relative(p);assert.match(digest,/^[a-f0-9]{64}$/);}
  relative(report.numeric.report);relative(report.agent.viewer);relative(report.agent.contactSheet);
  assert.equal(report.agent.firstRequiredFailure,report.numeric.state==='passed'?'primary-image-admission-pending':'native-numeric');
  let observations=0;
  for(const f of frames){const stored=report.frames.find(q=>q.caseId===f.caseId);assert.deepEqual(stored.camera,f.camera);assert.deepEqual(stored.origin,f.origin);assert.deepEqual(stored.regions,f.regions);
    const rows=report.comparisons.filter(c=>c.caseId===f.caseId);assert.equal(rows.length,12);
    for(const row of rows){assert.equal(row.view,row.caseId+'/'+row.frame+'-'+row.scale+'x-'+row.background);
      assert.deepEqual(row.regions.map(r=>r.id),f.regions.map(r=>r.id));assert.equal(row.cropCoverage.measured,f.regions.length);
      const metric=(m,area)=>{for(const key of['rawChangedPixels','foregroundPixels','referenceForegroundPixels','actualForegroundPixels'])assert.ok(Number.isSafeInteger(m[key])&&m[key]>=0&&m[key]<=area,'Invalid '+key);
        assert.ok(Number.isFinite(m.maxRawChannelError)&&m.maxRawChannelError>=0&&m.maxRawChannelError<=255);assert.equal(m.exactRgbaMatch,m.rawChangedPixels===0);assert.ok(Number.isFinite(m.meanForegroundChannelError)&&m.meanForegroundChannelError>=0&&m.meanForegroundChannelError<=255);};
      metric(row.metrics,f.camera.width*f.camera.height*row.scale**2);metric(row.repeat,f.camera.width*f.camera.height*row.scale**2);assert.equal(row.repeat.exactRgbaMatch,true);
      for(const p of Object.values(row.images))relative(p);
      let saved=0;
      for(let i=0;i<row.regions.length;i++){const r=row.regions[i],e=f.regions[i];assert.deepEqual(r.rectangle,e.rectangle);metric(r,e.rectangle.width*e.rectangle.height*row.scale**2);
        if(r.crops){saved++;for(const k of['reference','actual','difference','amplified','sheet'])relative(r.crops[k]);const p=r.crops.presentation;
          assert.equal(p.background,'white');assert.equal(p.integerEnlargement,row.scale===1?4:1);assert.equal(p.rawDifferenceAmplification,16);
          assert.deepEqual(p.rasterRectangle,{x:e.rectangle.x*row.scale,y:e.rectangle.y*row.scale,width:e.rectangle.width*row.scale,height:e.rectangle.height*row.scale});}}
      assert.equal(saved,row.cropCoverage.saved);assert.equal(row.cropCoverage.truncated,saved<row.regions.length);assert.ok(saved>0&&saved<=8);observations+=row.regions.length;
      if(focus!==null&&focus.startsWith(row.caseId+':'))assert.ok(row.regions.find(r=>row.caseId+':'+r.id===focus)?.crops,'Missing requested paired crop.');
    }
  }
  assert.equal(report.coverage.localObservations,observations);assert.equal(report.primary.observedExact,report.comparisons.every(c=>c.metrics.exactRgbaMatch));
  assert.equal(report.sources.length,frames.reduce((n,f)=>n+f.regions.length,0));
  assert.deepEqual(report.sources.map(s=>s.caseId+':'+s.regionId),frames.flatMap(f=>f.regions.map(r=>f.caseId+':'+r.id)));
  assert.equal(report.agent.rankedRegions.length,observations);
  const ranked=report.agent.rankedRegions.map(r=>r.view+':'+r.regionId);assert.equal(new Set(ranked).size,ranked.length);
  assert.deepEqual(ranked.slice().sort(),report.comparisons.flatMap(c=>c.regions.map(r=>c.view+':'+r.id)).sort());
  for(const r of report.agent.rankedRegions){const row=report.comparisons.find(c=>c.view===r.view),region=row.regions.find(q=>q.id===r.regionId);
    assert.equal(r.rawChangedPixels,region.rawChangedPixels);assert.equal(r.maxChannelError,region.maxRawChannelError);}
  return{views:expected.length,localObservations:observations,approvedImagePolicy:false,imageConformanceClaim:false};
}
