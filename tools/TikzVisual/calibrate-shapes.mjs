import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer } from './compare.mjs';

const script = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(script), '../..');
const output = path.join(root, 'artifacts/node-shape-calibration');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const toolPaths = ['tools/TikzVisual/calibrate-shapes.mjs', 'tools/TikzVisual/compare.mjs', 'tools/TikzVisual/browser-profile.json',
  'tools/TikzVisual/package.json', 'tools/TikzVisual/package-lock.json'];
async function main() {
  assert.equal(process.argv.length, 2, 'Usage: node tools/TikzVisual/calibrate-shapes.mjs');
  for (let current = output; current !== root; current = path.dirname(current)) {
    const stat = await lstat(current).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    assert.ok(!stat?.isSymbolicLink(), 'Calibration output must not cross a symlink or junction.');
  }
  await mkdir(output, { recursive: true });
  const toolHashes = Object.fromEntries(await Promise.all(toolPaths.map(async file => [file, sha256(await readFile(path.join(root, file)))])));
  await new Promise((resolve, reject) => {
    const child = spawn('dotnet', ['run', '--project', 'tools/TikzShapeCalibration', '-c', 'Release', '--', 'derive-svg'], { cwd: root, windowsHide: true, shell: false });
    let captured = '', settled = false;
    const finish = error => { if (settled) return; settled = true; clearTimeout(timer); if (error) { child.kill(); reject(error); } else resolve(); };
    const timer = setTimeout(() => finish(new Error('Independent reconstruction timed out.')), 180000);
    const capture = bytes => { captured += bytes.toString(); if (captured.length > 1048576) finish(new Error('Reconstruction output exceeded its limit.')); };
    child.stdout.on('data', capture); child.stderr.on('data', capture); child.on('error', finish);
    child.on('close', code => { process.stdout.write(captured); finish(code === 0 ? null : new Error('Independent reconstruction failed: exit ' + code)); });
  });
  const derivationBytes = await readFile(path.join(output, 'derivation.json')), derivation = JSON.parse(derivationBytes);
  assert.equal(derivation.comparisonKind, 'oracle-only-shape-reconstruction'); assert.equal(derivation.completed, true);
  assert.equal(derivation.converterInvoked, false); assert.equal(derivation.conformanceClaim, false); assert.equal(derivation.approvedImagePolicy, false);
  assert.deepEqual(derivation.counts, { nodes: 28, pathTokens: 420, glyphs: 70 });
  assert.deepEqual(derivation.variants.map(v => v.mode), ['driver-css', 'native-css-12', 'native-css-6', 'sp-plus', 'sp-minus']);
  assert.ok(derivation.variants.every(v => v.serialization.passed && v.serialization.checks.every(c => c.passed)));
  assert.ok(derivation.evidence.frameworkReferences.every(name => name === 'System' || name.startsWith('System.')),
    'Oracle-only reconstruction must reference framework assemblies only.');
  async function validateEvidence() {
    assert.equal(sha256(await readFile(path.join(output, 'derivation.json'))), sha256(derivationBytes), 'Derivation changed during rendering.');
    for (const [file, hash] of Object.entries(derivation.evidence.artifacts)) {
      assert.ok(!path.isAbsolute(file) && !file.split(/[\\/]/).includes('..'), 'Invalid artifact path.');
      assert.equal(sha256(await readFile(path.join(output, file))), hash, 'Changed independent artifact: ' + file);
    }
    for (const [file, hash] of Object.entries({ ...derivation.evidence.toolHashes, ...toolHashes }))
      assert.equal(sha256(await readFile(path.join(root, file))), hash, 'Changed calibration tool: ' + file);
  }
  await validateEvidence();
  const reference = await readFile(path.join(output, 'reference.svg'), 'utf8');
  const native = JSON.parse(await readFile(path.join(output, 'metrics.json')));
  const glyphs = JSON.parse(await readFile(path.join(output, 'native-glyphs.json')));
  const origin = derivation.originBp, spToCss = 96/(72.27*65536), padding = 4, bounds = native.pictureBounds;
  const camera = { x: bounds.minXSp*spToCss-padding, y: -bounds.maxYSp*spToCss-padding,
    width: Math.ceil((bounds.maxXSp-bounds.minXSp)*spToCss+2*padding), height: Math.ceil((bounds.maxYSp-bounds.minYSp)*spToCss+2*padding),
    source: 'Independent native PGF picture bounds and original driver origin; four CSS pixels of declared inspection padding.' };
  assert.ok(camera.width*camera.height*16 <= 20000000, 'Calibration canvas exceeds its bound.');
  const renderer = await createRenderer(), measurements = [], allRegions = [], repeats = [], assets = {};
  try {
    const regions = await renderer.page.evaluate(({ reference, camera, origin, nodes, glyphs }) => {
      const doc = new DOMParser().parseFromString(reference, 'image/svg+xml');
      const svg = document.importNode(doc.documentElement, true);
      svg.setAttribute('width', camera.width); svg.setAttribute('height', camera.height);
      svg.setAttribute('viewBox', `${camera.x} ${camera.y} ${camera.width} ${camera.height}`);
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('transform', `matrix(${4/3} 0 0 ${4/3} ${-origin.x*4/3} ${-origin.y*4/3})`);
      while (svg.firstChild) group.append(svg.firstChild); svg.append(group); document.body.append(svg);
      try {
        const paths = [...svg.querySelectorAll('path')].filter(p => !p.closest('defs')), uses = [...svg.querySelectorAll('use')];
        const nativeGlyphs = glyphs.nodes.flatMap(n => n.glyphs.map((g, index) => ({ nodeId:n.id, glyphIndex:index, font:g.font, slot:g.slot })));
        if (paths.length !== 28 || uses.length !== 70 || nativeGlyphs.length !== 70) throw new Error('Independent region coverage differs.');
        function box(e) {
          const b=e.getBBox(),t=e.getCTM(); if(!t)throw new Error('Missing native element frame.');
          const points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]]
            .map(([x,y])=>({x:t.a*x+t.c*y+t.e,y:t.b*x+t.d*y+t.f}));
          const x=Math.max(0,Math.floor(Math.min(...points.map(p=>p.x))-3)),y=Math.max(0,Math.floor(Math.min(...points.map(p=>p.y))-3));
          return {x,y,width:Math.min(camera.width,Math.ceil(Math.max(...points.map(p=>p.x))+3))-x,
            height:Math.min(camera.height,Math.ceil(Math.max(...points.map(p=>p.y))+3))-y};
        }
        return [...paths.map((e,i)=>({id:'shape-'+nodes[i].id,nodeId:nodes[i].id,kind:'background',rectangle:box(e)})),
          ...uses.map((e,i)=>({id:'glyph-'+i,kind:'glyph',...nativeGlyphs[i],rectangle:box(e)}))];
      }finally{svg.remove();}
    }, { reference, camera, origin, nodes:native.nodes, glyphs });
    assert.equal(regions.length,98); assert.ok(regions.every(r=>r.rectangle.width>0&&r.rectangle.height>0));
    await mkdir(path.join(output,'crops'),{recursive:true});
    for (const mode of derivation.variants) {
      const derived=await readFile(path.join(output,mode.svg),'utf8');
      for (const frame of ['natural','expanded']) for (const scale of [1,4]) for (const background of ['transparent','white','black']) {
        const result=await renderer.page.evaluate(async ({reference,derived,camera,origin,frame,scale,background,regions,repeat})=>{
          const width=camera.width*scale,height=camera.height*scale;
          const make=(w=width,h=height)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
          const png=c=>c.toDataURL('image/png').split(',')[1];
          function dimension(text){const m=/^([-\d.e+]+)(px|pt)$/.exec(text??'');if(!m)throw new Error('Unknown SVG dimension.');return Number(m[1])*(m[2]==='pt'?4/3:1);}
          async function render(text,isReference){
            const doc=new DOMParser().parseFromString(text,'image/svg+xml');
            if(doc.querySelector('parsererror')||doc.doctype||doc.documentElement.localName!=='svg')throw new Error('Invalid SVG.');
            for(const e of doc.querySelectorAll('*')){
              if(!['svg','g','defs','path','clipPath','use','title','desc'].includes(e.localName))throw new Error('Unknown SVG element.');
              for(const a of e.attributes)if(a.name.startsWith('on')||(a.localName==='href'&&!a.value.startsWith('#'))
                ||(a.value.includes('url(')&&!/^url\(#[\w.-]+\)$/.test(a.value)))throw new Error('External or executable SVG reference.');
            }
            const svg=doc.documentElement,v=svg.getAttribute('viewBox').split(/[ ,]+/).map(Number);
            if(v.length!==4||!v.every(Number.isFinite)||v[2]<=0||v[3]<=0)throw new Error('Invalid root frame.');
            const natural={x:isReference?(v[0]-origin.x)*4/3:v[0],y:isReference?(v[1]-origin.y)*4/3:v[1],
              width:dimension(svg.getAttribute('width')),height:dimension(svg.getAttribute('height'))};
            if(frame==='expanded'){
              if(isReference){const g=doc.createElementNS('http://www.w3.org/2000/svg','g');g.setAttribute('transform',`matrix(${4/3} 0 0 ${4/3} ${-origin.x*4/3} ${-origin.y*4/3})`);while(svg.firstChild)g.append(svg.firstChild);svg.append(g);}
              svg.setAttribute('width',width+'px');svg.setAttribute('height',height+'px');svg.setAttribute('viewBox',`${camera.x} ${camera.y} ${camera.width} ${camera.height}`);
            }
            const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
            try{const image=new Image();image.src=url;await image.decode();const canvas=make(),ctx=canvas.getContext('2d');
              if(background!=='transparent'){ctx.fillStyle=background;ctx.fillRect(0,0,width,height);}
              if(frame==='expanded')ctx.drawImage(image,0,0);else ctx.drawImage(image,(natural.x-camera.x)*scale,(natural.y-camera.y)*scale,natural.width*scale,natural.height*scale);
              return{canvas,natural,data:ctx.getImageData(0,0,width,height).data};
            }finally{URL.revokeObjectURL(url);}
          }
          const original=await render(reference,true),native=await render(derived,false);
          const channel=(p,i,c)=>c===3?p[i+3]:Math.round(p[i+c]*p[i+3]/255);
          const visible=(p,i)=>background==='transparent'?p[i+3]>0:background==='white'?Math.min(p[i],p[i+1],p[i+2])<255:Math.max(p[i],p[i+1],p[i+2])>0;
          function metrics(a,b,box){
            let max=0,sum=0,changed=0,foreground=0,rawChanged=0,rawMax=0;
            for(let y=box.y;y<box.y+box.height;y++)for(let x=box.x;x<box.x+box.width;x++){
              const i=4*(y*width+x);let error=0,raw=0;
              for(let c=0;c<4;c++){const d=Math.abs(channel(a,i,c)-channel(b,i,c));max=Math.max(max,d);sum+=d;error=Math.max(error,d);raw=Math.max(raw,Math.abs(a[i+c]-b[i+c]));}
              changed+=error!==0;rawChanged+=raw!==0;rawMax=Math.max(rawMax,raw);foreground+=visible(a,i)||visible(b,i);
            }
            return{exactRgbaMatch:rawChanged===0,rawChangedPixels:rawChanged,maxRawChannelError:rawMax,premultipliedChangedPixels:changed,
              maxPremultipliedChannelError:max,foregroundPixels:foreground,meanForegroundChannelError:foreground?sum/(4*foreground):0};
          }
          const whole={x:0,y:0,width,height},difference=make(),alphaDifference=make(),amplified=make(),overlay=make();
          const diff=difference.getContext('2d').createImageData(width,height),alpha=alphaDifference.getContext('2d').createImageData(width,height),amp=amplified.getContext('2d').createImageData(width,height),over=overlay.getContext('2d').createImageData(width,height);
          for(let i=0;i<original.data.length;i+=4){let max=0;for(let c=0;c<4;c++){const d=Math.abs(channel(original.data,i,c)-channel(native.data,i,c));max=Math.max(max,d);if(c<3)diff.data[i+c]=d;}
            diff.data[i+3]=255;amp.data[i]=255;amp.data[i+1]=amp.data[i+2]=255-Math.min(255,max*16);amp.data[i+3]=255;
            alpha.data[i]=alpha.data[i+1]=alpha.data[i+2]=Math.abs(original.data[i+3]-native.data[i+3]);alpha.data[i+3]=255;
            for(let c=0;c<3;c++)over.data[i+c]=Math.round((original.data[i+c]+native.data[i+c])/2);over.data[i+3]=Math.round((original.data[i+3]+native.data[i+3])/2);}
          difference.getContext('2d').putImageData(diff,0,0);alphaDifference.getContext('2d').putImageData(alpha,0,0);amplified.getContext('2d').putImageData(amp,0,0);overlay.getContext('2d').putImageData(over,0,0);
          const local=regions.map(r=>({...r,...metrics(original.data,native.data,{x:r.rectangle.x*scale,y:r.rectangle.y*scale,width:r.rectangle.width*scale,height:r.rectangle.height*scale})}));
          const files={reference:png(original.canvas),derived:png(native.canvas),difference:png(difference),'alpha-difference':png(alphaDifference),amplified:png(amplified),overlay:png(overlay)};
          if(background==='white'&&scale===1){const c=make(3*width,height+28),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='16px sans-serif';
            [[original.canvas,'Original oracle'],[native.canvas,'Oracle reconstruction'],[amplified,'Difference ×16']].forEach(([image,label],i)=>{ctx.fillText(label,i*width+8,20);ctx.drawImage(image,i*width,28);});files.comparison=png(c);}
          const crops=local.slice().sort((a,b)=>b.rawChangedPixels-a.rawChangedPixels||a.id.localeCompare(b.id)).slice(0,4).map(r=>{
            const{x,y,width:w,height:h}=r.rectangle,panel=Math.max(w*scale,135),c=make(3*panel,h*scale+50),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='14px sans-serif';ctx.fillText(r.id,6,18);
            [[original.canvas,'original'],[native.canvas,'reconstructed'],[amplified,'difference ×16']].forEach(([image,label],i)=>{ctx.fillText(label,i*panel+6,40);ctx.drawImage(image,x*scale,y*scale,w*scale,h*scale,i*panel+(panel-w*scale)/2,50,w*scale,h*scale);});return{id:r.id,png:png(c)};});
          const unchanged=repeat?await render(reference,true):null;
          return{files,crops,regions:local,metrics:metrics(original.data,native.data,whole),repeat:unchanged?metrics(original.data,unchanged.data,whole):null,
            naturalFrames:{reference:original.natural,derived:native.natural}};
        }, {reference,derived,camera,origin,frame,scale,background,regions,repeat:mode.mode==='driver-css'});
        const prefix=`${mode.mode}-${frame}-${scale}x-${background}`;
        for(const[name,png]of Object.entries(result.files)){const file=`${prefix}-${name}.png`,bytes=Buffer.from(png,'base64');await writeFile(path.join(output,file),bytes);assets[file]=sha256(bytes);}
        const cropPaths={};for(const crop of result.crops){const file=`crops/${prefix}-${crop.id}.png`,bytes=Buffer.from(crop.png,'base64');await writeFile(path.join(output,file),bytes);assets[file]=sha256(bytes);cropPaths[crop.id]=file;}
        measurements.push({mode:mode.mode,frame,scale,background,...result.metrics,naturalFrames:result.naturalFrames});
        allRegions.push(...result.regions.map(r=>({...r,mode:mode.mode,frame,scale,background,crop:cropPaths[r.id]??null})));
        if(result.repeat){assert.equal(result.repeat.exactRgbaMatch,true,'Unchanged oracle rendering is not repeatable.');repeats.push({frame,scale,background,...result.repeat});}
      }
      console.log('Oracle-only measurements complete: '+mode.mode);
    }
    assert.equal(measurements.length,60);assert.equal(allRegions.length,5880);assert.equal(repeats.length,12);
    await validateEvidence();
    const report={schemaVersion:1,comparisonKind:'oracle-only-shape-calibration',completed:true,verdict:'pending',converterInvoked:false,conformanceClaim:false,approvedImagePolicy:false,
      generatedUtc:new Date().toISOString(),scope:'Five independent representations of one trusted native circle/ellipse corpus; original driver output retained. Measurements are observations, not candidate thresholds.',
      differenceConvention:'Difference PNG: absolute premultiplied RGB. Alpha-difference PNG: absolute alpha in grayscale. Amplified PNG: maximum of all four channel differences ×16. Exact equality uses unmodified RGBA samples.',
      derivation:{path:'derivation.json',sha256:sha256(derivationBytes)},toolHashes,renderer:renderer.identity,camera,origin,
      measurements,regions:allRegions,repeatability:{passed:true,captures:repeats},artifacts:assets,
      remaining:['Independent root-crop/visible-ink containment and framing policy.','Relevant focused and interaction fixtures.',
        'Per-region edge/component gates and image-only defect controls, with numeric gates bypassed.','Ordinary PDF reference and separate cross-renderer calibration.','Reviewed shape-specific admission policy.']};
    await writeFile(path.join(output,'calibration.json'),JSON.stringify(report,null,2)+'\n');
    const contacts=derivation.variants.flatMap(v=>['natural','expanded'].map(f=>({mode:v.mode,frame:f,file:`${v.mode}-${f}-1x-white-comparison.png`})));
    const worst=allRegions.filter(r=>r.crop).sort((a,b)=>b.rawChangedPixels-a.rawChangedPixels||a.id.localeCompare(b.id)).slice(0,32);
    await writeFile(path.join(output,'calibration.html'),'<!doctype html><meta charset="utf-8"><title>Oracle-only shape calibration</title><h1>Oracle-only circle/ellipse calibration — admission pending</h1>'
      +'<p>No candidate invoked. Original outlined SVG compared with native PGF/DVI reconstructions; same pinned browser, fixed native camera.</p><p><a href="calibration.json">Measurements</a> · <a href="derivation.json">Independent reconstruction and provenance</a> · <a href="source.tikz">Source</a></p>'
      +contacts.map(c=>'<h2>'+c.mode+' · '+c.frame+'</h2><img style="max-width:100%" src="'+c.file+'">').join('')
      +'<h2>Largest native regional differences</h2><ul>'+worst.map(r=>'<li><a href="'+r.crop+'">'+r.id+' · '+r.mode+' · '+r.frame+' · '+r.scale+'x · '+r.background+'</a> · changed RGBA pixels '+r.rawChangedPixels+'</li>').join('')+'</ul>');
    console.log('Oracle-only shape calibration saved: 60 whole-picture and 5,880 local observations; 12 exact unchanged-pair repeats. No candidate conformance claim.');
  }finally{await renderer.browser.close();}
}
await main().catch(async error=>{
  console.error(error.stack??String(error));process.exitCode=2;
  // Never write a failure report through an unverified output symlink.
  let safe=true;for(let current=output;current!==root;current=path.dirname(current)){const stat=await lstat(current).catch(()=>null);safe&&=!stat?.isSymbolicLink();}
  if(safe){await mkdir(output,{recursive:true});await writeFile(path.join(output,'calibration.json'),JSON.stringify({schemaVersion:1,completed:false,verdict:'infrastructure-error',converterInvoked:false,conformanceClaim:false,error:error.message},null,2)+'\n');}
});
