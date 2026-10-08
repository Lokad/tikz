import assert from 'node:assert/strict';
import {calcEqual,calcHash} from './calc-saved-images.mjs';
import {checkCalcNativePaths} from './calc-native-path-checks.mjs';
import {calcPrimaryDefects} from './calc-primary-reference.mjs';
export function readCalcTrialCandidate(bundle,reference){
  assert.equal(bundle.report.converterInvoked,true);assert.equal(bundle.report.nativeToolInvoked,false);
  calcEqual(bundle.report.details,{anchors:25,quantities:50,publicTraceParity:true,numericPassed:true},'Public export summary differs');
  calcEqual(Object.keys(bundle.report.artifacts).sort(),['actual-scene.json','actual.svg','candidate-provenance.json','candidate-source-hashes.json','native-points.json','numeric.json','reference.svg','source.tikz'],'Public export artifact coverage differs');
  assert.equal(calcHash(bundle.files.get('source.tikz')),reference.cache.sourceSha256);assert.equal(calcHash(bundle.files.get('reference.svg')),reference.cache.observerSvgSha256);
  calcEqual(bundle.json('native-points.json'),reference.cache,'Public export native cache differs');
  const scene=bundle.json('actual-scene.json'),factor=96/(72.27*65536),checks=[];
  calcEqual(Object.keys(scene.coordinates).sort(),reference.cache.points.map(p=>p.id).sort(),'Public anchor coverage differs');
  for(const point of reference.cache.points)for(const axis of ['x','y']){
    const actual=Math.round(scene.coordinates[point.id][axis]*(axis==='y'?-1:1)/factor),expected=point[axis+'Sp'];
    assert.equal(actual,expected,'Public native anchor differs: '+point.id+'.'+axis);
    checks.push({name:point.id+'.'+axis,reference:expected,actual,delta:actual-expected,units:'TeX sp',limit:0,passed:true});
  }
  calcEqual(bundle.json('numeric.json'),{schemaVersion:1,passed:true,publicTraceParity:true,checks},'Public numeric export differs from scene');
  const paths=checkCalcNativePaths(reference.primaryFrame.raw.paths,scene),bounds=[];
  const [minX,minY,maxX,maxY]=reference.cache.pictureBoundsSp;
  for(const[name,expected,value]of [['minX',minX,scene.pictureBounds.minX],['minY',minY,-scene.pictureBounds.maxY],
    ['maxX',maxX,scene.pictureBounds.maxX],['maxY',maxY,-scene.pictureBounds.minY],['width',maxX-minX,scene.pictureBounds.width],['height',maxY-minY,scene.pictureBounds.height]]){
    const actual=Math.round(value/factor);assert.equal(actual,expected,'Public native bounds differ: '+name);
    bounds.push({name,reference:expected,actual,units:'TeX sp',limit:0,passed:true});
  }
  assert.equal(scene.pictureBounds.isEmpty,false);calcEqual(scene.inkBounds,scene.pictureBounds,'Fixed opaque fixture ink/picture bounds differ');
  for(const[i,p]of scene.paths.entries()){
    assert.equal(p.svgElementId,'candidate-p'+i);assert.ok(Number.isSafeInteger(p.source.offset)&&p.source.offset>=0&&Number.isSafeInteger(p.source.length)&&p.source.length>0
      &&p.source.offset+p.source.length<=bundle.files.get('source.tikz').toString('utf8').length);
  }
  return{scene,checks,paths,bounds,sourceHashes:bundle.json('candidate-source-hashes.json')};
}
export async function mutateCalcTrialCandidate(renderer,svg,defect,reference,{pdf=false}={}){
  assert.ok(calcPrimaryDefects.some(d=>d.name===defect.name));
  return renderer.page.evaluate(({svg,defect,frame,pdf,origin})=>{
    const d=new DOMParser().parseFromString(svg,'image/svg+xml'),root=d.documentElement;
    if(d.querySelector('parsererror'))throw Error('Invalid public SVG');
    const p=defect.path===undefined?null:d.querySelector('#candidate-p'+defect.path);if(defect.path!==undefined&&!p)throw Error('Missing public mutation path');
    const transform=p?.getAttribute('transform');
    if(['missing-mark','missing-circle'].includes(defect.name))p.remove();
    else if(defect.name==='quarter-pixel-shift')p.setAttribute('transform','translate(0.25 0) '+transform);
    else if(defect.name==='double-width')p.setAttribute('stroke-width','0.8');
    else if(defect.name==='half-opacity')p.setAttribute('stroke-opacity','0.5');
    else if(defect.name==='wrong-color')p.setAttribute('stroke','#ff0000');
    else if(defect.name==='round-cap')p.setAttribute('stroke-linecap','round');
    else if(defect.name==='wrong-unit-scale')p.setAttribute('transform','scale(1.3333333333333333 -1.3333333333333333)');
    else if(defect.name==='wrong-curve-control'){const old=p.getAttribute('d'),changed=old.replace(/C([-\d.]+) ([-\d.]+)/,(_,x,y)=>'C'+(Number(x)+1)+' '+y);
      if(changed===old)throw Error('No public cubic control changed');p.setAttribute('d',changed);}
    else if(defect.name==='cropped-root'){const v=root.getAttribute('viewBox').split(/\s+/).map(Number);v[2]-=3;root.setAttribute('viewBox',v.join(' '));root.setAttribute('width',v[2]+'px');}
    else if(defect.name==='outside-ink'){const mark=d.createElementNS(root.namespaceURI,'path');
      mark.setAttribute('d','M'+(pdf?20-origin.x:frame.camera.x+1)+' '+(pdf?20-origin.y:frame.camera.y+1)+'h2v2h-2Z');mark.setAttribute('fill','#000');root.append(mark);}
    else if(defect.name==='lost-half-clip')p.removeAttribute('clip-path');else throw Error('Unknown public defect');
    return new XMLSerializer().serializeToString(d);
  },{svg,defect,frame:reference.primaryFrame,pdf,origin:reference.registration.camera.origin});
}
export async function controlCalcTrialCandidate(renderer,svg,{opacity}={}){
  return renderer.page.evaluate(({svg,opacity})=>{
    const d=new DOMParser().parseFromString(svg,'image/svg+xml'),root=d.documentElement,ns=root.namespaceURI;
    if(opacity!==undefined)d.querySelector('#candidate-p2').setAttribute('stroke-opacity',String(opacity));
    else{const defs=d.createElementNS(ns,'defs'),clip=d.createElementNS(ns,'clipPath'),border=d.createElementNS(ns,'path');
      clip.setAttribute('id','public-control-half-clip');clip.setAttribute('clipPathUnits','userSpaceOnUse');border.setAttribute('d','M-1000 -1000H28.45274V1000H-1000Z');
      clip.append(border);defs.append(clip);root.prepend(defs);d.querySelector('#candidate-p13').setAttribute('clip-path','url(#public-control-half-clip)');}
    return new XMLSerializer().serializeToString(d);
  },{svg,opacity});
}
