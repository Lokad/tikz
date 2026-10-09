// Only controls for the declared math framing, paint and region-ownership gaps.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createRenderer} from './compare.mjs';
import {root,sha256,writeArtifact,outputPath} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport} from './calc-saved-images.mjs';
import {buildMathNativeVariants} from './math-label-native-svg.mjs';
import {deriveMathFraming,mathFramingCases} from './math-label-framing.mjs';
import {validateMathInspectionFrame} from './check-math-label-framing.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';
import {measureEdgeOraclePair} from './edge-oracle-pair.mjs';

const args=process.argv.slice(2);assert.ok(args.length===3&&args[1]==='--out','Usage: math-label-framing-self-test.mjs <owned-framing-report> --out artifacts/...');
const owned=await loadCalcSavedReport(path.resolve(root,args[0]),'math-label-framing-image-iteration'),output=await outputPath(path.resolve(root,args[2]));
const c=mathFramingCases.find(c=>c.id==='math-atom-contract'),prefix='events/'+c.id+'/',renderer=await createRenderer(),atlases={};
const events=owned.json(prefix+'events.json'),measurements=owned.json(prefix+'measurements.json'),reference=owned.files.get(prefix+'oracle.svg').toString();
const supplement=owned.json(c.id+'/supplement.json'),frame=owned.json(c.id+'/frame.json'),controls=[],artifacts={};
const pathSupplement=owned.files.has(c.id+'/path-supplement.json')?owned.json(c.id+'/path-supplement.json'):null;
for(const font of new Set(events.nodes.flatMap(n=>n.glyphs.map(g=>g.font))))atlases[font]=owned.files.get(prefix+'fonts/'+font+'.svg').toString();
const reject=async(name,action)=>{let reason=null;try{await action();}catch(e){reason=e.message;}assert.ok(reason,'Math corruption accepted: '+name);controls.push({name,rejected:true,reason});};
try{
 const native=await buildMathNativeVariants(renderer,{reference,events,measurements,atlases,includeGeometry:true});
 await deriveMathFraming(renderer,{caseId:c.id,reference,events,measurements,supplement,native,pathSupplement});
 validateMathInspectionFrame(frame,c,measurements,supplement,pathSupplement);
 for(const name of ['missing-linewidth-observation','missing-path-paint','reordered-path-paint','changed-pen','omitted-fraction-rule','omitted-empty-label','changed-frame-owner']){
  const input={caseId:c.id,reference,events:structuredClone(events),measurements,supplement:structuredClone(supplement),native:structuredClone(native),pathSupplement};
  const ops=input.native.geometry.operations,pathIndices=ops.flatMap((o,i)=>o.kind==='path'?[i]:[]);
  if(name==='missing-linewidth-observation')input.supplement.lineWidthsSp=[];
  if(name==='missing-path-paint')ops.splice(pathIndices[0],1);
  if(name==='reordered-path-paint')[ops[pathIndices[0]],ops[pathIndices[1]]]=[ops[pathIndices[1]],ops[pathIndices[0]]];
  if(name==='changed-pen')ops[pathIndices[0]].paint['stroke-width']='.5';
  if(name==='omitted-fraction-rule')ops.splice(ops.findIndex(o=>o.kind==='rect'),1);
  if(name==='omitted-empty-label')input.events.nodes=input.events.nodes.filter(n=>n.id!=='negativeSpace');
  if(name==='changed-frame-owner')input.supplement.sourceSha256='0'.repeat(64);
  await reject(name,()=>deriveMathFraming(renderer,input));
 }
 for(const name of ['wrong-region-owner','missing-empty-label-region','omitted-rule-region','changed-region-camera','changed-natural-root','missing-pen-record','reordered-pen-record']){
  const changed=structuredClone(frame);
  if(name==='wrong-region-owner')changed.regions.find(r=>r.kind==='glyph').nodeId='negativeSpace';
  if(name==='missing-empty-label-region')changed.regions=changed.regions.filter(r=>r.id!=='label-negativeSpace');
  if(name==='omitted-rule-region')changed.regions.splice(changed.regions.findIndex(r=>r.kind==='rule'),1);
  if(name==='changed-region-camera')changed.regions[0].rectangle.x++;
  if(name==='changed-natural-root')changed.root.minX-=1;
  if(name==='missing-pen-record')changed.paintRecords.pop();
  if(name==='reordered-pen-record')[changed.paintRecords[0],changed.paintRecords[1]]=[changed.paintRecords[1],changed.paintRecords[0]];
  await reject(name,()=>validateMathInspectionFrame(changed,c,measurements,supplement,pathSupplement));
 }
 await installShapeMetrics(renderer);
 for(const name of ['math-marks-require-opt-in','invalid-rule-rectangle','cyclic-renderer-outline-alias','nonfinite-renderer-outline-alias']){
  const changed=await renderer.page.evaluate(({reference,name})=>{
   const doc=new DOMParser().parseFromString(reference,'image/svg+xml');
   if(name==='invalid-rule-rectangle')doc.querySelector('rect').setAttribute('width','-1');
   if(name.includes('renderer-outline-alias')){
    const alias=doc.querySelector('defs use');if(!alias)throw Error('Missing alias control.');
    if(name==='cyclic-renderer-outline-alias')alias.setAttributeNS('http://www.w3.org/1999/xlink','href','#'+alias.id);
    else alias.setAttribute('transform','scale(1..2)');
   }
   return new XMLSerializer().serializeToString(doc);
  },{reference,name});
  await reject(name,()=>measureEdgeOraclePair(renderer,{reference:changed,actual:native.variants[0].svg,leftIsDriver:true,
   origin:frame.origin,camera:frame.camera,regions:frame.regions,frame:'expanded',scale:1,background:'white',cropLimit:0,
   ...(name==='math-marks-require-opt-in'?{}:{allowMathMarks:true})}));
 }
 const sources={};for(const name of ['math-label-framing-self-test.mjs','math-label-framing.mjs','check-math-label-framing.mjs','math-label-native-svg.mjs','edge-oracle-frame.mjs'])
  sources['tools/TikzVisual/'+name]=sha256(await readFile(path.join(root,'tools/TikzVisual',name)));
 const report={schemaVersion:1,role:'math-framing-and-region-controls',phase:'complete',completed:true,reportSha256:owned.sha256,
  converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',
  controls,sources,passed:controls.length===18};
 await writeArtifact(output,'report.json',JSON.stringify(report,null,2)+'\n',artifacts);
 console.log(JSON.stringify({passed:report.passed,controls:controls.length,report:path.relative(root,path.join(output,'report.json')),sha256:artifacts['report.json']}));
}finally{await renderer.browser.close();}
