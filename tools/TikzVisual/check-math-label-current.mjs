// Acceptance gap: reconcile current views, source binding and decoded pixels across math gates.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {root,writeArtifact,sha256} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport,calcEqual} from './calc-saved-images.mjs';
import {pathLabelPrimaryPixelReader} from './path-label-primary-pixels.mjs';
import {pdfPagePixelReader} from './path-label-pdf-pixels.mjs';
import {shapePdfViews} from './shape-pdf-trial-policy.mjs';
import {mathFramingFamily} from './math-label-framing.mjs';
import {mathPrimaryKey,evaluateMathPrimary} from './math-label-primary.mjs';
import {currentPrimaryViews,reportVerificationMode} from './verification-views.mjs';
import {mathPdfKey,evaluateMathPdf} from './math-label-pdf-images.mjs';
import {mathFramingNumeric} from './check-math-label-framing.mjs';
import {mathLabelCacheReports,styledLabelCacheReports} from './math-label-cache-inputs.mjs';

export function verifyMathCurrentAnchors(scene,measurements){
 const ids=new Map(measurements.nodes.map((n,i)=>[n.name,i])),sp=72.27*65536/72;let checks=0;
 for(const a of measurements.anchors)for(const coordinate of ['x','y']){
  const value=scene.nodes[ids.get(a.name)].anchorsBp[a.anchor][coordinate];
  assert.equal(Math.sign(value)*Math.round(Math.abs(value*sp)),a[coordinate+'Sp'],'Wrong integer math anchor: '+a.name+'/'+a.anchor+'/'+coordinate);checks++;
 }
 return checks;
}

export function verifyMathCurrentLabels(scene,measurements){
 assert.equal(scene.nodes.length,measurements.nodes.length);let checks=0;
 for(const[n,native]of measurements.nodes.entries())for(const key of ['widthSp','heightSp','depthSp']){
  assert.equal(scene.nodes[n].text[key],native[key],'Wrong integer text dimension: '+native.name+'/'+key);checks++;
 }
 return checks;
}

export function verifyMathCurrentPixels(primary,pdf,primaryCalibration,pdfCalibration){
 const mode=reportVerificationMode(primary,pdf),views=currentPrimaryViews(mode);
 assert.equal(pdf.report.reusedOriginalReference??false,mode==='iteration','Changed original-reference reuse policy.');
 const family=mathFramingFamily(primary.report.cases.map(c=>c.id)),styled=family.length===1,
  owners=styled?styledLabelCacheReports:mathLabelCacheReports,expected=styled
   ?{primary:24,pdf:8,primaryRegions:2400,pdfRegions:808,anchors:288,boxes:27}
   :{primary:72,pdf:24,primaryRegions:15144,pdfRegions:5072,anchors:2048,boxes:192};
 expected.primary=family.length*views.length;expected.primaryRegions=expected.primaryRegions/24*views.length;
 assert.equal(primaryCalibration.sha256,owners[2].sha256);assert.equal(pdfCalibration.sha256,owners[6].sha256);
 for(const b of [primaryCalibration,pdfCalibration])calcEqual(b.report.cases.map(c=>c.id),family.map(c=>c.id));
 assert.equal(primary.report.calibrationSha256,primaryCalibration.sha256);assert.equal(pdf.report.calibrationSha256,pdfCalibration.sha256);
 assert.ok(primary.files.get('inputs/calibration-report.json').equals(primaryCalibration.bytes));
 assert.ok(pdf.files.get('calibration/report.json').equals(pdfCalibration.bytes));
 for(const[f,b]of pdfCalibration.files)assert.ok(pdf.files.get('calibration/'+f).equals(b),'Changed owned PDF calibration.');
 assert.equal(primary.report.nativeToolInvoked,false);assert.equal(pdf.report.nativeToolInvoked,false);
 assert.equal(primary.report.publicInputSha256,pdf.report.publicInputSha256,'Split current math source.');
 const publicBytes=primary.files.get('inputs/public-report.json');assert.equal(sha256(publicBytes),primary.report.publicInputSha256);
 assert.ok(publicBytes.equals(pdf.files.get('public/report.json')));const exported=JSON.parse(publicBytes);
 calcEqual(exported.records.map(r=>r.id),family.map(c=>c.id));
 for(const[f,b]of primary.files)if(f.startsWith('public/'))assert.ok(pdf.files.get(f).equals(b),'Changed owned public output.');
 calcEqual(pdf.report.cases.map(c=>c.id),family.map(c=>c.id));
 calcEqual(pdf.report.records.map(r=>r.caseId+'/'+r.mode+'/'+mathPdfKey(r)).sort(),family.flatMap(c=>['original','candidate'].flatMap(mode=>shapePdfViews.map(v=>c.id+'/'+mode+'/'+mathPdfKey(v)))).sort());
 calcEqual(primary.report.checked,{decodedPairs:expected.primary,regionChecks:expected.primaryRegions,sourceRecaptures:expected.primary,identicalNativeViews:primary.report.checked.identicalNativeViews});
 calcEqual(pdf.report.checked,{decodedPairs:expected.pdf,regionChecks:expected.pdfRegions,sourceRecaptures:mode==='iteration'?expected.pdf/2:expected.pdf});
 calcEqual(pdf.report.gates,Object.fromEntries(['original','candidate'].map(mode=>[mode,{passed:pdf.report.records.filter(r=>r.mode===mode).every(r=>r.passed),views:expected.pdf/2}])));
 const native={files:new Map([...pdfCalibration.files].filter(([f])=>f.startsWith('native/')).map(([f,b])=>[f.slice(7),b]))};
 let primaryViews=0,pdfViews=0,primaryRegionChecks=0,pdfRegionChecks=0,anchorCoordinateChecks=0,boxDimensionChecks=0;
 for(const declared of family){
  const id=declared.id,frame=primaryCalibration.json(id+'/frame.json'),pdfFrame=pdfCalibration.json(id+'/pdf-frame.json'),summary=primary.report.cases.find(c=>c.id===id);
  calcEqual(primary.json(id+'/frame.json'),frame);calcEqual(summary.views.map(mathPrimaryKey).sort(),views.map(mathPrimaryKey).sort());
  const record=exported.records.find(r=>r.id===id),svg=primary.files.get('public/'+id+'/actual.svg');
  assert.equal(record.publicTraceParity,true);assert.equal(record.svgSha256,sha256(svg));
  const scene=primary.json('public/'+id+'/actual-scene.json'),measurements=primaryCalibration.json('events/'+id+'/measurements.json');
  anchorCoordinateChecks+=verifyMathCurrentAnchors(scene,measurements);
  boxDimensionChecks+=verifyMathCurrentLabels(scene,measurements);
  assert.equal(scene.glyphs.length,declared.glyphs);assert.equal(scene.rules.length,declared.rules);
  const numeric=mathFramingNumeric(frame,scene,svg.toString(),measurements);
  calcEqual(primary.json(id+'/numeric.json'),numeric);assert.equal(numeric.boundsContract.passed,true);assert.ok(numeric.checks.filter(c=>c.name.startsWith('root.')).every(c=>c.passed));
  const readPrimary=pathLabelPrimaryPixelReader(primary,frame),policies=primaryCalibration.json(id+'/policies.json');
  for(const index of summary.views){assert.equal(index.file,id+'/'+mathPrimaryKey(index)+'/record.json');const row=readPrimary(index.file);
   assert.equal(mathPrimaryKey(row),mathPrimaryKey(index));const verdict=evaluateMathPrimary(policies,row);calcEqual(row.evaluation,verdict);assert.equal(index.passed,verdict.passed);assert.equal(verdict.passed,true);
   primaryViews++;primaryRegionChecks+=row.regions.length;
  }
  const readPdf=pdfPagePixelReader(pdf,pdfFrame,'calibration/native/'+id),pdfPolicies=pdfCalibration.json(id+'/policies.json');
  const source=pdf.json(id+'/views/candidate/natural/1x/record.json').sourceFrame,b=frame.root;
  assert.ok([source.x-b.minX,source.y-b.minY,source.x+source.width-b.maxX,source.y+source.height-b.maxY].every(v=>Number.isFinite(v)&&Math.abs(v)<=1.1e-6),'Wrong intrinsic math frame.');
  const records=pdf.report.records.filter(r=>r.caseId===id);calcEqual(pdf.report.cases.find(c=>c.id===id).views,records);
  for(const index of records){assert.equal(index.file,id+'/views/'+index.mode+'/'+mathPdfKey(index)+'/record.json');const row=readPdf(index.file);
   if(mode==='iteration'&&index.mode==='original'){
    const nativeIndex=pdfCalibration.report.records.find(r=>r.caseId===id&&r.encoding==='original'&&mathPdfKey(r)===mathPdfKey(index));assert.ok(nativeIndex);
    const original=pdfCalibration.json(nativeIndex.file),{mode:ignoredMode,evaluation:ignored,...saved}=row;
    calcEqual(saved,original,'Changed reused original math PDF observation.');
    for(const image of Object.values(row.images))assert.ok(pdf.files.get(image).equals(pdfCalibration.files.get(image)),'Changed reused original math PNG.');
   }
   assert.equal(row.mode,index.mode);assert.equal(mathPdfKey(row),mathPdfKey(index));if(index.mode==='candidate')calcEqual(row.sourceFrame,source);
   const view={frame:index.frame,scale:index.scale,background:index.background},verdict=evaluateMathPdf(pdfPolicies[index.mode],view,row,{caseId:id,native,files:pdf.files});
   calcEqual(row.evaluation,verdict,'Changed decoded math PDF verdict.');assert.equal(index.passed,verdict.passed);assert.equal(verdict.passed,true);
   pdfViews++;pdfRegionChecks+=pdfFrame.regions.length;
  }
 }
 assert.equal(primaryViews,expected.primary);assert.equal(pdfViews,expected.pdf);assert.equal(primaryRegionChecks,expected.primaryRegions);assert.equal(pdfRegionChecks,expected.pdfRegions);assert.equal(pdf.report.pdfPassed,true);
 assert.equal(anchorCoordinateChecks,expected.anchors);assert.equal(boxDimensionChecks,expected.boxes);
 return{passed:true,verificationMode:mode,fixtures:family.length,boxDimensionChecks,anchorCoordinateChecks,primaryViews,pdfViews,primaryRegionChecks,pdfRegionChecks,reusedOriginalReferenceViews:mode==='iteration'?pdfViews/2:0,currentSourceRecaptures:primaryViews+(mode==='iteration'?pdfViews/2:pdfViews)};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,6,'Usage: check-math-label-current.mjs <current-primary> <current-PDF> <native-primary-calibration> <native-PDF-calibration>');
 const roles=['math-label-current-primary-iteration','math-label-current-pdf-iteration','math-label-native-primary-calibration','math-label-native-pdf-calibration'];
 const bundles=[];for(const[i,f]of process.argv.slice(2).entries())bundles.push(await loadCalcSavedReport(path.resolve(root,f),roles[i]));
 const sources={...bundles[0].report.sources,...bundles[1].report.sources};
 for(const b of bundles.slice(0,2))for(const[f,h]of Object.entries(b.report.sources))assert.equal(sha256(await readFile(path.join(root,f))),h,'Changed current math dependency: '+f);
 const result=verifyMathCurrentPixels(...bundles);
 for(const[f,h]of Object.entries(sources))assert.equal(sha256(await readFile(path.join(root,f))),h);
 const output=path.join(root,'artifacts/math-current-check/run-'+randomUUID()),artifacts={};
 for(const[i,b]of bundles.entries())await writeArtifact(output,'inputs/'+roles[i]+'.json',b.bytes,artifacts);
 await writeArtifact(output,'checker.mjs',await readFile(new URL(import.meta.url)),artifacts);
 const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'math-label-independent-current-check',completed:true,phase:'complete',converterInvoked:false,nativeToolInvoked:false,
  approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',inputs:bundles.map(b=>b.sha256),result,sources,artifacts},null,2)+'\n');
 await writeArtifact(output,'report.json',bytes);console.log(JSON.stringify({completed:true,report:path.relative(root,path.join(output,'report.json')).replaceAll('\\','/'),sha256:sha256(bytes)}));
}
