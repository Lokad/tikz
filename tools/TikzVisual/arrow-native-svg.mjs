// Reconstruct physical native paints. No production serializer is used.
import assert from 'node:assert/strict';
import {nativeEdgeSegments,edgeSpToCss,edgePtToCss,edgeDecimal} from './edge-oracle.mjs';
import {shortNativeDimension} from './curved-node-path-units.mjs';

export const arrowNativeRepresentations=[
 {name:'pt-short',units:'pt',places:'short'},
 {name:'pt-twelve',units:'pt',places:12},
 {name:'css-six',units:'css',places:6},
 {name:'css-twelve',units:'css',places:12}
];
export const arrowNativeRoots=['picture','ink'];
const away=x=>Math.sign(x)*Math.round(Math.abs(x));
const rgb=channels=>{assert.ok(channels?.length===3&&channels.every(x=>Number.isFinite(x)&&x>=0&&x<=1));return'#'+channels.map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('');};

export function makeArrowNativeSvg(metrics,frame,variant,rootMode){
 assert.ok(arrowNativeRepresentations.some(v=>JSON.stringify(v)===JSON.stringify(variant)));assert.ok(arrowNativeRoots.includes(rootMode));
 const checks=[],paths=new Map(metrics.paths.map(p=>[p.id,p])),placements=new Map(metrics.placements.map(p=>[p.id,p]));
 const coordinate=(sp,axis,name)=>{
  assert.ok(Number.isSafeInteger(sp));const value=variant.units==='pt'?sp/65536:(axis==='y'?-sp:sp)*edgeSpToCss;
  const text=variant.places==='short'?shortNativeDimension(sp):edgeDecimal(value,variant.places);
  const effectiveCss=Number(text)*(variant.units==='pt'?(axis==='y'?-edgePtToCss:edgePtToCss):1),wanted=(axis==='y'?-sp:sp)*edgeSpToCss;
  const limitCss=variant.places==='short'?edgePtToCss/(2*65536)+1e-12:.5*10**(-variant.places)*(variant.units==='pt'?edgePtToCss:1)+1e-12;
  const recoveredSp=variant.units==='pt'?away(Number(text)*65536):null,errorCss=Math.abs(effectiveCss-wanted);
  const passed=errorCss<=limitCss&&(variant.units!=='pt'||recoveredSp===sp);
  assert.ok(passed,'Native serialization failed: '+name);checks.push({quantity:name,sourceSp:sp,serialized:text,effectiveCss,errorCss,limitCss,recoveredSp,passed});return text;
 };
 const data=(path,id)=>nativeEdgeSegments(path).map((s,i)=>{
  const point=(p,role)=>coordinate(p.x,'x',id+'.'+i+'.'+role+'.x')+' '+coordinate(p.y,'y',id+'.'+i+'.'+role+'.y');
  return s.kind==='close'?'Z':s.kind==='move'?'M'+point(s.to,'to'):s.kind==='line'?'L'+point(s.to,'to'):'C'+point(s.c1,'c1')+' '+point(s.c2,'c2')+' '+point(s.to,'to');
 }).join(' ');
 const transform=(placement,id)=>{
  if(!placement)return variant.units==='pt'?'scale('+edgePtToCss+' '+(-edgePtToCss)+')':null;
  const [a,b,c,d]=placement.matrix,coefficients=variant.units==='pt'?[a,b,c,d]:[a,-b,-c,d];
  const tx=coordinate(placement.xSp,'x',id+'.translation.x'),ty=coordinate(placement.ySp,'y',id+'.translation.y');
  for(const [i,n]of coefficients.entries())checks.push({quantity:id+'.matrix.'+i,expected:n,serialized:String(n),error:0,passed:true});
  return(variant.units==='pt'?'scale('+edgePtToCss+' '+(-edgePtToCss)+') ':'')+'matrix('+[...coefficients,tx,ty].join(' ')+')';
 };
 const clipRows=metrics.clips.map((id,i)=>({id:'native-clip-'+i,pathId:id,d:data(paths.get(id),'clip-'+i),transform:transform(null,'clip-'+i)}));
 const paintRows=metrics.driverState.paints.map(p=>{
  const path=paths.get(p.pathId);assert.ok(path);const placement=p.placementId===null?null:placements.get(p.placementId);assert.ok(p.placementId===null||placement);
  const id='paint-'+p.ordinal,attributes={id,fill:p.operation==='stroke'?'none':rgb(p.fillRgb),stroke:p.operation==='fill'?'none':rgb(p.strokeRgb),
   'fill-rule':'nonzero','stroke-width':coordinate(p.widthSp,'x',id+'.width'),
   'stroke-linecap':['butt','round','square'][p.cap],'stroke-linejoin':['miter','round','bevel'][p.join],
   'stroke-miterlimit':String(p.miter),'stroke-opacity':String(p.strokeOpacity),'fill-opacity':String(p.fillOpacity),
   'stroke-dasharray':p.dashSp.length?p.dashSp.map((v,i)=>coordinate(v,'x',id+'.dash.'+i)).join(' '):'none',
   'stroke-dashoffset':coordinate(p.phaseSp,'x',id+'.phase')};
  assert.ok(attributes['stroke-linecap']&&attributes['stroke-linejoin']);
  return{id,pathId:p.pathId,eventId:p.eventId,placementId:p.placementId,d:data(path,id),transform:transform(placement,id),attributes,clips:[...p.clips]};
 });
 const attrs=a=>Object.entries(a).map(([k,v])=>' '+k+'="'+v+'"').join('');
 const element=row=>'<path'+attrs({...row.attributes,d:row.d,...(row.transform?{transform:row.transform}:{})})+'/>';
 const defs='<defs>'+clipRows.map(c=>'<clipPath id="'+c.id+'" clipPathUnits="userSpaceOnUse">'+element({...c,attributes:{}})+'</clipPath>').join('')+'</defs>';
 const drawing=defs+paintRows.map(p=>p.clips.reduceRight((s,id)=>'<g clip-path="url(#native-clip-'+id+')">'+s+'</g>',element(p))).join('');
 const b=rootMode==='picture'?frame.picture:frame.inkRoot,view=[b.minX,b.minY,b.maxX-b.minX,b.maxY-b.minY].map(x=>edgeDecimal(x,12));
 assert.ok(Number(view[2])>0&&Number(view[3])>0);
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+view[2]+'px" height="'+view[3]+'px" viewBox="'+view.join(' ')+'">'+drawing+'</svg>\n';
 return{svg,instructions:{schemaVersion:1,variant,rootMode,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
  viewBox:view.map(Number),paints:paintRows,clips:clipRows,checks,scope:'All physical native paints in shipped order; path/control/pen/dash translations with declared decimal contracts; unrounded recorded matrix coefficients; effective eight-bit driver colors and independent fill/stroke opacity.'}};
}
