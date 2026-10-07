// Pure coverage, mutation and policy guards; no browser, TeX or converter.
import assert from 'node:assert/strict';
import {loadArrowEvidence} from './arrow-evidence.mjs';
import {buildArrowNativeFrame} from './arrow-native-frame.mjs';
import {buildArrowPrimaryReference} from './arrow-primary-reference.mjs';
import {arrowPrimaryDefects,arrowPrimaryVisibility,mutateArrowPrimary,arrowVisibilityInputs} from './arrow-primary-defects.mjs';
import {arrowPrimaryPlan,arrowSensitivity} from './arrow-primary-contract.mjs';
import {deriveArrowPrimaryPolicy,evaluateArrowPrimary,arrowPrimaryViews} from './arrow-primary-policy.mjs';
let controls=0;const equal=(a,b)=>{assert.deepEqual(a,b);controls++;},reject=fn=>{assert.throws(fn);controls++;};
const evidence=await loadArrowEvidence(),sources=new Map();
for(const c of evidence.cases){const f=buildArrowNativeFrame(c.id,evidence.artifacts.get(c.id+'/plain-reference.svg').toString(),c.metrics),built=buildArrowPrimaryReference(c.metrics,f);
 sources.set(c.id,built.svg);equal(built.instructions.rootMode,'picture');equal(built.instructions.paints.length,c.metrics.driverState.paints.length);
 equal(built.instructions.checks.every(c=>c.passed),true);reject(()=>buildArrowPrimaryReference(c.metrics,f,'other'));
}
for(const d of arrowPrimaryDefects){const source=sources.get(d.caseId),changed=mutateArrowPrimary(source,d);equal(changed!==source,true);
 equal(mutateArrowPrimary(source,d),changed);reject(()=>mutateArrowPrimary(source,{...d,target:'paint-999'}));
 if(!['remove','root','order','clip'].includes(d.change))equal((changed.match(/<path id="paint-/g)??[]).length,(source.match(/<path id="paint-/g)??[]).length);
}
for(const c of arrowPrimaryVisibility){const pair=arrowVisibilityInputs(sources.get(c.caseId),c);equal(pair.reference,pair.actual);equal(pair.missing!==pair.actual,true);
 reject(()=>arrowVisibilityInputs(sources.get(c.caseId),{...c,opacity:0}));}
const plan=arrowPrimaryPlan();equal(plan.length,378);equal(new Set(plan.map(p=>p.id)).size,378);equal(plan.filter(v=>v.kind==='defect').length,186);
const metric={rawChangedPixels:0,maxRawChannelError:0,premultipliedChangedPixels:0,maxPremultipliedChannelError:0,meanForegroundChannelError:0,
 topology:{threshold:16,connectivity:8,edgeNeighborhood:4,componentDifference:0,edgeState:'both-empty',maxEdgeDisplacementRasterPixels:0}};
const regions=[{id:'fixed',nodeId:null,kind:'tip',rectangle:{x:0,y:0,width:1,height:1},...metric}];
const cases=evidence.cases.map(c=>({id:c.id,measurements:arrowPrimaryViews.map(v=>({...v,converterInvoked:false,metrics:metric,regions,
 repeat:{rawChangedPixels:0},actualRepeat:{rawChangedPixels:0}}))}));
const policy=deriveArrowPrimaryPolicy(cases);for(const c of cases)for(const row of c.measurements)equal(evaluateArrowPrimary(policy,c.id,row).passed,true);
equal(evaluateArrowPrimary(policy,cases[0].id,{...cases[0].measurements[0],id:'experiment-id'}).checks.map(c=>c.id),['whole-picture','fixed']);
equal(evaluateArrowPrimary(JSON.parse(JSON.stringify(policy)),cases[0].id,cases[0].measurements[0]).passed,true);
reject(()=>deriveArrowPrimaryPolicy(cases.slice(1)));reject(()=>deriveArrowPrimaryPolicy(cases.map((c,i)=>i?c:{...c,measurements:c.measurements.slice(1)})));
const row=structuredClone(cases[0].measurements[0]);row.metrics.rawChangedPixels=1;equal(evaluateArrowPrimary(policy,cases[0].id,row).passed,false);
reject(()=>evaluateArrowPrimary({...policy,approvedImagePolicy:true},cases[0].id,row));reject(()=>evaluateArrowPrimary(policy,'unknown',row));
const bad=structuredClone(cases);bad[0].measurements[0].metrics.topology.componentDifference=1;reject(()=>deriveArrowPrimaryPolicy(bad));
const evaluation={passed:true,checks:[{id:'paint-2',passed:true}]};
equal(arrowSensitivity({name:'missing-legacy-tip',background:'white'},evaluation,'a','b').outcome,'visible-fault-accepted');
equal(arrowSensitivity({name:'missing-legacy-tip',background:'white'},evaluation,'a','a').outcome,'no-raster-change');
equal(arrowSensitivity({name:'missing-legacy-tip',background:'black'},evaluation,'a','a').outcome,'declared-invisible');
reject(()=>arrowSensitivity({name:'missing-legacy-tip',background:'black'},evaluation,'a','b'));
console.log(JSON.stringify({kind:'arrow-primary-controls',passed:true,controls,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false}));
