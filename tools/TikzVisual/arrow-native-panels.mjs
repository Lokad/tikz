// Verify presentation pixels from saved full rasters, not from SVG rerendering.
import assert from 'node:assert/strict';
export async function checkArrowNativePanels(renderer,observation,read,frame){
 const primary=observation.route===undefined,files=new Set(Object.values(observation.images));
 for(const c of observation.crops)for(const f of Object.values(c.images))files.add(f);
 if(!primary)files.add(observation.pdfPage);
 const bytes=Object.fromEntries(await Promise.all([...files].map(async file=>[file,'data:image/png;base64,'+(await read(file)).toString('base64')])));
 const count=await renderer.page.evaluate(async({o,bytes,primary,frame})=>{
  const fail=message=>{throw Error(message);},make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  const canvases={};for(const[file,url]of Object.entries(bytes)){const image=new Image();image.src=url;await image.decode();const c=make(image.width,image.height);c.getContext('2d').drawImage(image,0,0);canvases[file]=c;}
  const samples=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data;
  let checked=0;const compare=(file,expected)=>{const actual=canvases[file];if(!actual||actual.width!==expected.width||actual.height!==expected.height)fail('Panel dimensions: '+file);
   const a=samples(actual),b=samples(expected);for(let i=0;i<a.length;i++)if(a[i]!==b[i])fail('Panel pixels: '+file+' at channel '+i);checked++;};
  const crop=(source,q,enlargement=1)=>{const c=make(q.width*enlargement,q.height*enlargement),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.imageSmoothingEnabled=false;
   ctx.drawImage(source,q.x,q.y,q.width,q.height,0,0,c.width,c.height);return c;};
  const left=canvases[primary?o.images.reference:o.pdfPage],right=canvases[primary?o.images.actual:o.images['svg-page']];
  const width=primary?frame.camera.width*o.scale:o.pageSize.width,height=primary?frame.camera.height*o.scale:o.pageSize.height;
  if(left.width!==width||left.height!==height||right.width!==width||right.height!==height)fail('Changed full raster size.');
  const a=samples(left),b=samples(right),difference=make(width,height),amplified=make(width,height),overlay=make(width,height),alpha=make(width,height);
  const d=difference.getContext('2d').createImageData(width,height),amp=amplified.getContext('2d').createImageData(width,height),mix=overlay.getContext('2d').createImageData(width,height),al=alpha.getContext('2d').createImageData(width,height);
  for(let i=0;i<a.length;i+=4){let maximum=0;for(let k=0;k<4;k++){const error=Math.abs(a[i+k]-b[i+k]);maximum=Math.max(maximum,error);
    if(k<3)d.data[i+k]=error;mix.data[i+k]=Math.round((a[i+k]+b[i+k])/2);}
   d.data[i+3]=255;amp.data[i]=255;amp.data[i+1]=amp.data[i+2]=255-Math.min(255,16*maximum);amp.data[i+3]=255;
   al.data[i]=al.data[i+1]=al.data[i+2]=Math.abs(a[i+3]-b[i+3]);al.data[i+3]=255;if(!primary)mix.data[i+3]=255;
  }
  for(const[c,data]of[[difference,d],[amplified,amp],[overlay,mix],[alpha,al]])c.getContext('2d').putImageData(data,0,0);
  const panels={reference:left,actual:right,pdf:left,svg:right,difference,amplified,overlay,'alpha-difference':alpha};
  const sheet=(parts,q,enlargement,pdf=false,id=null)=>{
   const w=q.width*enlargement,h=q.height*enlargement,panel=Math.max(160,w),c=make(3*panel,h+50),ctx=c.getContext('2d');
   ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='14px sans-serif';ctx.imageSmoothingEnabled=false;
   ctx.fillText(pdf?'whole-picture / '+o.scale+'x / enlargement '+enlargement+'x':id+' · integer enlargement ×'+enlargement,6,18);
   const labels=pdf?['Ordinary PDF',o.route==='original-driver'?'Original TikZ SVG':'Native '+o.route,'Raw difference x16']:['reference',o.variant,'raw difference ×16'];
   parts.forEach((image,i)=>{ctx.fillText(labels[i],i*panel+6,40);ctx.drawImage(image,q.x,q.y,q.width,q.height,i*panel+(panel-w)/2,50,w,h);});return c;
  };
  if(primary){
   for(const key of['difference','alpha-difference','amplified','overlay'])compare(o.images[key],panels[key]);
   if(o.images.comparison){const c=make(3*width,height+48),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='12px sans-serif';
    [left,right,amplified].forEach((image,i)=>{['TikZ SVG',o.variant,'Raw difference\nAmplified ×16'][i].split('\n').forEach((line,j)=>ctx.fillText(line,i*width+4,16+j*16));ctx.drawImage(image,i*width,48);});compare(o.images.comparison,c);}
   for(const region of o.crops){const q=region.presentation.rasterRectangle,e=region.presentation.integerEnlargement;
    for(const key of['reference','actual','difference','amplified'])compare(region.images[key],crop(panels[key],q,e));
    compare(region.images.sheet,sheet([left,right,amplified],q,e,false,region.id));
   }
  }else{
   const q=o.whole.rasterRectangles[o.scale+'x'];for(const key of['pdf','svg','difference','amplified','overlay'])compare(o.images[key],crop(panels[key],q));
   if(o.images.sheet)compare(o.images.sheet,sheet([left,right,amplified],q,1,true));
  }
  return checked;
 },{o:observation,bytes,primary,frame});
 assert.ok(Number.isSafeInteger(count)&&count>0);return count;
}
