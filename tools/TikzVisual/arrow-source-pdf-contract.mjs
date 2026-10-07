import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {root,sha256,outputPath} from './shape-oracle-bundle.mjs';
import {arrowAgentPath} from './arrow-agent-evidence.mjs';
import {arrowCanonical,arrowPdfRegions} from './arrow-native-contract.mjs';
import {arrowSourcePrimarySources,loadArrowSourcePrimaryInput} from './arrow-source-primary-contract.mjs';
import {arrowSourcePrimaryContract} from './arrow-source-primary-reference.mjs';
import {arrowSourcePdfContract} from './arrow-source-pdf-model.mjs';

export async function arrowSourcePdfSources(){
 const sources=await arrowSourcePrimarySources();
 const queue=['arrow-source-pdf-model.mjs','arrow-source-pdf-contract.mjs','arrow-source-pdf-panels.mjs','arrow-source-pdf-self-test.mjs','calibrate-arrow-source-pdf.mjs','check-arrow-source-pdf.mjs'].map(f=>'tools/TikzVisual/'+f);
 for(let i=0;i<queue.length;i++){
  const f=queue[i];if(sources.has(f))continue;assert.match(f,/^tools\/TikzVisual\/[a-z0-9.-]+\.mjs$/);
  const bytes=arrowCanonical(await readFile(path.join(root,f)));sources.set(f,{bytes,sha256:sha256(bytes)});
  for(const m of bytes.toString().matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g))queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(f),m[1])));
 }
 return new Map([...sources].sort(([a],[b])=>a.localeCompare(b)));
}

export async function loadArrowSourcePdfInput(producer,checker,read){
 assert.match(producer,/^artifacts\/arrow-source-primary-calibration\/run-[a-f0-9-]+\/report.json$/);
 assert.match(checker,/^artifacts\/arrow-source-primary-checks\/run-[a-f0-9-]+\/report.json$/);
 const bytes=await read('primary','report.json'),checkBytes=await read('primary-check','report.json');
 assert.ok(bytes.length<32000&&checkBytes.length<100000);const report=JSON.parse(bytes),check=JSON.parse(checkBytes);
 assert.deepEqual([report.completed,report.converterInvoked,report.approvedImagePolicy,report.imageConformanceClaim],[true,false,false,false]);
 assert.equal(report.comparisonKind,'native-arrow-standalone-source-primary-observations');assert.deepEqual(report.contract,arrowSourcePrimaryContract);
 assert.equal(report.manifest.file,'manifest.json');const mb=await read('primary','manifest.json');assert.equal(sha256(mb),report.manifest.sha256);
 const manifest=JSON.parse(mb);assert.equal(Object.keys(manifest.artifacts).length,report.manifest.files);
 const files=new Map([['primary/report.json',bytes],['primary/manifest.json',mb],['primary-check/report.json',checkBytes]]);
 for(const [f,h]of Object.entries(manifest.artifacts)){arrowAgentPath(f);const b=await read('primary',f);assert.equal(sha256(b),h,'Changed source-primary input: '+f);files.set('primary/'+f,b);}
 const sources=await arrowSourcePrimarySources();assert.deepEqual(report.sourceHashes,Object.fromEntries([...sources].map(([f,s])=>[f,s.sha256])));
 for(const [f,s]of sources)assert.equal(sha256(files.get('primary/source-captures/'+f)),s.sha256);
 const legacy=await loadArrowSourcePrimaryInput(report.inputs.producer,report.inputs.checker,async(k,f)=>files.get('primary/upstream/'+k+'/'+f));
 assert.equal(report.inputs.producerSha256,legacy.producerSha256);assert.equal(report.inputs.checkerSha256,legacy.checkerSha256);
 assert.equal(report.snapshotSha256,legacy.evidence.snapshotSha256);
 assert.deepEqual([check.completed,check.converterInvoked,check.approvedImagePolicy,check.imageConformanceClaim],[true,false,false,false]);
 assert.equal(check.comparisonKind,'independent-native-arrow-source-primary-check');assert.equal(check.inputReport,producer);assert.equal(check.inputReportSha256,sha256(bytes));
 assert.equal(check.snapshotSha256,report.snapshotSha256);assert.deepEqual(check.sourceHashes,report.sourceHashes);assert.deepEqual(check.renderer,report.renderer);assert.deepEqual(check.summary,report.summary);
 assert.deepEqual([check.measurements,check.deltaChecks,check.panels,check.controls.length],[39834,210,2445,89]);assert.ok(check.controls.every(c=>c.passed));
 const frames=legacy.frames.map(f=>({...f,paper:arrowPdfRegions(legacy.evidence.cases.find(c=>c.id===f.caseId).metrics,f)}));
 return{producer,checker,producerSha256:sha256(bytes),checkerSha256:sha256(checkBytes),report,check,files,legacy,frames,evidence:legacy.evidence};
}

export async function arrowSourcePdfLiveRead(producer,checker){
 const folders={primary:path.dirname(path.join(root,producer)),'primary-check':path.dirname(path.join(root,checker))};
 for(const folder of Object.values(folders))await outputPath(folder);
 return async(k,f)=>{const p=await outputPath(folders[k],arrowAgentPath(f));assert.ok((await stat(p)).size<30000000);return readFile(p);};
}

export function arrowSourcePdfEntry(input,sources,model,manifest){
 return{schemaVersion:1,completed:true,comparisonKind:'native-arrow-conservative-source-PDF-observations',converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',
  contract:arrowSourcePdfContract,snapshotSha256:input.evidence.snapshotSha256,renderer:input.report.renderer,sourceHashes:Object.fromEntries([...sources].map(([f,s])=>[f,s.sha256])),
  inputs:{producer:input.producer,checker:input.checker,producerSha256:input.producerSha256,checkerSha256:input.checkerSha256},summary:model.summary,eligibility:model.eligibility,
  viewer:'index.html',policies:'policies.json',manifest,agent:{pendingGates:['immutable-primary-and-PDF-qualification','owned-public-combined-admission'],interpretation:'Both conservative source and unclipped physical-page observations are required. Native-only limits and controls do not admit public conversion.'}};
}

export async function loadArrowSourcePdfOwned(file){
 arrowAgentPath(file);assert.match(file,/^artifacts\/arrow-source-pdf-calibration\/run-[a-f0-9-]+\/report.json$/);
 const folder=path.dirname(path.join(root,file));await outputPath(folder);
 const read=async f=>{const p=await outputPath(folder,arrowAgentPath(f));assert.ok((await stat(p)).size<30000000);return readFile(p);};
 const bytes=await read('report.json');assert.ok(bytes.length<32000);const report=JSON.parse(bytes);
 assert.deepEqual([report.completed,report.converterInvoked,report.approvedImagePolicy,report.imageConformanceClaim],[true,false,false,false]);
 assert.equal(report.manifest.file,'manifest.json');const mb=await read('manifest.json');assert.equal(sha256(mb),report.manifest.sha256);
 const manifest=JSON.parse(mb);assert.equal(Object.keys(manifest.artifacts).length,report.manifest.files);const files=new Map();
 for(const [f,h]of Object.entries(manifest.artifacts)){const b=await read(f);assert.equal(sha256(b),h);files.set(f,b);}
 const sources=await arrowSourcePdfSources();assert.deepEqual(report.sourceHashes,Object.fromEntries([...sources].map(([f,s])=>[f,s.sha256])));
 for(const [f,s]of sources)assert.equal(sha256(files.get('source-captures/'+f)),s.sha256);
 const input=await loadArrowSourcePdfInput(report.inputs.producer,report.inputs.checker,async(k,f)=>files.get('upstream/'+k+'/'+f));
 return{folder,bytes,sha256:sha256(bytes),report,manifest,files,sources,input};
}
