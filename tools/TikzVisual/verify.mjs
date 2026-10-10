// A small execution index over existing family tools, not a new qualification
// engine. Readers, native measurements and pixel policies stay in their tools.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {root,writeArtifact,sha256} from './shape-oracle-bundle.mjs';
import {captureProcess} from './qualification-process.mjs';
import {runCalcChild} from './calc-admission-child.mjs';
import {loadCalcSavedReport,calcEqual} from './calc-saved-images.mjs';
import {pathLabelPrimaryDefects} from './path-label-primary-self-test.mjs';
import {pathLabelPdfDefects} from './path-label-pdf-self-test.mjs';
import {mathLabelCacheReports,styledLabelCacheReports} from './math-label-cache-inputs.mjs';

const features={
 core:['flowchart-draw-color','network-bent','flowchart-transformed','network-smooth-plot'],
 labels:['placement','interactions','flowchart-basic'],
 positioning:['flowchart-basic','network-bent','flowchart-transformed'],
 styles:['style-contract','flowchart-parameterized'],
 foreach:['foreach-contract','flowchart-foreach'],
 macros:['math-macro-contract','flowchart-math-macros'],
 functions:['math-functions-contract','network-math-functions'],
 plots:['coordinate-plot-contract','network-coordinate-plot','function-plot-contract','network-function-plot','smooth-plot-contract','network-smooth-plot'],
 paint:['arrow-color-contract','flowchart-draw-color','flowchart-paint'],
 math:['network-math-labels','math-label-contract','math-atom-contract'],
 styled:['flowchart-styled-labels']
};
const [action,...options]=process.argv.slice(2);
assert.ok(['iterate','qualify'].includes(action),'Usage: node tools/TikzVisual/verify.mjs iterate [--feature <name>|--case <id>] | qualify [--case <id>]');
let feature='core',onlyCase;
if(options.length){assert.equal(options.length,2);assert.ok(['--feature','--case'].includes(options[0]));
 if(options[0]==='--feature'){assert.equal(action,'iterate');assert.ok(Object.hasOwn(features,options[1]));feature=options[1];}else onlyCase=options[1];}
const qualification=action==='qualify',mode=qualification?'qualification':'iteration',viewFlag=qualification?[]:['--iteration'];
const output=path.join(root,'artifacts/verification/run-'+randomUUID()),artifacts={},steps=[],rows=[],controls=[],consolidated=[],seen=new Map();
const save=(f,b)=>writeArtifact(output,f,b,artifacts),json=(f,v)=>save(f,JSON.stringify(v,null,2)+'\n');
const started=new Date().toISOString(),clock=performance.now();let phase='inputs',selected=[],sourceHashes;
async function publish(completed,error){
 const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'tikz-verification-run',completed,phase:completed?'complete':phase,
  verificationMode:mode,selectedFixtures:selected,fullDiagramMatrix:qualification&&!onlyCase,
  nativeToolInvoked:false,calibrationRegenerated:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',
  started,finished:completed?new Date().toISOString():undefined,wallSeconds:(performance.now()-clock)/1000,artifacts,steps,rows,controls,consolidated,error,
  scope:qualification?'Required selected diagram matrix on current sources; remaining release/hosted qualification is separate.':'Affected numeric/images on current sources; full final qualification remains required.'},null,2)+'\n');
 await writeArtifact(output,'report.json',bytes);console.log(JSON.stringify({completed,phase,report:path.relative(root,path.join(output,'report.json')).replaceAll('\\','/'),sha256:sha256(bytes)}));
}
async function command(name,executable,args,kind='report',role){
 phase=name;console.log(JSON.stringify({phase,started:new Date().toISOString()}));const t=performance.now();
 let result,r,markers;
 if(kind==='report'){
  result=await runCalcChild(root,executable,args,name,save,1800000);
  const bytes=await readFile(path.join(root,result.report));assert.equal(sha256(bytes),result.sha256);const report=JSON.parse(bytes);
  assert.equal(report.completed,true);if(role)assert.equal(report.role,role);
  if(role==='path-label-portable-cache-materialization')assert.equal(report.canonicalRoundtripVerified,true);
  await save('receipts/'+name+'.json',bytes);
 }else{
  r=await captureProcess(executable,args,{cwd:root,timeout:1800000});await save(name+'.log',r.output);
  assert.equal(r.failure,null,'Child execution failed: '+name);assert.equal(r.exitCode,0,'Child rejected: '+name+'; inspect '+name+'.log');
  markers=r.output.split(/\r?\n/).filter(l=>l.startsWith('{')).map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean);
 }
 if(kind==='tests'){
  const bytes=await readFile(path.join(output,'tests/verification.trx')),xml=bytes.toString('utf8'),match=/<Counters\s+([^>]+)\/>/.exec(xml);assert.ok(match,'Missing ordinary test counters.');
  result=Object.fromEntries([...match[1].matchAll(/(\w+)="(\d+)"/g)].map(m=>[m[1],Number(m[2])]));
  assert.ok(result.total>0);assert.equal(result.passed,result.total);assert.equal(result.failed,0);assert.match(xml,/<ResultSummary outcome="Completed"/);
  await save('tests/verification.trx',bytes);
 }
 if(kind==='controls'){result=markers.find(m=>m.validated===true);assert.ok(result,'Missing corruption result: '+name);
  if(Number.isInteger(result.controls)&&result.report){
   assert.equal(path.basename(args[0]),'math-label-pdf-self-test.mjs','Unknown report-backed control receipt.');
   const saved=await loadCalcSavedReport(path.join(root,result.report),'math-label-pdf-image-controls');
   assert.equal(saved.sha256,result.sha256);assert.equal(saved.report.completed,true);
   assert.equal(saved.report.inputSha256,sha256(await readFile(path.resolve(root,args[1]))));
   assert.equal(result.controls,name==='math-pdf-controls'?19:22);
   assert.equal(saved.report.controls.length,result.controls);await save('receipts/'+name+'.json',saved.bytes);
   result={...result,controls:saved.report.controls};
  }
  if(Array.isArray(result.controls)){assert.ok(result.controls.length>0&&result.controls.every(c=>typeof c==='string'));assert.equal(new Set(result.controls).size,result.controls.length);}
  else{const expected={'svg-arrow-color-evidence-self-test.mjs':11,'path-label-cache-self-test.mjs':19}[path.basename(args[0])];
   assert.ok(expected,'Unknown numeric control schema: '+args[0]);assert.equal(result.controls,expected);
   assert.ok(Array.isArray(result.names));assert.equal(result.names.length,expected);assert.equal(new Set(result.names).size,expected);}
  controls.push({name,controls:result.controls});}
 else if(kind==='process'){assert.match(r.output,/Shared bounded process controls: 5 passed/);controls.push({name,controls:5});}
 steps.push({name,command:{executable:path.basename(executable),arguments:args.map(a=>a.replaceAll(root,'<repo>'))},wallSeconds:(performance.now()-t)/1000,result});await publish(false);return result;
}
const node=(name,file,args=[],kind='report',role)=>command(name,process.execPath,['tools/TikzVisual/'+file,...args],kind,role);
async function snapshot(){
 const hashes={};
 async function visit(directory){for(const item of await readdir(path.join(root,directory),{withFileTypes:true})){
  const file=directory+'/'+item.name;if(item.isDirectory()){if(!['bin','obj','node_modules'].includes(item.name))await visit(file);}
  else if(/\.(cs|mjs|csproj|props|targets|json|tikz|tex)$/.test(item.name))hashes[file]=sha256(await readFile(path.join(root,file)));
 }}
 for(const folder of ['src','tools','tests','benchmarks'])await visit(folder);
 for(const item of await readdir(root))if(/\.(slnx|props|targets|json)$/.test(item))hashes[item]=sha256(await readFile(path.join(root,item)));
 return Object.fromEntries(Object.entries(hashes).sort(([a],[b])=>a.localeCompare(b,'en')));
}
async function nativeControls(fixture,pc,dc,text){
 for(const [family,descriptor,role,definitions,file]of [
  ['primary',pc,'path-label-native-primary-calibration',pathLabelPrimaryDefects,'path-label-primary-self-test.mjs'],
  ['pdf',dc,'path-label-native-pdf-calibration',pathLabelPdfDefects,'path-label-pdf-self-test.mjs']]){
  const bundle=await loadCalcSavedReport(path.join(root,descriptor.file),role),defects=definitions(bundle),fresh=[];
  for(const [name]of defects){const key=family+'/'+name;if(seen.has(key))consolidated.push({fixture,control:key,representative:seen.get(key)});else fresh.push(name);}
  if(fresh.length){const name=fixture+'-'+family+'-controls',result=await node(name,file,[descriptor.file,'--only',fresh.join(',')],'controls');
   calcEqual(result.controls,fresh);for(const control of fresh)seen.set(family+'/'+control,fixture);}
 }
 if(text){if(!seen.has('text')){await node(fixture+'-text-controls','path-label-text-self-test.mjs',[text.file],'controls');seen.set('text',fixture);}
  else consolidated.push({fixture,control:'text/5-controls',representative:seen.get('text')});}
}
// Map entries never accept arbitrary user input in the native engine. These
// commands restore pinned trusted fixtures and never launch TeX.
try{
 const cases=new Map();
 for(const directory of ['Diagrams','PathLabels','Styles','Foreach','MathMacros','MathFunctions','Plotting','PaintDiagrams','ArrowColors']){
  const profile=JSON.parse(await readFile(path.join(root,'tests/Reference/'+directory+'/image-profile.json')));
  for(const [fixture,entry]of Object.entries(profile.fixtures)){assert.ok(!cases.has(fixture));cases.set(fixture,{...entry,legacy:directory==='PathLabels',correction:directory==='ArrowColors'});}
 }
 const mathIds=['network-math-labels','math-label-contract','math-atom-contract'],all=[...cases.keys(),...mathIds,'flowchart-styled-labels'];assert.equal(all.length,26);
 if(onlyCase)assert.ok(all.includes(onlyCase),'Unknown trusted fixture.');
 selected=onlyCase?[onlyCase]:qualification?all:features[feature];
 // Math's independent frozen contract binds its three-case family together.
 if(selected.some(id=>mathIds.includes(id)))selected=[...new Set([...selected,...mathIds])];
 sourceHashes=await snapshot();await json('source-hashes.json',sourceHashes);await publish(false);
 await command('ordinary','dotnet',['test','Lokad.TikZ.slnx','-c','Release','--logger','trx;LogFileName=verification.trx','--results-directory',path.join(output,'tests')],'tests');
 for(const fixture of selected.filter(id=>cases.has(id))){const entry=cases.get(fixture),[pc,pcheck,dc,dcheck,text]=entry.manifest.reports;
  await node(fixture+'-materialize','materialize-path-label-cache.mjs',[fixture],'report','path-label-portable-cache-materialization');
  if(qualification)await nativeControls(fixture,pc,dc,text);
  if(qualification&&entry.correction)await node(fixture+'-correction-controls','svg-arrow-color-evidence-self-test.mjs',[path.posix.dirname(pc.file)+'/native/original/report.json'],'controls');
  const numeric=entry.legacy?await node(fixture+'-numeric','compare-path-label-numeric.mjs',[fixture],'report','path-label-numeric-iteration'):
   await command(fixture+'-numeric','dotnet',['run','--project','tools/TikzPathLabelComparison','-c','Release','--',path.posix.dirname(pc.file)+'/native/report.json'],'report','diagram-current-numeric');
  const primary=await node(fixture+'-primary','compare-path-label-primary.mjs',[pc.file,numeric.report,...viewFlag],'report','path-label-current-primary-iteration');
  const pdf=await node(fixture+'-pdf','compare-path-label-pdf.mjs',[dc.file,numeric.report,...viewFlag],'report','path-label-current-pdf-iteration');
  const checked=await node(fixture+'-check','check-path-label-current.mjs',[primary.report,pcheck.file,pdf.report,dcheck.file],'report','path-label-independent-current-check');
  const result=JSON.parse(await readFile(path.join(root,checked.report))).result;assert.equal(result.passed,true);assert.equal(result.verificationMode,mode);
  if(qualification){if(!seen.has('current')){await node(fixture+'-current-controls','path-label-current-self-test.mjs',[primary.report,pdf.report],'controls');seen.set('current',fixture);}
   else consolidated.push({fixture,control:'current/8-controls',representative:seen.get('current')});}
  rows.push({fixture,numeric,primary,pdf,checked,result});await publish(false);
 }
 for(const [family,owners]of [['math',mathLabelCacheReports],['styled',styledLabelCacheReports]]){
  if(!selected.some(id=>family==='math'?mathIds.includes(id):id==='flowchart-styled-labels'))continue;
  for(const part of ['native','primary','pdf'])await node(family+'-'+part+'-materialize','materialize-path-label-cache.mjs',[(family==='math'?'math':'styled')+'-labels-'+part],'report','path-label-portable-cache-materialization');
  const [wrappers,native,pc,,pdfNative,pdfNativeCheck,dc,dcheck]=owners;
  if(qualification){await node(family+'-primary-controls','math-label-primary-self-test.mjs',[pc.file],'controls');
   await node(family+'-pdf-native-controls','math-label-pdf-native-self-test.mjs',[pdfNative.file,wrappers.file,pc.file,pdfNativeCheck.file],'controls');
   await node(family+'-pdf-controls','math-label-pdf-self-test.mjs',[dc.file],'controls');}
  const args=['run','--project','tools/TikzReference','-c','Release','--','export-math-labels'];if(family==='styled')args.push('--case','flowchart-styled-labels');
  args.push('--out','artifacts/verification-public-'+family+'/run-'+path.basename(output).slice(4));
  const exported=await command(family+'-public','dotnet',args,'report','math-label-candidate-export');
  const primary=await node(family+'-primary','math-label-primary-images.mjs',[native.file,pc.file,exported.report,...viewFlag],'report','math-label-current-primary-iteration');
  const pdf=await node(family+'-pdf','compare-math-label-pdf.mjs',[dc.file,dcheck.file,exported.report,...viewFlag],'report','math-label-current-pdf-iteration');
  const checked=await node(family+'-check','check-math-label-current.mjs',[primary.report,pdf.report,pc.file,dc.file],'report','math-label-independent-current-check');
  const result=JSON.parse(await readFile(path.join(root,checked.report))).result;assert.equal(result.passed,true);assert.equal(result.verificationMode,mode);
  if(qualification)await node(family+'-current-controls','math-label-current-self-test.mjs',[primary.report,pdf.report,pc.file,dc.file],'controls');
  rows.push({family,fixtures:family==='math'?mathIds:['flowchart-styled-labels'],exported,primary,pdf,checked,result});await publish(false);
 }
 if(qualification){await node('process-controls','qualification-process-self-test.mjs',[],'process');await node('cache-controls','path-label-cache-self-test.mjs',['--controls-only'],'controls');
  await node('iteration-negative-controls','verification-views-self-test.mjs',[],'controls');}
 calcEqual(await snapshot(),sourceHashes,'Source changed during verification.');phase='complete';await publish(true);
}catch(error){await save('failure.log',String(error.stack??error).replaceAll(root,'<repo>'));await publish(false,error.message);process.exitCode=1;}
