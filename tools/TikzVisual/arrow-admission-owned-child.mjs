// Own fresh child commands and bind their terminal marker to saved report bytes.
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {captureProcess} from './qualification-process.mjs';
import path from 'node:path';
import {root,sha256,outputPath} from './shape-oracle-bundle.mjs';
import {arrowCachePath} from './arrow-image-cache-codec.mjs';

export async function readArrowChild(reportPath,expectedSha256,kind){
  assert.ok(['trial','checker'].includes(kind));assert.match(reportPath,new RegExp('^artifacts/arrow-current-'+(kind==='trial'?'trials':'checks')+'/run-[a-f0-9-]+/report\\.json$'));
  assert.match(expectedSha256,/^[a-f0-9]{64}$/);const folder=path.dirname(path.join(root,reportPath)),file=await outputPath(folder,'report.json');
  assert.ok((await stat(file)).size<=200000);const bytes=await readFile(file);assert.equal(sha256(bytes),expectedSha256);
  return{reportPath,sha256:expectedSha256,folder,bytes,report:JSON.parse(bytes)};
}
export async function runArrowChild(kind,input,save){
  assert.ok(['trial','checker'].includes(kind));
  if(kind==='trial')assert.equal(input,undefined);else assert.match(input,/^artifacts\/arrow-current-trials\/run-[a-f0-9-]+\/report\.json$/);
  const args=['--max-old-space-size=4096','tools/TikzVisual/'+(kind==='trial'?'trial-arrow-current.mjs':'check-arrow-current.mjs'),...(kind==='checker'?[input]:[])];
  const result=await captureProcess(process.execPath,args,{cwd:root,timeout:kind==='trial'?7200000:10800000,killTree:true});
  const status=result.exitCode;await save(kind+'-command.log',result.output.replaceAll(root,'<repo>'));
  if(result.failure!==null)throw Error('Owned arrow '+kind+' command failed: '+result.failure);
  const markers=result.stdout.split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));assert.equal(markers.length,1);
  const marker=markers[0],child=await readArrowChild(marker.report,marker.sha256,kind);
  assert.equal(marker.completed,child.report.completed);assert.equal(status===0,child.report.completed===true);assert.ok([0,1,2].includes(status));
  return{...child,status};
}
export async function copyArrowChild(child,prefix,save){
  assert.ok(['trial','checker'].includes(prefix));await save(prefix+'/report.json',child.bytes);let files=child.report.artifacts;
  if(prefix==='trial'){
    const bytes=await readFile(await outputPath(child.folder,'manifest.json'));assert.equal(sha256(bytes),child.report.manifest.sha256);
    await save(prefix+'/manifest.json',bytes);files=JSON.parse(bytes).artifacts;
  }
  assert.ok(files&&Object.keys(files).length<=20000);let total=0;
  for(const[file,hash]of Object.entries(files)){
    arrowCachePath(file);const input=await outputPath(child.folder,file);assert.ok((await stat(input)).size<=64000000);
    const bytes=await readFile(input);total+=bytes.length;assert.ok(total<=1100000000);assert.equal(sha256(bytes),hash);await save(prefix+'/'+file,bytes);
  }
}
