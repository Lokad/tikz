// Fixed profile controls are browser-free; saved-proof controls bind a real result.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {arrowCanonical} from './arrow-native-contract.mjs';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {arrowCurrentImageProofs} from './arrow-current-image-cache.mjs';
import {loadArrowPolicy,validateArrowProfile,verifyArrowGuards,decodeArrowProfile,validateArrowCheckedTrial,finishArrowAdmission} from './arrow-admission-policy.mjs';
import {loadArrowAdmissionReport,validateArrowAdmissionBundle} from './arrow-admission-reader.mjs';

const args=process.argv.slice(2);assert.ok(args.length===0||args.length===2&&args[0]==='--report');
const output=path.join(root,'artifacts/arrow-admission-controls/run-'+randomUUID()),controls=[],ownSources={};let phase='profile';
const pass=name=>controls.push({name,passed:true});
async function reject(name,action){let rejection;await assert.rejects(async()=>action(),error=>{assert.ok(error instanceof assert.AssertionError);rejection=error.message.slice(0,500);return true;});controls.push({name,passed:true,rejection});}
async function publish(completed,details){
  const bytes=Buffer.from(JSON.stringify({schemaVersion:1,comparisonKind:'arrow-admission-controls',completed,phase,converterInvoked:false,nativeToolInvoked:false,browserInvoked:false,
    approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',ownSources,controls,...details},null,2)+'\n');await writeArtifact(output,'report.json',bytes);
  console.log(JSON.stringify({completed,controls:controls.length,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));
}
try{
  const e=await loadArrowPolicy();Object.assign(ownSources,e.profile.guardToolHashes);
  for(const[file,hash]of Object.entries(ownSources)){const bytes=arrowCanonical(await readFile(path.join(root,file)));assert.equal(sha256(bytes),hash);await writeArtifact(output,'source-captures/'+file,bytes);}
  assertNativeEqual([e.profile.requiredGates.length,e.profile.counts.primaryControls,e.profile.counts.pdfControls,e.profile.counts.focusSelections],[16,306,396,520]);
  pass('fixed profile, native-only bindings, complete qualified proof and current guards');
  const fields=[['false policy approval',p=>p.approvedImagePolicy=false],['changed profile identity',p=>p.id+='-changed'],['broadened scope',p=>p.scope+=' all TikZ'],
    ['changed renderer',p=>p.renderer.browser='changed'],['changed native limits',p=>p.nativeBindingsSha256='0'.repeat(64)],['changed qualification',p=>p.qualification.sha256='0'.repeat(64)],
    ['lost qualified proof',p=>delete p.qualification.proofHashes.reader],['lost gate',p=>p.requiredGates.pop()],['undercounted numeric',p=>p.numericChecks--],
    ['changed numeric case count',p=>p.numericCounts[0]--],['weakened native pixel limit',p=>p.nativePageRawLimit=1],['lost case',p=>p.nativeCases.pop()],
    ['changed source envelope',p=>p.nativeCases[0].sourceEnvelopeSha256='0'.repeat(64)],['changed PDF camera',p=>p.nativeCases[0].pdfCameraSha256='0'.repeat(64)],
    ['changed PDF regions',p=>p.nativeCases[0].pdfRegionsSha256='0'.repeat(64)],['changed primary sensitivity',p=>p.sensitivity.primarySha256='0'.repeat(64)],
    ['changed PDF sensitivity',p=>p.sensitivity.pdfSha256='0'.repeat(64)],['lost focus coverage',p=>p.counts.focusSelections--],['changed focused selection',p=>p.sensitivity.focusSha256='0'.repeat(64)],
    ['undercounted independent images',p=>p.independent.pdf[4]--],['lost corruption control',p=>p.independent.controlNames.pop()],
    ['lost fixture',p=>delete p.inputHashes[Object.keys(p.inputHashes)[0]]],['changed fixture hash',p=>p.inputHashes[Object.keys(p.inputHashes)[0]]='0'.repeat(64)],
    ['false hosted claim',p=>p.claims.hostedExecution='verified'],['lost source guard',p=>delete p.guardToolHashes[Object.keys(p.guardToolHashes)[0]]]];
  for(const[name,change]of fields){const p=structuredClone(e.profile);change(p);await reject(name,()=>validateArrowProfile(p,e));}
  for(const key of ['primary','pdf','primaryControls','pdfControls']){
    const p=structuredClone(e.profile);p.requiredViews[key].pop();await reject('lost required view/'+key,()=>validateArrowProfile(p,e));
  }
  for(const key of e.profile.requiredGates){const p=structuredClone(e.profile);p.gateCounts[key][1]--;await reject('undercounted profile gate/'+key,()=>validateArrowProfile(p,e));}
  const changed=structuredClone(e.profile);changed.scope='unreviewed';await reject('fully rehashed unreviewed profile bytes',()=>decodeArrowProfile(Buffer.from(JSON.stringify(changed)+'\n')));
  const different=structuredClone(e.profile);different.guardToolHashes[Object.keys(different.guardToolHashes)[0]]='0'.repeat(64);
  await reject('fully rehashed changed source guard',()=>verifyArrowGuards({...e,profile:different}));
  const qualify=()=>validateArrowCheckedTrial(e,e.model,e.reports.reader,file=>e.get('proofs/reader/'+file),arrowCurrentImageProofs.producer.sha256,'historical-qualification');
  const combined=await qualify();assert.equal(finishArrowAdmission(e,combined).passed,true);pass('complete qualified raw result remains pending while profile admission is distinct');
  for(const key of e.profile.requiredGates){
    const failed=structuredClone(combined);failed.gates[key].state='failed';failed.passed=false;
    assertNativeEqual([finishArrowAdmission(e,failed).passed,finishArrowAdmission(e,failed).imageConformanceClaim,finishArrowAdmission(e,failed).firstFailedGate],[false,false,key]);pass('failed gate prevents admission/'+key);
    failed.passed=true;await reject('false passed aggregate/'+key,()=>finishArrowAdmission(e,failed));
    const missing=structuredClone(combined);delete missing.gates[key];await reject('missing required gate/'+key,()=>finishArrowAdmission(e,missing));
    const under=structuredClone(combined);under.gates[key].executedChecks--;await reject('undercounted executed gate/'+key,()=>finishArrowAdmission(e,under));
  }
  let productionReads=0;const differentProduction=async file=>{if(path.relative(root,file).split(path.sep).join('/').startsWith('src/Lokad.TikZ/')){productionReads++;return Buffer.from('different production');}return readFile(file);};
  await verifyArrowGuards(e,differentProduction);assert.equal(productionReads,0);pass('historical policy guards exclude current production');
  for(const file of ['tools/TikzArrowComparison/NativeArrowComparison.cs','tests/Reference/Arrows/meta-defaults/source.tikz','tools/TikzVisual/compare-arrow-conformance.mjs'])
    await reject('changed current guarded input/'+file,()=>verifyArrowGuards(e,current=>path.relative(root,current).split(path.sep).join('/')===file?Promise.resolve(Buffer.from('changed guarded input')):readFile(current)));
  for(const[key,value]of Object.entries({completed:false,converterInvoked:false,approvedImagePolicy:true,imageConformanceClaim:true,imageAdmission:'passed'})){
    const c=structuredClone(e.reports.reader);c[key]=value;await reject('raw qualification role/'+key,()=>validateArrowCheckedTrial(e,e.model,c,file=>e.get('proofs/reader/'+file),arrowCurrentImageProofs.producer.sha256,'historical-qualification'));
  }
  if(args.length){
    phase='saved-proof';const b=await loadArrowAdmissionReport(args[1],e);pass('complete saved current proof, numeric sources, viewer and inspection links');
    const encode=value=>Buffer.from(JSON.stringify(value)+'\n'),validate=(report,assets=b.assets)=>validateArrowAdmissionBundle(encode(report),assets,e);
    for(const[key,value]of Object.entries({completed:false,passed:false,converterInvoked:false,nativeToolInvoked:true,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',profileSha256:'0'.repeat(64)})){
      const r=structuredClone(b.report);r[key]=value;await reject('saved role/'+key,()=>validate(r));
    }
    for(const file of ['profile.json','acceptance-pin.mjs','qualification/current-combined.bin.gz','trial/report.json','checker/report.json','trial/agent-inspection.json','agent-inspection.json','index.html']){
      const assets=new Map(b.assets);assets.delete(file);await reject('missing saved proof/'+file,()=>validate(b.report,assets));
    }
    const forge=async(name,file,bytes)=>{
      const assets=new Map(b.assets),r=structuredClone(b.report);assets.set(file,bytes);r.artifacts[file]=sha256(bytes);
      await reject(name,()=>validate(r,assets));
    };
    const agent=JSON.parse(b.read('agent-inspection.json'));agent.focus.pop();await forge('fully rehashed lost focused inspection','agent-inspection.json',encode(agent));
    await forge('fully rehashed viewer link substitution','index.html',Buffer.from(b.read('index.html').toString().replace('trial/pdf/index.html','missing.html')));
    for(const gate of e.profile.requiredGates){const r=structuredClone(b.report);r.combined.gates[gate].executedChecks--;await reject('saved undercounted gate/'+gate,()=>validate(r));}
    for(const field of ['baseline','primary','pdf','controls','numericBuildIdentity']){
      const c=structuredClone(b.checker);if(field==='controls')c.controls.pop();else if(field==='numericBuildIdentity')c.numericBuildIdentity.identicalAssemblyBytes=!c.numericBuildIdentity.identicalAssemblyBytes;
      else if(field==='baseline')c.baseline.momentRegions--;else if(field==='primary')c.primary.images--;else c.pdf.focusPanels--;
      const bytes=encode(c),assets=new Map(b.assets),r=structuredClone(b.report);assets.set('checker/report.json',bytes);r.artifacts['checker/report.json']=sha256(bytes);r.inputs.checker.sha256=sha256(bytes);
      await reject('fully rehashed independent proof/'+field,()=>validate(r,assets));
    }
  }
  await verifyArrowGuards(e);phase='complete';await publish(true,{profileSha256:e.profileSha256,sourceGuards:Object.keys(e.profile.guardToolHashes).length,inputGuards:Object.keys(e.profile.inputHashes).length,
    requiredGates:16,historicalProductionReads:productionReads,...(args.length?{inputReport:args[1]}:{})});
}catch(error){process.exitCode=2;await publish(false,{error:error.message.slice(0,1000).replaceAll(root,'<repo>')});console.error(error.stack);}
