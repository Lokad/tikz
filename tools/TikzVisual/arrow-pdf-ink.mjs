// Native-page integer RGB mass and first moments; no fitted error margin.
import assert from 'node:assert/strict';
export function arrowInkSample(samples,pageWidth,q){
 const sums=Array.from({length:3},()=>({mass:0,x:0,y:0}));
 for(let y=q.y;y<q.y+q.height;y++)for(let x=q.x;x<q.x+q.width;x++){
  const i=(y*pageWidth+x)*4;assert.equal(samples[i+3],255,'Ink samples must be opaque white-backed');
  for(let k=0;k<3;k++){const ink=255-samples[i+k];sums[k].mass+=ink;sums[k].x+=ink*x;sums[k].y+=ink*y;}
 }
 assert.ok(sums.every(c=>Object.values(c).every(Number.isSafeInteger)));return sums;
}
export async function measureArrowPdfInk(renderer,images,pageSize,regions,scale){
 assert.equal(images.length,2);assert.ok(images.every(Buffer.isBuffer));
 return renderer.page.evaluate(async({images,pageSize,regions,scale})=>{
  const fail=m=>{throw Error(m);};if(![1,4].includes(scale)||![pageSize.width,pageSize.height].every(n=>Number.isSafeInteger(n)&&n>0)
   ||pageSize.width*pageSize.height>20000000||regions.length<2||regions.length>2048)fail('Invalid bounded ink input');
  const samples=[];for(const url of images){const im=new Image();im.src=url;await im.decode();if(im.width!==pageSize.width||im.height!==pageSize.height)fail('Ink page dimensions changed');
   const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d',{colorSpace:'srgb',willReadFrequently:true});ctx.drawImage(im,0,0);samples.push(ctx.getImageData(0,0,c.width,c.height).data);}
  return regions.map(r=>{const q=r.rasterRectangles[scale+'x'];if(!Object.values(q).every(Number.isSafeInteger)||q.x<0||q.y<0||q.width<=0||q.height<=0
    ||q.x+q.width>pageSize.width||q.y+q.height>pageSize.height)fail('Invalid ink rectangle');
   const sides=samples.map(b=>{const sums=Array.from({length:3},()=>({mass:0,x:0,y:0}));
    for(let y=q.y;y<q.y+q.height;y++)for(let x=q.x;x<q.x+q.width;x++){const i=(y*pageSize.width+x)*4;if(b[i+3]!==255)fail('Ink samples must be opaque');
     for(let k=0;k<3;k++){const ink=255-b[i+k];sums[k].mass+=ink;sums[k].x+=ink*x;sums[k].y+=ink*y;}}
    if(!sums.every(c=>Object.values(c).every(Number.isSafeInteger)))fail('Ink integer overflow');return sums;});
   return{id:r.id,inkCoverage:{id:r.id,reference:sides[0].map(c=>c.mass),actual:sides[1].map(c=>c.mass)},inkMoments:{reference:sides[0],actual:sides[1]}};
  });
 },{images:images.map(b=>'data:image/png;base64,'+b.toString('base64')),pageSize,regions,scale});
}
export function attachArrowPdfInk(row,ink){
 assert.deepEqual(ink.map(r=>r.id),[row.whole.id,...row.regions.map(r=>r.id)]);
 return{...row,whole:{...row.whole,...ink[0]},regions:row.regions.map((r,i)=>({...r,...ink[i+1]}))};
}
