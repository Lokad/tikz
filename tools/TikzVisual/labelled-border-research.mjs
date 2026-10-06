import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {root,sha256} from './shape-oracle-bundle.mjs';
import {sanitizeLabelledBorderLog} from './labelled-border-log.mjs';

// Calls are explicit: oracle work selects only the framework-only reader.
export async function runLabelledResearchTool(output,project,folder,save,artifacts){
  assert.ok(['TikzLabelledBorderOracle','TikzLabelledBorderComparison'].includes(project));
  assert.ok(['oracle','candidate'].includes(folder));const buffers=[];let size=0;
  const status=await new Promise((resolve,reject)=>{
    const child=spawn('dotnet',['run','--project','tools/'+project,'-c','Release','--','--out',path.relative(root,path.join(output,folder))],{cwd:root,shell:false,windowsHide:true});let settled=false;
    const finish=(error,code)=>{if(settled)return;settled=true;clearTimeout(timer);if(error){child.kill();reject(error);}else resolve(code);};
    const timer=setTimeout(()=>finish(Error('Bounded labeled-border tool timed out.')),180000);
    const capture=b=>{size+=b.length;if(size>1000000)finish(Error('Labeled-border tool output bound.'));else buffers.push(b);};
    child.stdout.on('data',capture);child.stderr.on('data',capture);child.on('error',e=>finish(e));child.on('close',code=>finish(null,code));
  });
  await save(folder+'-command.log',sanitizeLabelledBorderLog(Buffer.concat(buffers).toString('utf8')));
  assert.ok(status===0||project==='TikzLabelledBorderComparison'&&status===1,'Labeled-border tool failed.');
  const bytes=await readFile(path.join(output,folder,'report.json')),report=JSON.parse(bytes);assert.equal(report.completed,true);
  if(project==='TikzLabelledBorderOracle'){assert.equal(report.converterInvoked,false);assert.equal(report.glyphs,40);assert.ok(report.oracleAssemblyReferences.every(n=>n==='System'||n.startsWith('System.')));}
  else{assert.equal(report.checks,1624);assert.deepEqual(report.cases.map(c=>c.checks),[512,578,534]);}
  for(const[p,h]of Object.entries(report.artifacts)){assert.ok(!path.isAbsolute(p)&&!p.includes('\\')&&!p.includes(':')&&!p.split('/').includes('..'));assert.equal(sha256(await readFile(path.join(output,folder,p))),h);artifacts[folder+'/'+p]=h;}
  artifacts[folder+'/report.json']=sha256(bytes);return report;
}

export async function saveLabelledImages(save,prefix,m){
  const images={},crops=new Map();for(const[k,png]of Object.entries(m.images)){images[k]=prefix+'-'+k+'.png';await save(images[k],Buffer.from(png,'base64'));}
  for(const crop of m.crops){const links={};for(const[k,png]of Object.entries({...crop.paired,sheet:crop.sheet})){links[k]=prefix+'-'+crop.id+'-'+k+'.png';await save(links[k],Buffer.from(png,'base64'));}crops.set(crop.id,{...links,presentation:crop.presentation});}
  return{images,regions:m.regions.map(r=>({...r,crops:crops.get(r.id)??null})),repeat:m.repeat,naturalFrames:m.naturalFrames,metrics:m.metrics};
}
