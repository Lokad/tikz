// Independent saved native-PDF calibration reader. Producer verdicts are inputs.
import assert from 'node:assert/strict';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {shapePdfRasterRectangle} from './shape-pdf-camera.mjs';
import {readCalcLayoutEvidence} from './calc-layout-evidence.mjs';
import {calcPrimaryDefects} from './calc-primary-reference.mjs';
import {calcEqual,calcHash} from './calc-saved-images.mjs';
import {calcPdfViews,calcPdfKey,calcPdfRoutes,calcPdfInk,deriveCalcPdfPolicy,evaluateCalcPdf,
  deriveCalcPdfInkPolicy,evaluateCalcPdfInk} from './calc-pdf-policy.mjs';
const compare=createShapeRasterMetrics().compare;
const identity=r=>({id:r.id,rectangle:r.rectangle,rasterRectangles:r.rasterRectangles});
function metricEquals(actual,declared,name){
  calcEqual(actual,Object.fromEntries(Object.keys(actual).map(k=>[k,declared[k]])),'Independent PDF PNG metrics differ: '+name);
}
function expand(bundle,index){
  calcEqual(Object.keys(index).sort(),['background','file','frame','route','scale'],'Invalid PDF record index');
  const row=bundle.json(index.file);
  for(const key of ['background','frame','route','scale'])calcEqual(row[key],index[key],'PDF record index differs');
  if(row.file!==undefined)assert.equal(row.file,index.file);
  return{...row,...index};
}
function pixels(bundle,row,registration){
  assert.equal(row.converterInvoked,false);assert.equal(row.background,'white');
  const reference=bundle.png(row.images.pdf),actual=bundle.png(row.images.svg),page=bundle.png(row.images['svg-page']);
  const size=registration.camera.rasterSizes[row.scale+'x'];
  for(const png of [reference,actual,page])calcEqual({width:png.width,height:png.height},size,'PDF PNG page dimensions differ');
  assert.deepEqual(actual.rgba,page.rgba,'PDF whole-crop and SVG-page samples differ');
  calcEqual([row.whole,...row.regions].map(identity),registration.regions.map(identity),'PDF region coverage or camera differs');
  const options={...size,scale:row.scale,background:'white',maskThreshold:16};
  const whole=compare(reference.rgba,actual.rgba,options);metricEquals(whole,row.whole,row.file+'/whole');
  calcEqual(row.fullPage,{exactRgbaMatch:whole.exactRgbaMatch,rawChangedPixels:whole.rawChangedPixels,maxRawChannelError:whole.maxRawChannelError},'PDF full-page summary differs');
  assert.equal(row.outsideWholeChangedPixels,0);calcEqual(row.pageSize,size,'PDF record page size differs');
  for(const r of row.regions)metricEquals(compare(reference.rgba,actual.rgba,{...options,rectangle:r.rasterRectangles[row.scale+'x']}),r,row.file+'/'+r.id);
  calcEqual(calcPdfInk(reference.rgba,page.rgba,reference.width,registration.regions,row.scale),row.ink,'Independent PDF RGB ink/moments differ');
  calcEqual(row.repeat,{pdf:{exactRgbaMatch:true,rawChangedPixels:0,maxRawChannelError:0},svg:{exactRgbaMatch:true,rawChangedPixels:0,maxRawChannelError:0}},'PDF unchanged repeat differs');
}
function visible(bundle,row,base){
  const a=bundle.png(base.images['svg-page']),b=bundle.png(row.images['svg-page']);
  assert.equal(a.width,b.width);assert.equal(a.height,b.height);
  // Visibility is decoded RGBA equality, never PNG byte inequality or an edge mask.
  return !a.rgba.every((value,i)=>value===b.rgba[i]);
}
function coverage(rows,prefix,route){
  calcEqual(rows.map(r=>r.file).sort(),calcPdfViews.map(v=>prefix+'/'+calcPdfKey(v)+'/record.json').sort(),'PDF view coverage differs');
  for(const r of rows){assert.equal(r.route,route);assert.equal(r.file,prefix+'/'+calcPdfKey(r)+'/record.json','PDF path/view tuple differs');}
}
export function verifyCalcPdfCalibrationPixels(bundle){
  const report=bundle.report;assert.equal(report.converterInvoked,false);assert.equal(report.nativeToolInvoked,false);
  assert.equal(report.approvedImagePolicy,false);assert.equal(report.imageConformanceClaim,false);assert.equal(report.imageAdmission,'pending');
  const registration=bundle.json('registration.json'),cache=bundle.json('points.json');
  const nativeFiles=Object.fromEntries([...bundle.files].filter(([f])=>f.startsWith('native/')).map(([f,b])=>[f.slice(7),b]));
  const evidence=readCalcLayoutEvidence(nativeFiles,cache);
  calcEqual(registration.evidence,evidence,'PDF native registration evidence differs');
  calcEqual(registration.camera,{origin:evidence.registration.originPixels,rasterSizes:evidence.rasterSizes},'PDF native camera differs');
  calcEqual(registration.regions.map(r=>r.id),['whole-picture','diagram',...Array.from({length:24},(_,i)=>'native-paint-'+i),'page-corner'],'PDF required regions differ');
  for(const r of registration.regions)for(const scale of [1,4])
    calcEqual(r.rasterRectangles[scale+'x'],shapePdfRasterRectangle(r.rectangle,registration.camera,scale),'PDF native crop lattice differs');
  const records=report.records.map(r=>expand(bundle,r)),replays=report.replays.map(r=>expand(bundle,r));
  const required=calcPdfRoutes.flatMap(route=>calcPdfViews.map(v=>'encodings/'+route+'/'+calcPdfKey(v)+'/record.json'));
  calcEqual(records.map(r=>r.file).sort(),required.sort(),'PDF native calibration coverage differs');
  for(const r of records){assert.equal(r.file,'encodings/'+r.route+'/'+calcPdfKey(r)+'/record.json','PDF native path/view tuple differs');pixels(bundle,r,registration);}
  const policy=deriveCalcPdfPolicy(records,registration.camera,registration.regions);
  calcEqual(policy,report.policy,'PDF policy differs from native-only derivation');
  calcEqual(policy,bundle.json('trial-policy.json'),'Saved PDF trial policy differs');
  for(const r of records)assert.equal(evaluateCalcPdf(policy,r).passed,true,'Native PDF route exceeds policy');
  calcEqual(replays.map(r=>r.file).sort(),calcPdfRoutes.flatMap(route=>calcPdfViews.map(v=>'replay/'+route+'/'+calcPdfKey(v)+'/record.json')).sort(),'PDF native replay coverage differs');
  for(const r of replays){assert.equal(r.file,'replay/'+r.route+'/'+calcPdfKey(r)+'/record.json','PDF replay path/view tuple differs');pixels(bundle,r,registration);
    const first=records.find(s=>s.route===r.route&&calcPdfKey(s)===calcPdfKey(r));
    for(const k of ['whole','regions','ink','fullPage','sourceFrame','clipFrame'])calcEqual(r[k],first[k],'PDF native replay differs');
    for(const k of ['pdf','svg','svg-page'])assert.equal(report.artifacts[r.images[k]],report.artifacts[first.images[k]],'PDF native replay PNG differs');
  }
  const declarations=calcPrimaryDefects.filter(d=>!d.rendererOnly);
  calcEqual(report.defects.map(d=>d.name).sort(),declarations.map(d=>d.name).sort(),'PDF defect coverage differs');
  let visibleDefects=0,invisibleDefects=0,visibleClip=0,visibleFaint=0;
  const canonical=calcPdfRoutes.at(-1);
  for(const defect of report.defects){
    const declaration=declarations.find(d=>d.name===defect.name),expected={...declaration,...(defect.name==='outside-ink'?{target:'page-corner'}:{})};
    for(const[k,v]of Object.entries(expected))calcEqual(defect[k],v,'PDF defect declaration differs');
    assert.equal(defect.numericChecksBypassed,true);assert.equal(defect.converterInvoked,false);
    const rows=defect.comparisons.map(r=>expand(bundle,r));coverage(rows,'defects/'+defect.name,canonical);
    for(const r of rows){pixels(bundle,r,registration);const evaluation=evaluateCalcPdf(policy,r);
      calcEqual(evaluation,r.evaluation,'Saved PDF defect evaluation differs');
      const expectedVisible=(!defect.naturalOnly||r.frame==='natural')&&(!defect.expandedOnly||r.frame==='expanded');
      const baseline=records.find(s=>s.route===canonical&&calcPdfKey(s)===calcPdfKey(r));
      assert.equal(visible(bundle,r,baseline),expectedVisible,'Decoded PDF defect visibility differs');
      assert.equal(r.expectedVisible,expectedVisible);assert.equal(r.observedVisible,expectedVisible);assert.equal(evaluation.passed,!expectedVisible);
      if(expectedVisible){assert.ok(evaluation.checks.some(c=>c.id===defect.target&&!c.passed));visibleDefects++;}else invisibleDefects++;
    }
  }
  calcEqual(report.controlled.map(c=>c.id),['lost-half-clip'],'PDF clipping control coverage differs');
  calcEqual(report.visibility.map(c=>c.opacity),[.01,.001],'PDF faint control coverage differs');
  for(const group of [...report.controlled,...report.visibility]){
    assert.equal(group.rendererOnly,true);assert.equal(group.converterInvoked,false);assert.equal(group.numericChecksBypassed,true);
    assert.equal(group.target,group.opacity===undefined?'native-paint-13':'native-paint-2');
    const unchanged=group.unchanged.map(r=>expand(bundle,r)),altered=group.comparisons.map(r=>expand(bundle,r));
    coverage(unchanged,'controls/'+group.id+'/unchanged',canonical);coverage(altered,'controls/'+group.id+'/altered',canonical);
    for(const r of unchanged)pixels(bundle,r,registration);
    const inkPolicy=deriveCalcPdfInkPolicy(unchanged,group.scope);calcEqual(inkPolicy,group.inkPolicy,'Controlled PDF ink policy differs');
    for(const r of altered){pixels(bundle,r,registration);const base=unchanged.find(s=>calcPdfKey(s)===calcPdfKey(r)),observed=visible(bundle,r,base);
      assert.equal(r.observedVisible,observed);const evaluation=evaluateCalcPdfInk(inkPolicy,r);calcEqual(evaluation,r.evaluation,'Saved controlled PDF evaluation differs');
      assert.equal(evaluation.passed,!observed);if(observed){assert.ok(evaluation.checks.some(c=>c.id===group.target&&!c.passed));
        if(group.opacity===undefined)visibleClip++;else visibleFaint++;}
    }
  }
  const pairs=records.length+replays.length+report.defects.reduce((n,d)=>n+d.comparisons.length,0)+
    [...report.controlled,...report.visibility].reduce((n,d)=>n+d.unchanged.length+d.comparisons.length,0);
  assert.equal(pairs,100);
  return{nativeOnlyViews:16,replayViews:16,defectFamilies:11,defectViews:44,visibleDefects,invisibleDefects,
    clippingViews:8,visibleClip,faintVisibilityViews:16,visibleFaint,decodedPairs:pairs,regionalChecks:pairs*27,
    approvedImagePolicy:false,imageConformanceClaim:false};
}
export function verifyCalcPdfCalibrationRecapture(saved,fresh,nativeArgument){
  calcEqual(Object.keys(saved.report.artifacts).sort(),Object.keys(fresh.report.artifacts).sort(),'PDF calibration artifact coverage differs');
  const report=structuredClone(fresh.report),agent=fresh.json('agent-inspection.json');
  assert.equal(report.input.file,nativeArgument);report.input.file=saved.report.input.file;
  assert.equal(agent.rerun.arguments[1],nativeArgument);agent.rerun.arguments[1]=saved.json('agent-inspection.json').rerun.arguments[1];
  report.artifacts['agent-inspection.json']=calcHash(Buffer.from(JSON.stringify(agent,null,2)+'\n'));
  for(const[file,digest]of Object.entries(saved.report.artifacts))assert.equal(digest,report.artifacts[file],'PDF calibration source reconstruction differs: '+file);
  assert.equal(saved.sha256,calcHash(Buffer.from(JSON.stringify(report,null,2)+'\n')),'PDF calibration report differs after declared path normalization');
  return{artifacts:saved.files.size,pngs:[...saved.files.keys()].filter(f=>f.endsWith('.png')).length,exactImageBytes:true,
    provenanceOnlyNormalization:['report native input path','agent rerun native input path and resulting digest']};
}
