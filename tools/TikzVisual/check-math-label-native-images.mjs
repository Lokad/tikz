// Separate saved-sample check; raw differences are evidence, never allowances.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadCalcSavedReport} from './calc-saved-images.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {root,sha256} from './shape-oracle-bundle.mjs';
import {mathNativeEncodingIds} from './math-label-native-svg.mjs';

export async function checkMathNativeImages(file) {
 const bundle=await loadCalcSavedReport(file,'math-label-native-image-iteration'),r=bundle.report;
 assert.equal(r.converterInvoked,false);assert.equal(r.nativeToolInvoked,false);
 const styled=r.cases.length===1&&r.cases[0].id==='flowchart-styled-labels';
 assert.deepEqual(r.cases.map(c=>c.id),styled?['flowchart-styled-labels']:['network-math-labels','math-label-contract','math-atom-contract']);
 for(const[file,digest]of Object.entries(r.sources))assert.equal(sha256(await readFile(path.join(root,file))),digest,'Changed native image tool: '+file);
 assert.equal(sha256(bundle.files.get('events/derivation.json')),r.nativeDerivationSha256);
 const compare=createShapeRasterMetrics().compare,decodedChecks=[];let decodedPairs=0,views=0;
 for(const c of r.cases){
  const frame=bundle.json(c.id+'/native-frame.json');
  assert.equal(frame.converterInvoked,false);assert.equal(frame.placementChecks.length,c.glyphs+c.rules);
  assert.deepEqual(frame.variants.map(v=>v.id),mathNativeEncodingIds);
  assert.deepEqual(c.views.map(v=>v.id),mathNativeEncodingIds);
  for(const v of c.views){
   const prefix=c.id+'/'+v.id+'/',report=bundle.json(prefix+'report.json');
   assert.deepEqual(report.primary.checks,v.checks);assert.equal(v.checks.length,6);views+=v.checks.length;
   assert.deepEqual(v.checks.map(c=>[c.scale,c.background??'transparent']),[[1,'transparent'],[1,'white'],[1,'black'],[4,'transparent'],[4,'white'],[4,'black']]);
   for(const scale of [1,4]){
    const suffix=scale===1?'':'-4x',a=bundle.png(prefix+'reference'+suffix+'.png'),b=bundle.png(prefix+'actual'+suffix+'.png');
    assert.equal(a.width,b.width);assert.equal(a.height,b.height);
    assert.equal(a.width,report.camera.width*scale);assert.equal(a.height,report.camera.height*scale);
    const independent=compare(a.rgba,b.rgba,{width:a.width,height:a.height,scale,background:'transparent',maskThreshold:16});
    const declared=v.checks.find(c=>c.scale===scale&&!c.background);assert.ok(declared);
    assert.equal(independent.premultipliedChangedPixels,declared.changedPixels);
    assert.equal(independent.maxPremultipliedChannelError,declared.maxChannelError);
    assert.equal(independent.meanForegroundChannelError,declared.meanForegroundError);
    assert.equal(independent.foregroundPixels,declared.foregroundPixels);
    // The legacy renderer uses four-neighbor connectivity and chamfer edges;
    // the independent reader uses eight neighbors and Euclidean edges. Keep
    // both observations separate; the shared raw sample metrics agree above.
    decodedChecks.push({caseId:c.id,encoding:v.id,scale,rawSampleMetricsAgree:true,
     independentTopology:independent.topology,
     rendererTopology:{connectivity:4,referenceComponents:declared.referenceComponents,actualComponents:declared.actualComponents,
      edgeMetric:declared.edgeMetric,maxEdgeDisplacementPixels:declared.maxEdgeDisplacementPixels}});
    decodedPairs++;
   }
  }
 }
 assert.equal(views,styled?48:144);assert.equal(decodedPairs,styled?16:48);
 return{reportSha256:bundle.sha256,views,independentlyDecodedTransparentPairs:decodedPairs,decodedChecks,approvedImagePolicy:false,imageConformanceClaim:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,3,'Usage: node tools/TikzVisual/check-math-label-native-images.mjs <exact-report-path>');
 console.log(JSON.stringify(await checkMathNativeImages(path.resolve(root,process.argv[2]))));
}
