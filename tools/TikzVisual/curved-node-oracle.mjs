// Independent fixed curved-node geometry. Original outlines and native PGF/DVI
// measurements only; no converter assembly, helpers, scene or font resources.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {multiply,parseTransform,parsePath,transformPoint,transformSegments,pathBounds,pathData,closedCurveStrokeBounds,unionBounds,containment} from './shape-frame-math.mjs';
const spToCss=96/(72.27*65536);
export async function reconstructCurvedNodes(renderer,folder,derivation){
  const reference=await readFile(path.join(folder,'reference.svg'),'utf8'),native=JSON.parse(await readFile(path.join(folder,'metrics.json'))),glyphs=JSON.parse(await readFile(path.join(folder,'native-glyphs.json')));
    const metadata=await renderer.page.evaluate(reference=>{
      const documentSvg=new DOMParser().parseFromString(reference,'image/svg+xml');
      if(documentSvg.querySelector('parsererror')||documentSvg.querySelector('clipPath'))throw new Error('Invalid or out-of-scope original SVG.');
      const svg=document.importNode(documentSvg.documentElement,true);document.body.append(svg);
      const inherited=(e,name,fallback)=>{for(let p=e;p;p=p.parentElement)if(p.hasAttribute(name))return p.getAttribute(name);return fallback;};
      const transforms=e=>{const result=[];for(let p=e;p&&p!==svg;p=p.parentElement)if(p.hasAttribute('transform'))result.unshift(p.getAttribute('transform'));return result;};
      const bbox=e=>{const b=e.getBBox();return{minX:b.x,minY:b.y,maxX:b.x+b.width,maxY:b.y+b.height};};
      try{return{
        definitions:[...svg.querySelectorAll('defs path')].map(p=>({id:p.id,d:p.getAttribute('d'),browserBounds:bbox(p)})),
        paths:[...svg.querySelectorAll('path')].filter(p=>!p.closest('defs')).map(p=>({d:p.getAttribute('d'),transforms:transforms(p),fill:inherited(p,'fill','black'),stroke:inherited(p,'stroke','none'),
          width:Number(inherited(p,'stroke-width','1')),join:inherited(p,'stroke-linejoin','miter'),cap:inherited(p,'stroke-linecap','butt'),miter:Number(inherited(p,'stroke-miterlimit','4'))})),
        uses:[...svg.querySelectorAll('use')].map(u=>({href:[...u.attributes].find(a=>a.localName==='href').value,x:Number(u.getAttribute('x')??0),y:Number(u.getAttribute('y')??0),
          transforms:transforms(u),fill:inherited(u,'fill','black'),stroke:inherited(u,'stroke','none')}))};
      }finally{svg.remove();}
    },reference);
    assert.equal(metadata.paths.length,28);assert.equal(metadata.uses.length,70);
    const normalize=[4/3,0,0,4/3,-derivation.originBp.x*4/3,-derivation.originBp.y*4/3];
    const cumulative=transforms=>transforms.reduce((matrix,text)=>multiply(matrix,parseTransform(text)),normalize);
    const definitions=new Map(metadata.definitions.map(p=>[p.id,{...p,segments:parsePath(p.d)}]));
    const records=[],browserInputs=metadata.definitions.map(p=>({id:'outline-'+p.id,d:p.d,expected:pathBounds(parsePath(p.d))}));
    let useIndex=0;
    for(let i=0;i<native.nodes.length;i++){
      const n=native.nodes[i],p=metadata.paths[i];assert.equal(n.id,glyphs.nodes[i].id);
      assert.equal(p.fill,'none');assert.equal(p.stroke,'#000');assert.equal(p.cap,'butt');assert.equal(p.join,'miter');
      const data=n.path.map(t=>t.kind==='close'?'Z':(t.kind==='move'?'M':t.kind==='control1'?'C':'')+`${t.point.xSp*spToCss} ${-t.point.ySp*spToCss}`).join(' ');
      const nativeSegments=parsePath(data),nativeStroke=closedCurveStrokeBounds(nativeSegments,n.values.linewidth*spToCss,p.miter);
      const matrix=cumulative(p.transforms),driverSegments=transformSegments(parsePath(p.d),matrix),sx=Math.hypot(matrix[0],matrix[1]),sy=Math.hypot(matrix[2],matrix[3]);
      assert.ok(Math.abs(sx-sy)<1e-12&&Math.abs(matrix[0]*matrix[2]+matrix[1]*matrix[3])<1e-12,'Driver background pen must be uniform.');
      const driverStroke=closedCurveStrokeBounds(driverSegments,p.width*sx,p.miter);
      records.push({id:'shape-'+n.id,nodeId:n.id,kind:'background',native:nativeStroke.stroke,driver:driverStroke.stroke,
        evidence:{nativeGeometry:nativeStroke.geometry,driverGeometry:driverStroke.geometry,nativeRadius:nativeStroke.radius,driverRadius:driverStroke.radius,nativeJoins:nativeStroke.joins,driverJoins:driverStroke.joins}});
      browserInputs.push({id:'native-shape-'+n.id,d:pathData(nativeSegments),expected:nativeStroke.geometry},{id:'driver-shape-'+n.id,d:pathData(driverSegments),expected:driverStroke.geometry});
      const f=n.frame;
      for(let j=0;j<glyphs.nodes[i].glyphs.length;j++){
        const g=glyphs.nodes[i].glyphs[j],use=metadata.uses[useIndex],outline=definitions.get(use.href.slice(1));assert.ok(outline,'Missing original glyph outline.');
        assert.equal(use.fill,'#000');assert.equal(use.stroke,'none');assert.equal(Number(use.href.split('-').at(-1)),g.slot);
        const driverMatrix=multiply(cumulative(use.transforms),[1,0,0,1,use.x,use.y]);
        const nativeMatrix=[f.a*4/3,-f.b*4/3,-f.c*4/3,f.d*4/3,(f.eSp+f.a*g.xSp-f.c*g.ySp)*spToCss,-(f.fSp+f.b*g.xSp-f.d*g.ySp)*spToCss];
        const nativeSegments=transformSegments(outline.segments,nativeMatrix),driverSegments=transformSegments(outline.segments,driverMatrix),local=pathBounds(outline.segments);
        const corners=[[local.minX,local.minY],[local.maxX,local.minY],[local.minX,local.maxY],[local.maxX,local.maxY]].map(([x,y])=>transformPoint(nativeMatrix,{x,y}));
        const transformedBox=unionBounds(corners.map(p=>({minX:p.x,minY:p.y,maxX:p.x,maxY:p.y})));
        const nativeBounds=pathBounds(nativeSegments),driverBounds=pathBounds(driverSegments);
        records.push({id:'glyph-'+useIndex,nodeId:n.id,kind:'glyph',glyphIndex:j,font:g.font,slot:g.slot,outline:use.href,native:nativeBounds,driver:driverBounds,
          evidence:{nativeMatrix,driverMatrix,transformedLocalBox:transformedBox,boxOverstatement:{left:nativeBounds.minX-transformedBox.minX,top:nativeBounds.minY-transformedBox.minY,right:transformedBox.maxX-nativeBounds.maxX,bottom:transformedBox.maxY-nativeBounds.maxY}}});
        browserInputs.push({id:'native-glyph-'+useIndex,d:pathData(nativeSegments),expected:nativeBounds},{id:'driver-glyph-'+useIndex,d:pathData(driverSegments),expected:driverBounds});useIndex++;
      }
    }
    assert.equal(records.length,98);assert.equal(useIndex,70);
    const nativeInk=unionBounds(records.map(r=>r.native)),driverInk=unionBounds(records.map(r=>r.driver)),b=native.pictureBounds,v=derivation.originalViewBoxBp,o=derivation.originBp;
    const picture={minX:b.minXSp*spToCss,minY:-b.maxYSp*spToCss,maxX:b.maxXSp*spToCss,maxY:-b.minYSp*spToCss};
    const driverRoot={minX:(v[0]-o.x)*4/3,minY:(v[1]-o.y)*4/3,maxX:(v[0]+v[2]-o.x)*4/3,maxY:(v[1]+v[3]-o.y)*4/3};
    const outward=b=>({minX:Math.floor(b.minX*1e6)/1e6,minY:Math.floor(b.minY*1e6)/1e6,maxX:Math.ceil(b.maxX*1e6)/1e6,maxY:Math.ceil(b.maxY*1e6)/1e6});
    const canonicalNative=outward(unionBounds([picture,nativeInk])),canonicalDriver=outward(unionBounds([driverRoot,driverInk]));
    const base=unionBounds([canonicalNative,canonicalDriver]),camera={x:base.minX-4,y:base.minY-4,width:Math.ceil(base.maxX-base.minX+8),height:Math.ceil(base.maxY-base.minY+8)};
    assert.ok(camera.width*camera.height*16<=20000000,'Frame-inspection canvas exceeds its bound.');
    const checks=records.map(r=>({...r,driverInOriginalRoot:containment(r.driver,driverRoot,1e-9),nativeInPicture:containment(r.native,picture,1e-9),nativeInDriverRoot:containment(r.native,driverRoot,1e-9),nativeInCanonical:containment(r.native,canonicalNative),driverInCanonical:containment(r.driver,canonicalDriver)}));
  const frames={picture,driverRoot,nativeInk,driverInk,canonicalNative,canonicalDriver};
  const semantic=unionBounds([picture,nativeInk]),rootValues=[semantic.minX,semantic.minY,semantic.maxX-semantic.minX,semantic.maxY-semantic.minY],serialized=rootValues.map(v=>v.toFixed(6));
  const rootChecks=rootValues.map((value,i)=>({quantity:['x','y','width','height'][i],expected:value,serialized:Number(serialized[i]),error:Math.abs(value-Number(serialized[i])),limit:.000000500001,passed:Math.abs(value-Number(serialized[i]))<=.000000500001}));
  assert.ok(rootChecks.every(c=>c.passed));assert.ok(checks.every(c=>c.nativeInPicture.passed));
  const regions=checks.map(c=>{const b=unionBounds([c.native,c.driver]),x=Math.max(0,Math.floor(b.minX-camera.x-3)),y=Math.max(0,Math.floor(b.minY-camera.y-3));return{id:c.id,nodeId:c.nodeId,kind:c.kind,font:c.font??null,slot:c.slot??null,rectangle:{x,y,width:Math.min(camera.width,Math.ceil(b.maxX-camera.x+3))-x,height:Math.min(camera.height,Math.ceil(b.maxY-camera.y+3))-y}};});
  const nativeSix=await readFile(path.join(folder,'native-css-6.svg'),'utf8');
  const semanticSvg=await renderer.page.evaluate(({source,values})=>{const d=new DOMParser().parseFromString(source,'image/svg+xml'),s=d.documentElement,before=s.innerHTML;if(d.querySelector('parsererror')||d.doctype)throw Error('Invalid independent SVG.');s.setAttribute('width',values[2]+'px');s.setAttribute('height',values[3]+'px');s.setAttribute('viewBox',values.join(' '));if(s.innerHTML!==before)throw Error('Changed drawing instructions.');return new XMLSerializer().serializeToString(s);},{source:nativeSix,values:serialized});
  const indexes={period:Number(regions.find(r=>r.nodeId==='c-period'&&r.kind==='glyph').id.slice(6)),font:Number(regions.find(r=>r.nodeId==='c-font'&&r.kind==='glyph').id.slice(6)),regular:checks.filter(r=>r.kind==='background').findIndex(r=>r.nodeId==='c-regular')};
  // Match the existing JSON evidence convention, which represents -0 as 0.
  return JSON.parse(JSON.stringify({reference,nativeSix,semanticSvg,origin:derivation.originBp,frames,checks,camera,regions,semantic,rootChecks,indexes}));
}
