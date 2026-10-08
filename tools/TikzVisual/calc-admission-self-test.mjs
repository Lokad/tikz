import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {calcHash} from './calc-saved-images.mjs';
import {loadCalcPolicy,validateCalcProfile,verifyCalcProfileGuards,decodeCalcProfile,finishCalcAdmission} from './calc-admission-policy.mjs';
import {loadCalcAdmissionReport,validateCalcAdmissionReport,verifyCalcAdmissionCurrentSources} from './calc-admission-reader.mjs';
const args=process.argv.slice(2);assert.ok(args.length===0||args.length===2&&args[0]==='--report');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.join(root,'artifacts/calc-admission-controls/run-'+randomUUID());await mkdir(output,{recursive:true});
const controls=[],artifacts={};let phase='profile';
const bytes=o=>Buffer.from(JSON.stringify(o,null,2)+'\n');
async function reject(name,action){let error;try{await action();}catch(e){error=e;}assert.ok(error,'Accepted calc admission corruption: '+name);controls.push({name,passed:true,rejection:error.message.slice(0,500)});}
async function save(file,b){await mkdir(path.dirname(path.join(output,file)),{recursive:true});await writeFile(path.join(output,file),b);artifacts[file]=calcHash(b);}
async function publish(completed,details={}){const b=bytes({schemaVersion:1,role:'calc-admission-controls',completed,phase,converterInvoked:false,nativeToolInvoked:false,browserInvoked:false,
  approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',controls,artifacts,...details});await writeFile(path.join(output,'report.json'),b);
  console.log(JSON.stringify({completed,phase,controls:controls.length,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:calcHash(b)}));}
await publish(false);
try{
  const e=await loadCalcPolicy(root);controls.push({name:'fixed-native-public-profile-and-current-tool-guards',passed:true});
  const mutations=[['false-approval',p=>p.approvedImagePolicy=false],['broadened-scope',p=>p.scope='all TikZ'],['wrong-renderer',p=>p.renderer.browser='other'],
    ['weakened-native-policy',p=>p.nativeBindings.primaryPolicySha256='0'.repeat(64)],['changed-pdf-camera',p=>p.nativeBindings.pdfRegistrationSha256='0'.repeat(64)],
    ['missing-qualification',p=>delete p.qualification.native],['lost-gate',p=>p.requiredGates.pop()],['lost-primary-view',p=>p.views.primary.pop()],
    ['lost-pdf-view',p=>p.views.pdf.pop()],['lost-native-control',p=>p.controls.native.pdf.pop()],['lost-public-control',p=>p.controls.public.pop()],
    ['false-hosted-claim',p=>p.claims.hostedExecution='verified'],['changed-tool-guard',p=>p.guardToolHashes[Object.keys(p.guardToolHashes)[0]]='0'.repeat(64)]];
  for(const[name,change]of mutations){const p=structuredClone(e.profile);change(p);await reject(name,()=>validateCalcProfile(p,e,root));await save('mutations/'+name+'.json',bytes(p));}
  const changed=structuredClone(e.profile);changed.scope+=' changed';await reject('fully-rehashed-unreviewed-profile',()=>decodeCalcProfile(bytes(changed)));
  const combined={passed:true,gates:Object.fromEntries(Object.entries(e.profile.gateCounts).map(([k,v])=>[k,{state:'passed',...v}]))};assert.equal(finishCalcAdmission(e.profile,combined).passed,true);
  controls.push({name:'complete-required-gate-matrix',passed:true});
  for(const name of e.profile.requiredGates){
    const failed=structuredClone(combined);failed.gates[name].state='failed';failed.passed=false;const result=finishCalcAdmission(e.profile,failed);
    assert.equal(result.passed,false);assert.equal(result.imageConformanceClaim,false);assert.equal(result.firstFailedGate,name);controls.push({name:'failed-gate/'+name,passed:true});
    failed.passed=true;await reject('false-aggregate/'+name,()=>finishCalcAdmission(e.profile,failed));
    const missing=structuredClone(combined);delete missing.gates[name];await reject('missing-gate/'+name,()=>finishCalcAdmission(e.profile,missing));
    const under=structuredClone(combined),field=Object.keys(e.profile.gateCounts[name])[0];under.gates[name][field]--;await reject('undercounted-gate/'+name,()=>finishCalcAdmission(e.profile,under));
  }
  let productionReads=0;await verifyCalcProfileGuards(e.profile,root,async f=>{if(f.includes('/src/')||f.includes('\\src\\'))productionReads++;return readFile(f);});assert.equal(productionReads,0);
  controls.push({name:'frozen-profile-does-not-freeze-current-production',passed:true});
  await reject('changed-current-profile-tool',()=>verifyCalcProfileGuards(e.profile,root,async f=>f.endsWith('calc-admission-policy.mjs')?Buffer.from('changed'):readFile(f)));
  if(args.length){
    phase='saved-conformance';const saved=await loadCalcAdmissionReport(path.resolve(root,args[1]),e);controls.push({name:'complete-owned-admitted-result-and-agent-links',passed:true});
    const sourceGuards=await verifyCalcAdmissionCurrentSources(saved,root);assert.ok(sourceGuards.production>0,'Missing current production source guards');controls.push({name:'current-public-production-and-tool-source-guards',passed:true});
    const production=Object.keys(saved.report.sourceHashes).find(f=>f.startsWith('src/Lokad.TikZ/'));
    await reject('stale-current-production',()=>verifyCalcAdmissionCurrentSources(saved,root,async f=>f.endsWith(production.replaceAll('/',path.sep))?Buffer.from('changed current compiler'):readFile(f)));
    for(const[key,value]of Object.entries({completed:false,passed:false,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,profileSha256:'0'.repeat(64)})){
      const r=structuredClone(saved.report);r[key]=value;await reject('saved-role/'+key,()=>validateCalcAdmissionReport(bytes(r),saved.files,e));}
    for(const file of ['profile.json','qualification/native-calibration.bin.gz','qualification/public-trial.bin.gz','trial/report.json','checker/report.json','recaptured/report.json','agent-inspection.json']){
      const files=new Map(saved.files);files.delete(file);await reject('missing-owned-proof/'+file,()=>validateCalcAdmissionReport(saved.bytes,files,e));}
    const r=structuredClone(saved.report),files=new Map(saved.files),agent=JSON.parse(files.get('agent-inspection.json'));agent.selected[0].candidate=agent.selected[0].reference;
    const b=bytes(agent);files.set('agent-inspection.json',b);r.artifacts['agent-inspection.json']=calcHash(b);
    await reject('fully-rehashed-agent-image-substitution',()=>validateCalcAdmissionReport(bytes(r),files,e));
  }
  for(const[f,h]of Object.entries(artifacts))assert.equal(calcHash(await readFile(path.join(output,f))),h);phase='complete';await publish(true,{profileSha256:e.profileSha256,savedReport:args[1]??null});
}catch(error){process.exitCode=1;await publish(false,{error:error.message.replaceAll(root,'<repo>').slice(0,2000)});console.error(error.stack);}
