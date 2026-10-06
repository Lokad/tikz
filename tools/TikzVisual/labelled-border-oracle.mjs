// Independent representations of frozen PGF paths, DVI glyph positions and
// original outlines/paint. No converter, scene or production font data.
import assert from 'node:assert/strict';
import {shortNativeDimension} from './curved-node-path-units.mjs';

const ptToCss=96/72.27,spToCss=ptToCss/65536;
const away=n=>Math.sign(n)*Math.round(Math.abs(n));
const decimal=(n,places)=>{assert.ok(Number.isFinite(n));const v=away(n*10**places)/10**places;return v===0?'0':v.toFixed(places).replace(/0+$/,'').replace(/\.$/,'');};
export const labelledOracleVariants=[
  {name:'driver-normalized',paths:'original',glyphs:'original'},
  {name:'native-pt-short-glyph-six',paths:'pt-short',glyphs:6},
  {name:'native-pt-short-glyph-twelve',paths:'pt-short',glyphs:12},
  {name:'native-pt-twelve-glyph-twelve',paths:'pt-twelve',glyphs:12},
  {name:'native-css-six-glyph-six',paths:'css-six',glyphs:6}
];
export const labelledOracleRoots=['driver-root-twelve','native-picture-six'];

export async function readLabelledOriginal(renderer,reference,metrics,glyphs,frame){
  const metadata=await renderer.page.evaluate(source=>{
    const d=new DOMParser().parseFromString(source,'image/svg+xml'),s=d.documentElement;
    if(d.querySelector('parsererror')||d.doctype||s.localName!=='svg')throw Error('Invalid original SVG.');
    for(const e of d.querySelectorAll('*')){
      if(!['svg','g','defs','path','use'].includes(e.localName))throw Error('Unsupported original element.');
      for(const a of e.attributes)if(a.name.startsWith('on')||a.localName==='style'||a.value.includes('url(')||(a.localName==='href'&&!/^#[\w.-]+$/.test(a.value)))throw Error('External or executable original attribute.');
    }
    const inherited=(e,key,fallback)=>{for(let p=e;p;p=p.parentElement){const v=p.getAttribute(key);if(v!==null)return v;}return fallback;};
    const keys={fill:'black',stroke:'none','stroke-width':'1','stroke-linecap':'butt','stroke-linejoin':'miter','stroke-miterlimit':'4','stroke-dasharray':'none','stroke-dashoffset':'0','fill-rule':'nonzero','fill-opacity':'1','stroke-opacity':'1'};
    const operations=[],paths=[],uses=[];
    for(const e of d.querySelectorAll('path,use')){if(e.closest('defs'))continue;
      for(let p=e;p;p=p.parentElement)if(p.hasAttribute('opacity'))throw Error('Group opacity is outside this oracle profile.');
      const paint=Object.fromEntries(Object.entries(keys).map(([k,v])=>[k,inherited(e,k,v)]));
      if(e.localName==='path'){operations.push({kind:'path',index:paths.length});paths.push({d:e.getAttribute('d'),paint});}
      else{operations.push({kind:'glyph',index:uses.length});uses.push({href:[...e.attributes].find(a=>a.localName==='href').value,paint});}
    }
    return{operations,paths,uses};
  },reference);
  assert.equal(metadata.paths.length,metrics.paths.length);assert.equal(glyphs.nodes.length,4);
  const expected=[];let index=0;
  for(let i=0;i<4;i++){assert.equal(glyphs.nodes[i].id,metrics.nodes[i].id);expected.push({kind:'path',index:i});
    for(const g of glyphs.nodes[i].glyphs){assert.equal(Number(metadata.uses[index].href.split('-').at(-1)),g.slot);expected.push({kind:'glyph',index:index++});}}
  for(let i=4;i<metrics.paths.length;i++)expected.push({kind:'path',index:i});
  assert.deepEqual(metadata.operations,expected);assert.equal(metadata.uses.length,index);assert.equal(index,frame.glyphs);
  for(const p of metadata.paths){assert.equal(p.paint['stroke-miterlimit'],'10');assert.equal(p.paint['stroke-linecap'],'butt');assert.equal(p.paint['stroke-linejoin'],'miter');}
  return metadata;
}

export function labelledOracleInstructions(metrics,glyphs,original,variant){
  assert.ok(labelledOracleVariants.some(v=>JSON.stringify(v)===JSON.stringify(variant)));
  if(variant.paths==='original')return{paths:[],glyphs:[],checks:[],original:true};
  const checks=[];
  const record=(quantity,expected,serialized,limit,extra={})=>{const actual=Number(serialized),delta=Math.abs(actual-expected);assert.ok(Number.isFinite(actual));
    const passed=delta<=limit&&(extra.recoveredSp===undefined||extra.recoveredSp===extra.sourceSp);
    checks.push({quantity,expected,serialized,delta,limit,passed,...extra});assert.ok(passed,'Independent serialization: '+quantity);return serialized;};
  const css=variant.paths==='css-six';
  const coordinate=(sp,axis,name)=>{
    assert.ok(Number.isSafeInteger(sp));const value=css?(axis==='y'?-sp:sp)*spToCss:sp/65536;
    const text=variant.paths==='pt-short'?shortNativeDimension(sp):decimal(value,css?6:12);
    return record(name,value,text,variant.paths==='pt-short'?1/(2*65536)+1e-12:css?.000000500001:2e-12,
      css?{sourceSp:sp}:{sourceSp:sp,recoveredSp:away(Number(text)*65536)});
  };
  const paths=metrics.paths.map((p,i)=>{
    const parts=[];let corner=null;
    const point=(q,j)=>coordinate(q.xSp,'x','path-'+i+'.'+j+'.x')+' '+coordinate(q.ySp,'y','path-'+i+'.'+j+'.y');
    for(let j=0;j<p.segments.length;j++){const t=p.segments[j],q=t.point;
      if(t.kind==='rectcorner'){corner=q;parts.push('M'+point(q,j));}
      else if(t.kind==='rectsize'){assert.ok(corner);for(const [k,r]of [{xSp:corner.xSp+q.xSp,ySp:corner.ySp},{xSp:corner.xSp+q.xSp,ySp:corner.ySp+q.ySp},{xSp:corner.xSp,ySp:corner.ySp+q.ySp}].entries())parts.push('L'+point(r,j+'.corner-'+k));parts.push('Z');}
      else if(t.kind==='close')parts.push('Z');
      else{assert.ok(['move','line','control1','control2','curve'].includes(t.kind));parts.push(({move:'M',line:'L',control1:'C',control2:'',curve:''})[t.kind]+point(q,j));}
    }
    const paint={...original.paths[i].paint};
    paint['stroke-width']=coordinate(p.lineWidthSp,'x','path-'+i+'.width');
    if(css){for(const key of['stroke-dasharray','stroke-dashoffset'])if(paint[key]!=='none'){
      paint[key]=paint[key].split(/[ ,]+/).filter(Boolean).map((text,k)=>{const value=Number(text)*ptToCss;return record('path-'+i+'.'+key+'.'+k,value,decimal(value,6),.000000500001,{source:'original driver paint, converted from pt'});}).join(' ');}}
    return{id:'oracle-path-'+i,d:parts.join(' '),paint,transform:css?null:'scale('+ptToCss+' '+(-ptToCss)+')'};
  });
  let index=0;const emitted=[];
  for(let i=0;i<4;i++){const f=metrics.nodes[i].frame;
    for(const g of glyphs.nodes[i].glyphs){const values=[f.a*4/3,-f.b*4/3,-f.c*4/3,f.d*4/3,(f.eSp+f.a*g.xSp-f.c*g.ySp)*spToCss,-(f.fSp+f.b*g.xSp-f.d*g.ySp)*spToCss];
      const matrix=values.map((value,k)=>record('glyph-'+index+'.matrix.'+k,value,decimal(value,variant.glyphs),10**(-variant.glyphs)/2+2e-12));
      emitted.push({id:'oracle-glyph-'+index,href:original.uses[index].href,paint:original.uses[index].paint,matrix});index++;}}
  assert.equal(emitted.length,original.uses.length);
  return{paths,glyphs:emitted,checks,original:false};
}

export async function makeLabelledOracleSvg(renderer,reference,original,instructions,frame,rootMode){
  assert.ok(labelledOracleRoots.includes(rootMode));
  const box=rootMode==='driver-root-twelve'?frame.driverRoot:frame.picture,places=rootMode==='driver-root-twelve'?12:6;
  const values=[box.minX,box.minY,box.maxX-box.minX,box.maxY-box.minY];
  const root=values.map(v=>decimal(v,places)),rootChecks=values.map((v,i)=>({quantity:['x','y','width','height'][i],expected:v,serialized:root[i],delta:Math.abs(v-Number(root[i])),limit:10**(-places)/2+2e-12,passed:Math.abs(v-Number(root[i]))<=10**(-places)/2+2e-12}));
  assert.ok(rootChecks.every(c=>c.passed));
  const result=await renderer.page.evaluate(({source,original,instructions,origin,root})=>{
    const d=new DOMParser().parseFromString(source,'image/svg+xml'),s=d.documentElement,ns='http://www.w3.org/2000/svg';
    if(d.querySelector('parsererror')||d.doctype)throw Error('Invalid independent SVG.');
    const definitions=s.querySelector('defs').outerHTML;
    if(instructions.original){const g=d.createElementNS(ns,'g');g.setAttribute('transform','matrix('+(4/3)+' 0 0 '+(4/3)+' '+(-origin.x*4/3)+' '+(-origin.y*4/3)+')');while(s.firstChild)g.append(s.firstChild);s.append(g);}
    else{const defs=s.querySelector('defs').cloneNode(true);s.replaceChildren(defs);
      for(const op of original.operations){const p=op.kind==='path'?instructions.paths[op.index]:instructions.glyphs[op.index],e=d.createElementNS(ns,op.kind==='path'?'path':'use');e.setAttribute('id',p.id);
        for(const[k,v]of Object.entries(p.paint))e.setAttribute(k,v);
        if(op.kind==='path'){e.setAttribute('d',p.d);if(p.transform)e.setAttribute('transform',p.transform);}
        else{e.setAttribute('href',p.href);e.setAttribute('transform','matrix('+p.matrix.join(' ')+')');}s.append(e);
      }}
    s.setAttribute('width',root[2]+'px');s.setAttribute('height',root[3]+'px');s.setAttribute('viewBox',root.join(' '));
    if(s.querySelector('defs').outerHTML!==definitions)throw Error('Original glyph outlines changed.');
    return{svg:new XMLSerializer().serializeToString(s),drawing:s.innerHTML};
  },{source:reference,original,instructions,origin:frame.origin,root});
  return{...result,rootChecks,root:{mode:rootMode,values:root.map(Number)}};
}
