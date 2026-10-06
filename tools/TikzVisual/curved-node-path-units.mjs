// Oracle-only representations of the fixed 28-node native PGF paths.
// Glyphs, ordering, paint, root and camera stay fixed; no converter is used.
import assert from 'node:assert/strict';

const ptToCss=96/72.27,spToCss=ptToCss/65536;
const away=x=>Math.sign(x)*Math.round(Math.abs(x));
const decimal=(x,places)=>{const v=away(x*10**places)/10**places;return v===0?'0':places===0?v.toFixed(0):v.toFixed(places).replace(/0+$/,'').replace(/\.$/,'');};
export const curvedPathRepresentations=[
  {name:'css-six',units:'css',places:6,width:'css-six'},
  {name:'css-twelve',units:'css',places:12,width:'exact'},
  {name:'pt-short',units:'pt',places:'short',width:'short'},
  {name:'pt-twelve',units:'pt',places:12,width:'exact'},
  {name:'pt-short-css-width',units:'pt',places:'short',width:'css-six'},
  {name:'css-six-printed-pt-width',units:'css',places:6,width:'short'},
  {name:'pt-short-exact-width',units:'pt',places:'short',width:'exact'},
  {name:'pt-short-group',units:'pt',places:'short',width:'short',group:true}
];
export function shortNativeDimension(sp){
  assert.ok(Number.isSafeInteger(sp));
  for(let places=0;places<=5;places++){
    const text=decimal(sp/65536,places);
    if(away(Number(text)*65536)===sp)return text;
  }
  throw Error('No decimal recovers the native scaled-point dimension.');
}
export function curvedPathInstructions(native,variant){
  assert.equal(native.nodes.length,28);assert.ok(curvedPathRepresentations.some(v=>JSON.stringify(v)===JSON.stringify(variant)));
  const checks=[],paths=native.nodes.map(n=>{
    assert.equal(n.path.length,15);
    assert.deepEqual(n.path.map(t=>t.kind),['move',...Array.from({length:4},()=>['control1','control2','curve']).flat(),'close','move']);
    const coordinate=(sp,axis,index)=>{
      assert.ok(Number.isSafeInteger(sp));const nativeValue=variant.units==='pt'?sp/65536:(axis==='y'?-sp:sp)*spToCss;
      const text=variant.places==='short'?shortNativeDimension(sp):decimal(nativeValue,variant.places);
      const effective=Number(text)*(variant.units==='pt'?(axis==='y'?-ptToCss:ptToCss):1),wanted=(axis==='y'?-sp:sp)*spToCss;
      const limit=variant.places==='short'?ptToCss/(2*65536)+1e-12:10**(-variant.places)/2*(variant.units==='pt'?ptToCss:1)+1e-12;
      const recoveredSp=variant.units==='pt'?away(Number(text)*65536):null,error=Math.abs(effective-wanted);
      checks.push({quantity:n.id+'.path.'+index+'.'+axis,sourceSp:sp,serialized:text,effectiveCss:effective,errorCss:error,limitCss:limit,recoveredSp,
        passed:error<=limit&&(variant.units!=='pt'||recoveredSp===sp)});return text;
    };
    const data=n.path.map((t,i)=>t.kind==='close'?'Z':(t.kind==='move'?'M':t.kind==='control1'?'C':'')+coordinate(t.point.xSp,'x',i)+' '+coordinate(t.point.ySp,'y',i)).join(' ');
    const widthSp=n.values.linewidth;assert.ok(Number.isSafeInteger(widthSp)&&widthSp>0);
    const cssWidth=variant.width==='css-six'?Number(decimal(widthSp*spToCss,6)):variant.width==='short'?Number(shortNativeDimension(widthSp))*ptToCss:widthSp*spToCss;
    const width=variant.units==='pt'?variant.width==='short'?shortNativeDimension(widthSp):variant.width==='exact'?(widthSp/65536).toString():decimal(cssWidth/ptToCss,12)
      :variant.width==='css-six'?decimal(cssWidth,6):variant.width==='exact'?decimal(cssWidth,12):decimal(cssWidth,12);
    const effectiveWidth=Number(width)*(variant.units==='pt'?ptToCss:1),error=Math.abs(effectiveWidth-widthSp*spToCss),limit=variant.width==='short'?ptToCss/(2*65536)+1e-12:variant.width==='css-six'?.0000005+2e-12:2e-12;
    checks.push({quantity:n.id+'.width',sourceSp:widthSp,serialized:width,effectiveCss:effectiveWidth,errorCss:error,limitCss:limit,passed:error<=limit});
    return{id:'native-shape-'+n.id,d:data,width,transform:variant.units==='pt'?'scale('+ptToCss+' '+(-ptToCss)+')':null,group:variant.group===true};
  });
  assert.equal(checks.length,812);assert.ok(checks.every(c=>c.passed),'Independent path serialization failed.');return{paths,checks};
}
export async function applyCurvedPathInstructions(renderer,source,instructions){
  return renderer.page.evaluate(({source,paths})=>{
    const d=new DOMParser().parseFromString(source,'image/svg+xml'),s=d.documentElement;
    if(d.querySelector('parsererror')||d.doctype)throw Error('Invalid independent curved SVG.');
    const glyphs=()=>[...d.querySelectorAll('use')].map(e=>new XMLSerializer().serializeToString(e)),before=glyphs(),defs=d.querySelector('defs').outerHTML,root=[...s.attributes].map(a=>[a.name,a.value]);
    const beforeOrder=[...s.children].map(e=>e.id||e.localName);if(paths.length!==28||before.length!==70)throw Error('Incomplete independent paths/glyphs.');
    for(const p of paths){const e=d.getElementById(p.id);if(!e||e.localName!=='path'||e.getAttribute('fill')!=='none'||e.getAttribute('stroke')!=='#000'||e.hasAttribute('transform'))throw Error('Unexpected original native path.');
      e.setAttribute('d',p.d);e.setAttribute('stroke-width',p.width);
      if(p.transform){if(p.group){const g=d.createElementNS('http://www.w3.org/2000/svg','g');g.setAttribute('transform',p.transform);e.replaceWith(g);g.append(e);}else e.setAttribute('transform',p.transform);}
    }
    const afterOrder=[...s.children].map(e=>e.localName==='g'&&e.children.length===1?e.firstElementChild.id:e.id||e.localName);
    if(JSON.stringify(before)!==JSON.stringify(glyphs())||defs!==d.querySelector('defs').outerHTML||JSON.stringify(root)!==JSON.stringify([...s.attributes].map(a=>[a.name,a.value]))||JSON.stringify(beforeOrder)!==JSON.stringify(afterOrder))throw Error('Independent glyph, root, outline or ordering changed.');
    return new XMLSerializer().serializeToString(s);
  },{source,paths:instructions.paths});
}
