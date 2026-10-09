// Controls for the new native outline/registration gaps; generic artifact and
// process controls remain in the existing shared suites.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createRenderer} from './compare.mjs';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {buildMathNativeVariants} from './math-label-native-svg.mjs';

assert.equal(process.argv.length,5,'Usage: node tools/TikzVisual/math-label-native-self-test.mjs <owned-event-directory> --out artifacts/...');
assert.equal(process.argv[3],'--out');
const directory=await outputPath(path.resolve(root,process.argv[2])),output=await outputPath(path.resolve(root,process.argv[4]));
const derivation=JSON.parse(await readFile(path.join(directory,'derivation.json'))),inputs={};
assert.equal(derivation.comparisonKind,'oracle-only-math-events');assert.equal(derivation.converterInvoked,false);
for(const[file,digest]of Object.entries(derivation.evidence.artifacts)){
 assert.ok(!path.isAbsolute(file)&&!file.split(/[\\/]/).includes('..'));
 const bytes=await readFile(path.join(directory,file));assert.equal(sha256(bytes),digest);inputs[file]=digest;
}
const id='math-atom-contract',base=path.join(directory,id),atlases={};
const events=JSON.parse(await readFile(path.join(base,'events.json'))),measurements=JSON.parse(await readFile(path.join(base,'measurements.json')));
const reference=await readFile(path.join(base,'oracle.svg'),'utf8'),first=events.marks.find(m=>m.kind==='glyph');
for(const font of new Set(events.nodes.flatMap(n=>n.glyphs.map(g=>g.font))))atlases[font]=await readFile(path.join(base,'fonts',font+'.svg'),'utf8');
const renderer=await createRenderer(),controls=[],artifacts={};
try{
 await buildMathNativeVariants(renderer,{reference,events,measurements,atlases});
 for(const name of ['changed-selected-outline','missing-selected-outline','changed-alias-scale','cyclic-alias','changed-node-transform','changed-native-text-anchor']){
  const input={reference,events:structuredClone(events),measurements:structuredClone(measurements),atlases:{...atlases}};
  if(name.includes('selected-outline')){
   input.atlases[first.font]=await renderer.page.evaluate(({text,slot,remove})=>{
    const doc=new DOMParser().parseFromString(text,'image/svg+xml'),p=doc.getElementById('g0-'+slot);if(!p)throw Error('Missing control outline.');
    if(remove)p.remove();else p.setAttribute('d',p.getAttribute('d').replace(/[-+]?(?:\d*\.?\d+)/,n=>String(Number(n)+1)));
    return new XMLSerializer().serializeToString(doc);
   },{text:input.atlases[first.font],slot:first.slot,remove:name==='missing-selected-outline'});
  }else if(name==='changed-native-text-anchor'){
   input.measurements.anchors.find(a=>a.name===first.node&&a.anchor==='text').xSp+=65536;
  }else{
   input.reference=await renderer.page.evaluate(({text,name})=>{
    const doc=new DOMParser().parseFromString(text,'image/svg+xml');
    if(name==='changed-node-transform'){
     const bridge=[...doc.querySelectorAll('g')].find(g=>g.getAttribute('transform')?.startsWith('scale(-1.00375'));
     let parent=bridge.parentElement;while(parent&&!parent.hasAttribute('transform'))parent=parent.parentElement;
     if(!parent)throw Error('Missing controlled node frame.');parent.setAttribute('transform',parent.getAttribute('transform')+'translate(.01 0)');
    }else{
     const alias=doc.querySelector('defs use');if(!alias)throw Error('Missing controlled outline alias.');
     if(name==='changed-alias-scale')alias.setAttribute('transform','scale(.7)');
     else alias.setAttributeNS('http://www.w3.org/1999/xlink','href','#'+alias.id);
    }
    return new XMLSerializer().serializeToString(doc);
   },{text:input.reference,name});
  }
  let reason=null;try{await buildMathNativeVariants(renderer,input);}catch(error){reason=error.message;}
  assert.ok(reason,'Native corruption was accepted: '+name);controls.push({name,rejected:true,reason});
 }
 const moduleHashes={};for(const file of ['tools/TikzVisual/math-label-native-self-test.mjs','tools/TikzVisual/math-label-native-svg.mjs',
  'tools/TikzVisual/shape-frame-math.mjs','tools/TikzVisual/compare.mjs'])moduleHashes[file]=sha256(await readFile(path.join(root,file)));
 await writeArtifact(output,'report.json',JSON.stringify({schemaVersion:1,role:'math-native-outline-and-registration-controls',completed:true,
  converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
  inputs,moduleHashes,controls,passed:controls.length===6},null,2)+'\n',artifacts);
 console.log(JSON.stringify({controls:controls.length,passed:true,report:path.relative(root,path.join(output,'report.json')),sha256:artifacts['report.json']}));
}finally{await renderer.browser.close();}
