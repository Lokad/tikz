// Structural proof loading is followed by the independent full replay command.
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {root,sha256,outputPath} from './shape-oracle-bundle.mjs';
import {arrowCachePath} from './arrow-image-cache-codec.mjs';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {arrowCurrentImageCacheSha256} from './arrow-current-image-cache.mjs';
import {validateArrowCurrentTrial} from './arrow-current-trial-reader.mjs';
import {loadArrowPolicy,verifyArrowGuards,validateArrowCheckedTrial,finishArrowAdmission,arrowPolicyId,arrowPolicyScope} from './arrow-admission-policy.mjs';
import {buildArrowAdmissionAgent,validateArrowAdmissionAgent,arrowAdmissionViewer} from './arrow-admission-agent.mjs';

export async function validateArrowAdmissionBundle(reportBytes,assets,e){
  assert.ok(reportBytes.length<=8000000);const r=JSON.parse(reportBytes),expected=new Set();
  const read=file=>{arrowCachePath(file);assert.ok(assets.has(file),'Missing arrow admission artifact: '+file);expected.add(file);return assets.get(file);};
  assertNativeEqual(Object.keys(r).sort(),['schemaVersion','comparisonKind','completed','phase','passed','converterInvoked','nativeToolInvoked','approvedImagePolicy','imageConformanceClaim','imageAdmission','overallVerdict','policyId','policyScope','renderer','profileSha256','acceptancePinSha256','qualificationCacheSha256','inputs','sourceHashes','combined','agent','viewer','artifacts'].sort());
  assertNativeEqual([r.schemaVersion,r.comparisonKind,r.completed,r.phase,r.passed,r.converterInvoked,r.nativeToolInvoked,r.approvedImagePolicy,r.imageConformanceClaim,r.imageAdmission,r.overallVerdict],
    [1,'current-arrow-conformance',true,'complete',true,true,false,true,true,'passed','pass']);
  assertNativeEqual([r.policyId,r.policyScope,r.profileSha256,r.acceptancePinSha256,r.qualificationCacheSha256],
    [arrowPolicyId,arrowPolicyScope,e.profileSha256,e.acceptancePinSha256,arrowCurrentImageCacheSha256]);
  assertNativeEqual(r.renderer,e.profile.renderer);assertNativeEqual(r.sourceHashes,e.profile.guardToolHashes);
  assert.ok(read('profile.json').equals(e.profileBytes));assert.ok(read('acceptance-pin.mjs').equals(e.acceptancePinBytes));
  assert.ok(read('qualification/current-combined.bin.gz').equals(e.compressed));
  for(const[file,hash]of Object.entries(r.sourceHashes))assert.equal(sha256(read('source-captures/'+file)),hash);
  assertNativeEqual(Object.keys(r.inputs),['trial','checker']);
  for(const role of ['trial','checker']){
    const input=r.inputs[role];assertNativeEqual(Object.keys(input).sort(),['sourceFile','report','sha256'].sort());assert.equal(input.report,role+'/report.json');
    assert.match(input.sourceFile,new RegExp('^artifacts/arrow-current-'+(role==='trial'?'trials':'checks')+'/run-[a-f0-9-]+/report\\.json$'));
    assert.equal(sha256(read(input.report)),input.sha256);assert.ok(read(role+'-command.log').length<=2000000);
  }
  const trialBytes=read('trial/report.json'),mb=read('trial/manifest.json'),manifest=JSON.parse(mb),ta=new Map();
  assert.ok(Object.keys(manifest.artifacts).length<=20000);for(const file of Object.keys(manifest.artifacts))ta.set(file,read('trial/'+file));
  const trial=await validateArrowCurrentTrial(trialBytes,mb,ta,e.publicCache.native);
  const checker=JSON.parse(read('checker/report.json'));assert.equal(checker.inputReport,r.inputs.trial.sourceFile);
  const readChecker=file=>read('checker/'+file),combined=await validateArrowCheckedTrial(e,trial,checker,readChecker,r.inputs.trial.sha256);
  assertNativeEqual(r.combined,finishArrowAdmission(e,combined));
  assertNativeEqual([r.agent,r.viewer],['agent-inspection.json','index.html']);
  const agent=JSON.parse(read(r.agent));validateArrowAdmissionAgent(agent,trial.json('agent-inspection.json'),r.artifacts);
  assertNativeEqual(agent,buildArrowAdmissionAgent(trial.json('agent-inspection.json')));assert.equal(read(r.viewer).toString(),arrowAdmissionViewer(agent));
  assertNativeEqual([...assets.keys()].sort(),[...expected].sort(),'Incomplete arrow admission artifact coverage.');
  assertNativeEqual(Object.keys(r.artifacts).sort(),[...assets.keys()].sort());
  for(const[file,hash]of Object.entries(r.artifacts)){assert.match(hash,/^[a-f0-9]{64}$/);assert.equal(sha256(assets.get(file)),hash,'Changed saved arrow admission artifact: '+file);}
  await verifyArrowGuards(e);return{report:r,assets,read,trial,checker,agent,e};
}
export async function loadArrowAdmissionReport(file,e){
  assert.match(file,/^artifacts\/arrow-conformance\/run-[a-f0-9-]+\/report\.json$/);const folder=path.dirname(path.join(root,file));
  const bounded=async(name,bound)=>{arrowCachePath(name);const full=await outputPath(folder,name);assert.ok((await stat(full)).size<=bound);return readFile(full);};
  const reportBytes=await bounded('report.json',8000000),r=JSON.parse(reportBytes);assert.ok(r.artifacts&&Object.keys(r.artifacts).length<=22000);
  const assets=new Map();let total=0;for(const name of Object.keys(r.artifacts)){const bytes=await bounded(name,64000000);total+=bytes.length;assert.ok(total<=1200000000);assets.set(name,bytes);}
  return{...await validateArrowAdmissionBundle(reportBytes,assets,e??await loadArrowPolicy()),folder,reportBytes,inputReportSha256:sha256(reportBytes)};
}
