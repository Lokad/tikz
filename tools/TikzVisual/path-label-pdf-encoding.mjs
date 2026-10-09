// PDF natural frame: native picture/ink root; legacy picture-only bounds.
import assert from 'node:assert/strict';

export async function pathLabelPdfEncoding(renderer,svg,frame){
 const b=frame.natural?.root??frame.picture,rectangle=[b.minX,b.minY,b.maxX-b.minX,b.maxY-b.minY];
 assert.ok(rectangle.every(Number.isFinite)&&rectangle[2]>0&&rectangle[3]>0);
 const values=rectangle.map(v=>Number(v.toFixed(6)).toString());
 return renderer.page.evaluate(({svg,values})=>{
  const doc=new DOMParser().parseFromString(svg,'image/svg+xml'),root=doc.documentElement;
  if(doc.querySelector('parsererror')||root.localName!=='svg')throw Error('Invalid native PDF encoding.');
  root.setAttribute('width',values[2]+'px');root.setAttribute('height',values[3]+'px');root.setAttribute('viewBox',values.join(' '));
  return new XMLSerializer().serializeToString(doc);
 },{svg,values});
}
