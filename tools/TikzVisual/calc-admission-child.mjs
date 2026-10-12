import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {calcHash,loadCalcSavedReport} from './calc-saved-images.mjs';
import {calcTrialCachePath} from './calc-trial-cache-codec.mjs';
export async function runCalcChild(root,executable,args,name,save,timeout=900000,includeReport=false){
  let r;try{r=await promisify(execFile)(executable,args,{cwd:root,windowsHide:true,timeout,maxBuffer:2000000});}
  catch(error){await save(name+'-command.log',Buffer.from((error.stdout??'')+(error.stderr??'')));
    const stdout=error.stdout??'',at=stdout.lastIndexOf('{"completed":');
    if(at>=0){try{const h=JSON.parse(stdout.slice(at).trim());assert.match(h.report,/^artifacts\/[a-z-]+\/run-[a-f0-9-]+\/report\.json$/);
      const bytes=await readFile(path.join(root,h.report));assert.equal(calcHash(bytes),h.sha256);await save('failed/'+name+'/report.json',bytes);
      const report=JSON.parse(bytes);let size=0;for(const[f,digest]of Object.entries(report.artifacts??{})){calcTrialCachePath(f);const b=await readFile(path.join(root,path.posix.dirname(h.report),f));
        size+=b.length;assert.ok(b.length<=100000000&&size<=1000000000);assert.equal(calcHash(b),digest);await save('failed/'+name+'/'+f,b);}
    }catch(retentionError){await save(name+'-retention-error.log',Buffer.from(retentionError.message.slice(0,2000)));}}
    throw error;}
  await save(name+'-command.log',Buffer.from(r.stdout+r.stderr));let handle;
  try{handle=JSON.parse(r.stdout.trim());}catch{const at=r.stdout.lastIndexOf('{"completed":');assert.ok(at>=0,'Missing calc child receipt');handle=JSON.parse(r.stdout.slice(at).trim());}
  assert.equal(handle.completed,true);assert.match(handle.report,/^artifacts\/[a-z-]+\/run-[a-f0-9-]+\/report\.json$/);
  const bytes=await readFile(path.join(root,handle.report));assert.equal(calcHash(bytes),handle.sha256);
  return includeReport?{handle,bytes,report:JSON.parse(bytes)}:handle;
}
export async function ownCalcBundle(bundle,prefix,save){
  await save(prefix+'/report.json',bundle.bytes);for(const[f,h]of Object.entries(bundle.report.artifacts)){const b=bundle.files.get(f);assert.equal(calcHash(b),h);await save(prefix+'/'+f,b);}
}
export async function readCalcChild(root,handle,role){const b=await loadCalcSavedReport(path.join(root,handle.report),role);assert.equal(b.sha256,handle.sha256);return b;}
