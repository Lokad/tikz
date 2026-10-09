// Supplemental arrow observations against saved original complete diagrams.
// Existing text calibration and original images remain immutable.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,writeArtifact,sha256} from './shape-oracle-bundle.mjs';
import {captureProcess} from './qualification-process.mjs';
import {loadCalcSavedReport} from './calc-saved-images.mjs';
import {ownCalcBundle} from './calc-admission-child.mjs';
import {edgeSanitize,edgePdfPage,edgeCanonical} from './edge-log.mjs';
import {canonicalEdgeSvg} from './edge-replay.mjs';
import {arrowHooks,parseArrowLog} from './arrow-log.mjs';
import {verifyArrowDriverState} from './arrow-driver-state.mjs';
assert.equal(process.argv.length,3,'Usage: node tools/TikzVisual/diagram-arrow-reference.mjs <exact-original-diagram-report>');
const expected={
 'flowchart-foreach':'64ee9c160bb1a8c652bc0cdd38c6396abccc1bde6c686d8f109169e3a72803ad',
 'flowchart-parameterized':'9783a9f385b8bcc1ad4cb5a4fe589c85ae179f7e5eb15a7cf68d5450bd7105c6',
 'flowchart-basic':'16ef26c526d0892f2fa643240cf0e9c4a74ea52a62252d4aff8c8ee792762b54',
 'network-bent':'da163c256834b3c94477f4e368cbe69cc700a867b93a0b73a210d3e7a4aa0e54',
 'flowchart-transformed':'481e44ba361e36319fadb8f75f2dc73049fa3b14a428baefb8f8ce11efc2c5aa'};
const probeHashes={
 'flowchart-foreach':'d66b7327ab7df75a213fde20221eab43d9a1b017846090867fac363b63f4f647',
 'flowchart-parameterized':'5f4be2e8497e1659a9af51daf4bfa02dbc11b18ee58a250d8dc47ef5c4308076',
 'flowchart-basic':'7db0d9c2af22c608401bb2049e2f0cbee66739f36ff8a6062d73b2a8d5cc4437',
 'network-bent':'bf07fd046f6da40ada6375eb1a585f17273db903d12d0628f808821d9cabf077',
 'flowchart-transformed':'44f012039c1406f19ed6dcaa59ef164a0df1bed7e8a4000f1360dfa21b3ee086'};
const output=path.join(root,'artifacts/diagram-arrow-reference/run-'+randomUUID()),artifacts={},commands=[];
const save=(f,b)=>writeArtifact(output,f,b,artifacts);let phase='original-input';
async function publish(completed,details={}){const b=Buffer.from(JSON.stringify({schemaVersion:1,role:'diagram-arrow-native-reference',completed,phase:completed?'complete':phase,converterInvoked:false,nativeToolInvoked:true,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',artifacts,commands,...details},null,2)+'\n');await writeArtifact(output,'report.json',b);console.log(JSON.stringify({completed,report:path.relative(root,path.join(output,'report.json')).replaceAll('\\','/'),sha256:sha256(b)}));}
async function execute(executable,args,cwd,tag){const p=await captureProcess(executable,args,{cwd});await save('commands/'+tag+'.log',edgeSanitize(p.output));commands.push({tag,tool:path.basename(executable),args,exitCode:p.exitCode,failure:p.failure});assert.equal(p.failure,null);assert.equal(p.exitCode,0,p.output.slice(-1000));return p.output;}
await publish(false);
try{
 const file=path.resolve(root,process.argv[2]);assert.ok(file.startsWith(path.join(root,'artifacts')+path.sep));
 const original=await loadCalcSavedReport(file,'diagram-native-reference'),id=original.report.definition.id;
 assert.ok(Object.hasOwn(expected,id));const sourceFile='tests/Fixtures/Diagrams/'+id+'.tikz',source=edgeCanonical(await readFile(path.join(root,sourceFile)));
 assert.equal(sha256(source),expected[id]);assert.equal(original.report.sourceHashes[sourceFile],expected[id]);assert.ok(source.equals(original.files.get('source-captures/'+sourceFile)));
 // Owned artifacts are not authorization to execute arbitrary TeX. These
 // wrapper/probe bytes come from the fixed, reviewed diagram producer.
 for(const[f,h]of Object.entries({'svg-wrapper.tex':'3d76e71ce8bb5df4e395d9ffb34063c64f00f7237ece5ac69cbd868b3cdc7868','pdf-wrapper.tex':'789f0ad2d515e51a7d79bb456f1f186ce3dc49be9035514df4e6b38751110893','probes.tex':probeHashes[id]}))
  assert.equal(sha256(original.files.get(f)),h,'Untrusted native wrapper/probes: '+f);
 assert.ok(edgeCanonical(original.files.get('source-captures/tools/TikzEdgeReference/edge-hooks.tex')).equals(edgeCanonical(await readFile(path.join(root,'tools/TikzEdgeReference/edge-hooks.tex')))));
 await ownCalcBundle(original,'original',save);
 for(const[f,b]of original.files)if(f==='metrics.json'||f==='probed-reference.svg'||f==='native-positions.log'||f.startsWith('fonts/')||f.startsWith('source-captures/'))await save(f,b);
 const sourceHashes={...original.report.sourceHashes};
 for(const f of[arrowHooks,'tools/TikzVisual/diagram-arrow-reference.mjs','tools/TikzVisual/arrow-log.mjs','tools/TikzVisual/arrow-driver-state.mjs']){const b=edgeCanonical(await readFile(path.join(root,f)));sourceHashes[f]=sha256(b);await save('source-captures/'+f,b);}
 const tools={};
 for(const name of['latex','pdflatex','dvisvgm']){
  const dirs=(process.env.PATH??'').split(path.delimiter);if(process.platform==='win32')dirs.push(path.join(process.env.LOCALAPPDATA,'Programs/MiKTeX/miktex/bin/x64'));
  for(const dir of dirs){const f=path.join(dir.replace(/^"|"$/g,''),name+(process.platform==='win32'?'.exe':''));try{const b=await readFile(f);assert.equal(sha256(b),original.report.tools[name].sha256);tools[name]=f;break;}catch(e){if(!['ENOENT','ENOTDIR'].includes(e.code))throw e;}}
  assert.ok(tools[name]);const v=await execute(tools[name],['--version'],root,'version-'+name);assert.ok(v.includes(original.report.tools[name].version));
 }
 const observations={};
 for(const route of['svg','pdf']){
  phase=route+'-supplemental';const folder=path.join(output,'work/'+route);await mkdir(folder,{recursive:true});
  let wrapper=original.files.get(route+'-wrapper.tex').toString('utf8');
  const hooks='\\AtBeginDocument{\\input{arrow-hooks.tex}\\typeout{ARROW-PGF \\pgfversion|END}\\let\\diagramarrowend\\endtikzpicture\\def\\endtikzpicture{\\typeout{ARROW-BOUNDS \\number\\pgf@picminx|\\number\\pgf@picminy|\\number\\pgf@picmaxx|\\number\\pgf@picmaxy|END}\\diagramarrowend}}\n';
  assert.ok(wrapper.includes('\\begin{document}'));wrapper=wrapper.replace('\\begin{document}',hooks+'\\begin{document}');
  const box='\\typeout{LOKAD-BOX \\number\\wd\\lokadpicture|\\number\\ht\\lokadpicture|\\number\\dp\\lokadpicture|END}';assert.ok(wrapper.includes(box));wrapper=wrapper.replace(box,box+'\n'+box.replace('LOKAD-BOX','ARROW-BOX'));
  await save(route+'-wrapper.tex',wrapper);
  for(const[f,b]of[['case.tikz',source],['case.tex',Buffer.from('\\AtBeginDocument{\\lokadprobestrue}\n'+wrapper)],['arrow-hooks.tex',await readFile(path.join(root,arrowHooks))],['edge-hooks.tex',original.files.get('source-captures/tools/TikzEdgeReference/edge-hooks.tex')],['probes.tex',original.files.get('probes.tex')]])await writeFile(path.join(folder,f),b);
  await execute(tools[route==='svg'?'latex':'pdflatex'],['-disable-write18','-disable-installer','-interaction=nonstopmode','-halt-on-error','-recorder','case.tex'],folder,route+'-compile');
  const log=edgeSanitize(await readFile(path.join(folder,'case.log'),'utf8'));await save(route+'-probed.log',log);
  const fls=await readFile(path.join(folder,'case.fls'),'utf8'),inputs={};await save(route+'-inputs.fls',edgeSanitize(fls));
  for(const line of fls.split(/\r?\n/).filter(l=>l.startsWith('INPUT '))){const f=path.resolve(folder,line.slice(6));if(f.startsWith(output+path.sep))continue;const key=path.basename(f),h=sha256(await readFile(f));if(inputs[key])assert.equal(inputs[key],h);inputs[key]=h;}
  const prior=original.json(route+'-probed-inputs.json');assert.deepEqual(inputs,prior,'Native engine inputs changed.');await save(route+'-inputs.json',JSON.stringify(inputs,null,2)+'\n');
  let bytes;
  if(route==='svg'){await execute(tools.dvisvgm,['--no-fonts','--exact-bbox','--bbox=min','--page=1','--output=reference.svg','case.dvi'],folder,'svg-outline');bytes=await readFile(path.join(folder,'reference.svg'));await save('supplemental-reference.svg',bytes);assert.equal(canonicalEdgeSvg(bytes),canonicalEdgeSvg(original.files.get('plain-reference.svg')));}
  else{bytes=await readFile(path.join(folder,'case.pdf'));await save('supplemental-reference.pdf',bytes);assert.ok(bytes.equals(original.files.get('plain-reference.pdf')),'Arrow probes changed original PDF bytes.');}
  observations[route]={log,bytes,metrics:parseArrowLog(log,{allowWrapperGlue:true})};
 }
 phase='native-checking';assert.deepEqual(observations.svg.metrics,observations.pdf.metrics);
 const metrics=observations.svg.metrics,extra=metrics.pictureBox.widthSp-(metrics.pictureBounds.maxXSp-metrics.pictureBounds.minXSp);
 metrics.driverState=verifyArrowDriverState(metrics,observations.svg.bytes,observations.pdf.bytes,edgePdfPage(observations.pdf.log),{allowText:true,wrapperExtraWidthSp:extra});
 await save('arrow-metrics.json',JSON.stringify(metrics,null,2)+'\n');
 await publish(true,{definition:original.report.definition,sourceHashes,tools:original.report.tools,originalInputSha256:original.sha256,invariance:{svgDrawing:true,pdfBytes:true,pdfPixelsUnchangedByByteIdentity:true},counts:{paths:metrics.paths.length,paints:metrics.driverState.paints.length,tips:metrics.placements.length,shortening:metrics.shortening.length},wrapperExtraWidthSp:extra});
}catch(e){await save('failure.log',edgeSanitize(e.stack??String(e)));await publish(false,{error:edgeSanitize(e.message)});process.exitCode=1;}
