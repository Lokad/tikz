// Local, synchronized crops from immutable paired PNGs. No network or framework.
import assert from 'node:assert/strict';
import {sha256} from './shape-oracle-bundle.mjs';
export async function edgeAgentImages(agent,artifacts,read){
 const paths=[...new Set(agent.rankedRegions.flatMap(r=>[r.images.reference,r.images.actual]))].sort(),data={};
 for(const p of paths){const bytes=await read(p);assert.equal(sha256(bytes),artifacts[p],p);data[p]='data:image/png;base64,'+bytes.toString('base64');}
 return data;
}
export function edgeAgentViewer(agent,scope,imageData){
 const paths=[...new Set(agent.rankedRegions.flatMap(r=>[r.images.reference,r.images.actual]))].sort();
 assert.deepEqual(Object.keys(imageData).sort(),paths);
 for(const data of Object.values(imageData))assert.match(data,/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);
 const data=JSON.stringify(agent).replaceAll('<','\\u003c'),escape=t=>t.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 return '<!doctype html><html lang="en"><meta charset="utf-8"><title>Curved-connection conformance</title><style>body{font:16px sans-serif;margin:24px}select,input,button{font:inherit;margin:4px}canvas{image-rendering:pixelated;display:block}pre{white-space:pre-wrap}#pair{display:flex;gap:16px;flex-wrap:wrap}figure{margin:0;flex:1;min-width:240px}.viewport{overflow:auto;max-height:480px;border:1px solid #ccc}figcaption{margin:8px}</style>'
 +'<h1>Fixed curved-connection conformance</h1><p>'+escape(scope)+'</p><p>'+(agent.firstFailedGate===null?'All eight gates and the owned checker passed.':'First failed gate: '+escape(agent.firstFailedGate)+'.')+' Image budget utilization is a diagnostic ranking; the original comparisons decide acceptance.</p>'
 +'<p><a href="report.json">Admission report</a> · <a href="profile.json">Fixed profile</a> · <a href="cached/report.json">Owned cached run</a> · <a href="checker/report.json">Independent checker</a> · <a href="trial/index.html">Complete paired gallery and defect crops</a></p>'
 +'<p>'+['continuation','styles','coordinates','nodes','clipping'].map(id=>'<a href="trial/numeric/'+id+'/source.tikz">'+id+' source</a> · <a href="trial/numeric/'+id+'/actual-scene.json">scene</a>').join(' · ')+'</p>'
 +'<label>Case <select id="case"><option value="">All</option>'+['continuation','styles','coordinates','nodes','clipping'].map(id=>'<option>'+id+'</option>').join('')+'</select></label>'
 +'<label>Route <select id="route"><option value="">All</option><option>primary</option><option>candidatePdf</option></select></label><label>Region <input id="filter" placeholder="path, glyph or clip"></label>'
 +'<p><select id="regions" aria-label="Ranked regions"></select></p><label>Integer zoom <select id="zoom"><option>1</option><option selected>2</option><option>4</option><option>8</option></select></label>'
 +'<label>Mode <select id="mode"><option>pair</option><option>blink</option><option>overlay</option><option>difference</option></select></label><p id="detail"></p><p id="links"></p>'
 +'<div id="pair"><figure><figcaption id="leftLabel">Reference</figcaption><div class="viewport" id="leftViewport"><canvas id="left"></canvas></div></figure><figure id="actualFigure"><figcaption>Actual</figcaption><div class="viewport" id="rightViewport"><canvas id="right"></canvas></div></figure></div><pre id="source"></pre>'
 +'<script type="application/json" id="data">'+data+'</script><script type="application/json" id="imageData">'+JSON.stringify(imageData)+'</script><script>'+edgeViewerScript+'</script></html>';
}
const edgeViewerScript=String.raw`
const agent=JSON.parse(document.getElementById('data').textContent),imageData=JSON.parse(document.getElementById('imageData').textContent),get=id=>document.getElementById(id),cache=new Map();let chosen,images,timer,blink=false,epoch=0;
const load=src=>{if(!cache.has(src))cache.set(src,new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Could not decode '+src));image.src=imageData[src];}));return cache.get(src);};
function links(r){const p=get('links');p.replaceChildren();for(const [name,src]of Object.entries({...r.images,source:r.sourceFile,scene:r.scene,...(r.crops??{})})){const a=document.createElement('a');a.href=src;a.textContent=name;p.append(a,document.createTextNode(' · '));}}
function crop(image,r){const c=document.createElement('canvas'),b=r.rectangle;c.width=b.width;c.height=b.height;c.getContext('2d').drawImage(image,b.x,b.y,b.width,b.height,0,0,b.width,b.height);return c;}
function draw(){if(!chosen||!images)return;const scale=Number(get('zoom').value),mode=get('mode').value,a=crop(images[0],chosen),b=crop(images[1],chosen),left=get('left'),right=get('right');
 for(const c of [left,right]){c.width=a.width*scale;c.height=a.height*scale;c.getContext('2d').imageSmoothingEnabled=false;}
 const ctx=left.getContext('2d');get('leftLabel').textContent=mode==='pair'?'Reference':mode==='blink'?(blink?'Actual':'Reference'):mode;
 if(mode==='difference'){const x=a.getContext('2d').getImageData(0,0,a.width,a.height),y=b.getContext('2d').getImageData(0,0,b.width,b.height);for(let i=0;i<x.data.length;i+=4){const alpha=Math.abs(x.data[i+3]-y.data[i+3]);for(let k=0;k<3;k++)x.data[i+k]=255-Math.min(255,Math.max(alpha,Math.abs(x.data[i+k]-y.data[i+k]))*16);x.data[i+3]=255;}a.getContext('2d').putImageData(x,0,0);ctx.drawImage(a,0,0,left.width,left.height);get('leftLabel').textContent='RGB/alpha difference ×16';}
 else{ctx.drawImage(mode==='blink'&&blink?b:a,0,0,left.width,left.height);if(mode==='overlay'){ctx.globalAlpha=.5;ctx.drawImage(b,0,0,left.width,left.height);ctx.globalAlpha=1;}}
 right.getContext('2d').drawImage(b,0,0,right.width,right.height);get('actualFigure').hidden=mode!=='pair';
}
async function select(){const id=++epoch;images=null;chosen=get('regions').value===''?null:agent.rankedRegions[Number(get('regions').value)];if(!chosen){get('links').replaceChildren();get('source').textContent='';get('detail').textContent='No matching regions';for(const c of [get('left'),get('right')])c.width=c.height=0;return;}
 links(chosen);get('source').textContent=chosen.source.text+'\n\n'+JSON.stringify(chosen.metrics,null,2);get('detail').textContent=chosen.caseId+' / '+chosen.referenceRoute+' / '+chosen.view.frame+' '+chosen.view.scale+'x '+chosen.view.background+' / '+chosen.regionId+' / '+chosen.source.svgElementId+' / source '+chosen.source.source.line+':'+chosen.source.source.column+' / '+(chosen.passed?'passed':'failed')+' / budget '+chosen.budgetUtilization.toFixed(3);const pair=await Promise.all([load(chosen.images.reference),load(chosen.images.actual)]);if(id!==epoch)return;images=pair;draw();}
function filter(){const list=get('regions');list.replaceChildren();for(const [i,r]of agent.rankedRegions.entries())if((!get('case').value||r.caseId===get('case').value)&&(!get('route').value||r.route===get('route').value)&&r.regionId.includes(get('filter').value)){const o=document.createElement('option');o.value=i;o.textContent=r.caseId+' '+r.route+' '+r.view.frame+' '+r.view.scale+'x '+r.view.background+' '+r.regionId+' ('+r.budgetUtilization.toFixed(3)+')';list.append(o);}select();}
for(const id of ['case','route','filter'])get(id).addEventListener('input',filter);get('regions').addEventListener('change',select);get('zoom').addEventListener('change',draw);get('mode').addEventListener('change',()=>{clearInterval(timer);if(get('mode').value==='blink')timer=setInterval(()=>{blink=!blink;draw();},600);draw();});filter();
for(const id of ['leftViewport','rightViewport'])get(id).addEventListener('scroll',()=>{const from=get(id),to=get(id==='leftViewport'?'rightViewport':'leftViewport');if(to.scrollLeft!==from.scrollLeft)to.scrollLeft=from.scrollLeft;if(to.scrollTop!==from.scrollTop)to.scrollTop=from.scrollTop;});
`;
