// Trusted-fixture PDF diagnostics. Keep embedded resources and printed operands.
import assert from 'node:assert/strict';
import {deflateSync,inflateSync} from 'node:zlib';
import {labelledPdfTokens,parseLabelledPdfContent} from './labelled-border-pdf-vector.mjs';

const normal=v=>JSON.parse(JSON.stringify(v));
const pathOps=new Set(['m','l','c','re','h','S']);
export function labelledPdfDiagnosticKinds(id){
  assert.ok(['lines','paths','transforms'].includes(id));
  return ['original-instructions','paths-only','glyphs-only',...(id==='lines'?['isolated-glyph-1','isolated-glyph-11']:id==='transforms'?['isolated-path-6']:[])];
}
export function labelledPdfSelection(parsed,kind){
  const glyph=/^isolated-glyph-(\d+)$/.exec(kind),paint=/^isolated-path-(\d+)$/.exec(kind);
  assert.ok(['original-instructions','paths-only','glyphs-only'].includes(kind)||glyph||paint);
  const paths=kind==='original-instructions'||kind==='paths-only'?parsed.paths.map((_,i)=>i):paint?[Number(paint[1])]:[];
  const glyphs=kind==='original-instructions'||kind==='glyphs-only'?parsed.glyphs.map((_,i)=>i):glyph?[Number(glyph[1])]:[];
  assert.ok(paths.every(i=>i<parsed.paths.length)&&glyphs.every(i=>i<parsed.glyphs.length));
  return {paths,glyphs};
}
function commands(content){
  const result=[];let args=[];
  for(const t of labelledPdfTokens(content)){if(t?.type==='operator'){result.push({args,op:t.name});args=[];}else args.push(t);}
  assert.equal(args.length,0);return result;
}
function spelling(t){
  if(typeof t==='number')return String(t);
  if(Array.isArray(t))return '['+t.map(spelling).join(' ')+']';
  if(t.type==='name')return '/'+t.name;
  assert.equal(t.type,'string');return '('+t.slots.map(c=>'\\'+c.toString(8).padStart(3,'0')).join('')+')';
}
const print=c=>c.args.map(spelling).concat(c.op).join(' ')+'\n';

export function labelledPdfDiagnosticContent(parsed,kind){
  const selection=labelledPdfSelection(parsed,kind),rows=[];let pathIndex=0,glyphIndex=0,text=false;
  const isolated=kind.startsWith('isolated-glyph-');
  for(const c of commands(parsed.content)){
    if(c.op==='BT')text=true;
    if(pathOps.has(c.op)){if(selection.paths.includes(pathIndex))rows.push(print(c));if(c.op==='S')pathIndex++;continue;}
    if(text&&!selection.glyphs.length){if(c.op==='ET')text=false;continue;}
    if(c.op==='TJ'&&isolated){
      for(const t of c.args[0]){
        if(typeof t==='number')rows.push(print({args:[[t]],op:'TJ'}));
        else for(const slot of t.slots){rows.push((selection.glyphs.includes(glyphIndex++)?'0':'3')+' Tr\n');rows.push(print({args:[[{type:'string',slots:[slot]}]],op:'TJ'}));}
      }
    }else{
      if(c.op==='ET'&&isolated)rows.push('0 Tr\n');rows.push(print(c));
      if(c.op==='TJ')glyphIndex+=c.args[0].filter(t=>typeof t!=='number').reduce((n,t)=>n+t.slots.length,0);
    }
    if(c.op==='ET')text=false;
  }
  assert.equal(pathIndex,parsed.paths.length);assert.equal(text,false);
  const content=rows.join(''),verified=verifyLabelledPdfDiagnosticContent(parsed,content,selection);
  return {kind,content,selection,verified};
}

// Only diagnostic text render modes 0 (paint) and 3 (invisible) are admitted.
// Invisible bytes retain the original text cursor, widths and TJ adjustments.
export function verifyLabelledPdfDiagnosticContent(original,content,selection){
  const visible=[],stripped=[];let mode=0,text=false;
  for(const c of commands(content)){
    if(c.op==='BT'){assert.equal(text,false);text=true;}
    if(c.op==='Tr'){assert.ok(text&&c.args.length===1&&[0,3].includes(c.args[0]));mode=c.args[0];continue;}
    if(c.op==='TJ')for(const t of c.args[0])if(typeof t!=='number')for(const slot of t.slots){assert.ok(slot>=0&&slot<=255);visible.push(mode===0);}
    stripped.push(print(c));if(c.op==='ET'){assert.equal(mode,0);text=false;}
  }
  assert.equal(text,false);const parsed=parseLabelledPdfContent(stripped.join(''),original.fonts);
  assert.deepEqual(parsed.origin,original.origin);
  assert.deepEqual(parsed.paths,selection.paths.map(i=>original.paths[i]));
  // Selected single glyphs are isolated by visibility, never cursor fitting.
  const retained=selection.glyphs.length?original.glyphs:[];assert.deepEqual(parsed.glyphs,retained);
  const visibleIds=visible.flatMap((painted,i)=>painted?[i]:[]);assert.deepEqual(visibleIds,selection.glyphs);
  const pathMap=new Map(selection.paths.map((id,i)=>[i,id])),operations=parsed.operations.flatMap(o=>o.kind==='path'?[{kind:'path',index:pathMap.get(o.index)}]:visible[o.index]?[o]:[]);
  const expected=original.operations.filter(o=>(o.kind==='path'?selection.paths:selection.glyphs).includes(o.index));assert.deepEqual(operations,expected);
  return {passed:true,visiblePaths:selection.paths.length,visibleGlyphs:selection.glyphs.length,retainedGlyphCursors:parsed.glyphs.length,paintingOrder:operations};
}

function pdfObjects(bytes){
  assert.ok(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=1000000);const text=bytes.toString('latin1');assert.ok(text.startsWith('%PDF-1.5'));
  const found=new Map(),headers=/(\d+) 0 obj\s*/g;let cursor=0;
  while(cursor<text.length){headers.lastIndex=cursor;const m=headers.exec(text);if(!m)break;const start=headers.lastIndex,id=Number(m[1]);let end=text.indexOf('endobj',start),stream=text.indexOf('stream\n',start);
    assert.ok(id>0&&id<128&&!found.has(id)&&end>start&&found.size<128);
    if(stream>=0&&stream<end){const dict=text.slice(start,stream),length=Number(/\/Length\s+(\d+)\b/.exec(dict)?.[1]);assert.ok(Number.isSafeInteger(length)&&length>0&&length<=1000000);const bodyEnd=stream+7+length;assert.ok(/^\s*endstream\s*endobj/.test(text.slice(bodyEnd,bodyEnd+40)));end=text.indexOf('endobj',bodyEnd);}
    const body=bytes.subarray(start,end);assert.ok(!body.toString('latin1').startsWith('<< /Type /ObjStm'));found.set(id,body);cursor=end+6;
  }
  const trailer=/trailer\s*(<<[^>]+>>)\s*startxref\s+(\d+)\s*%%EOF\s*$/.exec(text);assert.ok(trailer&&!/\/Prev|\/XRefStm|\/Encrypt/.test(trailer[1]));
  const size=Number(/\/Size\s+(\d+)/.exec(trailer[1])?.[1]);assert.ok(size<=128&&found.size===size-1);for(let i=1;i<size;i++)assert.ok(found.has(i));
  const pages=[...found.entries()].filter(([,b])=>/\/Type\s*\/Page\b/.test(b.toString('latin1')));assert.equal(pages.length,1);const contents=Number(/\/Contents\s+(\d+) 0 R/.exec(pages[0][1].toString('latin1'))?.[1]);assert.ok(found.has(contents));
  return {found,trailer:trailer[1],size,contents};
}
export function writeLabelledPdfDiagnostic(original,content){
  assert.ok(typeof content==='string'&&content.length>0&&content.length<=1000000&&/^[\x09\x0a\x0d\x20-\x7e]*$/.test(content));
  const o=pdfObjects(original),data=deflateSync(Buffer.from(content,'ascii')),replacement=Buffer.concat([Buffer.from('<< /Length '+data.length+' /Filter /FlateDecode >>\nstream\n'),data,Buffer.from('\nendstream\n')]);
  const parts=[Buffer.from('%PDF-1.5\n')],offsets=[0];let length=parts[0].length;
  for(let id=1;id<o.size;id++){offsets.push(length);const b=Buffer.concat([Buffer.from(id+' 0 obj\n'),id===o.contents?replacement:o.found.get(id),Buffer.from('endobj\n')]);parts.push(b);length+=b.length;}
  parts.push(Buffer.from('xref\n0 '+o.size+'\n0000000000 65535 f \n'+offsets.slice(1).map(x=>String(x).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n'+o.trailer+'\nstartxref\n'+length+'\n%%EOF\n'));
  const bytes=Buffer.concat(parts),r=readLabelledPdfDiagnostic(original,bytes);assert.equal(r.content,content);return bytes;
}
export function readLabelledPdfDiagnostic(original,diagnostic){
  const o=pdfObjects(original),d=pdfObjects(diagnostic);assert.equal(d.contents,o.contents);assert.equal(d.size,o.size);assert.equal(d.trailer,o.trailer);
  for(const[id,b]of o.found)if(id!==o.contents)assert.ok(b.equals(d.found.get(id)),'Diagnostic changed original resource/object '+id);
  const b=d.found.get(d.contents),text=b.toString('latin1'),index=text.indexOf('stream\n'),length=Number(/\/Length\s+(\d+)/.exec(text.slice(0,index))?.[1]);assert.ok(index>0&&length>0&&/\/Filter\s*\/FlateDecode/.test(text.slice(0,index)));
  const content=inflateSync(b.subarray(index+7,index+7+length),{maxOutputLength:1000000}).toString('ascii');
  return {content,preservedObjects:o.size-2,contentObject:o.contents};
}
export async function selectLabelledPdfSvg(renderer,source,selection){
  return renderer.page.evaluate(({source,selection})=>{const d=new DOMParser().parseFromString(source,'image/svg+xml');if(d.doctype||d.querySelector('parsererror'))throw Error('Invalid diagnostic SVG.');const s=d.documentElement;
    const paths=[...s.children].filter(e=>/^pdf-path-\d+$/.test(e.id)),glyphs=[...s.children].filter(e=>/^pdf-glyph-\d+$/.test(e.id));
    for(const[elements,ids]of[[paths,selection.paths],[glyphs,selection.glyphs]])elements.forEach((e,i)=>{if(!ids.includes(i))e.remove();});
    if(s.querySelectorAll(':scope > path').length!==selection.paths.length||s.querySelectorAll(':scope > use').length!==selection.glyphs.length)throw Error('Incomplete diagnostic SVG selection.');return new XMLSerializer().serializeToString(s);
  },{source,selection:normal(selection)});
}
