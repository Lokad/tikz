import assert from 'node:assert/strict';
import {calcHash,calcEqual} from './calc-saved-images.mjs';
import {calcTrialCachePath} from './calc-trial-cache-codec.mjs';
export function makeCalcAdmissionAgent(trial,profile,result){
  const baseline=trial.report.primary.filter(r=>r.capture==='explicit-viewport'&&r.frame==='expanded'&&r.background==='white');
  const selected=baseline.map(index=>{const row=trial.json(index.file);return{view:{capture:row.capture,frame:row.frame,scale:row.scale,background:row.background},
    record:'trial/'+index.file,reference:'trial/'+row.images.reference,candidate:'trial/'+row.images.actual,
    exactRgbaMatch:row.metrics.exactRgbaMatch,rawChangedPixels:row.metrics.rawChangedPixels,maxRawChannelError:row.metrics.maxRawChannelError};});
  const detailed=trial.json('agent-inspection.json');
  return{schemaVersion:1,completionState:'complete',verdict:result.verdict,policyId:profile.id,policyScope:profile.scope,firstRequiredFailure:result.firstFailedGate,
    report:'report.json',profile:'profile.json',fixture:'trial/candidate/source.tikz',scene:'trial/candidate/actual-scene.json',nativeAgreement:'trial/native-agreement.json',
    rootFrame:'trial/root-frame.json',selected,detail:'trial/agent-inspection.json',gallery:'trial/index.html',
    attribution:detailed.attribution,focusedRerun:{executable:'node',arguments:['tools/TikzVisual/compare-calc-conformance.mjs'],workingDirectory:'repository-root'},
    followUpCommands:[{executable:'dotnet',arguments:['test','Lokad.TikZ.slnx']}],
    presentation:'Paired baseline PNGs and the existing static defect-crop gallery. The common interactive viewer remains planned.'};
}
export function validateCalcAdmissionAgent(agent,trial,profile,result,files){
  calcEqual(agent,makeCalcAdmissionAgent(trial,profile,result),'Changed calc agent entry point');
  const links=[agent.profile,agent.fixture,agent.scene,agent.nativeAgreement,agent.rootFrame,agent.detail,agent.gallery,
    ...agent.selected.flatMap(r=>[r.record,r.reference,r.candidate])];
  for(const file of links){calcTrialCachePath(file);assert.ok(files.has(file),'Missing calc agent artifact: '+file);assert.ok(calcHash(files.get(file)));}
}
