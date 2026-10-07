import assert from 'node:assert/strict';
import {loadArrowEvidence} from './arrow-evidence.mjs';
import {buildArrowNativeFrame} from './arrow-native-frame.mjs';
import {arrowPdfRegions} from './arrow-native-contract.mjs';
import {arrowPaperPlan,arrowPaperInputs} from './arrow-pdf-contract.mjs';
import {arrowPdfViews,deriveArrowInkPolicy,evaluateArrowInk} from './arrow-pdf-policy.mjs';
import {arrowInkSample,measureArrowPdfInk} from './arrow-pdf-ink.mjs';
let controls=0;const equal=(a,b)=>{assert.deepEqual(a,b);controls++;},reject=fn=>{assert.throws(fn);controls++;};
const e=await loadArrowEvidence(),plan=arrowPaperPlan();equal(plan.length,296);equal(new Set(plan.map(v=>v.id)).size,296);
equal(plan.filter(v=>v.kind==='calibration').length,144);equal(plan.filter(v=>v.kind==='defect').length,124);equal(plan.filter(v=>v.kind==='padded-expanded').length,12);
for(const c of e.cases){const original=e.artifacts.get(c.id+'/plain-reference.svg').toString(),f=buildArrowNativeFrame(c.id,original,c.metrics),paper=arrowPdfRegions(c.metrics,f);
 equal(paper.regions.length,f.regions.length+1);equal(paper.regions[0].id,'whole-picture');
 for(const v of plan.filter(v=>v.caseId===c.id)){const input=arrowPaperInputs(v,c,f,original);equal(input.svg.includes('<svg'),true);
  if(v.kind==='calibration'&&v.route==='original-driver')equal(input.svg,original);
  if(v.kind==='padded-expanded'){const baseline=arrowPaperInputs({...v,kind:'calibration'},c,f,original);equal(input.svg.slice(input.svg.indexOf('>')),baseline.svg.slice(baseline.svg.indexOf('>')));}
 }
}
const b=new Uint8ClampedArray(2*3*4).fill(255);b.set([0,0,0,255],0);b.set([255,0,0,255],20);
const expected=[{mass:255,x:0,y:0},{mass:510,x:255,y:510},{mass:510,x:255,y:510}];equal(arrowInkSample(b,2,{x:0,y:0,width:2,height:3}),expected);
b[3]=0;reject(()=>arrowInkSample(b,2,{x:0,y:0,width:2,height:3}));
const region={id:'whole-picture',rasterRectangles:{'1x':{x:0,y:0,width:2,height:3},'4x':{x:0,y:0,width:8,height:12}},inkMoments:{reference:structuredClone(expected),actual:structuredClone(expected)}};
const rows=arrowPdfViews.map(v=>({...v,converterInvoked:false,pageSize:{width:20,height:30},whole:region,regions:[{...region,id:'fixed'}]})),p=deriveArrowInkPolicy(rows);
equal(evaluateArrowInk(JSON.parse(JSON.stringify(p)),rows[0]).passed,true);const shifted=structuredClone(rows[0]);shifted.whole.inkMoments.actual[0].x++;equal(evaluateArrowInk(p,shifted).passed,false);
reject(()=>deriveArrowInkPolicy(rows.slice(1)));reject(()=>evaluateArrowInk({...p,approvedImagePolicy:true},rows[0]));
console.log(JSON.stringify({kind:'arrow-PDF-controls',passed:true,controls,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false}));
export async function runArrowPaperInkControls(renderer){
 const pngs=await renderer.page.evaluate(()=>{const make=shift=>{const c=document.createElement('canvas');c.width=2;c.height=3;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,2,3);x.fillStyle='black';x.fillRect(shift,0,1,1);x.fillStyle='red';x.fillRect(1,2,1,1);return c.toDataURL('image/png').split(',')[1];};return[make(0),make(1)];});
 const r={id:'synthetic',rasterRectangles:{'1x':{x:0,y:0,width:2,height:3}}};
 const ink=await measureArrowPdfInk(renderer,pngs.map(p=>Buffer.from(p,'base64')),{width:2,height:3},[r,{...r,id:'same'}],1);
 assert.deepEqual(ink[0].inkMoments.reference,expected);assert.deepEqual(ink[0].inkMoments.actual,[{mass:255,x:255,y:0},{mass:510,x:510,y:510},{mass:510,x:510,y:510}]);
 assert.deepEqual(ink[0].inkCoverage.reference,ink[0].inkCoverage.actual);return{passed:true,massPreserved:true,translatedFirstMomentsDetected:true};
}
