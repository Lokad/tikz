// Native-only label encodings and regions. No converter SVG, scene or font data.
import assert from 'node:assert/strict';
import {multiply,parseTransform,parsePath,pathData,pathBounds,transformSegments,unionBounds} from './shape-frame-math.mjs';
import {shapePdfRasterRectangle} from './shape-pdf-camera.mjs';
import {decodeCalcPng} from './calc-png.mjs';
import {diagramNativeNaturalRoot,rectangleNativeNaturalRoot,rectangleNativePrimitives} from './diagram-native-root.mjs';
import {isRectangleImageCase,rectangleImageCounts,isPlotImageCase} from './diagram-image-evidence.mjs';
import {makeArrowNativeSvg,arrowNativeRepresentations} from './arrow-native-svg.mjs';
import {readEdgeOriginal,edgeOracleInstructions,edgeOracleVariants} from './edge-oracle.mjs';
import {requiresSvgArrowFillCorrection,svgArrowFillChangedPaintIndices} from './svg-arrow-color-evidence.mjs';

const spToCss=96/(72.27*65536),ptToCss=96/72.27;
const fixed=(v,n)=>{assert.ok(Number.isFinite(v));return(Math.abs(v)<10**(-n)/2?0:v).toFixed(n).replace(/\.?0+$/,'');};
export const pathLabelImageEncodings=['native-dimensions-12','native-dimensions-6'];
export const pathLabelDiagramImageEncodings=[...pathLabelImageEncodings,'native-paths-pt-short'];
export function pathLabelImageEncodingIds(frame){
 const ids=frame.nativePathEncoding?pathLabelDiagramImageEncodings:pathLabelImageEncodings;
 assert.deepEqual(frame.encodings.map(e=>e.id),ids,'Native encoding coverage differs.');return ids;
}
export const pathLabelPrimaryCaptures=['intrinsic-image','explicit-viewport'];

export async function buildPathLabelImageReference(renderer,bundle,glyphs,nativePaths=!!bundle.arrowMetrics||isRectangleImageCase(bundle.report.definition.id)){
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
 const clipIndices=ids=>ids.map(id=>{const index=clips.findIndex(c=>c.id===id);assert.ok(index>=0);return index;});
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
 const contributions=[],nonDrawingPaints=[];
 for(const [index,p]of paths.entries()){
  if(p.segments.length===1&&p.segments[0].kind==='move'){
   // Retain native paint/order and encoding, while excluding a proved invisible
   // isolated butt stroke from ink regions. Picture bounds remain independent.
   assert.equal(p.paint['stroke-linecap'],'butt');assert.equal(p.paint.fill,'none');assert.notEqual(p.paint.stroke,'none');
   assert.ok(bundle.arrowMetrics?.driverState.isolatedButtDegenerateOmissions?.some(o=>o.quantity==='paint-'+(index+1)+'.svg'));
   nonDrawingPaints.push({id:p.id,kind:'isolated-zero-length-butt-stroke'});continue;
  }
  const bounds=pathBounds(transformSegments(p.segments,p.matrix));
  // Conservative affine pen/miter envelope; kept separate from PGF picture bounds.
  const m=p.matrix,r=p.paint.stroke==='none'?0:Number(p.paint['stroke-width'])*Number(p.paint['stroke-miterlimit'])/2;
  const dx=r*(Math.abs(m[0])+Math.abs(m[2])),dy=r*(Math.abs(m[1])+Math.abs(m[3]));
  contributions.push({id:p.id,kind:'path',...(p.role?{role:p.role}:{}),bound:{minX:bounds.minX-dx,minY:bounds.minY-dy,maxX:bounds.maxX+dx,maxY:bounds.maxY+dy},
   ...(bundle.arrowMetrics&&p.clips.length?{clips:clipIndices(p.clips)}:{})});
 }
 for(const p of uses){const outline=outlines.get(p.href.slice(1));assert.ok(outline);
  contributions.push({id:p.id,kind:'glyph',nodeId:p.nodeId,font:p.font,slot:p.slot,bound:pathBounds(transformSegments(outline,p.matrix)),
   ...(bundle.arrowMetrics&&p.clips.length?{clips:clipIndices(p.clips)}:{})});
 }
 const b=metrics.pictureBounds,picture={minX:b.minXSp*spToCss,minY:-b.maxYSp*spToCss,maxX:b.maxXSp*spToCss,maxY:-b.minYSp*spToCss};
 const v=metadata.view,driverRoot={minX:(v[0]-metadata.origin.x)*4/3,minY:(v[1]-metadata.origin.y)*4/3,
  maxX:(v[0]+v[2]-metadata.origin.x)*4/3,maxY:(v[1]+v[3]-metadata.origin.y)*4/3};
 const bounds=unionBounds([picture,driverRoot,...contributions.map(c=>c.bound)]),x=Math.floor(bounds.minX)-8,y=Math.floor(bounds.minY)-8;
 const camera={x,y,width:Math.ceil(bounds.maxX)-x+8,height:Math.ceil(bounds.maxY)-y+8};assert.ok(camera.width*camera.height*16<=20000000);
 const regions=contributions.map(c=>{const b=c.bound,x=Math.floor(b.minX)-2-camera.x,y=Math.floor(b.minY)-2-camera.y;
  return{...c,rectangle:{x,y,width:Math.ceil(b.maxX)+2-camera.x-x,height:Math.ceil(b.maxY)+2-camera.y-y}};
 });
 const glyphContributions=contributions.filter(c=>c.kind==='glyph'),rectangle=isRectangleImageCase(bundle.report.definition.id);
 const natural=bundle.arrowMetrics?diagramNativeNaturalRoot(bundle.arrowMetrics,picture,glyphContributions):rectangle?rectangleNativeNaturalRoot(metrics,picture,glyphContributions,rectangleImageCounts[bundle.report.definition.id]):null;
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
 let nativePathEncoding;
 if(nativePaths){
  assert.ok((bundle.arrowMetrics||rectangle)&&natural);
  let native;
  if(rectangle){
   // Reuse the primitive reader's path/paint/order and integer serialization
   // guards; the alias names the observed construction paths, never arrow data.
   const primitive=rectangleNativePrimitives(metrics,rectangleImageCounts[bundle.report.definition.id]),original=await readEdgeOriginal(renderer,reference,primitive,glyphs);
   const instructions=edgeOracleInstructions(primitive,glyphs,original,edgeOracleVariants.find(v=>v.name==='native-pt-short-glyph-twelve'));
   native={instructions:{kind:'rectangle-background',converterInvoked:false,checks:instructions.checks,clips:instructions.clips,
    paints:instructions.paths.map(p=>({...p,attributes:p.paint}))}};
  }else native=makeArrowNativeSvg(bundle.arrowMetrics,{picture,inkRoot:natural.root},arrowNativeRepresentations.find(v=>v.name==='pt-short'),'ink');
  assert.equal(native.instructions.clips.length,clips.length,'Native clip coverage differs.');
  const svg=await renderer.page.evaluate(({source,paints,nativeClips,clipIds})=>{
   const doc=new DOMParser().parseFromString(source,'image/svg+xml'),s=doc.documentElement;
   const glyphs=()=>[...doc.querySelectorAll('use')].map(e=>e.outerHTML),before=glyphs(),defs=doc.querySelector('defs').outerHTML,box=s.getAttribute('viewBox');
   const fonts=()=>[...doc.querySelectorAll('defs path')].filter(e=>!e.closest('clipPath')).map(e=>e.outerHTML),fontBefore=fonts();
   for(const[i,clip]of nativeClips.entries()){
    const c=doc.getElementById(clipIds[i]);if(c?.localName!=='clipPath'||c.children.length!==1||c.firstElementChild.localName!=='path')throw Error('Missing native clip.');
    const p=c.firstElementChild;for(const a of [...p.attributes])p.removeAttribute(a.name);
    p.setAttribute('d',clip.d);if(clip.transform)p.setAttribute('transform',clip.transform);
   }
   for(const[i,p]of paints.entries()){
    const e=doc.getElementById('native-paint-'+i);if(!e||e.localName!=='path')throw Error('Missing native paint.');
    const chain=[];for(let parent=e.parentElement;parent&&parent!==s;parent=parent.parentElement){const clip=parent.getAttribute('clip-path');if(clip)chain.unshift(clipIds.indexOf(clip.slice(5,-1)));}
    if(chain.some(id=>id<0)||JSON.stringify(chain)!==JSON.stringify(p.clips??[]))throw Error('Native paint clip ownership differs.');
    for(const a of [...e.attributes])if(a.name!=='id')e.removeAttribute(a.name);
    for(const[k,v]of Object.entries(p.attributes))if(k!=='id')e.setAttribute(k,v);
    e.setAttribute('d',p.d);if(p.transform)e.setAttribute('transform',p.transform);
   }
   if(JSON.stringify(before)!==JSON.stringify(glyphs())||JSON.stringify(fontBefore)!==JSON.stringify(fonts())||
     (!nativeClips.length&&defs!==doc.querySelector('defs').outerHTML)||box!==s.getAttribute('viewBox'))throw Error('Native glyphs, outlines or root changed.');
   return new XMLSerializer().serializeToString(s);
  },{source:encodings[1].svg,paints:native.instructions.paints,nativeClips:native.instructions.clips,clipIds:clips.map(c=>c.id)});
  // Saved JSON has no negative zero; normalize instruction metadata before
  // independent in-memory versus saved-frame comparison. SVGs stay unchanged.
  nativePathEncoding=JSON.parse(JSON.stringify(native.instructions));encodings.push({id:pathLabelDiagramImageEncodings[2],svg,converterInvoked:false});
 }
 return{caseId:bundle.report.definition.id,origin:metadata.origin,camera,regions,picture,driverRoot,bounds,encodings,
  ...(natural?{natural}:{}),
  ...(nativePathEncoding?{nativePathEncoding}:{}),
  ...(nonDrawingPaints.length?{nonDrawingPaints}:{}),
  nativePaths:paths.length,nativeGlyphs:uses.length,nativeClips:clips.length,converterInvoked:false,
  contract:'Original native paths/outlines/paint/order/clips; PGF dimensions recovered as sp, exact physical scale, independent DVI glyph advances and observed native frames. Decimal variants are fixed before candidate measurement.'};
}

export function pathLabelPdfFrame(bundle,frame){
 const page=bundle.pdfPage??bundle.report.pdfPage,b=bundle.metrics.pictureBounds,box=bundle.metrics.pictureBox,glue=bundle.metrics.wrapperExtraWidthSp;
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
 const diagram=frame.regions.some(r=>r.role==='tip')||isRectangleImageCase(frame.caseId)||isPlotImageCase(frame.caseId),controls=[];let offset=0;
 for(const node of glyphs.nodes){
  const targets=node.glyphs.map((_,i)=>'native-glyph-'+(offset+i)),target=targets[0];
  if(!['from','target','seed'].includes(node.id)){
   controls.push(...['missing','quarter-pixel-shift'].map(kind=>({nodeId:node.id,target,kind})));
   if(diagram)controls.push({nodeId:node.id,target,targets,kind:'missing-label'});
   if(frame.caseId==='smooth-plot-contract'){
    assert.equal(node.id,'sentinel');assert.ok(targets.length>=3);
    for(const i of[1,2])controls.push(...['missing','quarter-pixel-shift'].map(kind=>({nodeId:node.id+'-glyph-'+i,target:targets[i],kind})));
   }
  }offset+=node.glyphs.length;
 }
 if(diagram)for(const r of frame.regions.filter(r=>r.role==='tip'))controls.push(...['missing','quarter-pixel-shift'].map(kind=>({nodeId:r.id,target:r.id,kind})));
 if(frame.caseId==='flowchart-arc-order'){
  for(const [target,kinds]of [['native-paint-12',['missing','quarter-pixel-shift']],['native-paint-14',['radius-reduction']]]){
   assert.equal(frame.regions.find(r=>r.id===target)?.kind,'path','Expected the fixed arc stroke.');
   controls.push(...kinds.map(kind=>({nodeId:target,target,kind})));
  }
 }
 if(requiresSvgArrowFillCorrection(frame.caseId)){
  const target='native-paint-'+svgArrowFillChangedPaintIndices(frame.caseId)[0],region=frame.regions.find(r=>r.id===target);
  assert.equal(region?.role,'tip');assert.equal(region.clips?.length??0,0,'Wrong-fill control requires a visible unclipped tip.');
  controls.push({nodeId:target,target,kind:'wrong-default-fill'});
 }
 if(['flowchart-paint','flowchart-draw-color'].includes(frame.caseId))for(const kind of ['path','glyph']){
  const region=frame.regions.find(r=>r.kind===kind&&r.clips?.length);assert.ok(region,'Paint diagram must retain clipped '+kind+' evidence.');
  controls.push({nodeId:'clipped-'+kind,target:region.id,kind:'missing-clip'});
 }
 return controls;
}
export function pathLabelControlViews(frame){
 if(frame.caseId==='smooth-plot-contract')return[
  ...[1,4].map(scale=>({frame:'expanded',scale,background:'white'})),
  ...['transparent','white'].map(background=>({frame:'natural',scale:1,background}))];
 return frame.regions.some(r=>r.role==='tip')||isRectangleImageCase(frame.caseId)||isPlotImageCase(frame.caseId)?[1,4].map(scale=>({frame:'expanded',scale,background:'white'})):null;
}
export async function mutatePathLabelImage(renderer,svg,{target,kind,targets}){
 assert.ok(/^native-(glyph|paint)-\d+$/.test(target));assert.ok(['missing','quarter-pixel-shift','missing-label','missing-clip','wrong-default-fill','radius-reduction'].includes(kind));
 if(kind==='missing-label')assert.ok(targets.length>0&&targets.every(t=>/^native-glyph-\d+$/.test(t))&&targets[0]===target);
 let replacement;
 if(kind==='radius-reduction'){
  const d=await renderer.page.evaluate(({svg,target})=>new DOMParser().parseFromString(svg,'image/svg+xml').getElementById(target)?.getAttribute('d'),{svg,target});
  const segments=parsePath(d);assert.equal(segments[0].kind,'move');assert.ok(segments.length>1&&segments.slice(1).every(s=>s.kind==='cubic'));
  const center=segments[0].to;
  // The historical repeated-radius defect used 2mm instead of 5mm. Keep
  // the starting point and stroke state while shrinking only curve geometry.
  replacement=pathData(transformSegments(segments,[.4,0,0,.4,.6*center.x,.6*center.y]));
 }
 return renderer.page.evaluate(({svg,target,kind,targets,replacement})=>{const doc=new DOMParser().parseFromString(svg,'image/svg+xml'),p=doc.getElementById(target);if(!p)throw Error('Missing native control element.');
  if(kind==='missing')p.remove();else if(kind==='missing-label')for(const id of targets){const e=doc.getElementById(id);if(!e)throw Error('Missing label glyph.');e.remove();}
  else if(kind==='missing-clip'){let removed=0;for(let e=p;e&&e.localName!=='svg';e=e.parentElement)if(e.hasAttribute('clip-path')){e.removeAttribute('clip-path');removed++;}if(!removed)throw Error('Missing controlled clip.');}
  else if(kind==='wrong-default-fill'){if(p.localName!=='path')throw Error('Expected an arrow path.');p.setAttribute('fill','#000000');}
  else if(kind==='radius-reduction')p.setAttribute('d',replacement);
  else p.setAttribute('transform','translate(0.25 0) '+p.getAttribute('transform'));
  return new XMLSerializer().serializeToString(doc);
 },{svg,target,kind,targets,replacement});
}
