// Framing and inspection coverage for the three frozen math fixtures only.
// Native SVG paths/paint and DVI marks remain separate evidence sources.
import assert from 'node:assert/strict';
import {parsePath,pathData,pathBounds,transformSegments,unionBounds,containment} from './shape-frame-math.mjs';
import {edgeStrokeEnvelope} from './edge-oracle-frame.mjs';
import {sha256} from './shape-oracle-bundle.mjs';
import {bindMathNativePaths} from './math-label-native-paths.mjs';
import {diagramNativeNaturalRoot} from './diagram-native-root.mjs';

export const mathFramingCases=[
 {id:'network-math-labels',folder:'Diagrams',nodes:10,glyphs:44,rules:2,paths:17},
 {id:'math-label-contract',folder:'MathLabels',nodes:26,glyphs:109,rules:15,paths:26},
 {id:'math-atom-contract',folder:'MathLabels',nodes:28,glyphs:306,rules:20,paths:28}
];
const spToCss=96/(72.27*65536);
const capIds={butt:0,round:1,square:2},joinIds={miter:0,round:1,bevel:2};
const inflate=(b,r)=>({minX:b.minX-r,minY:b.minY-r,maxX:b.maxX+r,maxY:b.maxY+r});
const rectangle=(b,camera,padding=2)=>{
 const x=Math.floor(b.minX-camera.x-padding),y=Math.floor(b.minY-camera.y-padding);
 const result={x,y,width:Math.ceil(b.maxX-camera.x+padding)-x,height:Math.ceil(b.maxY-camera.y+padding)-y};
 assert.ok(x>=0&&y>=0&&result.width>0&&result.height>0&&x+result.width<=camera.width&&y+result.height<=camera.height);
 return result;
};

export async function deriveMathFraming(renderer,{caseId,reference,events,measurements,supplement,native,pathSupplement=null}) {
 const declared=mathFramingCases.find(c=>c.id===caseId);assert.ok(declared,'Unexpected math framing fixture.');
 assert.equal(supplement.schemaVersion,1);assert.equal(supplement.role,'native-math-framing-supplement');
 for(const key of['drawingNoninterference','frozenDrawingUnchanged','frozenLayoutAndFontsUnchanged'])assert.equal(supplement.observation[key],true);
 assert.equal(supplement.sourceSha256,measurements.sourceSha256);
 assert.equal(supplement.originalSvgSha256,sha256(Buffer.from(reference)),'Changed frozen math path/paint input.');
 assert.ok(Array.isArray(supplement.lineWidthsSp)&&supplement.lineWidthsSp.length>0);
 assert.ok(supplement.lineWidthsSp.every(w=>Number.isSafeInteger(w)&&w>0));
 assert.equal(new Set(supplement.lineWidthsSp).size,supplement.lineWidthsSp.length);
 assert.deepEqual(supplement.pictureBox,measurements.pictureBox);
 const b=supplement.pictureBounds;
 assert.deepEqual(Object.keys(b).sort(),['maxXSp','maxYSp','minXSp','minYSp']);
 assert.ok(Object.values(b).every(v=>Number.isSafeInteger(v)&&Math.abs(v)<=1073741823));
 const picture={minX:b.minXSp*spToCss,minY:-b.maxYSp*spToCss,maxX:b.maxXSp*spToCss,maxY:-b.minYSp*spToCss};
 unionBounds([picture]);
 const [x,y,w,h]=native.root,driverRoot={minX:x,minY:y,maxX:x+w,maxY:y+h};
 const operations=native.geometry.operations,records=[],browserInputs=[],paintRecords=[];
 const nativePaths=pathSupplement?bindMathNativePaths(pathSupplement,operations.flatMap((op,ordinal)=>op.kind==='path'?[{...op,ordinal}]:[]),supplement):null;
 const integerPaths=new Map(nativePaths?.records.map(r=>[r.id,r])??[]);
 const markCounts={nodes:events.nodes.length,glyphs:0,rules:0,paths:0};
 for(const [ordinal,op] of operations.entries()) {
  let geometry,ink,segments,matrix,d;
  if(op.kind==='path'){
   markCounts.paths++;d=op.d;matrix=op.matrix;segments=transformSegments(parsePath(d),matrix);
   geometry=pathBounds(segments);const p=op.paint;
   assert.equal(p['stroke-dasharray'],'none');assert.equal(Number(p['stroke-dashoffset']),0);
   assert.ok([0,1].includes(Number(p['fill-opacity']))&&[0,1].includes(Number(p['stroke-opacity'])));
   assert.ok(['nonzero','evenodd'].includes(p['fill-rule']));
   const painted=[];let stroke=null,widthSp=null;
   if(p.fill!=='none'&&Number(p['fill-opacity'])===1)painted.push(geometry);
   if(p.stroke!=='none'&&Number(p['stroke-opacity'])===1){
    const width=Number(p['stroke-width']);
    widthSp=Math.round(width*65536);
    assert.ok(supplement.lineWidthsSp.includes(widthSp),'Native path pen has no linewidth observation.');
    // A driver decimal such as 0.4pt rounds to an integer TeX dimension.
    assert.ok(Math.abs(width-widthSp/65536)<=.5/65536,'Native linewidth serialization differs.');
    // Fixed fixtures use similarities for path pens (including rotated tips).
    const scale=Math.hypot(matrix[0],matrix[1]),other=Math.hypot(matrix[2],matrix[3]);
    assert.ok(Math.abs(scale-other)<1e-10&&Math.abs(matrix[0]*matrix[2]+matrix[1]*matrix[3])<1e-10);
    stroke=edgeStrokeEnvelope(segments,width*scale,capIds[p['stroke-linecap']],joinIds[p['stroke-linejoin']],Number(p['stroke-miterlimit']));
    if(stroke.stroke)painted.push(stroke.stroke);
   }
   assert.ok(painted.length>0,'Unexpected invisible native path.');
   ink=unionBounds(painted);
   paintRecords.push({ordinal,id:op.id,d,transforms:op.transforms,paint:p,widthSp,geometry,stroke});
   if(nativePaths){
    const measured=integerPaths.get(op.id);assert.ok(measured);
    segments=measured.segments;geometry=measured.geometry;ink=measured.ink;
    d=pathData(segments);matrix=[1,0,0,1,0,0];
   }
  }else{
   assert.ok(['use','rect'].includes(op.kind));const mark=op.mark;
   assert.equal(mark.kind,op.kind==='use'?'glyph':'rule');
   markCounts[mark.kind==='glyph'?'glyphs':'rules']++;
   assert.equal(op.paint.stroke,'none');assert.equal(op.paint.fill,'#000');
   assert.equal(Number(op.paint['fill-opacity']),1);
   matrix=op.integerMatrix;
   d=mark.kind==='glyph'?op.atlas.d:'M0 0H'+op.rule.width+'V'+op.rule.height+'H0Z';
   segments=transformSegments(parsePath(d),matrix);geometry=pathBounds(segments);ink=geometry;
  }
  const kind=op.kind==='path'?'path':op.mark.kind;
  records.push({ordinal,id:op.id,kind,...(op.mark?{nodeId:op.mark.node,index:op.mark.index,font:op.mark.font,slot:op.mark.slot}:{}),geometry,ink,d,matrix});
  browserInputs.push({id:op.id,d:pathData(segments),expected:geometry});
 }
 assert.deepEqual(markCounts,Object.fromEntries(['nodes','glyphs','rules','paths'].map(k=>[k,declared[k]])),'Native framing paint coverage differs.');
 assert.equal(new Set(records.map(r=>r.id)).size,records.length);
 const ink=unionBounds(records.map(r=>r.ink)),root=unionBounds([picture,ink]);
 const nativeRoot=nativePaths?diagramNativeNaturalRoot(nativePaths.metrics,picture,records.filter(r=>r.kind!=='path').map(r=>({id:r.id,nodeId:r.nodeId,bound:r.ink}))):null;
 if(nativeRoot){assert.deepEqual(nativeRoot.ink,ink);assert.deepEqual(nativeRoot.root,root);}
 const labels=events.nodes.map(node=>{
  const marks=records.filter(r=>r.nodeId===node.id);
  assert.deepEqual(marks.filter(r=>r.kind==='glyph').map(r=>r.index),node.glyphs.map((_,i)=>i),'Missing or reordered native label glyph.');
  assert.deepEqual(marks.filter(r=>r.kind==='rule').map(r=>r.index),node.rules.map((_,i)=>i),'Missing or reordered native label rule.');
  const anchors=measurements.anchors.filter(a=>a.name===node.id);
  assert.equal(anchors.length,16);assert.equal(new Set(anchors.map(a=>a.anchor)).size,16);
  const bound=marks.length?unionBounds(marks.map(m=>m.ink)):unionBounds(anchors.map(a=>({minX:a.xSp*spToCss,minY:-a.ySp*spToCss,maxX:a.xSp*spToCss,maxY:-a.ySp*spToCss})));
  return{id:'label-'+node.id,kind:'label',nodeId:node.id,empty:marks.length===0,marks:marks.map(m=>m.id),bound};
 });
 assert.equal(new Set(labels.map(l=>l.nodeId)).size,declared.nodes);
 const contributions=[...labels,...records.map(r=>({id:r.id,kind:r.kind,nodeId:r.nodeId??null,index:r.index??null,bound:r.ink}))];
 const all=unionBounds([picture,driverRoot,root,...contributions.map(c=>inflate(c.bound,2))]);
 const cx=Math.floor(all.minX)-8,cy=Math.floor(all.minY)-8;
 const camera={x:cx,y:cy,width:Math.ceil(all.maxX)-cx+8,height:Math.ceil(all.maxY)-cy+8};
 assert.ok(camera.width*camera.height*16<=20000000);
 const regions=contributions.map(c=>({...c,rectangle:rectangle(c.bound,camera)}));
 const containmentChecks=records.map(r=>({id:r.id,...containment(r.ink,root,1e-10)}));
 assert.ok(containmentChecks.every(c=>c.passed));
 const browserChecks=await renderer.page.evaluate(inputs=>{
  const ns='http://www.w3.org/2000/svg',s=document.createElementNS(ns,'svg');document.body.append(s);
  try{return inputs.map(i=>{const p=document.createElementNS(ns,'path');p.setAttribute('d',i.d);s.append(p);
   const b=p.getBBox(),actual={minX:b.x,minY:b.y,maxX:b.x+b.width,maxY:b.y+b.height};
   // Browser path storage and getBBox use binary32. Bound four coordinate
   // ulps from the independently derived magnitude; this is no raster policy.
   const magnitude=Math.max(1,...Object.values(i.expected).map(Math.abs)),limit=4*2**(Math.floor(Math.log2(magnitude))-23);
   return{id:i.id,expected:i.expected,actual,limit,passed:Object.keys(actual).every(k=>Math.abs(actual[k]-i.expected[k])<=limit)};});
  }finally{s.remove();}
 },browserInputs);
 assert.ok(browserChecks.every(c=>c.passed),'Math analytic geometry disagrees with browser boxes.');
 const pathPaintSha256=sha256(Buffer.from(JSON.stringify(paintRecords.map(({geometry,stroke,...r})=>r))));
 assert.equal(supplement.pathPaintSha256,pathPaintSha256,'Native path/pen paint order differs.');
 return{caseId,origin:native.origin,picture,driverRoot,ink,root,camera,labels,regions,records,paintRecords,pathPaintSha256,
  ...(nativePaths?{nativePaths,nativeRoot}:{}),
  containmentChecks,browserChecks,counts:{...markCounts,regions:regions.length},converterInvoked:false,
  approvedImagePolicy:false,imageConformanceClaim:false,
  contract:nativePaths?'Exact PGF picture and shipped integer path/pen geometry; original SVG paint binding; native selected-size outlines at integer DVI positions. No converter input.':'Exact PGF picture bounds; original serialized driver path/pen geometry; native selected-size outlines at integer DVI positions. Label unions and every individual mark are fixed independently of candidate data.',
  browserBoxLimitPixels:Math.max(...browserChecks.map(c=>c.limit)),browserBoxContract:'Four binary32 coordinate ulps, derived per native geometry magnitude; no candidate or raster policy.'};
}

export async function withMathNaturalRoot(renderer,svg,frame) {
 return renderer.page.evaluate(({svg,root})=>{
  const doc=new DOMParser().parseFromString(svg,'image/svg+xml'),s=doc.documentElement;
  const box=[root.minX,root.minY,root.maxX-root.minX,root.maxY-root.minY].map(v=>Number(v.toFixed(6)));
  s.setAttribute('viewBox',box.join(' '));s.setAttribute('width',box[2]+'px');s.setAttribute('height',box[3]+'px');
  return new XMLSerializer().serializeToString(s);
 },{svg,root:frame.root});
}
