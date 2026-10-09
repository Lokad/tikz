// Explicit viewport native arrow captures on the unchanged registered camera.
// The original intrinsic-image route remains a separate required observation.
import assert from 'node:assert/strict';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {sha256} from './shape-oracle-bundle.mjs';

export async function arrowVectorDocument(renderer,{svg,driver,origin,camera,frame,allowMathMarks=false}){
 assert.ok(['natural','expanded'].includes(frame));
 assert.ok(Object.values(camera).every(Number.isFinite)&&Number.isSafeInteger(camera.width)&&Number.isSafeInteger(camera.height)&&camera.width>0&&camera.height>0);
 assert.ok(camera.width*camera.height*16<=20000000);
 assert.equal(typeof allowMathMarks,'boolean');
 return renderer.page.evaluate(({svg,driver,origin,camera,frame,allowMathMarks})=>{
  const require=(v,m)=>{if(!v)throw Error(m);},ns='http://www.w3.org/2000/svg',doc=new DOMParser().parseFromString(svg,'image/svg+xml'),source=doc.documentElement;
  require(!doc.querySelector('parsererror')&&!doc.doctype&&source.localName==='svg'&&doc.querySelectorAll('svg').length===1,'Expected one safe source SVG.');
  const ids=new Set();for(const e of doc.querySelectorAll('*')){
   require(e.namespaceURI===ns&&['svg','g','defs','path','use','title','desc','clipPath',...(allowMathMarks?['rect']:[])].includes(e.localName),'Unsupported vector capture element.');
   if(e.localName==='rect')for(const key of ['x','y','width','height']){
    const text=e.getAttribute(key)??(['x','y'].includes(key)?'0':null),n=Number(text);
    require(text!==null&&/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(text)&&Number.isFinite(n)&&Math.abs(n)<=1000000&&(!['width','height'].includes(key)||n>0),'Invalid math rule rectangle.');
   }
   if(e.id){require(!ids.has(e.id),'Duplicate source identity.');ids.add(e.id);}
   for(const a of e.attributes)require(!a.name.toLowerCase().startsWith('on')&&!['style','base'].includes(a.localName)
    &&(a.localName!=='href'||/^#[\w.-]+$/.test(a.value))&&(!a.value.includes('url(')||a.localName==='clip-path'&&/^url\(#[\w.-]+\)$/.test(a.value)),'Executable/external vector capture source.');
  }
  const dimension=value=>{const m=/^([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)(px|pt)$/i.exec(value??'');require(m,'Unknown source unit.');return Number(m[1])*(m[2]==='pt'?4/3:1);};
  const view=(source.getAttribute('viewBox')??'').trim().split(/[ ,]+/).map(Number),factor=driver?4/3:1;
  require(view.length===4&&view.every(Number.isFinite)&&view[2]>0&&view[3]>0,'Invalid source viewBox.');
  const width=dimension(source.getAttribute('width')),height=dimension(source.getAttribute('height'));
  require(Math.abs(width-view[2]*factor)<=1e-9&&Math.abs(height-view[3]*factor)<=1e-9,'Source dimensions stretch native coordinates.');
  require([null,'none','xMidYMid meet'].includes(source.getAttribute('preserveAspectRatio')),'Unsupported source aspect ratio.');
  const natural={x:driver?(view[0]-origin.x)*4/3:view[0],y:driver?(view[1]-origin.y)*4/3:view[1],width,height};
  require(Object.values(natural).every(Number.isFinite),'Invalid source registration.');
  const outer=doc.implementation.createDocument(ns,'svg',null),root=outer.documentElement;
  root.setAttribute('width',camera.width+'px');root.setAttribute('height',camera.height+'px');root.setAttribute('viewBox',[camera.x,camera.y,camera.width,camera.height].join(' '));root.setAttribute('overflow','hidden');
  // Use exactly the established expanded mapping; an additional nested SVG
  // viewport would introduce another float32 scale/translation composition.
  for(const a of source.attributes)if(!['width','height','viewBox','x','y','preserveAspectRatio','overflow'].includes(a.name))root.setAttributeNS(a.namespaceURI,a.name,a.value);
  const content=outer.createElementNS(ns,'g');
  if(driver)content.setAttribute('transform','matrix('+[4/3,0,0,4/3,-origin.x*4/3,-origin.y*4/3].join(' ')+')');
  for(const child of source.childNodes)content.append(outer.importNode(child,true));
  if(frame==='natural'){
   let id='arrow-natural-viewport';while(ids.has(id))id+='-';
   const defs=outer.createElementNS(ns,'defs'),clip=outer.createElementNS(ns,'clipPath'),border=outer.createElementNS(ns,'path'),clipped=outer.createElementNS(ns,'g');
   clip.setAttribute('id',id);clip.setAttribute('clipPathUnits','userSpaceOnUse');
   border.setAttribute('d','M'+natural.x+' '+natural.y+'h'+width+'v'+height+'h'+(-width)+'Z');clip.append(border);defs.append(clip);root.append(defs);
   clipped.setAttribute('clip-path','url(#'+id+')');clipped.append(content);root.append(clipped);
  }else root.append(content);
  return{svg:new XMLSerializer().serializeToString(outer),natural,sourceViewBox:view,sourceElementCount:doc.querySelectorAll('*').length,
   viewportContract:frame==='natural'?'Declared intrinsic viewport clips vector content.':'Original content maps directly onto the unchanged native camera without an added viewport.'};
 },{svg,driver,origin,camera,frame,allowMathMarks});
}

export async function measureArrowVectorPair(renderer,input){
 const reference=await arrowVectorDocument(renderer,{svg:input.reference,driver:input.leftIsDriver,origin:input.origin,camera:input.camera,frame:input.frame,allowMathMarks:input.allowMathMarks===true});
 const actual=await arrowVectorDocument(renderer,{svg:input.actual,driver:false,origin:{x:0,y:0},camera:input.camera,frame:input.frame,allowMathMarks:input.allowMathMarks===true});
 const result=await measureEdgeTrialPrimary(renderer,{...input,reference:reference.svg,actual:actual.svg,leftIsDriver:false,origin:{x:0,y:0},frame:'expanded'});
 return{...result,naturalFrames:{reference:reference.natural,actual:actual.natural},vectorCapture:{schemaVersion:1,
  rasterSize:{width:input.camera.width*input.scale,height:input.camera.height*input.scale},frame:input.frame,scale:input.scale,
  reference:{sourceViewBox:reference.sourceViewBox,sourceElementCount:reference.sourceElementCount,viewportContract:reference.viewportContract},
  actual:{sourceViewBox:actual.sourceViewBox,sourceElementCount:actual.sourceElementCount,viewportContract:actual.viewportContract},
  contract:'Original content maps directly to the fixed camera at the requested density; declared natural root clipping is explicit. Original intrinsic-image observations remain required separately.'}};
}

// Observe rounded intrinsic dimensions; this alone does not prove bitmap scaling.
export async function arrowIntrinsicRasterSize(renderer,svg){
 return renderer.page.evaluate(async svg=>{const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
  try{const i=new Image();i.src=url;await i.decode();return{width:i.width,height:i.height,naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight};}finally{URL.revokeObjectURL(url);}},svg);
}

export async function runArrowViewportControls(renderer){
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="3px" height="3px" viewBox="0 0 3 3"><path d="M1.25 1.25h.25v.25h-.25Z" fill="#000"/></svg>';
 const input={reference:svg,actual:svg,leftIsDriver:false,origin:{x:0,y:0},camera:{x:-1,y:-1,width:5,height:5},frame:'natural',scale:4,background:'white',
  regions:[{id:'whole-picture',rectangle:{x:0,y:0,width:5,height:5}}],cropLimit:0,referenceLabel:'TikZ SVG',rightLabel:'control'};
 const controls=[];
 for(const [route,fn]of[['intrinsic-image',measureEdgeTrialPrimary],['explicit-viewport',measureArrowVectorPair]]){
  const pair=await fn(renderer,input),sample=await renderer.page.evaluate(async b=>{const im=new Image();im.src='data:image/png;base64,'+b;await im.decode();
   const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data;
   let foreground=0,darkest=255;for(let i=0;i<d.length;i+=4){foreground+=d[i]<255;darkest=Math.min(darkest,d[i]);}return{width:c.width,height:c.height,foreground,darkest};},pair.images.actual);
  assert.deepEqual(sample,{width:20,height:20,foreground:1,darkest:0});assert.equal(pair.metrics.rawChangedPixels,0);
  controls.push({name:route+' quarter-CSS-pixel square at 4x',sample,expected:{width:20,height:20,foreground:1,darkest:0},imageSha256:sha256(Buffer.from(pair.images.actual,'base64')),passed:true});
  const cropped=svg.replace('width="3px"','width="1px"').replace('0 0 3 3','0 0 1 3');
  const natural=await fn(renderer,{...input,actual:cropped}),expanded=await fn(renderer,{...input,actual:cropped,frame:'expanded'});
  assert.equal(natural.metrics.rawChangedPixels,1);assert.equal(natural.metrics.maxRawChannelError,255);assert.equal(expanded.metrics.rawChangedPixels,0);
  controls.push({name:route+' root cropping remains visible',natural:natural.metrics,expanded:expanded.metrics,passed:true});
 }
 for(const bad of[svg.replace('width="3px"','width="4px"'),svg.replace('<path','<script'),svg.replace('fill="#000"','onclick="alert(1)"')])
  await assert.rejects(()=>arrowVectorDocument(renderer,{svg:bad,driver:false,origin:{x:0,y:0},camera:input.camera,frame:'natural'}));
 controls.push({name:'Stretched, executable and unsupported source documents rejected',rejections:3,passed:true});
 return controls;
}
