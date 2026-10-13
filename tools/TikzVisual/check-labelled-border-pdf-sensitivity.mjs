import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Full-diagram PDF image-only defects. Numeric gates cannot hide a blind spot.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadLabelledBorderEvidence} from './labelled-border-evidence.mjs';
import {loadLabelledPdfQualification,labelledPdfDefects,labelledPdfExpectedOutcome,labelledPdfViewKey} from './labelled-border-pdf-calibration-common.mjs';
import {validateLabelledPdfCalibration,validateLabelledPdfSensitivity} from './labelled-border-pdf-calibration-coverage.mjs';
import {mutateLabelledBorderSvg} from './labelled-border-image-defects.mjs';
import {shapePdfViews,evaluateShapePdfTrial} from './shape-pdf-trial-policy.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';
import {measureShapePdfPair} from './shape-pdf-image-pair.mjs';
import {saveLabelledPdfImages} from './labelled-border-pdf-viewport.mjs';

const base=path.join(root,'artifacts/labelled-border-pdf-sensitivity'),output=path.join(base,'run-'+randomUUID()),artifacts={},toolHashes={},controls=[],baselines=[];let phase='arguments';
const save=(p,b)=>writeArtifact(output,p,b,artifacts),read=p=>readFile(path.join(output,p));
async function publish(r){const b=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(output,'report.json',b);await writeArtifact(base,'latest.json',JSON.stringify({completed:r.completed,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');}
async function main(){
  for(const file of ['check-labelled-border-pdf-sensitivity.mjs','labelled-border-pdf-calibration-common.mjs','labelled-border-pdf-calibration-coverage.mjs','labelled-border-image-defects.mjs','labelled-border-pdf-rasterizer-coverage.mjs','labelled-border-pdf-diagnostics.mjs','labelled-border-pdf-vector.mjs','labelled-border-evidence.mjs','shape-pdf-trial-policy.mjs','shape-pdf-image-pair.mjs','shape-image-pair.mjs','shape-raster-metrics.mjs','shape-pdf-camera.mjs','shape-oracle-bundle.mjs','labelled-border-pdf-viewport.mjs','compare.mjs','browser-profile.json','package-lock.json']){const p='tools/TikzVisual/'+file,b=Buffer.from((await readFile(path.join(root,p),'utf8')).replaceAll('\r\n','\n'));toolHashes[p]=sha256(b);await save('tool-sources/'+p,b);}
  assert.equal(process.argv.length,2);await publish({completed:false,phase,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,toolHashes,artifacts});const evidence=await loadLabelledBorderEvidence(),qualification=await loadLabelledPdfQualification(),folder=path.join(root,'artifacts/labelled-border-pdf-calibration'),p=JSON.parse(await readFile(path.join(folder,'latest.json')));assert.equal(p.completed,true);assert.match(p.report,/^run-[a-f0-9-]+\/report.json$/);const input=path.dirname(path.join(folder,p.report)),bytes=await readFile(path.join(input,'report.json'));assert.equal(sha256(bytes),p.sha256);const calibration=JSON.parse(bytes);validateLabelledPdfCalibration(calibration,qualification.report);await save('calibration/report.json',bytes);
  for(const[file,h]of Object.entries(calibration.artifacts)){const b=await readFile(await outputPath(input,file));assert.equal(sha256(b),h,file);await save('calibration/'+file,b);}for(const[file,h]of Object.entries(calibration.toolHashes))assert.equal(sha256(Buffer.from((await readFile(path.join(root,file),'utf8')).replaceAll('\r\n','\n'))),h,file);
  const renderer=await createRenderer();try{
    requireRenderer(renderer.identity, calibration.renderer);await installShapeMetrics(renderer);const baseline=new Map();
    for(const c of calibration.cases){const source=(await read('calibration/'+c.svg.native)).toString('utf8'),pages=Object.fromEntries(await Promise.all([1,4].map(async s=>[s,'data:image/png;base64,'+(await read('calibration/'+c.pdfPages[s])).toString('base64')])));baseline.set(c.caseId,{source,pages,hashes:new Map()});const views=[];
      for(const view of shapePdfViews){const m=await measureShapePdfPair(renderer,{svg:source,units:'cssPixels',svgOriginBp:{x:0,y:0},camera:c.camera,regions:c.regions,...view,pdfPage:pages[view.scale],cropLimit:0});const evaluation=evaluateShapePdfTrial(c.policies.native,view,m);assert.equal(evaluation.passed,true);baseline.get(c.caseId).hashes.set(labelledPdfViewKey(view),sha256(Buffer.from(m.images['svg-page'],'base64')));views.push({mode:'native-ink',...await saveLabelledPdfImages(save,c.caseId+'/baseline/'+labelledPdfViewKey(view),m),evaluation});}
      baselines.push({caseId:c.caseId,views});
    }
    for(const defect of labelledPdfDefects()){phase=defect.caseId+'/'+defect.name;const c=calibration.cases.find(c=>c.caseId===defect.caseId),b=baseline.get(c.caseId),source=await renderer.page.evaluate(mutateLabelledBorderSvg,{source:b.source,defect,rootBox:c.ink.root,publicCandidate:false});await save(phase+'.svg',source);const views=[];
      for(const view of shapePdfViews.filter(v=>!defect.naturalOnly||v.frame==='natural')){const m=await measureShapePdfPair(renderer,{svg:source,units:'cssPixels',svgOriginBp:{x:0,y:0},camera:c.camera,regions:c.regions,...view,pdfPage:b.pages[view.scale],cropRegionIds:defect.target?[defect.target]:[],cropLimit:defect.target?1:0,rightLabel:defect.name}),evaluation=evaluateShapePdfTrial(c.policies.native,view,m),target=evaluation.checks.find(q=>q.id===(defect.target??'whole-picture')),exactBaselinePixels=sha256(Buffer.from(m.images['svg-page'],'base64'))===b.hashes.get(labelledPdfViewKey(view)),expectedImageOutcome=labelledPdfExpectedOutcome(defect,view);assert.ok(target);const expectedOutcomePassed=expectedImageOutcome==='pixel-identical'?evaluation.passed&&exactBaselinePixels:!evaluation.passed&&!target.passed&&!exactBaselinePixels;
        views.push({mode:'native-ink',...await saveLabelledPdfImages(save,phase+'/'+labelledPdfViewKey(view),m),evaluation,targetRejected:!target.passed,exactBaselinePixels,expectedImageOutcome,expectedOutcomePassed});
      }
      const passed=views.every(o=>o.expectedOutcomePassed);controls.push({...defect,numericGatesBypassed:true,passed,views});console.log(phase+': '+(passed?'expected PDF image outcome':'UNEXPECTED outcome retained'));
    }
    for(const[file,h]of Object.entries(artifacts))assert.equal(sha256(await read(file)),h,file);for(const[file,h]of Object.entries(toolHashes))assert.equal(sha256(Buffer.from((await readFile(path.join(root,file),'utf8')).replaceAll('\r\n','\n'))),h,file);assert.equal((await loadLabelledBorderEvidence()).snapshotSha256,evidence.snapshotSha256);const passed=controls.every(c=>c.passed);
    await save('index.html','<!doctype html><meta charset="utf-8"><h1>Labeled-border PDF image sensitivity</h1><p>Independent native image, numeric gates bypassed, unapproved frozen PDF limits.</p><a href="report.json">Report</a>'+controls.map(c=>'<h2>'+c.caseId+'/'+c.name+': '+(c.passed?'expected':'UNEXPECTED')+'</h2>'+c.views.map(o=>'<p>'+o.frame+' / '+o.scale+'x</p>'+o.regions.filter(q=>q.crops).map(q=>'<img src="'+q.crops.sheet+'">').join('')).join('')).join(''));
    const report={schemaVersion:1,comparisonKind:'independent-labelled-border-pdf-image-sensitivity',completed:true,converterInvoked:false,numericGatesBypassed:true,approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',sensitivityPassed:passed,calibrationSha256:p.sha256,snapshotSha256:evidence.snapshotSha256,renderer:renderer.identity,toolHashes,baselines,controls,coverage:{controls:32,views:126,baselines:12},agent:{viewer:'index.html',command:'node tools/TikzVisual/check-labelled-border-pdf-sensitivity.mjs'},artifacts};validateLabelledPdfSensitivity(report,calibration);await publish(report);process.exitCode=passed?0:1;
  }finally{await renderer.browser.close();}
}
await main().catch(async error=>{process.exitCode=2;console.error(error.stack);await publish({schemaVersion:1,completed:false,phase,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,error:error.message.replaceAll(root,'<repo>'),completedControls:controls.map(c=>({name:c.caseId+'/'+c.name,passed:c.passed})),toolHashes,artifacts});});
