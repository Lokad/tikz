// Immutable admission wraps an owned fresh trial and its independent checker.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact,outputPath} from './shape-oracle-bundle.mjs';
import {canonical,verifyLabelledSourceHashes} from './labelled-border-combined-common.mjs';
import {labelledCacheSha256} from './labelled-border-cache.mjs';
import {loadLabelledPolicy,labelledPolicyId,labelledPolicyScope,finishLabelledAdmission,
  validateLabelledAdmissionReport,validateLabelledViewer} from './labelled-border-admission-policy.mjs';
import {runOwnedLabelledChild,copyOwnedLabelledChild} from './labelled-border-owned-child.mjs';

const base=path.join(root,'artifacts/labelled-border-conformance'),output=path.join(base,'run-'+randomUUID());
const artifacts={},toolHashes={},inputs={};let phase='immutable-evidence',converterInvoked=false,trial=null;
const save=(p,b)=>writeArtifact(output,p,b,artifacts);
async function publish(report){const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',bytes);
  await writeArtifact(base,'latest.json',JSON.stringify({completed:report.completed,
    report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)},null,2)+'\n');
  return {report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)};}
function identify(child,key){return {sourceFile:child.marker.report,report:key+'/report.json',sha256:child.marker.sha256,
  completed:child.marker.completed,passed:child.marker.passed};}
try{
  await publish({completed:false,phase,converterInvoked,approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',artifacts});
  assert.equal(process.argv.length,2);const e=await loadLabelledPolicy();Object.assign(toolHashes,e.profile.guardToolHashes);
  for(const[p,h]of Object.entries(toolHashes)){const b=canonical(await readFile(path.join(root,p)));assert.equal(sha256(b),h);await save('tool-sources/'+p,b);}
  await save('profile.json',e.profileBytes);
  phase='owned-public-trial';converterInvoked=null;
  const t=await runOwnedLabelledChild('trial-labelled-border-cached.mjs',[],save,'trial-command.txt');
  trial=t.report;converterInvoked=trial.converterInvoked;inputs.trial=identify(t,'trial');await copyOwnedLabelledChild(t,'trial',save);
  assert.equal(t.status,0,'Fresh owned public trial did not pass; evidence retained.');
  phase='owned-saved-image-checker';
  const c=await runOwnedLabelledChild('labelled-border-cached-self-test.mjs',['--report',t.marker.report],save,'checker-command.txt');
  inputs.checker=identify(c,'checker');await copyOwnedLabelledChild(c,'checker',save);
  assert.equal(c.status,0,'Owned saved-image checker did not pass; evidence retained.');assert.equal(c.marker.inputReportSha256,t.marker.sha256);
  const numeric=JSON.parse(await readFile(path.join(t.folder,'candidate/report.json')));
  await verifyLabelledSourceHashes({...numeric.converterSources,...numeric.toolHashes});
  phase='combined-admission';const combined=finishLabelledAdmission(e,trial,c.report);
  const caseLinks=trial.cases.map(c=>({caseId:c.caseId,source:'trial/'+c.source,scene:'trial/'+c.scene}));
  const highResolution=trial.cases.map(c=>'<h2>'+c.caseId+'</h2><a href="trial/'+c.source+'">TikZ source</a> · <a href="trial/'+c.scene+'">Scene and spans</a>'
    +c.primary.filter(v=>v.scale===4&&v.background==='white').map(v=>'<p>Primary '+v.frame+' 4x: <a href="trial/'+v.images.difference+'">Raw difference</a> · '
      +'<a href="trial/'+v.images.reference+'">Reference</a> · <a href="trial/'+v.images.actual+'">Actual</a></p>').join('')
    +c.nativePage.filter(v=>v.scale===4).map(v=>'<p>Native '+v.frame+' 4x: <a href="trial/'+v.sheet+'">Contact sheet</a> · '
      +'<a href="trial/'+v.referencePage+'">Independent full page</a> · <a href="trial/'+v.actualPage+'">Public full page</a></p>').join('')).join('');
  const viewer='<!doctype html><meta charset="utf-8"><title>Labeled-border conformance</title>'
    +'<h1>Fixed labeled-border conformance</h1><p>'+labelledPolicyScope+'</p><p>All eight gates and the owned saved-image checker passed.</p>'
    +'<p><a href="report.json">Combined report</a> · <a href="profile.json">Immutable profile</a> · '
    +'<a href="trial/index.html">Paired images, source, scenes and defect crops</a> · <a href="checker/report.json">Independent checker</a></p>'
    +'<p>Ordinary PDF agreement is calibrated separately. Exact pixel identity refers to the independent native SVG page.</p>'
    +highResolution
    +'<iframe title="Trial images" src="trial/index.html" style="width:100%;height:80vh;border:0"></iframe>';
  validateLabelledViewer(viewer,artifacts,caseLinks);await save('index.html',viewer);
  for(const[p,h]of Object.entries(artifacts))assert.equal(sha256(await readFile(await outputPath(output,p))),h,p);
  await verifyLabelledSourceHashes(toolHashes);
  const report={schemaVersion:1,comparisonKind:'cached-public-labelled-border-conformance',completed:true,converterInvoked:true,
    approvedImagePolicy:combined.approvedImagePolicy,imageConformanceClaim:combined.imageConformanceClaim,overallVerdict:combined.overallVerdict,
    policyId:labelledPolicyId,policyScope:labelledPolicyScope,profileSha256:e.profileSha256,cacheSha256:labelledCacheSha256,
    renderer:trial.renderer,inputs,combined,toolHashes,
    agent:{viewer:'index.html',trialViewer:'trial/index.html',cases:caseLinks,firstFailedGate:combined.firstFailedGate,
      command:'node tools/TikzVisual/compare-labelled-border-conformance.mjs',checkerCommand:'node tools/TikzVisual/labelled-border-admission-self-test.mjs'},artifacts};
  validateLabelledAdmissionReport(report,e,trial,c.report,numeric);const location=await publish(report);
  console.log(JSON.stringify({kind:'labelled-border-conformance-output',completed:true,passed:true,...location}));
}catch(error){process.exitCode=2;console.error(error.stack);const location=await publish({completed:false,phase,converterInvoked,
  approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',firstFailedGate:trial?.combined?.firstFailedGate??null,
  error:error.message.replaceAll(root,'<repo>'),inputs,toolHashes,artifacts});
  console.log(JSON.stringify({kind:'labelled-border-conformance-output',completed:false,passed:false,...location}));}
