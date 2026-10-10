// Specific gap: owned native PDF/page references must rederive and replay from trusted sources.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root,writeArtifact,sha256} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport,calcEqual} from './calc-saved-images.mjs';
import {captureProcess} from './qualification-process.mjs';
import {edgeSanitize} from './edge-log.mjs';
import {decodeCalcPng} from './calc-png.mjs';
import {mathFramingFamily} from './math-label-framing.mjs';
import {mathPdfMeasurements,mathPdfFontBinding,mathNativePdfFrame,validateMathPdfReference,verifyMathPdfReplay,readMathPdfInputs} from './math-label-pdf-native.mjs';

assert.equal(process.argv.length,6,'Usage: check-math-label-pdf-native.mjs <native-pdf-report> <native-path-report> <primary-calibration> <primary-check>');
const output=path.join(root,'artifacts/math-pdf-native-check/run-'+randomUUID()),artifacts={},commands=[],replay=[],frames=[];
const save=(file,bytes)=>writeArtifact(output,file,bytes,artifacts),json=(file,value)=>save(file,JSON.stringify(value,null,2)+'\n');
let owned;
async function publish(completed,extra={}){
 const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'math-label-independent-native-pdf-check',completed,phase:completed?'complete':'checking',
  converterInvoked:false,nativeToolInvoked:true,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',
  nativeInputSha256:owned?.sha256,commands,replay,frames,artifacts,...extra},null,2)+'\n');
 await writeArtifact(output,'report.json',bytes);console.log(JSON.stringify({completed,report:path.relative(root,path.join(output,'report.json')).replaceAll('\\','/'),sha256:sha256(bytes)}));
}
await publish(false);
try{
 owned=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'math-label-native-pdf-reference');
 const wrapperInput=await loadCalcSavedReport(path.resolve(root,process.argv[3]),'math-label-path-native');
 const primary=await loadCalcSavedReport(path.resolve(root,process.argv[4]),'math-label-native-primary-calibration');
 const primaryCheck=await loadCalcSavedReport(path.resolve(root,process.argv[5]),'math-label-independent-primary-check');
 const declaredCases=mathFramingFamily(primary.report.cases.map(c=>c.id));
 assert.equal(primaryCheck.report.inputSha256,primary.sha256);
 assert.equal(primaryCheck.report.sourceRecaptures,primary.report.coverage.nativeViews+primary.report.coverage.controlViews);
 assert.ok(primaryCheck.files.get('input-report.json').equals(primary.bytes));
 const measurements=validateMathPdfReference(owned,wrapperInput),tools={};
 for(const name of ['pdflatex','pdftoppm','pdfinfo']){
  const executable=path.join(process.env.LOCALAPPDATA,'Programs/MiKTeX/miktex/bin/x64',name+'.exe');
  assert.equal(sha256(await readFile(executable)),owned.report.tools[name].sha256,'Changed native PDF tool: '+name);tools[name]=executable;
 }
 for(const c of declaredCases){
  const frame=mathNativePdfFrame(owned,c.id,primary.json(c.id+'/frame.json'));
  assert.equal(frame.regions.length,1+c.nodes+c.glyphs+c.rules+c.paths);
  for(const scale of [1,4]){
   const png=decodeCalcPng(owned.files.get(c.id+'/probed-pdf-page-'+scale+'x.png'));
   calcEqual({width:png.width,height:png.height},frame.camera.rasterSizes[scale+'x']);
   for(let i=3;i<png.rgba.length;i+=4)assert.equal(png.rgba[i],255,'Native PDF raster is not opaque.');
  }
  await json(c.id+'/pdf-frame.json',frame);frames.push({id:c.id,regions:frame.regions.length,origin:frame.camera.origin});
 }
 for(const c of declaredCases)for(const state of ['plain','probed']){
  const id=c.id,folder=path.join(output,'replay/'+id+'/'+state);await mkdir(folder,{recursive:true});
  for(const file of ['case.tex','case.tikz','math-framing.tex','arrow-hooks.tex'])
   await save('replay/'+id+'/'+state+'/'+file,owned.files.get(id+'/'+state+'/'+file));
  async function execute(name,args,tag){
   const p=await captureProcess(tools[name],args,{cwd:folder});await save('commands/'+tag+'.log',edgeSanitize(p.output));
   commands.push({name,args,tag,exitCode:p.exitCode,failure:p.failure});assert.equal(p.failure,null);assert.equal(p.exitCode,0,p.output.slice(-1200));return p.output;
  }
  await execute('pdflatex',['--miktex-disable-maintenance','--miktex-disable-diagnose','-disable-write18','-disable-installer','-interaction=nonstopmode','-halt-on-error','-recorder','case.tex'],id+'-'+state+'-compile');
  const inputs=await readMathPdfInputs(folder,output);calcEqual(inputs,owned.json(id+'/'+state+'/native-inputs.json'),'Source replay changes native inputs.');
  calcEqual(mathPdfFontBinding(inputs,wrapperInput.json(id+'/math-font-observations.json')),owned.json(id+'/font-binding.json'));
  const log=edgeSanitize(await readFile(path.join(folder,'case.log'),'utf8'));await save('replay/'+id+'/'+state+'/case.log',log);
  if(state==='probed')calcEqual(mathPdfMeasurements(log,wrapperInput.json(id+'/measurements.json')),owned.json(id+'/measurements.json'));
  const pdf=await readFile(path.join(folder,'case.pdf'));await save('replay/'+id+'/'+state+'/reference.pdf',pdf);
  const rasters={};for(const scale of [1,4]){
   await execute('pdftoppm',['-png','-r',String(96*scale),'-f','1','-singlefile','case.pdf','page-'+scale+'x'],id+'-'+state+'-'+scale+'x');
   const bytes=await readFile(path.join(folder,'page-'+scale+'x.png'));rasters[scale]=sha256(bytes);
   await save('replay/'+id+'/'+state+'/page-'+scale+'x.png',bytes);
  }
  replay.push({caseId:id,state,pdfSha256:sha256(pdf),rasters});console.log(JSON.stringify({phase:'source-replay',caseId:id,state}));
 }
 const sourceReplay=verifyMathPdfReplay(owned,replay);await save('input-report.json',owned.bytes);await save('inputs/primary-check.json',primaryCheck.bytes);
 for(const file of ['math-label-pdf-native.mjs','check-math-label-pdf-native.mjs','path-label-image-reference.mjs','shape-pdf-camera.mjs','qualification-process.mjs','calc-png.mjs'])
  await save('source-captures/tools/TikzVisual/'+file,await readFile(path.join(root,'tools/TikzVisual/'+file)));
 const requiredRegions=declaredCases.reduce((n,c)=>n+1+c.nodes+c.glyphs+c.rules+c.paths,0);
 assert.equal(frames.reduce((n,f)=>n+f.regions,0),requiredRegions);
 await publish(true,{measurements,sourceReplay,requiredRegions,primaryInputSha256:primary.sha256,primaryCheckSha256:primaryCheck.sha256,
  scope:'Native math PDF source/page/font/crop reference only. Original/converter PDF policies, sensitivity, current conformance and feature-final acceptance remain open.'});
}catch(error){await save('failure.log',String(error.stack??error).replaceAll(root,'<repo>'));await publish(false,{error:error.message});process.exitCode=1;}
