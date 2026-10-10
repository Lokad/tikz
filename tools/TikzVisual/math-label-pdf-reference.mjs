// Fixed trusted math wrappers; shared bounded process/artifact handling.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {captureProcess} from './qualification-process.mjs';
import {loadCalcSavedReport,calcEqual} from './calc-saved-images.mjs';
import {edgeSanitize} from './edge-log.mjs';
import {mathFramingFamily} from './math-label-framing.mjs';
import {mathPdfWrapper,mathPdfMeasurements,mathPdfFontBinding,mathPdfWrapperHash,validateMathPdfReference,readMathPdfInputs} from './math-label-pdf-native.mjs';
assert.equal(process.argv.length,3,'Usage: math-label-pdf-reference.mjs <accepted-math-native-path-report>');
const output=path.join(root,'artifacts/math-pdf-reference/run-'+randomUUID()),artifacts={},commands=[],cases=[],tools={};
const save=(file,bytes)=>writeArtifact(output,file,bytes,artifacts),json=(file,value)=>save(file,JSON.stringify(value,null,2)+'\n');
let phase='native-input',wrapperInput;
async function publish(completed,extra={}){
 const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'math-label-native-pdf-reference',completed,phase:completed?'complete':phase,
  converterInvoked:false,nativeToolInvoked:true,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',
  wrapperInputSha256:wrapperInput?.sha256,tools:Object.fromEntries(Object.entries(tools).map(([n,t])=>[n,{sha256:t.sha256,version:t.version}])),
  cases,commands,artifacts,...extra},null,2)+'\n');
 await writeArtifact(output,'report.json',bytes);console.log(JSON.stringify({completed,phase,report:path.relative(root,path.join(output,'report.json')).replaceAll('\\','/'),sha256:sha256(bytes)}));
}
async function execute(name,args,cwd,tag){
 if(name==='pdflatex')args=['--miktex-disable-maintenance','--miktex-disable-diagnose',...args];
 const p=await captureProcess(tools[name].executable,args,{cwd});await save('commands/'+tag+'.log',edgeSanitize(p.output));
 commands.push({name,args,tag,exitCode:p.exitCode,failure:p.failure});assert.equal(p.failure,null);assert.equal(p.exitCode,0,p.output.slice(-1500));return p.output;
}
await publish(false);
try{
 wrapperInput=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'math-label-path-native');
 const declaredCases=mathFramingFamily(wrapperInput.report.results.map(c=>c.id));
 assert.equal(wrapperInput.sha256,mathPdfWrapperHash(declaredCases.map(c=>c.id)));
 await save('inputs/wrapper-report.json',wrapperInput.bytes);
 const profile=JSON.parse(await readFile(path.join(root,'tests/Reference/NodeShapes/pdf-oracle-profile.json')));
 for(const [name,expected]of Object.entries({pdflatex:profile.pdfLatexVersion,pdftoppm:profile.pdfRasterizerVersion,pdfinfo:profile.pdfInfoVersion})){
  const executable=path.join(process.env.LOCALAPPDATA,'Programs/MiKTeX/miktex/bin/x64',name+'.exe');
  tools[name]={executable,sha256:sha256(await readFile(executable))};
  const version=await execute(name,[name==='pdflatex'?'--version':'-v'],root,'version-'+name);
  assert.ok(version.includes(expected),'Changed pinned PDF tool: '+name);tools[name].version=version.split(/\r?\n/)[0];
 }
 for(const file of ['tools/TikzVisual/math-label-pdf-reference.mjs','tools/TikzVisual/math-label-pdf-native.mjs','tools/TikzVisual/qualification-process.mjs',
  'tools/TikzVisual/edge-log.mjs','tests/Reference/NodeShapes/pdf-oracle-profile.json'])
  await save('source-captures/'+file,await readFile(path.join(root,file)));
 for(const c of declaredCases){
  const id=c.id,expected=wrapperInput.json(id+'/measurements.json'),supplement=wrapperInput.json(id+'/framing.json'),states={};
  await json(id+'/frozen-framing.json',supplement);await json(id+'/frozen-measurements.json',expected);
  await json(id+'/frozen-fonts.json',wrapperInput.json(id+'/math-font-observations.json'));
  phase='native-pdf';
  for(const state of ['plain','probed']){
   const folder=path.join(output,id,state);await mkdir(folder,{recursive:true});
   for(const file of ['case.tikz','math-framing.tex','arrow-hooks.tex'])await save(id+'/'+state+'/'+file,wrapperInput.files.get(id+'/'+state+'/'+file));
   assert.equal(sha256(Buffer.from(wrapperInput.files.get(id+'/'+state+'/case.tikz').toString().replaceAll('\r\n','\n'))),expected.sourceSha256);
   await save(id+'/'+state+'/case.tex',mathPdfWrapper(wrapperInput.files.get(id+'/'+state+'/case.tex').toString()));
   await execute('pdflatex',['-disable-write18','-disable-installer','-interaction=nonstopmode','-halt-on-error','-recorder','case.tex'],folder,id+'-'+state+'-compile');
   const log=edgeSanitize(await readFile(path.join(folder,'case.log'),'utf8'));await save(id+'/'+state+'.log',log);
   const inputs=await readMathPdfInputs(folder,output);
   const frozenInputs=wrapperInput.json(id+'/'+state+'/native-inputs.json');
   for(const [file,digest]of Object.entries(inputs))if(Object.hasOwn(frozenInputs,file))assert.equal(digest,frozenInputs[file],'Changed shared native input: '+file);
   await json(id+'/'+state+'/native-inputs.json',inputs);await save(id+'/'+state+'/case.fls',await readFile(path.join(folder,'case.fls')));
   const fontBinding=mathPdfFontBinding(inputs,wrapperInput.json(id+'/math-font-observations.json'));
   if(state==='plain')await json(id+'/font-binding.json',fontBinding);else calcEqual(fontBinding,JSON.parse(await readFile(path.join(output,id+'/font-binding.json'))));
   const pdf=await readFile(path.join(folder,'case.pdf'));await save(id+'/'+state+'-reference.pdf',pdf);
   const info=await execute('pdfinfo',['case.pdf'],folder,id+'-'+state+'-page-info');assert.match(info,/Pages:\s+1\r?\n/);
   const pages={};for(const scale of [1,4]){
    await execute('pdftoppm',['-png','-r',String(96*scale),'-f','1','-singlefile','case.pdf','page-'+scale+'x'],folder,id+'-'+state+'-'+scale+'x');
    const bytes=await readFile(path.join(folder,'page-'+scale+'x.png'));await save(id+'/'+state+'-pdf-page-'+scale+'x.png',bytes);pages[scale]=sha256(bytes);
   }states[state]={pdf:sha256(pdf),pages};
   if(state==='probed'){const measured=mathPdfMeasurements(log,expected);calcEqual(measured.pictureBounds,supplement.pictureBounds);calcEqual(measured.lineWidthsSp,supplement.lineWidthsSp);await json(id+'/measurements.json',measured);}
  }
  calcEqual(states.plain,states.probed,'Probes change native math PDF bytes/rasters.');
  cases.push({id,sourceSha256:expected.sourceSha256,labels:c.nodes,anchors:c.nodes*16,pdfNoninterference:true,rasterNoninterference:true});
  console.log(JSON.stringify({phase,caseId:id,pdfNoninterference:true}));
 }
 await publish(true);
 const owned=await loadCalcSavedReport(path.join(output,'report.json'),'math-label-native-pdf-reference');
 const checked=validateMathPdfReference(owned,wrapperInput);await json('independent-measurement-check.json',checked);
 console.log(JSON.stringify({checked,report:path.relative(root,path.join(output,'report.json')).replaceAll('\\','/'),sha256:owned.sha256}));
}catch(error){await save('failure.log',String(error.stack??error).replaceAll(root,'<repo>'));await publish(false,{error:error.message});process.exitCode=1;}
