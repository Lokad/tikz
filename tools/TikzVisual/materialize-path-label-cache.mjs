// Fresh exports restore historical artifact paths losslessly; no native engine or converter.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root,writeArtifact,outputPath,sha256} from './shape-oracle-bundle.mjs';
import {loadPathLabelCache} from './path-label-cache.mjs';
import {loadCalcSavedReport} from './calc-saved-images.mjs';

assert.equal(process.argv.length,3,'Usage: node tools/TikzVisual/materialize-path-label-cache.mjs <placement|interactions>');
const fixture=process.argv[2],output=path.join(root,'artifacts/path-label-cache-materialization/run-'+randomUUID()),artifacts={},save=(p,b)=>writeArtifact(output,p,b,artifacts);let phase='archive';
async function publish(completed,extra={}){const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'path-label-portable-cache-materialization',completed,phase:completed?'complete':phase,
 converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',fixture,artifacts,...extra},null,2)+'\n');
 await writeArtifact(output,'report.json',bytes);console.log(JSON.stringify({completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));}
await publish(false);
try{
 const {cache,manifest}=await loadPathLabelCache(root,fixture);phase='materialization';let restored=0;
 for(const[file,bytes]of cache.files){
  const folder=path.join(root,path.posix.dirname(file)),name=path.posix.basename(file),target=await outputPath(folder,name);
  const existing=await readFile(target).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
  if(existing)assert.ok(existing.equals(bytes),'Refusing to replace different existing evidence: '+file);else await writeArtifact(folder,name,bytes);
  restored++;if(restored%1000===0)console.log(JSON.stringify({phase,restored,total:cache.files.size}));
 }
 for(const descriptor of manifest.reports){const saved=await loadCalcSavedReport(path.join(root,descriptor.file),descriptor.role);assert.equal(saved.sha256,descriptor.sha256);}
 await save('restored-assets.json',JSON.stringify(cache.header.assets,null,2)+'\n');
 await save('source-captures/tools/TikzVisual/materialize-path-label-cache.mjs',await readFile(path.join(root,'tools/TikzVisual/materialize-path-label-cache.mjs')));
 await publish(true,{restoredFiles:restored,manifest,scope:'Lossless frozen evidence restoration only; fresh conversion and feature acceptance remain separate.'});
}catch(error){await save('failure.log',String(error.stack??error).replaceAll(root,'<repo>'));await publish(false,{error:error.message});process.exitCode=1;}
