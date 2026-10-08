// Label-specific native observations. Construction calls and shipped paints
// are distinct: an arrow template can paint while its box is being cached.
import assert from 'node:assert/strict';
import {edgeAnchors} from './edge-log.mjs';
import {edgeSvgPaints,edgePdfPaints,verifyEdgeDriverState} from './edge-driver-state.mjs';

function records(log,kind){
  assert.ok(typeof log==='string'&&log.length<=2000000);
  const text=log.replace(/\r?\n/g,''),pattern=new RegExp(kind+' ([^]*?)\\|END','g');
  const rows=[...text.matchAll(pattern)].map(m=>m[1].split('|'));
  assert.equal(rows.length,(text.match(new RegExp(kind+' ','g'))??[]).length,'Incomplete native '+kind);
  assert.ok(rows.length<=20000);return rows;
}
function integer(text){assert.match(text,/^-?\d+$/);const n=Number(text);assert.ok(Number.isSafeInteger(n)&&Math.abs(n)<=1073741823);return n;}
function real(text){const n=Number(text);assert.ok(text.length>0&&Number.isFinite(n)&&Math.abs(n)<=10000);return n;}

export function parsePathLabelNative(log,ids){
  assert.ok(log.includes('LOKAD-PGF-VERSION 3.1.11a'));
  assert.ok(ids.length>0&&ids.length<=128&&new Set(ids).size===ids.length);
  const shapes=records(log,'LOKAD-SHAPE');assert.deepEqual(shapes,ids.map(id=>[id,'rectangle']));
  const values=records(log,'LOKAD-VALUE'),anchors=records(log,'LOKAD-ANCHOR'),frames=records(log,'LOKAD-FRAME'),points=records(log,'LOKAD-POINT');
  const quantities=['width','height','depth','linewidth','quad','xheight','innerx','innery','outerx','outery','minimumwidth','minimumheight'];
  assert.equal(values.length,ids.length*quantities.length);assert.equal(anchors.length,ids.length*edgeAnchors.length);
  assert.equal(frames.length,ids.length);assert.equal(points.length,ids.length*2);
  const nodes=ids.map(id=>{
    const vs=values.filter(r=>r[0]===id),as=anchors.filter(r=>r[0]===id),fs=frames.filter(r=>r[0]===id),ps=points.filter(r=>r[0]===id);
    assert.deepEqual(vs.map(r=>r[1]),quantities);assert.deepEqual(as.map(r=>r[1]),edgeAnchors);
    assert.deepEqual(ps.map(r=>r[1]),['southwest','northeast']);assert.equal(fs.length,1);assert.equal(fs[0].length,7);
    fs[0].slice(1,5).forEach(real);for(const d of fs[0].slice(5)){assert.match(d,/^-?\d+(?:\.\d+)?pt$/);real(d.slice(0,-2));}
    for(const r of vs)assert.equal(r.length,3);for(const r of [...as,...ps])assert.equal(r.length,4);
    return{id,shape:'rectangle',values:Object.fromEntries(vs.map(r=>[r[1],integer(r[2])])),frame:fs[0].slice(1),
      anchors:Object.fromEntries(as.map(r=>[r[1],{xSp:integer(r[2]),ySp:integer(r[3])}])),
      points:Object.fromEntries(ps.map(r=>[r[1],{xSp:integer(r[2]),ySp:integer(r[3])}]))};
  });
  const paths=records(log,'LOKAD-PATH'),segments=records(log,'LOKAD-SEG');
  assert.ok(paths.length>0&&paths.length<=1024);assert.deepEqual(paths.map(r=>integer(r[0])),paths.map((_,i)=>i+1));
  for(const r of segments){assert.equal(r.length,4);assert.ok(integer(r[0])>0&&integer(r[0])<=paths.length);assert.ok(['move','line','rectcorner','rectsize','control1','control2','curve','close'].includes(r[1]));}
  const constructionPaths=paths.map(r=>{
    assert.equal(r.length,4);assert.ok(r[1]==='drawing'||ids.some(id=>r[1]==='node-'+id));
    const modes=r[2].split(',').filter(Boolean);assert.ok(modes.every(m=>['draw','fill','clip'].includes(m)));
    const tokens=segments.filter(s=>s[0]===r[0]).map(s=>({kind:s[1],xSp:integer(s[2]),ySp:integer(s[3])}));assert.ok(tokens.length>0);
    return{index:integer(r[0]),owner:r[1],modes,widthSp:integer(r[3]),segments:tokens};
  });
  const bounds=records(log,'LOKAD-BOUNDS'),box=records(log,'LOKAD-BOX');assert.equal(bounds.length,1);assert.equal(box.length,1);
  assert.equal(bounds[0].length,4);assert.equal(box[0].length,3);const b=bounds[0].map(integer),size=box[0].map(integer);
  // Library declarations before the picture can leave glue in the wrapper
  // hbox. Keep that observed wrapper width separate from picture geometry.
  assert.ok(size[0]>=b[2]-b[0]);assert.equal(size[1]+size[2],b[3]-b[1]);
  // Retain duplicate paint identifiers: they are template construction events,
  // not a one-to-one list of shipped paths.
  const constructionPaintEvents=records(log,'EDGE-PAINT');assert.ok(constructionPaintEvents.every(r=>r.length===10));
  return{schemaVersion:1,profile:'pgf-3.1.11a-path-labels-v1',nodes,constructionPaths,constructionPaintEvents,
    pictureBounds:Object.fromEntries(['minXSp','minYSp','maxXSp','maxYSp'].map((k,i)=>[k,b[i]])),
    pictureBox:{widthSp:size[0],heightSp:size[1],depthSp:size[2]},wrapperExtraWidthSp:size[0]-(b[2]-b[0])};
}

export function pathLabelPhysicalCalls(metrics,trace,pdfLog){
  const svg=[...trace.matchAll(/lokad-edge-path (\d+)/g)].map(m=>integer(m[1]));
  const pdf=records(pdfLog,'EDGE-ORDER').map(r=>{assert.equal(r.length,1);return integer(r[0]);});
  assert.deepEqual(svg,pdf,'SVG/PDF physical path-call order differs.');
  assert.deepEqual([...svg].sort((a,b)=>a-b),metrics.constructionPaths.map(p=>p.index));
  return{allPathCalls:svg};
}

export function pathLabelDriverState(svg,pdf){
  const s=edgeSvgPaints(svg),p=edgePdfPaints(pdf);assert.equal(s.paints.length,p.paints.length);
  // The two original backend readers establish shipped state independently
  // of construction probes. Reuse their existing cross-backend verification.
  const paths=s.paints.map((v,i)=>({index:i+1,modes:[],paint:{operation:p.paints[i].operation,widthSp:Math.round(v.width*65536),
    cap:v.cap,join:v.join,miter:v.miter,strokeOpacity:v.strokeOpacity,fillOpacity:v.fillOpacity,
    strokeRgb:v.stroke,fillRgb:v.fill,dashSp:v.dash.map(n=>Math.round(n*65536)),dashPhaseSp:Math.round(v.phase*65536)}}));
  const order=paths.map(v=>v.index);assert.equal(s.clips.length,p.clips.length);
  for(let i=0;i<s.clips.length;i++)paths.push({index:paths.length+1,modes:['clip'],paint:null});
  const verified=verifyEdgeDriverState({paths,physicalOrder:{paintedPaths:order}},svg,pdf);
  return{...verified,semantics:'Shipped SVG/PDF paints in physical order; construction path IDs are separate.'};
}
