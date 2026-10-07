// Presentation must follow saved native-page pixels and recorded crop identities.
import assert from 'node:assert/strict';
export async function checkArrowPaperPanels(renderer,o,read,regions){
 const files=new Set([o.pdfPage,...Object.values(o.images),...o.crops.flatMap(c=>Object.values(c.images))]);
 const images=Object.fromEntries(await Promise.all([...files].map(async f=>[f,'data:image/png;base64,'+(await read(f)).toString('base64')])));
 const count=await renderer.page.evaluate(async({o,images,regions})=>{
  const fail=m=>{throw Error(m);},make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;},samples=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data;
  const canvases={};for(const[f,url]of Object.entries(images)){const im=new Image();im.src=url;await im.decode();const c=make(im.width,im.height);c.getContext('2d').drawImage(im,0,0);canvases[f]=c;}
  const left=canvases[o.pdfPage],right=canvases[o.images['svg-page']],size=o.pageSize;let checked=0;
  if(left.width!==size.width||left.height!==size.height||right.width!==size.width||right.height!==size.height)fail('Saved paper dimensions changed');
  const compare=(file,c)=>{const a=canvases[file];if(!a||a.width!==c.width||a.height!==c.height)fail('Paper panel dimensions changed: '+file);const x=samples(a),y=samples(c);
   for(let i=0;i<x.length;i++)if(x[i]!==y[i])fail('Paper panel pixels/labels changed: '+file);checked++;};
  const crop=(c,q,e=1)=>{const out=make(q.width*e,q.height*e),ctx=out.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,out.width,out.height);ctx.imageSmoothingEnabled=false;ctx.drawImage(c,q.x,q.y,q.width,q.height,0,0,out.width,out.height);return out;};
  const panel=(r,files,e)=>{const q=r.rasterRectangles[o.scale+'x'],a=crop(left,q),b=crop(right,q),x=samples(a),y=samples(b),d=make(q.width,q.height),amp=make(q.width,q.height),mix=make(q.width,q.height);
   const diff=d.getContext('2d').createImageData(q.width,q.height),amplified=amp.getContext('2d').createImageData(q.width,q.height),overlay=mix.getContext('2d').createImageData(q.width,q.height);
   for(let i=0;i<x.length;i+=4){let maximum=0;for(let k=0;k<4;k++){const error=Math.abs(x[i+k]-y[i+k]);maximum=Math.max(maximum,error);if(k<3){diff.data[i+k]=error;overlay.data[i+k]=Math.round((x[i+k]+y[i+k])/2);}}
    diff.data[i+3]=overlay.data[i+3]=amplified.data[i+3]=255;amplified.data[i]=255;amplified.data[i+1]=amplified.data[i+2]=255-Math.min(255,maximum*16);}
   for(const[c,data]of[[d,diff],[amp,amplified],[mix,overlay]])c.getContext('2d').putImageData(data,0,0);
   const parts={pdf:a,svg:b,difference:d,amplified:amp,overlay:mix};for(const[k,c]of Object.entries(parts))compare(files[k],crop(c,{x:0,y:0,width:q.width,height:q.height},e));
   if(files.sheet){const width=q.width*e,height=q.height*e,p=Math.max(160,width),c=make(3*p,height+50),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='14px sans-serif';ctx.imageSmoothingEnabled=false;
    ctx.fillText(r.id+' / '+o.scale+'x / enlargement '+e+'x',6,18);[a,b,amp].forEach((im,i)=>{ctx.fillText(['Ordinary PDF',o.rightLabel,'Raw difference x16'][i],i*p+6,40);ctx.drawImage(im,i*p+(p-width)/2,50,width,height);});compare(files.sheet,c);}
  };
  panel(regions[0],o.images,1);for(const c of o.crops)panel(regions.find(r=>r.id===c.id),c.images,o.scale===1?4:1);return checked;
 },{o,images,regions});assert.ok(count>0);return count;
}
