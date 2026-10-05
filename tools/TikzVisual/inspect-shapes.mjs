import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer } from './compare.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'artifacts/node-shape-comparisons');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function main() {
  assert.equal(process.argv.length, 2, 'Usage: node tools/TikzVisual/inspect-shapes.mjs');
  await mkdir(output, { recursive: true });
  const command = ['run', '--project', 'tools/TikzShapeComparison', '-c', 'Release', '--', 'compare-numeric'];
  await new Promise((resolve, reject) => {
    const child = spawn('dotnet', command, { cwd: root, windowsHide: true, shell: false });
    let captured = '', settled = false;
    const timer = setTimeout(() => { settled = true; child.kill(); reject(new Error('Fresh numeric comparison timed out.')); }, 180000);
    const capture = bytes => {
      captured += bytes.toString();
      if (captured.length > 1048576 && !settled) { settled = true; clearTimeout(timer); child.kill(); reject(new Error('Numeric command output exceeded its limit.')); }
    };
    child.stdout.on('data', capture); child.stderr.on('data', capture);
    child.on('error', error => { clearTimeout(timer); if (!settled) { settled = true; reject(error); } });
    child.on('close', code => {
      clearTimeout(timer); if (settled) return; settled = true;
      process.stdout.write(captured);
      if (code === 0) resolve(); else reject(new Error('Required native numeric command failed, exit ' + code));
    });
  });
  const numericBytes = await readFile(path.join(output, 'report.json')), numeric = JSON.parse(numericBytes);
  assert.equal(numeric.comparisonKind, 'public-numeric-only'); assert.equal(numeric.completed, true);
  assert.equal(numeric.verdict, 'numeric-pass'); assert.equal(numeric.numeric.passed, true);
  assert.equal(numeric.imageConformanceClaim, false); assert.equal(numeric.overallVerdict, 'pending');
  const provenanceBytes = await readFile(path.join(output, numeric.provenance)), provenance = JSON.parse(provenanceBytes);
  assert.equal(sha256(provenanceBytes), numeric.provenanceSha256);
  for (const [file, hash] of Object.entries(provenance.artifacts)) {
    assert.ok(!path.isAbsolute(file) && !file.split(/[\\/]/).includes('..'), 'Invalid bundle artifact path.');
    assert.equal(sha256(await readFile(path.join(output, file))), hash, 'Changed numeric bundle artifact: ' + file);
  }
  const reference = await readFile(path.join(output, 'reference.svg'), 'utf8'), actual = await readFile(path.join(output, 'actual.svg'), 'utf8');
  const native = JSON.parse(await readFile(path.join(output, 'reference-metrics.json')));
  const scene = JSON.parse(await readFile(path.join(output, 'actual-scene.json')));
  const originMatch = reference.match(/<g stroke-miterlimit='10' transform='translate\(([-\d.]+),([-\d.]+)\)scale\(0\.996264,-0\.996264\)'>/);
  assert.ok(originMatch, 'Expected native driver origin is absent.');
  const origin = { x: Number(originMatch[1]), y: Number(originMatch[2]) };
  const bpToCss = 4/3, spToCss = 96/(72.27*65536), padding = 4, b = native.pictureBounds;
  const camera = { x: b.minXSp*spToCss-padding, y: -b.maxYSp*spToCss-padding,
    width: Math.ceil((b.maxXSp-b.minXSp)*spToCss+2*padding), height: Math.ceil((b.maxYSp-b.minYSp)*spToCss+2*padding),
    source: 'Independent native picture bounds plus four CSS pixels of inspection padding; never fitted to candidate content.' };
  const renderer = await createRenderer(), measurements = [], assets = {}, allRegions = [], regions = [];
  try {
    const fixedRegions = await renderer.page.evaluate(({ reference, camera, origin, nodes, sceneNodes, sceneGlyphs }) => {
      const doc = new DOMParser().parseFromString(reference, 'image/svg+xml'), svg = document.importNode(doc.documentElement, true);
      svg.setAttribute('width', camera.width); svg.setAttribute('height', camera.height);
      svg.setAttribute('viewBox', `${camera.x} ${camera.y} ${camera.width} ${camera.height}`);
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('transform', `matrix(${4/3} 0 0 ${4/3} ${-origin.x*4/3} ${-origin.y*4/3})`);
      while (svg.firstChild) group.append(svg.firstChild); svg.append(group);
      svg.style.position = 'absolute'; svg.style.left = '0'; svg.style.top = '0'; document.body.append(svg);
      try {
        const originals = [...svg.querySelectorAll('path')].filter(p => !p.closest('defs'));
        const glyphs = [...svg.querySelectorAll('use')];
        if (originals.length !== nodes.length || glyphs.length !== sceneGlyphs.length) throw new Error('Independent native region coverage differs.');
        const box = element => {
          const bbox = element.getBBox(), t = element.getCTM();
          if (!t) throw new Error('Missing native element frame.');
          const points = [[bbox.x,bbox.y],[bbox.x+bbox.width,bbox.y],[bbox.x,bbox.y+bbox.height],[bbox.x+bbox.width,bbox.y+bbox.height]]
            .map(([x,y]) => ({x:t.a*x+t.c*y+t.e,y:t.b*x+t.d*y+t.f}));
          const x = Math.max(0, Math.floor(Math.min(...points.map(p => p.x))-3));
          const y = Math.max(0, Math.floor(Math.min(...points.map(p => p.y))-3));
          return { x, y, width: Math.min(camera.width,Math.ceil(Math.max(...points.map(p => p.x))+3))-x,
            height: Math.min(camera.height,Math.ceil(Math.max(...points.map(p => p.y))+3))-y };
        };
        return [
          ...originals.map((p,i) => ({ id:'shape-'+nodes[i].id, nodeId:nodes[i].id, kind:'background',
            source:sceneNodes[i].source, semanticId:'path-'+i, svgElementId:'candidate-p'+i, rectangle:box(p) })),
          ...glyphs.map((g,i) => ({ id:'glyph-'+i, nodeId:nodes[sceneGlyphs[i].nodeId].id, kind:'glyph', source:sceneGlyphs[i].source,
            semanticId:sceneGlyphs[i].semanticId, svgElementId:sceneGlyphs[i].svgElementId, rectangle:box(g) }))
        ];
      } finally { svg.remove(); }
    }, { reference, camera, origin, nodes:native.nodes, sceneNodes:scene.nodes, sceneGlyphs:scene.glyphs });
    assert.equal(fixedRegions.length, 98); assert.ok(fixedRegions.every(r => r.rectangle.width > 0 && r.rectangle.height > 0));
    regions.push(...fixedRegions);
    await mkdir(path.join(output, 'crops'), { recursive: true });
    for (const variant of ['natural','expanded']) for (const scale of [1,4]) for (const background of ['transparent','white','black']) {
      const result = await renderer.page.evaluate(async ({ reference, actual, camera, origin, variant, scale, background, regions }) => {
        const width = camera.width*scale, height = camera.height*scale;
        const make = (w=width,h=height) => { const c=document.createElement('canvas'); c.width=w; c.height=h; return c; };
        const png = c => c.toDataURL('image/png').split(',')[1];
        const cssDimension = text => {
          const m = /^([-\d.]+)(px|pt)$/.exec(text ?? '');
          if (!m) throw new Error('Unknown SVG dimension.'); return Number(m[1])*(m[2]==='pt'?4/3:1);
        };
        async function render(text,isReference) {
          const doc=new DOMParser().parseFromString(text,'image/svg+xml');
          if (doc.querySelector('parsererror') || doc.doctype || doc.documentElement.localName!=='svg') throw new Error('Invalid SVG.');
          for (const e of doc.querySelectorAll('*')) {
            if (!['svg','g','defs','path','clipPath','use','title','desc'].includes(e.localName)) throw new Error('Unsupported SVG element.');
            for (const a of e.attributes) if (a.name.startsWith('on') || (a.localName==='href' && !a.value.startsWith('#'))
              || (a.value.includes('url(') && !/^url\(#[\w.-]+\)$/.test(a.value))) throw new Error('External or executable SVG reference.');
          }
          const svg=doc.documentElement, viewBox=svg.getAttribute('viewBox').split(/[ ,]+/).map(Number);
          if (viewBox.length!==4 || !viewBox.every(Number.isFinite) || viewBox[2]<=0 || viewBox[3]<=0) throw new Error('Invalid SVG viewBox.');
          const natural={x:isReference?(viewBox[0]-origin.x)*4/3:viewBox[0], y:isReference?(viewBox[1]-origin.y)*4/3:viewBox[1],
            width:cssDimension(svg.getAttribute('width')),height:cssDimension(svg.getAttribute('height'))};
          if (variant==='expanded') {
            if (isReference) {
              const g=doc.createElementNS('http://www.w3.org/2000/svg','g');
              g.setAttribute('transform',`matrix(${4/3} 0 0 ${4/3} ${-origin.x*4/3} ${-origin.y*4/3})`);
              while (svg.firstChild) g.append(svg.firstChild); svg.append(g);
            }
            svg.setAttribute('width',width+'px'); svg.setAttribute('height',height+'px');
            svg.setAttribute('viewBox',`${camera.x} ${camera.y} ${camera.width} ${camera.height}`);
          }
          const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
          try {
            const image=new Image(); image.src=url; await image.decode(); const c=make(),ctx=c.getContext('2d');
            if(background!=='transparent'){ctx.fillStyle=background;ctx.fillRect(0,0,width,height);}
            if(variant==='expanded')ctx.drawImage(image,0,0);
            else ctx.drawImage(image,(natural.x-camera.x)*scale,(natural.y-camera.y)*scale,natural.width*scale,natural.height*scale);
            return {canvas:c,natural};
          }finally{URL.revokeObjectURL(url);}
        }
        const r=await render(reference,true),a=await render(actual,false);
        const rd=r.canvas.getContext('2d').getImageData(0,0,width,height).data,ad=a.canvas.getContext('2d').getImageData(0,0,width,height).data;
        const diff=make(), amplified=make(), overlay=make();
        const dd=diff.getContext('2d').createImageData(width,height), amp=amplified.getContext('2d').createImageData(width,height), over=overlay.getContext('2d').createImageData(width,height);
        const channel=(p,i,c)=>c===3?p[i+3]:Math.round(p[i+c]*p[i+3]/255);
        const visible=(p,i)=>background==='transparent'?p[i+3]>0:background==='white'?Math.min(p[i],p[i+1],p[i+2])<255:Math.max(p[i],p[i+1],p[i+2])>0;
        function metrics(box) {
          let max=0,sum=0,changed=0,foreground=0;
          for(let y=box.y;y<box.y+box.height;y++)for(let x=box.x;x<box.x+box.width;x++){
            const i=4*(y*width+x); let error=0;
            for(let c=0;c<4;c++){const delta=Math.abs(channel(rd,i,c)-channel(ad,i,c));max=Math.max(max,delta);sum+=delta;error=Math.max(error,delta);}
            changed+=error!==0;foreground+=visible(rd,i)||visible(ad,i);
          }
          return {exactMatch:changed===0,changedPixels:changed,maxChannelError:max,foregroundPixels:foreground,meanForegroundChannelError:foreground?sum/(4*foreground):0};
        }
        for(let i=0;i<rd.length;i+=4){let max=0;for(let c=0;c<4;c++){const delta=Math.abs(channel(rd,i,c)-channel(ad,i,c));max=Math.max(max,delta);if(c<3)dd.data[i+c]=delta;}
          dd.data[i+3]=255;amp.data[i]=255;amp.data[i+1]=amp.data[i+2]=255-Math.min(255,max*16);amp.data[i+3]=255;
          for(let c=0;c<3;c++)over.data[i+c]=Math.round((rd[i+c]+ad[i+c])/2);over.data[i+3]=Math.round((rd[i+3]+ad[i+3])/2);}
        diff.getContext('2d').putImageData(dd,0,0);amplified.getContext('2d').putImageData(amp,0,0);overlay.getContext('2d').putImageData(over,0,0);
        const regionMetrics=regions.map(region=>({...region,...metrics({x:region.rectangle.x*scale,y:region.rectangle.y*scale,width:region.rectangle.width*scale,height:region.rectangle.height*scale})}));
        const files={reference:png(r.canvas),actual:png(a.canvas),difference:png(diff),amplified:png(amplified),overlay:png(overlay)};
        if(background==='white'&&scale===1){const c=make(3*width,height+28),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='16px sans-serif';
          [[r.canvas,'Native SVG'],[a.canvas,'Candidate SVG'],[amplified,'Difference ×16']].forEach(([image,label],i)=>{ctx.fillText(label,i*width+8,20);ctx.drawImage(image,i*width,28);});files.comparison=png(c);}
        const crops=regionMetrics.slice().sort((x,y)=>y.changedPixels-x.changedPixels||x.id.localeCompare(y.id)).slice(0,8).map(region=>{
          const {x,y,width:w,height:h}=region.rectangle,panel=Math.max(w*scale,110),c=make(3*panel,h*scale+50),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='14px sans-serif';ctx.fillText(region.id,6,18);
          [[r.canvas,'native'],[a.canvas,'candidate'],[amplified,'difference ×16']].forEach(([image,label],i)=>{ctx.fillText(label,i*panel+6,40);ctx.drawImage(image,x*scale,y*scale,w*scale,h*scale,i*panel+(panel-w*scale)/2,50,w*scale,h*scale);});return{id:region.id,png:png(c)};});
        return {files,crops,regions:regionMetrics,metrics:metrics({x:0,y:0,width,height}),naturalFrames:{reference:r.natural,actual:a.natural}};
      }, { reference,actual,camera,origin,variant,scale,background,regions });
      const prefix=`${variant}-${scale}x-${background}`;
      for(const [name,png] of Object.entries(result.files)){const file=`${prefix}-${name}.png`,bytes=Buffer.from(png,'base64');await writeFile(path.join(output,file),bytes);assets[file]=sha256(bytes);}
      const cropPaths={};
      for(const crop of result.crops){const file=`crops/${prefix}-${crop.id}.png`,bytes=Buffer.from(crop.png,'base64');await writeFile(path.join(output,file),bytes);assets[file]=sha256(bytes);cropPaths[crop.id]=file;}
      measurements.push({variant,scale,background,...result.metrics,naturalFrames:result.naturalFrames});
      allRegions.push(...result.regions.map(r=>({...r,variant,scale,background,crop:cropPaths[r.id]??null})));
    }
    const report={schemaVersion:1,comparisonKind:'shape-inspection',completed:true,verdict:'pending',approvedImagePolicy:false,imageConformanceClaim:false,
      notes:['Fresh native numeric gate required. Raster differences are observations, with no acceptance limits.',
        'Natural variant preserves original root cropping. Expanded variant removes root cropping for diagnosis only.',
        'All regions derive from original native outlines; source attribution uses verified node/glyph order, and is not a causal diagnosis.',
        'Eight worst paired crops retained per variant/scale/background. All 98 regional measurements remain available.'],
      numeric:{report:'report.json',sha256:sha256(numericBytes),checks:numeric.numeric.checks.length},provenance:{path:numeric.provenance,sha256:numeric.provenanceSha256},
      renderer:renderer.identity,toolSha256:sha256(await readFile(fileURLToPath(import.meta.url))),camera,origin,measurements,regions:allRegions,artifacts:assets,
      primary:{state:'pending',reason:'Independent precision calibration and image-only defect controls remain required.'},pdf:{state:'pending',reason:'Ordinary PDF reference and calibration remain required.'}};
    await writeFile(path.join(output,'inspection.json'),JSON.stringify(report,null,2)+'\n');
    const worst=allRegions.filter(r=>r.crop).sort((a,b)=>b.changedPixels-a.changedPixels||a.id.localeCompare(b.id)).slice(0,32);
    await writeFile(path.join(output,'inspection.html'),'<!doctype html><meta charset="utf-8"><title>Shape inspection</title><h1>Circle/ellipse inspection — image/PDF gates pending</h1>'
      +'<p>Fixed native camera; 1x/4x; transparent/white/black; original and expanded root frames. Numeric checks: '+numeric.numeric.checks.length+'.</p>'
      +'<p><a href="inspection.json">Image measurements and provenance</a> · <a href="report.json">Native numeric checks</a> · <a href="actual-scene.json">Candidate source trace</a></p>'
      +'<h2>Original root frames</h2><img style="max-width:100%" src="natural-1x-white-comparison.png"><h2>Expanded inspection frames</h2><img style="max-width:100%" src="expanded-1x-white-comparison.png">'
      +'<h2>Largest regional differences</h2><ul>'+worst.map(r=>'<li><a href="'+r.crop+'">'+r.id+' · '+r.variant+' · '+r.scale+'x · '+r.background+'</a> · source '+r.source.line+':'+r.source.column+' · changed pixels '+r.changedPixels+'</li>').join('')+'</ul>');
    console.log('Shape inspection saved: 12 whole-picture measurements, '+allRegions.length+' native regions; no image-conformance claim.');
  }finally{await renderer.browser.close();}
}
await main().catch(async error=>{console.error(error.stack??String(error));process.exitCode=2;await writeFile(path.join(output,'inspection.json'),JSON.stringify({schemaVersion:1,completed:false,verdict:'infrastructure-error',imageConformanceClaim:false,error:error.message},null,2)+'\n');});
