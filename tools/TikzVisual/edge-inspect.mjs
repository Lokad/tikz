// Native SVG/PDF inspection only. No candidate or image acceptance policy.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadEdgeEvidence,edgeReference} from './edge-evidence.mjs';
import {edgeCanonical} from './edge-log.mjs';
import {createRenderer} from './compare.mjs';

const base=path.join(root,'artifacts/edge-native-inspection'),output=path.join(base,'run-'+randomUUID()),artifacts={},cases=[];
const save=(file,bytes)=>writeArtifact(output,file,bytes,artifacts);
const inputs=['tools/TikzVisual/edge-inspect.mjs','tools/TikzVisual/edge-evidence.mjs','tools/TikzVisual/edge-log.mjs',
  'tools/TikzVisual/edge-driver-state.mjs','tools/TikzVisual/shape-oracle-bundle.mjs','tools/TikzVisual/labelled-border-log.mjs',
  'tools/TikzVisual/edge-replay.mjs',
  'tools/TikzVisual/labelled-border-pdf-vector.mjs','tools/TikzVisual/dash-pdf-vector.mjs','tools/TikzVisual/compare.mjs',
  'tools/TikzVisual/browser-profile.json','tools/TikzVisual/text-profile.json','tools/TikzVisual/node-profile.json',
  'tools/TikzVisual/package.json','tools/TikzVisual/package-lock.json'];
const sourceHashes={};let renderer,evidence;
function region(metrics){const b=metrics.pictureBounds,o=metrics.pdfCamera.origin,k=96/(72.27*65536);
  return{x:o.x+b.minXSp*k-8,y:o.y-b.maxYSp*k-8,width:(b.maxXSp-b.minXSp)*k+16,height:(b.maxYSp-b.minYSp)*k+16};}
async function render(svg,pdf,metrics,scale){
  const viewBox=/viewBox='([^']+)'/.exec(svg)?.[1].split(' ').map(Number);
  const nativeOrigin=/transform='translate\(([-\d.]+),([-\d.]+)\)scale\(0\.996264,-0\.996264\)'/.exec(svg)?.slice(1).map(Number);
  assert.ok(viewBox?.length===4&&viewBox.every(Number.isFinite)&&nativeOrigin?.length===2&&nativeOrigin.every(Number.isFinite));
  const camera=metrics.pdfCamera,page=camera.rasterSizes[scale+'x'],crop=region(metrics),bpToCss=96/72;
  const x=camera.origin.x+(viewBox[0]-nativeOrigin[0])*bpToCss,y=camera.origin.y+(viewBox[1]-nativeOrigin[1])*bpToCss;
  return renderer.page.evaluate(async({svg,pdf,page,crop,scale,x,y,width,height})=>{
    function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
    const load=url=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=url;});
    const svgImage=await load('data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg))));
    const pdfImage=await load('data:image/png;base64,'+pdf);if(pdfImage.width!==page.width||pdfImage.height!==page.height)throw Error('PDF page size changed.');
    const a=canvas(page.width,page.height),b=canvas(page.width,page.height),ac=a.getContext('2d',{willReadFrequently:true,colorSpace:'srgb'});
    ac.fillStyle='white';ac.fillRect(0,0,a.width,a.height);ac.drawImage(svgImage,x*scale,y*scale,width*scale,height*scale);
    b.getContext('2d').drawImage(pdfImage,0,0);
    const r={x:Math.floor(crop.x*scale),y:Math.floor(crop.y*scale),right:Math.ceil((crop.x+crop.width)*scale),bottom:Math.ceil((crop.y+crop.height)*scale)};
    if(r.x<0||r.y<0||r.right>page.width||r.bottom>page.height)throw Error('Native diagnostic region leaves the page.');
    r.width=r.right-r.x;r.height=r.bottom-r.y;delete r.right;delete r.bottom;
    const aa=canvas(r.width,r.height),bb=canvas(r.width,r.height);
    aa.getContext('2d').drawImage(a,r.x,r.y,r.width,r.height,0,0,r.width,r.height);
    bb.getContext('2d').drawImage(b,r.x,r.y,r.width,r.height,0,0,r.width,r.height);
    const ad=aa.getContext('2d').getImageData(0,0,r.width,r.height),bd=bb.getContext('2d').getImageData(0,0,r.width,r.height);
    const diff=canvas(r.width,r.height),amplified=canvas(r.width,r.height),overlay=canvas(r.width,r.height);
    const d=diff.getContext('2d').createImageData(r.width,r.height),e=amplified.getContext('2d').createImageData(r.width,r.height);
    let changedPixels=0,maxChannelError=0,totalChannelError=0;
    for(let i=0;i<ad.data.length;i+=4){let changed=false;for(let j=0;j<3;j++){const error=Math.abs(ad.data[i+j]-bd.data[i+j]);d.data[i+j]=error;e.data[i+j]=Math.min(255,error*8);
      changed ||= error!==0;maxChannelError=Math.max(maxChannelError,error);totalChannelError+=error;}d.data[i+3]=255;e.data[i+3]=255;if(changed)changedPixels++;}
    diff.getContext('2d').putImageData(d,0,0);amplified.getContext('2d').putImageData(e,0,0);
    const oc=overlay.getContext('2d');oc.drawImage(aa,0,0);oc.globalAlpha=.5;oc.drawImage(bb,0,0);
    const sheet=canvas(r.width*3,r.height),sc=sheet.getContext('2d');sc.drawImage(aa,0,0);sc.drawImage(bb,r.width,0);sc.drawImage(amplified,r.width*2,0);
    const png=c=>c.toDataURL('image/png').split(',')[1];
    return{rectangle:r,page,changedPixels,maxChannelError,meanChannelError:totalChannelError/(r.width*r.height*3),
      images:{'svg-page':png(a),'svg-crop':png(aa),'pdf-crop':png(bb),difference:png(diff),amplified:png(amplified),overlay:png(overlay),'contact-sheet':png(sheet)}};
  },{svg,pdf:pdf.toString('base64'),page,crop,scale,x,y,width:viewBox[2]*bpToCss,height:viewBox[3]*bpToCss});
}
function viewer(){const rows=cases.map(c=>`<article><h2>${c.id}</h2><p><a href="${c.id}/source.tikz">TikZ source</a> · <a href="${c.id}/reference.svg">Original SVG</a> · <a href="${c.id}/reference.pdf">Original PDF</a> · <a href="${c.id}/metrics.json">Native measurements and paint order</a></p>`
  +c.views.map(v=>`<section><h3>${v.scale}x: outlined SVG | ordinary TikZ PDF | difference ×8</h3><img class="sheet" src="${v.artifacts['contact-sheet']}" alt="${c.id} ${v.scale}x native comparison"><p>${v.changedPixels} changed pixels; maximum RGB error ${v.maxChannelError}/255. Research observation with no acceptance limit.</p><p><a href="${v.artifacts['svg-crop']}">SVG crop</a> · <a href="${v.artifacts['pdf-crop']}">PDF crop</a> · <a href="${v.artifacts.difference}">Raw difference</a> · <a href="${v.artifacts.amplified}">Amplified difference</a> · <a href="${v.artifacts.overlay}">Overlay</a> · <a href="${v.artifacts['svg-page']}">Full SVG page</a> · <a href="${v.artifacts['pdf-page']}">Full PDF page</a></p></section>`).join('')+'</article>').join('');
  return`<!doctype html><meta charset="utf-8"><title>Straight to/edge native evidence</title><style>body{font:16px system-ui;margin:2rem;max-width:1600px}article{margin:3rem 0}img.sheet{max-width:100%;image-rendering:pixelated;border:1px solid #bbb}button{margin-right:1rem}</style><h1>Straight to/edge native SVG and PDF inspection</h1><p>Independent trusted TikZ references. No converter invocation, approved image policy or conformance claim. Placement uses measured physical origins; crops use the same integer page rectangles.</p><p><a href="report.json">Machine-readable report</a> · <button onclick="document.querySelectorAll('.sheet').forEach(i=>i.style.maxWidth=i.style.maxWidth==='none'?'100%':'none')">Toggle native-size zoom</button></p>${rows}`;}
async function publish(completed,error){const report={schemaVersion:1,completed,comparisonKind:'straight-edge-native-svg-pdf-inspection',converterInvoked:false,
  approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',snapshotSha256:evidence?.snapshotSha256,renderer:renderer?.identity,
  sourceHashes,cases,artifacts,...(error?{error}: {})};const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',bytes);
  const relative=path.relative(base,path.join(output,'report.json')).split(path.sep).join('/');await writeArtifact(base,'latest.json',JSON.stringify({completed,report:relative,sha256:sha256(bytes)},null,2)+'\n');
  console.log(JSON.stringify({kind:'edge-native-inspection-output',completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));}
try{
  assert.equal(process.argv.length,2);await publish(false);
  for(const file of inputs){const bytes=edgeCanonical(await readFile(path.join(root,file)));sourceHashes[file]=sha256(bytes);await save('source-captures/'+file,bytes);}
  evidence=await loadEdgeEvidence();for(const[file,bytes]of evidence.files)await save('input-captures/'+file,bytes);
  renderer=await createRenderer();
  for(const c of evidence.cases){
    const prefix=edgeReference+c.fixture.id+'/',svg=evidence.files.get(prefix+'plain-reference.svg'),pdf=evidence.files.get(prefix+'plain-reference.pdf');
    await save(c.fixture.id+'/source.tikz',evidence.files.get(c.fixture.source));await save(c.fixture.id+'/reference.svg',svg);await save(c.fixture.id+'/reference.pdf',pdf);
    await save(c.fixture.id+'/metrics.json',evidence.files.get(prefix+'metrics.json'));const record={id:c.fixture.id,views:[]};
    for(const scale of[1,4]){
      const page=evidence.files.get(prefix+'plain-pdf-page-'+scale+'x.png'),observed=await render(svg.toString('utf8'),page,c.metrics,scale);
      const paths={};for(const[name,base64]of Object.entries(observed.images)){const file=c.fixture.id+'/'+scale+'x/'+name+'.png';await save(file,Buffer.from(base64,'base64'));paths[name]=file;}
      const pageFile=c.fixture.id+'/'+scale+'x/pdf-page.png';await save(pageFile,page);paths['pdf-page']=pageFile;
      const {images,...measurements}=observed;record.views.push({scale,...measurements,artifacts:paths});
    }cases.push(record);console.log('Native SVG/PDF images retained: '+record.id);
  }
  await save('index.html',viewer());
  for(const[file,digest]of Object.entries(sourceHashes))assert.equal(sha256(edgeCanonical(await readFile(path.join(root,file)))),digest,'Inspection source changed.');
  const after=await loadEdgeEvidence();for(const[file,bytes]of evidence.files)assert.ok(bytes.equals(after.files.get(file)),'Native evidence changed.');
  await publish(true);
}catch(error){process.exitCode=2;await publish(false,error.message);console.error(error.stack);}
finally{await renderer?.browser.close();}
