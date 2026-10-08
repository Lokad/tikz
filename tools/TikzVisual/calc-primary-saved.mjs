// Independent decoding of every declared native calibration and defect pair.
import assert from 'node:assert/strict';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {calcEqual,calcHash} from './calc-saved-images.mjs';
import {calcPrimaryContract,calcPrimaryDefects} from './calc-primary-reference.mjs';
import {calcPrimaryViews,calcPrimaryKey,deriveCalcPrimaryPolicy,evaluateCalcPrimary} from './calc-primary-policy.mjs';
const compare=createShapeRasterMetrics().compare;
function metricEquals(actual,declared,name){calcEqual(actual,Object.fromEntries(Object.keys(actual).map(k=>[k,declared[k]])),'Independent calibration PNG metrics differ: '+name);}
function pixels(bundle,row){
  if(row.file){const record=bundle.json(row.file);calcEqual(record,Object.fromEntries(Object.keys(record).map(k=>[k,row[k]])),'Calibration record summary differs');}
  const reference=bundle.png(row.images.reference),actual=bundle.png(row.images.actual),frame=bundle.json('native-frame.json');
  assert.equal(reference.width,frame.camera.width*row.scale);assert.equal(reference.height,frame.camera.height*row.scale);
  assert.equal(actual.width,reference.width);assert.equal(actual.height,reference.height);
  const options={width:reference.width,height:reference.height,scale:row.scale,background:row.background,maskThreshold:16};
  const whole=compare(reference.rgba,actual.rgba,options);metricEquals(whole,row.metrics,row.file);
  calcEqual(row.regions.map(r=>({id:r.id,rectangle:r.rectangle})),frame.regions.map(r=>({id:r.id,rectangle:r.rectangle})),'Calibration region coverage or camera differs');
  assert.equal(row.regions.length,24);
  for(const r of row.regions)metricEquals(compare(reference.rgba,actual.rgba,{...options,
    rectangle:Object.fromEntries(Object.entries(r.rectangle).map(([k,v])=>[k,v*row.scale]))}),r,row.file+'/'+r.id);
  assert.equal(row.converterInvoked,false);assert.equal(row.repeat.rawChangedPixels,0);assert.equal(row.actualRepeat.rawChangedPixels,0);
  return whole;
}
export function verifyCalcCalibrationPixels(bundle){
  const report=bundle.report;assert.equal(report.converterInvoked,false);assert.equal(report.nativeToolInvoked,false);
  const expand=index=>{
    const record=bundle.json(index.file),keys=['background','capture','file','frame','scale',...(index.encoding===undefined?[]:['encoding'])].sort();
    calcEqual(Object.keys(index).sort(),keys,'Invalid calibration record index');
    for(const key of ['capture','frame','scale','background'])calcEqual(index[key],record[key],'Calibration record index differs');
    return{...record,...index};
  };
  const records=report.records.map(expand),replays=report.replays.map(expand);
  const defects=report.defects.map(d=>({...d,comparisons:d.comparisons.map(expand)}));
  const visibility=report.visibility.map(v=>({...v,comparisons:v.comparisons.map(expand)}));
  calcEqual(bundle.json('native-frame.json').contract,calcPrimaryContract,'Native contract differs');
  const required=calcPrimaryContract.representations.flatMap(encoding=>calcPrimaryViews.map(v=>'encodings/'+encoding+'/'+calcPrimaryKey(v)+'/record.json'));
  calcEqual(report.records.map(r=>r.file).sort(),required.sort(),'Native calibration coverage differs');
  for(const r of records)pixels(bundle,r);
  const policy=deriveCalcPrimaryPolicy(records);calcEqual(policy,report.policy,'Calibration policy differs from native-only derivation');
  calcEqual(policy,bundle.json('trial-policy.json'),'Saved trial policy differs');
  calcEqual(report.replays.map(r=>calcPrimaryKey(r)).sort(),calcPrimaryViews.map(calcPrimaryKey).sort(),'Native replay coverage differs');
  for(const r of replays){pixels(bundle,r);const first=records.find(s=>s.encoding===calcPrimaryContract.representations.at(-1)&&calcPrimaryKey(s)===calcPrimaryKey(r));
    calcEqual(r.metrics,first.metrics,'Native replay differs');for(const key of ['reference','actual'])assert.equal(report.artifacts[r.images[key]],report.artifacts[first.images[key]],'Native replay image differs');}
  calcEqual(report.defects.map(d=>d.name).sort(),calcPrimaryDefects.map(d=>d.name).sort(),'Defect coverage differs');
  let invisibleBaselines=0,visibleDefects=0;
  for(const defect of defects){
    const expected=calcPrimaryDefects.find(d=>d.name===defect.name);for(const[k,v]of Object.entries(expected))calcEqual(defect[k],v,'Defect declaration differs');
    assert.equal(defect.numericChecksBypassed,true);assert.equal(defect.converterInvoked,false);
    calcEqual(defect.comparisons.map(calcPrimaryKey).sort(),calcPrimaryViews.map(calcPrimaryKey).sort(),'Defect view coverage differs');
    for(const r of defect.comparisons){pixels(bundle,r);const evaluation=evaluateCalcPrimary(policy,r);calcEqual(evaluation,r.evaluation,'Saved defect evaluation differs');
      const visible=(r.background!=='black'||defect.name==='wrong-color')&&(!defect.naturalOnly||r.frame==='natural')&&(!defect.expandedOnly||r.frame==='expanded');
      assert.equal(r.expectedVisible,visible);assert.equal(evaluation.passed,!visible);
      if(visible){assert.ok(evaluation.checks.some(c=>c.id===defect.target&&!c.passed));visibleDefects++;}
      else{const file='defects/'+defect.name+'/visibility-base/'+calcPrimaryKey(r)+'/record.json',base=bundle.json(file);pixels(bundle,{file,...base});
        assert.equal(report.artifacts[r.images.actual],report.artifacts[base.images.actual],'Invisible defect changed samples');invisibleBaselines++;}
    }
  }
  calcEqual(report.visibility.map(r=>r.opacity),[.01,.001],'Controlled opacity coverage differs');
  let visibleFaint=0;
  for(const control of visibility){
    assert.equal(control.rendererOnly,true);assert.equal(control.numericChecksBypassed,true);assert.equal(control.converterInvoked,false);
    calcEqual(control.comparisons.map(calcPrimaryKey).sort(),calcPrimaryViews.map(calcPrimaryKey).sort(),'Faint view coverage differs');
    for(const r of control.comparisons){const measured=pixels(bundle,r),region=r.regions.find(s=>s.id==='native-paint-2');
      assert.equal(r.observedVisible,measured.rawChangedPixels>0);assert.equal(region.rawChangedPixels>0,r.observedVisible);
      assert.equal(r.exactControlPassed,!r.observedVisible);if(r.background==='black')assert.equal(r.observedVisible,false);visibleFaint+=r.observedVisible;}
  }
  const declaredPairs=report.records.length+report.replays.length+report.defects.reduce((n,d)=>n+d.comparisons.length,0)+report.visibility.reduce((n,v)=>n+v.comparisons.length,0);
  return{nativeOnlyViews:72,replayViews:24,defectFamilies:12,defectViews:288,visibleDefects,invisibleBaselineViews:invisibleBaselines,
    faintVisibilityViews:48,visibleFaintControls:visibleFaint,decodedPairs:declaredPairs+invisibleBaselines,regionalChecks:24*(declaredPairs+invisibleBaselines),
    approvedImagePolicy:false,imageConformanceClaim:false};
}

export function verifyCalcCalibrationRecapture(saved,fresh,nativeArgument){
  calcEqual(Object.keys(saved.report.artifacts).sort(),Object.keys(fresh.report.artifacts).sort(),'Calibration artifact coverage differs');
  const report=structuredClone(fresh.report),agent=fresh.json('agent-inspection.json');
  report.input.file=saved.report.input.file;assert.equal(agent.rerun.arguments[1],nativeArgument);
  agent.rerun.arguments[1]=saved.json('agent-inspection.json').rerun.arguments[1];
  report.artifacts['agent-inspection.json']=calcHash(Buffer.from(JSON.stringify(agent,null,2)+'\n'));
  for(const[file,digest]of Object.entries(saved.report.artifacts))assert.equal(digest,report.artifacts[file],'Native calibration source reconstruction differs: '+file);
  assert.equal(saved.sha256,calcHash(Buffer.from(JSON.stringify(report,null,2)+'\n')),'Native calibration report differs after declared path normalization');
  return{artifacts:saved.files.size,pngs:[...saved.files.keys()].filter(f=>f.endsWith('.png')).length,exactImageBytes:true,
    provenanceOnlyNormalization:['report native input path','agent rerun native input path and resulting digest']};
}
