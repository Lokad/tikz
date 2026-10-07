// Pure checks: factorial changes, native dimensional roundtrips and full coverage.
import assert from 'node:assert/strict';
import {loadArrowEvidence} from './arrow-evidence.mjs';
import {buildArrowNativeFrame} from './arrow-native-frame.mjs';
import {makeArrowNativeSvg,arrowNativeRepresentations} from './arrow-native-svg.mjs';
import {arrowPrecisionHybrid,arrowIsolatedPenProbe,arrowPenProbeWidths} from './arrow-precision-model.mjs';
import {arrowPrecisionPlan} from './arrow-precision-contract.mjs';
let controls=0;const equal=(a,b)=>{assert.deepEqual(a,b);controls++;},reject=fn=>{assert.throws(fn);controls++;};
const evidence=await loadArrowEvidence();
for(const c of evidence.cases){const frame=buildArrowNativeFrame(c.id,evidence.artifacts.get(c.id+'/plain-reference.svg').toString(),c.metrics);
 const exact=makeArrowNativeSvg(c.metrics,frame,arrowNativeRepresentations[1],'ink'),short=makeArrowNativeSvg(c.metrics,frame,arrowNativeRepresentations[0],'ink');
 equal(arrowPrecisionHybrid(c.metrics,frame,0).svg,exact.svg);equal(arrowPrecisionHybrid(c.metrics,frame,7).svg,short.svg);
 for(let mask=0;mask<8;mask++){const hybrid=arrowPrecisionHybrid(c.metrics,frame,mask);
  equal(hybrid.paints.map(p=>p.d),(mask&1?short:exact).instructions.paints.map(p=>p.d));
  equal(hybrid.paints.map(p=>p.attributes['stroke-width']),(mask&2?short:exact).instructions.paints.map(p=>p.attributes['stroke-width']));
  equal(hybrid.paints.map(p=>p.transform),(mask&4?short:exact).instructions.paints.map(p=>p.transform));
  equal(hybrid.paints.map(p=>p.eventId),c.metrics.driverState.paints.map(p=>p.eventId));
  equal(hybrid.paints.map(p=>p.clips),c.metrics.driverState.paints.map(p=>p.clips));
 }
 reject(()=>arrowPrecisionHybrid(c.metrics,frame,8));reject(()=>arrowPrecisionHybrid(c.metrics,frame,-1));
 if(c.id==='transforms')for(const width of arrowPenProbeWidths){const probe=arrowIsolatedPenProbe(c.metrics,frame,width);
  equal(probe.record.recoveredSp,Math.round(Number(width)*65536));equal(probe.record.nativeWidthSp,26214);
  equal((probe.svg.match(/<path\b/g)??[]).length,1);
 }
}
const plan=arrowPrecisionPlan(evidence.cases.map(c=>c.id));equal(plan.length,390);equal(new Set(plan.map(p=>p.id)).size,390);
equal(plan.filter(p=>p.kind==='baseline').length,144);equal(plan.filter(p=>p.kind==='hybrid').length,192);equal(plan.filter(p=>p.kind==='pen').length,54);
console.log(JSON.stringify({kind:'arrow-precision-controls',passed:true,controls,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false}));
