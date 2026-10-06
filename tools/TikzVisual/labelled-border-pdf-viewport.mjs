import assert from 'node:assert/strict';
import {sha256} from './shape-oracle-bundle.mjs';
import {shapePdfSpToCss} from './shape-pdf-camera.mjs';
import {measureShapePdfPair} from './shape-pdf-image-pair.mjs';

export async function saveLabelledPdfImages(save,prefix,result){
  const artifacts={},crops=new Map();for(const[k,b]of Object.entries(result.images)){const p=prefix+'-'+k+'.png';await save(p,Buffer.from(b,'base64'));artifacts[k]=p;}
  for(const crop of result.crops){const links={};for(const[k,b]of Object.entries(crop.images)){links[k]=prefix+'-'+crop.id+'-'+k+'.png';await save(links[k],Buffer.from(b,'base64'));}crops.set(crop.id,{...links,presentation:crop.presentation});}
  return{...result,images:undefined,crops:undefined,artifacts,regions:result.regions.map(r=>({...r,crops:crops.get(r.id)??null}))};
}

// Root-only changes cannot move a directly registered page's painted pixels.
export async function labelledPdfViewportControls(renderer,input,save){
  assert.deepEqual(input.variants.map(v=>v.mode),['original-svg','native-ink','pdf-instructions']);const changes=[{name:'padded',side:null,amount:0},...['left','right','top','bottom'].flatMap(side=>[-1,1].map(sign=>({name:side+(sign>0?'-plus':'-minus'),side,amount:sign*4*shapePdfSpToCss})))],controls=[],ordinary=[];
  for(const v of input.variants){const baseline={};
    for(const change of changes){const svg=await renderer.page.evaluate(({source,units,side,amount})=>{const d=new DOMParser().parseFromString(source,'image/svg+xml');if(d.querySelector('parsererror')||d.doctype)throw Error('Invalid original viewport.');const s=d.documentElement,before=s.innerHTML,factor=units==='bp'?4/3:1,box=s.getAttribute('viewBox').split(/[ ,]+/).map(Number);
      box[0]-=8/factor;box[1]-=8/factor;box[2]+=16/factor;box[3]+=16/factor;if(side==='left'){box[0]-=amount/factor;box[2]+=amount/factor;}if(side==='right')box[2]+=amount/factor;if(side==='top'){box[1]-=amount/factor;box[3]+=amount/factor;}if(side==='bottom')box[3]+=amount/factor;
      s.setAttribute('width',box[2]*factor+'px');s.setAttribute('height',box[3]*factor+'px');s.setAttribute('viewBox',box.join(' '));if(s.innerHTML!==before)throw Error('Viewport control changed drawing.');return new XMLSerializer().serializeToString(s);
    },{source:v.svg,units:v.units,...change});const prefix='viewport/'+v.mode+'-'+change.name;await save(prefix+'.svg',svg);
      for(const scale of[1,4]){const result=await measureShapePdfPair(renderer,{svg,units:v.units,svgOriginBp:v.origin,camera:input.camera,regions:input.regions,frame:'natural',scale,pdfPage:change.side===null?input.pdfPages[scale]:baseline[scale],capture:change.side===null,cropLimit:0});
        assert.equal(result.repeat.pdf.exactRgbaMatch,true);assert.equal(result.repeat.svg.exactRgbaMatch,true);
        if(change.side===null){const png=result.images['svg-page'],file=prefix+'-'+scale+'x-svg.png';await save(file,Buffer.from(png,'base64'));baseline[scale]='data:image/png;base64,'+png;ordinary.push({mode:v.mode,scale,image:file,whole:result.whole,fullPage:result.fullPage});
          const repeated=await measureShapePdfPair(renderer,{svg,units:v.units,svgOriginBp:v.origin,camera:input.camera,regions:input.regions,frame:'natural',scale,pdfPage:baseline[scale],capture:false});
          controls.push({mode:v.mode,name:change.name,scale,svgSha256:sha256(svg),page:repeated.fullPage,requiredRegionCount:input.regions.length,regionsExact:repeated.whole.exactRgbaMatch&&repeated.regions.every(r=>r.exactRgbaMatch)});
        }else controls.push({mode:v.mode,name:change.name,scale,svgSha256:sha256(svg),page:result.fullPage,requiredRegionCount:input.regions.length,regionsExact:result.whole.exactRgbaMatch&&result.regions.every(r=>r.exactRgbaMatch)});
      }
    }
    console.log(input.caseId+'/'+v.mode+': 18 page-viewport controls measured.');
  }
  assert.equal(controls.length,54);assert.equal(ordinary.length,6);const passed=controls.every(c=>c.page.exactRgbaMatch&&c.page.rawChangedPixels===0&&c.regionsExact);
  return{passed,paddingCssPixels:8,boundaryDeltaSp:4,boundaryDeltaCssPixels:4*shapePdfSpToCss,drawingInstructionsUnchanged:true,rendering:'Direct page coordinates with separate natural-root clipping.',controls,ordinary};
}
