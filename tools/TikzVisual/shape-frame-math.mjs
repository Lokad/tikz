// Independent calibration math. No converter geometry, font data or bounds
// helper is used. Only the retained SVG path/transform subset is accepted.
import assert from 'node:assert/strict';

const numberPattern = /[-+]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:[eE][-+]?\d+)?/g;
export const identity = [1,0,0,1,0,0];
export function multiply(a,b) {
  return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],
    a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
}
export function transformPoint(m,p) { return {x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]}; }
export function parseTransform(text) {
  let matrix=identity.slice(),position=0;
  for(const match of text.matchAll(/(matrix|translate|scale)\s*\(([^)]*)\)/g)){
    assert.match(text.slice(position,match.index),/^[\s,]*$/,'Unsupported SVG transform.');
    const args=match[2].match(numberPattern)?.map(Number)??[];
    assert.match(match[2].replace(numberPattern,''),/^[\s,]*$/,'Invalid transform number.');
    assert.ok(args.every(Number.isFinite),'Nonfinite transform.');
    let next;
    if(match[1]==='matrix'){assert.equal(args.length,6);next=args;}
    else if(match[1]==='translate'){assert.ok(args.length===1||args.length===2);next=[1,0,0,1,args[0],args[1]??0];}
    else{assert.ok(args.length===1||args.length===2);next=[args[0],0,0,args[1]??args[0],0,0];}
    matrix=multiply(matrix,next);position=match.index+match[0].length;
  }
  assert.match(text.slice(position),/^[\s,]*$/,'Unsupported SVG transform.');return matrix;
}
export function parsePath(data) {
  assert.ok(data.length>0&&data.length<=200000,'Unexpected outline length.');
  const pattern=/[A-Za-z]|[-+]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:[eE][-+]?\d+)?/g;
  assert.match(data.replace(pattern,''),/^[\s,]*$/,'Invalid SVG path token.');
  const tokens=data.match(pattern)??[],segments=[];
  let index=0,command=null,current={x:0,y:0},first=null,previous=null;
  assert.ok(tokens.length<=100000,'Outline token bound exceeded.');
  const isCommand=t=>/^[A-Za-z]$/.test(t);
  function number(){assert.ok(index<tokens.length&&!isCommand(tokens[index]),'Missing path operand.');const n=Number(tokens[index++]);assert.ok(Number.isFinite(n),'Nonfinite path operand.');return n;}
  function point(relative){const x=number(),y=number();return{x:x+(relative?current.x:0),y:y+(relative?current.y:0)};}
  function reflect(p){return{x:2*current.x-p.x,y:2*current.y-p.y};}
  while(index<tokens.length){
    if(isCommand(tokens[index]))command=tokens[index++];
    assert.ok(command&&'MmLlHhVvCcSsQqTtZz'.includes(command),'Unsupported outline command.');
    const relative=command===command.toLowerCase(),upper=command.toUpperCase();
    assert.ok(first||upper==='M','Path must start with a move.');
    let segment;
    if(upper==='M'){const to=point(relative);segment={kind:'move',from:current,to};first=to;command=relative?'l':'L';}
    else if(upper==='Z'){assert.ok(first,'Close without a subpath.');segment={kind:'close',from:current,to:first};command=null;}
    else if(upper==='L'){segment={kind:'line',from:current,to:point(relative)};}
    else if(upper==='H'){const x=number();segment={kind:'line',from:current,to:{x:x+(relative?current.x:0),y:current.y}};}
    else if(upper==='V'){const y=number();segment={kind:'line',from:current,to:{x:current.x,y:y+(relative?current.y:0)}};}
    else if(upper==='C'){const c1=point(relative),c2=point(relative),to=point(relative);segment={kind:'cubic',from:current,c1,c2,to};}
    else if(upper==='S'){const c1=previous?.kind==='cubic'?reflect(previous.c2):current,c2=point(relative),to=point(relative);segment={kind:'cubic',from:current,c1,c2,to};}
    else if(upper==='Q'){const control=point(relative),to=point(relative);segment={kind:'quadratic',from:current,control,to};}
    else{const control=previous?.kind==='quadratic'?reflect(previous.control):current;segment={kind:'quadratic',from:current,control,to:point(relative)};}
    segments.push(segment);current=segment.to;previous=segment;
  }
  assert.ok(segments.length>0,'Empty path.');return segments;
}
export function transformSegments(segments,matrix) {
  assert.equal(matrix.length,6);assert.ok(matrix.every(Number.isFinite));
  return segments.map(s=>({...s,...Object.fromEntries(['from','to','c1','c2','control'].filter(k=>s[k]).map(k=>[k,transformPoint(matrix,s[k])]))}));
}
export function pathData(segments) {
  const p=point=>`${point.x} ${point.y}`;
  return segments.map(s=>s.kind==='move'?`M${p(s.to)}`:s.kind==='line'?`L${p(s.to)}`:s.kind==='close'?'Z'
    :s.kind==='quadratic'?`Q${p(s.control)} ${p(s.to)}`:`C${p(s.c1)} ${p(s.c2)} ${p(s.to)}`).join(' ');
}
export function unionBounds(bounds) {
  assert.ok(bounds.length>0);assert.ok(bounds.every(b=>['minX','minY','maxX','maxY'].every(k=>Number.isFinite(b[k]))&&b.minX<=b.maxX&&b.minY<=b.maxY));
  return{minX:Math.min(...bounds.map(b=>b.minX)),minY:Math.min(...bounds.map(b=>b.minY)),maxX:Math.max(...bounds.map(b=>b.maxX)),maxY:Math.max(...bounds.map(b=>b.maxY))};
}
// Solve the derivative polynomial with the cancellation-resistant quadratic
// root formula. Keep only interior extrema, then evaluate via de Casteljau.
function roots(a,b,c){
  if(a===0)return b===0?[]:[-c/b];
  const discriminant=b*b-4*a*c;if(discriminant<0)return[];
  const q=-.5*(b+(b>=0?1:-1)*Math.sqrt(discriminant));
  return q===0?[-b/(2*a)]:[q/a,c/q];
}
function bezier(values,t){const work=values.slice();for(let n=work.length-1;n>0;n--)for(let i=0;i<n;i++)work[i]=work[i]*(1-t)+work[i+1]*t;return work[0];}
export function pathBounds(segments) {
  const points=[];
  for(const s of segments){
    if(s.kind==='move')continue;
    points.push(s.from,s.to);
    if(s.kind==='cubic'||s.kind==='quadratic')for(const axis of ['x','y']){
      const v=s.kind==='cubic'?[s.from[axis],s.c1[axis],s.c2[axis],s.to[axis]]:[s.from[axis],s.control[axis],s.to[axis]];
      const ts=v.length===4?roots(3*(-v[0]+3*v[1]-3*v[2]+v[3]),6*(v[0]-2*v[1]+v[2]),3*(v[1]-v[0]))
        :roots(0,2*(v[0]-2*v[1]+v[2]),2*(v[1]-v[0]));
      for(const t of ts)if(t>0&&t<1){const other=axis==='x'?'y':'x';const w=s.kind==='cubic'?[s.from[other],s.c1[other],s.c2[other],s.to[other]]:[s.from[other],s.control[other],s.to[other]];
        points.push({[axis]:bezier(v,t),[other]:bezier(w,t)});}
    }
  }
  assert.ok(points.length>0,'Path has no drawing segments.');return unionBounds(points.map(p=>({minX:p.x,minY:p.y,maxX:p.x,maxY:p.y})));
}
export function closedCurveStrokeBounds(segments,width,miterLimit) {
  assert.ok(Number.isFinite(width)&&width>0&&Number.isFinite(miterLimit)&&miterLimit>=1,'Invalid native stroke.');
  // The trusted background family is four regular cubics, closed at its
  // starting point, with one final nonpainting move. No line caps or corners
  // from a different path family may inherit this calculation.
  assert.equal(segments.length,7);assert.equal(segments[0].kind,'move');assert.equal(segments[5].kind,'close');assert.equal(segments[6].kind,'move');
  const curves=segments.slice(1,5);assert.ok(curves.every(s=>s.kind==='cubic'));
  assert.equal(curves[3].to.x,curves[0].from.x);assert.equal(curves[3].to.y,curves[0].from.y);
  const radius=width/2,geometry=pathBounds(segments),bounds=[{minX:geometry.minX-radius,minY:geometry.minY-radius,maxX:geometry.maxX+radius,maxY:geometry.maxY+radius}],joins=[];
  for(let i=0;i<4;i++){
    const previous=curves[i],next=curves[(i+1)%4],p=previous.to;
    assert.equal(p.x,next.from.x);assert.equal(p.y,next.from.y);
    const incoming={x:p.x-previous.c2.x,y:p.y-previous.c2.y},outgoing={x:next.c1.x-p.x,y:next.c1.y-p.y};
    const uLength=Math.hypot(incoming.x,incoming.y),vLength=Math.hypot(outgoing.x,outgoing.y);
    assert.ok(uLength>0&&vLength>0,'Degenerate quarter-curve tangent.');
    const u={x:incoming.x/uLength,y:incoming.y/uLength},v={x:outgoing.x/vLength,y:outgoing.y/vLength},dot=u.x*v.x+u.y*v.y;
    assert.ok(dot>1-1e-8,'This calibration requires the independently measured smooth quarter-curve family.');
    // Intersect offset tangent lines, instead of using the converter's
    // normal-bisector helper. Check both offsets; finite joins can extend the
    // circular-pen envelope by a very small independently measured amount.
    const det=u.x*v.y-u.y*v.x;let extensions=[];
    if(Math.abs(det)>1e-14)for(const sign of [-1,1]){
      const first={x:p.x-sign*u.y*radius,y:p.y+sign*u.x*radius},second={x:p.x-sign*v.y*radius,y:p.y+sign*v.x*radius};
      const parameter=((second.x-first.x)*v.y-(second.y-first.y)*v.x)/det;
      const tip={x:first.x+parameter*u.x,y:first.y+parameter*u.y},distance=Math.hypot(tip.x-p.x,tip.y-p.y);
      if(distance<=radius*miterLimit){bounds.push({minX:tip.x,minY:tip.y,maxX:tip.x,maxY:tip.y});extensions.push(tip);}
    }
    joins.push({point:p,tangentDot:dot,extensions});
  }
  return{geometry,stroke:unionBounds(bounds),radius,joins,
    contract:'Closed regular four-quarter cubics with independently checked smooth joins, a uniform circular pen and explicit finite miter intersections.'};
}
export function containment(ink,frame,allowance=0) {
  assert.ok(Number.isFinite(allowance)&&allowance>=0);
  unionBounds([ink,frame]); // Validate every coordinate and the box ordering.
  const margins={left:ink.minX-frame.minX,top:ink.minY-frame.minY,right:frame.maxX-ink.maxX,bottom:frame.maxY-ink.maxY};
  return{margins,minimumMargin:Math.min(...Object.values(margins)),allowance,passed:Object.values(margins).every(v=>v>=-allowance)};
}
