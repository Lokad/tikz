// Native-only iteration evidence for the declared math-label image gap.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRenderer,compareBundle} from './compare.mjs';
import {root,sha256,writeArtifact,outputPath} from './shape-oracle-bundle.mjs';
import {captureProcess} from './qualification-process.mjs';
import {loadCalcSavedReport} from './calc-saved-images.mjs';
import {buildMathNativeVariants,mathNativeEncodingIds} from './math-label-native-svg.mjs';
import {checkMathNativeImages} from './check-math-label-native-images.mjs';

const args=process.argv.slice(2);
const styled=args[0]==='--case'&&args[1]==='flowchart-styled-labels';
if(styled)args.splice(0,2);
assert.ok(args.length===0||args.length===2&&args[0]==='--out','Usage: node tools/TikzVisual/math-label-native-images.mjs [--case flowchart-styled-labels] [--out artifacts/...]');
const output=path.resolve(root,args[1]??'artifacts/math-native-image/run-'+randomUUID());await outputPath(output);
const artifacts={},cases=[],sources={};
const save=(file,bytes)=>writeArtifact(output,file,bytes,artifacts);
const json=(file,value)=>save(file,JSON.stringify(value,null,2)+'\n');
const files=['tools/TikzVisual/math-label-native-images.mjs','tools/TikzVisual/math-label-native-svg.mjs',
 'tools/TikzVisual/shape-frame-math.mjs','tools/TikzVisual/shape-oracle-bundle.mjs','tools/TikzVisual/qualification-process.mjs',
 'tools/TikzVisual/compare.mjs','tools/TikzVisual/browser-profile.json','tools/TikzVisual/package-lock.json','tools/TikzVisual/calc-saved-images.mjs',
 'tools/TikzVisual/check-math-label-native-images.mjs','tools/TikzVisual/calc-png.mjs','tools/TikzVisual/shape-raster-metrics.mjs'];
for(const file of files)sources[file]=sha256(await readFile(path.join(root,file)));
const captured=await captureProcess('dotnet',['run','--project','tools/TikzShapeCalibration','-c','Release','--','derive-math-events',
 ...(styled?['--case','flowchart-styled-labels']:[]),'--out',path.relative(root,path.join(output,'events'))],{cwd:root,timeout:180000});
await save('commands/native-events.log',captured.output);assert.equal(captured.failure,null);assert.equal(captured.exitCode,0,'Native event binding failed.');
const derivationBytes=await readFile(path.join(output,'events/derivation.json')),derivation=JSON.parse(derivationBytes);
assert.equal(derivation.comparisonKind,'oracle-only-math-events');assert.equal(derivation.completed,true);
assert.equal(derivation.converterInvoked,false);assert.equal(derivation.nativeToolInvoked,false);
assert.equal(derivation.approvedImagePolicy,false);assert.equal(derivation.imageConformanceClaim,false);
assert.ok(derivation.evidence.frameworkReferences.every(n=>n==='System'||n.startsWith('System.')),'Unexpected native oracle dependency.');
assert.deepEqual(derivation.cases,styled?[{id:'flowchart-styled-labels',nodes:9,glyphs:75,rules:2,driverChecks:176}]:
 [{id:'network-math-labels',nodes:10,glyphs:44,rules:2,driverChecks:116},
 {id:'math-label-contract',nodes:26,glyphs:109,rules:15,driverChecks:330},
 {id:'math-atom-contract',nodes:28,glyphs:306,rules:20,driverChecks:748}]);
await save('events/derivation.json',derivationBytes);
for(const[file,digest]of Object.entries(derivation.evidence.artifacts)){
 assert.ok(!path.isAbsolute(file)&&!file.split(/[\\/]/).includes('..'));
 const bytes=await readFile(path.join(output,'events',file));assert.equal(sha256(bytes),digest,'Changed native input: '+file);await save('events/'+file,bytes);
}
for(const[file,digest]of Object.entries(derivation.evidence.toolHashes)){
 assert.equal(sha256(await readFile(path.join(root,file))),digest,'Changed native binding tool: '+file);sources[file]=digest;
}
let renderer;
try{
 renderer=await createRenderer();
 for(const record of derivation.cases){
  const directory=path.join(output,'events',record.id);
  const reference=await readFile(path.join(directory,'oracle.svg'),'utf8'),source=await readFile(path.join(directory,'source.tikz'),'utf8');
  const events=JSON.parse(await readFile(path.join(directory,'events.json'))),measurements=JSON.parse(await readFile(path.join(directory,'measurements.json')));
  const fontIds=[...new Set(events.nodes.flatMap(n=>n.glyphs.map(g=>g.font)))],atlases={};
  for(const font of fontIds)atlases[font]=await readFile(path.join(directory,'fonts',font+'.svg'),'utf8');
  const frame=await buildMathNativeVariants(renderer,{reference,events,measurements,atlases});
  assert.deepEqual(frame.variants.map(v=>v.id),mathNativeEncodingIds);
  await json(record.id+'/native-frame.json',{...frame,variants:frame.variants.map(({svg,...v})=>v)});
  const views=[];
  for(const variant of frame.variants){
   const prefix=record.id+'/'+variant.id+'/',folder=path.join(output,prefix);
   await save(prefix+'reference.svg',reference);await save(prefix+'actual.svg',variant.svg);await save(prefix+'source.tikz',source);
   // Native events have label identities, not converter source spans. Keep
   // those identities in native-frame.json; generic crops remain unattributed.
   await json(prefix+'actual-scene.json',{paths:[]});
   await json(prefix+'comparison-input.json',{schemaVersion:1,caseId:record.id+'-'+variant.id,actualLabel:'Native-only '+variant.id,
    actualUnits:'cssPixels',referenceMode:'frozen-native-original-driver',referenceOriginBp:frame.origin,exactPrimary:true,
    numericTolerancePixels:0,numeric:{passed:true,checks:[],note:'Original SVG/DVI quantities and selected native atlas contours independently bound; no image allowance.'}});
   await json(prefix+'provenance.json',{schemaVersion:1,converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
    sourceSha256:sha256(Buffer.from(source)),registration:'Original native physical origin and root; no fitting or nudging.'});
   const compared=await compareBundle(folder,renderer);
   for(const file of [...Object.keys(compared.artifacts),'report.json','index.html'])await save(prefix+file,await readFile(path.join(folder,file)));
   const primary=compared.primary.checks;
   assert.equal(primary.length,6);
   views.push({id:variant.id,viewer:prefix+'index.html',primaryExact:compared.primary.passed,dimensionsExact:compared.dimensions.passed,checks:primary});
   const supersampled=primary.find(c=>c.scale===4&&!c.background);
   console.log(record.id+'/'+variant.id+': '+supersampled.changedPixels+' raw changed pixels at 4x.');
  }
  cases.push({...record,outlineChecks:frame.outlineChecks,placementChecks:frame.placementChecks,views});
 }
 for(const[file,digest]of Object.entries(sources))assert.equal(sha256(await readFile(path.join(root,file))),digest,'Changed tool source: '+file);
 await json('report.json',{schemaVersion:1,role:'math-label-native-image-iteration',phase:'complete',completed:true,converterInvoked:false,nativeToolInvoked:false,
  approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',registration:'Frozen original native SVG origin; unchanged paths and paint order.',
  nativeDerivationSha256:sha256(derivationBytes),sources,renderer:renderer.identity,cases,artifacts});
 const owned=await loadCalcSavedReport(path.join(output,'report.json'),'math-label-native-image-iteration');
 assert.equal(owned.report.cases.length,styled?1:3);
 await json('independent-check.json',await checkMathNativeImages(owned.file));
 console.log(JSON.stringify({report:path.relative(root,owned.file).replaceAll('\\','/'),sha256:owned.sha256,views:styled?48:144,approvedImagePolicy:false}));
}finally{await renderer?.browser.close();}
