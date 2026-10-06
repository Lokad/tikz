// A post-experiment diagnosis, explicitly consuming public candidate evidence.
// It proves correspondence; it grants no policy, allowance or admission.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
const experimentFile='artifacts/curved-node-path-units/run-f90c193b-95c5-48e6-b082-9d406f5584c1/report.json',experimentSha256='86f9b0c4bdc62fb0b4fd0843627f5c02f1e48c7a9d7f25b428aea2ed4e021f5f';
const publicFile='artifacts/curved-node-conformance-trial/run-438483af-1742-4a1a-9e3a-d68bfcb6a8bc/report.json',publicSha256='8b737465396aa11dc7641373d404ca3f8f100893745d31b25d9393a61a8c4afa';
const base=path.join(root,'artifacts/curved-node-path-unit-diagnosis'),output=path.join(base,'run-'+randomUUID()),artifacts={},comparisons=[];
const save=(p,b)=>writeArtifact(output,p,b,artifacts),canonical=b=>Buffer.from(b.toString('utf8').replaceAll('\r\n','\n')),key=v=>v.frame+'-'+v.scale+'x-'+v.background;
async function load(file,digest){const b=await readFile(path.join(root,file));assert.equal(sha256(b),digest);const r=JSON.parse(b);assert.equal(r.completed,true);assert.equal(r.approvedImagePolicy,false);assert.equal(r.imageConformanceClaim,false);
  const folder=path.dirname(path.join(root,file));for(const[p,h]of Object.entries(r.artifacts))assert.equal(sha256(await readFile(await outputPath(folder,p))),h);
  for(const[p,h]of Object.entries(r.toolHashes)){const original=await readFile(await outputPath(folder,'tool-sources/'+p));assert.equal(sha256(original),h);assert.equal(sha256(canonical(await readFile(path.join(root,p)))),sha256(canonical(original)));}return{r,b};}
const local=r=>r.regions.map(({crops,...q})=>q);
async function main(){
  assert.equal(process.argv.length,2);const e=await load(experimentFile,experimentSha256),p=await load(publicFile,publicSha256);assert.equal(e.r.converterInvoked,false);assert.equal(p.r.passed,false);
  assert.equal(e.r.results.length,8);const selected=e.r.results.find(r=>r.variant.name==='pt-short');assert.ok(selected);assert.equal(selected.serializationChecks.length,812);assert.ok(selected.serializationChecks.every(c=>c.passed));
  assert.equal(p.r.candidateProvenance.converterAssemblySha256,sha256(await readFile(path.join(root,'src/Lokad.TikZ/bin/Release/net10.0/Lokad.TikZ.dll'))));
  for(const[route,native,candidate,image]of[['primary',selected.primaryComparisons,p.r.primaryComparisons,'actual'],['PDF',selected.pdfComparisons,p.r.pdfComparisons.filter(r=>r.mode==='candidate'),'svg-page']]){
    assert.equal(native.length,route==='primary'?12:4);assert.equal(candidate.length,native.length);assert.equal(new Set(candidate.map(key)).size,native.length);
    for(const n of native){const c=candidate.find(c=>key(c)===key(n));assert.ok(c);assert.deepEqual(local(n),local(c));assert.deepEqual(n.evaluation,c.evaluation);
      if(route==='primary'){assert.deepEqual(n.metrics,c.metrics);assert.deepEqual(n.naturalFrames.actual,c.naturalFrames.actual);}else{assert.deepEqual(n.whole,c.whole);assert.deepEqual(n.pageSize,c.pageSize);}
      const independentImageSha256=e.r.artifacts[n.artifacts[image]],publicImageSha256=p.r.artifacts[c.artifacts[image]];assert.equal(independentImageSha256,publicImageSha256,'Different native/public pixels.');
      comparisons.push({route,view:key(n),regions:98,metricsExactlyEqual:true,oldPolicyOutcomesExactlyEqual:true,identicalPngSha256:independentImageSha256,independentImage:n.artifacts[image],publicImage:c.artifacts[image]});
    }
  }
  await save('independent-experiment.json',e.b);await save('public-trial.json',p.b);
  const own='tools/TikzVisual/diagnose-curved-node-path-units.mjs',raw=await readFile(path.join(root,own)),tool=canonical(raw);await save('tool-sources/'+own,tool);
  const report={schemaVersion:1,comparisonKind:'post-experiment-public-curved-node-path-unit-diagnosis',completed:true,correspondencePassed:true,converterInvoked:false,candidateEvidenceConsumed:true,approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',
    independentExperiment:{file:experimentFile,sha256:experimentSha256},publicTrial:{file:publicFile,sha256:publicSha256},selectedIndependentRepresentation:'pt-short',selectionPurpose:'Explain the pre-existing writer path-unit contract using independently completed measurements; not derive or change an allowance.',comparisons,
    conclusion:'Every primary and candidate-PDF PNG, local/whole metric and old-policy outcome is identical to the independent short-native-unit representation. The old CSS-representation policy mismatch is reproduced without the converter; independent native-unit calibration and full sensitivity/admission remain required.',
    toolHashes:{[own]:sha256(tool)},sourceByteContract:'UTF-8 source text with CRLF normalized to LF; historical bytes unchanged.',artifacts};
  const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',bytes);await writeArtifact(base,'latest.json',JSON.stringify({completed:true,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)},null,2)+'\n');
  console.log('Public/native correspondence: all 16 views have identical PNGs and metrics. Admission remains pending. '+path.relative(root,output));
}
await main().catch(async error=>{process.exitCode=2;console.error(error.stack?.slice(0,4000)??error.message);await writeArtifact(output,'report.json',JSON.stringify({completed:false,converterInvoked:false,candidateEvidenceConsumed:true,approvedImagePolicy:false,imageConformanceClaim:false,error:error.message.slice(0,4000),comparisons,artifacts},null,2)+'\n');});
