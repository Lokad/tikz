// Package acceptance extracted from existing local Release/consumer checks.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {captureProcess} from '../TikzVisual/qualification-process.mjs';
import {root,writeArtifact,sha256} from '../TikzVisual/shape-oracle-bundle.mjs';

const [directory,...flags]=process.argv.slice(2);
assert.ok(directory&& (flags.length===0||flags.length===1&&flags[0]==='--controls'),
 'Usage: node tools/TikzPackageCheck/verify.mjs <package-directory> [--controls]');
const packageDirectory=path.resolve(directory),tool=path.dirname(fileURLToPath(import.meta.url)),
 output=path.join(root,'artifacts/package-check/run-'+randomUUID()),artifacts={},steps=[],started=performance.now();
const report={schemaVersion:1,role:'tikz-package-acceptance',completed:false,steps,artifacts,
 scope:'Actual Release package, .NET-only isolated consumer and source/package parity. Native/image/hosted qualification remains separate.'};
const save=(file,bytes)=>writeArtifact(output,file,bytes,artifacts);
async function publish(){await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');}
async function command(name,executable,args,cwd=root){
 console.log(JSON.stringify({phase:name}));
 const start=performance.now(),r=await captureProcess(executable,args,{cwd,timeout:300000});
 await save(name+'.log',r.output);assert.equal(r.failure,null,name);assert.equal(r.exitCode,0,name+': inspect '+name+'.log');
 steps.push({name,wallSeconds:(performance.now()-start)/1000,command:{executable,arguments:args}});await publish();return r.output;
}
function jsonOutput(text){const last=text.trim().split(/\r?\n/).filter(line=>line.startsWith('{')).at(-1);assert.ok(last);return JSON.parse(last);}
const escapeXml=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
try{
 await mkdir(output,{recursive:true});await publish();
 const audit=jsonOutput(await command('audit','pwsh',['-NoProfile','-File',tool+'/audit.ps1','-PackageDirectory',packageDirectory,'-SourceRoot',root]));
 assert.equal(audit.completed,true);assert.equal(audit.packageDependencies,0);await save('audit.json',JSON.stringify(audit,null,2)+'\n');report.audit=audit;
 for(const file of[audit.packageFile,audit.symbolFile])await save('feed/'+file,await readFile(path.join(packageDirectory,file)));
 assert.equal(sha256(await readFile(output+'/feed/'+audit.packageFile)),audit.packageSha256);
 assert.equal(sha256(await readFile(output+'/feed/'+audit.symbolFile)),audit.symbolSha256);
 const readme=await readFile(root+'/README.md','utf8'),sample=/```csharp\r?\n([\s\S]*?)\r?\n```/.exec(readme);assert.ok(sample);
 const program=(await readFile(tool+'/Consumer.cs.template','utf8')).replace('// README_SAMPLE',sample[1].replace(/^using Lokad\.TikZ;\s*/,''));
 await save('readme-sample.cs',sample[1]);
 const ids=['flowchart-draw-color','flowchart-styled-labels','network-math-labels','network-smooth-plot','flowchart-definitions','flowchart-arc-order','flowchart-fill-rules'],consumers={};
 for(const kind of['source','packed']){
  const consumer=output+'/'+kind;await mkdir(consumer);
  const reference=kind==='packed'?`<PackageReference Include="Lokad.TikZ" Version="${escapeXml(audit.version)}" />`:
   `<ProjectReference Include="${escapeXml(root+'/src/Lokad.TikZ/Lokad.TikZ.csproj')}" />`;
  await save(kind+'/Consumer.csproj',`<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable><ManagePackageVersionsCentrally>false</ManagePackageVersionsCentrally><IsPackable>false</IsPackable></PropertyGroup><ItemGroup>${reference}</ItemGroup></Project>\n`);
  await save(kind+'/Program.cs',program);
  await save(kind+'/NuGet.Config',`<configuration><packageSources><clear/><add key="checked-package" value="${escapeXml(output+'/feed')}"/></packageSources></configuration>\n`);
  await command(kind+'-restore','dotnet',['restore',consumer+'/Consumer.csproj','--configfile',consumer+'/NuGet.Config','--packages',consumer+'/packages']);
  const assetBytes=await readFile(consumer+'/obj/project.assets.json'),assets=JSON.parse(assetBytes);
  if(kind==='packed'){
   assert.deepEqual(Object.keys(assets.libraries),['Lokad.TikZ/'+audit.version]);
   assert.equal(assets.libraries['Lokad.TikZ/'+audit.version].type,'package');
   assert.deepEqual(Object.keys(assets.packageFolders).map(folder=>path.resolve(folder)),[path.resolve(consumer+'/packages')]);
   const restored=consumer+'/packages/lokad.tikz/'+audit.version+'/lokad.tikz.'+audit.version+'.nupkg';
   assert.equal(sha256(await readFile(restored)),audit.packageSha256,'Consumer restored another package');
  }
  await save(kind+'/project-assets.json',assetBytes);
  const result=jsonOutput(await command(kind+'-consumer','dotnet',['run','--project',consumer+'/Consumer.csproj','-c','Release','--no-restore','--',...ids.map(id=>root+'/tests/Fixtures/Diagrams/'+id+'.tikz')]));
  assert.equal(result.completed,true);assert.deepEqual(result.records.map(item=>item.id),ids);assert.equal(result.productionAssemblySha256,audit.productionAssemblySha256);
  await save(kind+'-consumer.json',JSON.stringify(result,null,2)+'\n');consumers[kind]=result;
 }
 assert.deepEqual(consumers.packed,consumers.source,'Packed output differs from current source consumer');report.consumer=consumers.packed;
 if(flags.length){
  report.controls=jsonOutput(await command('archive-controls','pwsh',['-NoProfile','-File',tool+'/self-test.ps1','-PackageDirectory',output+'/feed','-SourceRoot',root,'-OutputDirectory',output+'/controls']));
  assert.equal(report.controls.completed,true);assert.equal(report.controls.checkedPackageSha256,audit.packageSha256);
  assert.deepEqual(report.controls.controls.map(c=>c.name),['missing-xml','dependency','changed-dll','development-asset']);
  for(const control of report.controls.controls){assert.equal(control.passed,true);const file='controls/'+control.name+'/'+audit.packageFile,bytes=await readFile(output+'/'+file);assert.equal(sha256(bytes),control.mutatedPackageSha256);await save(file,bytes);}
 }
 for(const[file,digest]of Object.entries(artifacts))assert.equal(sha256(await readFile(output+'/'+file)),digest);
 report.completed=true;report.wallSeconds=(performance.now()-started)/1000;await publish();
 console.log(JSON.stringify({completed:true,report:path.relative(root,output+'/report.json').replaceAll('\\','/'),sha256:sha256(await readFile(output+'/report.json')),wallSeconds:report.wallSeconds}));
}catch(error){report.error=error.message;report.wallSeconds=(performance.now()-started)/1000;await publish();console.log(JSON.stringify({completed:false,report:path.relative(root,output+'/report.json').replaceAll('\\','/'),sha256:sha256(await readFile(output+'/report.json'))}));console.error(error.stack);process.exitCode=1;}
