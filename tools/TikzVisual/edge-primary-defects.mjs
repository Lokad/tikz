import assert from 'node:assert/strict';
export const edgePrimaryDefects=[
  {name:'missing-branch',caseId:'continuation',target:'path-2',change:'remove'},
  {name:'quarter-pixel-shift',caseId:'coordinates',target:'path-15',change:'shift',invisibleBackgrounds:['black']},
  {name:'doubled-stroke',caseId:'continuation',target:'path-2',change:'width'},
  {name:'changed-blue',caseId:'continuation',target:'path-2',change:'color'},
  {name:'missing-dashes',caseId:'styles',target:'path-13',change:'dash'},
  {name:'missing-round-cap',caseId:'styles',target:'path-16',change:'cap'},
  {name:'disabled-clip',caseId:'clipping',target:'path-2',change:'clip'},
  {name:'missing-blue-dot',caseId:'clipping',target:'path-15',change:'remove'},
  {name:'missing-period',caseId:'nodes',target:'glyph-12',change:'remove',invisibleBackgrounds:['black']},
  {name:'missing-ligature',caseId:'nodes',target:'glyph-11',change:'remove',invisibleBackgrounds:['black']},
  {name:'shifted-label-baseline',caseId:'nodes',target:'glyph-5',change:'baseline',invisibleBackgrounds:['black']},
  {name:'wrong-opacity',caseId:'styles',target:'path-19',change:'opacity'},
  {name:'cropped-root',caseId:'continuation',target:'path-1',change:'root',frames:['natural']}
];
export async function mutateEdgePrimary(renderer,source,original,metrics,defect){
  assert.equal(defect.caseId,metrics.caseId);let svgId;
  if(defect.target.startsWith('path-')){const id=Number(defect.target.slice(5)),i=metrics.driverState.paints.findIndex(p=>p.pathId===id);assert.ok(i>=0);svgId='oracle-path-'+i;}
  else{const i=Number(defect.target.slice(6));assert.ok(Number.isInteger(i)&&i>=0&&i<original.uses.length);svgId='oracle-glyph-'+i;}
  return renderer.page.evaluate(({source,svgId,change})=>{
    const d=new DOMParser().parseFromString(source,'image/svg+xml'),s=d.documentElement,e=d.getElementById(svgId);if(!e||d.querySelector('parsererror')||d.doctype)throw Error('Missing controlled target.');
    switch(change){
      case'remove':e.remove();break;
      case'width':e.setAttribute('stroke-width',String(Number(e.getAttribute('stroke-width'))*2));break;
      case'color':e.setAttribute('stroke','#0f0');break;
      case'dash':if(e.getAttribute('stroke-dasharray')==='none')throw Error('Target has no dashes.');e.setAttribute('stroke-dasharray','none');break;
      case'cap':e.setAttribute('stroke-linecap','butt');break;
      case'opacity':e.setAttribute('stroke-opacity','0');break;
      case'clip':{let p=e.parentElement;while(p&&p!==s){p.removeAttribute('clip-path');p=p.parentElement;}break;}
      case'shift':{const g=d.createElementNS(s.namespaceURI,'g');g.setAttribute('transform','translate(.25 0)');e.replaceWith(g);g.append(e);break;}
      case'baseline':{const g=d.createElementNS(s.namespaceURI,'g');g.setAttribute('transform','translate(0 .25)');e.replaceWith(g);g.append(e);break;}
      case'root':{const box=s.getAttribute('viewBox').split(/\s+/).map(Number);box[2]=1;s.setAttribute('width','1px');s.setAttribute('viewBox',box.join(' '));break;}
      default:throw Error('Unknown edge image defect.');
    }return new XMLSerializer().serializeToString(s);
  },{source,svgId,change:defect.change});
}
