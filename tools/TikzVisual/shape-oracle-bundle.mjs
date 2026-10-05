import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir,lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function outputPath(folder,file=''){
  const full=path.resolve(folder,file);
  assert.ok(path.resolve(folder).startsWith(path.join(root,'artifacts')+path.sep),'Output must be inside artifacts/.');
  assert.ok(full===path.resolve(folder)||full.startsWith(path.resolve(folder)+path.sep),'Invalid artifact path.');
  for(let current=full;current!==root;current=path.dirname(current)){
    const stat=await lstat(current).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
    assert.ok(!stat?.isSymbolicLink(),'Output must not cross a symlink or junction.');
  }
  return full;
}
export async function writeArtifact(folder,file,bytes,artifacts){
  const full=await outputPath(folder,file);await mkdir(path.dirname(full),{recursive:true});await writeFile(full,bytes);
  if(artifacts)artifacts[file]=sha256(bytes);
}
export async function readFreshOracle(folder){
  await outputPath(folder);await mkdir(folder,{recursive:true});
  await new Promise((resolve,reject)=>{
    const child=spawn('dotnet',['run','--project','tools/TikzShapeCalibration','-c','Release','--','derive-svg','--out',path.relative(root,folder)],{cwd:root,windowsHide:true,shell:false});
    let captured='',settled=false;
    const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);if(error){child.kill();reject(error);}else resolve();};
    const timer=setTimeout(()=>finish(new Error('Independent oracle reconstruction timed out.')),180000);
    const capture=bytes=>{captured+=bytes.toString();if(captured.length>1048576)finish(new Error('Oracle output limit exceeded.'));};
    child.stdout.on('data',capture);child.stderr.on('data',capture);child.on('error',finish);
    child.on('close',code=>{process.stdout.write(captured);finish(code===0?null:new Error('Independent oracle reconstruction failed: exit '+code));});
  });
  const bytes=await readFile(path.join(folder,'derivation.json')),derivation=JSON.parse(bytes);
  assert.equal(derivation.comparisonKind,'oracle-only-shape-reconstruction');assert.equal(derivation.completed,true);
  assert.equal(derivation.converterInvoked,false);assert.equal(derivation.conformanceClaim,false);assert.equal(derivation.approvedImagePolicy,false);
  assert.deepEqual(derivation.counts,{nodes:28,pathTokens:420,glyphs:70});
  assert.equal(derivation.outputDirectory,path.relative(root,folder).split(path.sep).join('/'));
  assert.deepEqual(derivation.variants.map(v=>v.mode),['driver-css','native-css-12','native-css-6','sp-plus','sp-minus']);
  assert.ok(derivation.variants.every(v=>v.serialization.passed&&v.serialization.checks.every(c=>c.passed)));
  assert.ok(derivation.evidence.frameworkReferences.every(n=>n==='System'||n.startsWith('System.')),'Unexpected oracle assembly dependency.');
  async function verify(){
    assert.equal(sha256(await readFile(path.join(folder,'derivation.json'))),sha256(bytes),'Oracle derivation changed.');
    for(const[file,hash]of Object.entries(derivation.evidence.artifacts)){
      assert.ok(!path.isAbsolute(file)&&!file.split(/[\\/]/).includes('..'),'Invalid oracle artifact path.');
      assert.equal(sha256(await readFile(path.join(folder,file))),hash,'Changed oracle artifact: '+file);
    }
    for(const[file,hash]of Object.entries(derivation.evidence.toolHashes))assert.equal(sha256(await readFile(path.join(root,file))),hash,'Changed oracle tool: '+file);
  }
  await verify();return{derivation,bytes,verify};
}
