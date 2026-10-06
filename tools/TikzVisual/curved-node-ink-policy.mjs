// Additional fixed-corpus measurement. Shared and previously admitted math
// is unchanged; every original error ceiling is retained.
import assert from 'node:assert/strict';
import {shapePdfViews,deriveShapePdfTrialPolicy,evaluateShapePdfTrial} from './shape-pdf-trial-policy.mjs';
import {measureShapePdfPair} from './shape-pdf-image-pair.mjs';
export const curvedInkViewKey=v=>v.frame+'-'+v.scale+'x-'+v.background;

export async function measureCurvedNodeInk(renderer,{reference,actual,regions,scale,pageSize}){
  return renderer.page.evaluate(async({reference,actual,regions,scale,pageSize})=>{
    const require=(v,m)=>{if(!v)throw Error(m);};
    require(regions.length===99&&regions[0].id==='whole-picture'&&new Set(regions.map(r=>r.id)).size===99,'Incomplete curved-node ink regions.');
    require([1,4].includes(scale)&&Number.isSafeInteger(pageSize.width)&&Number.isSafeInteger(pageSize.height)&&pageSize.width>0&&pageSize.height>0&&pageSize.width*pageSize.height<=20000000,'Unbounded curved-node ink page.');
    async function read(url){
      require(typeof url==='string'&&url.startsWith('data:image/png;base64,')&&url.length<=110000000,'Invalid bounded page image.');
      const image=new Image();image.src=url;await image.decode();require(image.width===pageSize.width&&image.height===pageSize.height,'Ink page dimensions differ.');
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const ctx=canvas.getContext('2d',{colorSpace:'srgb',willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0);return ctx;
    }
    const left=await read(reference),right=await read(actual);
    return regions.map(r=>{
      const q=r.rasterRectangles[scale+'x'];require([q.x,q.y,q.width,q.height].every(Number.isSafeInteger)&&q.x>=0&&q.y>=0&&q.width>0&&q.height>0&&q.x+q.width<=pageSize.width&&q.y+q.height<=pageSize.height,'Invalid fixed ink crop.');
      const sum=ctx=>{const data=ctx.getImageData(q.x,q.y,q.width,q.height).data,channels=[0,0,0];for(let i=0;i<data.length;i+=4){require(data[i+3]===255,'Ink samples are not opaque white-backed.');for(let c=0;c<3;c++)channels[c]+=255-data[i+c];}require(channels.every(Number.isSafeInteger),'Invalid ink sum.');return channels;};
      return{id:r.id,reference:sum(left),actual:sum(right)};
    });
  },{reference,actual,regions,scale,pageSize});
}
export function attachCurvedNodeInk(row,coverage){
  assert.deepEqual(coverage.map(r=>r.id),[row.whole.id,...row.regions.map(r=>r.id)]);
  return{...row,whole:{...row.whole,inkCoverage:coverage[0]},regions:row.regions.map((r,i)=>({...r,inkCoverage:coverage[i+1]}))};
}
export async function measureCurvedNodePdfPair(renderer,input){
  const row=await measureShapePdfPair(renderer,input);assert.ok(row.images?.['svg-page']);
  return attachCurvedNodeInk(row,await measureCurvedNodeInk(renderer,{reference:input.pdfPage,actual:'data:image/png;base64,'+row.images['svg-page'],regions:input.regions,scale:input.scale,pageSize:row.pageSize}));
}
function validCoverage(row,region,camera){
  assert.deepEqual(row.pageSize,camera.rasterSizes[row.scale+'x']);const c=region.inkCoverage,q=region.rasterRectangles[row.scale+'x'];assert.equal(c.id,region.id);
  for(const side of['reference','actual'])assert.ok(Array.isArray(c[side])&&c[side].length===3&&c[side].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=q.width*q.height*255),'Invalid fixed native ink coverage.');
  return c;
}
export function deriveCurvedNodeInkPolicy(rows,camera,regions,mode){
  assert.ok(rows.every(r=>r.converterInvoked===false),'Candidate contributes to curved-node ink calibration.');
  const policy=deriveShapePdfTrialPolicy(rows,camera,regions,mode);
  policy.inkRows=shapePdfViews.map(view=>{const same=rows.filter(r=>curvedInkViewKey(r)===curvedInkViewKey(view));assert.equal(same.length,1);
    return{...view,regions:[same[0].whole,...same[0].regions].map(r=>structuredClone(validCoverage(same[0],r,camera)))};
  });
  policy.inkRule='Exact integer RGB sums of 255 minus each white-backed sample in fixed native-page crops; one preselected independent native-semantic-six-decimal representation per view, no margin or candidate input.';
  return policy;
}
export function evaluateCurvedNodeInkPolicy(policy,view,row){
  // Reports retain only the view tuple in each check. Passing an entire
  // measured row through the generic evaluator would duplicate its evidence.
  const tuple=Object.fromEntries(['frame','scale','background'].map(k=>[k,view[k]]));
  const evaluation=evaluateShapePdfTrial(policy,tuple,row),same=policy.inkRows.filter(v=>curvedInkViewKey(v)===curvedInkViewKey(tuple));assert.equal(same.length,1);
  const measured=[row.whole,...row.regions];assert.equal(same[0].regions.length,99);assert.equal(evaluation.checks.length,102);
  for(const[i,m]of measured.entries()){
    const coverage=validCoverage(row,m,policy.camera),expected=same[0].regions[i],check=evaluation.checks[i];assert.equal(expected.id,m.id);assert.deepEqual(coverage.reference,expected.reference,'PDF ink changed.');
    for(let channel=0;channel<3;channel++)check.metrics.push({quantity:'nativeInkCoverage-'+['red','green','blue'][channel],observed:coverage.actual[channel],expected:expected.actual[channel],passed:coverage.actual[channel]===expected.actual[channel]});
    check.passed=check.metrics.every(m=>m.passed);
  }
  return{...evaluation,passed:evaluation.checks.every(c=>c.passed),globalPassed:evaluation.checks[0].passed,regionalPassed:evaluation.checks.slice(1,99).every(c=>c.passed)};
}
