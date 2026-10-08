// Complete-label text sensitivity; borders and other paint remain unchanged.
import assert from 'node:assert/strict';

export function pathLabelTextTargets(glyphs){
 let offset=0;const labels=[];
 for(const node of glyphs.nodes){
  const targets=node.glyphs.map((_,i)=>'native-glyph-'+(offset+i));offset+=targets.length;
  if(!['from','target','seed'].includes(node.id)){assert.ok(targets.length);labels.push({nodeId:node.id,targets});}
 }return labels;
}

export async function mutatePathLabelText(renderer,svg,{targets,kind}){
 assert.ok(targets.length&&new Set(targets).size===targets.length);
 assert.ok(targets.every(t=>/^native-glyph-\d+$/.test(t)));
 assert.ok(['missing','quarter-pixel-shift'].includes(kind));
 return renderer.page.evaluate(({svg,targets,kind})=>{
  const doc=new DOMParser().parseFromString(svg,'image/svg+xml');
  for(const target of targets){const e=doc.getElementById(target);if(!e||e.localName!=='use')throw Error('Missing native text glyph.');
   if(kind==='missing')e.remove();else e.setAttribute('transform','translate(0.25 0) '+e.getAttribute('transform'));
  }return new XMLSerializer().serializeToString(doc);
 },{svg,targets,kind});
}
