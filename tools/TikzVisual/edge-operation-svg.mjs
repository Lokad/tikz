// Native operations only. Preserve full-frame coordinates and original definitions.
import assert from 'node:assert/strict';
import {edgePtToCss} from './edge-oracle.mjs';

export const edgeOperationVariants=['native-pt-short-glyph-six','native-css-six-glyph-six','native-driver-frame'];

export function edgeOperationTargets(metrics,original){
  const targets=original.operations.map((op,ordinal)=>op.kind==='path'
    ?{ordinal,kind:'path',index:op.index,id:'path-'+metrics.driverState.paints[op.index].pathId,svgId:'oracle-path-'+op.index,nativePathId:metrics.driverState.paints[op.index].pathId}
    :{ordinal,kind:'glyph',index:op.index,id:'glyph-'+op.index,svgId:'oracle-glyph-'+op.index});
  assert.equal(targets.length,metrics.driverState.paints.length+original.uses.length);assert.equal(new Set(targets.map(t=>t.id)).size,targets.length);return targets;
}

export async function withEdgeDriverFrame(renderer,semantic,frame){
  const factor=.996264,normalized=4/3,actualScale=factor*normalized;
  const numerical={nativeCssPerPt:edgePtToCss,driverCssPerPt:actualScale,scaleDelta:Math.abs(edgePtToCss-actualScale),
    originBp:frame.origin,basis:'Original driver translate/scale and declared bp-to-CSS normalization. No alignment search.'};
  const svg=await renderer.page.evaluate(({semantic,origin,factor,normalized})=>{
    const d=new DOMParser().parseFromString(semantic,'image/svg+xml'),s=d.documentElement,ns='http://www.w3.org/2000/svg';
    if(d.querySelector('parsererror')||d.doctype)throw Error('Invalid native-semantic SVG.');
    const paths=[...s.querySelectorAll('path')].filter(p=>!p.closest('defs')||p.closest('clipPath'));
    for(const p of paths){if(!/^scale\(/.test(p.getAttribute('transform')??''))throw Error('Missing native pt transform.');
      // Keep a graphics element directly inside clipPath. Nested groups can
      // produce an empty clip even though their matrix arithmetic is valid.
      if(p.closest('clipPath')){p.setAttribute('transform','matrix('+normalized+' 0 0 '+normalized+' '+(-origin.x*normalized)+' '+(-origin.y*normalized)+') translate('+origin.x+' '+origin.y+') scale('+factor+' '+(-factor)+')');continue;}
      const outer=d.createElementNS(ns,'g'),inner=d.createElementNS(ns,'g');
      outer.setAttribute('transform','matrix('+normalized+' 0 0 '+normalized+' '+(-origin.x*normalized)+' '+(-origin.y*normalized)+')');
      inner.setAttribute('transform','translate('+origin.x+' '+origin.y+') scale('+factor+' '+(-factor)+')');
      p.replaceWith(outer);outer.append(inner);inner.append(p);p.removeAttribute('transform');}
    return new XMLSerializer().serializeToString(s);
  },{semantic,origin:frame.origin,factor,normalized});
  return{svg,numerical};
}

export async function isolateEdgeOperation(renderer,source,target,{driver=false}={}){
  const result=await renderer.page.evaluate(({source,target,driver})=>{
    const d=new DOMParser().parseFromString(source,'image/svg+xml'),s=d.documentElement;
    if(d.querySelector('parsererror')||d.doctype)throw Error('Invalid operation source.');
    const definitions=()=>[...s.querySelectorAll('defs path')].filter(p=>!p.closest('clipPath')).map(p=>({id:p.id,d:p.getAttribute('d')}));
    const before=definitions(),drawing=[...s.querySelectorAll('path,use')].filter(p=>!p.closest('defs')&&!p.closest('clipPath'));
    const selected=driver?drawing[target.ordinal]:d.getElementById(target.svgId);
    if(!selected||!drawing.includes(selected)||selected.localName!==(target.kind==='path'?'path':'use'))throw Error('Missing or mismatched native operation.');
    const rootBefore=[s.getAttribute('width'),s.getAttribute('height'),s.getAttribute('viewBox')];
    for(const p of drawing)if(p!==selected)p.remove();
    if(JSON.stringify(before)!==JSON.stringify(definitions()))throw Error('Operation isolation changed glyph definitions.');
    const rootAfter=[s.getAttribute('width'),s.getAttribute('height'),s.getAttribute('viewBox')];
    if(JSON.stringify(rootBefore)!==JSON.stringify(rootAfter))throw Error('Operation isolation changed the frame.');
    return{svg:new XMLSerializer().serializeToString(s),originalDrawingCount:drawing.length,retainedDrawingCount:1,definitionCount:before.length,
      selectedKind:selected.localName,selectedData:selected.getAttribute('d')??selected.getAttribute('href')??selected.getAttributeNS('http://www.w3.org/1999/xlink','href')};
  },{source,target,driver});
  assert.equal(result.retainedDrawingCount,1);return result;
}
