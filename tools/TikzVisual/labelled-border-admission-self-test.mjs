// Admission integrity controls. The owned raw checker supplies independent
// numeric/source/pixel remeasurement; this command verifies that proof's binding.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {canonical,verifyLabelledSourceHashes} from './labelled-border-combined-common.mjs';
import {loadLabelledPolicy,labelledProfileFile,validateLabelledProfile,verifyLabelledGuards,
  validateLabelledAdmissionReport,validateLabelledViewer,finishLabelledAdmission,labelledRequiredGates} from './labelled-border-admission-policy.mjs';
import {decodeLabelledCache,labelledCacheSha256} from './labelled-border-cache.mjs';
import {finishLabelledCachedGates} from './labelled-border-cached-coverage.mjs';

const base=path.join(root,'artifacts/labelled-border-admission-controls'),output=path.join(base,'run-'+randomUUID());
const artifacts={},controls=[],toolHashes={};let phase='immutable-evidence',inputReportSha256=null;
const save=(p,b)=>writeArtifact(output,p,b,artifacts);
async function publish(report){const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',bytes);
  await writeArtifact(base,'latest.json',JSON.stringify({completed:report.completed,
    report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)},null,2)+'\n');
  return {report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)};}
function reject(name,action){assert.throws(action,undefined,'Accepted admission control: '+name);controls.push({name,expected:'reject',passed:true});}
async function rejectAsync(name,action){await assert.rejects(action,undefined,'Accepted admission control: '+name);controls.push({name,expected:'reject',passed:true});}
try{
  await publish({completed:false,passed:false,converterInvoked:false,artifacts});
  assert.ok(process.argv.length===2||(process.argv.length===4&&process.argv[2]==='--report'));
  const e=await loadLabelledPolicy();Object.assign(toolHashes,e.profile.guardToolHashes);
  for(const[p,h]of Object.entries(toolHashes)){const b=canonical(await readFile(path.join(root,p)));assert.equal(sha256(b),h);await save('tool-sources/'+p,b);}
  await save('profile.json',e.profileBytes);
  const family=path.join(root,'artifacts/labelled-border-conformance');let bytes,folder;
  if(process.argv.length===4){assert.match(process.argv[3],/^artifacts\/labelled-border-conformance\/run-[a-f0-9-]+\/report.json$/);
    folder=path.dirname(path.join(root,process.argv[3]));bytes=await readFile(path.join(folder,'report.json'));
  }else{const p=JSON.parse(await readFile(path.join(family,'latest.json')));assert.equal(p.completed,true);
    assert.match(p.report,/^run-[a-f0-9-]+\/report.json$/);folder=path.dirname(path.join(family,p.report));
    bytes=await readFile(path.join(folder,'report.json'));assert.equal(sha256(bytes),p.sha256);}
  const r=JSON.parse(bytes),read=async p=>readFile(await outputPath(folder,p));inputReportSha256=sha256(bytes);
  for(const[p,h]of Object.entries(r.artifacts))assert.equal(sha256(await read(p)),h,p);
  await verifyLabelledSourceHashes(r.toolHashes);
  const trialBytes=await read('trial/report.json'),checkerBytes=await read('checker/report.json');
  assert.equal(sha256(trialBytes),r.inputs.trial.sha256);assert.equal(sha256(checkerBytes),r.inputs.checker.sha256);
  const trial=JSON.parse(trialBytes),checker=JSON.parse(checkerBytes),numeric=JSON.parse(await read('trial/candidate/report.json'));
  await verifyLabelledSourceHashes({...trial.toolHashes,...checker.toolHashes,...numeric.converterSources,...numeric.toolHashes});
  validateLabelledAdmissionReport(r,e,trial,checker,numeric);
  const viewer=(await read('index.html')).toString('utf8');validateLabelledViewer(viewer,r.artifacts,r.agent.cases);
  reject('Viewer missing artifact',()=>validateLabelledViewer(viewer.replace('href="profile.json"','href="missing-profile.json"'),r.artifacts,r.agent.cases));
  reject('Viewer undefined 4x link',()=>validateLabelledViewer(viewer.replace('href="profile.json"','href="trial/undefined"'),r.artifacts,r.agent.cases));
  // Logs come from bounded owned processes. Exactly one final record must
  // identify each copied report, and the checker must name this very trial.
  for(const[key,kind]of [['trial','labelled-border-cached-trial-output'],['checker','labelled-border-cached-check-output']]){
    const records=(await read(key+'-command.txt')).toString('utf8').split(/\r?\n/).filter(s=>s.startsWith('{'))
      .map(s=>JSON.parse(s)).filter(q=>q.kind===kind&&q.final===true);assert.equal(records.length,1);
    assert.equal(records[0].report,r.inputs[key].sourceFile);assert.equal(records[0].sha256,r.inputs[key].sha256);
    assert.deepEqual([records[0].completed,records[0].passed],[true,true]);
    if(key==='checker')assert.equal(records[0].inputReportSha256,r.inputs.trial.sha256);
  }
  await save('input-report.json',bytes);await save('owned-trial-report.json',trialBytes);await save('owned-checker-report.json',checkerBytes);
  controls.push({name:'Exact owned trial, checker, all saved bytes and current source identities',expected:'pass',passed:true});
  phase='profile-corruption';
  const profileChanges={id:p=>p.id='different-family',scope:p=>p.scope='All TikZ',approval:p=>p.approvedImagePolicy=false,
    cache:p=>p.calibration.sha256='0'.repeat(64),decoded:p=>p.calibration.decodedSha256='0'.repeat(64),
    nativeAllowance:p=>p.nativePageRawLimit=1,nativeClaim:p=>p.claims.nativePage='ordinary-PDF-pixel-identity',
    primaryView:p=>p.requiredViews.primary.pop(),pdfView:p=>p.requiredViews.pdf.pop(),gate:p=>p.requiredGates.pop(),
    primaryFrame:p=>p.cases[0].primaryFrameSha256='0'.repeat(64),primaryPolicy:p=>p.cases[0].primaryPolicySha256='0'.repeat(64),
    pdfCamera:p=>p.cases[0].pdfCameraSha256='0'.repeat(64),pdfRegions:p=>p.cases[0].pdfRegionsSha256='0'.repeat(64),
    pdfPolicy:p=>p.cases[0].pdfPoliciesSha256='0'.repeat(64),missingCase:p=>p.cases.pop(),
    missingGuard:p=>delete p.guardToolHashes[Object.keys(p.guardToolHashes)[0]],extraGuard:p=>p.guardToolHashes['tools/unknown.mjs']='0'.repeat(64)};
  for(const k of Object.keys(e.profile.counts))profileChanges['count/'+k]=p=>p.counts[k]--;
  for(const k of Object.keys(e.profile.qualification))profileChanges['qualification/'+k]=p=>p.qualification[k]='0'.repeat(64);
  for(const[name,change]of Object.entries(profileChanges))reject('profile/'+name,()=>{const p=structuredClone(e.profile);change(p);validateLabelledProfile(p,e);});
  const compressed=Buffer.from(e.compressed);compressed[compressed.length-1]^=1;
  reject('Changed compressed cache bytes',()=>decodeLabelledCache(compressed));
  const replacement=structuredClone(e.calibration);replacement.converterInvoked=true;
  reject('Consistently rehashed replacement cache remains unreviewed',()=>decodeLabelledCache(gzipSync(Buffer.from(JSON.stringify(replacement)))));
  await rejectAsync('Missing admission profile',()=>loadLabelledPolicy(p=>p===path.join(root,labelledProfileFile)?Promise.reject(Error('Controlled missing profile')):readFile(p)));
  phase='source-corruption';const saved=new Map();
  for(const p of Object.keys(toolHashes))saved.set(path.join(root,p),await readFile(path.join(root,p)));
  const savedRead=p=>{assert.ok(saved.has(p));return Promise.resolve(saved.get(p));};
  for(const p of Object.keys(toolHashes)){
    const target=path.join(root,p);
    await rejectAsync('missing/'+p,()=>verifyLabelledGuards(e.profile,q=>q===target?Promise.reject(Error('Controlled missing guard')):savedRead(q)));
    await rejectAsync('changed/'+p,()=>verifyLabelledGuards(e.profile,q=>q===target?Promise.resolve(Buffer.concat([saved.get(q),Buffer.from(' ')])):savedRead(q)));
  }
  await verifyLabelledGuards(e.profile,async p=>Buffer.from(canonical(await savedRead(p)).toString('utf8').replaceAll('\n','\r\n')));
  controls.push({name:'Declared CRLF to LF source contract',expected:'pass',passed:true});
  // Pinned original producer hashes cannot stand for reviewed current tools.
  const historical=JSON.parse(e.bytes).toolHashes;
  historical['tools/TikzShapeComparison/NativeGlyphTrace.cs']='2695161667fdb35dcb3948e8d02c8c5fe035bfdd12cdddb7e8a43c375ff6e8b1';
  const historicalSubstitutions=Object.entries(historical).filter(([file,h])=>h!==e.profile.guardToolHashes[file]);
  assert.ok(historicalSubstitutions.length>0,'Historical guards must exercise current-source rejection');
  for(const[file,h]of historicalSubstitutions){
    const p=structuredClone(e.profile);p.guardToolHashes[file]=h;
    await rejectAsync('historical-guard-substitution/'+file,()=>verifyLabelledGuards(p,savedRead));
  }
  await rejectAsync('Historical producer hashes are not a current source check',()=>verifyLabelledSourceHashes(historical));
  phase='report-binding';
  const outerChanges={completion:q=>q.completed=false,role:q=>q.converterInvoked=false,approval:q=>q.approvedImagePolicy=false,
    claim:q=>q.imageConformanceClaim=false,verdict:q=>q.overallVerdict='pending',policy:q=>q.policyId='different-family',
    scope:q=>q.policyScope='All TikZ',profile:q=>q.profileSha256='0'.repeat(64),cache:q=>q.cacheSha256='0'.repeat(64),
    wrongTrial:q=>q.inputs.trial.sha256='0'.repeat(64),wrongChecker:q=>q.inputs.checker.sha256='0'.repeat(64),
    failedChild:q=>q.inputs.checker.passed=false,latestSelector:q=>q.inputs.trial.sourceFile='artifacts/labelled-border-cached-trial/latest.json',
    detachedReport:q=>q.inputs.trial.report='checker/report.json',lostArtifact:q=>delete q.artifacts['trial/report.json'],
    lostProfile:q=>delete q.artifacts['profile.json'],missingViewer:q=>q.agent.viewer='absent.html',wrongSource:q=>q.agent.cases[0].source='trial/absent.tikz',failedSummary:q=>q.combined.passed=false,
    wrongTool:q=>q.toolHashes[Object.keys(q.toolHashes)[0]]='0'.repeat(64)};
  for(const[name,change]of Object.entries(outerChanges))reject('report/'+name,()=>{
    const q={...r,inputs:structuredClone(r.inputs),artifacts:{...r.artifacts},agent:structuredClone(r.agent),combined:structuredClone(r.combined),toolHashes:{...r.toolHashes}};
    change(q);validateLabelledAdmissionReport(q,e,trial,checker,numeric);
  });
  for(const[name,change]of Object.entries({input:q=>q.inputReportSha256='0'.repeat(64),bytes:q=>q.artifacts['input-report.json']='0'.repeat(64),
    completion:q=>q.completed=false,result:q=>q.passed=false,rawApproval:q=>q.approvedImagePolicy=true,rawClaim:q=>q.imageConformanceClaim=true,
    missingControl:q=>q.controls.pop(),duplicate:q=>q.controls[1]=q.controls[0],metric:q=>q.metricsRecomputed--,page:q=>q.pagesRecomputed--,
    numeric:q=>q.numericAssertions--}))reject('checker/'+name,()=>{
      const q={...checker,controls:structuredClone(checker.controls),artifacts:{...checker.artifacts}};change(q);
      validateLabelledAdmissionReport(r,e,trial,q,numeric);
    });
  for(const gate of labelledRequiredGates){
    const q={...trial,cases:trial.cases.map(c=>({...c,combined:structuredClone(c.combined)})),
      primaryControls:trial.primaryControls.map(c=>({...c})),pdfControls:trial.pdfControls.map(c=>({...c}))};
    if(gate==='freshPrimary')q.primaryControls[0].passed=false;else if(gate==='freshPdfNative')q.pdfControls[0].passed=false;
    else q.cases[0].combined.gates[gate].state='failed';
    q.combined=finishLabelledCachedGates(q.cases,q.primaryControls,q.pdfControls);
    const result=finishLabelledAdmission(e,q,checker);assert.equal(result.passed,false);assert.equal(result.imageConformanceClaim,false);
    assert.equal(result.firstFailedGate,gate);controls.push({name:'Passing other gates cannot admit failure of '+gate,expected:'fail',passed:true});
  }
  const failed=finishLabelledAdmission(e,trial,{...checker,completed:false,passed:false});assert.equal(failed.imageConformanceClaim,false);
  assert.equal(failed.firstFailedGate,'evidence');controls.push({name:'Passing images cannot replace the owned independent checker',expected:'fail',passed:true});
  await verifyLabelledSourceHashes({...toolHashes,...numeric.converterSources,...numeric.toolHashes});
  const location=await publish({schemaVersion:1,comparisonKind:'cached-labelled-border-admission-controls',completed:true,passed:true,
    converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',inputReportSha256,
    profileSha256:e.profileSha256,cacheSha256:labelledCacheSha256,ownedProof:{numericAssertions:1624,metricsRecomputed:22908,pagesRecomputed:138,controls:50},
    controls,toolHashes,artifacts});
  console.log(JSON.stringify({kind:'labelled-border-admission-check-output',completed:true,passed:true,controls:controls.length,...location}));
}catch(error){process.exitCode=2;console.error(error.stack);await publish({completed:false,passed:false,converterInvoked:false,
  approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',phase,inputReportSha256,
  error:error.message.replaceAll(root,'<repo>'),controls,toolHashes,artifacts});}
