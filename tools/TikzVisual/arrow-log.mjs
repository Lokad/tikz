// Native observations only: no converter, production geometry or SVG writer.
import assert from 'node:assert/strict';
export const arrowProfile='pgf-3.1.11a-arrow-native-v1';
export const arrowIds=['legacy-defaults','meta-defaults','dimensions','transforms','curves-nodes','paint-boundaries'];
export const arrowManifest='tests/Reference/Arrows/cases.json';
export const arrowWrapper='tools/TikzArrowReference/arrows.tex';
export const arrowHooks='tools/TikzArrowReference/arrow-hooks.tex';
export const arrowReferenceSources=[arrowManifest,arrowWrapper,arrowHooks,'tools/TikzVisual/arrow-reference.mjs','tools/TikzVisual/arrow-log.mjs',
 'tools/TikzVisual/arrow-driver-state.mjs','tools/TikzVisual/arrow-evidence.mjs','tools/TikzVisual/shape-oracle-bundle.mjs','tools/TikzVisual/edge-driver-state.mjs',
 'tools/TikzVisual/labelled-border-pdf-vector.mjs','tools/TikzVisual/dash-pdf-vector.mjs'];
export const canonicalArrow=b=>Buffer.from(b.toString('utf8').replace(/\r\n/g,'\n'));
const integer=s=>{assert.match(s,/^-?\d+$/);const n=Number(s);assert.ok(Number.isSafeInteger(n)&&Math.abs(n)<2**31);return n;};
const real=s=>{const n=Number(s);assert.ok(s.length>0&&Number.isFinite(n)&&Math.abs(n)<=1000);return n;};
export function validateArrowManifest(m){
 assert.equal(m.schemaVersion,1);assert.equal(m.profile,arrowProfile);assert.deepEqual(m.cases.map(c=>c.id),arrowIds);
 for(const c of m.cases){assert.deepEqual(Object.keys(c),['id','meta','source','features']);assert.equal(typeof c.meta,'boolean');
  assert.equal(c.source,'tests/Reference/Arrows/'+c.id+'/source.tikz');assert.ok(c.features.length>=5&&new Set(c.features).size===c.features.length);}
}
export function arrowRecords(log){
 assert.ok(typeof log==='string'&&log.length<=1000000);const records=[...log.matchAll(/\b(ARROW-[A-Z-]+) ([\s\S]*?)\|END/g)].map(m=>({kind:m[1],fields:m[2].replace(/\r?\n/g,'').split('|')}));
 assert.ok(records.length>0&&records.length<20000);assert.equal((log.match(/\bARROW-/g)??[]).length,records.length,'Incomplete native arrow record.');return records;
}
export function parseArrowLog(log){
 const inputs=[],paths=[],templates=[],placements=[],shortening=[],paintEvents=[],clips=[],sizes=new Map();let pictureBounds,pictureBox,pgf;
 const lookup=(a,id)=>{const n=integer(id);assert.ok(n>0&&n<=a.length);const row=a[n-1];assert.equal(row.id,n);return row;};
 for(const {kind,fields:f}of arrowRecords(log)){
  const count=n=>assert.equal(f.length,n,'Native arrow field count: '+kind);
  if(kind==='ARROW-PGF'){count(1);assert.equal(pgf,undefined);pgf=f[0];assert.equal(pgf,'3.1.11a');}
  else if(kind==='ARROW-INPUT'){count(5);assert.equal(integer(f[0]),inputs.length+1);assert.match(f[1],/^[a-z ,]*$/);inputs.push({id:integer(f[0]),modes:f[1],lineWidthSp:integer(f[2]),additionalShorteningSp:{start:integer(f[3]),end:integer(f[4])},segments:[]});}
  else if(kind==='ARROW-PATH'){count(5);assert.equal(integer(f[0]),paths.length+1);assert.ok(['shaft','template'].includes(f[1]));lookup(inputs,f[2]);
   paths.push({id:integer(f[0]),role:f[1],inputId:integer(f[2]),templateId:f[1]==='template'?integer(f[3]):null,lineWidthSp:integer(f[4]),segments:[]});}
  else if(kind==='ARROW-SEG'){count(4);const m=/^(input|path)-(\d+)$/.exec(f[0]);assert.ok(m);assert.ok(['move','line','rectcorner','rectsize','control1','control2','curve','close'].includes(f[1]));
   lookup(m[1]==='input'?inputs:paths,m[2]).segments.push({kind:f[1],xSp:integer(f[2]),ySp:integer(f[3])});}
  else if(kind==='ARROW-SIZE'){count(5);const id=integer(f[0]);assert.ok(id>0&&!sizes.has(id));sizes.set(id,f.slice(1).map(integer));}
  else if(kind==='ARROW-TEMPLATE'){count(2);const id=integer(f[0]);assert.equal(id,templates.length+1);assert.ok(['to','Computer Modern Rightarrow','Stealth','Latex'].includes(f[1]));
   templates.push({id,name:f[1],configuredSizeSp:sizes.get(id)??null,finalSizeSp:null,ends:null,visualEnds:null,hull:[],paths:paths.filter(p=>p.role==='template'&&p.templateId===id).map(p=>p.id)});}
  else if(kind==='ARROW-ENDS'){count(4);const t=lookup(templates,f[0]);assert.equal(t.ends,null);t.ends=Object.fromEntries(['tipSp','backSp','lineSp'].map((k,i)=>[k,integer(f[i+1])]));}
  else if(kind==='ARROW-VISUAL-ENDS'){count(3);const t=lookup(templates,f[0]);assert.equal(t.visualEnds,null);t.visualEnds={tipSp:integer(f[1]),backSp:integer(f[2])};}
  else if(kind==='ARROW-FINAL-SIZE'){count(5);const t=lookup(templates,f[0]);assert.equal(t.finalSizeSp,null);t.finalSizeSp=f.slice(1).map(integer);}
  else if(kind==='ARROW-HULL'){count(3);lookup(templates,f[0]).hull.push({xSp:integer(f[1]),ySp:integer(f[2])});}
  else if(kind==='ARROW-PAINT'){count(3);const p=lookup(paths,f[0]);assert.equal(p.role,f[1]);assert.equal(p.paint,undefined);assert.ok(['stroke','fill','fillstroke'].includes(f[2]));p.paint=f[2];}
  else if(kind==='ARROW-CLIP'){count(1);const p=lookup(paths,f[0]);assert.ok(!clips.includes(p.id));clips.push(p.id);}
  else if(kind==='ARROW-PLACE'){count(10);assert.equal(integer(f[0]),placements.length+1);lookup(inputs,f[1]);lookup(templates,f[3]);assert.ok(['start','end'].includes(f[2]));
   placements.push({id:integer(f[0]),inputId:integer(f[1]),side:f[2],templateId:integer(f[3]),matrix:f.slice(4,8).map(real),xSp:integer(f[8]),ySp:integer(f[9])});}
  else if(kind==='ARROW-SHORT'){count(5);lookup(inputs,f[0]);assert.ok(['start','end'].includes(f[1]));assert.equal(integer(f[4]),0,'Only native quick shortening belongs to this profile.');
   assert.ok(!shortening.some(s=>s.inputId===integer(f[0])&&s.side===f[1]));shortening.push({inputId:integer(f[0]),side:f[1],distanceSp:integer(f[2]),totalLengthSp:integer(f[3]),precise:false});}
  else if(kind==='ARROW-EVENT'){count(3);assert.equal(integer(f[0]),paintEvents.length+1);assert.ok(['path','tip'].includes(f[1]));lookup(f[1]==='path'?paths:placements,f[2]);paintEvents.push({id:integer(f[0]),kind:f[1],target:integer(f[2])});}
  else if(kind==='ARROW-BOUNDS'){count(4);assert.equal(pictureBounds,undefined);pictureBounds=Object.fromEntries(['minXSp','minYSp','maxXSp','maxYSp'].map((k,i)=>[k,integer(f[i])]));}
  else if(kind==='ARROW-BOX'){count(3);assert.equal(pictureBox,undefined);pictureBox=Object.fromEntries(['widthSp','heightSp','depthSp'].map((k,i)=>[k,integer(f[i])]));}
  else if(kind==='ARROW-PAGE')count(4);
  else assert.fail('Unknown native arrow observation: '+kind);
 }
 assert.ok(pgf&&pictureBounds&&pictureBox&&inputs.length>0&&inputs.length<1000&&templates.length>0&&templates.length<100&&paths.length<2000);
 assert.equal(pictureBox.widthSp,pictureBounds.maxXSp-pictureBounds.minXSp,'TeX glue outside the measured arrow picture.');
 assert.equal(pictureBox.heightSp+pictureBox.depthSp,pictureBounds.maxYSp-pictureBounds.minYSp,'Arrow picture height/span disagreement.');
 for(const t of templates){assert.ok(t.ends&&t.visualEnds&&(t.name==='to'?t.hull.length===0:t.hull.length>0)&&t.paths.length>0);for(const id of t.paths){const p=lookup(paths,String(id));assert.ok(p.paint&&p.segments.length);}}
 assert.deepEqual(paintEvents.filter(s=>s.kind==='tip').map(s=>s.target),placements.map(p=>p.id),'Missing or repeated tip paint event.');
 assert.deepEqual(paintEvents.filter(s=>s.kind==='path').map(s=>s.target),paths.filter(p=>p.role==='shaft'&&p.paint).map(p=>p.id),'Missing or repeated shaft paint event.');
 return{schemaVersion:1,pgf,inputs,paths,templates,placements,shortening,paintEvents,clips,pictureBounds,pictureBox};
}
export function arrowLayout(log){
 const r=arrowRecords(log),one=k=>{const a=r.filter(r=>r.kind===k);assert.equal(a.length,1);return a[0].fields;};
 assert.equal(one('ARROW-PGF')[0],'3.1.11a');return{bounds:one('ARROW-BOUNDS').map(integer),box:one('ARROW-BOX').map(integer)};
}
export function arrowPage(log){const a=arrowRecords(log).filter(r=>r.kind==='ARROW-PAGE');assert.equal(a.length,1);assert.equal(a[0].fields.length,4);
 return Object.fromEntries(['boxXSp','boxBaselineYSp','widthSp','heightSp'].map((k,i)=>[k,integer(a[0].fields[i])]));}
