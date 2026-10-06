// Re-decode saved samples independently of SVG rendering and presentation crops.
import assert from 'node:assert/strict';

export async function decodeEdgeOraclePngPair(renderer,images,size,rectangles,scale,background,scanPage=false){
  assert.equal(images.length,2);assert.ok(images.every(Buffer.isBuffer));
  assert.ok([size.width,size.height].every(n=>Number.isSafeInteger(n)&&n>0)&&size.width*size.height<=20000000);
  return renderer.page.evaluate(async({images,size,rectangles,scale,background,scanPage})=>{
    const buffers=[];
    for(const src of images){const im=new Image();im.src=src;await im.decode();if(im.width!==size.width||im.height!==size.height)throw Error('Saved PNG dimensions changed.');
      const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
      const ctx=canvas.getContext('2d',{colorSpace:'srgb',willReadFrequently:true});ctx.drawImage(im,0,0);buffers.push(ctx.getImageData(0,0,size.width,size.height).data);}
    const metrics=rectangles.map(rectangle=>globalThis.shapeRasterMetrics.compare(...buffers,{...size,scale,background,maskThreshold:16,rectangle}));let fullPage=null;
    if(scanPage){let rawChangedPixels=0,maxRawChannelError=0;
      for(let i=0;i<buffers[0].length;i+=4){let maximum=0;for(let c=0;c<4;c++)maximum=Math.max(maximum,Math.abs(buffers[0][i+c]-buffers[1][i+c]));
        rawChangedPixels+=maximum!==0;maxRawChannelError=Math.max(maxRawChannelError,maximum);}
      fullPage={exactRgbaMatch:rawChangedPixels===0,rawChangedPixels,maxRawChannelError};}
    return{metrics,fullPage};
  },{images:images.map(b=>'data:image/png;base64,'+b.toString('base64')),size,rectangles,scale,background,scanPage});
}
