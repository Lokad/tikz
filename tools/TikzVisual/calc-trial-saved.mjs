// Independent decoding and complete required-gate reconciliation for public trials.
import assert from 'node:assert/strict';
import {calcEqual,calcHash} from './calc-saved-images.mjs';
import {readCalcTrialReference} from './calc-trial-reference.mjs';
import {readCalcTrialCandidate} from './calc-trial-candidate.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
import {decodeCalcPng} from './calc-png.mjs';
import {calcPrimaryDefects} from './calc-primary-reference.mjs';
import {calcPrimaryViews,calcPrimaryKey,evaluateCalcPrimary} from './calc-primary-policy.mjs';
import {calcPdfViews,calcPdfKey,calcPdfInk,evaluateCalcPdf,deriveCalcPdfInkPolicy,evaluateCalcPdfInk} from './calc-pdf-policy.mjs';
const compare=createShapeRasterMetrics().compare;
export function calcTrialOwned(bundle,prefix){const files=new Map([...bundle.files].filter(([f])=>f.startsWith(prefix+'/')).map(([f,b])=>[f.slice(prefix.length+1),b])),bytes=files.get('report.json'),report=JSON.parse(bytes);
  assert.equal(report.schemaVersion,1);assert.equal(report.completed,true);assert.equal(report.phase,'complete');
  assert.equal(report.role,prefix==='candidate'?'calc-coordinate-candidate-export':'calc-native-trial-reference-projection');
  assert.equal(report.approvedImagePolicy,false);assert.equal(report.imageConformanceClaim,false);assert.equal(report.imageAdmission,'pending');
  assert.ok(report.artifacts&&Object.keys(report.artifacts).length>0,'Missing public artifact manifest');
  for(const[f,digest]of Object.entries(report.artifacts))assert.equal(calcHash(files.get(f)),digest,'Owned trial input differs: '+prefix+'/'+f);
  return{bytes,sha256:calcHash(bytes),report,files,json:f=>JSON.parse(files.get(f)),png:f=>decodeCalcPng(files.get(f))};}
const metricEqual=(actual,row,name)=>calcEqual(actual,Object.fromEntries(Object.keys(actual).map(k=>[k,row[k]])),'Independent public PNG metrics differ: '+name);
export function verifyCalcTrialPixels(bundle){
  const report=bundle.report;assert.equal(report.schemaVersion,1);assert.equal(report.role,'calc-current-candidate-trial');assert.equal(report.completed,true);assert.equal(report.phase,'complete');
  assert.equal(report.converterInvoked,false);assert.equal(report.nativeToolInvoked,false);assert.equal(report.verdict,'trial-pass');
  assert.ok(report.artifacts&&Object.keys(report.artifacts).length>0,'Missing public artifact manifest');
  assert.equal(report.approvedImagePolicy,false);assert.equal(report.imageConformanceClaim,false);assert.equal(report.imageAdmission,'pending');
  const ownedReference=calcTrialOwned(bundle,'reference'),candidate=calcTrialOwned(bundle,'candidate'),reference=readCalcTrialReference(ownedReference);
  assert.equal(ownedReference.sha256,report.inputs.reference.sha256);assert.equal(candidate.sha256,report.inputs.candidate.sha256);
  const evidence=readCalcTrialCandidate(candidate,reference);
  calcEqual(bundle.json('native-agreement.json'),{anchors:evidence.checks,paths:evidence.paths,bounds:evidence.bounds},'Saved public native quantities differ');
  const svg=candidate.files.get('actual.svg').toString(),root=/^<svg\b([^>]+)>/.exec(svg);assert.ok(root,'Missing public SVG root');
  const attrs=Object.fromEntries([...root[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]])),view=attrs.viewBox.split(/\s+/).map(Number);
  assert.equal(attrs.width,view[2]+'px');assert.equal(attrs.height,view[3]+'px');
  const frames=['x','y','width','height'].map((name,i)=>({name,reference:reference.primaryFrame.serializedBounds[name],actual:view[i],limit:0,units:'serialized CSS px',passed:view[i]===reference.primaryFrame.serializedBounds[name]}));
  assert.ok(frames.every(f=>f.passed));calcEqual(frames,bundle.json('root-frame.json'),'Public root frame summary differs');
  const pngs=new Map(),metrics=new Map(),ink=new Map();let pairs=0,regionalChecks=0;
  function png(file){const digest=report.artifacts[file];assert.ok(digest,'Missing public image '+file);if(!pngs.has(digest))pngs.set(digest,bundle.png(file));return pngs.get(digest);}
  const metric=(a,b,options,key)=>{if(!metrics.has(key))metrics.set(key,compare(a.rgba,b.rgba,options));return metrics.get(key);};
  function pixels(row,kind){
    pairs++;assert.equal(row.converterInvoked,false);const primary=kind==='primary',a=png(row.images[primary?'reference':'pdf']),b=png(row.images[primary?'actual':'svg']);
    assert.equal(a.width,b.width);assert.equal(a.height,b.height);const expected=primary?{width:reference.primaryFrame.camera.width*row.scale,height:reference.primaryFrame.camera.height*row.scale}:reference.registration.camera.rasterSizes[row.scale+'x'];
    calcEqual({width:a.width,height:a.height},expected,'Public PNG camera dimensions differ');
    const options={...expected,scale:row.scale,background:row.background,maskThreshold:16},key=report.artifacts[row.images[primary?'reference':'pdf']]+'/'+report.artifacts[row.images[primary?'actual':'svg']]+'/'+row.scale+'/'+row.background;
    const whole=metric(a,b,options,key);metricEqual(whole,primary?row.metrics:row.whole,row.file);
    const regions=primary?reference.primaryFrame.regions:reference.registration.regions.slice(1);
    calcEqual(row.regions.map(r=>({id:r.id,rectangle:r.rectangle,...(!primary?{rasterRectangles:r.rasterRectangles}:{})})),
      regions.map(r=>({id:r.id,rectangle:r.rectangle,...(!primary?{rasterRectangles:r.rasterRectangles}:{})})),'Public region coverage or camera differs');
    for(const r of row.regions){const q=primary?Object.fromEntries(Object.entries(r.rectangle).map(([k,v])=>[k,v*row.scale])):r.rasterRectangles[row.scale+'x'];
      metricEqual(metric(a,b,{...options,rectangle:q},key+'/'+r.id),r,row.file+'/'+r.id);}
    if(primary){assert.equal(row.candidateInput,true);
      const leftKey=report.artifacts[row.images.reference],rightKey=report.artifacts[row.images.actual];
      metricEqual(metric(a,a,options,leftKey+'/'+leftKey+'/'+row.scale+'/'+row.background),row.repeat,row.file+'/reference-repeat');
      metricEqual(metric(b,b,options,rightKey+'/'+rightKey+'/'+row.scale+'/'+row.background),row.actualRepeat,row.file+'/actual-repeat');regionalChecks+=24;}
    else{assert.equal(row.candidateInput,row.route==='candidate-svg');assert.equal(row.background,'white');
      const page=png(row.images['svg-page']);assert.deepEqual(page.rgba,b.rgba,'Public PDF whole/page pixels differ');
      calcEqual(row.fullPage,{exactRgbaMatch:whole.exactRgbaMatch,rawChangedPixels:whole.rawChangedPixels,maxRawChannelError:whole.maxRawChannelError},'Public PDF full-page summary differs');
      assert.equal(row.outsideWholeChangedPixels,0);calcEqual(row.pageSize,expected,'Public PDF page size differs');
      const pageKey=key+'/ink';if(!ink.has(pageKey))ink.set(pageKey,calcPdfInk(a.rgba,page.rgba,a.width,reference.registration.regions,row.scale));
      calcEqual(ink.get(pageKey),row.ink,'Independent public RGB ink/moments differ');
      calcEqual(row.repeat,{pdf:{exactRgbaMatch:true,rawChangedPixels:0,maxRawChannelError:0},svg:{exactRgbaMatch:true,rawChangedPixels:0,maxRawChannelError:0}},'Public PDF repeat differs');regionalChecks+=27;
    }
    return whole;
  }
  function expand(index,kind){const keys=['file','frame','scale','background',kind==='primary'?'capture':'route'];calcEqual(Object.keys(index).sort(),keys.sort(),'Invalid public record index');
    const row=bundle.json(index.file);for(const k of keys)if(k!=='file')calcEqual(row[k],index[k],'Public record index differs');if(row.file!==undefined)assert.equal(row.file,index.file);return{...row,...index};}
  function coverage(indexes,kind,prefix,{bothRoutes=false}={}){
    const views=kind==='primary'?calcPrimaryViews:calcPdfViews,routes=bothRoutes?['original-svg','candidate-svg']:[null];
    calcEqual(indexes.map(i=>i.file).sort(),routes.flatMap(route=>views.map(v=>prefix+'/'+(route?route+'/':'')+(kind==='primary'?calcPrimaryKey(v):calcPdfKey(v))+'/record.json')).sort(),'Public view coverage differs');
    const rows=indexes.map(i=>expand(i,kind));for(const r of rows){if(kind==='pdf'&&!bothRoutes)assert.equal(r.route,'candidate-svg');
      assert.equal(r.file,prefix+'/'+(bothRoutes?r.route+'/':'')+(kind==='primary'?calcPrimaryKey(r):calcPdfKey(r))+'/record.json','Public path/view tuple differs');}return rows;
  }
  const primary=coverage(report.primary,'primary','primary'),pdf=coverage(report.pdf,'pdf','pdf',{bothRoutes:true});
  for(const row of primary){pixels(row,'primary');const e=evaluateCalcPrimary(reference.primaryPolicy,row);calcEqual(e,row.evaluation,'Public primary verdict differs');assert.equal(e.passed,true);}
  for(const row of pdf){pixels(row,'pdf');const e=evaluateCalcPdf(reference.pdfPolicy,row);calcEqual(e,row.evaluation,'Public PDF verdict differs');assert.equal(e.passed,true);}
  for(const[kind,indexes,prefix,base]of [['primary',report.primaryReplay,'replay/primary',primary],['pdf',report.pdfReplay,'replay/pdf',pdf]])
    for(const row of coverage(indexes,kind,prefix,{bothRoutes:kind==='pdf'})){pixels(row,kind);const first=base.find(b=>kind==='primary'?calcPrimaryKey(b)===calcPrimaryKey(row):b.route===row.route&&calcPdfKey(b)===calcPdfKey(row));
      for(const k of kind==='primary'?['metrics','regions','naturalFrames']:['whole','regions','ink','fullPage','sourceFrame','clipFrame'])calcEqual(row[k],first[k],'Public replay differs');
      for(const k of kind==='primary'?['reference','actual']:['pdf','svg','svg-page'])assert.equal(report.artifacts[row.images[k]],report.artifacts[first.images[k]],'Public replay PNG differs');}
  function visible(row,base,kind){const a=png(base.images[kind==='primary'?'actual':'svg-page']),b=png(row.images[kind==='primary'?'actual':'svg-page']);return !a.rgba.every((v,i)=>v===b.rgba[i]);}
  const declarations=calcPrimaryDefects.filter(d=>!d.rendererOnly);calcEqual(report.defects.map(d=>d.name).sort(),declarations.map(d=>d.name).sort(),'Public defect family coverage differs');
  let visiblePrimary=0,invisiblePrimary=0,visiblePdf=0,invisiblePdf=0,visibleControlledPrimary=0,visibleControlledPdf=0;
  for(const d of report.defects){const expected=declarations.find(e=>e.name===d.name);for(const[k,v]of Object.entries(expected))calcEqual(d[k],v,'Public defect declaration differs');assert.equal(d.numericChecksBypassed,true);
    for(const kind of ['primary','pdf'])for(const row of coverage(d[kind],kind,'defects/'+d.name+'/'+kind)){
      pixels(row,kind);const e=kind==='primary'?evaluateCalcPrimary(reference.primaryPolicy,row):evaluateCalcPdf(reference.pdfPolicy,row);calcEqual(e,row.evaluation,'Public defect verdict differs');
      const expectedVisible=(kind==='pdf'||row.background!=='black'||d.name==='wrong-color')&&(!d.naturalOnly||row.frame==='natural')&&(!d.expandedOnly||row.frame==='expanded');
      const base=kind==='primary'?primary.find(b=>calcPrimaryKey(b)===calcPrimaryKey(row)):pdf.find(b=>b.route==='candidate-svg'&&calcPdfKey(b)===calcPdfKey(row));
      assert.equal(visible(row,base,kind),expectedVisible,'Decoded public defect visibility differs');assert.equal(row.observedVisible,expectedVisible);assert.equal(row.expectedVisible,expectedVisible);assert.equal(e.passed,!expectedVisible);
      if(expectedVisible){const target=kind==='pdf'&&d.name==='outside-ink'?'page-corner':d.target;assert.ok(e.checks.some(c=>c.id===target&&!c.passed));if(kind==='primary')visiblePrimary++;else visiblePdf++;}
      else if(kind==='primary')invisiblePrimary++;else invisiblePdf++;
    }
  }
  calcEqual(report.controls.map(c=>c.id),['lost-half-clip','opacity-0-01','opacity-0-001'],'Public controlled family coverage differs');
  for(const c of report.controls){assert.equal(c.rendererOnly,true);assert.equal(c.candidateOnlyBaseline,true);assert.equal(c.numericChecksBypassed,true);
    for(const kind of ['primary','pdf']){
      const unchanged=coverage(c[kind+'Unchanged'],kind,'controls/'+c.id+'/'+kind+'/unchanged'),altered=coverage(c[kind+'Altered'],kind,'controls/'+c.id+'/'+kind+'/altered');
      for(const row of unchanged){pixels(row,kind);if(kind==='primary')assert.equal(row.metrics.rawChangedPixels,0);}
      const policy=kind==='pdf'?deriveCalcPdfInkPolicy(unchanged,c.scope):null;if(policy)calcEqual(policy,c.inkPolicy,'Controlled public ink policy differs');
      for(const row of altered){const m=pixels(row,kind),base=unchanged.find(b=>kind==='primary'?calcPrimaryKey(b)===calcPrimaryKey(row):calcPdfKey(b)===calcPdfKey(row)),observed=visible(row,base,kind);
        assert.equal(row.observedVisible,observed);
        if(kind==='primary'){assert.equal(m.rawChangedPixels>0,observed);assert.equal(row.exactControlPassed,!observed);assert.equal(row.regions.find(r=>r.id===c.target).rawChangedPixels>0,observed);visibleControlledPrimary+=observed;}
        else{const e=evaluateCalcPdfInk(policy,row);calcEqual(e,row.evaluation,'Controlled public ink verdict differs');assert.equal(e.passed,!observed);if(observed)assert.ok(e.checks.some(g=>g.id===c.target&&!g.passed));visibleControlledPdf+=observed;}
      }
    }
  }
  calcEqual(report.gates,{numeric:{state:'passed',checks:466},frame:{state:'passed',checks:10},primary:{state:'passed',views:24},originalPdf:{state:'passed',views:4},candidatePdf:{state:'passed',views:4},
    comparator:{state:'passed',opaquePrimaryViews:264,opaquePdfViews:44,controlledViews:168}},'Public combined gate summary differs');
  assert.equal(pairs,540);assert.equal(regionalChecks,13212);
  return{numericChecks:466,frameChecks:10,primaryViews:24,pdfViews:8,replayViews:32,opaquePrimaryViews:264,opaquePdfViews:44,
    visiblePrimary,invisiblePrimary,visiblePdf,invisiblePdf,controlledViews:168,visibleControlledPrimary,visibleControlledPdf,decodedPairs:pairs,regionalChecks,
    approvedImagePolicy:false,imageConformanceClaim:false};
}
export function verifyCalcTrialRecapture(saved,fresh,args){
  calcEqual(Object.keys(saved.report.artifacts).sort(),Object.keys(fresh.report.artifacts).sort(),'Public trial artifact coverage differs');
  const report=structuredClone(fresh.report),agent=fresh.json('agent-inspection.json');
  for(const[i,key]of ['candidate','reference'].entries()){
    assert.equal(report.inputs[key].file,args[i]);report.inputs[key].file=saved.report.inputs[key].file;
    assert.equal(agent.rerun.arguments[i+1],args[i]);agent.rerun.arguments[i+1]=saved.json('agent-inspection.json').rerun.arguments[i+1];}
  report.artifacts['agent-inspection.json']=calcHash(Buffer.from(JSON.stringify(agent,null,2)+'\n'));
  for(const[f,digest]of Object.entries(saved.report.artifacts))assert.equal(digest,report.artifacts[f],'Public trial source reconstruction differs: '+f);
  assert.equal(saved.sha256,calcHash(Buffer.from(JSON.stringify(report,null,2)+'\n')),'Public trial report differs after declared path normalization');
  return{artifacts:saved.files.size,pngs:[...saved.files.keys()].filter(f=>f.endsWith('.png')).length,exactImageBytes:true,
    provenanceOnlyNormalization:['candidate/reference input paths','agent rerun input paths and resulting digest']};
}
