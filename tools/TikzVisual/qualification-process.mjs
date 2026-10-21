// Shared bounded execution; callers retain family-specific command/report policy.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

export async function captureProcess(executable,args,{cwd,timeout=60000,maxBytes=2000000}={}){
  assert.ok(typeof executable==='string'&&executable.length>0);
  assert.ok(Array.isArray(args)&&args.every(a=>typeof a==='string'));
  assert.ok(Number.isSafeInteger(timeout)&&timeout>0&&timeout<=1800000);
  assert.ok(Number.isSafeInteger(maxBytes)&&maxBytes>0&&maxBytes<=2000000);
  const chunks=[],stdout=[],stderr=[];let size=0,failure=null;
  const exitCode=await new Promise(resolve=>{
    const child=spawn(executable,args,{cwd,shell:false,windowsHide:true});
    const stop=message=>{failure??=message;child.kill();};
    const timer=setTimeout(()=>stop('timeout'),timeout);
    const capture=(bytes,stream)=>{size+=bytes.length;if(size>maxBytes)stop('output-bound');else{chunks.push(bytes);stream.push(bytes);}};
    child.stdout.on('data',bytes=>capture(bytes,stdout));child.stderr.on('data',bytes=>capture(bytes,stderr));
    child.on('error',error=>{failure??=error.code??error.message;});
    // Wait for close even after a failure; logs remain available to the owner.
    child.on('close',code=>{clearTimeout(timer);resolve(code);});
  });
  return{exitCode,failure,output:Buffer.concat(chunks).toString('utf8'),
    stdout:Buffer.concat(stdout).toString('utf8'),stderr:Buffer.concat(stderr).toString('utf8')};
}
