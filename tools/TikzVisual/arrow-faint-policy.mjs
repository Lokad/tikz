// Prospective native-only PDF rule. Existing strict policies remain unchanged.
import assert from 'node:assert/strict';
import {shapePdfViews} from './shape-pdf-trial-policy.mjs';
import {shapePdfRasterRectangle} from './shape-pdf-camera.mjs';
export const arrowFaintContract={id:'native-arrow-nonzero-PDF-ink-v1',
 reference:'Unchanged ordinary PDF pages and fixed native page origin. No registration or candidate fit.',
 mask:'Threshold 16, eight-connected components and four-neighbor edges remain unchanged.',
 faint:'A native absent-mask edge state is eligible only when both routes retain nonzero raw RGB ink. A genuinely empty route stays ineligible.',
 ink:'Exact integer native SVG RGB mass and first absolute x/y moments; unchanged ordinary PDF moments. No slack.',
 metrics:'Exact native cross-renderer maxima per region/view; foreground mean rounded upward to 1e-9. Native topology state is fixed.',
 viewport:'All natural/expanded 1x/4x views are retained. Ineligible views block their route; expanded success does not excuse natural clipping.',
 scope:'Prospective fixed-fixture native observations. No approval or public admission.'};
export const arrowFaintViewKey=v=>v.frame+'/'+v.scale+'x-white';
const channels=['rawChangedPixels','maxRawChannelError','premultipliedChangedPixels','maxPremultipliedChannelError','meanForegroundChannelError'];
const identity=r=>({id:r.id,nodeId:r.nodeId??null,kind:r.kind??null,font:r.font??null,slot:r.slot??null,rectangle:r.rectangle,rasterRectangles:r.rasterRectangles});
const rowsOf=r=>[r.whole,...r.regions];
function valid(r,pageSize,scale){
 const q=r.rasterRectangles[scale+'x'],area=q.width*q.height;assert.ok(Object.values(q).every(Number.isSafeInteger)&&q.x>=0&&q.y>=0&&q.width>0&&q.height>0&&q.x+q.width<=pageSize.width&&q.y+q.height<=pageSize.height);
 for(const k of channels)assert.ok(Number.isFinite(r[k])&&r[k]>=0);for(const k of channels.slice(1).filter(k=>!k.endsWith('Pixels')))assert.ok(r[k]<=255);
 for(const k of ['rawChangedPixels','premultipliedChangedPixels','foregroundPixels','referenceForegroundPixels','actualForegroundPixels'])assert.ok(Number.isSafeInteger(r[k])&&r[k]>=0&&r[k]<=area);
 assert.ok(r.foregroundPixels>=Math.max(r.referenceForegroundPixels,r.actualForegroundPixels)&&r.foregroundPixels<=r.referenceForegroundPixels+r.actualForegroundPixels&&r.rawChangedPixels<=r.foregroundPixels);assert.equal(r.premultipliedChangedPixels,r.rawChangedPixels);assert.equal(r.maxPremultipliedChannelError,r.maxRawChannelError);
 assert.equal(r.exactRgbaMatch,r.rawChangedPixels===0);const t=r.topology;assert.deepEqual([t.threshold,t.connectivity,t.edgeNeighborhood],[16,8,4]);
 for(const k of ['referenceComponents','actualComponents','componentDifference','referenceEdgePixels','actualEdgePixels'])assert.ok(Number.isSafeInteger(t[k])&&t[k]>=0&&t[k]<=area);
 for(const side of ['reference','actual'])assert.ok(t[side+'Components']<=r[side+'ForegroundPixels']&&t[side+'EdgePixels']<=r[side+'ForegroundPixels']);
 assert.equal(t.componentDifference,Math.abs(t.referenceComponents-t.actualComponents));assert.equal(t.edgeState,t.referenceEdgePixels?t.actualEdgePixels?'measured':'actual-empty':t.actualEdgePixels?'reference-empty':'both-empty');
 if(['measured','both-empty'].includes(t.edgeState)){assert.ok(Number.isFinite(t.maxEdgeDisplacementRasterPixels)&&t.maxEdgeDisplacementRasterPixels>=0);assert.equal(t.maxEdgeDisplacementCssPixels,t.maxEdgeDisplacementRasterPixels/scale);if(t.edgeState==='both-empty')assert.equal(t.maxEdgeDisplacementRasterPixels,0);}else{assert.equal(t.maxEdgeDisplacementRasterPixels,null);assert.equal(t.maxEdgeDisplacementCssPixels,null);}
 assert.equal(r.inkCoverage.id,r.id);for(const side of ['reference','actual']){const m=r.inkMoments[side];assert.equal(m.length,3);for(const c of m){assert.deepEqual(Object.keys(c),['mass','x','y']);assert.ok(Object.values(c).every(n=>Number.isSafeInteger(n)&&n>=0));assert.ok(c.mass<=area*255&&c.x>=c.mass*q.x&&c.x<=c.mass*(q.x+q.width-1)&&c.y>=c.mass*q.y&&c.y<=c.mass*(q.y+q.height-1));}
  assert.deepEqual(r.inkCoverage[side],m.map(c=>c.mass));const mass=m.reduce((n,c)=>n+c.mass,0),count=r[side+'ForegroundPixels'];assert.ok(count<=mass&&mass<=count*765);}
}
function classification(r){const reference=r.inkMoments.reference.some(c=>c.mass>0),actual=r.inkMoments.actual.some(c=>c.mass>0);
 if(reference!==actual)return{state:'ineligible',reason:reference?'Native SVG has no raw ink for nonempty PDF region.':'Native PDF has no raw ink for nonempty SVG region.'};
 if(!reference)return{state:'eligible',basis:'both-routes-empty'};
 return{state:'eligible',basis:['measured'].includes(r.topology.edgeState)?'measured-native-edges':'nonzero-native-ink-below-mask'};
}
export function deriveArrowFaintPolicy(rows,camera,regions,mode){
 assert.deepEqual(rows.map(arrowFaintViewKey),shapePdfViews.map(arrowFaintViewKey));assert.ok(rows.every(r=>r.converterInvoked===false));assert.ok(regions.length>1&&regions[0].id==='whole-picture');assert.equal(new Set(regions.map(r=>r.id)).size,regions.length);
 for(const r of regions)for(const scale of [1,4])assert.deepEqual(r.rasterRectangles[scale+'x'],shapePdfRasterRectangle(r.rectangle,camera,scale));
 const calibrated=rows.map(row=>{assert.equal(row.mode,mode);assert.equal(row.background,'white');assert.equal(row.outsideWholeChangedPixels,0);assert.deepEqual(row.pageSize,camera.rasterSizes[row.scale+'x']);assert.deepEqual(rowsOf(row).map(identity),regions.map(identity));
  assert.deepEqual(Object.keys(row.repeat).sort(),['pdf','svg']);for(const repeated of Object.values(row.repeat))assert.deepEqual(repeated,{exactRgbaMatch:true,rawChangedPixels:0,maxRawChannelError:0});
  const native=rowsOf(row).map(r=>{valid(r,row.pageSize,row.scale);return{id:r.id,...classification(r),limits:{...Object.fromEntries(channels.map(k=>[k,k==='meanForegroundChannelError'?Math.ceil(r[k]*1e9)/1e9:r[k]])),componentDifference:r.topology.componentDifference,foregroundCountDifference:Math.abs(r.referenceForegroundPixels-r.actualForegroundPixels),edgeState:r.topology.edgeState,maxEdgeDisplacementRasterPixels:r.topology.maxEdgeDisplacementRasterPixels},reference:{foregroundPixels:r.referenceForegroundPixels,components:r.topology.referenceComponents,edgePixels:r.topology.referenceEdgePixels},inkMoments:structuredClone(r.inkMoments)};});
  return{frame:row.frame,scale:row.scale,background:'white',state:native.every(r=>r.state==='eligible')?'eligible':'ineligible',regions:native};});
 return{schemaVersion:1,comparisonKind:'unapproved-native-arrow-faint-PDF-policy',converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,contract:arrowFaintContract,mode,camera,regions:regions.map(identity),state:calibrated.every(r=>r.state==='eligible')?'eligible':'ineligible',rows:calibrated};
}
export function evaluateArrowFaint(policy,row){
 assert.deepEqual([policy.schemaVersion,policy.comparisonKind,policy.converterInvoked,policy.approvedImagePolicy,policy.imageConformanceClaim],[1,'unapproved-native-arrow-faint-PDF-policy',false,false,false]);assert.deepEqual(policy.contract,arrowFaintContract);
 assert.equal(row.mode,policy.mode);assert.equal(row.background,'white');assert.deepEqual(row.pageSize,policy.camera.rasterSizes[row.scale+'x']);assert.deepEqual(rowsOf(row).map(identity),policy.regions);
 const same=policy.rows.filter(r=>arrowFaintViewKey(r)===arrowFaintViewKey(row));assert.equal(same.length,1);const baseline=same[0],checks=rowsOf(row).map((r,i)=>{valid(r,row.pageSize,row.scale);const b=baseline.regions[i],l=b.limits;assert.equal(r.id,b.id);assert.deepEqual(r.inkMoments.reference,b.inkMoments.reference,'Ordinary PDF reference ink changed');assert.deepEqual([r.referenceForegroundPixels,r.topology.referenceComponents,r.topology.referenceEdgePixels],[b.reference.foregroundPixels,b.reference.components,b.reference.edgePixels]);
  const metrics=channels.map(k=>({quantity:k,observed:r[k],limit:l[k],passed:r[k]<=l[k]}));metrics.push({quantity:'native-region-eligibility',passed:b.state==='eligible'},
   {quantity:'componentDifference',passed:r.topology.componentDifference<=l.componentDifference},{quantity:'foregroundCountDifference',passed:Math.abs(r.referenceForegroundPixels-r.actualForegroundPixels)<=l.foregroundCountDifference},
   {quantity:'native-edge-state-and-distance',passed:r.topology.edgeState===l.edgeState&&(l.maxEdgeDisplacementRasterPixels===null?r.topology.maxEdgeDisplacementRasterPixels===null:r.topology.maxEdgeDisplacementRasterPixels<=l.maxEdgeDisplacementRasterPixels)});
  for(let c=0;c<3;c++)for(const k of ['mass','x','y'])metrics.push({quantity:'nativeRGB-'+c+'-'+k,observed:r.inkMoments.actual[c][k],expected:b.inkMoments.actual[c][k],passed:r.inkMoments.actual[c][k]===b.inkMoments.actual[c][k]});
  return{id:r.id,basis:b.basis??null,state:b.state,passed:metrics.every(m=>m.passed),failedQuantities:metrics.filter(m=>!m.passed).map(m=>m.quantity)};});
 checks.push({id:'outside-whole-picture',passed:row.outsideWholeChangedPixels===0});for(const name of ['pdf','svg'])checks.push({id:'unchanged-'+name+'-repeat',passed:JSON.stringify(row.repeat[name])===JSON.stringify({exactRgbaMatch:true,rawChangedPixels:0,maxRawChannelError:0})});
 return{state:baseline.state,passed:checks.every(c=>c.passed),checks};
}
