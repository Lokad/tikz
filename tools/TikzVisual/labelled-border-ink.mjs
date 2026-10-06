// Independent bounds from native soft paths, DVI layout and original outlines.
// Uniform circular pen; butt caps and miter joins. Dash gaps may make these
// envelopes conservative. No converter geometry or font resource is used.
import assert from 'node:assert/strict';
import {parsePath,pathData,pathBounds,transformSegments,unionBounds,containment} from './shape-frame-math.mjs';

const spToCss=96/(72.27*65536),pointBox=p=>({minX:p.x,minY:p.y,maxX:p.x,maxY:p.y});
const equal=(a,b)=>a.x===b.x&&a.y===b.y;
const vector=(a,b)=>({x:b.x-a.x,y:b.y-a.y});
function unit(v){const length=Math.hypot(v.x,v.y);return length===0?null:{x:v.x/length,y:v.y/length};}
function tangent(s,end){const origin=end?s.to:s.from;
  const points=s.kind==='cubic'?(end?[s.c2,s.c1,s.from]:[s.c1,s.c2,s.to]):[end?s.from:s.to];
  const p=points.find(p=>!equal(p,origin));if(!p)return null;const d=vector(origin,p);return unit(end?{x:-d.x,y:-d.y}:d);}

export function nativeLabelledSegments(path){
  const parts=[];let corner=null;
  const p=q=>q.xSp*spToCss+' '+(-q.ySp*spToCss);
  for(const t of path.segments){const q=t.point;
    if(t.kind==='rectcorner'){corner=q;parts.push('M'+p(q));}
    else if(t.kind==='rectsize'){assert.ok(corner);parts.push('L'+p({xSp:corner.xSp+q.xSp,ySp:corner.ySp}),'L'+p({xSp:corner.xSp+q.xSp,ySp:corner.ySp+q.ySp}),'L'+p({xSp:corner.xSp,ySp:corner.ySp+q.ySp}),'Z');}
    else if(t.kind==='close')parts.push('Z');
    else{assert.ok(['move','line','control1','control2','curve'].includes(t.kind));parts.push(({move:'M',line:'L',control1:'C',control2:'',curve:''})[t.kind]+p(q));}
  }
  return parsePath(parts.join(' '));
}

export function labelledStrokeEnvelope(segments,width,miterLimit,polygon=false){
  assert.ok(Number.isFinite(width)&&width>0&&Number.isFinite(miterLimit)&&miterLimit>=1);
  const radius=width/2,painted=segments.filter(s=>s.kind!=='move'&&(s.kind==='cubic'||!equal(s.from,s.to)));
  assert.ok(painted.length>0,'This family requires a painted soft path.');
  const geometry=pathBounds(painted),storedGeometry=unionBounds([geometry,...segments.filter(s=>s.kind==='move').map(s=>pointBox(s.to))]);
  const groups=[];let group=null;
  for(const s of segments){if(s.kind==='move'){group={start:s.to,closed:false,edges:[]};groups.push(group);continue;}
    assert.ok(group&&!group.closed,'Drawing after close needs a new subpath in this profile.');
    if(tangent(s,false)&&tangent(s,true))group.edges.push(s);if(s.kind==='close')group.closed=true;}
  if(polygon){assert.equal(groups.filter(g=>g.edges.length).length,1);const g=groups.find(g=>g.edges.length);assert.ok(g.closed&&g.edges.length===4&&g.edges.every(s=>s.kind==='line'||s.kind==='close'));}
  const boxes=[polygon?geometry:{minX:storedGeometry.minX-radius,minY:storedGeometry.minY-radius,maxX:storedGeometry.maxX+radius,maxY:storedGeometry.maxY+radius}],joins=[];
  for(const g of groups){if(g.edges.length===0)continue;const pairs=g.edges.slice(1).map((s,i)=>[g.edges[i],s]);if(g.closed)pairs.push([g.edges.at(-1),g.edges[0]]);
    for(const[left,right]of pairs){const p=left.to;assert.ok(equal(p,right.from));const u=tangent(left,true),v=tangent(right,false),det=u.x*v.y-u.y*v.x,tips=[],offsets=[];
      for(const sign of[-1,1]){const a={x:p.x-sign*u.y*radius,y:p.y+sign*u.x*radius},b={x:p.x-sign*v.y*radius,y:p.y+sign*v.x*radius};
        offsets.push(a,b);boxes.push(pointBox(a),pointBox(b));
        if(Math.abs(det)>1e-14){const delta=vector(a,b),distance=(delta.x*v.y-delta.y*v.x)/det,tip={x:a.x+distance*u.x,y:a.y+distance*u.y},ratio=Math.hypot(tip.x-p.x,tip.y-p.y)/radius;
          if(ratio<=miterLimit){tips.push({point:tip,ratio});boxes.push(pointBox(tip));}}
      }
      joins.push({point:p,incoming:u,outgoing:v,determinant:det,offsets,tips});
    }
  }
  return{geometry,storedGeometry,stroke:unionBounds(boxes),radius,joins,subpaths:groups.map(g=>({closed:g.closed,edges:g.edges.length})),
    contract:polygon?'Closed four-edge rectangle under a uniform circular pen; offset-line miter intersections.':'Conservative circular-pen envelope of analytic soft-path bounds, retained move locations and offset-line miter intersections; butt caps, no joins across moves.'};
}

export async function buildLabelledInk(renderer,reference,metrics,glyphs,original,frame){
  const definitions=await renderer.page.evaluate(source=>{const d=new DOMParser().parseFromString(source,'image/svg+xml');if(d.querySelector('parsererror')||d.doctype)throw Error('Invalid original SVG.');return[...d.querySelectorAll('defs path')].map(e=>({id:e.id,d:e.getAttribute('d')}));},reference);
  const outlines=new Map(definitions.map(p=>[p.id,parsePath(p.d)])),records=[],browserInputs=[];
  for(let i=0;i<metrics.paths.length;i++){const p=metrics.paths[i],segments=nativeLabelledSegments(p),paint=original.paths[i].paint;
    assert.equal(paint['fill'],'none');assert.equal(paint['stroke-linecap'],'butt');assert.equal(paint['stroke-linejoin'],'miter');
    const polygon=i<metrics.nodes.length&&metrics.nodes[i].shape==='rectangle',envelope=labelledStrokeEnvelope(segments,p.lineWidthSp*spToCss,Number(paint['stroke-miterlimit']),polygon);
    const paintedData=segments.filter(s=>s.kind!=='move'&&(s.kind==='cubic'||!equal(s.from,s.to))).map(s=>'M'+s.from.x+' '+s.from.y+' '+(s.kind==='cubic'?'C'+s.c1.x+' '+s.c1.y+' '+s.c2.x+' '+s.c2.y+' '+s.to.x+' '+s.to.y:'L'+s.to.x+' '+s.to.y)).join(' ');
    records.push({id:'path-'+i,kind:i<4?'background':'connection',nativePathIndex:i,bound:envelope.stroke,envelope});browserInputs.push({id:'path-'+i,d:paintedData,expected:envelope.geometry});
  }
  let index=0;
  for(let i=0;i<4;i++){const f=metrics.nodes[i].frame;
    for(const g of glyphs.nodes[i].glyphs){const outline=outlines.get(original.uses[index].href.slice(1));assert.ok(outline);
      const matrix=[f.a*4/3,-f.b*4/3,-f.c*4/3,f.d*4/3,(f.eSp+f.a*g.xSp-f.c*g.ySp)*spToCss,-(f.fSp+f.b*g.xSp-f.d*g.ySp)*spToCss],segments=transformSegments(outline,matrix),bound=pathBounds(segments);
      records.push({id:'glyph-'+index,kind:'glyph',glyphIndex:index,nodeId:metrics.nodes[i].id,font:g.font,slot:g.slot,bound,matrix});browserInputs.push({id:'glyph-'+index,d:pathData(segments),expected:bound});index++;
    }}
  assert.equal(records.length,metrics.paths.length+frame.glyphs);
  const ink=unionBounds(records.map(r=>r.bound)),root=unionBounds([frame.picture,ink]);
  const containmentChecks=records.map(r=>({id:r.id,...containment(r.bound,root,1e-10)}));assert.ok(containmentChecks.every(c=>c.passed));
  const browserChecks=await renderer.page.evaluate(inputs=>{const ns='http://www.w3.org/2000/svg',s=document.createElementNS(ns,'svg');document.body.append(s);
    try{return inputs.map(i=>{const p=document.createElementNS(ns,'path');p.setAttribute('d',i.d);s.append(p);const b=p.getBBox(),actual={minX:b.x,minY:b.y,maxX:b.x+b.width,maxY:b.y+b.height};
      return{id:i.id,expected:i.expected,actual,errors:Object.fromEntries(Object.keys(actual).map(k=>[k,Math.abs(actual[k]-i.expected[k])])),limit:.00004,passed:Object.keys(actual).every(k=>Math.abs(actual[k]-i.expected[k])<=.00004)};});}finally{s.remove();}},browserInputs);
  assert.ok(browserChecks.every(c=>c.passed),'Native analytic geometry disagrees with independent browser boxes.');
  return JSON.parse(JSON.stringify({caseId:frame.caseId,records,ink,root,containmentChecks,browserChecks,converterInvoked:false,approvedImagePolicy:false}));
}

export async function applyLabelledInkRoot(renderer,svg,ink){
  const r=ink.root,values=[r.minX,r.minY,r.maxX-r.minX,r.maxY-r.minY],text=values.map(v=>(Math.abs(v)<.0000005?0:v).toFixed(6)),rootChecks=values.map((v,i)=>({quantity:['x','y','width','height'][i],expected:v,serialized:Number(text[i]),delta:Math.abs(v-Number(text[i])),limit:.000000500002,passed:Math.abs(v-Number(text[i]))<=.000000500002}));
  assert.ok(rootChecks.every(c=>c.passed));
  const result=await renderer.page.evaluate(({source,text})=>{const d=new DOMParser().parseFromString(source,'image/svg+xml'),s=d.documentElement;if(d.querySelector('parsererror')||d.doctype)throw Error('Invalid native SVG.');
    const before=s.innerHTML;s.setAttribute('width',text[2]+'px');s.setAttribute('height',text[3]+'px');s.setAttribute('viewBox',text.join(' '));if(s.innerHTML!==before)throw Error('Changing the ink root changed drawing instructions.');return new XMLSerializer().serializeToString(s);},{source:svg,text});
  return{svg:result,rootChecks};
}
