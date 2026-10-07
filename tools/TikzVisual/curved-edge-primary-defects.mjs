import assert from 'node:assert/strict';
const black=['black'];
export const edgePrimaryDefects=[
  {name:'missing-bend',caseId:'continuation',target:'path-2',change:'remove',invisibleBackgrounds:black},
  {name:'quarter-pixel-oblique-shift',caseId:'coordinates',target:'path-15',change:'shift',invisibleBackgrounds:black},
  {name:'wrong-first-control',caseId:'continuation',target:'path-2.curve-1.t-0.5',change:'control',controlDeltaPt:1,invisibleBackgrounds:black},
  {name:'straightened-bend',caseId:'continuation',target:'path-1.curve-1.t-0.5',change:'straight',invisibleBackgrounds:black},
  {name:'swapped-asymmetric-controls',caseId:'styles',target:'path-3.curve-1.t-0.25',change:'swap',invisibleBackgrounds:black},
  {name:'doubled-node-connection-stroke',caseId:'nodes',target:'path-5',change:'width'},
  {name:'changed-node-connection-blue',caseId:'nodes',target:'path-5',change:'color'},
  {name:'missing-curved-dashes',caseId:'styles',target:'path-10',change:'dash'},
  {name:'disabled-rectangle-clip',caseId:'clipping',target:'path-2',change:'clip',invisibleViews:['natural/1x-transparent','natural/1x-white','natural/1x-black']},
  {name:'shifted-curved-clip',caseId:'clipping',target:'path-7',change:'clip-shift',clipIndex:1,clipDeltaPt:30},
  {name:'missing-round-cap',caseId:'clipping',target:'path-7.endpoint-0',change:'cap'},
  {name:'missing-period',caseId:'nodes',target:'glyph-6',change:'remove',invisibleBackgrounds:black},
  {name:'missing-ligature',caseId:'nodes',target:'glyph-5',change:'remove',invisibleBackgrounds:black},
  {name:'shifted-label-baseline',caseId:'nodes',target:'glyph-2',change:'baseline',invisibleBackgrounds:black},
  {name:'missing-node-connection-opacity',caseId:'nodes',target:'path-5',change:'opacity'},
  {name:'cropped-root',caseId:'continuation',target:'path-1',change:'root',frames:['natural'],invisibleBackgrounds:black},
  {name:'changed-compound-fill',caseId:'clipping',target:'path-5',change:'fill-color'},
  {name:'missing-ellipse-outline',caseId:'nodes',target:'path-4',change:'remove',invisibleBackgrounds:black}
];

export function edgePrimaryDefectInvisible(defect,view){
  return(defect.invisibleBackgrounds??[]).includes(view.background)||(defect.invisibleViews??[]).includes(view.frame+'/'+view.scale+'x-'+view.background);
}

export function mutateFirstCubic(source,change,delta=1){
  assert.ok(['control','swap','straight'].includes(change));assert.ok(Number.isFinite(delta)&&delta!==0);
  const number='([-+]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][-+]?\\d+)?)',pattern=new RegExp('C\\s*'+Array(6).fill(number).join('[ ,]+'));
  const match=pattern.exec(source);assert.ok(match,'Controlled path has no explicit cubic.');
  const v=match.slice(1);assert.ok(v.every(s=>Number.isFinite(Number(s))));
  let replacement;
  if(change==='straight')replacement='L'+v[4]+' '+v[5];
  else{if(change==='control')v[1]=String(Number(v[1])+delta);else [v[0],v[1],v[2],v[3]]=[v[2],v[3],v[0],v[1]];replacement='C'+v.join(' ');}
  return source.slice(0,match.index)+replacement+source.slice(match.index+match[0].length);
}

export async function mutateEdgePrimary(renderer,source,original,metrics,defect){
  assert.equal(defect.caseId,metrics.caseId);let svgId;
  if(defect.target.startsWith('path-')){
    const match=/^path-(\d+)(?:\.(?:curve-\d+\.t-[\d.]+|endpoint-\d+))?$/.exec(defect.target);assert.ok(match);
    const i=metrics.driverState.paints.findIndex(p=>p.pathId===Number(match[1]));assert.ok(i>=0);svgId='oracle-path-'+i;
  }else{const match=/^glyph-(\d+)$/.exec(defect.target);assert.ok(match);const i=Number(match[1]);assert.ok(i<original.uses.length);svgId='oracle-glyph-'+i;}
  let replacement;
  if(['control','swap','straight'].includes(defect.change)){
    const data=await renderer.page.evaluate(({source,svgId})=>new DOMParser().parseFromString(source,'image/svg+xml').getElementById(svgId)?.getAttribute('d'),{source,svgId});
    assert.equal(typeof data,'string');replacement=mutateFirstCubic(data,defect.change,defect.controlDeltaPt??1);
  }
  return renderer.page.evaluate(({source,svgId,defect,replacement})=>{
    const d=new DOMParser().parseFromString(source,'image/svg+xml'),s=d.documentElement,e=d.getElementById(svgId);
    if(!e||d.querySelector('parsererror')||d.doctype)throw Error('Missing controlled target.');
    switch(defect.change){
      case'remove':e.remove();break;
      case'width':e.setAttribute('stroke-width',String(Number(e.getAttribute('stroke-width'))*2));break;
      case'color':e.setAttribute('stroke','#0f0');break;
      case'fill-color':if(e.getAttribute('fill')==='none')throw Error('Target has no fill.');e.setAttribute('fill','#0f0');break;
      case'dash':if(e.getAttribute('stroke-dasharray')==='none')throw Error('Target has no dashes.');e.setAttribute('stroke-dasharray','none');break;
      case'cap':if(e.getAttribute('stroke-linecap')!=='round')throw Error('Target has no round cap.');e.setAttribute('stroke-linecap','butt');break;
      case'opacity':e.setAttribute('stroke-opacity','0');break;
      case'clip':{let p=e.parentElement,changed=false;while(p&&p!==s){changed=p.hasAttribute('clip-path')||changed;p.removeAttribute('clip-path');p=p.parentElement;}if(!changed)throw Error('Target has no clip.');break;}
      case'clip-shift':{const clip=d.getElementById('oracle-clip-'+defect.clipIndex)?.firstElementChild;
        if(!clip?.getAttribute('d')?.includes('C')||!Number.isFinite(defect.clipDeltaPt))throw Error('Missing curved clip.');
        clip.setAttribute('transform',clip.getAttribute('transform')+' translate(0 '+defect.clipDeltaPt+')');break;}
      case'control':case'swap':case'straight':e.setAttribute('d',replacement);break;
      case'shift':case'baseline':{const g=d.createElementNS(s.namespaceURI,'g');g.setAttribute('transform',defect.change==='shift'?'translate(.25 0)':'translate(0 .25)');e.replaceWith(g);g.append(e);break;}
      case'root':{const box=s.getAttribute('viewBox').split(/\s+/).map(Number);box[2]=1;s.setAttribute('width','1px');s.setAttribute('viewBox',box.join(' '));break;}
      default:throw Error('Unknown curved edge image defect.');
    }
    return new XMLSerializer().serializeToString(s);
  },{source,svgId,defect,replacement});
}
