// Public candidate research images. No fitted registration or acceptance limits.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadEdgeEvidence,edgeReference} from './edge-evidence.mjs';
import {edgeCanonical} from './edge-log.mjs';
import {createRenderer} from './compare.mjs';

const base=path.join(root,'artifacts/edge-candidate-inspection'),output=path.join(base,'run-'+randomUUID()),artifacts={},cases=[],sourceHashes={};
const relative=file=>path.relative(root,file).split(path.sep).join('/');
const save=(file,bytes)=>writeArtifact(output,file,bytes,artifacts);
const inputs=['tools/TikzVisual/edge-candidate-inspect.mjs','tools/TikzVisual/edge-evidence.mjs','tools/TikzVisual/edge-log.mjs',
  'tools/TikzVisual/edge-driver-state.mjs','tools/TikzVisual/edge-replay.mjs','tools/TikzVisual/shape-oracle-bundle.mjs',
  'tools/TikzVisual/labelled-border-log.mjs','tools/TikzVisual/labelled-border-pdf-vector.mjs','tools/TikzVisual/dash-pdf-vector.mjs',
  'tools/TikzVisual/compare.mjs','tools/TikzVisual/browser-profile.json','tools/TikzVisual/text-profile.json',
  'tools/TikzVisual/node-profile.json','tools/TikzVisual/package.json','tools/TikzVisual/package-lock.json'];
let renderer,evidence,numeric,candidateInvoked=false,phase='arguments';
function region(metrics){const b=metrics.pictureBounds,o=metrics.pdfCamera.origin,k=96/(72.27*65536);
  return{x:o.x+b.minXSp*k-8,y:o.y-b.maxYSp*k-8,width:(b.maxXSp-b.minXSp)*k+16,height:(b.maxYSp-b.minYSp)*k+16};}
function placement(svg,metrics,candidate){
  if(candidate){const box=/viewBox="([^"]+)"/.exec(svg)?.[1].split(' ').map(Number);
    assert.ok(box?.length===4&&box.every(Number.isFinite)&&box[2]>0&&box[3]>0);
    return{x:metrics.pdfCamera.origin.x+box[0],y:metrics.pdfCamera.origin.y+box[1],width:box[2],height:box[3]};}
  const box=/viewBox='([^']+)'/.exec(svg)?.[1].split(' ').map(Number);
  const origin=/transform='translate\(([-\d.]+),([-\d.]+)\)scale\(0\.996264,-0\.996264\)'/.exec(svg)?.slice(1).map(Number);
  assert.ok(box?.length===4&&box.every(Number.isFinite)&&origin?.length===2&&origin.every(Number.isFinite));
  const k=96/72;return{x:metrics.pdfCamera.origin.x+(box[0]-origin[0])*k,y:metrics.pdfCamera.origin.y+(box[1]-origin[1])*k,width:box[2]*k,height:box[3]*k};
}
async function render(svg,candidate,pdf,metrics,scale){
  const referencePlacement=placement(svg,metrics,false),candidatePlacement=placement(candidate,metrics,true);
  const page=metrics.pdfCamera.rasterSizes[scale+'x'],crop=region(metrics);
  return renderer.page.evaluate(async({svg,candidate,pdf,referencePlacement,candidatePlacement,page,crop,scale})=>{
    function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
    const load=url=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('Image decode failed.'));i.src=url;});
    const svgImage=await load('data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg))));
    const actualImage=await load('data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(candidate))));
    const pdfImage=await load('data:image/png;base64,'+pdf);if(pdfImage.width!==page.width||pdfImage.height!==page.height)throw Error('PDF page size changed.');
    function svgPage(image,p){const c=canvas(page.width,page.height),ctx=c.getContext('2d',{willReadFrequently:true,colorSpace:'srgb'});
      ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(image,p.x*scale,p.y*scale,p.width*scale,p.height*scale);return c;}
    const ref=svgPage(svgImage,referencePlacement),actual=svgPage(actualImage,candidatePlacement),pdfPage=canvas(page.width,page.height);
    pdfPage.getContext('2d').drawImage(pdfImage,0,0);
    const r={x:Math.floor(crop.x*scale),y:Math.floor(crop.y*scale),right:Math.ceil((crop.x+crop.width)*scale),bottom:Math.ceil((crop.y+crop.height)*scale)};
    if(r.x<0||r.y<0||r.right>page.width||r.bottom>page.height)throw Error('Native diagnostic region leaves the page.');
    r.width=r.right-r.x;r.height=r.bottom-r.y;delete r.right;delete r.bottom;
    const png=c=>c.toDataURL('image/png').split(',')[1];
    function compare(a,b){
      const ad=a.getContext('2d').getImageData(0,0,a.width,a.height),bd=b.getContext('2d').getImageData(0,0,b.width,b.height);
      let changedPixels=0,maxChannelError=0,totalChannelError=0,foregroundPixels=0,foregroundChannelError=0;
      for(let i=0;i<ad.data.length;i+=4){let changed=false,total=0;const foreground=[0,1,2].some(j=>ad.data[i+j]<255||bd.data[i+j]<255);
        for(let j=0;j<4;j++){const error=Math.abs(ad.data[i+j]-bd.data[i+j]);changed ||= error!==0;maxChannelError=Math.max(maxChannelError,error);if(j<3)total+=error;}
        if(changed)changedPixels++;totalChannelError+=total;if(foreground){foregroundPixels++;foregroundChannelError+=total;}}
      return{changedPixels,maxChannelError,meanChannelError:totalChannelError/(a.width*a.height*3),foregroundPixels,
        meanForegroundChannelError:foregroundPixels?foregroundChannelError/(foregroundPixels*3):0};
    }
    function pair(reference){
      const aa=canvas(r.width,r.height),bb=canvas(r.width,r.height);
      aa.getContext('2d').drawImage(reference,r.x,r.y,r.width,r.height,0,0,r.width,r.height);
      bb.getContext('2d').drawImage(actual,r.x,r.y,r.width,r.height,0,0,r.width,r.height);
      const ad=aa.getContext('2d').getImageData(0,0,r.width,r.height),bd=bb.getContext('2d').getImageData(0,0,r.width,r.height);
      const diff=canvas(r.width,r.height),amplified=canvas(r.width,r.height),overlay=canvas(r.width,r.height);
      const d=diff.getContext('2d').createImageData(r.width,r.height),e=amplified.getContext('2d').createImageData(r.width,r.height);
      for(let i=0;i<ad.data.length;i+=4){for(let j=0;j<3;j++){const error=Math.abs(ad.data[i+j]-bd.data[i+j]);d.data[i+j]=error;e.data[i+j]=Math.min(255,error*8);}d.data[i+3]=e.data[i+3]=255;}
      diff.getContext('2d').putImageData(d,0,0);amplified.getContext('2d').putImageData(e,0,0);
      const oc=overlay.getContext('2d');oc.drawImage(aa,0,0);oc.globalAlpha=.5;oc.drawImage(bb,0,0);
      const sheet=canvas(r.width*3,r.height),sc=sheet.getContext('2d');sc.drawImage(aa,0,0);sc.drawImage(bb,r.width,0);sc.drawImage(amplified,r.width*2,0);
      return{whole:compare(reference,actual),crop:compare(aa,bb),images:{reference:png(aa),actual:png(bb),difference:png(diff),amplified:png(amplified),overlay:png(overlay),'contact-sheet':png(sheet)}};
    }
    return{rectangle:r,page,referencePlacement,candidatePlacement,routes:{svg:pair(ref),pdf:pair(pdfPage)},pages:{reference:png(ref),actual:png(actual)}};
  },{svg,candidate,pdf:pdf.toString('base64'),referencePlacement,candidatePlacement,page,crop,scale});
}
function viewer(){return`<!doctype html><meta charset="utf-8"><title>Straight to/edge public comparison research</title>
  <style>body{font:16px system-ui;margin:2rem;max-width:1600px}article{margin:3rem 0}img.sheet{max-width:100%;image-rendering:pixelated;border:1px solid #bbb}pre{white-space:pre-wrap}td,th{padding:.3rem;text-align:left}</style>
  <h1>Straight to/edge candidate inspection</h1><p>Public converter versus original PGF SVG and ordinary TikZ PDF. Physical page registration comes from native measurements. Numeric checks pass; image calibration and conformance remain pending. Raw differences have no acceptance limit.</p>
  <p><a href="report.json">Report</a> · <a href="numeric/report.json">Numeric provenance</a> · <button onclick="document.querySelectorAll('.sheet').forEach(i=>i.style.maxWidth=i.style.maxWidth==='none'?'100%':'none')">Toggle native-size zoom</button></p>
  ${cases.map(c=>`<article><h2>${c.id}</h2><p><a href="${c.id}/source.tikz">TikZ</a> · <a href="${c.id}/reference.svg">Original SVG</a> · <a href="${c.id}/reference.pdf">Original PDF</a> · <a href="${c.id}/actual.svg">Candidate SVG</a> · <a href="${c.id}/native.json">Native records</a> · <a href="numeric/${c.id}/numeric.json">Numeric checks</a> · <a href="numeric/${c.id}/actual-scene.json">Source traces and scene</a></p>
    ${c.views.map(v=>`<section><h3>${v.route.toUpperCase()} at ${v.scale}x: reference | candidate | difference ×8</h3><img class="sheet" src="${v.artifacts['contact-sheet']}" alt="${c.id} ${v.route} ${v.scale}x comparison"><p>${v.whole.changedPixels} whole-page changed pixels; maximum ${v.whole.maxChannelError}/255; foreground mean ${v.whole.meanForegroundChannelError.toFixed(6)}/255. Research observation.</p><p><a href="${v.artifacts.reference}">Reference crop</a> · <a href="${v.artifacts.actual}">Candidate crop</a> · <a href="${v.artifacts.difference}">Raw difference</a> · <a href="${v.artifacts.overlay}">Overlay</a> · <a href="${v.artifacts['reference-page']}">Reference page</a> · <a href="${v.artifacts['actual-page']}">Candidate page</a></p></section>`).join('')}
    <details><summary>Path source spans in physical paint order</summary><table><tr><th>SVG element</th><th>Native construction ID</th><th>Line:column</th><th>TikZ source</th></tr>${c.traces.map(t=>`<tr><td>${t.svgElementId}</td><td>${t.nativePathId}</td><td>${t.source.line}:${t.source.column}</td><td><pre>${escape(t.text)}</pre></td></tr>`).join('')}</table></details></article>`).join('')}`;}
function escape(text){return text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
async function publish(completed,error){const report={schemaVersion:1,completed,phase,comparisonKind:'public-straight-edge-inspection',converterInvoked:candidateInvoked,
  numericPassed:numeric?.numericPassed,approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending-image-calibration',
  snapshotSha256:evidence?.snapshotSha256,renderer:renderer?.identity,sourceHashes,cases,artifacts,...(error?{error}:{})};
  const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',bytes);
  await writeArtifact(base,'latest.json',JSON.stringify({completed,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)},null,2)+'\n');
  console.log(JSON.stringify({kind:'edge-candidate-inspection-output',completed,report:relative(path.join(output,'report.json')),sha256:sha256(bytes)}));}
try{
  assert.equal(process.argv.length,2);await publish(false);
  phase='source-capture';for(const file of inputs){const bytes=edgeCanonical(await readFile(path.join(root,file)));sourceHashes[file]=sha256(bytes);await save('source-captures/'+file,bytes);}
  evidence=await loadEdgeEvidence();for(const[file,bytes]of evidence.files)await save('input-captures/'+file,bytes);
  phase='public-numeric';candidateInvoked=true;const result=await promisify(execFile)('dotnet',['run','--project','tools/TikzEdgeComparison','-c','Release','--','--out',relative(path.join(output,'numeric'))],
    {cwd:root,windowsHide:true,timeout:180000,maxBuffer:1000000});await save('numeric-command.log',result.stdout+result.stderr);
  const numericBytes=await readFile(path.join(output,'numeric/report.json'));artifacts['numeric/report.json']=sha256(numericBytes);numeric=JSON.parse(numericBytes);
  assert.equal(numeric.completed,true);assert.equal(numeric.numericPassed,true);assert.equal(numeric.comparisonKind,'public-straight-edge-numeric');assert.equal(numeric.snapshotSha256,evidence.snapshotSha256);
  assert.equal(numeric.approvedImagePolicy,false);assert.equal(numeric.imageConformanceClaim,false);
  for(const[file,digest]of Object.entries(numeric.artifacts)){const bytes=await readFile(path.join(output,'numeric',file));assert.equal(sha256(bytes),digest);artifacts['numeric/'+file]=digest;}
  phase='renderer';renderer=await createRenderer();
  for(const c of evidence.cases){
    phase='images/'+c.fixture.id;const id=c.fixture.id,prefix=edgeReference+id+'/';
    const svg=evidence.files.get(prefix+'plain-reference.svg'),pdf=evidence.files.get(prefix+'plain-reference.pdf');
    const actual=await readFile(path.join(output,'numeric',id,'actual.svg')),source=evidence.files.get(c.fixture.source);
    await save(id+'/source.tikz',source);await save(id+'/reference.svg',svg);await save(id+'/reference.pdf',pdf);await save(id+'/actual.svg',actual);
    await save(id+'/native.json',evidence.files.get(prefix+'metrics.json'));
    const scene=JSON.parse(await readFile(path.join(output,'numeric',id,'actual-scene.json'))),text=source.toString('utf8');
    const record={id,numericChecks:numeric.cases.find(row=>row.caseId===id).checks,views:[],traces:scene.paths.map((p,i)=>({svgElementId:p.svgElementId,
      nativePathId:c.metrics.driverState.paints[i].pathId,source:p.source,text:text.slice(p.source.offset,p.source.offset+p.source.length)}))};
    for(const scale of[1,4]){
      const pdfPage=evidence.files.get(prefix+'plain-pdf-page-'+scale+'x.png'),observed=await render(svg.toString('utf8'),actual.toString('utf8'),pdfPage,c.metrics,scale);
      const pages={};for(const[name,base64]of Object.entries(observed.pages)){const file=id+'/'+scale+'x/'+name+'-page.png';await save(file,Buffer.from(base64,'base64'));pages[name]=file;}
      const pdfFile=id+'/'+scale+'x/pdf-page.png';await save(pdfFile,pdfPage);
      for(const[route,view]of Object.entries(observed.routes)){
        const paths={};for(const[name,base64]of Object.entries(view.images)){const file=id+'/'+scale+'x/'+route+'/'+name+'.png';await save(file,Buffer.from(base64,'base64'));paths[name]=file;}
        paths['reference-page']=route==='svg'?pages.reference:pdfFile;paths['actual-page']=pages.actual;
        const {images,...measurements}=view;record.views.push({scale,route,...measurements,page:observed.page,rectangle:observed.rectangle,
          referencePlacement:route==='svg'?observed.referencePlacement:{x:0,y:0,width:observed.page.width,height:observed.page.height},candidatePlacement:observed.candidatePlacement,artifacts:paths});
      }
    }
    cases.push(record);console.log('Candidate images retained: '+id);
  }
  phase='final-integrity';const html=viewer();
  // The report names itself but cannot include its own digest in artifacts.
  assert.equal(JSON.parse(await readFile(path.join(output,'report.json'))).completed,false);
  for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g))assert.ok(match[1]==='report.json'||artifacts[match[1]],'Missing viewer artifact: '+match[1]);
  await save('index.html',html);
  for(const[file,digest]of Object.entries(sourceHashes))assert.equal(sha256(edgeCanonical(await readFile(path.join(root,file)))),digest,'Inspection source changed.');
  for(const[file,digest]of Object.entries({...numeric.converterSources,...numeric.toolHashes}))assert.equal(sha256(edgeCanonical(await readFile(path.join(root,file)))),digest,'Numeric source changed.');
  const after=await loadEdgeEvidence();for(const[file,bytes]of evidence.files)assert.ok(bytes.equals(after.files.get(file)),'Native evidence changed.');
  for(const[file,digest]of Object.entries(artifacts))assert.equal(sha256(await readFile(path.join(output,file))),digest,'Inspection artifact changed.');
  phase='complete';await publish(true);
}catch(error){process.exitCode=2;if(phase==='public-numeric'&&(error.stdout||error.stderr))await save('numeric-command.log',(error.stdout??'')+(error.stderr??''));
  await publish(false,error.message);console.error(error.stack);}
finally{await renderer?.browser.close();}
