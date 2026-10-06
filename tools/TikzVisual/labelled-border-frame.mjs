// Cameras and regions derive solely from frozen PGF records and original SVG.
import assert from 'node:assert/strict';
import {multiply,parseTransform,parsePath,transformSegments,pathBounds,unionBounds} from './shape-frame-math.mjs';

const spToCss=96/(72.27*65536);
export async function buildLabelledBorderFrame(renderer,{fixture,metrics},reference){
  const match=/<g stroke-miterlimit='10' transform='translate\(([-\d.]+),([-\d.]+)\)scale\(0\.996264,-0\.996264\)'>/.exec(reference);
  assert.ok(match,'Missing pinned driver wrapper origin.');const origin={x:Number(match[1]),y:Number(match[2])};
  const data=await renderer.page.evaluate(source=>{
    const d=new DOMParser().parseFromString(source,'image/svg+xml'),s=d.documentElement;
    if(d.querySelector('parsererror')||d.doctype||s.localName!=='svg')throw Error('Invalid original outlined SVG.');
    for(const e of d.querySelectorAll('*')){if(!['svg','g','defs','path','use'].includes(e.localName))throw Error('Unsupported native SVG element.');
      for(const a of e.attributes)if(a.name.startsWith('on')||a.localName==='style'||a.value.includes('url(')||(a.localName==='href'&&!/^#[\w.-]+$/.test(a.value)))throw Error('External or executable native SVG attribute.');}
    const inherited=(e,name,fallback)=>{for(let p=e;p&&p!==s;p=p.parentElement){const v=p.getAttribute(name);if(v!==null)return v;}return fallback;};
    const transforms=e=>{const a=[];for(let p=e;p&&p!==s;p=p.parentElement){const t=p.getAttribute('transform');if(t)a.unshift(t);}return a;};
    let owner=-1;const paths=[],uses=[];
    for(const e of d.querySelectorAll('path,use')){if(e.closest('defs'))continue;
      if(e.localName==='path'){owner++;paths.push({d:e.getAttribute('d'),width:Number(inherited(e,'stroke-width','1')),miter:Number(inherited(e,'stroke-miterlimit','4')),join:inherited(e,'stroke-linejoin','miter'),cap:inherited(e,'stroke-linecap','butt')});}
      else uses.push({owner,href:[...e.attributes].find(a=>a.localName==='href').value,x:Number(e.getAttribute('x')??0),y:Number(e.getAttribute('y')??0),transforms:transforms(e)});
    }
    return{view:s.getAttribute('viewBox').split(/[ ,]+/).map(Number),paths,uses,definitions:[...d.querySelectorAll('defs path')].map(p=>({id:p.id,d:p.getAttribute('d')}))};
  },reference);
  assert.equal(data.paths.length,metrics.paths.length);assert.ok(data.uses.every(u=>u.owner>=0&&u.owner<metrics.nodes.length));
  const normalize=[4/3,0,0,4/3,-origin.x*4/3,-origin.y*4/3],definitions=new Map(data.definitions.map(p=>[p.id,parsePath(p.d)]));
  const contributions=[];
  for(let i=0;i<metrics.paths.length;i++){
    const p=metrics.paths[i],paint=data.paths[i],points=[];let corner=null;
    for(const token of p.segments){const q=token.point;
      if(token.kind==='rectsize'){assert.ok(corner);points.push({x:corner.xSp+q.xSp,y:corner.ySp+q.ySp,endpoint:true},{x:corner.xSp+q.xSp,y:corner.ySp,endpoint:true},{x:corner.xSp,y:corner.ySp+q.ySp,endpoint:true});}
      else{points.push({x:q.xSp,y:q.ySp,endpoint:!['control1','control2'].includes(token.kind)});if(token.kind==='rectcorner')corner=q;}
    }
    const css=points.map(p=>({minX:p.x*spToCss,maxX:p.x*spToCss,minY:-p.y*spToCss,maxY:-p.y*spToCss})),b=unionBounds(css);
    assert.equal(paint.miter,10);assert.equal(paint.cap,'butt');assert.equal(paint.join,'miter');
    const padding=p.lineWidthSp*spToCss*paint.miter/2;
    const bound={minX:b.minX-padding,minY:b.minY-padding,maxX:b.maxX+padding,maxY:b.maxY+padding};
    contributions.push({id:'path-'+i,kind:p.owner==='drawing'?'connection':'background',nodeId:p.owner==='drawing'?null:p.owner.slice(5),nativePathIndex:i,bound,framing:'conservative native control box plus maximum miter radius'});
    const endpoints=points.filter(p=>p.endpoint),seen=new Set();
    // Rectangles use explicit derived corners above; all endpoint windows stay fixed.
    for(const q of endpoints){const key=q.x+','+q.y;if(seen.has(key))continue;seen.add(key);const x=q.x*spToCss,y=-q.y*spToCss;
      contributions.push({id:'path-'+i+'.endpoint-'+(seen.size-1),kind:'endpoint',nodeId:p.owner==='drawing'?null:p.owner.slice(5),nativePathIndex:i,bound:{minX:x-3,minY:y-3,maxX:x+3,maxY:y+3},framing:'native point with fixed three-CSS-pixel radius'});}
  }
  for(let i=0;i<data.uses.length;i++){
    const u=data.uses[i],outline=definitions.get(u.href.slice(1));assert.ok(outline,'Missing original glyph definition.');
    const matrix=multiply(u.transforms.reduce((m,t)=>multiply(m,parseTransform(t)),normalize),[1,0,0,1,u.x,u.y]);
    contributions.push({id:'glyph-'+i,kind:'glyph',nodeId:metrics.nodes[u.owner].id,glyphIndex:i,outline:u.href,bound:pathBounds(transformSegments(outline,matrix)),framing:'original outlined glyph under original affine frame'});
  }
  const v=data.view;assert.equal(v.length,4);assert.ok(v.every(Number.isFinite));
  const driverRoot={minX:(v[0]-origin.x)*4/3,minY:(v[1]-origin.y)*4/3,maxX:(v[0]+v[2]-origin.x)*4/3,maxY:(v[1]+v[3]-origin.y)*4/3};
  const b=metrics.pictureBounds,picture={minX:b.minXSp*spToCss,minY:-b.maxYSp*spToCss,maxX:b.maxXSp*spToCss,maxY:-b.minYSp*spToCss};
  const frame=unionBounds([driverRoot,picture,...contributions.map(c=>c.bound)]),x=Math.floor(frame.minX)-8,y=Math.floor(frame.minY)-8;
  const camera={x,y,width:Math.ceil(frame.maxX)-x+8,height:Math.ceil(frame.maxY)-y+8};assert.ok(camera.width*camera.height*16<=20000000);
  const regions=contributions.map(c=>{const b=c.bound,x=Math.max(0,Math.floor(b.minX-camera.x-2)),y=Math.max(0,Math.floor(b.minY-camera.y-2));
    return{...c,rectangle:{x,y,width:Math.min(camera.width,Math.ceil(b.maxX-camera.x+2))-x,height:Math.min(camera.height,Math.ceil(b.maxY-camera.y+2))-y}};});
  assert.equal(new Set(regions.map(r=>r.id)).size,regions.length);assert.ok(regions.every(r=>r.rectangle.width>0&&r.rectangle.height>0));
  return{caseId:fixture.id,origin,camera,regions,driverRoot,picture,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,glyphs:data.uses.length};
}
