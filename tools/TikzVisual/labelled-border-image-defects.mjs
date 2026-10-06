// Fixed controls for the three independently authored interaction fixtures.
// White views test local defects with numeric gates bypassed. The native bevel
// changes no pixels at 1x; exact baseline identity is required there, with
// targeted rejection still mandatory at 4x. Image allowances never change.
export function labelledBorderDefects(){return[
  {caseId:'lines',name:'missing-period',kind:'remove-glyph',index:6,target:'glyph-6'},
  {caseId:'lines',name:'faint-period-loss',kind:'glyph-opacity',index:6,value:.99,target:'glyph-6'},
  {caseId:'lines',name:'shifted-glyph',kind:'shift-glyph',index:0,target:'glyph-0'},
  {caseId:'lines',name:'missing-background',kind:'remove-path',index:0,target:'path-0'},
  {caseId:'lines',name:'double-background-width',kind:'double-width',index:0,target:'path-0'},
  {caseId:'lines',name:'missing-connection',kind:'remove-path',index:4,target:'path-4'},
  {caseId:'lines',name:'shifted-border-endpoint',kind:'shift-endpoint',index:4,target:'path-4.endpoint-0'},
  {caseId:'lines',name:'faint-connection-loss',kind:'path-opacity',index:4,value:.99,target:'path-4'},
  {caseId:'lines',name:'root-width-crop',kind:'root-crop',target:'path-7',naturalOnly:true},
  {caseId:'lines',name:'extra-ink',kind:'extra-ink',value:1,target:null},
  {caseId:'lines',name:'extra-faint-ink',kind:'extra-ink',value:.01,target:null},
  {caseId:'paths',name:'missing-glyph',kind:'remove-glyph',index:0,target:'glyph-0'},
  {caseId:'paths',name:'faint-glyph-loss',kind:'glyph-opacity',index:0,value:.99,target:'glyph-0'},
  {caseId:'paths',name:'missing-cubic',kind:'remove-path',index:6,target:'path-6'},
  {caseId:'paths',name:'changed-cubic-control',kind:'cubic-control',index:6,target:'path-6'},
  {caseId:'paths',name:'missing-last-connection',kind:'remove-path',index:8,target:'path-8'},
  {caseId:'paths',name:'changed-corner-join',kind:'bevel-join',index:4,target:'path-4.endpoint-1',exactAtScales:[1]},
  {caseId:'transforms',name:'missing-glyph',kind:'remove-glyph',index:0,target:'glyph-0'},
  {caseId:'transforms',name:'faint-period-loss',kind:'glyph-opacity',index:11,value:.99,target:'glyph-11'},
  {caseId:'transforms',name:'missing-transformed-rectangle',kind:'remove-path',index:0,target:'path-0'},
  {caseId:'transforms',name:'missing-transformed-ellipse',kind:'remove-path',index:1,target:'path-1'},
  {caseId:'transforms',name:'shifted-border-endpoint',kind:'shift-endpoint',index:7,target:'path-7.endpoint-0'},
  {caseId:'transforms',name:'changed-cubic-control',kind:'cubic-control',index:8,target:'path-8'},
  {caseId:'transforms',name:'faint-background-loss',kind:'path-opacity',index:1,value:.99,target:'path-1'},
  {caseId:'lines',name:'unpainted-closed-cap',kind:'closed-cap',index:0,target:'path-0',exactVisibilityControl:true},
  {caseId:'lines',name:'unpainted-solid-phase',kind:'solid-phase',index:0,target:'path-0',exactVisibilityControl:true}
];}

export function labelledDefectExpectation(defect,view){
  return defect.exactVisibilityControl||defect.exactAtScales?.includes(view.scale)?'pixel-identical':'target-rejection';
}

export function mutateLabelledBorderSvg({source,defect,publicCandidate=false,rootBox}){
  const d=new DOMParser().parseFromString(source,'image/svg+xml'),s=d.documentElement;
  if(d.querySelector('parsererror')||d.doctype)throw Error('Invalid labeled-border control SVG.');
  const e=(kind,index)=>{const p=d.getElementById((publicCandidate?'candidate-':'oracle-')+(kind==='glyph'?(publicCandidate?'g':'glyph-'):(publicCandidate?'p':'path-'))+index);if(!p)throw Error('Missing fixed image target.');return p;};
  const before=new XMLSerializer().serializeToString(s);
  const scale=p=>{const m=/^scale\(([-\d.e+]+)[ ,]+([-\d.e+]+)\)$/.exec(p.getAttribute('transform')??'');if(!m||!Number.isFinite(Number(m[1])))throw Error('Unknown native path units.');return Number(m[1]);};
  switch(defect.kind){
    case'remove-glyph':e('glyph',defect.index).remove();break;
    case'remove-path':e('path',defect.index).remove();break;
    case'glyph-opacity':e('glyph',defect.index).setAttribute('opacity',String(defect.value));break;
    case'path-opacity':e('path',defect.index).setAttribute('stroke-opacity',String(defect.value));break;
    case'double-width':{const p=e('path',defect.index);p.setAttribute('stroke-width',String(Number(p.getAttribute('stroke-width'))*2));break;}
    case'shift-glyph':{const p=e('glyph',defect.index),m=/^matrix\(([^)]+)\)$/.exec(p.getAttribute('transform'))?.[1].split(/[ ,]+/).map(Number);if(!m||m.length!==6)throw Error('Missing native glyph matrix.');m[4]+=.5;p.setAttribute('transform','matrix('+m.join(' ')+')');break;}
    case'shift-endpoint':case'cubic-control':{const p=e('path',defect.index),data=p.getAttribute('d'),command=defect.kind==='shift-endpoint'?'M':'C',pattern=new RegExp(command+'([-+]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][-+]?\\d+)?)');
      if(!pattern.test(data))throw Error('Missing fixed path coordinate.');p.setAttribute('d',data.replace(pattern,(_,x)=>command+(Number(x)+.5/scale(p))));break;}
    case'bevel-join':e('path',defect.index).setAttribute('stroke-linejoin','bevel');break;
    case'closed-cap':e('path',defect.index).setAttribute('stroke-linecap','round');break;
    case'solid-phase':e('path',defect.index).setAttribute('stroke-dashoffset','37');break;
    case'root-crop':{const v=s.getAttribute('viewBox').split(/[ ,]+/).map(Number);v[2]-=4;s.setAttribute('viewBox',v.join(' '));s.setAttribute('width',v[2]+'px');break;}
    case'extra-ink':{const p=d.createElementNS('http://www.w3.org/2000/svg','path'),x=rootBox.minX+4,y=rootBox.minY+4;p.setAttribute('d','M'+x+' '+y+'h2v2h-2Z');p.setAttribute('fill','#000');p.setAttribute('fill-opacity',String(defect.value));s.append(p);break;}
    default:throw Error('Unknown fixed labeled-border image control.');
  }
  const after=new XMLSerializer().serializeToString(s);if(after===before)throw Error('Unchanged image control.');return after;
}
