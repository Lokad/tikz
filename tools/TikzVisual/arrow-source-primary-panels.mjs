import assert from 'node:assert/strict';
import {checkArrowNativePanels} from './arrow-native-panels.mjs';

export function arrowSourcePrimaryLabels(view){
 return{referenceLabel:view.kind.startsWith('visibility-')?'Native control':'PGF SVG',
  rightLabel:view.kind==='defect'||view.kind==='visibility-missing'?'SVG fault':'Native SVG'};
}

export async function checkArrowSourcePrimaryPanels(renderer,record,read,frame){
 const images={...record.files.images},comparison=images.comparison;delete images.comparison;
 const labels=arrowSourcePrimaryLabels(record.view);
 let count=await checkArrowNativePanels(renderer,{...record.view,variant:labels.rightLabel,images,crops:record.files.crops},read,frame);
 if(comparison){
  const pngs=await Promise.all(['reference','actual','amplified'].map(async key=>'data:image/png;base64,'+(await read(images[key])).toString('base64')));
  pngs.push('data:image/png;base64,'+(await read(comparison)).toString('base64'));
  await renderer.page.evaluate(async({pngs,labels})=>{
   const images=[];for(const src of pngs){const image=new Image();image.src=src;await image.decode();images.push(image);}
   const width=images[0].width,height=images[0].height,c=document.createElement('canvas');c.width=3*width;c.height=height+48;
   const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='12px sans-serif';
   [labels.referenceLabel,labels.rightLabel,'Raw difference\nAmplified ×16'].forEach((text,i)=>{text.split('\n').forEach((line,j)=>ctx.fillText(line,i*width+4,16+j*16));ctx.drawImage(images[i],i*width,48);});
   if(images[3].width!==c.width||images[3].height!==c.height)throw Error('Source panel dimensions changed');
   const actual=document.createElement('canvas');actual.width=c.width;actual.height=c.height;const ac=actual.getContext('2d');ac.drawImage(images[3],0,0);
   const a=ac.getImageData(0,0,c.width,c.height).data,b=ctx.getImageData(0,0,c.width,c.height).data;
   for(let i=0;i<a.length;i++)if(a[i]!==b[i])throw Error('Source panel pixels or labels changed');
  },{pngs,labels});count++;
 }
 assert.ok(count>0);return count;
}

export function arrowSourcePrimaryIndex(model,records){
 return'<!doctype html><meta charset="utf-8"><title>Native stand-alone arrow source</title><style>body{font:16px sans-serif;margin:24px}img{image-rendering:pixelated;max-width:100%}pre{white-space:pre-wrap}</style><h1>Native stand-alone arrow source; admission pending</h1><a href="report.json">Compact report</a><p>PGF SVG retains the original drawing in the prescribed native source viewport. Native SVG reconstructs paths from native metadata. SVG fault is a deliberate mutation; Native control is a synthetic visibility example. These panels do not show public converter output.</p><pre>'+JSON.stringify(model.summary,null,2)+'</pre>'+records.filter(r=>r.view.scale===1&&r.view.background==='white').map(r=>'<h2>'+r.view.id+'</h2><p><a href="views/'+r.view.id+'/gates.json">Coupled source-frame and pixel gates</a></p><img src="'+(r.files.crops[0]?.images.sheet??r.files.images.comparison)+'">').join('')+'\n';
}
