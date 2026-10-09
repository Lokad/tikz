// Fixed native math corpus only. No converter data, font resources or policies.
import assert from 'node:assert/strict';
import {identity,multiply,parseTransform,parsePath,transformSegments,pathBounds,unionBounds} from './shape-frame-math.mjs';

const spToCss=96/(72.27*65536),spToBp=72/(72.27*65536);
const tokens=text=>text.match(/[A-Za-z]|[-+]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:[eE][-+]?\d+)?/g)??[];
const fixed=(v,n)=>{assert.ok(Number.isFinite(v));return (Math.abs(v)<10**(-n)/2?0:v).toFixed(n).replace(/\.?0+$/,'');};
export const mathNativeEncodingIds=['driver-css','driver-flat-12','driver-atlas-12','events-driver-12','events-integer-12','events-integer-6','atlas-integer-12','atlas-integer-6'];

export async function buildMathNativeVariants(renderer,{reference,events,measurements,atlases,includeGeometry=false}) {
 const metadata=await renderer.page.evaluate(({reference,atlases})=>{
  const read=text=>{const doc=new DOMParser().parseFromString(text,'image/svg+xml');if(doc.querySelector('parsererror')||doc.doctype)throw Error('Invalid native XML.');return doc;};
  const doc=read(reference),root=doc.documentElement,global=doc.querySelector('#page1 > g');
  const match=/^translate\(([-\d.]+),([-\d.]+)\)scale\(0\.996264,-0\.996264\)$/.exec(global?.getAttribute('transform')??'');
  if(!match)throw Error('Unexpected original native driver frame.');
  const keys={fill:'#000',stroke:'none','stroke-width':'1','stroke-linecap':'butt','stroke-linejoin':'miter',
   'stroke-miterlimit':'4','stroke-dasharray':'none','stroke-dashoffset':'0','fill-rule':'nonzero','fill-opacity':'1','stroke-opacity':'1'};
  const paint=e=>Object.fromEntries(Object.entries(keys).map(([key,fallback])=>{
   for(let p=e;p&&p!==root;p=p.parentElement){if(p.hasAttribute('opacity'))throw Error('Unexpected native group opacity.');
    if(p.hasAttribute(key))return[key,p.getAttribute(key)];}return[key,fallback];
  }));
  const transforms=e=>{const list=[];for(let p=e;p&&p!==root;p=p.parentElement)if(p.hasAttribute('transform'))list.unshift(p.getAttribute('transform'));return list;};
  const definitions=[...doc.querySelector('defs').children].map(e=>({id:e.id,kind:e.localName,d:e.getAttribute('d'),
   href:[...e.attributes].find(a=>a.localName==='href')?.value,transform:e.getAttribute('transform')}));
  const operations=[...doc.querySelectorAll('path,use,rect')].filter(e=>!e.closest('defs')).map(e=>({
   kind:e.localName,d:e.getAttribute('d'),href:[...e.attributes].find(a=>a.localName==='href')?.value,
   x:e.getAttribute('x'),y:e.getAttribute('y'),width:e.getAttribute('width'),height:e.getAttribute('height'),paint:paint(e),transforms:transforms(e)
  }));
  const outlines=Object.fromEntries(Object.entries(atlases).map(([font,text])=>{
   const atlas=read(text),paths=[...atlas.querySelectorAll('defs path')].map(e=>({id:e.id,d:e.getAttribute('d')}));
   if(paths.length===0||new Set(paths.map(p=>p.id)).size!==paths.length)throw Error('Invalid native atlas identities.');
   return[font,Object.fromEntries(paths.map(p=>[p.id,p.d]))];
  }));
  return{origin:{x:Number(match[1]),y:Number(match[2])},view:root.getAttribute('viewBox').split(/[ ,]+/).map(Number),
   definitions,defs:doc.querySelector('defs').outerHTML,operations,outlines};
 },{reference,atlases});
 const {origin,view}=metadata;assert.equal(view.length,4);assert.ok(view.every(Number.isFinite));
 const root=[(view[0]-origin.x)*4/3,(view[1]-origin.y)*4/3,view[2]*4/3,view[3]*4/3];
 const registration=[4/3,0,0,4/3,-origin.x*4/3,-origin.y*4/3];
 const definitions=new Map(metadata.definitions.map(d=>[d.id,d]));
 const outlineChecks=[],atlasDefinitions=new Map();
 const resolve=(id,chain=[])=>{
  assert.ok(chain.length<=4&&!chain.includes(id),'Cyclic native outline alias.');
  const d=definitions.get(id);assert.ok(d,'Missing native outline.');
  if(d.kind==='path'){assert.equal(d.transform,null);return{d:d.d,scale:1,aliases:0};}
  assert.equal(d.kind,'use');assert.match(d.transform,/^scale\([\d.]+\)$/);
  const resolved=resolve(d.href.slice(1),[...chain,id]);return{...resolved,scale:resolved.scale*Number(d.transform.slice(6,-1)),aliases:resolved.aliases+1};
 };
 for(const mark of events.marks.filter(m=>m.kind==='glyph')) {
  const key=mark.font+'/'+mark.slot;if(atlasDefinitions.has(key))continue;
  const observed=resolve(mark.definition),atlas=metadata.outlines[mark.font]?.['g0-'+mark.slot];assert.ok(atlas,'Missing selected native atlas glyph.');
  const a=tokens(observed.d),b=tokens(atlas);assert.equal(a.length,b.length,'Native outline token coverage differs.');
  parsePath(observed.d);parsePath(atlas);
  let maxErrorBp=0,maxBoundBp=0;
  for(let i=0;i<a.length;i++){
   if(/^[A-Za-z]$/.test(a[i])){assert.equal(a[i],b[i],'Native outline command differs.');continue;}
   assert.ok(!/^[A-Za-z]$/.test(b[i]));
   const error=Math.abs(Number(a[i])*observed.scale-Number(b[i]));
   // Driver outlines and aliases serialize at six decimal places. This bound
   // follows those native encodings; no raster measurements choose its value.
   const bound=.00000051*(1+Math.abs(observed.scale)+Math.abs(Number(a[i]))*observed.aliases);
   assert.ok(error<=bound,'Native atlas outline differs beyond driver serialization: '+key+' token '+i);
   maxErrorBp=Math.max(maxErrorBp,error);maxBoundBp=Math.max(maxBoundBp,bound);
  }
  outlineChecks.push({font:mark.font,slot:mark.slot,definition:mark.definition,aliases:observed.aliases,maxErrorBp,maxBoundBp});
  atlasDefinitions.set(key,{id:'atlas-'+mark.font+'-'+mark.slot,d:atlas});
 }
 const nativeNodes=new Map(events.nodes.map(n=>[n.id,n]));
 const observedNodes=new Map(measurements.nodes.map(n=>[n.name,n]));
 assert.equal(nativeNodes.size,events.nodes.length);assert.equal(observedNodes.size,nativeNodes.size);
 const operations=[],contributions=[],placementChecks=[];let markIndex=0,pathIndex=0;
 for(const op of metadata.operations){
  const matrix=op.transforms.reduce((m,t)=>multiply(m,parseTransform(t)),registration);
  if(op.kind==='path'){
   const segments=parsePath(op.d),bound=pathBounds(transformSegments(segments,matrix));
   operations.push({...op,id:'native-path-'+pathIndex++,matrix});
   contributions.push({id:operations.at(-1).id,kind:'path',bound});continue;
  }
  const mark=events.marks[markIndex++];assert.ok(mark,'Original paint lacks a native event.');
  assert.equal(op.kind,mark.kind==='glyph'?'use':'rect');
  if(op.kind==='use')assert.equal(op.href,'#'+mark.definition);
  const node=nativeNodes.get(mark.node),measured=observedNodes.get(mark.node);assert.ok(node&&measured);
  const [a,b,c,d]=measured.frame.slice(0,4).map(Number);
  const anchors=measurements.anchors.filter(p=>p.name===mark.node&&p.anchor==='text');assert.equal(anchors.length,1);
  const anchor=anchors[0],integer=mark.kind==='glyph'?node.glyphs[mark.index]:node.rules[mark.index];
  const make=(xSp,ySp)=>[a*4/3,-b*4/3,-c*4/3,d*4/3,
   (anchor.xSp+a*xSp-c*ySp)*spToCss,-(anchor.ySp+b*xSp-d*ySp)*spToCss];
  const integerMatrix=make(integer.xSp,integer.ySp);
  const driverMatrix=make(mark.xSp-node.driverOriginXSp,integer.ySp);
  const originalMatrix=multiply(matrix,[1,0,0,1,Number(op.x),Number(op.y)]);
  const id='native-'+mark.kind+'-'+(markIndex-1);
  const rule=mark.kind==='rule'?{width:mark.widthSp*spToBp,height:mark.heightSp*spToBp}:null;
  const atlas=mark.kind==='glyph'?atlasDefinitions.get(mark.font+'/'+mark.slot):null;
  const outlined=mark.kind==='glyph'?resolve(mark.definition):null;
  const boundsFor=m=>mark.kind==='glyph'?pathBounds(transformSegments(parsePath(outlined.d),multiply(m,[outlined.scale,0,0,outlined.scale,0,0])))
   :pathBounds(transformSegments(parsePath('M0 0H'+rule.width+'V'+rule.height+'H0Z'),m));
  contributions.push({id,kind:mark.kind,node:mark.node,font:mark.font,slot:mark.slot,bound:unionBounds([boundsFor(originalMatrix),boundsFor(integerMatrix),boundsFor(driverMatrix)])});
  const driverScale=.996264*1.00375;
  const coefficientErrors=originalMatrix.slice(0,4).map((v,i)=>Math.abs(v-driverMatrix[i]*driverScale));
  assert.ok(coefficientErrors.every((e,i)=>e<=32*Number.EPSILON*Math.max(1,Math.abs(driverMatrix[i]))),'Native label frame differs.');
  // Registration screening follows the native sp and driver serialization,
  // independently of pixels. Four rounded native dimensions, five-decimal PGF
  // translations and the documented root/bridge scale truncation are bounded.
  const translationLimitPixels=4*spToCss+.000005*96/72.27
   +Math.abs(1-driverScale)*(Math.abs(mark.xSp*spToCss)+Math.abs(mark.ySp*spToCss))
   +.000001*(Math.abs(a)+Math.abs(b)+Math.abs(c)+Math.abs(d))*4/3;
  const xDifferencePixels=originalMatrix[4]-driverMatrix[4],yDifferencePixels=originalMatrix[5]-driverMatrix[5];
  assert.ok(Math.abs(xDifferencePixels)<=translationLimitPixels&&Math.abs(yDifferencePixels)<=translationLimitPixels,'Native label registration differs.');
  placementChecks.push({id,node:mark.node,coefficientErrors,xDifferencePixels,yDifferencePixels,translationLimitPixels});
  operations.push({...op,id,mark,rule,atlas,originalMatrix,integerMatrix,driverMatrix});
 }
 assert.equal(markIndex,events.marks.length);
 const variants=[];
 for(const id of mathNativeEncodingIds){
  const places=id.endsWith('-6')?6:12,checks=[];
  const formatted=v=>{const text=fixed(v,places),error=Math.abs(Number(text)-v),decimalBound=.5*10**(-places),
   binaryRoundoffBound=Number.EPSILON*Math.max(1,Math.abs(v)),limit=decimalBound+binaryRoundoffBound;
   assert.ok(error<=limit);checks.push({native:v,serialized:Number(text),error,decimalBound,binaryRoundoffBound,limit});return text;};
  const instructions=operations.map(op=>{
   if(op.kind==='path')return{...op,matrix:op.matrix.map(formatted)};
   const matrix=id.startsWith('events-driver')?op.driverMatrix:id.includes('integer')?op.integerMatrix:op.originalMatrix;
   return{...op,matrix:matrix.map(formatted)};
  });
  const svg=await renderer.page.evaluate(({reference,metadata,root,id,instructions,atlasDefinitions})=>{
   const ns='http://www.w3.org/2000/svg',doc=document.implementation.createDocument(ns,'svg',null),s=doc.documentElement;
   s.setAttribute('width',root[2]+'px');s.setAttribute('height',root[3]+'px');s.setAttribute('viewBox',root.join(' '));
   if(id==='driver-css'){
    const original=new DOMParser().parseFromString(reference,'image/svg+xml').documentElement,g=doc.createElementNS(ns,'g');
    g.setAttribute('transform','matrix('+[4/3,0,0,4/3,-metadata.origin.x*4/3,-metadata.origin.y*4/3].join(' ')+')');
    for(const e of original.childNodes)g.append(doc.importNode(e,true));s.append(g);
   }else{
    const defs=new DOMParser().parseFromString(metadata.defs,'image/svg+xml').documentElement;
    s.append(doc.importNode(defs,true));
    for(const p of atlasDefinitions){const e=doc.createElementNS(ns,'path');e.id=p.id;e.setAttribute('d',p.d);s.firstChild.append(e);}
    for(const op of instructions){
     const e=doc.createElementNS(ns,op.kind);e.id=op.id;for(const[k,v]of Object.entries(op.paint))e.setAttribute(k,v);
     e.setAttribute('transform','matrix('+op.matrix.join(' ')+')');
     if(op.kind==='path')e.setAttribute('d',op.d);
     else if(op.kind==='use')e.setAttribute('href',id.includes('atlas')?'#'+op.atlas.id:op.href);
     else{e.setAttribute('x','0');e.setAttribute('y','0');e.setAttribute('width',id.includes('events')||id.includes('integer')?op.rule.width:op.width);
      e.setAttribute('height',id.includes('events')||id.includes('integer')?op.rule.height:op.height);}
     s.append(e);
    }
   }
   return new XMLSerializer().serializeToString(s);
  },{reference,metadata,root,id,instructions,atlasDefinitions:[...atlasDefinitions.values()]});
  variants.push({id,svg,serialization:{passed:true,checks}});
 }
 return{origin,root,variants,outlineChecks,placementChecks,contributions,
  ...(includeGeometry?{geometry:{operations,definitions:metadata.definitions,atlasDefinitions:[...atlasDefinitions.values()]}}:{}),
  counts:{nodes:events.nodes.length,glyphs:events.marks.filter(m=>m.kind==='glyph').length,rules:events.marks.filter(m=>m.kind==='rule').length,paths:pathIndex},
  converterInvoked:false,contract:'Original driver registration and paint order. Native paths unchanged; label advances, selected-size outlines and matrix decimals varied independently. No candidate data or image policy.'};
}
