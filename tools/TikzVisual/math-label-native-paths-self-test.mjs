// Controls for integer path ownership, placement and conservative bounds only.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root,sha256,writeArtifact,outputPath} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport} from './calc-saved-images.mjs';
import {bindMathNativePaths} from './math-label-native-paths.mjs';
import {mathPathBoundContract,validateMathInspectionFrame} from './check-math-label-framing.mjs';
import {mathFramingCases} from './math-label-framing.mjs';
import {parseArrowLog} from './arrow-log.mjs';
const args=process.argv.slice(2);assert.ok(args.length===3&&args[1]==='--out');
const owned=await loadCalcSavedReport(path.resolve(root,args[0]),'math-label-framing-image-iteration'),output=await outputPath(path.resolve(root,args[2])),controls=[];
for(const c of mathFramingCases){
 const frame=owned.json(c.id+'/frame.json'),scene=owned.json('public/'+c.id+'/actual-scene.json');
 validateMathInspectionFrame(frame,c,owned.json('events/'+c.id+'/measurements.json'),owned.json(c.id+'/supplement.json'),owned.json(c.id+'/path-supplement.json'));
 assert.equal(mathPathBoundContract(frame,scene).passed,true);assert.ok(owned.json(c.id+'/numeric.json').checks.filter(c=>c.name.startsWith('root.')).every(c=>c.passed));
 controls.push({name:c.id+'-integer-path-root-and-bounds',passed:true,rejected:false});
}
const id='network-math-labels',frame=owned.json(id+'/frame.json'),scene=owned.json('public/'+id+'/actual-scene.json'),supplement=owned.json(id+'/supplement.json'),native=owned.json(id+'/path-supplement.json');
for(const name of ['wrong-path-owner','missing-integer-path','changed-integer-endpoint','changed-native-pen','changed-native-tip-placement']){
 const changed=structuredClone(native);
 if(name==='wrong-path-owner')changed.sourceSha256='0'.repeat(64);
 if(name==='missing-integer-path')changed.metrics.paths.shift();
 if(name==='changed-integer-endpoint')changed.metrics.paths[0].segments[0].xSp+=65536;
 if(name==='changed-native-pen')changed.metrics.paths[0].lineWidthSp++;
 if(name==='changed-native-tip-placement')changed.metrics.placements[0].xSp+=65536;
 assert.throws(()=>bindMathNativePaths(changed,frame.paintRecords.map(p=>({...p,kind:'path'})),supplement),undefined,name);
 controls.push({name,passed:true,rejected:true});
}
for(const name of ['omitted-shaft-ink','unexplained-straight-padding','changed-local-geometry','changed-public-pen','changed-tip-transform','missing-tip-transforms','unbounded-global-padding']){
 const changed=structuredClone(scene),shaft=changed.paths[5];
 if(name==='omitted-shaft-ink')shaft.inkBounds.minY=0;
 if(name==='unexplained-straight-padding')shaft.inkBounds.minX--;
 if(name==='changed-local-geometry')shaft.geometryBounds.maxX++;
 if(name==='changed-public-pen')shaft.paint.width++;
 if(name==='changed-tip-transform')changed.pathTransforms[6].e++;
 if(name==='missing-tip-transforms')delete changed.pathTransforms;
 if(name==='unbounded-global-padding')changed.inkBounds.minX-=100;
 assert.equal(mathPathBoundContract(frame,changed).passed,false,name);
 controls.push({name,passed:true,rejected:true});
}
// The same bounded reader rejects a glyph-free synthetic log without arrows
// by default. Only the explicit math contract option admits this observation.
const noArrow=['ARROW-PGF 3.1.11a|END','ARROW-INPUT 1|draw,|26214|0|0|END',
 'ARROW-SEG input-1|move|0|0|END','ARROW-SEG input-1|line|65536|0|END',
 'ARROW-PATH 1|shaft|1|0|26214|END','ARROW-SEG path-1|move|0|0|END','ARROW-SEG path-1|line|65536|0|END',
 'ARROW-PAINT 1|shaft|stroke|END','ARROW-EVENT 1|path|1|END','ARROW-BOUNDS -13107|-13107|78643|13107|END',
 'ARROW-BOX 91750|26214|0|END'].join('\n');
assert.throws(()=>parseArrowLog(noArrow));
assert.equal(parseArrowLog(noArrow,{allowNoArrows:true}).templates.length,0);
controls.push({name:'no-arrow-opt-in-preserves-default-rejection',passed:true,rejected:true});
const sources={};for(const file of ['math-label-native-paths-self-test.mjs','math-label-native-paths.mjs','check-math-label-framing.mjs','arrow-log.mjs','arrow-driver-state.mjs'])
 sources['tools/TikzVisual/'+file]=sha256(await readFile(path.join(root,'tools/TikzVisual',file)));
assert.equal(controls.length,16);
const report={schemaVersion:1,role:'math-native-path-and-bounds-controls',phase:'complete',completed:true,passed:true,controls,sources,inputReportSha256:owned.sha256,
 converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending'};
await writeArtifact(output,'report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,controls:controls.length,report:path.relative(root,path.join(output,'report.json')),sha256:sha256(await readFile(path.join(output,'report.json')))}));
