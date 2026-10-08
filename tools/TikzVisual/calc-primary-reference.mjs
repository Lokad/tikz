// Fixed glyph-free native evidence only. No converter import, SVG or scene input.
import assert from 'node:assert/strict';
import {parsePath,parseTransform,transformSegments,pathBounds,pathData} from './shape-frame-math.mjs';

export const calcPrimaryContract={id:'pgf-3.1.11a-calc-native-primary-v1',fixture:'calc-coordinates',
  units:'TeX pt path dimensions; CSS px root; y down',pathScale:96/72.27,rootDecimals:6,
  representations:['driver-local-origin','physical-local-origin','physical-paths-native-bounds'],
  scope:'Fixed glyph-free black opaque 0.4-pt stroke fixture only; no new TikZ paint or clip compatibility.'};

export async function buildCalcPrimaryReference(renderer,reference,cache){
  assert.equal(cache.role,'native-calc-coordinate-reference');assert.equal(cache.pgfVersion,'3.1.11a');
  const raw=await renderer.page.evaluate(svg=>{
    const doc=new DOMParser().parseFromString(svg,'image/svg+xml');
    if(doc.querySelector('parsererror'))throw Error('Invalid original native SVG');
    const root=doc.documentElement,group=doc.querySelector('#page1 > g');
    const match=/^translate\(([-\d.]+),([-\d.]+)\)scale\(([-\d.]+),([-\d.]+)\)$/.exec(group?.getAttribute('transform')??'');
    if(!match)throw Error('Unexpected native transform');
    const paths=[...doc.querySelectorAll('path')];
    if(paths.length!==24||doc.querySelector('clipPath,use,text,[clip-path]'))throw Error('Unexpected native vocabulary');
    for(const p of paths)if(p.getAttribute('fill')!=='none'||p.hasAttribute('transform')||p.parentElement.getAttribute('stroke-width')!=='0.4'
      ||p.parentElement.parentElement.getAttribute('stroke')!=='#000'||p.parentElement.parentElement.parentElement!==group)
      throw Error('Unexpected native stroke inheritance');
    for(const e of doc.querySelectorAll('*'))for(const a of ['opacity','stroke-opacity','stroke-linecap','stroke-linejoin','stroke-dasharray','stroke-dashoffset'])
      if(e.hasAttribute(a))throw Error('Unexpected native paint');
    return{viewBox:root.getAttribute('viewBox').trim().split(/\s+/).map(Number),origin:{x:Number(match[1]),y:Number(match[2])},
      transform:group.getAttribute('transform'),paths:paths.map(p=>p.getAttribute('d'))};
  },reference);
  assert.ok(raw.viewBox.length===4&&raw.viewBox.every(Number.isFinite));
  const [x,y,w,h]=raw.viewBox,natural={x:(x-raw.origin.x)*4/3,y:(y-raw.origin.y)*4/3,width:w*4/3,height:h*4/3};
  const camera={x:Math.floor(natural.x)-8,y:Math.floor(natural.y)-8,
    width:Math.ceil(natural.x+natural.width)+8-(Math.floor(natural.x)-8),
    height:Math.ceil(natural.y+natural.height)+8-(Math.floor(natural.y)-8)};
  const m=parseTransform(raw.transform),world=[m[0]*4/3,m[1]*4/3,m[2]*4/3,m[3]*4/3,0,0];
  const regions=raw.paths.map((d,i)=>{
    const bounds=pathBounds(transformSegments(parsePath(d),world)),left=Math.max(0,Math.floor(bounds.minX-camera.x)-4),top=Math.max(0,Math.floor(bounds.minY-camera.y)-4);
    const right=Math.min(camera.width,Math.ceil(bounds.maxX-camera.x)+4),bottom=Math.min(camera.height,Math.ceil(bounds.maxY-camera.y)+4);
    assert.ok(right>left&&bottom>top);return{id:'native-paint-'+i,rectangle:{x:left,y:top,width:right-left,height:bottom-top},bounds};
  });
  const [minX,minY,maxX,maxY]=cache.pictureBoundsSp,factor=96/(72.27*65536);
  assert.deepEqual([maxX-minX,maxY-minY,0],cache.pictureBoxSp);
  const nativeBounds={x:minX*factor,y:-maxY*factor,width:(maxX-minX)*factor,height:(maxY-minY)*factor};
  const fixed=n=>{assert.ok(Number.isFinite(n));return(Math.abs(n)<.0000005?0:n).toFixed(6).replace(/\.?0+$/,'');};
  const serializedBounds=Object.fromEntries(Object.entries(nativeBounds).map(([k,v])=>[k,Number(fixed(v))]));
  const nativePaths=raw.paths.map(parsePath),normalPaths=nativePaths.map(pathData);
  // The independent writer expands H/V into primitive segments; dimensions
  // stay exactly those of the frozen native path, not candidate geometry.
  const prefix=box=>'<svg xmlns="http://www.w3.org/2000/svg" width="'+box.width+'px" height="'+box.height+'px" viewBox="'+[box.x,box.y,box.width,box.height].join(' ')+'" preserveAspectRatio="xMidYMid meet">';
  const path=(d,index,transform)=>'<path id="native-p'+index+'" d="'+d+'" transform="'+transform+'" fill="none" stroke="#000000" stroke-width="0.4" stroke-opacity="1" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="10"/>';
  const representations=[];
  for(const id of calcPrimaryContract.representations){
    const local=id!=='physical-paths-native-bounds',sx=id==='driver-local-origin'?m[0]*4/3:calcPrimaryContract.pathScale;
    const sy=id==='driver-local-origin'?m[3]*4/3:-calcPrimaryContract.pathScale;
    const transform='scale('+sx+' '+sy+')',box=local?natural:serializedBounds;
    const content=local?'<g transform="'+transform+'">'+normalPaths.map((d,i)=>path(d,i,'matrix(1 0 0 1 0 0)')).join('')+'</g>'
      :normalPaths.map((d,i)=>path(d,i,transform)).join('');
    representations.push({id,svg:prefix(box)+content+'</svg>',nativePaths:24,converterInvoked:false});
  }
  return{contract:calcPrimaryContract,raw,natural,camera,regions,nativeBounds,serializedBounds,representations};
}

export const calcPrimaryDefects=[
  {name:'missing-mark',target:'native-paint-2',path:2},
  {name:'quarter-pixel-shift',target:'native-paint-2',path:2},
  {name:'double-width',target:'native-paint-2',path:2},
  {name:'half-opacity',target:'native-paint-2',path:2},
  {name:'wrong-color',target:'native-paint-2',path:2},
  {name:'round-cap',target:'native-paint-2',path:2},
  {name:'wrong-curve-control',target:'native-paint-13',path:13},
  {name:'missing-circle',target:'native-paint-13',path:13},
  {name:'wrong-unit-scale',target:'native-paint-0',path:0},
  {name:'lost-half-clip',target:'native-paint-13',path:13,rendererOnly:true},
  {name:'cropped-root',target:'native-paint-18',path:18,naturalOnly:true},
  {name:'outside-ink',target:'whole-picture',expandedOnly:true}
];
export async function mutateCalcPrimary(renderer,svg,defect,frame){
  assert.ok(calcPrimaryDefects.some(d=>d.name===defect.name));
  return renderer.page.evaluate(({svg,defect,frame})=>{
    const doc=new DOMParser().parseFromString(svg,'image/svg+xml'),root=doc.documentElement,ns=root.namespaceURI;
    const p=defect.path===undefined?null:doc.querySelector('#native-p'+defect.path);
    if(defect.path!==undefined&&!p)throw Error('Missing native mutation path');
    const base=p?.getAttribute('transform');
    if(defect.name==='missing-mark'||defect.name==='missing-circle')p.remove();
    else if(defect.name==='quarter-pixel-shift')p.setAttribute('transform','translate(0.25 0) '+base);
    else if(defect.name==='double-width')p.setAttribute('stroke-width','0.8');
    else if(defect.name==='half-opacity')p.setAttribute('stroke-opacity','0.5');
    else if(defect.name==='wrong-color')p.setAttribute('stroke','#ff0000');
    else if(defect.name==='round-cap')p.setAttribute('stroke-linecap','round');
    else if(defect.name==='wrong-unit-scale')p.setAttribute('transform','scale(1.3333333333333333 -1.3333333333333333)');
    else if(defect.name==='wrong-curve-control'){
      const data=p.getAttribute('d'),changed=data.replace(/C([-\d.]+) ([-\d.]+)/,(_,x,y)=>'C'+(Number(x)+1)+' '+y);
      if(changed===data)throw Error('Curve mutation was not constructed');p.setAttribute('d',changed);
    }else if(defect.name==='cropped-root'){
      const view=root.getAttribute('viewBox').split(/\s+/).map(Number);view[2]-=3;
      root.setAttribute('viewBox',view.join(' '));root.setAttribute('width',view[2]+'px');
    }else if(defect.name==='outside-ink'){
      const mark=doc.createElementNS(ns,'path');mark.setAttribute('d','M'+(frame.camera.x+1)+' '+(frame.camera.y+1)+'h2v2h-2Z');
      mark.setAttribute('fill','#000');root.append(mark);
    }else if(defect.name==='lost-half-clip'){
      p.removeAttribute('clip-path');
    }else throw Error('Unknown defect');
    return new XMLSerializer().serializeToString(doc);
  },{svg,defect,frame});
}

export async function calcControlledClip(renderer,svg){
  return renderer.page.evaluate(svg=>{
    const doc=new DOMParser().parseFromString(svg,'image/svg+xml'),root=doc.documentElement,ns=root.namespaceURI;
    const p=doc.querySelector('#native-p13');if(!p)throw Error('No circle');
    const defs=doc.createElementNS(ns,'defs'),clip=doc.createElementNS(ns,'clipPath'),border=doc.createElementNS(ns,'path');
    clip.setAttribute('id','calibration-half-clip');clip.setAttribute('clipPathUnits','userSpaceOnUse');
    // Path-local TeX coordinates: the left half of this fixed native circle.
    border.setAttribute('d','M-1000 -1000H28.45274V1000H-1000Z');clip.append(border);defs.append(clip);root.prepend(defs);
    p.setAttribute('clip-path','url(#calibration-half-clip)');return new XMLSerializer().serializeToString(doc);
  },svg);
}
