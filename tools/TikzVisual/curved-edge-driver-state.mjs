// Curved-corpus readers preserve empty backend paint calls as diagnostics.
// Only zero-operator paths are excluded from the drawable paint sequence.
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {labelledPdfTokens} from './labelled-border-pdf-vector.mjs';
import {pgfPdfPoint} from './dash-pdf-vector.mjs';

const number=s=>{const n=Number(s);assert.ok(Number.isFinite(n)&&Math.abs(n)<=10000);return n;};
const initial=()=>({fill:[0,0,0],stroke:null,width:1,cap:0,join:0,miter:4,
  fillOpacity:1,strokeOpacity:1,dash:[],phase:0,clips:[]});
const rgb=s=>{assert.match(s,/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/);const t=s.length===4?[...s.slice(1)].map(c=>c+c).join(''):s.slice(1);
  return[0,2,4].map(i=>parseInt(t.slice(i,i+2),16)/255);};

export function edgeSvgPaints(bytes){
  assert.ok(bytes.length<=1000000);const svg=bytes.toString('utf8'),stack=[],paints=[],clips=[];let state=initial(),skip=0,emptyPaints=0;
  const clean=svg.replace(/<\?xml[^>]+\?>/g,'').replace(/<!--[\s\S]*?-->/g,'');
  for(const token of clean.match(/<[^>]+>|[^<]+/g)??[]){
    if(!token.startsWith('<')){assert.equal(token.trim(),'');continue;}
    const closing=token.startsWith('</'),name=/^<\/?([a-zA-Z]+)/.exec(token)?.[1];
    assert.ok(['svg','g','defs','path','use','clipPath'].includes(name),'Unsupported edge SVG element: '+name);
    if(closing){const old=stack.pop();assert.equal(old?.name,name);state=old.state;skip=old.skip;continue;}
    const attrs={},body=token.slice(name.length+1).replace(/\/?\s*>$/,'');
    let rest=body.replace(/([a-zA-Z][a-zA-Z0-9:_-]*)='([^']*)'/g,(_,k,v)=>{assert.ok(!Object.hasOwn(attrs,k));attrs[k]=v;return'';});
    assert.equal(rest.trim(),'');const next=structuredClone(state);
    for(const [key,value]of Object.entries(attrs)){
      if(key==='fill'||key==='stroke')next[key]=value==='none'?null:rgb(value);
      else if(key==='stroke-width')next.width=number(value);
      else if(key==='stroke-miterlimit')next.miter=number(value);
      else if(key==='stroke-linecap'){assert.ok(['butt','round','square'].includes(value));next.cap=['butt','round','square'].indexOf(value);}
      else if(key==='stroke-linejoin'){assert.ok(['miter','round','bevel'].includes(value));next.join=['miter','round','bevel'].indexOf(value);}
      else if(key==='fill-opacity'||key==='stroke-opacity')next[key==='fill-opacity'?'fillOpacity':'strokeOpacity']=number(value);
      else if(key==='stroke-dasharray')next.dash=value==='none'?[]:value.split(',').map(number);
      else if(key==='stroke-dashoffset')next.phase=number(value);
      else if(key==='clip-path'){assert.match(value,/^url\(#[a-zA-Z0-9-]+\)$/);next.clips.push(value.slice(5,-1));}
      else assert.ok(['xmlns','xmlns:xlink','version','width','height','viewBox','id','transform','d','x','y','xlink:href','clip-path','clipPathUnits'].includes(key),'Unsupported edge SVG attribute: '+key);
    }
    if(name==='path'&&!skip){assert.equal(typeof attrs.d,'string');if(attrs.d.length)paints.push({...next,data:attrs.d});else emptyPaints++;}
    if(name==='clipPath')clips.push(attrs.id);
    if(!token.endsWith('/>')){assert.ok(stack.length<64);stack.push({name,state,skip});state=next;if(name==='defs'||name==='clipPath')skip++;}
  }
  assert.equal(stack.length,0);assert.ok(paints.length>0&&paints.length<1000);return{paints,clips,emptyPaints};
}

function pdfObjects(bytes){
  assert.ok(Buffer.isBuffer(bytes)&&bytes.length<=1000000);const text=bytes.toString('latin1'),objects=new Map();
  assert.ok(text.startsWith('%PDF-1.5'));let cursor=0;const pattern=/(\d+) 0 obj\s*/g;
  while(cursor<text.length){pattern.lastIndex=cursor;const match=pattern.exec(text);if(!match)break;
    const start=pattern.lastIndex,end=text.indexOf('endobj',start),stream=text.indexOf('stream\n',start),id=number(match[1]);
    assert.ok(end>start&&Number.isInteger(id)&&id>0&&!objects.has(id)&&objects.size<256);
    if(stream>=0&&stream<end){const body=text.slice(start,stream).trim(),length=Number(/\/Length\s+(\d+)/.exec(body)?.[1]);
      assert.ok(Number.isInteger(length)&&length>0&&length<=1000000&&/\/Filter\s*\/FlateDecode/.test(body));const from=stream+7,to=from+length;
      assert.ok(to<bytes.length&&/^\s*endstream\s*endobj/.test(text.slice(to,to+40)));
      objects.set(id,{body,stream:inflateSync(bytes.subarray(from,to),{maxOutputLength:1000000})});cursor=text.indexOf('endobj',to)+6;
    }else{objects.set(id,{body:text.slice(start,end).trim()});cursor=end+6;}
  }
  assert.ok([...objects.values()].every(o=>!o.body.includes('/ObjStm')));return objects;
}

export function edgePdfPaints(bytes){
  const objects=pdfObjects(bytes),pages=[...objects.values()].filter(o=>/\/Type\s*\/Page\b/.test(o.body));assert.equal(pages.length,1);
  const ref=(body,key)=>{const id=number(new RegExp('/'+key+'\\s+(\\d+) 0 R').exec(body)?.[1]);assert.ok(objects.has(id));return objects.get(id);};
  const content=ref(pages[0].body,'Contents').stream?.toString('latin1');assert.ok(content);
  const resources=ref(pages[0].body,'Resources'),ext=ref(resources.body,'ExtGState').body,alphas={};
  for(const m of ext.matchAll(/\/(pgf@[Cc][Aa][\d.]*)\s*<<\s*\/(CA|ca)\s*([\d.]+)\s*>>/g))alphas[m[1]]={[m[2]==='CA'?'strokeOpacity':'fillOpacity']:number(m[3])};
  const stack=[],paints=[],clips=[];let state={...initial(),stroke:[0,0,0],miter:10},args=[],segments=0,pendingClip=false,inText=false,emptyPaints=0;
  const nums=n=>{assert.equal(args.length,n);assert.ok(args.every(Number.isFinite));return args;};
  for(const token of labelledPdfTokens(content)){
    if(token?.type!=='operator'){args.push(token);assert.ok(args.length<=16);continue;}
    const op=token.name;
    if(op==='q'){assert.equal(segments,0);stack.push(structuredClone(state));assert.ok(stack.length<=64);}
    else if(op==='Q'){assert.equal(segments,0);assert.ok(stack.length);state=stack.pop();}
    else if(op==='g'||op==='G'||op==='rg'||op==='RG'){const v=nums(op.length===1?1:3);state[op===op.toLowerCase()?'fill':'stroke']=v.length===1?[v[0],v[0],v[0]]:[...v];}
    else if(['w','J','j','M'].includes(op)){const v=nums(1)[0];state[{w:'width',J:'cap',j:'join',M:'miter'}[op]]=v;}
    else if(op==='d'){assert.equal(args.length,2);assert.ok(Array.isArray(args[0])&&args[0].every(Number.isFinite)&&Number.isFinite(args[1]));state.dash=[...args[0]];state.phase=args[1];}
    else if(op==='gs'){assert.equal(args.length,1);assert.equal(args[0]?.type,'name');assert.ok(Object.hasOwn(alphas,args[0].name));Object.assign(state,alphas[args[0].name]);}
    else if(op==='m'||op==='l'||op==='c'||op==='re'){assert.ok(!inText);nums({m:2,l:2,c:6,re:4}[op]);segments++;assert.ok(segments<1000);}
    else if(op==='h'){assert.ok(segments);nums(0);segments++;}
    else if(op==='W'||op==='Wstar'){assert.ok(segments&&!pendingClip);nums(0);pendingClip=true;}
    else if(['S','f','B'].includes(op)){assert.ok(!inText);nums(0);if(pendingClip){assert.ok(segments);state.clips.push(clips.length);clips.push(segments);}
      if(segments)paints.push({...structuredClone(state),operation:{S:'stroke',f:'fill',B:'fillstroke'}[op]});else emptyPaints++;segments=0;pendingClip=false;}
    else if(op==='n'){nums(0);if(pendingClip){state.clips.push(clips.length);clips.push(segments);}segments=0;pendingClip=false;}
    else if(op==='BT'){nums(0);assert.ok(!inText);inText=true;}
    else if(op==='ET'){nums(0);assert.ok(inText);inText=false;}
    else if(op==='cm')nums(6);
    else if(op==='Tf'){assert.ok(inText&&args.length===2&&args[0]?.type==='name'&&Number.isFinite(args[1]));}
    else if(op==='Td'){assert.ok(inText);nums(2);}
    else if(op==='TJ'){assert.ok(inText&&args.length===1&&Array.isArray(args[0]));}
    else assert.fail('Unsupported edge PDF operator: '+op);
    args=[];
  }
  assert.equal(args.length,0);assert.equal(stack.length,0);assert.equal(segments,0);assert.equal(pendingClip,false);assert.equal(inText,false);
  assert.ok(paints.length>0&&paints.length<1000);return{paints,clips};
}

export function verifyEdgeDriverState(metrics,svg,pdf){
  const svgState=edgeSvgPaints(svg),pdfState=edgePdfPaints(pdf),order=metrics.physicalOrder.paintedPaths;
  assert.equal(svgState.paints.length,order.length);assert.equal(pdfState.paints.length,order.length);
  let checks=2;const paints=[],constructionDifferences=[];
  function same(actual,expected,limit=0){assert.equal(actual.length,expected.length);for(let i=0;i<actual.length;i++){
    assert.ok(Math.abs(actual[i]-expected[i])<=limit,'Emitted native driver state differs: '+actual[i]+' vs '+expected[i]);checks++;}}
  for(let i=0;i<order.length;i++){
    const pathId=order[i],native=metrics.paths[pathId-1].paint,s=svgState.paints[i],p=pdfState.paints[i];
    assert.equal(p.operation,native.operation);checks++;
    const stroke=native.operation!=='fill',fill=native.operation!=='stroke';
    assert.equal(s.stroke!==null,stroke);assert.equal(s.fill!==null,fill);checks+=2;
    const effective={pathId,operation:p.operation,widthSp:Math.round(s.width*65536),cap:s.cap,join:s.join,miter:s.miter,
      strokeOpacity:s.strokeOpacity,fillOpacity:s.fillOpacity,strokeRgb:s.stroke,fillRgb:s.fill,
      dashSp:s.dash.map(n=>Math.round(n*65536)),dashPhaseSp:Math.round(s.phase*65536),
      clips:s.clips.map(id=>{const index=svgState.clips.indexOf(id);assert.ok(index>=0);return index;})};
    same(effective.clips,p.clips);
    if(stroke){same(s.stroke,p.stroke,1/255);
      same([p.width],[pgfPdfPoint(effective.widthSp)],.000005);
      same([s.cap,s.join,s.miter,s.strokeOpacity],[p.cap,p.join,p.miter,p.strokeOpacity]);
      same(p.dash,effective.dashSp.map(pgfPdfPoint),.000005);
      same([p.phase],[pgfPdfPoint(effective.dashPhaseSp)],.000005);
    }
    if(fill){same(s.fill,p.fill,1/255);same([s.fillOpacity],[p.fillOpacity]);}
    const active=[...(stroke?['widthSp','cap','join','miter','strokeOpacity','strokeRgb','dashSp','dashPhaseSp']:[]),...(fill?['fillOpacity','fillRgb']:[])];
    for(const key of active)if(JSON.stringify(effective[key])!==JSON.stringify(native[key]))
      constructionDifferences.push({pathId,quantity:key,construction:native[key],shipped:effective[key]});
    paints.push(effective);
  }
  const clips=metrics.paths.filter(p=>p.modes.includes('clip')).length;
  assert.equal(svgState.clips.length,clips);assert.equal(pdfState.clips.length,clips);checks+=2;
  return{checks,pathPaints:order.length,clipPaths:clips,passed:true,units:'native sp recovered from SVG dimensions; SVG/PDF effective state; physical paint order',paints,constructionDifferences};
}
