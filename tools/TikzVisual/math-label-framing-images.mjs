// Iteration diagnostics for declared framing and individual-mark coverage gaps.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';
import {root,sha256,writeArtifact,outputPath} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport} from './calc-saved-images.mjs';
import {buildMathNativeVariants} from './math-label-native-svg.mjs';
import {deriveMathFraming,mathFramingCases,withMathNaturalRoot} from './math-label-framing.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {checkMathFramingImages,mathFramingNumeric} from './check-math-label-framing.mjs';

const args=process.argv.slice(2);
assert.ok(args.length===4&&args[2]==='--out','Usage: math-label-framing-images.mjs <owned-native-image-report> <owned-public-export-report> --out artifacts/...');
const output=await outputPath(path.resolve(root,args[3])),artifacts={},sources={},cases=[];
const save=(file,bytes)=>writeArtifact(output,file,bytes,artifacts),json=(file,value)=>save(file,JSON.stringify(value,null,2)+'\n');
const nativeOwned=await loadCalcSavedReport(path.resolve(root,args[0]),'math-label-native-image-iteration');
const publicOwned=await loadCalcSavedReport(path.resolve(root,args[1]),'math-label-candidate-export');
const nativeFiles=Object.fromEntries(Object.entries(nativeOwned.report.artifacts).filter(([file])=>file.startsWith('events/')));
for(const file of Object.keys(nativeFiles))await save(file,nativeOwned.files.get(file));
await save('inputs/native-report.json',nativeOwned.bytes);
await save('inputs/public-report.json',publicOwned.bytes);
for(const [file,bytes] of publicOwned.files)await save('public/'+file,bytes);
for(const [file,digest] of Object.entries(publicOwned.json('candidate-source-hashes.json'))){
 assert.equal(sha256(await readFile(path.join(root,file))),digest,'Public export does not describe current source: '+file);sources[file]=digest;
}
for(const file of ['math-label-framing-images.mjs','math-label-framing.mjs','math-label-native-svg.mjs','check-math-label-framing.mjs',
 'math-label-native-paths.mjs','diagram-native-root.mjs','arrow-log.mjs','arrow-driver-state.mjs','arrow-native-frame.mjs','edge-oracle.mjs',
 'edge-oracle-pair.mjs','edge-oracle-frame.mjs','edge-trial-images.mjs','shape-frame-math.mjs','shape-image-pair.mjs',
 'shape-raster-metrics.mjs','calc-png.mjs','calc-saved-images.mjs','shape-oracle-bundle.mjs','compare.mjs','browser-profile.json','package-lock.json']){
 const name='tools/TikzVisual/'+file;sources[name]=sha256(await readFile(path.join(root,name)));
}
const renderer=await createRenderer();
try{
 await installShapeMetrics(renderer);
 for(const declared of mathFramingCases){
  const id=declared.id,prefix='events/'+id+'/',events=nativeOwned.json(prefix+'events.json'),measurements=nativeOwned.json(prefix+'measurements.json');
  const reference=nativeOwned.files.get(prefix+'oracle.svg').toString(),atlases={};
  for(const font of new Set(events.nodes.flatMap(n=>n.glyphs.map(g=>g.font))))atlases[font]=nativeOwned.files.get(prefix+'fonts/'+font+'.svg').toString();
  const native=await buildMathNativeVariants(renderer,{reference,events,measurements,atlases,includeGeometry:true});
  for(const v of native.variants)assert.equal(sha256(Buffer.from(v.svg)),nativeOwned.report.artifacts[id+'/'+v.id+'/actual.svg'],'Existing native encoding changed.');
  const supplementFile='tests/Reference/MathLabels/native-layout/'+id+'/framing.json',supplementBytes=await readFile(path.join(root,supplementFile));
  sources[supplementFile]=sha256(supplementBytes);await save(id+'/supplement.json',supplementBytes);
  const pathFile='tests/Reference/MathLabels/native-layout/'+id+'/paths.json',pathBytes=await readFile(path.join(root,pathFile));
  sources[pathFile]=sha256(pathBytes);await save(id+'/path-supplement.json',pathBytes);
  const frame=await deriveMathFraming(renderer,{caseId:id,reference,events,measurements,supplement:JSON.parse(supplementBytes),native,pathSupplement:JSON.parse(pathBytes)});
  await json(id+'/frame.json',frame);
  const nativeSvg=await withMathNaturalRoot(renderer,native.variants.find(v=>v.id==='atlas-integer-6').svg,frame);
  await save(id+'/native.svg',nativeSvg);
  const scene=publicOwned.json(id+'/actual-scene.json'),actual=publicOwned.files.get(id+'/actual.svg').toString();
  assert.equal(sha256(Buffer.from(publicOwned.files.get(id+'/source.tikz').toString().replaceAll('\r\n','\n'))),measurements.sourceSha256);
  const numeric=mathFramingNumeric(frame,scene,actual,measurements);
  await json(id+'/numeric.json',numeric);
  const row={id,counts:frame.counts,numericPassed:numeric.passed,views:[]};cases.push(row);
  // Four affected views per pair during iteration; final acceptance owns all
  // backgrounds, source recaptures, image policies and both PDF routes.
  for(const view of [{frame:'natural',scale:1,background:'white'},{frame:'expanded',scale:1,background:'white'},
   {frame:'natural',scale:4,background:'transparent'},{frame:'expanded',scale:4,background:'transparent'}]){
   for(const [kind,svg] of [['native',nativeSvg],['candidate',actual]]){
    const key=id+'/'+kind+'/'+view.frame+'-'+view.scale+'x-'+view.background;
    const measured=await measureEdgeTrialPrimary(renderer,{reference,actual:svg,leftIsDriver:true,origin:frame.origin,
     camera:frame.camera,regions:frame.regions,allowMathMarks:true,...view,cropLimit:4,
     cropRegionIds:id==='math-atom-contract'?['label-negativeSpace','label-assembledRoot','label-largeAssembledRoot']:[],
     referenceLabel:'Frozen native driver',rightLabel:kind==='native'?'Native integer outlines':'Fresh public converter'});
    assert.equal(measured.repeat.rawChangedPixels,0);assert.equal(measured.actualRepeat.rawChangedPixels,0);
    const images={},crops=[];
    for(const [name,png] of Object.entries(measured.images)){images[name]=key+'-'+name+'.png';await save(images[name],Buffer.from(png,'base64'));}
    for(const crop of measured.crops){const links={};
     for(const [name,png] of Object.entries({...crop.paired,sheet:crop.sheet})){links[name]=key+'-'+crop.id+'-'+name+'.png';await save(links[name],Buffer.from(png,'base64'));}
     crops.push({id:crop.id,images:links,presentation:crop.presentation});
    }
    const record={kind,...view,metrics:measured.metrics,regions:measured.regions,naturalFrames:measured.naturalFrames,
     repeat:measured.repeat,actualRepeat:measured.actualRepeat,images,crops};
    await json(key+'.json',record);row.views.push({file:key+'.json',kind,...view,rawChangedPixels:record.metrics.rawChangedPixels});
   }
  }
  console.log(id+': '+frame.regions.length+' fixed regions; numeric '+(numeric.passed?'exact':'differences retained')+'.');
 }
 const links=cases.map(c=>'<section><h2>'+c.id+'</h2><p><a href="'+c.id+'/frame.json">Native frames and regions</a> · <a href="'+c.id+'/numeric.json">Source-attributed numeric differences</a> · <a href="public/'+c.id+'/actual-scene.json">Fresh public scene</a></p>'+
  c.views.filter(v=>v.kind==='candidate'&&v.scale===1).map(v=>{const recordPath=v.file.replace(/\.json$/,'-comparison.png');
   return'<p>'+v.frame+' frame</p><a href="'+recordPath+'"><img width="1000" src="'+recordPath+'" alt="Reference, fresh converter and amplified difference"></a>';}).join('')+'</section>').join('\n');
 await save('index.html','<!doctype html><meta charset="utf-8"><title>Math framing iteration</title><h1>Math framing and fixed regions</h1><p>Image qualification pending. White 1× inspection sheets; transparent 4× views and mark crops are linked in <a href="report.json">the report</a>. No fitted registration or approved image allowance.</p>'+links);
 for(const [file,digest] of Object.entries(sources))assert.equal(sha256(await readFile(path.join(root,file))),digest,'Changed source during diagnostics: '+file);
 await json('report.json',{schemaVersion:1,role:'math-label-framing-image-iteration',phase:'complete',completed:true,
  converterInvoked:true,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',
  nativeInputReportSha256:nativeOwned.sha256,publicInputReportSha256:publicOwned.sha256,sources,renderer:renderer.identity,cases,artifacts});
 const checked=await checkMathFramingImages(path.join(output,'report.json'));
 await json('independent-check.json',checked);
 console.log(JSON.stringify({completed:true,report:path.relative(root,path.join(output,'report.json')),sha256:artifacts['report.json'],
  checked:{pairs:checked.pairs,regionChecks:checked.regionChecks,markBoxes:checked.markBoxes,labels:checked.labels}}));
}finally{await renderer.browser.close();}
