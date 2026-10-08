// Project complete saved inspection coverage into the owned admission namespace.
import assert from 'node:assert/strict';
import {arrowCachePath} from './arrow-image-cache-codec.mjs';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {arrowPolicyScope} from './arrow-admission-policy.mjs';

export function buildArrowAdmissionAgent(inspection){
  assert.equal(inspection.role,'current-candidate-inspection');
  const prefix=file=>{arrowCachePath(file);return'trial/'+file;};
  return{schemaVersion:1,role:'admitted-arrow-inspection',coverage:inspection.coverage,numeric:prefix(inspection.numeric),baseline:prefix(inspection.baseline),
    profile:'profile.json',checker:'checker/report.json',rawInspection:'trial/agent-inspection.json',
    primary:inspection.primary.map(r=>({...r,record:prefix(r.record),pair:prefix(r.pair),images:Object.fromEntries(Object.entries(r.images).map(([k,p])=>[k,prefix(p)])),crops:r.crops.map(prefix)})),
    pdf:inspection.pdf.map(r=>({...r,record:prefix(r.record),source:prefix(r.source),scene:prefix(r.scene)})),
    focus:inspection.focus.map(r=>({...r,sheet:prefix(r.sheet)}))};
}
export function arrowAdmissionAgentLinks(agent){
  return[agent.numeric,agent.baseline,agent.profile,agent.checker,agent.rawInspection,
    ...agent.primary.flatMap(r=>[r.record,r.pair,...Object.values(r.images),...r.crops]),...agent.pdf.flatMap(r=>[r.record,r.source,r.scene]),...agent.focus.map(r=>r.sheet)];
}
export function validateArrowAdmissionAgent(agent,inspection,artifacts){
  assertNativeEqual(agent,buildArrowAdmissionAgent(inspection));
  assertNativeEqual([agent.primary.length,agent.pdf.length,agent.focus.length],[306,396,520]);
  for(const file of arrowAdmissionAgentLinks(agent)){arrowCachePath(file);assert.match(artifacts[file]??'',/^[a-f0-9]{64}$/,'Missing admitted arrow inspection artifact: '+file);}
}
export function arrowAdmissionViewer(agent){
  return'<!doctype html><meta charset="utf-8"><title>Fixed arrow conformance</title><style>body{font:16px sans-serif;margin:24px;max-width:1400px}img{max-width:100%;image-rendering:pixelated}pre{white-space:pre-wrap}</style><h1>Fixed arrow conformance</h1><p>'+arrowPolicyScope+'</p><p><a href="report.json">Admission report</a> · <a href="profile.json">Approved profile</a> · <a href="agent-inspection.json">Complete inspection index</a> · <a href="trial/agent-inspection.json">Raw current inspection</a> · <a href="checker/report.json">Independent check</a> · <a href="trial/baseline/numeric/report.json">Current numeric evidence</a> · <a href="trial/index.html">Primary gallery</a> · <a href="trial/pdf/index.html">PDF focus gallery</a></p>'+agent.primary.filter(r=>r.view.includes('1x-white')).map(r=>'<article><h2>'+r.view+'</h2><a href="'+r.record+'">Source attribution</a><img src="'+r.pair+'">'+r.crops.map(file=>'<img src="'+file+'">').join('')+'</article>').join('');
}
