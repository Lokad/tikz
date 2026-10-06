// Exact independent native-image gate on the already registered PDF lattice.
// PDF-only observations and their fixed allowances remain separate.
import assert from 'node:assert/strict';
export function labelledPdfGuardExpectation(defect,view){
  return defect.exactVisibilityControl||view.scale===1&&['paths/changed-corner-join','transforms/changed-orthogonal-join'].includes(defect.caseId+'/'+defect.name)?'pixel-identical':'target-rejection';
}
export function evaluateLabelledPdfPageGuard(measurement,pdfEvaluation){
  const rows=[measurement.whole,...measurement.regions],checks=rows.map(r=>({id:r.id,passed:r.rawChangedPixels===0&&r.maxRawChannelError===0&&r.exactRgbaMatch,rawChangedPixels:r.rawChangedPixels,maxRawChannelError:r.maxRawChannelError,limit:0}));
  assert.deepEqual(checks.map(c=>c.id),pdfEvaluation.checks.slice(0,rows.length).map(c=>c.id));assert.equal(measurement.outsideWholeChangedPixels,0);assert.ok(Number.isSafeInteger(measurement.fullPage.rawChangedPixels)&&measurement.fullPage.rawChangedPixels>=0);assert.equal(measurement.fullPage.exactRgbaMatch,measurement.fullPage.rawChangedPixels===0);
  const nativePassed=measurement.fullPage.exactRgbaMatch&&measurement.fullPage.maxRawChannelError===0&&checks.every(c=>c.passed),combinedChecks=checks.map((c,i)=>({id:c.id,pdfPassed:pdfEvaluation.checks[i].passed,nativePagePassed:c.passed,passed:pdfEvaluation.checks[i].passed&&c.passed}));
  return {pdfOnlyPassed:pdfEvaluation.passed,nativePagePassed:nativePassed,passed:pdfEvaluation.passed&&nativePassed,checks:combinedChecks,nativeChecks:checks,fullPageLimit:0};
}
export async function compareLabelledNativePages(renderer,input){
  return renderer.page.evaluate(async({reference,actual,pageSize,regions,scale,cropId})=>{
    const require=(v,m)=>{if(!v)throw Error(m);};require([1,4].includes(scale)&&pageSize.width*pageSize.height<=20000000,'Invalid native page size.');const canvases=[],buffers=[];
    for(const src of [reference,actual]){require(src.startsWith('data:image/png;base64,'),'Invalid native PNG input.');const image=new Image();image.src=src;await image.decode();require(image.width===pageSize.width&&image.height===pageSize.height,'Changed native page dimensions.');const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d',{colorSpace:'srgb',willReadFrequently:true});ctx.drawImage(image,0,0);canvases.push(canvas);buffers.push(ctx.getImageData(0,0,canvas.width,canvas.height).data);}
    const a=new Uint32Array(buffers[0].buffer,buffers[0].byteOffset,buffers[0].length/4),b=new Uint32Array(buffers[1].buffer,buffers[1].byteOffset,buffers[1].length/4);let changed=0,maximum=0;
    for(let i=0;i<a.length;i++)if(a[i]!==b[i]){changed++;for(let k=0;k<4;k++)maximum=Math.max(maximum,Math.abs(buffers[0][i*4+k]-buffers[1][i*4+k]));}
    const rows=regions.map(r=>{const q=r.rasterRectangles[scale+'x'];require(q.x>=0&&q.y>=0&&q.width>0&&q.height>0&&q.x+q.width<=pageSize.width&&q.y+q.height<=pageSize.height,'Invalid native guard crop.');return {...r,...globalThis.shapeRasterMetrics.compare(...buffers,{...pageSize,scale,background:'white',maskThreshold:16,rectangle:q})};});require(changed>=rows[0].rawChangedPixels,'Guard whole crop exceeds page changes.');const fullPage={exactRgbaMatch:changed===0,rawChangedPixels:changed,maxRawChannelError:maximum};let images=null;
    if(cropId){const r=regions.find(r=>r.id===cropId);require(r,'Missing guard crop.');const q=r.rasterRectangles[scale+'x'],factor=8,make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;},parts=canvases.map(c=>{const out=make(q.width,q.height);out.getContext('2d').drawImage(c,-q.x,-q.y);return out;}),difference=make(q.width,q.height),data=difference.getContext('2d').createImageData(q.width,q.height),left=parts[0].getContext('2d').getImageData(0,0,q.width,q.height).data,right=parts[1].getContext('2d').getImageData(0,0,q.width,q.height).data;
      for(let i=0;i<data.data.length;i+=4){let error=0;for(let k=0;k<4;k++)error=Math.max(error,Math.abs(left[i+k]-right[i+k]));data.data[i]=255;data.data[i+1]=data.data[i+2]=255-Math.min(255,error*16);data.data[i+3]=255;}difference.getContext('2d').putImageData(data,0,0);const panelWidth=Math.max(160,q.width*factor),sheet=make(panelWidth*3,q.height*factor+50),ctx=sheet.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,sheet.width,sheet.height);ctx.fillStyle='black';ctx.font='14px sans-serif';ctx.imageSmoothingEnabled=false;ctx.fillText(cropId+' / native page / '+scale+'x',6,18);[...parts,difference].forEach((c,i)=>{ctx.fillText(['Independent native','Changed image','Difference x16'][i],i*panelWidth+6,40);ctx.drawImage(c,i*panelWidth+(panelWidth-q.width*factor)/2,50,q.width*factor,q.height*factor);});images={sheet:sheet.toDataURL('image/png').split(',')[1]};
    }
    return {fullPage,whole:rows[0],regions:rows.slice(1),outsideWholeChangedPixels:changed-rows[0].rawChangedPixels,images};
  },input);
}
