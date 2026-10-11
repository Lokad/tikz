// Math scope/ownership is separate; capture, policy envelopes and PNG decoding are shared.
import assert from 'node:assert/strict';
import path from 'node:path';
import {root} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport,calcEqual} from './calc-saved-images.mjs';
import {mathFramingFamily} from './math-label-framing.mjs';
import {mathPrimaryEncodings,mathPrimaryNativeHash,mathPrimaryControls} from './math-label-primary.mjs';
import {mathNativePdfFrame,verifyMathPdfReplay} from './math-label-pdf-native.mjs';
import {nativePdfPolicies} from './path-label-pdf-policy.mjs';
import {shapePdfViews,evaluateShapePdfTrial} from './shape-pdf-trial-policy.mjs';
import {measureEdgePdfPair} from './edge-pdf-image-pair.mjs';
import {pdfPagePixelReader} from './path-label-pdf-pixels.mjs';
import {decodeCalcPng} from './calc-png.mjs';
export const mathPdfKey=v=>v.frame+'/'+v.scale+'x';
export function mathPdfCoverage(ids){
 const family=mathFramingFamily(ids),controls=family.length===1?20:19;
 return{cases:family.length,encodings:3,nativeViews:family.length*3*shapePdfViews.length,controls,
  controlViews:controls*shapePdfViews.length,regions:family.reduce((n,c)=>n+1+c.nodes+c.glyphs+c.rules+c.paths,0)};
}
export const mathPdfSources=['math-label-pdf-images.mjs','math-label-pdf-native.mjs','math-label-primary.mjs',
 'math-label-framing.mjs','edge-pdf-image-pair.mjs','path-label-pdf-policy.mjs','path-label-pdf-pixels.mjs',
 'shape-pdf-trial-policy.mjs','shape-pdf-camera.mjs','shape-raster-metrics.mjs','calc-png.mjs',
 'calc-saved-images.mjs','shape-oracle-bundle.mjs','compare.mjs','browser-profile.json','package.json','package-lock.json'];
export async function loadMathPdfImageInputs(pdfFile,pdfCheckFile,primaryFile,primaryCheckFile){
 const native=await loadCalcSavedReport(path.resolve(root,pdfFile),'math-label-native-pdf-reference');
 const nativeCheck=await loadCalcSavedReport(path.resolve(root,pdfCheckFile),'math-label-independent-native-pdf-check');
 const primary=await loadCalcSavedReport(path.resolve(root,primaryFile),'math-label-native-primary-calibration');
 const primaryCheck=await loadCalcSavedReport(path.resolve(root,primaryCheckFile),'math-label-independent-primary-check');
 const ids=primary.report.cases.map(c=>c.id),family=mathFramingFamily(ids),coverage=mathPdfCoverage(ids);
 calcEqual(native.report.cases.map(c=>c.id),ids);
 assert.equal(nativeCheck.report.nativeInputSha256,native.sha256);assert.ok(nativeCheck.files.get('input-report.json').equals(native.bytes));
 calcEqual(nativeCheck.report.sourceReplay,{pdfs:family.length*2,rasters:family.length*4});assert.equal(nativeCheck.report.requiredRegions,coverage.regions);
 assert.equal(primaryCheck.report.inputSha256,primary.sha256);assert.ok(primaryCheck.files.get('input-report.json').equals(primary.bytes));
 assert.equal(primaryCheck.report.sourceRecaptures,family.length===1?128:220);assert.equal(primary.report.nativeInputSha256,mathPrimaryNativeHash(ids));
 assert.equal(nativeCheck.report.primaryInputSha256,primary.sha256);assert.equal(nativeCheck.report.primaryCheckSha256,primaryCheck.sha256);
 verifyMathPdfReplay(native,nativeCheck.report.replay);
 for(const c of family)calcEqual(mathNativePdfFrame(native,c.id,primary.json(c.id+'/frame.json')),nativeCheck.json(c.id+'/pdf-frame.json'));
 return{native,nativeCheck,primary,primaryCheck};
}
export function bindMathPdfImageInputs(bundle,loaded){
 for(const[name,b]of Object.entries(loaded))assert.equal(bundle.report.inputs[name].sha256,b.sha256,'Changed math PDF owner.');
 assert.ok(bundle.files.get('native/report.json').equals(loaded.native.bytes));
 for(const[f,b]of loaded.native.files)assert.ok(bundle.files.get('native/'+f).equals(b),'Changed native PDF artifact.');
 for(const name of ['nativeCheck','primary','primaryCheck'])assert.ok(bundle.files.get('inputs/'+name+'-report.json').equals(loaded[name].bytes));
 for(const c of mathFramingFamily(loaded.primary.report.cases.map(c=>c.id))){
  calcEqual(bundle.json(c.id+'/frame.json'),loaded.primary.json(c.id+'/frame.json'),'Changed math PDF mark ownership.');
  calcEqual(bundle.json(c.id+'/pdf-frame.json'),loaded.nativeCheck.json(c.id+'/pdf-frame.json'),'Changed math PDF camera.');
  assert.ok(bundle.files.get(c.id+'/encodings/original.svg').equals(loaded.primary.files.get('events/'+c.id+'/oracle.svg')));
  for(const e of mathPrimaryEncodings)assert.ok(bundle.files.get(c.id+'/encodings/'+e+'.svg').equals(loaded.primary.files.get(c.id+'/encodings/'+e+'.svg')));
 }
}
function mathPdfRuleViews(pdf){
 return shapePdfViews.map(view=>({...view,regions:pdf.regions.filter(r=>r.kind==='rule').map(r=>({id:r.id,rectangle:r.rasterRectangles[view.scale+'x']}))}));
}
export function mathPdfPolicies(rows,pdf,owner){
 const policies=nativePdfPolicies(rows,pdf,mathPrimaryEncodings);
 if(owner?.caseId!=='flowchart-styled-labels')return policies;
 // Demonstrated gap: moving a thin bar can exchange endpoint errors while
 // preserving every aggregate metric. Bound each pixel in the two native
 // rule crops. Native encodings alone supply limits; no converter/fault input.
 for(const mode of ['original','candidate']){
  const encodings=mode==='original'?['original']:mathPrimaryEncodings;
  policies[mode].rulePixels=mathPdfRuleViews(pdf).map(view=>{
   const page=decodeCalcPng(owner.native.files.get(owner.caseId+'/probed-pdf-page-'+view.scale+'x.png'));
   const svgs=encodings.map(e=>decodeCalcPng(owner.files.get(rows.find(r=>r.encoding===e&&mathPdfKey(r)===mathPdfKey(view)).images['svg-page'])));
   for(const svg of svgs)calcEqual([svg.width,svg.height],[page.width,page.height]);
   return{...view,regions:view.regions.map(r=>{
    const rectangle=r.rectangle,limits=[];
    for(let y=rectangle.y;y<rectangle.y+rectangle.height;y++)for(let x=rectangle.x;x<rectangle.x+rectangle.width;x++)
     for(let c=0;c<4;c++){const i=(y*page.width+x)*4+c;limits.push(Math.max(...svgs.map(s=>Math.abs(s.rgba[i]-page.rgba[i]))));}
    return{id:r.id,rectangle,limits};
   })};
  });
 }
 return policies;
}
export function evaluateMathPdf(policy,view,row,owner){
 const result=evaluateShapePdfTrial(policy,view,row);
 if(!policy.rulePixels){assert.notEqual(owner?.caseId,'flowchart-styled-labels','Missing styled rule pixel policy.');return result;}
 assert.equal(owner.caseId,'flowchart-styled-labels');
 const limits=policy.rulePixels.filter(v=>mathPdfKey(v)===mathPdfKey(view));assert.equal(limits.length,1);
 const page=decodeCalcPng(owner.native.files.get(owner.caseId+'/probed-pdf-page-'+view.scale+'x.png')),
  svg=decodeCalcPng(owner.files.get(row.images['svg-page']));calcEqual([svg.width,svg.height],[page.width,page.height]);
 calcEqual(limits[0].regions.map(r=>r.id),row.regions.filter(r=>r.kind==='rule').map(r=>r.id));
 for(const region of limits[0].regions){
  const rectangle=row.regions.find(r=>r.id===region.id).rasterRectangles[view.scale+'x'];calcEqual(rectangle,region.rectangle);
  assert.equal(region.limits.length,rectangle.width*rectangle.height*4);let index=0,exceededPixels=0,maxExcess=0;
  for(let y=rectangle.y;y<rectangle.y+rectangle.height;y++)for(let x=rectangle.x;x<rectangle.x+rectangle.width;x++){
   let excess=0;
   for(let c=0;c<4;c++){const limit=region.limits[index++];assert.ok(Number.isInteger(limit)&&limit>=0&&limit<=255);
    const i=(y*page.width+x)*4+c;excess=Math.max(excess,Math.abs(svg.rgba[i]-page.rgba[i])-limit);}
   exceededPixels+=excess>0;maxExcess=Math.max(maxExcess,excess);
  }
  const check=result.checks.find(c=>c.id===region.id);check.pixelEnvelope={exceededPixels,maxExcess,passed:exceededPixels===0};check.passed&&=check.pixelEnvelope.passed;
 }
 result.regionalPassed=result.checks.slice(1,row.regions.length+1).every(c=>c.passed);
 result.passed=result.checks.every(c=>c.passed);return result;
}
export async function measureMathPdf(renderer,{native,caseId,frame,pdf,svg,encoding,view,target}){
 return measureEdgePdfPair(renderer,{svg,pdfPage:'data:image/png;base64,'+native.files.get(caseId+'/probed-pdf-page-'+view.scale+'x.png').toString('base64'),
  ...pdf,...view,allowMathMarks:true,units:encoding==='original'?'bp':'cssPixels',svgOriginBp:encoding==='original'?frame.origin:{x:0,y:0},
  cropLimit:target?1:0,cropRegionIds:target?[target]:[],rightLabel:encoding==='original'?'Original native TikZ SVG':'Math SVG'});
}
export function verifyMathPdfImagePixels(bundle){
 const r=bundle.report;assert.equal(r.converterInvoked,false);assert.equal(r.nativeToolInvoked,false);
 const family=mathFramingFamily(r.cases.map(c=>c.id)),coverage=mathPdfCoverage(r.cases.map(c=>c.id));
 assert.equal(r.controls.length,coverage.controls,'Unexpected math PDF fault coverage.');
 const expected=family.flatMap(c=>['original',...mathPrimaryEncodings].flatMap(e=>shapePdfViews.map(v=>c.id+'/'+e+'/'+mathPdfKey(v))));
 calcEqual(r.records.map(v=>v.caseId+'/'+v.encoding+'/'+mathPdfKey(v)).sort(),expected.sort(),'Math PDF native view coverage differs.');
 let comparisons=0,regions=0,visible=0,invisible=0;
 for(const c of family){
  const frame=bundle.json(c.id+'/frame.json'),pdf=bundle.json(c.id+'/pdf-frame.json'),read=pdfPagePixelReader(bundle,pdf,'native/'+c.id);
  assert.equal(frame.caseId,c.id);assert.equal(pdf.regions.length,1+c.nodes+c.glyphs+c.rules+c.paths);
  calcEqual(r.cases.find(v=>v.id===c.id),{id:c.id,regions:pdf.regions.length});
  const records=r.records.filter(v=>v.caseId===c.id),savedPolicies=bundle.json(c.id+'/policies.json');
  // Reject inconsistent policy metadata before decoding. Valid reports still
  // derive every metric and per-pixel limit independently below.
  const summaries=records.map(v=>{
   assert.equal(v.file,c.id+'/views/'+v.encoding+'/'+mathPdfKey(v)+'/record.json');
   const row=bundle.json(v.file);calcEqual({encoding:row.encoding,frame:row.frame,scale:row.scale,background:row.background},
    {encoding:v.encoding,frame:v.frame,scale:v.scale,background:v.background});return row;
  });
  const aggregate=nativePdfPolicies(summaries,pdf,mathPrimaryEncodings);
  for(const mode of ['original','candidate']){
   const {rulePixels,...declaredPolicy}=savedPolicies[mode];calcEqual(aggregate[mode],declaredPolicy,'Forged math PDF policy.');
   if(c.id==='flowchart-styled-labels')calcEqual(rulePixels?.map(({regions,...view})=>({...view,regions:regions.map(({id,rectangle})=>({id,rectangle}))})),mathPdfRuleViews(pdf),'Forged math PDF policy.');
   else assert.equal(rulePixels,undefined,'Forged math PDF policy.');
  }
  const rows=records.map(v=>{
   assert.equal(v.file,c.id+'/views/'+v.encoding+'/'+mathPdfKey(v)+'/record.json');
   const row=read(v.file);calcEqual({encoding:row.encoding,frame:row.frame,scale:row.scale,background:row.background},
    {encoding:v.encoding,frame:v.frame,scale:v.scale,background:v.background});comparisons++;regions+=pdf.regions.length;return row;
  });
  const owner={caseId:c.id,native:{files:new Map([...bundle.files].filter(([f])=>f.startsWith('native/')).map(([f,b])=>[f.slice(7),b]))},files:bundle.files};
  const policies=mathPdfPolicies(rows,pdf,owner);calcEqual(policies,savedPolicies,'Forged math PDF policy.');
  const controls=r.controls.filter(v=>v.caseId===c.id),declared=mathPrimaryControls(frame);
  calcEqual(controls.map(({caseId,comparisons,numericChecksBypassed,...v})=>v),declared,'Math PDF fault ownership differs.');
  for(const control of controls){
   assert.equal(control.numericChecksBypassed,true);calcEqual(control.comparisons.map(mathPdfKey).sort(),shapePdfViews.map(mathPdfKey).sort());
   for(const v of control.comparisons){
    assert.equal(v.file,c.id+'/controls/'+control.name+'/'+control.kind+'/'+mathPdfKey(v)+'/record.json');
    const row=read(v.file),view={frame:v.frame,scale:v.scale,background:v.background},evaluation=evaluateMathPdf(policies.candidate,view,row,owner);calcEqual(row.evaluation,evaluation);
    const baseline=rows.find(b=>b.encoding===mathPrimaryEncodings[0]&&mathPdfKey(b)===mathPdfKey(v));
    const observedVisible=!bundle.files.get(row.images['svg-page']).equals(bundle.files.get(baseline.images['svg-page']));
    assert.equal(row.observedVisible,observedVisible);assert.equal(v.observedVisible,observedVisible);assert.equal(v.rejected,!evaluation.passed);
    if(observedVisible){assert.equal(evaluation.passed,false,'Visible PDF math fault admitted.');
     assert.ok(evaluation.checks.some(check=>check.id===control.region&&!check.passed),'Target PDF region admitted math fault.');visible++;
    }else{calcEqual(row.whole,baseline.whole);invisible++;}
    comparisons++;regions+=pdf.regions.length;
   }
  }
 }
 calcEqual(r.coverage,coverage);
 return{comparisons,regions,visibleControls:visible,invisibleControls:invisible};
}
