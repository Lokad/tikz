// Native-only label encodings and regions. No converter SVG, scene or font data.
import assert from 'node:assert/strict';
import {multiply,parseTransform,parsePath,pathData,pathBounds,transformSegments,unionBounds} from './shape-frame-math.mjs';
import {shapePdfRasterRectangle} from './shape-pdf-camera.mjs';
import {decodeCalcPng} from './calc-png.mjs';
import {diagramNativeNaturalRoot} from './diagram-native-root.mjs';

const spToCss=96/(72.27*65536),ptToCss=96/72.27;
const fixed=(v,n)=>{assert.ok(Number.isFinite(v));return(Math.abs(v)<10**(-n)/2?0:v).toFixed(n).replace(/\.?0+$/,'');};
export const pathLabelImageEncodings=['native-dimensions-12','native-dimensions-6'];
export const pathLabelPrimaryCaptures=['intrinsic-image','explicit-viewport'];

export async function buildPathLabelImageReference(renderer,bundle,glyphs){
 const reference=bundle.files.get('probed-reference.svg').toString('utf8'),metrics=bundle.metrics;
 const metadata=await renderer.page.evaluate(source=>{
  const doc=new DOMParser().parseFromString(source,'image/svg+xml'),root=doc.documentElement;
  if(doc.querySelector('parsererror')||doc.doctype||root.localName!=='svg')throw Error('Invalid native SVG.');
  const global=doc.querySelector('#page1 > g'),transform=global?.getAttribute('transform');
  const match=/^translate\(([-\d.]+),([-\d.]+)\)scale\(0\.996264,-0\.996264\)$/.exec(transform??'');
  if(!match)throw Error('Unexpected original native frame.');
  const keys={fill:'#000',stroke:'none','stroke-width':'1','stroke-linecap':'butt','stroke-linejoin':'miter',
   'stroke-miterlimit':'4','stroke-dasharray':'none','stroke-dashoffset':'0','fill-rule':'nonzero','fill-opacity':'1','stroke-opacity':'1'};
  const paint=e=>Object.fromEntries(Object.entries(keys).map(([key,fallback])=>{
   for(let p=e;p&&p!==root;p=p.parentElement){if(p.hasAttribute('opacity'))throw Error('Group opacity outside this native profile.');
    if(p.hasAttribute(key))return[key,p.getAttribute(key)];}return[key,fallback];
  }));
  const transforms=e=>{const list=[];for(let p=e;p&&p!==root;p=p.parentElement){const t=p===global?'scale('+72/72.27+' '+(-72/72.27)+')':p.getAttribute('transform');if(t)list.unshift(t);}return list;};
  const clipChain=e=>{const chain=[];for(let p=e;p&&p!==root;p=p.parentElement){const clip=p.getAttribute('clip-path');if(clip){const m=/^url\(#([\w.-]+)\)$/.exec(clip);if(!m)throw Error('Invalid native clip.');chain.unshift(m[1]);}}return chain;};
  const paths=[],uses=[],operations=[];
  for(const e of doc.querySelectorAll('path,use')){
   if(e.closest('defs,clipPath'))continue;
   if(e.localName==='path'){operations.push({kind:'path',index:paths.length});paths.push({d:e.getAttribute('d'),paint:paint(e),transforms:transforms(e),clips:clipChain(e)});}
   else{operations.push({kind:'glyph',index:uses.length});uses.push({href:[...e.attributes].find(a=>a.localName==='href')?.value,paint:paint(e),clips:clipChain(e)});}
  }
  const clips=[...doc.querySelectorAll('clipPath')].map(e=>{
   const p=e.querySelector('path');if(!p||e.children.length!==1)throw Error('Unexpected native clip vocabulary.');
   return{id:e.id,d:p.getAttribute('d'),transforms:transforms(p)};
  });
  return{origin:{x:Number(match[1]),y:Number(match[2])},view:root.getAttribute('viewBox').split(/[ ,]+/).map(Number),paths,uses,operations,clips,
   definitions:[...doc.querySelectorAll('defs path')].map(e=>({id:e.id,d:e.getAttribute('d')})),defs:doc.querySelector('defs')?.outerHTML};
 },reference);
 assert.equal(metadata.paths.length,metrics.driverState.pathPaints);assert.equal(metadata.clips.length,metrics.driverState.clipPaths);
 assert.equal(glyphs.nodes.length,metrics.nodes.length);
 const world=transforms=>transforms.reduce((m,t)=>multiply(m,parseTransform(t)),[4/3,0,0,4/3,0,0]);
 const recover=segments=>segments.map(s=>Object.fromEntries(Object.entries(s).map(([k,v])=>[k,v&&typeof v==='object'?{x:Math.round(v.x*65536)/65536,y:Math.round(v.y*65536)/65536}:v])));
 const paths=metadata.paths.map((p,i)=>{
  const segments=recover(parsePath(p.d)),matrix=world(p.transforms),paint={...p.paint};
  const width=metrics.driverState.paints[i].widthSp/65536;
  if(paint.stroke!=='none')paint['stroke-width']=String(width);
  const role=bundle.arrowMetrics?.driverState.paints[i].role;
  return{...p,id:'native-paint-'+i,d:pathData(segments),segments,matrix,paint,...(role?{role}:{} )};
 });
 const clips=metadata.clips.map(p=>({...p,segments:recover(parsePath(p.d)),matrix:world(p.transforms)}));
 const outlines=new Map(metadata.definitions.map(p=>[p.id,parsePath(p.d)])),uses=[];
 let index=0;
 for(let i=0;i<metrics.nodes.length;i++){
  const n=metrics.nodes[i],g=glyphs.nodes[i];assert.equal(g.id,n.id);
  const [a,b,c,d]=n.frame.slice(0,4).map(Number),origin=n.anchors.text;
  for(const glyph of g.glyphs){
   const p=metadata.uses[index];assert.ok(p);assert.equal(Number(p.href.split('-').at(-1)),glyph.slot);
   const matrix=[a*4/3,-b*4/3,-c*4/3,d*4/3,(origin.xSp+a*glyph.xSp-c*glyph.ySp)*spToCss,-(origin.ySp+b*glyph.xSp-d*glyph.ySp)*spToCss];
   uses.push({...p,id:'native-glyph-'+index,nodeId:n.id,font:glyph.font,slot:glyph.slot,matrix});index++;
  }
 }
 assert.equal(uses.length,metadata.uses.length);
 const contributions=[];
 for(const p of paths){const bounds=pathBounds(transformSegments(p.segments,p.matrix));
  // Conservative affine pen/miter envelope; kept separate from PGF picture bounds.
  const m=p.matrix,r=p.paint.stroke==='none'?0:Number(p.paint['stroke-width'])*Number(p.paint['stroke-miterlimit'])/2;
  const dx=r*(Math.abs(m[0])+Math.abs(m[2])),dy=r*(Math.abs(m[1])+Math.abs(m[3]));
  contributions.push({id:p.id,kind:'path',...(p.role?{role:p.role}:{}),bound:{minX:bounds.minX-dx,minY:bounds.minY-dy,maxX:bounds.maxX+dx,maxY:bounds.maxY+dy}});
 }
 for(const p of uses){const outline=outlines.get(p.href.slice(1));assert.ok(outline);
  contributions.push({id:p.id,kind:'glyph',nodeId:p.nodeId,font:p.font,slot:p.slot,bound:pathBounds(transformSegments(outline,p.matrix))});
 }
 const b=metrics.pictureBounds,picture={minX:b.minXSp*spToCss,minY:-b.maxYSp*spToCss,maxX:b.maxXSp*spToCss,maxY:-b.minYSp*spToCss};
 const v=metadata.view,driverRoot={minX:(v[0]-metadata.origin.x)*4/3,minY:(v[1]-metadata.origin.y)*4/3,
  maxX:(v[0]+v[2]-metadata.origin.x)*4/3,maxY:(v[1]+v[3]-metadata.origin.y)*4/3};
 const bounds=unionBounds([picture,driverRoot,...contributions.map(c=>c.bound)]),x=Math.floor(bounds.minX)-8,y=Math.floor(bounds.minY)-8;
 const camera={x,y,width:Math.ceil(bounds.maxX)-x+8,height:Math.ceil(bounds.maxY)-y+8};assert.ok(camera.width*camera.height*16<=20000000);
 const regions=contributions.map(c=>{const b=c.bound,x=Math.floor(b.minX)-2-camera.x,y=Math.floor(b.minY)-2-camera.y;
  return{...c,rectangle:{x,y,width:Math.ceil(b.maxX)+2-camera.x-x,height:Math.ceil(b.maxY)+2-camera.y-y}};
 });
 const natural=bundle.arrowMetrics?diagramNativeNaturalRoot(bundle.arrowMetrics,picture,contributions.filter(c=>c.kind==='glyph')):null;
 const encodings=[];
 for(const id of pathLabelImageEncodings){
  const box=natural?.root??bounds,places=id.endsWith('12')?12:6,root=[box.minX,box.minY,box.maxX-box.minX,box.maxY-box.minY].map(v=>fixed(v,6));
  const instructions={paths:paths.map(p=>({...p,matrix:p.matrix.map(v=>fixed(v,places))})),uses:uses.map(p=>({...p,matrix:p.matrix.map(v=>fixed(v,places))})),
   clips:clips.map(p=>({...p,d:pathData(p.segments),matrix:p.matrix.map(v=>fixed(v,places))}))};
  const svg=await renderer.page.evaluate(({metadata,instructions,root})=>{
   const ns='http://www.w3.org/2000/svg',doc=document.implementation.createDocument(ns,'svg',null),s=doc.documentElement;
   s.setAttribute('width',root[2]+'px');s.setAttribute('height',root[3]+'px');s.setAttribute('viewBox',root.join(' '));
   const defs=new DOMParser().parseFromString(metadata.defs,'image/svg+xml').documentElement;s.append(doc.importNode(defs,true));
   for(const clip of instructions.clips){const c=doc.createElementNS(ns,'clipPath'),p=doc.createElementNS(ns,'path');c.id=clip.id;c.setAttribute('clipPathUnits','userSpaceOnUse');
    p.setAttribute('d',clip.d);p.setAttribute('transform','matrix('+clip.matrix.join(' ')+')');c.append(p);s.firstChild.append(c);}
   for(const op of metadata.operations){const p=op.kind==='path'?instructions.paths[op.index]:instructions.uses[op.index],e=doc.createElementNS(ns,op.kind==='path'?'path':'use');
    e.id=p.id;for(const[k,v]of Object.entries(p.paint))e.setAttribute(k,v);
    e.setAttribute('transform','matrix('+p.matrix.join(' ')+')');if(op.kind==='path')e.setAttribute('d',p.d);else e.setAttribute('href',p.href);
    let parent=s;for(const id of p.clips){const g=doc.createElementNS(ns,'g');g.setAttribute('clip-path','url(#'+id+')');parent.append(g);parent=g;}parent.append(e);
   }return new XMLSerializer().serializeToString(s);
  },{metadata,instructions,root});
  encodings.push({id,svg,converterInvoked:false});
 }
 return{caseId:bundle.report.definition.id,origin:metadata.origin,camera,regions,picture,driverRoot,bounds,encodings,
  ...(natural?{natural}:{}),
  nativePaths:paths.length,nativeGlyphs:uses.length,nativeClips:clips.length,converterInvoked:false,
  contract:'Original native paths/outlines/paint/order/clips; PGF dimensions recovered as sp, exact physical scale, independent DVI glyph advances and observed native frames. Decimal variants are fixed before candidate measurement.'};
}

export function pathLabelPdfFrame(bundle,frame){
 const page=bundle.report.pdfPage,b=bundle.metrics.pictureBounds,box=bundle.metrics.pictureBox,glue=bundle.metrics.wrapperExtraWidthSp;
 assert.equal(box.widthSp,b.maxXSp-b.minXSp+glue);assert.equal(box.heightSp+box.depthSp,b.maxYSp-b.minYSp);
 const origin={x:(page.boxXSp+glue-b.minXSp)*spToCss,y:(page.heightSp-page.boxBaselineYSp+b.minYSp+box.depthSp)*spToCss};
 const physicalPage={width:page.widthSp*spToCss,height:page.heightSp*spToCss},rasterSizes={};
 for(const scale of[1,4]){const png=decodeCalcPng(bundle.files.get('probed-pdf-page-'+scale+'x.png'));rasterSizes[scale+'x']={width:png.width,height:png.height};
  assert.deepEqual(rasterSizes[scale+'x'],{width:Math.ceil(physicalPage.width*scale),height:Math.ceil(physicalPage.height*scale)});}
 const camera={origin,physicalPage,rasterSizes};
 const rectangles=[{id:'whole-picture',kind:'picture',rectangle:{...frame.camera}},...frame.regions.map(r=>({...r,rectangle:{...r.rectangle,x:r.rectangle.x+frame.camera.x,y:r.rectangle.y+frame.camera.y}}))];
 const regions=rectangles.map(r=>({...r,rasterRectangles:Object.fromEntries([1,4].map(scale=>[scale+'x',shapePdfRasterRectangle(r.rectangle,camera,scale)]))}));
 return{camera,regions,registration:'Native PDF save-position, picture bounds, measured wrapper glue and recorded PDF rasters; no candidate fitting.'};
}

export function pathLabelImageControls(frame,glyphs){
 const diagram=frame.regions.some(r=>r.role==='tip'),controls=[];let offset=0;
 for(const node of glyphs.nodes){
  const targets=node.glyphs.map((_,i)=>'native-glyph-'+(offset+i)),target=targets[0];
  if(!['from','target','seed'].includes(node.id)){
   controls.push(...['missing','quarter-pixel-shift'].map(kind=>({nodeId:node.id,target,kind})));
   if(diagram)controls.push({nodeId:node.id,target,targets,kind:'missing-label'});
  }offset+=node.glyphs.length;
 }
 if(diagram)for(const r of frame.regions.filter(r=>r.role==='tip'))controls.push(...['missing','quarter-pixel-shift'].map(kind=>({nodeId:r.id,target:r.id,kind})));
 return controls;
}
export function pathLabelControlViews(frame){
 return frame.regions.some(r=>r.role==='tip')?[1,4].map(scale=>({frame:'expanded',scale,background:'white'})):null;
}
export async function mutatePathLabelImage(renderer,svg,{target,kind,targets}){
 assert.ok(/^native-(glyph|paint)-\d+$/.test(target));assert.ok(['missing','quarter-pixel-shift','missing-label'].includes(kind));
 if(kind==='missing-label')assert.ok(targets.length>0&&targets.every(t=>/^native-glyph-\d+$/.test(t))&&targets[0]===target);
 return renderer.page.evaluate(({svg,target,kind,targets})=>{const doc=new DOMParser().parseFromString(svg,'image/svg+xml'),p=doc.getElementById(target);if(!p)throw Error('Missing native control element.');
  if(kind==='missing')p.remove();else if(kind==='missing-label')for(const id of targets){const e=doc.getElementById(id);if(!e)throw Error('Missing label glyph.');e.remove();}
  else p.setAttribute('transform','translate(0.25 0) '+p.getAttribute('transform'));
  return new XMLSerializer().serializeToString(doc);
 },{svg,target,kind,targets});
}
