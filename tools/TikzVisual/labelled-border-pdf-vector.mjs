// Bounded reader for the three trusted pdfTeX fixtures, not a PDF interpreter.
// Original PDF operands/resources remain separate from native TeX/DVI records.
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {pgfPdfPoint} from './dash-pdf-vector.mjs';

const bpPerSp=72/(72.27*65536),identity=[1,0,0,1,0,0],normal=v=>JSON.parse(JSON.stringify(v));
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];

// pdfTeX's printed Tf grid also changes the denominator used for /Widths.
// For this fixed 10/12-point profile, positive TFM advances truncate to one sp.
export function labelledPdfFontGrid(sizePt,fraction=0){
  assert.ok([10,12].includes(sizePt)&&Number.isFinite(fraction)&&fraction>=0&&fraction<=3);
  const sizeSp=sizePt*65536,hundredBpSp=6578176,printed=Math.round(sizeSp*1000000/hundredBpSp),fontSp=sizeSp-Math.trunc((sizeSp*1000000-printed*hundredBpSp)/1000000),advanceSp=Math.floor(fraction*sizeSp);
  return{sizeSp,printedSizeBp:printed/10000,fontSp,advanceSp,printedWidth:Math.round(advanceSp*10000/fontSp)/10};
}

function objects(bytes){
  assert.ok(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=1000000);const text=bytes.toString('latin1');assert.ok(text.startsWith('%PDF-1.5'));
  const map=new Map(),header=/(\d+) 0 obj\s*/g;let cursor=0;
  while(cursor<text.length){header.lastIndex=cursor;const m=header.exec(text);if(!m)break;const start=header.lastIndex,end=text.indexOf('endobj',start),stream=text.indexOf('stream\n',start),id=Number(m[1]);assert.ok(end>start&&!map.has(id)&&map.size<128);
    if(stream>=0&&stream<end){const dict=text.slice(start,stream).trim(),length=Number(/\/Length\s+(\d+)\b/.exec(dict)?.[1]);assert.ok(Number.isSafeInteger(length)&&length>0&&length<=1000000&&dict.startsWith('<<')&&dict.endsWith('>>'));
      const bodyStart=stream+7,bodyEnd=bodyStart+length;assert.ok(bodyEnd<=bytes.length&&/^\s*endstream\s*endobj/.test(text.slice(bodyEnd,bodyEnd+40)));
      assert.ok(/\/Filter\s*\/FlateDecode\b/.test(dict));const decoded=inflateSync(bytes.subarray(bodyStart,bodyEnd),{maxOutputLength:1000000});map.set(id,{body:dict,stream:decoded});cursor=text.indexOf('endobj',bodyEnd)+6;
    }else{map.set(id,{body:text.slice(start,end).trim()});cursor=end+6;}
  }
  assert.ok(map.size>0);assert.ok([...map.values()].every(o=>!o.body.includes('/ObjStm')),'Object streams are outside this fixed reference profile.');return map;
}

export function labelledPdfTokens(content,{allowStarOperators=false}={}){
  assert.ok(typeof content==='string'&&content.length<=1000000);const result=[];let index=0;
  function token(){while(index<content.length&&/\s/.test(content[index]))index++;assert.ok(index<content.length);const c=content[index];
    if(c==='['){index++;const a=[];while(true){while(/\s/.test(content[index]??''))index++;if(content[index]===']'){index++;return a;}assert.ok(index<content.length&&a.length<256);const t=token();assert.ok(typeof t==='number'||t?.type==='string');a.push(t);}}
    if(c==='('){index++;const slots=[];let depth=1;while(depth){assert.ok(index<content.length&&slots.length<256);let ch=content[index++];
      if(ch==='\\'){assert.ok(index<content.length);ch=content[index++];if(/[0-7]/.test(ch)){let octal=ch;for(let j=0;j<2&&/[0-7]/.test(content[index]??'');j++)octal+=content[index++];slots.push(parseInt(octal,8));continue;}
        if(ch==='\r'||ch==='\n'){if(ch==='\r'&&content[index]==='\n')index++;continue;}ch=({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f'})[ch]??ch;
      }else if(ch==='(')depth++;else if(ch===')'){depth--;if(depth===0)break;}
      assert.ok(ch.charCodeAt(0)<=255);slots.push(ch.charCodeAt(0));}return{type:'string',slots};}
    const tail=content.slice(index);let m;if((m=/^\/([A-Za-z][A-Za-z0-9@.-]*)/.exec(tail))){index+=m[0].length;return{type:'name',name:m[1]};}
    if((m=/^[+-]?(?:\d+(?:\.\d{1,5})?|\.\d{1,5})/.exec(tail))){index+=m[0].length;assert.ok(!/[\d.]/.test(content[index]??''));const n=Number(m[0]);assert.ok(Number.isFinite(n)&&Math.abs(n)<=10000);return n;}
    m=(allowStarOperators?/^[A-Za-z]+\*?/:/^[A-Za-z]+/).exec(tail);assert.ok(m,'Unsupported fixed PDF token.');
    if(m[0].endsWith('*'))assert.ok(['f*','B*','W*'].includes(m[0]),'Unsupported starred PDF operator.');
    index+=m[0].length;return{type:'operator',name:m[0]};
  }
  while(index<content.length){while(index<content.length&&/\s/.test(content[index]))index++;if(index===content.length)break;assert.ok(result.length<10000);result.push(token());}return result;
}

export function parseLabelledPdfContent(content,fonts){
  const stack=[],paths=[],glyphs=[],operations=[];let state={matrix:[...identity],error:{x:0,y:0},width:1,dash:[],phase:0,cap:0,join:0,miter:10,fill:[0,0,0],stroke:[0,0,0]},segments=[],text=null,origin=null,args=[];
  const idle=()=>assert.ok(!text&&segments.length===0),numbers=n=>{assert.equal(args.length,n);assert.ok(args.every(Number.isFinite));return args;},point=(x,y)=>({x,y});
  for(const t of labelledPdfTokens(content)){if(t?.type!=='operator'){assert.ok(args.length<16);args.push(t);continue;}
    const op=t.name;let v;
    if(op==='q'){idle();assert.equal(args.length,0);assert.ok(stack.length<64);stack.push(structuredClone(state));}
    else if(op==='Q'){idle();assert.equal(args.length,0);assert.ok(stack.length>0);state=stack.pop();}
    else if(op==='cm'){idle();v=numbers(6);if(!origin){assert.equal(stack.length,0);assert.deepEqual(v.slice(0,4),[1,0,0,1]);origin={x:v[4],y:v[5]};}
      const a=state.matrix;state.error={x:state.error.x+(Math.abs(a[0])+Math.abs(a[2]))*.0005,y:state.error.y+(Math.abs(a[1])+Math.abs(a[3]))*.0005};state.matrix=multiply(a,v);}
    else if(op==='w'||op==='M'){idle();v=numbers(1)[0];assert.ok(v>0&&v<1000);state[op==='w'?'width':'miter']=v;}
    else if(op==='J'||op==='j'){idle();v=numbers(1)[0];assert.ok([0,1,2].includes(v));state[op==='J'?'cap':'join']=v;}
    else if(op==='g'||op==='G'||op==='rg'||op==='RG'){idle();v=numbers(op.length===1?1:3);assert.ok(v.every(n=>n>=0&&n<=1));state[op===op.toLowerCase()?'fill':'stroke']=v.length===1?[v[0],v[0],v[0]]:[...v];}
    else if(op==='d'){idle();assert.equal(args.length,2);assert.ok(Array.isArray(args[0])&&args[0].length<=64&&args[0].every(n=>Number.isFinite(n)&&n>=0)&&(!args[0].length||args[0].some(n=>n>0))&&Number.isFinite(args[1]));state.dash=[...args[0]];state.phase=args[1];}
    else if(op==='m'||op==='l'){assert.ok(!text&&(op==='m'||segments.length));v=numbers(2);segments.push({kind:op==='m'?'move':'line',point:point(...v)});}
    else if(op==='c'){assert.ok(!text&&segments.length);v=numbers(6);segments.push({kind:'cubic',a:point(v[0],v[1]),b:point(v[2],v[3]),point:point(v[4],v[5])});}
    else if(op==='re'){idle();v=numbers(4);segments.push({kind:'rect',point:point(v[0],v[1]),size:point(v[2],v[3])});}
    else if(op==='h'){assert.ok(!text&&segments.length);assert.equal(args.length,0);segments.push({kind:'close'});}
    else if(op==='S'){assert.ok(origin&&!text&&segments.length&&paths.length<16);assert.equal(args.length,0);operations.push({kind:'path',index:paths.length});paths.push({segments,state:structuredClone(state)});segments=[];}
    else if(op==='n'){idle();assert.equal(args.length,0);}
    else if(op==='BT'){idle();assert.equal(args.length,0);text={x:0,y:0,errorX:0,errorY:0,cursor:0,cursorError:0,font:null,size:null};}
    else if(op==='ET'){assert.ok(text);assert.equal(args.length,0);text=null;}
    else if(op==='Tf'){assert.ok(text&&args.length===2&&args[0]?.type==='name'&&Object.hasOwn(fonts,args[0].name)&&Number.isFinite(args[1])&&args[1]>0&&args[1]<=100);text.font=args[0].name;text.size=args[1];}
    else if(op==='Td'){assert.ok(text);v=numbers(2);text.x+=v[0];text.y+=v[1];text.errorX+=.0005;text.errorY+=.0005;text.cursor=0;text.cursorError=0;}
    else if(op==='TJ'){assert.ok(text?.font&&args.length===1&&Array.isArray(args[0]));const f=fonts[text.font];
      for(const item of args[0]){if(typeof item==='number'){assert.ok(Number.isInteger(item));text.cursor-=item*text.size/1000;text.cursorError+=text.size*.0005+Math.abs(item)*.00005/1000+bpPerSp;continue;}
        assert.equal(item.type,'string');for(const slot of item.slots){assert.ok(glyphs.length<64&&Object.hasOwn(f.widths,slot));const a=state.matrix,x=text.x+text.cursor,y=text.y,p=multiply(a,[1,0,0,1,x,y]);
          operations.push({kind:'glyph',index:glyphs.length});glyphs.push({font:f.face,resource:text.font,slot,size:text.size,matrix:p,color:[...state.fill],error:{x:state.error.x+Math.abs(a[0])*(text.errorX+text.cursorError)+Math.abs(a[2])*text.errorY,y:state.error.y+Math.abs(a[1])*(text.errorX+text.cursorError)+Math.abs(a[3])*text.errorY}});
          const width=f.widths[slot],grid=labelledPdfFontGrid(f.sizePt);text.cursor+=width*text.size/1000;text.cursorError+=text.size*.00005+Math.abs(width)*(.00005/1000+Math.abs(grid.fontSp-grid.sizeSp)*bpPerSp/1000)+bpPerSp;
        }}
    }else assert.fail('Unsupported fixed PDF operator: '+op);
    args=[];assert.ok(segments.length<=256);
  }
  assert.equal(args.length,0);assert.equal(stack.length,0);idle();assert.ok(origin);return normal({origin,paths,glyphs,operations});
}

export function parseLabelledPdf(bytes){
  const map=objects(bytes),one=values=>{assert.equal(values.length,1);return values[0];},page=one([...map.entries()].filter(([,o])=>/\/Type\s*\/Page\b/.test(o.body)));
  const ref=(body,name)=>{const m=new RegExp('/'+name+'\\s+(\\d+) 0 R\\b').exec(body);assert.ok(m,'Missing PDF '+name+' reference.');assert.ok(map.has(Number(m[1])));return map.get(Number(m[1]));};
  const mediaBox=/\/MediaBox\s*\[([^\]]+)\]/.exec(page[1].body)?.[1].trim().split(/\s+/).map(Number);assert.ok(mediaBox?.length===4&&mediaBox.every(Number.isFinite)&&mediaBox[0]===0&&mediaBox[1]===0&&mediaBox[2]>0&&mediaBox[3]>0);
  const resources=ref(page[1].body,'Resources').body,fontBlock=/\/Font\s*<<([^>]*)>>/.exec(resources);assert.ok(fontBlock);const fonts={};
  for(const m of fontBlock[1].matchAll(/\/(F\d+)\s+(\d+) 0 R/g)){const o=map.get(Number(m[2]));assert.ok(o&&/\/Type\s*\/Font\b/.test(o.body)&&/\/Subtype\s*\/Type1\b/.test(o.body));
    const cmap=ref(o.body,'ToUnicode').stream?.toString('ascii'),code=/\/CMapName\s*\/TeX-(ec-lm(?:r|ri|bx)(?:10|12))-lm-ec-0\b/.exec(cmap??'');assert.ok(code);
    const size=Number(code[1].slice(-2)),style=code[1].startsWith('ec-lmri')?'italic':code[1].startsWith('ec-lmbx')?'bold':'regular',face=style+'-'+size;
    const descriptor=ref(o.body,'FontDescriptor'),baseName=/\/BaseFont\s*\/([A-Za-z0-9+-]+)/.exec(o.body)?.[1],expected='LMRoman'+size+'-'+({regular:'Regular',italic:'Italic',bold:'Bold'})[style];assert.match(baseName,new RegExp('^[A-Z]{6}\\+'+expected+'$'));assert.ok(descriptor.body.includes('/FontName /'+baseName));assert.ok(ref(descriptor.body,'FontFile').stream?.length>0);
    const first=Number(/\/FirstChar\s+(\d+)/.exec(o.body)?.[1]),last=Number(/\/LastChar\s+(\d+)/.exec(o.body)?.[1]),widthText=ref(o.body,'Widths').body;assert.match(widthText,/^\[[\d.\s]+\]$/);const widths=widthText.slice(1,-1).trim().split(/\s+/).map(Number);
    assert.ok(first>=0&&last<=255&&first<=last&&widths.length===last-first+1&&widths.every(n=>Number.isFinite(n)&&n>=0&&n<=3000));assert.ok(!Object.hasOwn(fonts,m[1]));
    const encodingBody=ref(o.body,'Encoding').body,differences=/\/Differences\s*\[([^\]]+)\]/.exec(encodingBody);assert.ok(differences);const encoding={};let slot=null;
    for(const value of differences[1].matchAll(/\d+|\/[A-Za-z]+/g)){if(value[0].startsWith('/')){assert.ok(Number.isSafeInteger(slot)&&slot>=0&&slot<=255&&!Object.hasOwn(encoding,slot));encoding[slot++]=value[0].slice(1);}else{slot=Number(value[0]);assert.ok(slot<=255);}}
    fonts[m[1]]={face,sizePt:size,tfm:code[1]+'.tfm',first,last,widths:Object.fromEntries(widths.map((w,i)=>[first+i,w])),encoding,baseName};
  }
  assert.ok(Object.keys(fonts).length>=1&&Object.keys(fonts).length<=6);const content=ref(page[1].body,'Contents').stream?.toString('latin1');assert.ok(content);return{...parseLabelledPdfContent(content,fonts),mediaBox,fonts,content};
}

function tfmWidth(bytes,slot){assert.ok(Buffer.isBuffer(bytes)&&bytes.length>=24);const lh=bytes.readUInt16BE(2),bc=bytes.readUInt16BE(4),ec=bytes.readUInt16BE(6),nw=bytes.readUInt16BE(8);assert.ok(slot>=bc&&slot<=ec);const ci=(6+lh+slot-bc)*4,index=bytes[ci];assert.ok(index<nw);const offset=(6+lh+ec-bc+1+index)*4;assert.ok(offset+4<=bytes.length);return bytes.readInt32BE(offset)/1048576;}
const color=s=>{const names={black:[0,0,0],red:[1,0,0],blue:[0,0,1],'#000':[0,0,0],'#000000':[0,0,0],'#f00':[1,0,0],'#00f':[0,0,1]};assert.ok(Object.hasOwn(names,s),'Unsupported fixed original paint: '+s);return names[s];};
function nativeSegments(p){const result=[];for(let i=0;i<p.segments.length;i++){const t=p.segments[i],q=t.point,b=q?{x:q.xSp,y:q.ySp}:null;
  if(t.kind==='rectcorner'){assert.equal(p.segments[i+1]?.kind,'rectsize');const s=p.segments[++i].point;result.push({kind:'rect',point:b,size:{x:s.xSp,y:s.ySp}});}
  else if(t.kind==='control1'){assert.equal(p.segments[i+1]?.kind,'control2');assert.equal(p.segments[i+2]?.kind,'curve');const b2=p.segments[++i].point,e=p.segments[++i].point;result.push({kind:'cubic',a:b,b:{x:b2.xSp,y:b2.ySp},point:{x:e.xSp,y:e.ySp}});}
  else{assert.ok(['move','line','close'].includes(t.kind));result.push(t.kind==='close'?{kind:'close'}:{kind:t.kind,point:b});}}
  return result;
}

export function verifyLabelledPdf(parsed,metrics,glyphs,original,tfms){
  const checks=[],scalar=(id,quantity,expected,observed,limit=0,extra={})=>{assert.ok(Number.isFinite(expected)&&Number.isFinite(observed)&&Number.isFinite(limit)&&limit>=0);const delta=Math.abs(observed-expected);checks.push({id,quantity,expected,observed,limit,delta,passed:delta<=limit,...extra});};
  assert.deepEqual(parsed.operations,original.operations);assert.equal(parsed.paths.length,metrics.paths.length);assert.equal(parsed.glyphs.length,original.uses.length);
  const page=metrics.pdfCamera.page,physical={width:page.widthSp*bpPerSp,height:page.heightSp*bpPerSp};scalar('page','width',physical.width,parsed.mediaBox[2],.000500000001);scalar('page','height',physical.height,parsed.mediaBox[3],.000500000001);
  scalar('page','origin.x',metrics.pdfCamera.origin.x*.75,parsed.origin.x,.000500000001);scalar('page','origin.y',physical.height-metrics.pdfCamera.origin.y*.75,parsed.origin.y,.000500000001);
  for(let i=0;i<parsed.paths.length;i++){const p=parsed.paths[i],native=metrics.paths[i],expected=nativeSegments(native),paint=original.paths[i].paint,id='path-'+i;
    assert.equal(p.segments.length,expected.length);for(let j=0;j<expected.length;j++){const e=expected[j],a=p.segments[j];assert.equal(a.kind,e.kind);for(const k of['point','size','a','b'])if(e[k])for(const axis of['x','y'])scalar(id,'segment.'+j+'.'+k+'.'+axis,pgfPdfPoint(e[k][axis]),a[k][axis],.000007629396,{sourceSp:e[k][axis],unit:'finite PGF bp'});}
    for(let j=0;j<6;j++)scalar(id,'matrix.'+j,j<4?identity[j]:j===4?parsed.origin.x:parsed.origin.y,p.state.matrix[j],1e-10);
    scalar(id,'width',pgfPdfPoint(native.lineWidthSp),p.state.width,.000007629396);scalar(id,'cap',0,p.state.cap);scalar(id,'join',0,p.state.join);scalar(id,'miter',10,p.state.miter);assert.deepEqual(p.state.stroke,color(paint.stroke));assert.equal(paint.fill,'none');assert.equal(paint['stroke-opacity'],'1');
    const dash=paint['stroke-dasharray']==='none'?[]:paint['stroke-dasharray'].split(/[ ,]+/).map(n=>Math.round(Number(n)*65536));assert.equal(p.state.dash.length,dash.length);dash.forEach((n,j)=>scalar(id,'dash.'+j,pgfPdfPoint(n),p.state.dash[j],.000007629396));scalar(id,'phase',pgfPdfPoint(Math.round(Number(paint['stroke-dashoffset'])*65536)),p.state.phase,.000007629396);
  }
  let index=0;const widthChecks=new Set();
  for(let i=0;i<4;i++){const f=metrics.nodes[i].frame;for(const g of glyphs.nodes[i].glyphs){const a=parsed.glyphs[index],id='glyph-'+index;assert.equal(a.font,g.font);assert.equal(a.slot,g.slot);assert.deepEqual(a.color,color(original.uses[index].paint.fill));const font=parsed.fonts[a.resource];
    const fraction=tfmWidth(tfms.get(font.tfm),a.slot),grid=labelledPdfFontGrid(font.sizePt,fraction),glyphName=({30:'ffi',46:'period'})[a.slot]??String.fromCharCode(a.slot);assert.equal(font.encoding[a.slot],glyphName);
    scalar(id,'font-size',grid.printedSizeBp,a.size);for(let k=0;k<4;k++)scalar(id,'matrix.'+k,[f.a,f.b,f.c,f.d][k],a.matrix[k],1e-10);
    const x=metrics.pdfCamera.origin.x*.75+(f.eSp+f.a*g.xSp-f.c*g.ySp)*bpPerSp,y=physical.height-metrics.pdfCamera.origin.y*.75+(f.fSp+f.b*g.xSp-f.d*g.ySp)*bpPerSp;
    scalar(id,'baseline.x',x,a.matrix[4],a.error.x+1e-10,{budget:'Printed CM/Td translations at half 0.001 bp; PDF width at half 0.1/1000 em; TJ at half 1/1000 em; Tf at half 0.0001 bp and its retained denominator grid; native one-sp advances.'});scalar(id,'baseline.y',y,a.matrix[5],a.error.y+1e-10);
    const key=a.font+'/'+a.slot;if(!widthChecks.has(key)){widthChecks.add(key);scalar(id,'font-width',grid.printedWidth,font.widths[a.slot],0,{unit:'1000/em',tfm:font.tfm,nativeFraction:fraction,grid});}index++;}}
  return{passed:checks.every(c=>c.passed),checks,paths:parsed.paths.length,glyphs:index,operations:parsed.operations.length,converterInvoked:false};
}

export async function reconstructLabelledPdf(renderer,reference,parsed,original,ink,origin){
  const paths=parsed.paths.map((p,i)=>{const data=p.segments.map(s=>s.kind==='rect'?'M'+s.point.x+' '+s.point.y+'h'+s.size.x+'v'+s.size.y+'h'+(-s.size.x)+'Z':s.kind==='close'?'Z':({move:'M',line:'L',cubic:'C'})[s.kind]+(s.kind==='cubic'?[s.a,s.b,s.point]:[s.point]).map(q=>q.x+' '+q.y).join(' ')).join(' '),m=p.state.matrix,a=[m[0]*4/3,-m[1]*4/3,m[2]*4/3,-m[3]*4/3,m[4]*4/3-origin.x,(parsed.mediaBox[3]-m[5])*4/3-origin.y];
    const s=p.state;return{id:'pdf-path-'+i,data,matrix:a,width:s.width,dash:s.dash,phase:s.phase,cap:['butt','round','square'][s.cap],join:['miter','round','bevel'][s.join],miter:s.miter,color:'rgb('+s.stroke.map(c=>c*255).join(',')+')'};});
  const uses=parsed.glyphs.map((g,i)=>{const f=parsed.fonts[g.resource],ratio=g.size/(f.sizePt*72/72.27),m=g.matrix;return{id:'pdf-glyph-'+i,href:original.uses[i].href,matrix:[m[0]*ratio*4/3,-m[1]*ratio*4/3,-m[2]*ratio*4/3,m[3]*ratio*4/3,m[4]*4/3-origin.x,(parsed.mediaBox[3]-m[5])*4/3-origin.y],color:'rgb('+g.color.map(c=>c*255).join(',')+')'};});
  return renderer.page.evaluate(({reference,paths,uses,order,box})=>{const d=new DOMParser().parseFromString(reference,'image/svg+xml');if(d.querySelector('parsererror')||d.doctype)throw Error('Invalid original outlines.');const s=d.documentElement,defs=d.querySelector('defs');if(!defs)throw Error('Missing original definitions.');s.replaceChildren(defs);const ns='http://www.w3.org/2000/svg';
    s.setAttribute('width',(box.maxX-box.minX)+'px');s.setAttribute('height',(box.maxY-box.minY)+'px');s.setAttribute('viewBox',[box.minX,box.minY,box.maxX-box.minX,box.maxY-box.minY].join(' '));
    for(const op of order){const p=op.kind==='path'?paths[op.index]:uses[op.index],e=d.createElementNS(ns,op.kind==='path'?'path':'use');e.id=p.id;e.setAttribute('transform','matrix('+p.matrix.join(' ')+')');
      if(op.kind==='path'){e.setAttribute('d',p.data);e.setAttribute('fill','none');e.setAttribute('stroke',p.color);e.setAttribute('stroke-width',p.width);e.setAttribute('stroke-linecap',p.cap);e.setAttribute('stroke-linejoin',p.join);e.setAttribute('stroke-miterlimit',p.miter);if(p.dash.length){e.setAttribute('stroke-dasharray',p.dash.join(' '));e.setAttribute('stroke-dashoffset',p.phase);}}
      else{e.setAttribute('href',p.href);e.setAttribute('fill',p.color);}s.append(e);}
    return new XMLSerializer().serializeToString(s);
  },{reference,paths,uses,order:parsed.operations,box:ink.root});
}
