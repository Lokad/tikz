import assert from 'node:assert/strict';
import {edgeOracleVariants,edgeOracleRoots} from './edge-oracle.mjs';
import {edgeSnapshotSha256} from './edge-evidence.mjs';

export const edgeOracleCases=['continuation','styles','coordinates','nodes','clipping'];
export const edgeOracleViewMatrix=['natural','expanded'].flatMap(frame=>[1,4].flatMap(scale=>['transparent','white','black'].map(background=>({frame,scale,background}))));
const counts={continuation:{paints:19,clips:0,glyphs:0,regions:64},styles:{paints:20,clips:0,glyphs:0,regions:64},
  coordinates:{paints:19,clips:0,glyphs:0,regions:65},nodes:{paints:21,clips:0,glyphs:16,regions:96},clipping:{paints:11,clips:2,glyphs:0,regions:34}};
const instructionCounts={continuation:189,styles:194,coordinates:187,nodes:369,clipping:127};
const relative=p=>{assert.equal(typeof p,'string');assert.ok(p.length>0&&!p.startsWith('/')&&!p.includes('\\')&&!p.includes(':')&&!p.split('/').some(s=>!s||s==='..'||s==='.'),'Invalid artifact path.');};
const hash=h=>assert.match(h??'',/^[a-f0-9]{64}$/);
function raw(m,area){assert.ok(Number.isSafeInteger(m.rawChangedPixels)&&m.rawChangedPixels>=0&&m.rawChangedPixels<=area);
  assert.equal(m.exactRgbaMatch,m.rawChangedPixels===0);assert.ok(Number.isFinite(m.maxRawChannelError)&&m.maxRawChannelError>=0&&m.maxRawChannelError<=255);}
function metric(m,area,scale){
  raw(m,area);for(const k of['premultipliedChangedPixels','foregroundPixels','referenceForegroundPixels','actualForegroundPixels'])assert.ok(Number.isSafeInteger(m[k])&&m[k]>=0&&m[k]<=area);
  for(const k of['maxPremultipliedChannelError','meanForegroundChannelError'])assert.ok(Number.isFinite(m[k])&&m[k]>=0&&m[k]<=255);
  const t=m.topology;assert.equal(t.threshold,16);assert.equal(t.connectivity,8);assert.equal(t.edgeNeighborhood,4);
  for(const k of['referenceComponents','actualComponents','referenceEdgePixels','actualEdgePixels'])assert.ok(Number.isSafeInteger(t[k])&&t[k]>=0&&t[k]<=area);
  assert.equal(t.componentDifference,Math.abs(t.referenceComponents-t.actualComponents));assert.ok(['both-empty','reference-empty','actual-empty','measured'].includes(t.edgeState));
  if(t.maxEdgeDisplacementRasterPixels===null){assert.equal(t.maxEdgeDisplacementCssPixels,null);assert.ok(['reference-empty','actual-empty'].includes(t.edgeState));}
  else{assert.ok(Number.isFinite(t.maxEdgeDisplacementRasterPixels)&&t.maxEdgeDisplacementRasterPixels>=0);assert.equal(t.maxEdgeDisplacementCssPixels,t.maxEdgeDisplacementRasterPixels/scale);}
}

export function validateEdgeOracleCoverage(report,frames){
  assert.equal(report.schemaVersion,1);assert.equal(report.completed,true);assert.equal(report.comparisonKind,'oracle-only-straight-edge-precision-framing');
  assert.equal(report.converterInvoked,false);assert.equal(report.approvedImagePolicy,false);assert.equal(report.imageConformanceClaim,false);assert.equal(report.overallVerdict,'pending-image-calibration');
  assert.equal(report.snapshotSha256,edgeSnapshotSha256);assert.deepEqual(report.variants,edgeOracleVariants);assert.deepEqual(report.roots,edgeOracleRoots);assert.equal(report.glyphs,16);
  assert.deepEqual(report.frames,frames);assert.deepEqual(frames.map(f=>f.caseId),edgeOracleCases);
  const linked=p=>{relative(p);hash(report.artifacts[p]);};
  for(const[p,h]of Object.entries(report.artifacts)){relative(p);hash(h);}
  for(const[p,h]of Object.entries(report.toolHashes)){relative(p);hash(h);}
  linked(report.oracle.report);linked(report.agent.viewer);linked(report.agent.contactSheet);linked(report.agent.nativeGlyphs);
  assert.ok(report.oracle.assemblyReferences.length>0&&report.oracle.assemblyReferences.every(n=>n==='System'||n.startsWith('System.')));hash(report.oracle.assemblySha256);
  assert.deepEqual(report.agent.focusedRerun,['node','tools/TikzVisual/inspect-edge-oracle.mjs']);assert.equal(report.agent.firstRequiredFailure,'image-calibration-pending');
  const expected=frames.flatMap(f=>edgeOracleVariants.flatMap(v=>edgeOracleRoots.flatMap(root=>edgeOracleViewMatrix.map(w=>f.caseId+'/'+v.name+'/'+root+'/'+w.frame+'-'+w.scale+'x-'+w.background))));
  assert.deepEqual(report.expectedViews,expected);assert.deepEqual(report.observations.map(o=>o.id),expected);
  assert.deepEqual(report.derivations.map(d=>d.id),frames.flatMap(f=>edgeOracleVariants.flatMap(v=>edgeOracleRoots.map(r=>f.caseId+'/'+v.name+'/'+r))));
  const derivations=new Map(report.derivations.map(d=>[d.id,d])),observations=new Map(report.observations.map(o=>[o.id,o]));let locals=0;
  for(const f of frames){
    assert.deepEqual(f.counts,counts[f.caseId]);assert.equal(f.converterInvoked,false);assert.equal(f.approvedImagePolicy,false);assert.equal(f.imageConformanceClaim,false);
    assert.equal(f.regions.length,counts[f.caseId].regions);assert.equal(new Set(f.regions.map(r=>r.id)).size,f.regions.length);
    assert.ok(f.containmentChecks.every(c=>c.passed)&&f.browserChecks.every(c=>c.passed));
    for(const v of edgeOracleVariants)for(const root of edgeOracleRoots){
      const prefix=f.caseId+'/'+v.name+'/'+root,d=derivations.get(prefix);linked(d.svg);linked(d.instructions);hash(d.drawingSha256);
      assert.equal(d.serializationChecks,v.paths==='original'?0:instructionCounts[f.caseId]);assert.equal(d.root.mode,root);
      const b=root==='driver-root-twelve'?f.driverRoot:root==='native-picture-six'?f.picture:f.root,values=[b.minX,b.minY,b.maxX-b.minX,b.maxY-b.minY],limit=10**(-(root==='driver-root-twelve'?12:6))/2+2e-12;
      assert.equal(d.rootChecks.length,4);assert.equal(d.root.values.length,4);
      for(let i=0;i<4;i++){const c=d.rootChecks[i];assert.equal(c.quantity,['x','y','width','height'][i]);assert.equal(c.expected,values[i]);assert.equal(Number(c.serialized),d.root.values[i]);
        assert.equal(c.delta,Math.abs(c.expected-Number(c.serialized)));assert.equal(c.limit,limit);assert.equal(c.passed,true);assert.ok(c.delta<=limit);}
      assert.equal(d.drawingSha256,derivations.get(f.caseId+'/'+v.name+'/'+edgeOracleRoots[0]).drawingSha256,'Root framing changed instructions.');
      for(const view of edgeOracleViewMatrix){
        const o=observations.get(prefix+'/'+view.frame+'-'+view.scale+'x-'+view.background);assert.equal(o.caseId,f.caseId);assert.equal(o.variant,v.name);assert.equal(o.root,root);
        assert.deepEqual({frame:o.frame,scale:o.scale,background:o.background},view);const area=f.camera.width*f.camera.height*o.scale**2;
        metric(o.metrics,area,o.scale);metric(o.repeat,area,o.scale);metric(o.actualRepeat,area,o.scale);assert.equal(o.repeat.rawChangedPixels,0);assert.equal(o.actualRepeat.rawChangedPixels,0);
        if(v.paths==='original'&&view.frame==='expanded')assert.equal(o.metrics.rawChangedPixels,0,'Equivalent original-driver normalization changed samples.');
        assert.deepEqual(o.regions.map(r=>r.id),f.regions.map(r=>r.id));
        for(const k of['reference','actual','difference','alpha-difference','amplified','overlay'])linked(o.images[k]);
        if(view.scale===1&&view.background==='white')linked(o.images.comparison);
        for(let j=0;j<o.regions.length;j++){const r=o.regions[j],native=f.regions[j];assert.deepEqual(r.rectangle,native.rectangle);metric(r,r.rectangle.width*r.rectangle.height*o.scale**2,o.scale);
          if(r.crops){for(const k of['reference','actual','difference','amplified','sheet'])linked(r.crops[k]);assert.deepEqual(r.presentation.rasterRectangle,{x:r.rectangle.x*o.scale,y:r.rectangle.y*o.scale,width:r.rectangle.width*o.scale,height:r.rectangle.height*o.scale});}}
        assert.equal(o.regions.filter(r=>r.crops).length,2);locals+=o.regions.length;
        if(view.frame==='expanded'){const paired=observations.get(o.id.replace('/'+root+'/', '/'+edgeOracleRoots[0]+'/'));
          assert.deepEqual(o.metrics,paired.metrics);assert.equal(report.artifacts[o.images.actual],report.artifacts[paired.images.actual]);}
      }
    }
  }
  const pdfIds=frames.flatMap(f=>[1,4].flatMap(s=>['original-driver','native-semantic'].map(r=>f.caseId+'/pdf/'+r+'/'+s+'x')));assert.deepEqual(report.pdfObservations.map(o=>o.id),pdfIds);
  let pdfLocals=0;
  for(const o of report.pdfObservations){const f=frames.find(f=>f.caseId===o.caseId),pageArea=o.pageSize.width*o.pageSize.height;
    assert.equal(o.frame,'expanded');assert.equal(o.background,'white');assert.ok([1,4].includes(o.scale));raw(o.fullPage,pageArea);raw(o.repeat.pdf,pageArea);raw(o.repeat.svg,pageArea);
    assert.equal(o.repeat.pdf.rawChangedPixels,0);assert.equal(o.repeat.svg.rawChangedPixels,0);assert.equal(o.whole.id,'whole-picture');
    metric(o.whole,o.whole.rasterRectangles[o.scale+'x'].width*o.whole.rasterRectangles[o.scale+'x'].height,o.scale);linked(o.pdfPage);
    assert.deepEqual(o.regions.map(r=>r.id),f.regions.map(r=>r.id));
    for(const r of o.regions){const q=r.rasterRectangles[o.scale+'x'];metric(r,q.width*q.height,o.scale);}
    for(const k of['svg-page','pdf','svg','difference','amplified','overlay'])linked(o.images[k]);if(o.scale===1)linked(o.images.sheet);
    assert.equal(o.crops.length,2);for(const c of o.crops)for(const p of Object.values(c.images))linked(p);pdfLocals+=o.regions.length;
  }
  for(const region of report.agent.rankedRegions){linked(region.reference);linked(region.actual);linked(region.difference);linked(region.matching4x);assert.equal(region.fidelity,'research-observation');}
  assert.deepEqual(report.coverage,{derivations:75,views:900,localObservations:58140,independentRegions:323,serializationChecks:4264,rootChecks:300,pdfViews:20,pdfLocalObservations:1292});
  assert.equal(locals,58140);assert.equal(pdfLocals,1292);return report.coverage;
}
