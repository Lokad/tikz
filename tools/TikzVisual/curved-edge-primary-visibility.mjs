import assert from 'node:assert/strict';
// Controlled SVG paint changes, not new native fixtures or frontend compatibility.
export const edgePrimaryVisibility=[
  {name:'faint-curved-stroke-loss',caseId:'clipping',target:'path-11',opacity:.0078125,property:'stroke-opacity',expectedPassed:false,
    invisibleViews:['natural/1x-transparent','natural/1x-white','natural/1x-black','expanded/1x-transparent','expanded/1x-black']},
  {name:'faint-period-loss',caseId:'nodes',target:'glyph-6',opacity:.03125,property:'fill-opacity',expectedPassed:false,invisibleBackgrounds:['black']},
  {name:'subquantum-curved-stroke-loss',caseId:'clipping',target:'path-11',opacity:.000001,property:'stroke-opacity',expectedPassed:true}
];
export function edgeVisibilityExpectedPassed(control,view){
  return control.expectedPassed===true||(control.invisibleBackgrounds??[]).includes(view.background)
    ||(control.invisibleViews??[]).includes(view.frame+'/'+view.scale+'x-'+view.background);
}
export async function edgeVisibilityPair(renderer,reference,native,metrics,control){
  assert.equal(control.caseId,metrics.caseId);const pathId=control.target.startsWith('path-')?Number(control.target.slice(5)):null,
    index=pathId===null?Number(control.target.slice(6)):metrics.driverState.paints.findIndex(p=>p.pathId===pathId);assert.ok(index>=0);
  return renderer.page.evaluate(({reference,native,index,pathId,property,opacity})=>{
    function altered(source,driver,remove){
      const d=new DOMParser().parseFromString(source,'image/svg+xml');if(d.querySelector('parsererror')||d.doctype)throw Error('Invalid controlled SVG.');
      const elements=[...d.querySelectorAll(pathId===null?'use':'path')].filter(e=>!e.closest('defs')&&!e.closest('clipPath')&&(pathId===null||e.getAttribute('d')!==''));
      const e=driver?elements[index]:d.getElementById((pathId===null?'oracle-glyph-':'oracle-path-')+index);if(!e)throw Error('Missing visibility target.');
      if(remove)e.remove();else e.setAttribute(property,String(opacity));return new XMLSerializer().serializeToString(d.documentElement);
    }
    return{reference:altered(reference,true,false),native:altered(native,false,false),missing:altered(native,false,true)};
  },{reference,native,index,pathId,property:control.property,opacity:control.opacity});
}
