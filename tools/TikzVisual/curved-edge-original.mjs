// Separate curved-corpus DOM observations; original bytes remain untouched.
import assert from 'node:assert/strict';
export async function readCurvedEdgeOriginal(renderer,reference,metrics,glyphs){
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
    const paths=[],uses=[],operations=[],emptyPaints=[];
    for(const e of d.querySelectorAll('path,use')){if(e.closest('defs')||e.closest('clipPath'))continue;
      const paint=Object.fromEntries(Object.entries(keys).map(([k,v])=>[k,inherited(e,k,v)]));
      if(e.localName==='path'&&e.getAttribute('d')===''){emptyPaints.push({paint,clips:clipIds(e)});continue;}
      if(e.localName==='path'){operations.push({kind:'path',index:paths.length});paths.push({d:e.getAttribute('d'),paint,clips:clipIds(e)});}
      else{operations.push({kind:'glyph',index:uses.length});uses.push({href:[...e.attributes].find(a=>a.localName==='href').value,paint,clips:clipIds(e)});}
    }
    const clips=[...d.querySelectorAll('clipPath')].map(e=>{if(e.children.length!==1||e.firstElementChild.localName!=='path')throw Error('Unsupported original clip.');
      return{id:e.id,d:e.firstElementChild.getAttribute('d'),rule:inherited(e.firstElementChild,'clip-rule','nonzero')};});
    const definitions=[...d.querySelectorAll('defs path')].map(e=>({id:e.id,d:e.getAttribute('d')}));
    return{operations,paths,uses,clips,definitions,emptyPaints};
  },reference);
  const paints=metrics.driverState.paints,paths=new Map(metrics.paths.map(p=>[p.index,p])),clipCalls=metrics.physicalOrder.allPathCalls
    .map(id=>paths.get(id)).filter(p=>p.modes.includes('clip'));
  assert.equal(metadata.emptyPaints.length,metrics.caseId==='nodes'?2:0);
  assert.equal(metadata.paths.length,paints.length);assert.equal(metadata.clips.length,clipCalls.length);assert.equal(glyphs.nodes.length,metrics.nodes.length);
  const clipMap=new Map(metadata.clips.map((c,i)=>[c.id,i]));assert.ok(metadata.clips.every(c=>c.rule==='nonzero'),'This fixed corpus uses nonzero clipping.');
  const expected=[];let use=0;
  for(let i=0;i<paints.length;i++){
    const native=paths.get(paints[i].pathId);assert.ok(native);expected.push({kind:'path',index:i});
    assert.deepEqual(metadata.paths[i].clips.map(c=>clipMap.get(c)),paints[i].clips);
    if(native.owner.startsWith('node-')){
      const j=metrics.nodes.findIndex(n=>'node-'+n.id===native.owner);assert.ok(j>=0);assert.equal(glyphs.nodes[j].id,metrics.nodes[j].id);
      for(const g of glyphs.nodes[j].glyphs){const u=metadata.uses[use],match=/^#(g\d+)-(\d+)$/.exec(u?.href??'');assert.ok(match);
        assert.equal(Number(match[2]),g.slot);assert.equal(glyphs.svgFontDefinitions[match[1]],g.font);assert.ok(metadata.definitions.some(d=>d.id===match[0].slice(1)));
        assert.deepEqual(u.clips.map(c=>clipMap.get(c)),paints[i].clips);expected.push({kind:'glyph',index:use++});}
    }
  }
  assert.equal(use,metadata.uses.length);assert.deepEqual(metadata.operations,expected);
  return{...metadata,clipCalls:clipCalls.map(p=>p.index),clipMap:Object.fromEntries(clipMap)};
}
