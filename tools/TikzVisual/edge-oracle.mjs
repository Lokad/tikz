// Native evidence only. No converter scene, production font data or SVG writer.
import assert from 'node:assert/strict';
import {shortNativeDimension} from './curved-node-path-units.mjs';

export const edgeSpToCss=96/(72.27*65536),edgePtToCss=96/72.27;
const away=x=>Math.sign(x)*Math.round(Math.abs(x));
export const edgeDecimal=(x,places)=>{assert.ok(Number.isFinite(x));const v=away(x*10**places)/10**places;return v===0?'0':v.toFixed(places).replace(/0+$/,'').replace(/\.$/,'');};
export const edgeOracleVariants=[
  {name:'driver-normalized',paths:'original',glyphs:'original'},
  {name:'native-pt-short-glyph-six',paths:'pt-short',glyphs:6},
  {name:'native-pt-short-glyph-twelve',paths:'pt-short',glyphs:12},
  {name:'native-pt-twelve-glyph-twelve',paths:'pt-twelve',glyphs:12},
  {name:'native-css-six-glyph-six',paths:'css-six',glyphs:6}
];
export const edgeOracleRoots=['driver-root-twelve','native-picture-six','native-ink-six'];

export function nativeEdgeSegments(path){
  assert.ok(Array.isArray(path.segments)&&path.segments.length>0&&path.segments.length<=4096);
  const result=[];let current=null,start=null,controls=[];
  const point=t=>{assert.ok(Number.isSafeInteger(t.xSp)&&Number.isSafeInteger(t.ySp)&&Math.abs(t.xSp)<=1073741823&&Math.abs(t.ySp)<=1073741823);return{x:t.xSp,y:t.ySp};};
  const add=(kind,to,c1,c2)=>{assert.ok(current||kind==='move','Drawing requires a native move.');result.push({kind,from:current,to,...(c1?{c1,c2}:{})});current=to;if(kind==='move')start=to;};
  for(const t of path.segments){const p=point(t);
    if(t.kind==='control1'){assert.ok(current&&controls.length===0);controls.push(p);continue;}
    if(t.kind==='control2'){assert.equal(controls.length,1);controls.push(p);continue;}
    if(t.kind==='curve'){assert.equal(controls.length,2);add('cubic',p,...controls);controls=[];continue;}
    assert.equal(controls.length,0,'Incomplete native cubic controls.');
    switch(t.kind){
      case'move':add('move',p);break;
      case'line':add('line',p);break;
      case'close':assert.ok(start);add('close',start);break;
      case'rectcorner':add('move',p);break;
      case'rectsize':assert.ok(start&&current===start);add('line',{x:start.x+p.x,y:start.y});add('line',{x:start.x+p.x,y:start.y+p.y});add('line',{x:start.x,y:start.y+p.y});add('close',start);break;
      default:throw Error('Unsupported native edge token: '+t.kind);
    }
  }
  assert.equal(controls.length,0,'Incomplete final native cubic.');
  for(const s of result)for(const p of[s.to,s.c1,s.c2].filter(Boolean))assert.ok(Number.isSafeInteger(p.x)&&Number.isSafeInteger(p.y)&&Math.abs(p.x)<=1073741823&&Math.abs(p.y)<=1073741823);
  return result;
}
export function edgeNativeFrame(node){
  assert.equal(node.frame.length,6);const f=node.frame.map((text,i)=>{
    assert.match(text,i<4?/^-?(?:\d+)(?:\.\d+)?$/:/^-?(?:\d+)(?:\.\d+)?pt$/);
    const value=Number(i<4?text:text.slice(0,-2));assert.ok(Number.isFinite(value));return i<4?value:away(value*65536);
  });return{a:f[0],b:f[1],c:f[2],d:f[3],eSp:f[4],fSp:f[5]};
}
export function edgeGlyphMatrix(frame,glyph){
  assert.ok(Number.isSafeInteger(glyph.xSp)&&Number.isSafeInteger(glyph.ySp));
  const f=frame;return[f.a*4/3,-f.b*4/3,-f.c*4/3,f.d*4/3,
    (f.eSp+f.a*glyph.xSp-f.c*glyph.ySp)*edgeSpToCss,-(f.fSp+f.b*glyph.xSp-f.d*glyph.ySp)*edgeSpToCss];
}

export async function readEdgeOriginal(renderer,reference,metrics,glyphs){
  const metadata=await renderer.page.evaluate(source=>{
    const d=new DOMParser().parseFromString(source,'image/svg+xml'),s=d.documentElement;
    if(d.querySelector('parsererror')||d.doctype||s.localName!=='svg')throw Error('Invalid original edge SVG.');
    const ids=new Set();
    for(const e of d.querySelectorAll('*')){
      if(e.namespaceURI!=='http://www.w3.org/2000/svg'||!['svg','g','defs','path','use','clipPath'].includes(e.localName))throw Error('Unsupported original edge element.');
      if(e.id){if(ids.has(e.id))throw Error('Repeated original SVG identity.');ids.add(e.id);}
      for(const a of e.attributes){if(a.name.toLowerCase().startsWith('on')||['style','base'].includes(a.localName))throw Error('Executable SVG attribute.');
        if(a.value.includes('url(')&&!(a.localName==='clip-path'&&/^url\(#[\w.-]+\)$/.test(a.value)))throw Error('External SVG reference.');
        if(a.localName==='href'&&!/^#[\w.-]+$/.test(a.value))throw Error('External SVG glyph.');}
      if(e.hasAttribute('opacity'))throw Error('Group opacity is outside the fixed edge profile.');
    }
    const inherited=(e,key,fallback)=>{for(let p=e;p&&p!==s;p=p.parentElement){const v=p.getAttribute(key);if(v!==null)return v;}return fallback;};
    const clipIds=e=>{const result=[];for(let p=e;p&&p!==s;p=p.parentElement){const v=p.getAttribute('clip-path');if(v)result.unshift(/^url\(#([\w.-]+)\)$/.exec(v)[1]);}return result;};
    const keys={fill:'black',stroke:'none','stroke-width':'1','stroke-linecap':'butt','stroke-linejoin':'miter','stroke-miterlimit':'4',
      'stroke-dasharray':'none','stroke-dashoffset':'0','fill-rule':'nonzero','fill-opacity':'1','stroke-opacity':'1'};
    const paths=[],uses=[],operations=[];
    for(const e of d.querySelectorAll('path,use')){if(e.closest('defs')||e.closest('clipPath'))continue;
      const paint=Object.fromEntries(Object.entries(keys).map(([k,v])=>[k,inherited(e,k,v)]));
      if(e.localName==='path'){operations.push({kind:'path',index:paths.length});paths.push({d:e.getAttribute('d'),paint,clips:clipIds(e)});}
      else{operations.push({kind:'glyph',index:uses.length});uses.push({href:[...e.attributes].find(a=>a.localName==='href').value,paint,clips:clipIds(e)});}
    }
    const clips=[...d.querySelectorAll('clipPath')].map(e=>{if(e.children.length!==1||e.firstElementChild.localName!=='path')throw Error('Unsupported original clip.');
      return{id:e.id,d:e.firstElementChild.getAttribute('d'),rule:inherited(e.firstElementChild,'clip-rule','nonzero')};});
    const definitions=[...d.querySelectorAll('defs path')].map(e=>({id:e.id,d:e.getAttribute('d')}));
    return{operations,paths,uses,clips,definitions};
  },reference);
  const paints=metrics.driverState.paints,paths=new Map(metrics.paths.map(p=>[p.index,p])),clipCalls=metrics.physicalOrder.allPathCalls
    .map(id=>paths.get(id)).filter(p=>p.modes.includes('clip'));
  assert.equal(metadata.paths.length,paints.length);assert.equal(metadata.clips.length,clipCalls.length);assert.equal(glyphs.nodes.length,metrics.nodes.length);
  const clipMap=new Map(metadata.clips.map((c,i)=>[c.id,i]));assert.ok(metadata.clips.every(c=>c.rule==='nonzero'),'This fixed corpus uses nonzero clipping.');
  const expected=[];let use=0;
  const backgrounds=metrics.physicalOrder.nodeBackgroundCalls;
  if(backgrounds){assert.deepEqual(backgrounds,metrics.physicalOrder.allPathCalls);assert.equal(clipCalls.length,0);}
  const paintIndices=new Map(paints.map((p,i)=>[p.pathId,i]));
  if(backgrounds)assert.equal(paintIndices.size,paints.length);
  const events=backgrounds?backgrounds.map(id=>({id,i:paintIndices.get(id)})):paints.map((p,i)=>({id:p.pathId,i}));
  for(const {id,i}of events){
    const native=paths.get(id);assert.ok(native);
    const clips=i===undefined?[]:paints[i].clips;
    if(i!==undefined){expected.push({kind:'path',index:i});assert.deepEqual(metadata.paths[i].clips.map(c=>clipMap.get(c)),clips);}
    else assert.ok(backgrounds&&native.owner.startsWith('node-')&&native.modes.length===0,'Only unpainted node backgrounds may omit a paint.');
    if(native.owner.startsWith('node-')){
      const j=metrics.nodes.findIndex(n=>'node-'+n.id===native.owner);assert.ok(j>=0);assert.equal(glyphs.nodes[j].id,metrics.nodes[j].id);
      for(const g of glyphs.nodes[j].glyphs){const u=metadata.uses[use],match=/^#(g\d+)-(\d+)$/.exec(u?.href??'');assert.ok(match);
        assert.equal(Number(match[2]),g.slot);assert.equal(glyphs.svgFontDefinitions[match[1]],g.font);assert.ok(metadata.definitions.some(d=>d.id===match[0].slice(1)));
        assert.deepEqual(u.clips.map(c=>clipMap.get(c)),clips);expected.push({kind:'glyph',index:use++});}
    }
  }
  assert.equal(use,metadata.uses.length);assert.deepEqual(metadata.operations,expected);
  return{...metadata,clipCalls:clipCalls.map(p=>p.index),clipMap:Object.fromEntries(clipMap)};
}

export function edgeOracleInstructions(metrics,glyphs,original,variant){
  assert.ok(edgeOracleVariants.some(v=>JSON.stringify(v)===JSON.stringify(variant)));
  if(variant.paths==='original')return{original:true,paths:[],glyphs:[],clips:[],checks:[]};
  const checks=[],css=variant.paths==='css-six',sourcePaths=new Map(metrics.paths.map(p=>[p.index,p]));
  const record=(quantity,expected,serialized,limit,extra={})=>{const actual=Number(serialized),delta=Math.abs(actual-expected),passed=Number.isFinite(actual)&&delta<=limit
    &&(extra.recoveredSp===undefined||extra.recoveredSp===extra.sourceSp);assert.ok(passed,'Independent edge serialization: '+quantity);
    checks.push({quantity,expected,serialized,delta,limit,passed,...extra});return serialized;};
  const coordinate=(sp,axis,name)=>{
    assert.ok(Number.isSafeInteger(sp));const value=css?(axis==='y'?-sp:sp)*edgeSpToCss:sp/65536;
    const text=variant.paths==='pt-short'?shortNativeDimension(sp):edgeDecimal(value,css?6:12);
    return record(name,value,text,variant.paths==='pt-short'?1/(2*65536)+1e-12:css?.000000500001:2e-12,
      css?{sourceSp:sp}:{sourceSp:sp,recoveredSp:away(Number(text)*65536)});
  };
  function data(path,prefix){return nativeEdgeSegments(path).map((s,i)=>{
    const p=(q,role)=>coordinate(q.x,'x',prefix+'.'+i+'.'+role+'.x')+' '+coordinate(q.y,'y',prefix+'.'+i+'.'+role+'.y');
    return s.kind==='close'?'Z':s.kind==='move'?'M'+p(s.to,'end'):s.kind==='line'?'L'+p(s.to,'end'):'C'+p(s.c1,'control1')+' '+p(s.c2,'control2')+' '+p(s.to,'end');
  }).join(' ');}
  const transform=css?null:'scale('+edgePtToCss+' '+(-edgePtToCss)+')';
  const paths=metrics.driverState.paints.map((p,i)=>{
    assert.ok(Number.isSafeInteger(p.widthSp)&&p.widthSp>0);assert.ok([0,1,2].includes(p.cap)&&[0,1,2].includes(p.join));
    const paint={...original.paths[i].paint};
    assert.equal(paint['fill-rule'],'nonzero');
    paint['stroke-width']=coordinate(p.widthSp,'x','paint-'+p.pathId+'.width');
    paint['stroke-linecap']=['butt','round','square'][p.cap];paint['stroke-linejoin']=['miter','round','bevel'][p.join];
    paint['stroke-miterlimit']=record('paint-'+p.pathId+'.miter',p.miter,edgeDecimal(p.miter,12),2e-12);
    paint['stroke-opacity']=record('paint-'+p.pathId+'.strokeOpacity',p.strokeOpacity,edgeDecimal(p.strokeOpacity,12),2e-12);
    paint['fill-opacity']=record('paint-'+p.pathId+'.fillOpacity',p.fillOpacity,edgeDecimal(p.fillOpacity,12),2e-12);
    assert.ok(p.dashSp.every(v=>Number.isSafeInteger(v)&&v>=0));
    paint['stroke-dasharray']=p.dashSp.length?p.dashSp.map((sp,j)=>coordinate(sp,'x','paint-'+p.pathId+'.dash.'+j)).join(' '):'none';
    paint['stroke-dashoffset']=coordinate(p.dashPhaseSp,'x','paint-'+p.pathId+'.dashPhase');
    assert.equal(p.operation,paint.fill==='none'?'stroke':paint.stroke==='none'?'fill':'fillstroke');
    return{id:'oracle-path-'+i,nativePathId:p.pathId,d:data(sourcePaths.get(p.pathId),'path-'+p.pathId),paint,transform,clips:p.clips};
  });
  const clips=original.clipCalls.map((id,i)=>({id:'oracle-clip-'+i,nativePathId:id,d:data(sourcePaths.get(id),'clip-'+i),rule:original.clips[i].rule,transform}));
  const emitted=[];let index=0;
  for(let i=0;i<metrics.nodes.length;i++){
    const frame=edgeNativeFrame(metrics.nodes[i]);
    for(const g of glyphs.nodes[i].glyphs){const values=edgeGlyphMatrix(frame,g),u=original.uses[index];
      const matrix=values.map((v,k)=>record('glyph-'+index+'.matrix.'+k,v,edgeDecimal(v,variant.glyphs),10**(-variant.glyphs)/2+2e-12));
      emitted.push({id:'oracle-glyph-'+index,href:u.href,paint:u.paint,matrix,clips:u.clips.map(c=>original.clipMap[c]),nodeId:metrics.nodes[i].id,font:g.font,slot:g.slot});index++;
    }
  }
  assert.equal(emitted.length,original.uses.length);return{original:false,paths,glyphs:emitted,clips,checks};
}

export async function makeEdgeOracleSvg(renderer,reference,original,instructions,frame,rootMode){
  assert.ok(edgeOracleRoots.includes(rootMode));const box=rootMode==='driver-root-twelve'?frame.driverRoot:rootMode==='native-picture-six'?frame.picture:frame.root;
  const places=rootMode==='driver-root-twelve'?12:6,values=[box.minX,box.minY,box.maxX-box.minX,box.maxY-box.minY];assert.ok(values[2]>0&&values[3]>0);
  const root=values.map(v=>edgeDecimal(v,places)),rootChecks=values.map((v,i)=>({quantity:['x','y','width','height'][i],expected:v,serialized:root[i],delta:Math.abs(v-Number(root[i])),
    limit:10**(-places)/2+2e-12,passed:Math.abs(v-Number(root[i]))<=10**(-places)/2+2e-12}));assert.ok(rootChecks.every(c=>c.passed));
  const result=await renderer.page.evaluate(({source,original,instructions,origin,root})=>{
    const d=new DOMParser().parseFromString(source,'image/svg+xml'),s=d.documentElement,ns='http://www.w3.org/2000/svg';
    if(d.querySelector('parsererror')||d.doctype)throw Error('Invalid independent edge SVG.');
    const definitions=()=>[...s.querySelectorAll('defs path')].filter(e=>!e.closest('clipPath')).map(e=>({id:e.id,d:e.getAttribute('d')})),before=definitions();
    if(instructions.original){const g=d.createElementNS(ns,'g');g.setAttribute('transform','matrix('+(4/3)+' 0 0 '+(4/3)+' '+(-origin.x*4/3)+' '+(-origin.y*4/3)+')');while(s.firstChild)g.append(s.firstChild);s.append(g);}
    else{
      const defs=d.createElementNS(ns,'defs');for(const e of s.querySelectorAll('defs path'))defs.append(e.cloneNode(true));
      for(const p of instructions.clips){const clip=d.createElementNS(ns,'clipPath'),path=d.createElementNS(ns,'path');clip.id=p.id;clip.setAttribute('clipPathUnits','userSpaceOnUse');
        path.setAttribute('d',p.d);path.setAttribute('clip-rule',p.rule);if(p.transform)path.setAttribute('transform',p.transform);clip.append(path);defs.append(clip);}
      s.replaceChildren(defs);
      for(const op of original.operations){const p=op.kind==='path'?instructions.paths[op.index]:instructions.glyphs[op.index],e=d.createElementNS(ns,op.kind==='path'?'path':'use');
        e.id=p.id;for(const[k,v]of Object.entries(p.paint))e.setAttribute(k,v);
        if(op.kind==='path'){e.setAttribute('d',p.d);if(p.transform)e.setAttribute('transform',p.transform);}
        else{e.setAttribute('href',p.href);e.setAttribute('transform','matrix('+p.matrix.join(' ')+')');}
        let parent=s;for(const clip of p.clips){const g=d.createElementNS(ns,'g');g.setAttribute('clip-path','url(#oracle-clip-'+clip+')');parent.append(g);parent=g;}parent.append(e);
      }
    }
    s.setAttribute('width',root[2]+'px');s.setAttribute('height',root[3]+'px');s.setAttribute('viewBox',root.join(' '));
    if(JSON.stringify(before)!==JSON.stringify(definitions()))throw Error('Original glyph outlines changed.');
    return{svg:new XMLSerializer().serializeToString(s),drawing:s.innerHTML,definitions:before};
  },{source:reference,original,instructions,origin:frame.origin,root});
  return{...result,rootChecks,root:{mode:rootMode,values:root.map(Number)}};
}
