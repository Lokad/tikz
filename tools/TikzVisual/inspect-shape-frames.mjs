import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRenderer } from './compare.mjs';
import { root,sha256,readFreshOracle,writeArtifact } from './shape-oracle-bundle.mjs';
import { multiply,parseTransform,parsePath,transformPoint,transformSegments,pathBounds,pathData,closedCurveStrokeBounds,unionBounds,containment } from './shape-frame-math.mjs';

const output=process.argv.length===4&&process.argv[2]==='--out'?path.resolve(root,process.argv[3]):path.join(root,'artifacts/node-shape-frames');
const tools=['tools/TikzVisual/inspect-shape-frames.mjs','tools/TikzVisual/shape-frame-math.mjs','tools/TikzVisual/shape-oracle-bundle.mjs','tools/TikzVisual/compare.mjs','tools/TikzVisual/browser-profile.json'];
const spToCss=96/(72.27*65536);
async function main(){
  assert.ok(process.argv.length===2||(process.argv.length===4&&process.argv[2]==='--out'),'Usage: node tools/TikzVisual/inspect-shape-frames.mjs [--out artifacts/...]');
  const toolHashes=Object.fromEntries(await Promise.all(tools.map(async file=>[file,sha256(await readFile(path.join(root,file)))])));
  const oracle=await readFreshOracle(output),{derivation}=oracle;
  const reference=await readFile(path.join(output,'reference.svg'),'utf8'),nativeSvg=await readFile(path.join(output,'native-css-12.svg'),'utf8');
  const native=JSON.parse(await readFile(path.join(output,'metrics.json'))),glyphs=JSON.parse(await readFile(path.join(output,'native-glyphs.json')));
  const renderer=await createRenderer(),assets={};
  try{
    const metadata=await renderer.page.evaluate(reference=>{
      const documentSvg=new DOMParser().parseFromString(reference,'image/svg+xml');
      if(documentSvg.querySelector('parsererror')||documentSvg.querySelector('clipPath'))throw new Error('Invalid or out-of-scope original SVG.');
      const svg=document.importNode(documentSvg.documentElement,true);document.body.append(svg);
      const inherited=(e,name,fallback)=>{for(let p=e;p;p=p.parentElement)if(p.hasAttribute(name))return p.getAttribute(name);return fallback;};
      const transforms=e=>{const result=[];for(let p=e;p&&p!==svg;p=p.parentElement)if(p.hasAttribute('transform'))result.unshift(p.getAttribute('transform'));return result;};
      const bbox=e=>{const b=e.getBBox();return{minX:b.x,minY:b.y,maxX:b.x+b.width,maxY:b.y+b.height};};
      try{return{
        definitions:[...svg.querySelectorAll('defs path')].map(p=>({id:p.id,d:p.getAttribute('d'),browserBounds:bbox(p)})),
        paths:[...svg.querySelectorAll('path')].filter(p=>!p.closest('defs')).map(p=>({d:p.getAttribute('d'),transforms:transforms(p),fill:inherited(p,'fill','black'),stroke:inherited(p,'stroke','none'),
          width:Number(inherited(p,'stroke-width','1')),join:inherited(p,'stroke-linejoin','miter'),cap:inherited(p,'stroke-linecap','butt'),miter:Number(inherited(p,'stroke-miterlimit','4'))})),
        uses:[...svg.querySelectorAll('use')].map(u=>({href:[...u.attributes].find(a=>a.localName==='href').value,x:Number(u.getAttribute('x')??0),y:Number(u.getAttribute('y')??0),
          transforms:transforms(u),fill:inherited(u,'fill','black'),stroke:inherited(u,'stroke','none')}))};
      }finally{svg.remove();}
    },reference);
    assert.equal(metadata.paths.length,28);assert.equal(metadata.uses.length,70);
    const normalize=[4/3,0,0,4/3,-derivation.originBp.x*4/3,-derivation.originBp.y*4/3];
    const cumulative=transforms=>transforms.reduce((matrix,text)=>multiply(matrix,parseTransform(text)),normalize);
    const definitions=new Map(metadata.definitions.map(p=>[p.id,{...p,segments:parsePath(p.d)}]));
    const records=[],browserInputs=metadata.definitions.map(p=>({id:'outline-'+p.id,d:p.d,expected:pathBounds(parsePath(p.d))}));
    let useIndex=0;
    for(let i=0;i<native.nodes.length;i++){
      const n=native.nodes[i],p=metadata.paths[i];assert.equal(n.id,glyphs.nodes[i].id);
      assert.equal(p.fill,'none');assert.equal(p.stroke,'#000');assert.equal(p.cap,'butt');assert.equal(p.join,'miter');
      const data=n.path.map(t=>t.kind==='close'?'Z':(t.kind==='move'?'M':t.kind==='control1'?'C':'')+`${t.point.xSp*spToCss} ${-t.point.ySp*spToCss}`).join(' ');
      const nativeSegments=parsePath(data),nativeStroke=closedCurveStrokeBounds(nativeSegments,n.values.linewidth*spToCss,p.miter);
      const matrix=cumulative(p.transforms),driverSegments=transformSegments(parsePath(p.d),matrix),sx=Math.hypot(matrix[0],matrix[1]),sy=Math.hypot(matrix[2],matrix[3]);
      assert.ok(Math.abs(sx-sy)<1e-12&&Math.abs(matrix[0]*matrix[2]+matrix[1]*matrix[3])<1e-12,'Driver background pen must be uniform.');
      const driverStroke=closedCurveStrokeBounds(driverSegments,p.width*sx,p.miter);
      records.push({id:'shape-'+n.id,nodeId:n.id,kind:'background',native:nativeStroke.stroke,driver:driverStroke.stroke,
        evidence:{nativeGeometry:nativeStroke.geometry,driverGeometry:driverStroke.geometry,nativeRadius:nativeStroke.radius,driverRadius:driverStroke.radius,nativeJoins:nativeStroke.joins,driverJoins:driverStroke.joins}});
      browserInputs.push({id:'native-shape-'+n.id,d:pathData(nativeSegments),expected:nativeStroke.geometry},{id:'driver-shape-'+n.id,d:pathData(driverSegments),expected:driverStroke.geometry});
      const f=n.frame;
      for(let j=0;j<glyphs.nodes[i].glyphs.length;j++){
        const g=glyphs.nodes[i].glyphs[j],use=metadata.uses[useIndex],outline=definitions.get(use.href.slice(1));assert.ok(outline,'Missing original glyph outline.');
        assert.equal(use.fill,'#000');assert.equal(use.stroke,'none');assert.equal(Number(use.href.split('-').at(-1)),g.slot);
        const driverMatrix=multiply(cumulative(use.transforms),[1,0,0,1,use.x,use.y]);
        const nativeMatrix=[f.a*4/3,-f.b*4/3,-f.c*4/3,f.d*4/3,(f.eSp+f.a*g.xSp-f.c*g.ySp)*spToCss,-(f.fSp+f.b*g.xSp-f.d*g.ySp)*spToCss];
        const nativeSegments=transformSegments(outline.segments,nativeMatrix),driverSegments=transformSegments(outline.segments,driverMatrix),local=pathBounds(outline.segments);
        const corners=[[local.minX,local.minY],[local.maxX,local.minY],[local.minX,local.maxY],[local.maxX,local.maxY]].map(([x,y])=>transformPoint(nativeMatrix,{x,y}));
        const transformedBox=unionBounds(corners.map(p=>({minX:p.x,minY:p.y,maxX:p.x,maxY:p.y})));
        const nativeBounds=pathBounds(nativeSegments),driverBounds=pathBounds(driverSegments);
        records.push({id:'glyph-'+useIndex,nodeId:n.id,kind:'glyph',glyphIndex:j,font:g.font,slot:g.slot,outline:use.href,native:nativeBounds,driver:driverBounds,
          evidence:{nativeMatrix,driverMatrix,transformedLocalBox:transformedBox,boxOverstatement:{left:nativeBounds.minX-transformedBox.minX,top:nativeBounds.minY-transformedBox.minY,right:transformedBox.maxX-nativeBounds.maxX,bottom:transformedBox.maxY-nativeBounds.maxY}}});
        browserInputs.push({id:'native-glyph-'+useIndex,d:pathData(nativeSegments),expected:nativeBounds},{id:'driver-glyph-'+useIndex,d:pathData(driverSegments),expected:driverBounds});useIndex++;
      }
    }
    assert.equal(records.length,98);assert.equal(useIndex,70);
    const nativeInk=unionBounds(records.map(r=>r.native)),driverInk=unionBounds(records.map(r=>r.driver)),b=native.pictureBounds,v=derivation.originalViewBoxBp,o=derivation.originBp;
    const picture={minX:b.minXSp*spToCss,minY:-b.maxYSp*spToCss,maxX:b.maxXSp*spToCss,maxY:-b.minYSp*spToCss};
    const driverRoot={minX:(v[0]-o.x)*4/3,minY:(v[1]-o.y)*4/3,maxX:(v[0]+v[2]-o.x)*4/3,maxY:(v[1]+v[3]-o.y)*4/3};
    const outward=b=>({minX:Math.floor(b.minX*1e6)/1e6,minY:Math.floor(b.minY*1e6)/1e6,maxX:Math.ceil(b.maxX*1e6)/1e6,maxY:Math.ceil(b.maxY*1e6)/1e6});
    const canonicalNative=outward(unionBounds([picture,nativeInk])),canonicalDriver=outward(unionBounds([driverRoot,driverInk]));
    const base=unionBounds([canonicalNative,canonicalDriver]),camera={x:base.minX-4,y:base.minY-4,width:Math.ceil(base.maxX-base.minX+8),height:Math.ceil(base.maxY-base.minY+8)};
    assert.ok(camera.width*camera.height*16<=20000000,'Frame-inspection canvas exceeds its bound.');
    const checks=records.map(r=>({...r,driverInOriginalRoot:containment(r.driver,driverRoot,1e-9),nativeInPicture:containment(r.native,picture,1e-9),nativeInDriverRoot:containment(r.native,driverRoot,1e-9),nativeInCanonical:containment(r.native,canonicalNative),driverInCanonical:containment(r.driver,canonicalDriver)}));
    assert.ok(checks.every(r=>r.nativeInCanonical.passed&&r.driverInCanonical.passed));
    const browserChecks=await renderer.page.evaluate(inputs=>{
      const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');document.body.append(svg);
      try{return inputs.map(input=>{const p=document.createElementNS(ns,'path');p.setAttribute('d',input.d);svg.append(p);const b=p.getBBox(),actual={minX:b.x,minY:b.y,maxX:b.x+b.width,maxY:b.y+b.height};p.remove();
        // In this pinned browser, the reported x/y/width/height values are
        // Float32-quantized. Validate this observation as well as the analytic
        // evaluator. The precision bound is not a conformance allowance.
        const bound=Math.max(1,...Object.values(input.expected).map(Math.abs))*Math.pow(2,-23)*4+1e-8;
        const deltas=Object.fromEntries(Object.keys(actual).map(k=>[k,Math.abs(actual[k]-input.expected[k])]));
        const rawRect={x:b.x,y:b.y,width:b.width,height:b.height},observedFloat32Quantization=Object.values(rawRect).every(v=>Math.fround(v)===v);
        return{id:input.id,expected:input.expected,actual,rawRect,observedFloat32Quantization,absoluteDeltas:deltas,domFloatPrecisionBound:bound,passed:observedFloat32Quantization&&Object.values(deltas).every(d=>d<=bound)};});
      }finally{svg.remove();}
    },browserInputs);
    assert.ok(browserChecks.every(c=>c.passed),'Independent curve extrema disagree with the SVG geometry API.');
    const regions=records.map(r=>{const b=unionBounds([r.native,r.driver]),x=Math.max(0,Math.floor(b.minX-camera.x-3)),y=Math.max(0,Math.floor(b.minY-camera.y-3));
      return{id:r.id,nodeId:r.nodeId,kind:r.kind,x,y,width:Math.min(camera.width,Math.ceil(b.maxX-camera.x+3))-x,height:Math.min(camera.height,Math.ceil(b.maxY-camera.y+3))-y};});
    const measurements=[];
    for(const family of ['driver','native'])for(const scale of [1,4])for(const background of ['transparent','white','black']){
      const clipFrame=family==='driver'?driverRoot:picture;
      const result=await renderer.page.evaluate(async({source,isDriver,origin,camera,clipFrame,clipLabel,scale,background,regions})=>{
        const ns='http://www.w3.org/2000/svg',width=camera.width*scale,height=camera.height*scale;
        const make=(w=width,h=height)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};const png=c=>c.toDataURL('image/png').split(',')[1];
        async function render(clipped){const doc=new DOMParser().parseFromString(source,'image/svg+xml'),svg=doc.documentElement;svg.setAttribute('width',width+'px');svg.setAttribute('height',height+'px');svg.setAttribute('viewBox',`${camera.x} ${camera.y} ${camera.width} ${camera.height}`);
          const graphics=doc.createElementNS(ns,'g');if(isDriver)graphics.setAttribute('transform',`matrix(${4/3} 0 0 ${4/3} ${-origin.x*4/3} ${-origin.y*4/3})`);
          while(svg.firstChild)graphics.append(svg.firstChild);
          const scope=doc.createElementNS(ns,'g');scope.append(graphics);svg.append(scope);
          if(clipped){const defs=doc.createElementNS(ns,'defs'),clip=doc.createElementNS(ns,'clipPath'),path=doc.createElementNS(ns,'path');clip.id='oracle-frame-clip';clip.setAttribute('clipPathUnits','userSpaceOnUse');
            const b=clipped==='wide'?{minX:camera.x-1,minY:camera.y-1,maxX:camera.x+camera.width+1,maxY:camera.y+camera.height+1}:clipFrame;
            path.setAttribute('d',`M${b.minX} ${b.minY}H${b.maxX}V${b.maxY}H${b.minX}Z`);clip.append(path);defs.append(clip);svg.prepend(defs);scope.setAttribute('clip-path','url(#oracle-frame-clip)');}
          const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
          try{const image=new Image();image.src=url;await image.decode();const c=make(),ctx=c.getContext('2d');if(background!=='transparent'){ctx.fillStyle=background;ctx.fillRect(0,0,width,height);}ctx.drawImage(image,0,0);return{canvas:c,data:ctx.getImageData(0,0,width,height).data};}finally{URL.revokeObjectURL(url);}
        }
        const clipped=await render(true),full=await render(false),wide=await render('wide'),repeated=await render(false),difference=make(),amplified=make();
        // Clip a copy of the already rasterized image. This diagnostic avoids
        // re-tessellating SVG content and is not a reference-engine rendering.
        function bitmapCopy(clip){const canvas=make(),ctx=canvas.getContext('2d');if(background!=='transparent'){ctx.fillStyle=background;ctx.fillRect(0,0,width,height);}
          if(clip){ctx.beginPath();ctx.rect((clipFrame.minX-camera.x)*scale,(clipFrame.minY-camera.y)*scale,(clipFrame.maxX-clipFrame.minX)*scale,(clipFrame.maxY-clipFrame.minY)*scale);ctx.clip();}
          ctx.drawImage(full.canvas,0,0);return{canvas,data:ctx.getImageData(0,0,width,height).data};}
        const bitmap=bitmapCopy(true),copied=bitmapCopy(false);
        const diff=difference.getContext('2d').createImageData(width,height),amp=amplified.getContext('2d').createImageData(width,height);
        const delta=(i,c)=>Math.abs(clipped.data[i+c]-full.data[i+c]);
        const pixelError=(data,i)=>Math.max(Math.abs(data[i]-full.data[i]),Math.abs(data[i+1]-full.data[i+1]),Math.abs(data[i+2]-full.data[i+2]),Math.abs(data[i+3]-full.data[i+3]));
        function metrics(box,data=clipped.data){let changed=0,max=0,outsideBoundary=0;for(let y=box.y;y<box.y+box.height;y++)for(let x=box.x;x<box.x+box.width;x++){
          const i=4*(y*width+x),d=pixelError(data,i);changed+=d!==0;max=Math.max(max,d);
          const px=camera.x+(x+.5)/scale,py=camera.y+(y+.5)/scale;
          if(d!==0&&Math.min(Math.abs(px-clipFrame.minX),Math.abs(px-clipFrame.maxX),Math.abs(py-clipFrame.minY),Math.abs(py-clipFrame.maxY))>2/scale)outsideBoundary++;
        }return{changedPixels:changed,maxRawChannelError:max,changedOutsideFrameBoundaryPixels:outsideBoundary,exactRgbaMatch:changed===0};}
        for(let i=0;i<clipped.data.length;i+=4){const d=Math.max(delta(i,0),delta(i,1),delta(i,2),delta(i,3));diff.data[i]=diff.data[i+1]=diff.data[i+2]=d;diff.data[i+3]=255;amp.data[i]=255;amp.data[i+1]=amp.data[i+2]=255-Math.min(255,d*16);amp.data[i+3]=255;}
        difference.getContext('2d').putImageData(diff,0,0);amplified.getContext('2d').putImageData(amp,0,0);
        const local=regions.map(r=>({...r,...metrics({x:r.x*scale,y:r.y*scale,width:r.width*scale,height:r.height*scale})}));
        const bitmapDifference=make(),bitmapAmplified=make(),bd=bitmapDifference.getContext('2d').createImageData(width,height),ba=bitmapAmplified.getContext('2d').createImageData(width,height);
        for(let i=0;i<full.data.length;i+=4){const d=pixelError(bitmap.data,i);bd.data[i]=bd.data[i+1]=bd.data[i+2]=d;bd.data[i+3]=255;ba.data[i]=255;ba.data[i+1]=ba.data[i+2]=255-Math.min(255,d*16);ba.data[i+3]=255;}
        bitmapDifference.getContext('2d').putImageData(bd,0,0);bitmapAmplified.getContext('2d').putImageData(ba,0,0);
        const files={clipped:png(clipped.canvas),full:png(full.canvas),difference:png(difference),amplified:png(amplified),'wide-clipped':png(wide.canvas),'bitmap-clipped':png(bitmap.canvas),'bitmap-difference':png(bitmapDifference),'bitmap-amplified':png(bitmapAmplified)};
        if(background==='white'&&scale===1){const c=make(width*3,height+28),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='16px sans-serif';
          [[clipped.canvas,clipLabel],[full.canvas,'Full independent ink'],[amplified,'Difference ×16']].forEach(([p,label],i)=>{ctx.fillText(label,i*width+8,20);ctx.drawImage(p,i*width,28);});files.comparison=png(c);}
        if(background==='white'&&scale===1){const c=make(width*3,height+28),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='16px sans-serif';
          [[bitmap.canvas,'Post-raster frame clip'],[full.canvas,'Full independent ink'],[bitmapAmplified,'Difference ×16']].forEach(([p,label],i)=>{ctx.fillText(label,i*width+8,20);ctx.drawImage(p,i*width,28);});files['bitmap-comparison']=png(c);}
        const crops=local.slice().sort((a,b)=>b.changedPixels-a.changedPixels||a.id.localeCompare(b.id)).slice(0,4).map(r=>{const panel=Math.max(r.width*scale,140),c=make(panel*3,r.height*scale+50),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='14px sans-serif';ctx.fillText(r.id,6,18);
          [[clipped.canvas,'clipped'],[full.canvas,'full ink'],[amplified,'difference ×16']].forEach(([p,label],i)=>{ctx.fillText(label,i*panel+6,40);ctx.drawImage(p,r.x*scale,r.y*scale,r.width*scale,r.height*scale,i*panel+(panel-r.width*scale)/2,50,r.width*scale,r.height*scale);});return{id:r.id,png:png(c)};});
        const whole={x:0,y:0,width,height};
        return{files,crops,regions:local,...metrics(whole),controls:{wideSvgClip:metrics(whole,wide.data),unchangedSvgRepeat:metrics(whole,repeated.data),unchangedBitmapCopy:metrics(whole,copied.data),postRasterClip:metrics(whole,bitmap.data)}};
      },{source:family==='driver'?reference:nativeSvg,isDriver:family==='driver',origin:derivation.originBp,camera,clipFrame,clipLabel:family==='driver'?'Original driver frame clip':'Native picture frame clip',scale,background,regions});
      const prefix=`${family}-${scale}x-${background}`;const links={};
      for(const[name,png]of Object.entries(result.files)){const file=`${prefix}-${name}.png`;await writeArtifact(output,file,Buffer.from(png,'base64'),assets);links[name]=file;}
      for(const crop of result.crops)await writeArtifact(output,`crops/${prefix}-${crop.id}.png`,Buffer.from(crop.png,'base64'),assets);
      assert.equal(result.controls.unchangedSvgRepeat.exactRgbaMatch,true,'Unchanged frame rendering differs.');assert.equal(result.controls.unchangedBitmapCopy.exactRgbaMatch,true,'Integer bitmap copy differs.');
      assert.equal(result.controls.postRasterClip.changedOutsideFrameBoundaryPixels,0,'Post-raster crop changed pixels away from the frame boundary.');
      measurements.push({family,scale,background,clipFrame,changedPixels:result.changedPixels,maxRawChannelError:result.maxRawChannelError,changedOutsideFrameBoundaryPixels:result.changedOutsideFrameBoundaryPixels,exactRgbaMatch:result.exactRgbaMatch,controls:result.controls,regions:result.regions,artifacts:links});
    }
    await oracle.verify();for(const[file,hash]of Object.entries(toolHashes))assert.equal(sha256(await readFile(path.join(root,file))),hash,'Frame tool changed: '+file);
    const report={schemaVersion:1,comparisonKind:'oracle-only-shape-framing',completed:true,verdict:'pending',converterInvoked:false,conformanceClaim:false,approvedImagePolicy:false,
      generatedUtc:new Date().toISOString(),units:'CSS pixels, global origin, y down; no candidate geometry',derivation:{path:'derivation.json',sha256:sha256(oracle.bytes)},toolHashes,renderer:renderer.identity,
      contract:'The independent semantic frame is the union of PGF picture bounds and transformed outline/stroke extents. The full-ink inspection frame is rounded outward at six CSS decimals. Candidate SVG serialization is checked separately; this experiment admits no image threshold.',
      frames:{picture,driverRoot,nativeInk,driverInk,canonicalNative,canonicalDriver},camera,checks,analyticBrowserValidation:{passed:true,checks:browserChecks},measurements,artifacts:assets,
      clipExperiment:'Matched expanded SVG root/camera; SVG clip and wide-clip controls expose changes in the rendering path. Post-raster clipping isolates bitmap boundary coverage and does not establish reference-engine clipping fidelity. Twelve unchanged SVG repeats and twelve integer bitmap copies must remain exact. Original natural images remain preserved in the separate representation calibration.',
      initialExperiment:'artifacts/node-shape-frames-initial-clip/ retains the first SVG-clip experiment and matching tool/source snapshots; changes far from the clip boundary cannot be interpreted as lost ink.',
      remaining:['Candidate ink/root comparison against this independent contract.','Focused/interaction coverage and image-only defect gates.','Ordinary PDF evidence and calibration.','Reviewed image admission policy.']};
    const html='<!doctype html><meta charset="utf-8"><title>Independent shape framing</title><h1>Independent circle/ellipse framing — admission pending</h1><p>No candidate invoked. Tight outline/curve extents and circular-pen stroke bounds from original native evidence.</p><p><a href="frames.json">Bounds, containment and clip measurements</a> · <a href="derivation.json">Independent provenance</a> · <a href="source.tikz">Source</a></p>'
      +['driver','native'].map(f=>'<h2>'+f+' frame clip versus full ink</h2><img style="max-width:100%" src="'+f+'-1x-white-comparison.png">').join('');
    const controlsHtml=['driver','native'].map(f=>'<h2>'+f+' post-raster boundary control</h2><img style="max-width:100%" src="'+f+'-1x-white-bitmap-comparison.png">').join('');
    await writeArtifact(output,'frames.html',html+controlsHtml,assets);await writeArtifact(output,'frames.json',JSON.stringify(report,null,2)+'\n');
    console.log('Independent shape framing: '+checks.length+' native/driver contributions, '+browserChecks.length+' analytic/browser checks, twelve matched-camera clip experiments. Image policy remains pending.');
    for(const field of ['driverInOriginalRoot','nativeInPicture','nativeInDriverRoot'])console.log(field+': '+checks.filter(c=>!c[field].passed).length+' outside; minimum margin '+Math.min(...checks.map(c=>c[field].minimumMargin))+' CSS px.');
  }finally{await renderer.browser.close();}
}
await main().catch(async error=>{console.error(error.stack??String(error));process.exitCode=2;try{await writeArtifact(output,'frames.json',JSON.stringify({schemaVersion:1,completed:false,verdict:'infrastructure-error',converterInvoked:false,conformanceClaim:false,error:error.message},null,2)+'\n');}catch{}});
