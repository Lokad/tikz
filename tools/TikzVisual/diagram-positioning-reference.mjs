// Native-only iteration measurements for fixed trusted positioning fixtures.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,writeArtifact,sha256} from './shape-oracle-bundle.mjs';
import {captureProcess} from './qualification-process.mjs';
import {edgeAnchors,edgeSanitize} from './edge-log.mjs';
import {canonicalEdgeSvg} from './edge-replay.mjs';
const cases={
 'flowchart-basic':{names:['input','check','output','retry'],hash:'16ef26c526d0892f2fa643240cf0e9c4a74ea52a62252d4aff8c8ee792762b54'},
 'network-bent':{names:['queue','primary','replica'],hash:'da163c256834b3c94477f4e368cbe69cc700a867b93a0b73a210d3e7a4aa0e54'},
 'flowchart-transformed':{names:['start','finish'],hash:'481e44ba361e36319fadb8f75f2dc73049fa3b14a428baefb8f8ce11efc2c5aa'},
 contract:{folder:'Positioning',names:['seed','north','south','east','west','northeast','northwest','southeast','southwest','single','two','anchorTarget','coordinateTarget','scopedDistance','restoredDistance','basisPair','basisSingle','resetSeed','reset','full','localOrder','captureDistance','negativeDistance','styled'],hash:'1e23351eb4d5e7bd4a41960cae0a6dbcb2b19de29e932c89059d2f0574f4dd2b'},
 registration:{folder:'Positioning',names:['seed','inside','outside','reloaded'],hash:'baf1d70f439bc0af2bd7868268ffdd42f59bd07c2d190ab42b775193cb3be851'},
 'scoped-unavailable':{folder:'Positioning',names:['seed','inside'],hash:'d6640ba5aeaca12213eaa0ae1ff08c3c72730b1830fdb7b85d91030ff66fde82',nativeError:"! Package PGF Math Error: Unknown function `of'"},
 'scoped-reloaded':{folder:'Positioning',names:['seed','inside'],hash:'350aa9de1441cf2768c068ffb7af4de25d0fbe9b71709b32c9d4e0261301bb77',nativeError:"! Package PGF Math Error: Unknown function `of'"}
};
const selected=process.argv.length===2?Object.keys(cases):process.argv.slice(2);
assert.ok(selected.length>0&&selected.every(id=>Object.hasOwn(cases,id))&&new Set(selected).size===selected.length,'Only fixed trusted fixtures may be selected.');
const output=path.join(root,'artifacts/positioning-native/run-'+randomUUID()),artifacts={},commands=[],results=[];
const save=(f,b)=>writeArtifact(output,f,b,artifacts),bin=path.join(process.env.LOCALAPPDATA,'Programs/MiKTeX/miktex/bin/x64');
const tools=Object.fromEntries(await Promise.all(['latex','dvisvgm'].map(async name=>{const executable=path.join(bin,name+'.exe');return[name,{executable,sha256:sha256(await readFile(executable))}];})));
async function execute(name,args,cwd,tag,expectedError){const p=await captureProcess(tools[name].executable,args,{cwd});await save('commands/'+tag+'.log',edgeSanitize(p.output));
 commands.push({name,args,tag,exitCode:p.exitCode,failure:p.failure});assert.equal(p.failure,null);
 if(expectedError){assert.equal(p.exitCode,1);assert.ok(p.output.includes(expectedError),'Unexpected native failure');}
 else assert.equal(p.exitCode,0,p.output.slice(-1000));return p.output;}
async function publish(completed,error){const b=Buffer.from(JSON.stringify({schemaVersion:1,role:'diagram-positioning-native-iteration',completed,converterInvoked:false,nativeToolInvoked:true,
 approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',tools:Object.fromEntries(Object.entries(tools).map(([n,t])=>[n,{sha256:t.sha256}])),commands,results,artifacts,error},null,2)+'\n');
 await writeArtifact(output,'report.json',b);console.log(JSON.stringify({completed,report:path.relative(root,path.join(output,'report.json')).replaceAll('\\','/'),sha256:sha256(b)}));}
function records(log,kind){assert.ok(log.length<=2000000);const flat=log.replace(/\r?\n/g,''),rows=[...flat.matchAll(new RegExp(kind+' ([^]*?)\\|END','g'))].map(m=>m[1].split('|'));
 assert.equal(rows.length,(flat.match(new RegExp(kind+' ','g'))??[]).length);return rows;}
function integer(s){assert.match(s,/^-?\d+$/);const n=Number(s);assert.ok(Number.isSafeInteger(n)&&Math.abs(n)<=1073741823);return n;}
await publish(false);
try{
 const profile=JSON.parse(await readFile(path.join(root,'tests/Reference/NodeShapes/oracle-profile.json')));
 for(const name of Object.keys(tools)){const version=await execute(name,['--version'],root,'version-'+name);
  assert.ok(version.includes(name==='latex'?profile.latexVersion:profile.dvisvgmVersion),'Changed pinned native tool '+name);}
 const wrapperSource=await readFile(path.join(root,'tools/TikzPathLabelReference/placement.tex'),'utf8');
 await save('wrapper-source.tex',wrapperSource);await save('script.mjs',await readFile(new URL(import.meta.url)));
 for(const id of selected){const c=cases[id];
  const source=await readFile(path.join(root,'tests/Fixtures/'+(c.folder??'Diagrams')+'/'+id+'.tikz'));assert.equal(sha256(Buffer.from(source.toString().replaceAll('\r\n','\n'))),c.hash);
  let wrapper=wrapperSource.replace('straight,quarter,reverse,inverted,bend,absolute,from,target,border,reset,full,zero,one',c.names.join(','));
  const start=wrapper.indexOf('        \\labelanchor{\\labelname}{text}'),end=wrapper.indexOf('      }%',start);assert.ok(start>=0&&end>start);
  wrapper=wrapper.slice(0,start)+edgeAnchors.map(a=>'        \\labelanchor{\\labelname}{'+a+'}').join('\n')+'\n'+wrapper.slice(end);
  const svg={};let native;
  for(const state of ['plain','probed']){
   const folder=path.join(output,id,state);await mkdir(folder,{recursive:true});await save(id+'/'+state+'/case.tikz',source);
   await save(id+'/'+state+'/case.tex',(state==='probed'?'\\AtBeginDocument{\\labelprobestrue}\n':'')+wrapper);
   await execute('latex',['-disable-write18','-disable-installer','-interaction=nonstopmode','-halt-on-error','-recorder','case.tex'],folder,id+'-'+state+'-compile',c.nativeError);
   const log=edgeSanitize(await readFile(path.join(folder,'case.log'),'utf8'));await save(id+'/'+state+'/case.log',log);
   if(c.nativeError){await save(id+'/'+state+'/case.fls',await readFile(path.join(folder,'case.fls')));
    assert.ok(log.includes(c.nativeError));results.push({id,nativeRejected:true,expectedError:c.nativeError,sourceSha256:c.hash});break;}
   for(const f of ['case.dvi','case.fls'])await save(id+'/'+state+'/'+f,await readFile(path.join(folder,f)));
   const inputs={};for(const line of (await readFile(path.join(folder,'case.fls'),'utf8')).split(/\r?\n/).filter(l=>l.startsWith('INPUT '))){
    const f=path.resolve(folder,line.slice(6));if(f.startsWith(output+path.sep))continue;const key=path.basename(f),h=sha256(await readFile(f));
    if(inputs[key])assert.equal(inputs[key],h);inputs[key]=h;}
   await save(id+'/'+state+'/native-inputs.json',JSON.stringify(inputs,null,2)+'\n');
   await execute('dvisvgm',['--no-fonts','--exact-bbox','--output=case.svg','case.dvi'],folder,id+'-'+state+'-svg');
   svg[state]=await readFile(path.join(folder,'case.svg'));await save(id+'/'+state+'/case.svg',svg[state]);
   if(state==='probed'){
    assert.ok(log.includes('PATH-LABEL-PGF 3.1.11a'));const anchors=records(log,'PATH-LABEL-ANCHOR');assert.equal(anchors.length,c.names.length*edgeAnchors.length);
    const nodes=records(log,'PATH-LABEL-NODE').filter(r=>c.names.includes(r[0]));assert.deepEqual(nodes.map(r=>r[0]),c.names);
    for(const r of nodes){assert.equal(r.length,11);for(const s of r.slice(5,9))assert.ok(Number.isFinite(Number(s))&&Math.abs(Number(s))<=10000);
     for(const s of r.slice(9))assert.match(s,/^-?\d+(?:\.\d+)?pt$/);}
    for(const name of c.names)assert.deepEqual(anchors.filter(r=>r[0]===name).map(r=>r[1]),edgeAnchors);
    for(const r of anchors)assert.equal(r.length,4);
    native={sourceSha256:c.hash,nodes:nodes.map(r=>({name:r[0],anchor:r[1],widthSp:integer(r[2]),heightSp:integer(r[3]),depthSp:integer(r[4]),frame:r.slice(5)})),
     anchors:anchors.map(r=>({name:r[0],anchor:r[1],xSp:integer(r[2]),ySp:integer(r[3])})),pictureBox:records(log,'PATH-LABEL-BOX')};
    await save(id+'/measurements.json',JSON.stringify(native,null,2)+'\n');
   }
  }
  if(c.nativeError)continue;
  assert.equal(canonicalEdgeSvg(svg.plain),canonicalEdgeSvg(svg.probed),'Probes changed diagram drawing');
  results.push({id,nodes:native.nodes.length,anchors:native.anchors.length,probeSvgNoninterference:true,sourceSha256:c.hash});
 }
 for(const[f,h]of Object.entries(artifacts))assert.equal(sha256(await readFile(path.join(output,f))),h);
 await publish(true);
}catch(e){await publish(false,e.message);process.exitCode=1;}
