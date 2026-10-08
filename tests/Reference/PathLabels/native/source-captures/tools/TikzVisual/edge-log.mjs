// Independent native records; no converter, font resource or image policy.
import assert from 'node:assert/strict';
import {sanitizeLabelledBorderLog} from './labelled-border-log.mjs';
export const edgeSanitize=text=>sanitizeLabelledBorderLog(text)
  .replace(/^(This is pdfTeX,[^\n]*)  \d{1,2} [A-Z]{3} \d{4} \d{2}:\d{2}$/m,'$1 <timestamp>');
export const edgeProfile='pgf-3.1.11a-straight-to-edge-v1';
export const edgeIds=['continuation','styles','coordinates','nodes','clipping'];
export const edgeAnchors=['text','center','north','south','west','east','north west','north east','south west','south east','base','base west','base east','mid','mid west','mid east'];
export const edgeWrapper='tools/TikzLabelledBorderReference/labelled-borders.tex';
export const edgeHooks='tools/TikzEdgeReference/edge-hooks.tex';
export const edgeManifest='tests/Reference/Edges/cases.json';
export const edgeInputFiles=[edgeManifest,edgeWrapper,edgeHooks,'tools/TikzVisual/edge-reference.mjs','tools/TikzVisual/edge-log.mjs',
  'tools/TikzVisual/labelled-border-log.mjs','tools/TikzVisual/shape-oracle-bundle.mjs',
  'tools/TikzVisual/edge-driver-state.mjs','tools/TikzVisual/labelled-border-pdf-vector.mjs','tools/TikzVisual/dash-pdf-vector.mjs',
  'tools/TikzVisual/edge-replay.mjs',
  'tests/Reference/NodeShapes/oracle-profile.json','tests/Reference/NodeShapes/pdf-oracle-profile.json','tools/TikzFontData/font-profile.json'];
export const edgeCanonical=b=>Buffer.from(b.toString('utf8').replaceAll('\r\n','\n'));
export function validateEdgeManifest(m){
  assert.equal(m.schemaVersion,1);assert.equal(m.profile,edgeProfile);assert.equal(m.fontProfile,'latin-modern-ec-10-12-v1');
  assert.equal(m.colorProfile,'xcolor-rgb-v1');
  assert.deepEqual(m.libraries,['shapes.geometric']);assert.deepEqual(m.anchors,edgeAnchors);assert.deepEqual(m.cases.map(c=>c.id),edgeIds);
  for(const c of m.cases){assert.equal(c.source,'tests/Fixtures/Edges/'+c.id+'.tikz');assert.ok(c.features.length>0);
    assert.deepEqual(c.coordinates??[],c.id==='coordinates'?['target']:[]);
    assert.equal(new Set(c.features).size,c.features.length);assert.deepEqual(c.nodes,c.id==='nodes'
      ?[{id:'input',shape:'rectangle'},{id:'output',shape:'rectangle'},{id:'round',shape:'circle'},{id:'wide',shape:'ellipse'}]:[]);}
}
const sp=s=>{const n=Number(s);assert.ok(Number.isSafeInteger(n)&&Math.abs(n)<=1073741823);return n;};
const scalar=s=>{const n=Number(s);assert.ok(Number.isFinite(n));return n;};
const alpha=s=>{const n=scalar(s);assert.ok(n>=0&&n<=1);return n;};
const rgb=s=>{const a=s.split(',').map(alpha);assert.equal(a.length,3);return a;};
function records(log,pattern){const text=log.replace(/\r?\n/g,''),result=[...text.matchAll(new RegExp(pattern,'g'))];
  assert.equal(result.length,text.split(pattern.split(' ')[0]+' ').length-1,'Malformed native record: '+pattern.split(' ')[0]);return result;}
function one(log,pattern){const r=records(log,pattern);assert.equal(r.length,1);return r[0];}
export function edgeBox(log){return one(log,'LOKAD-BOX (-?\\d+)\\|(-?\\d+)\\|(-?\\d+)\\|END').slice(1).map(sp);}
export function edgePdfPage(log){const m=one(log,'LOKAD-PDF-PAGE (\\d+)\\|(\\d+)\\|(\\d+)\\|(\\d+)\\|END');
  return Object.fromEntries(['boxXSp','boxBaselineYSp','widthSp','heightSp'].map((k,i)=>[k,sp(m[i+1])]));}
export function parseEdgeLog(log,c){
  assert.ok(log.includes('LOKAD-PGF-VERSION 3.1.11a'));
  const pathRows=records(log,'LOKAD-PATH (\\d+)\\|([^|]+)\\|([^|]*)\\|(-?\\d+)\\|END');
  assert.ok(pathRows.length>0&&pathRows.length<1000);assert.deepEqual(pathRows.map(r=>sp(r[1])),pathRows.map((_,i)=>i+1));
  const segments=records(log,'LOKAD-SEG (\\d+)\\|([a-z0-9]+)\\|(-?\\d+)\\|(-?\\d+)\\|END');
  assert.ok(segments.every(r=>sp(r[1])>=1&&sp(r[1])<=pathRows.length));
  const paints=records(log,'EDGE-PAINT (\\d+)\\|(stroke|fill|fillstroke)\\|(-?\\d+)\\|(\\d+)\\|(\\d+)\\|([^|]+)\\|([^|]+)\\|([^|]+)\\|([^|]+)\\|([^|]+)\\|END');
  assert.equal(new Set(paints.map(r=>r[1])).size,paints.length);assert.ok(paints.every(r=>sp(r[1])>=1&&sp(r[1])<=pathRows.length));
  const dashes=records(log,'EDGE-DASH (\\d+)\\|([^|]*)\\|(-?\\d+)\\|END');assert.equal(dashes.length,paints.length);
  assert.equal(new Set(dashes.map(r=>r[1])).size,dashes.length);
  const paths=pathRows.map(r=>{
    const index=sp(r[1]),modes=r[3].split(',').filter(Boolean);assert.ok(modes.every(m=>['draw','fill','clip'].includes(m)));
    const found=paints.find(p=>sp(p[1])===index),d=dashes.find(p=>sp(p[1])===index);
    assert.equal(Boolean(found),modes.includes('draw')||modes.includes('fill'));
    let paint=null;
    if(found){const cap=sp(found[4]),join=sp(found[5]),miter=scalar(found[6]);assert.ok(cap<=2&&join<=2&&miter>=1);
      assert.ok(d&&(/^(?:\d+(?:\.\d+)?pt(?:,\d+(?:\.\d+)?pt)*)?$/.test(d[2])));
      const pattern=d[2]===''?[]:d[2].split(',').map(s=>Math.round(scalar(s.slice(0,-2))*65536));
      assert.ok(pattern.length<=64&&pattern.every(n=>Number.isSafeInteger(n)&&n>=0)&&(!pattern.length||pattern.some(n=>n>0)));
      paint={operation:found[2],widthSp:sp(found[3]),cap,join,miter,strokeOpacity:alpha(found[7]),fillOpacity:alpha(found[8]),
        strokeRgb:rgb(found[9]),fillRgb:rgb(found[10]),dashSerialization:d[2],dashSp:pattern,dashPhaseSp:sp(d[3])};
      assert.ok(paint.widthSp>=0);
      assert.equal(paint.operation,modes.includes('draw')?(modes.includes('fill')?'fillstroke':'stroke'):'fill');
    }
    const tokens=segments.filter(s=>sp(s[1])===index).map(s=>({kind:s[2],xSp:sp(s[3]),ySp:sp(s[4])}));
    assert.ok(tokens.length>0&&tokens.length<1000);assert.ok(tokens.every(s=>['move','line','rectcorner','rectsize','control1','control2','curve','close'].includes(s.kind)));
    return {index,owner:r[2],modes,widthSp:sp(r[4]),segments:tokens,paint};
  });
  const shapes=records(log,'LOKAD-SHAPE ([a-z0-9-]+)\\|(rectangle|circle|ellipse|coordinate)\\|END');
  assert.deepEqual(shapes.map(r=>({id:r[1],shape:r[2]})),[...c.nodes,...(c.coordinates??[]).map(id=>({id,shape:'coordinate'}))]);
  const values=records(log,'LOKAD-VALUE ([a-z0-9-]+)\\|([a-z]+)\\|(-?\\d+)\\|END');
  const points=records(log,'LOKAD-POINT ([a-z0-9-]+)\\|([a-z]+)\\|(-?\\d+)\\|(-?\\d+)\\|END');
  const frames=records(log,'LOKAD-FRAME ([a-z0-9-]+)\\|([^|]+)\\|([^|]+)\\|([^|]+)\\|([^|]+)\\|([^|]+)\\|([^|]+)\\|END');
  const anchors=records(log,'LOKAD-ANCHOR ([a-z0-9-]+)\\|([^|]+)\\|(-?\\d+)\\|(-?\\d+)\\|END');
  const nodes=c.nodes.map(n=>{const vs=values.filter(r=>r[1]===n.id),as=anchors.filter(r=>r[1]===n.id),fs=frames.filter(r=>r[1]===n.id);
    assert.deepEqual(vs.map(r=>r[2]),['width','height','depth','linewidth','quad','xheight','innerx','innery','outerx','outery','minimumwidth','minimumheight']);
    assert.deepEqual(as.map(r=>r[2]),edgeAnchors);assert.equal(fs.length,1);
    fs[0].slice(2,6).forEach(scalar);
    for(const dimension of fs[0].slice(6)){assert.match(dimension,/^-?\d+(?:\.\d+)?pt$/);scalar(dimension.slice(0,-2));}
    const ps=points.filter(r=>r[1]===n.id);assert.deepEqual(ps.map(r=>r[2]),n.shape==='rectangle'?['southwest','northeast']:['center','xaxis','yaxis']);
    return {...n,values:Object.fromEntries(vs.map(r=>[r[2],sp(r[3])])),points:Object.fromEntries(ps.map(r=>[r[2],{xSp:sp(r[3]),ySp:sp(r[4])}])),
      frame:fs[0].slice(2),anchors:Object.fromEntries(as.map(r=>[r[2],{xSp:sp(r[3]),ySp:sp(r[4])}]))};});
  const coordinates=(c.coordinates??[]).map(id=>{const vs=values.filter(r=>r[1]===id),as=anchors.filter(r=>r[1]===id);
    assert.deepEqual(vs.map(r=>r[2]),['width','height','depth','linewidth','quad','xheight','innerx','innery','outerx','outery','minimumwidth','minimumheight']);
    assert.deepEqual(as.map(r=>r[2]),['center']);return{id,values:Object.fromEntries(vs.map(r=>[r[2],sp(r[3])])),center:{xSp:sp(as[0][3]),ySp:sp(as[0][4])}};});
  assert.equal(values.length,(nodes.length+coordinates.length)*12);assert.equal(anchors.length,nodes.length*16+coordinates.length);
  assert.equal(frames.length,nodes.length);assert.equal(points.length,nodes.reduce((n,c)=>n+(c.shape==='rectangle'?2:3),0));
  assert.ok(paths.every(p=>p.owner==='drawing'||nodes.some(n=>p.owner==='node-'+n.id)));
  const b=one(log,'LOKAD-BOUNDS (-?\\d+)\\|(-?\\d+)\\|(-?\\d+)\\|(-?\\d+)\\|END').slice(1).map(sp),box=edgeBox(log);
  assert.equal(box[0],b[2]-b[0]);assert.equal(box[1]+box[2],b[3]-b[1]);
  assert.ok(b[2]>=b[0]&&b[3]>=b[1]&&box.every(n=>n>=0));
  return {schemaVersion:1,profile:edgeProfile,caseId:c.id,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
    units:'integer TeX sp and native paint coefficients; y-up; physical origin; no fitted registration',paths,nodes,coordinates,
    pictureBounds:Object.fromEntries(['minXSp','minYSp','maxXSp','maxYSp'].map((k,i)=>[k,b[i]])),
    pictureBox:{widthSp:box[0],heightSp:box[1],depthSp:box[2]}};
}
export function edgePhysicalOrder(metrics,log,trace,pdf=false){
  const markers=pdf?records(log,'EDGE-ORDER (\\d+)\\|END').map(m=>sp(m[1])):[...trace.matchAll(/lokad-edge-path (\d+)/g)].map(m=>sp(m[1]));
  assert.deepEqual([...markers].sort((a,b)=>a-b),metrics.paths.map(p=>p.index));
  const painted=markers.filter(id=>metrics.paths.find(p=>p.index===id).paint!==null);
  assert.equal(painted.length,metrics.paths.filter(p=>p.paint!==null).length);return {allPathCalls:markers,paintedPaths:painted};
}
