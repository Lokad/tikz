// Independent bounded readers for the authored, glyph-free native arrow corpus.
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {edgeSvgPaints,edgePdfPaints} from './edge-driver-state.mjs';
import {labelledPdfTokens} from './labelled-border-pdf-vector.mjs';
import {pgfPdfPoint} from './dash-pdf-vector.mjs';
const identity=[1,0,0,1,0,0];
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const numeric=s=>{const n=Number(s);assert.ok(s.length>0&&Number.isFinite(n)&&Math.abs(n)<10000);return n;};
// Consecutive moves paint no segment; the later move replaces the earlier one.
// Preserve raw native records and normalize only this declared equivalence.
const collapseMoves=segments=>{const result=[];for(const s of segments){if(s.kind==='move'&&result.at(-1)?.kind==='move')result[result.length-1]=s;else result.push(s);}return result;};
function transform(text){
 let matrix=[...identity],rest=text;
 for(const m of text.matchAll(/(translate|scale|matrix)\(([^)]+)\)/g)){
  const a=m[2].trim().split(/[ ,]+/).map(numeric);let b;
  if(m[1]==='matrix'){assert.equal(a.length,6);b=a;}
  else{assert.ok(a.length===1||a.length===2);b=m[1]==='translate'?[1,0,0,1,a[0],a[1]??0]:[a[0],0,0,a[1]??a[0],0,0];}
  matrix=multiply(matrix,b);rest=rest.replace(m[0],'');
 }
 assert.equal(rest.trim(),'');return matrix;
}
export function arrowSvgSegments(text){
 assert.ok(text.length<=20000);const tokens=text.match(/[MLHVCSZ]|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/g)??[];
 assert.equal(text.replace(/[MLHVCSZ]|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/g,'').replace(/[ ,]/g,''),'');
 let i=0,command,x=0,y=0,sx=0,sy=0,previousControl;const segments=[],point=(x,y)=>({x,y}),n=()=>{assert.ok(i<tokens.length&&!/^[MLHVCSZ]$/.test(tokens[i]));return numeric(tokens[i++]);};
 while(i<tokens.length){if(/^[MLHVCSZ]$/.test(tokens[i]))command=tokens[i++];assert.ok(command);let a;
  if(command!=='C'&&command!=='S')previousControl=undefined;
  if(command==='M'||command==='L'){x=n();y=n();segments.push({kind:command==='M'?'move':'line',point:point(x,y)});if(command==='M'){sx=x;sy=y;command='L';}}
  else if(command==='H'){x=n();segments.push({kind:'line',point:point(x,y)});}
  else if(command==='V'){y=n();segments.push({kind:'line',point:point(x,y)});}
  else if(command==='C'||command==='S'){a=command==='C'?point(n(),n()):previousControl?point(2*x-previousControl.x,2*y-previousControl.y):point(x,y);
   const b=point(n(),n());x=n();y=n();segments.push({kind:'cubic',a,b,point:point(x,y)});previousControl=b;}
  else{assert.equal(command,'Z');segments.push({kind:'close'});x=sx;y=sy;command=null;}
  assert.ok(segments.length<1000);
 }
 return segments;
}
export function arrowSvgVectors(bytes,{allowText=false,trackRules=false}={}){
 assert.ok(bytes.length<=1000000);const text=bytes.toString('utf8').replace(/<\?xml[^>]+\?>|<!--[\s\S]*?-->/g,''),stack=[],paths=[],clips=[];
 let state={matrix:[...identity],clipId:null,defs:false},rootMatrix;
 if(trackRules){state.fillRule='nonzero';state.clipRule='nonzero';}
 for(const token of text.match(/<[^>]+>|[^<]+/g)??[]){
  if(!token.startsWith('<')){assert.equal(token.trim(),'');continue;}
  const name=/^<\/?([a-zA-Z]+)/.exec(token)?.[1];assert.ok(['svg','g','path','defs','clipPath',...(allowText?['use']:[])].includes(name),'Unexpected arrow SVG element: '+name);
  if(token.startsWith('</')){const old=stack.pop();assert.equal(old?.name,name);state=old.state;continue;}
  const attrs={},body=token.slice(name.length+1).replace(/\/?\s*>$/,'');
  assert.equal(body.replace(/([a-zA-Z][a-zA-Z0-9:_-]*)='([^']*)'/g,(_,k,v)=>{assert.ok(!Object.hasOwn(attrs,k));attrs[k]=v;return'';}).trim(),'');
  const next=structuredClone(state);
  if(trackRules)for(const [key,field]of [['fill-rule','fillRule'],['clip-rule','clipRule']])if(attrs[key]){assert.ok(['nonzero','evenodd'].includes(attrs[key]));next[field]=attrs[key];}
  if(attrs.transform){const m=transform(attrs.transform);if(rootMatrix===undefined){assert.equal(name,'g');assert.equal(m[1],0);assert.equal(m[2],0);assert.equal(m[0],.996264);assert.equal(m[3],-.996264);rootMatrix=m;}
   else next.matrix=multiply(next.matrix,m);}
  if(name==='defs')next.defs=true;
  if(name==='clipPath'){assert.ok(attrs.id);next.clipId=attrs.id;}
  if(name==='path'&&!(allowText&&next.defs&&!next.clipId)){assert.ok(attrs.d);const row={segments:arrowSvgSegments(attrs.d),matrix:next.matrix,...(trackRules?{rule:next.clipId?next.clipRule:next.fillRule}:{})};if(next.clipId)clips.push({...row,id:next.clipId});else{assert.equal(next.defs,false);paths.push(row);}}
  if(!token.endsWith('/>')){assert.ok(stack.length<64);stack.push({name,state});state=next;}
 }
 assert.ok(rootMatrix);assert.equal(stack.length,0);return{rootMatrix,paths,clips};
}
export function arrowPdfVectors(bytes,{allowText=false,trackRules=false}={}){
 assert.ok(bytes.length<=1000000);const text=bytes.toString('latin1'),objects=new Map();assert.ok(text.startsWith('%PDF-1.5'));let cursor=0;const header=/(\d+) 0 obj\s*/g;
 while(cursor<text.length){header.lastIndex=cursor;const m=header.exec(text);if(!m)break;const start=header.lastIndex,end=text.indexOf('endobj',start),stream=text.indexOf('stream\n',start),id=Number(m[1]);assert.ok(end>start&&!objects.has(id)&&objects.size<256);
  if(stream>=0&&stream<end){const body=text.slice(start,stream).trim(),length=Number(/\/Length\s+(\d+)\b/.exec(body)?.[1]);assert.ok(length>0&&length<=1000000&&/\/Filter\s*\/FlateDecode/.test(body));
   const from=stream+7,to=from+length;assert.ok(to<bytes.length&&/^\s*endstream\s*endobj/.test(text.slice(to,to+40)));objects.set(id,{body,stream:inflateSync(bytes.subarray(from,to),{maxOutputLength:1000000})});cursor=text.indexOf('endobj',to)+6;
  }else{objects.set(id,{body:text.slice(start,end).trim()});cursor=end+6;}
 }
 assert.ok([...objects.values()].every(o=>!o.body.includes('/ObjStm')));const pages=[...objects.values()].filter(o=>/\/Type\s*\/Page\b/.test(o.body));assert.equal(pages.length,1);
 const contentId=Number(/\/Contents\s+(\d+) 0 R/.exec(pages[0].body)?.[1]),content=objects.get(contentId)?.stream?.toString('latin1');assert.ok(content);
 const paths=[],clips=[],stack=[];let matrix=[...identity],rootMatrix,segments=[],pendingClip=false,args=[],textActive=false;
 let clipRule;
 const nums=n=>{assert.equal(args.length,n);assert.ok(args.every(Number.isFinite));return args;};
 const idle=()=>{assert.equal(segments.length,0);assert.equal(textActive,false);};
 const point=(x,y)=>({x,y});
 for(const t of labelledPdfTokens(content,{allowStarOperators:true})){
  if(t?.type!=='operator'){assert.ok(args.length<16);args.push(t);continue;}const op=t.name;let a;
  if(op==='q'){nums(0);idle();assert.ok(stack.length<64);stack.push([...matrix]);}
  else if(op==='Q'){nums(0);idle();assert.ok(stack.length>0);matrix=stack.pop();}
  else if(op==='cm'){idle();a=nums(6);if(rootMatrix===undefined){assert.equal(stack.length,0);assert.deepEqual(a.slice(0,4),[1,0,0,1]);rootMatrix=[...a];}else matrix=multiply(matrix,a);}
  else if(op==='m'||op==='l'){assert.equal(textActive,false);a=nums(2);segments.push({kind:op==='m'?'move':'line',point:point(...a)});}
  else if(op==='c'){assert.equal(textActive,false);a=nums(6);segments.push({kind:'cubic',a:point(a[0],a[1]),b:point(a[2],a[3]),point:point(a[4],a[5])});}
  else if(op==='re'){assert.equal(textActive,false);a=nums(4);const [x,y,w,h]=a;segments.push({kind:'move',point:point(x,y)},{kind:'line',point:point(x+w,y)},{kind:'line',point:point(x+w,y+h)},{kind:'line',point:point(x,y+h)},{kind:'close'});}
  else if(op==='h'){assert.equal(textActive,false);nums(0);assert.ok(segments.length);segments.push({kind:'close'});}
  else if(['S','f','f*','B','B*'].includes(op)){assert.equal(textActive,false);nums(0);assert.ok(rootMatrix&&segments.length&&!pendingClip);paths.push({segments,matrix:[...matrix],operation:op==='S'?'stroke':op.startsWith('f')?'fill':'fillstroke',...(trackRules?{rule:op.endsWith('*')?'evenodd':'nonzero'}:{})});segments=[];}
  else if(op==='W'||op==='W*'){assert.equal(textActive,false);nums(0);assert.ok(segments.length&&!pendingClip);pendingClip=true;clipRule=op==='W*'?'evenodd':'nonzero';}
  else if(op==='n'){assert.equal(textActive,false);nums(0);if(pendingClip)clips.push({segments,matrix:[...matrix],...(trackRules?{rule:clipRule}:{})});segments=[];pendingClip=false;}
  else if(['w','M','J','j'].includes(op)){idle();nums(1);}
  // pdfTeX can change text color/opacity inside BT/ET. The separate paint
  // reader retains that state; these operators cannot change path geometry.
  else if(op==='g'||op==='G'){assert.equal(segments.length,0);nums(1);}
  else if(op==='rg'||op==='RG'){assert.equal(segments.length,0);nums(3);}
  else if(op==='d'){idle();assert.equal(args.length,2);assert.ok(Array.isArray(args[0])&&Number.isFinite(args[1]));}
  else if(op==='gs'){assert.equal(segments.length,0);assert.equal(args.length,1);assert.equal(args[0]?.type,'name');}
  // Text is grounded by the separate DVI/TFM reader. Admit only this native
  // text grammar while preserving all surrounding path/graphics state.
  else if(allowText&&op==='BT'){idle();nums(0);textActive=true;}
  else if(allowText&&op==='ET'){assert.equal(textActive,true);nums(0);textActive=false;}
  else if(allowText&&op==='Tf'){assert.equal(textActive,true);assert.equal(args.length,2);assert.match(args[0]?.name??'',/^F\d+$/);assert.ok(Number.isFinite(args[1])&&args[1]>0&&args[1]<=100);}
  else if(allowText&&op==='Td'){assert.equal(textActive,true);nums(2);}
  else if(allowText&&op==='TJ'){assert.equal(textActive,true);assert.equal(args.length,1);assert.ok(Array.isArray(args[0])&&args[0].every(v=>Number.isFinite(v)||v?.type==='string'));}
  else assert.fail('Unexpected arrow PDF operator: '+op);
  args=[];
 }
 assert.equal(args.length,0);assert.equal(stack.length,0);idle();assert.equal(pendingClip,false);assert.ok(rootMatrix);
 const boxes=[...text.matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)];assert.equal(boxes.length,1);const mediaBox=boxes[0][1].trim().split(/\s+/).map(numeric);assert.equal(mediaBox.length,4);
 return{rootMatrix,mediaBox,paths,clips};
}
function nativeSegments(path,convert){
 const result=[],p=s=>({x:convert(s.xSp),y:convert(s.ySp)}),all=path.segments;
 for(let i=0;i<all.length;i++){const s=all[i];
  if(s.kind==='control1'){assert.equal(all[i+1]?.kind,'control2');assert.equal(all[i+2]?.kind,'curve');result.push({kind:'cubic',a:p(s),b:p(all[++i]),point:p(all[++i])});}
  else if(s.kind==='rectcorner'){assert.equal(all[i+1]?.kind,'rectsize');const size=all[++i],x=s.xSp,y=s.ySp,w=size.xSp,h=size.ySp;
   // PGF converts each PDF `re` operand separately; conversion truncates, so
   // converting a corner after adding its size is a different operation.
   const cx=convert(x),cy=convert(y),cw=convert(w),ch=convert(h);
   result.push(...[[cx,cy],[cx+cw,cy],[cx+cw,cy+ch],[cx,cy+ch]].map(([x,y],j)=>({kind:j?'line':'move',point:{x,y},rectangleOperands:j===0?1:2})),{kind:'close'});}
  else{assert.ok(['move','line','close'].includes(s.kind));result.push(s.kind==='close'?{kind:'close'}:{kind:s.kind,point:p(s)});}
 }
 return collapseMoves(result);
}
function driverSegments(path,actual,convert,allowDegenerateLine,allowTrailingDegenerateLine=false){
 const expected=nativeSegments(path,convert),raw=path.segments;
 // The dvisvgm system driver omits an isolated zero-length butt stroke.
 // Require the exact native registers and the sole move/line pair; no general
 // line omission or rounded-coordinate equivalence is admitted.
 if(allowDegenerateLine&&path.paint==='stroke'&&raw.length===2&&raw[0].kind==='move'&&raw[1].kind==='line'
  &&raw[0].xSp===raw[1].xSp&&raw[0].ySp===raw[1].ySp&&actual.length===1&&actual[0].kind==='move'
  )return expected.slice(0,1);
 // Observed smooth-plot continuation: exactly one trailing coincident line
 // after a cubic is omitted by the SVG driver. Keep PDF and candidate geometry
 // strict, and admit neither interior omissions nor repeated zero lines.
 const previous=raw.at(-2),last=raw.at(-1);
 return allowTrailingDegenerateLine&&path.paint==='stroke'&&previous?.kind==='curve'&&last?.kind==='line'
  &&previous.xSp===last.xSp&&previous.ySp===last.ySp&&expected.length===actual.length+1
  &&actual.at(-1)?.kind==='cubic'?expected.slice(0,-1):expected;
}
// Shared by the math supplement: path identity is independent of text/rules.
// Keep native SVG serialization limits here; PDF checking remains separate.
export function matchNativeArrowSvgOrder(metrics,svgPaths,svgPaints,{allowDegenerateLine=false,allowTrailingDegenerateLine=false}={}){
 const paints=[];
 for(const event of metrics.paintEvents){
  if(event.kind==='path'){const p=metrics.paths[event.target-1];assert.equal(p.role,'shaft');assert.ok(p.paint);paints.push({eventId:event.id,pathId:p.id,role:'shaft',path:p,matrix:[...identity]});}
  else{const place=metrics.placements[event.target-1],tip=metrics.templates[place.templateId-1];for(const id of tip.paths){const p=metrics.paths[id-1];paints.push({eventId:event.id,pathId:id,role:'tip',placementId:place.id,path:p,matrix:[...place.matrix,place.xSp/65536,place.ySp/65536]});}}
 }
 for(const a of [svgPaths,svgPaints])assert.equal(a.length,paints.length,'Native shipped paint count.');
 const matches=(a,p,permit,trailingPermit)=>{const actual=collapseMoves(a.segments),expected=driverSegments(p,actual,n=>n/65536,permit,trailingPermit);return actual.length===expected.length&&expected.every((e,j)=>{
  const r=actual[j];return r.kind===e.kind&&['point','a','b'].every(k=>!e[k]||['x','y'].every(axis=>Math.abs(r[k][axis]-e[k][axis])<=1/65536));});};
 const remaining=[...paints],physical=[];
 for(let i=0;i<svgPaths.length;i++){const s=svgPaints[i],operation=s.stroke===null?'fill':s.fill===null?'stroke':'fillstroke';
  const matchesIndex=remaining.flatMap((e,j)=>e.path.paint===operation&&matches(svgPaths[i],e.path,allowDegenerateLine&&s.cap===0,allowTrailingDegenerateLine&&s.cap===0)&&e.matrix.every((n,k)=>Math.abs(n-svgPaths[i].matrix[k])<=(k<4?1e-6:1/65536))?[j]:[]);
  assert.equal(matchesIndex.length,1,'Native SVG paint requires one geometry/placement identity: '+(i+1));physical.push(remaining.splice(matchesIndex[0],1)[0]);}
 assert.equal(remaining.length,0);return physical;
}
export function verifyArrowDriverState(metrics,svg,pdf,page,{allowText=false,wrapperExtraWidthSp=0,allowDegenerateLine=false,allowTrailingDegenerateLine=false}={}){
 const sv=arrowSvgVectors(svg,{allowText}),pv=arrowPdfVectors(pdf,{allowText}),ss=edgeSvgPaints(svg),ps=edgePdfPaints(pdf),checks=[];
 const scalar=(quantity,expected,actual,limit=0)=>{const delta=Math.abs(expected-actual);assert.ok(Number.isFinite(expected)&&Number.isFinite(actual)&&delta<=limit,quantity+': '+actual+' vs '+expected+' (limit '+limit+')');checks.push({quantity,expected,actual,delta,limit});};
 assert.ok(page&&Number.isSafeInteger(page.widthSp)&&Number.isSafeInteger(page.heightSp));const bpPerSp=72/(72.27*65536),bounds=metrics.pictureBounds,box=metrics.pictureBox;
 assert.deepEqual(pv.mediaBox.slice(0,2),[0,0]);scalar('pdf.page.width',page.widthSp*bpPerSp,pv.mediaBox[2],.000500000001);scalar('pdf.page.height',page.heightSp*bpPerSp,pv.mediaBox[3],.000500000001);
 assert.ok(Number.isSafeInteger(wrapperExtraWidthSp)&&wrapperExtraWidthSp>=0&&(allowText||wrapperExtraWidthSp===0));
 scalar('pdf.origin.x',(page.boxXSp+wrapperExtraWidthSp-bounds.minXSp)*bpPerSp,pv.rootMatrix[4],.000500000001);
 scalar('pdf.origin.y',(page.boxBaselineYSp-bounds.minYSp-box.depthSp)*bpPerSp,pv.rootMatrix[5],.000500000001);
 for(const s of metrics.shortening){const input=metrics.inputs[s.inputId-1],places=metrics.placements.filter(p=>p.inputId===s.inputId&&p.side===s.side);assert.ok(places.length<=1);
  const tip=places.length?metrics.templates[places[0].templateId-1]:null,additional=input.additionalShorteningSp[s.side];
  scalar('input-'+s.inputId+'.'+s.side+'.shortening',additional+(tip?tip.ends.tipSp-tip.ends.lineSp:0),s.distanceSp);
  scalar('input-'+s.inputId+'.'+s.side+'.totalLength',additional+(tip?tip.ends.tipSp-tip.ends.backSp:0),s.totalLengthSp);
 }
 for(const input of metrics.inputs){if(input.segments.length!==2||input.segments[0].kind!=='move'||input.segments[1].kind!=='line')continue;
  const [start,end]=input.segments,dx=end.xSp-start.xSp,dy=end.ySp-start.ySp;if((dx!==0)===(dy!==0))continue;
  const short=Object.fromEntries(metrics.shortening.filter(s=>s.inputId===input.id).map(s=>[s.side,s]));if(!short.start||!short.end||short.start.distanceSp+short.end.distanceSp>=Math.abs(dx||dy))continue;
  const paths=metrics.paths.filter(p=>p.role==='shaft'&&p.inputId===input.id&&p.paint);assert.equal(paths.length,1);assert.equal(paths[0].segments.length,2);
  const ux=Math.sign(dx),uy=Math.sign(dy),[a,b]=paths[0].segments;
  for(const [axis,u]of [['xSp',ux],['ySp',uy]]){scalar('input-'+input.id+'.shaft.start.'+axis,start[axis]+u*short.start.distanceSp,a[axis]);scalar('input-'+input.id+'.shaft.end.'+axis,end[axis]-u*short.end.distanceSp,b[axis]);}
  for(const place of metrics.placements.filter(p=>p.inputId===input.id)){const tip=metrics.templates[place.templateId-1],additional=input.additionalShorteningSp[place.side],d=tip.ends.tipSp+additional,sign=place.side==='start'?1:-1,point=place.side==='start'?start:end;
   scalar('placement-'+place.id+'.axis.x',point.xSp+sign*ux*d,place.xSp);scalar('placement-'+place.id+'.axis.y',point.ySp+sign*uy*d,place.ySp);}
 }
 const physical=matchNativeArrowSvgOrder(metrics,sv.paths,ss.paints,{allowDegenerateLine,allowTrailingDegenerateLine});
 for(const a of [pv.paths,ps.paints])assert.equal(a.length,physical.length,'Native shipped paint count.');
 assert.equal(sv.clips.length,metrics.clips.length);assert.equal(pv.clips.length,metrics.clips.length);
 const omissions=[];
 const geometry=(id,a,p,convert,limit,permit=false,trailingPermit=false)=>{const actual=collapseMoves(a.segments),expected=driverSegments(p,actual,convert,permit,trailingPermit);
  if(expected.length!==nativeSegments(p,convert).length)omissions.push({quantity:id,nativePathId:p.id,kind:p.segments.length===2?'isolated-zero-length-butt-stroke':'trailing-zero-length-butt-line-after-cubic'});
  assert.equal(actual.length,expected.length,id+' segment count');for(let j=0;j<expected.length;j++){const e=expected[j],r=actual[j];assert.equal(r.kind,e.kind,id+'.'+j+' segment kind');for(const key of ['point','a','b'])if(e[key])for(const axis of ['x','y'])scalar(id+'.'+j+'.'+key+'.'+axis,e[key][axis],r[key][axis],limit*(convert===pgfPdfPoint?(e.rectangleOperands??1):1));}};
 const shipped=[];
 for(let i=0;i<physical.length;i++){const e=physical[i],s=ss.paints[i],p=ps.paints[i],id='paint-'+(i+1),stroke=e.path.paint!=='fill',fill=e.path.paint!=='stroke';
  assert.equal(p.operation,e.path.paint);assert.equal(pv.paths[i].operation,e.path.paint);assert.equal(s.stroke!==null,stroke);assert.equal(s.fill!==null,fill);
  geometry(id+'.svg',sv.paths[i],e.path,n=>n/65536,1/65536,allowDegenerateLine&&s.cap===0,allowTrailingDegenerateLine&&s.cap===0);
  geometry(id+'.pdf',pv.paths[i],e.path,pgfPdfPoint,.000007629396);
  for(let j=0;j<6;j++){scalar(id+'.svg.matrix.'+j,e.matrix[j],sv.paths[i].matrix[j],j<4?1e-6:1/65536);const expected=j<4?e.matrix[j]:pgfPdfPoint(Math.round(e.matrix[j]*65536));scalar(id+'.pdf.matrix.'+j,expected,pv.paths[i].matrix[j],j<4?1e-10:.000007629396);}
  if(stroke){scalar(id+'.svg.pen',e.path.lineWidthSp,s.width*65536,.5);scalar(id+'.pdf.pen',pgfPdfPoint(e.path.lineWidthSp),p.width,.000007629396);
   for(const k of ['cap','join','miter','strokeOpacity'])scalar(id+'.'+k,s[k],p[k]);assert.equal(s.dash.length,p.dash.length);
   s.dash.forEach((n,j)=>scalar(id+'.dash.'+j,pgfPdfPoint(Math.round(n*65536)),p.dash[j],.000007629396));scalar(id+'.phase',pgfPdfPoint(Math.round(s.phase*65536)),p.phase,.000007629396);
   s.stroke.forEach((n,j)=>scalar(id+'.stroke.'+j,n,p.stroke[j],1/255));}
  if(fill){scalar(id+'.fillOpacity',s.fillOpacity,p.fillOpacity);s.fill.forEach((n,j)=>scalar(id+'.fill.'+j,n,p.fill[j],1/255));}
  assert.deepEqual(s.clips.map(id=>ss.clips.indexOf(id)),p.clips);
  if(e.role==='tip'){assert.deepEqual(s.dash,[],'Native arrow tip must reset dash.');assert.equal(s.phase,0);}
  shipped.push({ordinal:i+1,eventId:e.eventId,role:e.role,pathId:e.pathId,placementId:e.placementId??null,operation:e.path.paint,widthSp:e.path.lineWidthSp,
   cap:s.cap,join:s.join,miter:s.miter,strokeOpacity:s.strokeOpacity,fillOpacity:s.fillOpacity,strokeRgb:s.stroke,fillRgb:s.fill,dashSp:s.dash.map(n=>Math.round(n*65536)),phaseSp:Math.round(s.phase*65536),clips:p.clips});
 }
 for(let i=0;i<metrics.clips.length;i++){const p=metrics.paths[metrics.clips[i]-1];geometry('clip-'+i+'.svg',sv.clips[i],p,n=>n/65536,1/65536);geometry('clip-'+i+'.pdf',pv.clips[i],p,pgfPdfPoint,.000007629396);
  assert.deepEqual(sv.clips[i].matrix,identity);assert.deepEqual(pv.clips[i].matrix,identity);}
 return{passed:true,checks,paints:shipped,clips:metrics.clips.length,svgRootMatrix:sv.rootMatrix,pdfRootMatrix:pv.rootMatrix,
  ...(omissions.some(o=>o.kind==='isolated-zero-length-butt-stroke')?{isolatedButtDegenerateOmissions:omissions.filter(o=>o.kind==='isolated-zero-length-butt-stroke')}:{}),
  ...(omissions.some(o=>o.kind==='trailing-zero-length-butt-line-after-cubic')?{trailingButtDegenerateOmissions:omissions.filter(o=>o.kind==='trailing-zero-length-butt-line-after-cubic')}:{}),
  orderSource:'Unique native geometry/placement identities matched to original SVG order and independently checked in original PDF order; callbacks may be buffered.',
  scope:'Independently decoded native SVG/PDF path geometry, placement, paint order and effective state. Driver serialization limits only; no candidate image policy.'};
}
