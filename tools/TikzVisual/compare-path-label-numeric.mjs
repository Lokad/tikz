// Iteration check: frozen independent native evidence versus fresh conversion.
// Reuse existing process receipts, artifact ownership and saved-report validation.
import assert from 'node:assert/strict';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root,writeArtifact,sha256} from './shape-oracle-bundle.mjs';
import {loadPathLabelEvidence} from './path-label-evidence.mjs';
import {runCalcChild,readCalcChild,ownCalcBundle} from './calc-admission-child.mjs';

assert.ok(process.argv.length===2||process.argv.length===3,'Usage: node tools/TikzVisual/compare-path-label-numeric.mjs [placement|interactions]');
const fixture=process.argv[2]??'placement';
const output=path.join(root,'artifacts/path-label-iteration/run-'+randomUUID()),artifacts={};
const save=(p,b)=>writeArtifact(output,p,b,artifacts);
let phase='native-input',converterInvoked=false;
async function publish(completed,result={}){
 const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'path-label-numeric-iteration',completed,
  phase:completed?'complete':phase,converterInvoked,nativeToolInvoked:false,approvedImagePolicy:false,
  imageConformanceClaim:false,imageAdmission:'pending',artifacts,result},null,2)+'\n');
 await writeArtifact(output,'report.json',bytes);
 console.log(JSON.stringify({completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));
}
await publish(false);
try{
 const native=await loadPathLabelEvidence(fixture);await ownCalcBundle(native,'native',save);
 phase='current-conversion';converterInvoked=true;
 const handle=await runCalcChild(root,'dotnet',['run','--project','tools/TikzPathLabelComparison','-c','Release','--',
  path.relative(root,path.join(output,'native/report.json'))],'numeric',save);
 const candidate=await readCalcChild(root,handle,'path-label-current-numeric');
 await ownCalcBundle(candidate,'current',save);
 const result=candidate.report.result;
 assert.equal(candidate.report.converterInvoked,true);assert.equal(candidate.report.nativeToolInvoked,false);
 assert.equal(result.nativeInputSha256,native.sha256);assert.equal(result.numericPassed,true);
 assert.equal(result.publicTraceParity,true);assert.equal(result.nodes,native.report.counts.nodes);
 const counts=fixture==='placement'?{glyphs:42,checks:1070}:{glyphs:25,checks:674};
 assert.equal(result.glyphs,counts.glyphs);assert.equal(result.checks,counts.checks);assert.deepEqual(result.failed,[]);
 await publish(true,{...result,nativeDriverChecks:native.metrics.driverState.checks,
  fixture,scope:'Fixed trusted fixture: text boxes, anchors, glyphs, effective paint, clips and physical order. Image and feature acceptance remain open.'});
}catch(error){await save('failure.log',String(error.stack??error).replaceAll(root,'<repo>'));await publish(false,{error:error.message});process.exitCode=1;}
