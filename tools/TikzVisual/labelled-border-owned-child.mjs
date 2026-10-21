// Bounded owned commands. Completion records identify the exact child bundle.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {captureProcess} from './qualification-process.mjs';
import path from 'node:path';
import {root,sha256,outputPath} from './shape-oracle-bundle.mjs';
import {verifyLabelledSourceHashes} from './labelled-border-combined-common.mjs';

export async function runOwnedLabelledChild(script,args,save,log){
  assert.ok(['trial-labelled-border-cached.mjs','labelled-border-cached-self-test.mjs'].includes(script));
  assert.ok(script==='trial-labelled-border-cached.mjs'?args.length===0:args.length===2&&args[0]==='--report');
  const result=await captureProcess(process.execPath,['tools/TikzVisual/'+script,...args],{cwd:root,timeout:1800000});
  const status=result.exitCode;await save(log,result.output.replaceAll(root,'<repo>'));
  if(result.failure!==null)throw Error('Owned labeled-border command failed: '+result.failure);
  const kind=script==='trial-labelled-border-cached.mjs'?'labelled-border-cached-trial-output':'labelled-border-cached-check-output';
  const records=result.stdout.split(/\r?\n/).filter(s=>s.startsWith('{')).map(s=>JSON.parse(s)).filter(q=>q.kind===kind&&q.final===true);
  assert.equal(records.length,1,'Owned command did not identify exactly one final report.');const marker=records[0];
  const family=script==='trial-labelled-border-cached.mjs'?'trial':'controls';
  assert.match(marker.report,new RegExp('^artifacts/labelled-border-cached-'+family+'/run-[a-f0-9-]+/report\\.json$'));
  assert.match(marker.sha256,/^[a-f0-9]{64}$/);
  const bytes=await readFile(path.join(root,marker.report));assert.equal(sha256(bytes),marker.sha256);
  const report=JSON.parse(bytes);assert.equal(marker.completed,report.completed);
  assert.equal(marker.passed,report.completed&&(family==='trial'?report.combined.passed:report.passed));
  assert.ok([0,1,2].includes(status));assert.equal(status===0,marker.completed&&marker.passed);
  return {marker,report,bytes,folder:path.dirname(path.join(root,marker.report)),status};
}
export async function copyOwnedLabelledChild(child,prefix,save){
  await save(prefix+'/report.json',child.bytes);
  for(const[p,h]of Object.entries(child.report.artifacts)){
    const b=await readFile(await outputPath(child.folder,p));assert.equal(sha256(b),h,p);await save(prefix+'/'+p,b);
  }
  await verifyLabelledSourceHashes(child.report.toolHashes);
}
