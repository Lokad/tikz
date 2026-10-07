// Mutations affect SVG bytes only. No production compiler or numeric gate runs.
import assert from 'node:assert/strict';
const black=['black'];
export const arrowPrimaryDefects=[
 {name:'missing-legacy-tip',caseId:'legacy-defaults',target:'paint-2',change:'remove',invisibleBackgrounds:black},
 {name:'missing-stealth-tip',caseId:'meta-defaults',target:'paint-4',change:'remove',invisibleBackgrounds:black},
 {name:'wrong-tip-fill',caseId:'meta-defaults',target:'paint-4',change:'fill'},
 {name:'wrong-shaft-shortening',caseId:'dimensions',target:'paint-8',change:'line-end',deltaPt:1,invisibleBackgrounds:black},
 {name:'quarter-pixel-oblique-tip-shift',caseId:'transforms',target:'paint-2',change:'shift',invisibleBackgrounds:black},
 {name:'reversed-oblique-tip',caseId:'transforms',target:'paint-19',change:'reverse',invisibleBackgrounds:black},
 {name:'wrong-first-cubic-control',caseId:'curves-nodes',target:'paint-1',change:'control',deltaPt:1,invisibleBackgrounds:black},
 {name:'wrong-cubic-endpoint',caseId:'curves-nodes',target:'paint-1',change:'curve-end',deltaPt:1,invisibleBackgrounds:black},
 {name:'missing-dashes',caseId:'paint-boundaries',target:'paint-1',change:'dash'},
 {name:'missing-round-cap',caseId:'paint-boundaries',target:'paint-1',change:'cap'},
 {name:'missing-tip-opacity',caseId:'paint-boundaries',target:'paint-4',change:'opacity'},
 {name:'disabled-tip-clip',caseId:'paint-boundaries',target:'paint-8',change:'clip'},
 {name:'missing-zero-direction-tip',caseId:'paint-boundaries',target:'paint-19',change:'remove',invisibleBackgrounds:black},
 {name:'missing-degenerate-line-tip',caseId:'paint-boundaries',target:'paint-15',change:'remove',invisibleBackgrounds:black},
 {name:'cropped-picture-root',caseId:'legacy-defaults',target:'paint-2',change:'root',frames:['natural'],invisibleBackgrounds:black},
 {name:'wrong-deferred-paint-order',caseId:'curves-nodes',target:'paint-21',other:'paint-20',change:'order'}
];
export const arrowPrimaryVisibility=[
 {name:'faint-filled-tip-loss',caseId:'meta-defaults',target:'paint-4',opacity:.03125},
 {name:'subquantum-filled-tip-loss',caseId:'meta-defaults',target:'paint-4',opacity:.000001}
];
export function arrowDefectDeclaredInvisible(defect,view){return(defect.invisibleBackgrounds??[]).includes(view.background);}
function paintTag(source,id){assert.match(id,/^paint-[1-9]\d*$/);const matches=[...source.matchAll(new RegExp('<path id="'+id+'"[^<>]*/>','g'))];assert.equal(matches.length,1,'Missing or repeated image-only target: '+id);return matches[0][0];}
function attribute(tag,key,value){const pattern=new RegExp(' '+key+'="([^"]*)"');assert.ok(pattern.test(tag),'Missing controlled attribute '+key);return tag.replace(pattern,' '+key+'="'+value+'"');}
function changedData(tag,command,index,delta){
 const data=/ d="([^"]*)"/.exec(tag)?.[1];assert.ok(data);const number='[-+]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][-+]?\\d+)?';
 const pattern=new RegExp(command+'\\s*('+Array(command==='C'?6:2).fill(number).join('[ ,]+')+')');const m=pattern.exec(data);assert.ok(m,'Missing controlled segment');
 const values=m[1].split(/[ ,]+/).map(Number);assert.ok(values.every(Number.isFinite));values[index]+=delta;
 return attribute(tag,'d',data.slice(0,m.index)+command+values.join(' ')+data.slice(m.index+m[0].length));
}
export function mutateArrowPrimary(source,defect){
 const tag=paintTag(source,defect.target);let replacement;
 switch(defect.change){
  case'remove':replacement='';break;
  case'fill':assert.ok(!tag.includes(' fill="none"'));replacement=attribute(tag,'fill','#00ff00');break;
  case'line-end':replacement=changedData(tag,'L',0,defect.deltaPt);break;
  case'control':replacement=changedData(tag,'C',1,defect.deltaPt);break;
  case'curve-end':replacement=changedData(tag,'C',5,defect.deltaPt);break;
  case'shift':replacement='<g transform="translate(.25 0)">'+tag+'</g>';break;
  case'reverse':{const t=/ transform="([^"]+)"/.exec(tag)?.[1];assert.ok(t);replacement=attribute(tag,'transform',t+' rotate(180)');break;}
  case'dash':assert.ok(!tag.includes(' stroke-dasharray="none"'));replacement=attribute(tag,'stroke-dasharray','none');break;
  case'cap':assert.ok(tag.includes(' stroke-linecap="round"'));replacement=attribute(tag,'stroke-linecap','butt');break;
  case'opacity':replacement=attribute(attribute(tag,'stroke-opacity','0'),'fill-opacity','0');break;
  case'clip':{const wrapped='<g clip-path="url(#native-clip-0)">'+tag+'</g>';assert.ok(source.includes(wrapped));return source.replace(wrapped,tag);}
  case'root':{const view=/ viewBox="([^"]+)"/.exec(source)?.[1].split(' ').map(Number);assert.ok(view?.length===4);view[2]=1;
   return source.replace(/ width="[^"]+"/,' width="1px"').replace(/ viewBox="[^"]+"/,' viewBox="'+view.join(' ')+'"');}
  case'order':{const other=paintTag(source,defect.other),a=source.indexOf(tag),b=source.indexOf(other);assert.ok(a>b);return source.slice(0,b)+tag+source.slice(b+other.length,a)+other+source.slice(a+tag.length);}
  default:throw Error('Unknown arrow image-only defect');
 }
 assert.notEqual(replacement,tag);return source.replace(tag,replacement);
}
export function arrowVisibilityInputs(source,control){
 assert.ok(Number.isFinite(control.opacity)&&control.opacity>0&&control.opacity<1);const tag=paintTag(source,control.target);
 assert.ok(!tag.includes(' fill="none"'));const altered=attribute(attribute(tag,'stroke-opacity',String(control.opacity)),'fill-opacity',String(control.opacity));
 const baseline=source.replace(tag,altered);return{reference:baseline,actual:baseline,missing:baseline.replace(altered,'')};
}
