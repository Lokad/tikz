// Deterministic inspection projection. Ranking never changes an image gate.
import assert from 'node:assert/strict';
const compareText=(a,b)=>a<b?-1:a>b?1:0;
const imagePath=p=>{assert.ok(typeof p==='string'&&/^[A-Za-z0-9_./-]+$/.test(p)&&!p.startsWith('/')&&!p.split('/').some(s=>['','..','.'].includes(s)));return 'trial/'+p;};
function utilization(check){
  return Math.max(0,...check.metrics.map(m=>{
    assert.ok(Number.isFinite(m.observed));
    if(m.expected!==undefined){assert.ok(Number.isFinite(m.expected));return Math.abs(m.observed-m.expected);}
    assert.ok(Number.isFinite(m.limit)&&m.limit>=0);return m.limit===0?m.observed:m.observed/m.limit;
  }));
}
export function buildEdgeAgent(trial){
 const rankedRegions=[];
 for(const c of trial.cases){
  const sources=new Map(c.sources.map(s=>[s.regionId,s]));assert.equal(sources.size,c.sources.length);
  for(const [route,rows]of [['primary',c.primary],['candidatePdf',c.candidatePdf]])for(const row of rows){
   const checks=new Map(row.evaluation.checks.map(q=>[q.id,q]));
   assert.deepEqual(row.regions.map(r=>r.id),c.sources.map(s=>s.regionId));
   for(const r of row.regions){
    const check=checks.get(r.id),source=sources.get(r.id);assert.ok(check&&source);
    const rectangle=route==='primary'?Object.fromEntries(Object.entries(r.rectangle).map(([k,v])=>[k,v*row.scale])):r.rasterRectangles[row.scale+'x'];
    assert.ok(rectangle&&Object.values(rectangle).every(Number.isSafeInteger)&&rectangle.width>0&&rectangle.height>0);
    const crop=row.crops.find(c=>c.id===r.id);
    const images=route==='primary'?Object.fromEntries(Object.entries(row.images).map(([k,p])=>[k,imagePath(p)])):{reference:imagePath('native-inputs/tests/Reference/CurvedEdges/'+c.id+'/plain-pdf-page-'+row.scale+'x.png'),actual:imagePath(row.images['svg-page'])};
    rankedRegions.push({caseId:c.id,route,view:{frame:row.frame,scale:row.scale,background:row.background},regionId:r.id,passed:check.passed,
      budgetUtilization:utilization(check),rawChangedPixels:r.rawChangedPixels,meanForegroundChannelError:r.meanForegroundChannelError,metrics:check.metrics,
      referenceRoute:route==='primary'?'unchanged-original-driver-SVG':'ordinary-native-PDF-page',source,sourceFile:'trial/numeric/'+c.id+'/source.tikz',scene:'trial/numeric/'+c.id+'/actual-scene.json',rectangle,images,
      crops:crop?Object.fromEntries(Object.entries(crop.images).map(([k,p])=>[k,imagePath(p)])):null});
   }
  }
 }
 rankedRegions.sort((a,b)=>Number(a.passed)-Number(b.passed)||b.budgetUtilization-a.budgetUtilization||b.meanForegroundChannelError-a.meanForegroundChannelError
  ||b.rawChangedPixels-a.rawChangedPixels||compareText([a.caseId,a.route,a.view.frame,a.view.scale,a.view.background,a.regionId].join('/'),[b.caseId,b.route,b.view.frame,b.view.scale,b.view.background,b.regionId].join('/')));
 assert.equal(rankedRegions.length,6224);
 return{viewer:'index.html',trialViewer:'trial/index.html',firstFailedGate:trial.combined.firstFailedGate,command:'node tools/TikzVisual/compare-curved-edge-conformance.mjs',
  ranking:'Failed first, then descending local budget utilization, mean foreground error and changed pixels; lexical tuple breaks ties. Presentation only.',
  coverage:{primary:4668,candidatePdf:1556,total:6224,sourceRegions:389},rankedRegions};
}
export function validateEdgeAgentLinks(agent,artifacts){
 for(const r of agent.rankedRegions){
  for(const p of [r.sourceFile,r.scene,...Object.values(r.images),...Object.values(r.crops??{})])assert.match(artifacts[p]??'',/^[a-f0-9]{64}$/,'Missing agent artifact: '+p);
 }
}
