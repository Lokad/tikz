// Explicit immutable input handles. No latest pointers, converter or reference engine.
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {root,sha256,outputPath} from './shape-oracle-bundle.mjs';
import {arrowCanonical} from './arrow-native-contract.mjs';
import {loadArrowEvidence} from './arrow-evidence.mjs';
import {buildArrowNativeFrame} from './arrow-native-frame.mjs';
import {arrowPdfRegions} from './arrow-native-contract.mjs';
import {validateArrowPrimaryReport} from './arrow-primary-contract.mjs';
import {validateArrowPaperReport} from './arrow-pdf-contract.mjs';
export const arrowAgentInputNames=['primary','primary-check','pdf','pdf-check','prototype'];
const prefixes=['arrow-primary-calibration','arrow-primary-checks','arrow-pdf-calibration','arrow-pdf-checks','arrow-public-inspection'];
export function arrowAgentPath(file){assert.equal(typeof file,'string');assert.match(file,/^[A-Za-z0-9_./-]+$/);assert.ok(!file.startsWith('/')&&!file.split('/').some(p=>['','.','..'].includes(p)));return file;}
export function arrowAgentInputPath(file,i){arrowAgentPath(file);assert.match(file,new RegExp('^artifacts/'+prefixes[i]+'/run-[a-f0-9-]+/report\\.json$'));return file;}
export async function arrowAgentSourceClosure(){
 const queue=['arrow-agent-evidence.mjs','arrow-agent-model.mjs','arrow-agent-viewer.mjs','arrow-agent-self-test.mjs','inspect-arrow-agent.mjs','check-arrow-agent.mjs'].map(f=>'tools/TikzVisual/'+f),sources=new Map();
 for(let i=0;i<queue.length;i++){const f=queue[i];if(sources.has(f))continue;assert.match(f,/^tools\/TikzVisual\/[a-z0-9.-]+\.mjs$/);const bytes=arrowCanonical(await readFile(path.join(root,f)));sources.set(f,{bytes,sha256:sha256(bytes)});
  for(const m of bytes.toString().matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g))queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(f),m[1])));}
 return new Map([...sources].sort(([a],[b])=>a.localeCompare(b)));
}
export async function loadArrowAgentInputs(handles){
 assert.deepEqual(handles.map(h=>h.kind),arrowAgentInputNames);const evidence=await loadArrowEvidence(),loaded=[];
 for(const [i,h]of handles.entries()){
  arrowAgentInputPath(h.origin,i);const bytes=await h.read('report.json');assert.ok(bytes.length<=35000000);const r=JSON.parse(bytes);assert.equal(r.completed,true);assert.equal(r.snapshotSha256,evidence.snapshotSha256);
  assert.equal(r.approvedImagePolicy,false);assert.equal(r.imageConformanceClaim,false);const files=new Map([['report.json',bytes]]);
  for(const[f,hash]of Object.entries(r.artifacts??{})){arrowAgentPath(f);const b=await h.read(f);assert.equal(sha256(b),hash,'Changed input artifact: '+h.kind+'/'+f);files.set(f,b);}
  for(const[f,hash]of Object.entries(r.sourceHashes)){arrowAgentPath(f);const current=arrowCanonical(await readFile(path.join(root,f)));
   if(r.artifacts){const captured=files.get('source-captures/'+f);assert.equal(sha256(captured),hash);assert.equal(sha256(current),sha256(arrowCanonical(captured)),'Stale input source: '+f);}
   else assert.equal(sha256(current),hash,'Stale checker source: '+f);}
  loaded.push({...h,bytes,sha256:sha256(bytes),report:r,files});
 }
 const [primary,primaryCheck,pdf,pdfCheck,prototype]=loaded;
 const frames=evidence.cases.map(c=>buildArrowNativeFrame(c.id,evidence.artifacts.get(c.id+'/plain-reference.svg').toString(),c.metrics));
 assert.deepEqual(validateArrowPrimaryReport(primary.report,evidence,frames),primary.report.coverage);
 assert.deepEqual(validateArrowPaperReport(pdf.report,evidence,frames.map((f,i)=>({...f,paper:arrowPdfRegions(evidence.cases[i].metrics,f)}))),pdf.report.coverage);
 for(const [producer,checker,kind]of [[primary,primaryCheck,'independent-native-arrow-primary-check'],[pdf,pdfCheck,'independent-native-arrow-PDF-check']]){
  assert.equal(checker.report.comparisonKind,kind);assert.equal(checker.report.inputReport,producer.origin);assert.equal(checker.report.inputReportSha256,producer.sha256);
  assert.deepEqual(checker.report.sourceHashes,producer.report.sourceHashes);assert.deepEqual(checker.report.coverage,producer.report.coverage);assert.deepEqual(checker.report.sensitivity,producer.report.sensitivity);
  assert.deepEqual(checker.report.renderer,producer.report.renderer);
  assert.ok(checker.report.controls.length>0&&checker.report.controls.every(c=>c.passed===true));assert.ok(checker.report.measurements>0&&checker.report.panels>0);
 }
 assert.deepEqual(primary.report.renderer,pdf.report.renderer);assert.deepEqual(primary.report.renderer,prototype.report.renderer);
 const p=prototype.report;assert.equal(p.comparisonKind,'public-arrow-inspection');assert.equal(p.imageAdmission,'pending');assert.equal(p.numericReport,'numeric/report.json');
 const numeric=JSON.parse(prototype.files.get(p.numericReport));assert.deepEqual([numeric.completed,numeric.passed,numeric.approvedImagePolicy,numeric.imageConformanceClaim],[true,true,false,false]);
 assert.equal(numeric.snapshotSha256,evidence.snapshotSha256);assert.equal(numeric.checks,p.numericChecks);assert.equal(numeric.checks,12062);
 assert.deepEqual(numeric.cases.map(c=>c.id),evidence.cases.map(c=>c.id));assert.ok(numeric.cases.every(c=>c.passed&&c.publicTraceParity&&c.failed===0));
 for(const[f,hash]of Object.entries(numeric.sources)){arrowAgentPath(f);assert.equal(sha256(arrowCanonical(await readFile(path.join(root,f)))),hash,'Stale prototype source: '+f);assert.equal(sha256(prototype.files.get('numeric/source-captures/'+f)),hash);}
 for(const[f,hash]of Object.entries(numeric.inputs)){assert.equal(sha256(prototype.files.get('numeric/input-captures/'+f)),hash);}
 assert.equal(p.observations.length,72);assert.equal(p.agent.rankedRegions.length,118);
 for(const c of evidence.cases){const rows=p.observations.filter(o=>o.caseId===c.id);assert.equal(rows.length,12);assert.equal(new Set(rows.map(o=>o.id)).size,12);
  const frame=JSON.parse(prototype.files.get(c.id+'/frame-regions.json')),scene=JSON.parse(prototype.files.get('numeric/'+c.id+'/scene.json'));
  assert.equal(scene.paths.length,c.metrics.driverState.paints.length);assert.equal(frame.regions.length,c.metrics.placements.length+1);
  const expectedViews=['natural','expanded'].flatMap(f=>[1,4].flatMap(s=>['transparent','white','black'].map(b=>[f,s,b].join('/'))));
  assert.deepEqual(rows.map(o=>[o.frame,o.scale,o.background].join('/')).sort(),expectedViews.sort());
  for(const o of rows){assert.equal(o.id,[c.id,o.frame,o.scale+'x-'+o.background].join('/'));assert.equal(o.repeat.rawChangedPixels,0);assert.equal(o.actualRepeat.rawChangedPixels,0);assert.deepEqual(o.regions.map(({id,rectangle})=>({id,rectangle})),frame.regions.map(({id,rectangle})=>({id,rectangle})));
   assert.ok(['natural','expanded'].includes(o.frame)&&[1,4].includes(o.scale)&&['transparent','white','black'].includes(o.background));}}
 return{evidence,loaded,frames};
}
export async function arrowAgentLiveHandles(args){
 assert.equal(args.length,5);return Promise.all(args.map(async(origin,i)=>{arrowAgentInputPath(origin,i);const folder=path.dirname(path.join(root,origin));await outputPath(folder);
  assert.ok((await stat(path.join(folder,'report.json'))).size<=35000000);return{kind:arrowAgentInputNames[i],origin,read:async f=>readFile(await outputPath(folder,arrowAgentPath(f)))};}));
}
export async function loadArrowAgentOwned(file){
 arrowAgentPath(file);assert.match(file,/^artifacts\/arrow-agent-inspection\/run-[a-f0-9-]+\/report\.json$/);
 const folder=path.dirname(path.join(root,file));await outputPath(folder);
 const read=async f=>{const full=await outputPath(folder,arrowAgentPath(f));assert.ok((await stat(full)).size<=35000000);return readFile(full);};
 const bytes=await read('report.json'),report=JSON.parse(bytes);assert.equal(report.completed,true);
 assert.deepEqual([report.converterInvoked,report.approvedImagePolicy,report.imageConformanceClaim],[false,false,false]);assert.equal(report.imageAdmission,'pending');
 assert.equal(report.manifest.file,'manifest.json');const manifestBytes=await read('manifest.json');assert.equal(sha256(manifestBytes),report.manifest.sha256);
 const manifest=JSON.parse(manifestBytes);assert.equal(manifest.schemaVersion,1);assert.equal(Object.keys(manifest.artifacts).length,report.manifest.files);
 const files=new Map();for(const [f,hash]of Object.entries(manifest.artifacts)){arrowAgentPath(f);assert.match(hash,/^[a-f0-9]{64}$/);const b=await read(f);assert.equal(sha256(b),hash,'Changed agent artifact: '+f);files.set(f,b);}
 const sources=await arrowAgentSourceClosure();assert.deepEqual(report.sourceHashes,Object.fromEntries([...sources].map(([f,s])=>[f,s.sha256])));
 for(const [f,s]of sources)assert.equal(sha256(files.get('source-captures/'+f)),s.sha256,'Changed agent source: '+f);
 return{folder,bytes,report,sha256:sha256(bytes),manifest,manifestBytes,files,sources};
}
export function arrowAgentReplayHandles(owned){
 assert.deepEqual(owned.report.inputs.map(i=>i.kind),arrowAgentInputNames);
 return owned.report.inputs.map((i,n)=>{arrowAgentInputPath(i.origin,n);assert.equal(i.report,'inputs/'+i.kind+'/report.json');assert.equal(sha256(owned.files.get(i.report)),i.sha256);
  return{kind:i.kind,origin:i.origin,read:async f=>{const b=owned.files.get('inputs/'+i.kind+'/'+arrowAgentPath(f));assert.ok(b,'Missing replay input: '+f);return b;}};});
}
