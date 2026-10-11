// Read the pinned native archive using existing blob, path, size and canonical-index checks.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {calcHash,calcEqual} from './calc-saved-images.mjs';
import {decodePathLabelCache,pathLabelCacheBounds,pathLabelCompressedLimit} from './path-label-cache-codec.mjs';
import {mathLabelCacheGroups,verifyMathPortablePart} from './math-label-cache-inputs.mjs';

export function pathLabelCacheDefinition(fixture){
 if(Object.hasOwn(mathLabelCacheGroups,fixture)){
  const styled=fixture.startsWith('styled-labels-');
  return{mathLabels:mathLabelCacheGroups[fixture],fixtures:Object.keys(mathLabelCacheGroups).filter(f=>f.startsWith(styled?'styled-labels-':'math-labels-')).sort(),
   directory:'tests/Reference/'+(styled?'StyledLabels':'MathLabels'),roles:mathLabelCacheGroups[fixture].map(r=>r.role),profileRole:styled?'styled-label-frozen-image-profile':'math-label-frozen-image-profile'};
 }
 const plottingFixtures=['network-coordinate-plot','coordinate-plot-contract','network-function-plot','function-plot-contract','network-smooth-plot','smooth-plot-contract'];
 const arrowColors=['arrow-color-contract','flowchart-draw-color'],arrowColor=arrowColors.includes(fixture),paint=fixture==='flowchart-paint',plotting=plottingFixtures.includes(fixture);
 const functions=['math-functions-contract','network-math-functions'].includes(fixture);
 const definitions=['definitions-contract','flowchart-definitions'].includes(fixture);
 const math=['flowchart-math-macros','math-macro-contract'].includes(fixture),loops=['flowchart-foreach','foreach-contract'].includes(fixture),styles=['flowchart-parameterized','style-contract'].includes(fixture),diagram=arrowColor||paint||plotting||functions||definitions||math||loops||styles||['flowchart-basic','flowchart-transformed','network-bent','flowchart-arc-order','flowchart-fill-rules'].includes(fixture);
 const fixtures=arrowColor?arrowColors:paint?['flowchart-paint']:plotting?plottingFixtures.sort():functions?['math-functions-contract','network-math-functions']:definitions?['definitions-contract','flowchart-definitions']:math?['flowchart-math-macros','math-macro-contract']:loops?['flowchart-foreach','foreach-contract']:styles?['flowchart-parameterized','style-contract']:diagram?['flowchart-arc-order','flowchart-basic','flowchart-fill-rules','flowchart-transformed','network-bent']:['interactions','placement'];assert.ok(fixtures.includes(fixture));
 const directory='tests/Reference/'+(arrowColor?'ArrowColors':paint?'PaintDiagrams':plotting?'Plotting':functions?'MathFunctions':definitions?'Definitions':math?'MathMacros':loops?'Foreach':styles?'Styles':diagram?'Diagrams':'PathLabels');
 const roles=['path-label-native-primary-calibration','path-label-independent-primary-check','path-label-native-pdf-calibration','path-label-independent-pdf-check'];
 if(!diagram)roles.push('path-label-complete-text-sensitivity','path-label-independent-text-check');
 return{diagram,fixtures,directory,roles,profileRole:arrowColor?'arrow-color-frozen-image-profile':paint?'paint-diagram-frozen-image-profile':plotting?'plotting-frozen-image-profile':functions?'math-function-frozen-image-profile':definitions?'definition-frozen-image-profile':math?'math-macro-frozen-image-profile':loops?'foreach-frozen-image-profile':styles?'style-frozen-image-profile':diagram?'diagram-frozen-image-profile':'path-label-frozen-image-profile'};
}

export async function loadPathLabelCache(repositoryRoot,fixture,read=readFile){
 const {fixtures,directory,roles,profileRole,mathLabels}=pathLabelCacheDefinition(fixture);
 const profile=JSON.parse(await read(path.join(repositoryRoot,directory+'/image-profile.json')));
 assert.equal(profile.schemaVersion,1);assert.equal(profile.role,profileRole);
 calcEqual(Object.keys(profile.fixtures).sort(),fixtures);
 const entry=profile.fixtures[fixture],manifest=entry.manifest;
 assert.equal(entry.file,directory+'/'+fixture+'.images.cache.gz');assert.equal(manifest.fixture,fixture);
 assert.equal(manifest.converterInvoked,false);assert.equal(manifest.imageConformanceClaim,false);
 for(const[file,digest]of Object.entries(profile.transportSources))assert.equal(calcHash(await read(path.join(repositoryRoot,file))),digest,'Changed archive transport dependency.');
 const compressed=await read(path.join(repositoryRoot,entry.file));assert.ok(compressed.length<=pathLabelCompressedLimit(fixture));assert.equal(compressed.length,manifest.compressedBytes);
 assert.equal(calcHash(compressed),manifest.compressedSha256,'Unreviewed path-label archive bytes.');
 const bytes=gunzipSync(compressed,{maxOutputLength:pathLabelCacheBounds.decoded});assert.equal(bytes.length,manifest.decodedBytes);assert.equal(calcHash(bytes),manifest.decodedSha256);
 const cache=decodePathLabelCache(bytes,fixture);assert.equal(cache.files.size,manifest.logicalFiles);assert.equal(cache.blobs.size,manifest.uniqueBlobs);assert.equal(cache.logicalBytes,manifest.logicalBytes);
 calcEqual(manifest.reports.map(r=>r.role),roles);const expected=new Set();
 const bundles=[];for(const [i,descriptor]of manifest.reports.entries()){
  if(mathLabels)calcEqual(descriptor,Object.fromEntries(['role','file','sha256'].map(k=>[k,mathLabels[i][k]])));
  else assert.match(descriptor.file,/^artifacts\/path-label-[a-z-]+\/run-[a-f0-9-]+\/report\.json$/);
  const reportBytes=cache.files.get(descriptor.file);
  assert.ok(reportBytes);assert.equal(calcHash(reportBytes),descriptor.sha256);const report=JSON.parse(reportBytes);
  assert.equal(report.schemaVersion,1);assert.equal(report.role,descriptor.role);assert.equal(report.completed,true);assert.equal(report.phase,'complete');
  assert.equal(report.converterInvoked,false);assert.equal(report.nativeToolInvoked,mathLabels?mathLabels[i].nativeToolInvoked:false);assert.equal(report.approvedImagePolicy,false);assert.equal(report.imageConformanceClaim,false);assert.equal(report.imageAdmission,'pending');
  const entries=Object.entries(report.artifacts),files=new Map();assert.ok(entries.length>0&&entries.length<=4096);expected.add(descriptor.file);let total=0;
  for(const[file,digest]of entries){const target=path.posix.dirname(descriptor.file)+'/'+file,item=cache.files.get(target);assert.ok(item,'Missing owned native archive artifact.');
   assert.equal(calcHash(item),digest);total+=item.length;assert.ok(item.length<=100000000&&total<=1000000000);expected.add(target);files.set(file,item);}
  bundles.push({bytes:reportBytes,sha256:descriptor.sha256,report,files,json:file=>JSON.parse(files.get(file))});
 }
 if(mathLabels)verifyMathPortablePart(fixture,bundles);
 calcEqual([...expected].sort(),[...cache.files.keys()].sort(),'Archive contains missing or unowned assets.');return{cache,manifest};
}
