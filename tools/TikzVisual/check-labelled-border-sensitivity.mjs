// Independent or fresh-public image-only trials under the same frozen policy.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadLabelledBorderEvidence} from './labelled-border-evidence.mjs';
import {runLabelledResearchTool,saveLabelledImages} from './labelled-border-research.mjs';
import {labelledBorderDefects,labelledDefectExpectation,mutateLabelledBorderSvg} from './labelled-border-image-defects.mjs';
import {validateLabelledInkCalibration,validateLabelledSensitivity} from './labelled-border-coverage.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics,measureShapePair} from './shape-image-pair.mjs';
import {shapeViews,deriveShapeTrialPolicy,evaluateShapeTrial} from './shape-primary-trial-policy.mjs';

const publicCandidate=process.argv.length===3&&process.argv[2]==='--public';
const base=path.join(root,'artifacts/labelled-border-'+(publicCandidate?'public':'oracle')+'-sensitivity'),output=path.join(base,'run-'+randomUUID()),artifacts={},toolHashes={},controls=[];let phase='arguments';
const save=(p,b)=>writeArtifact(output,p,b,artifacts),read=p=>readFile(path.join(output,p));
async function publish(r){const b=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(output,'report.json',b);await writeArtifact(base,'latest.json',JSON.stringify({completed:r.completed,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');}
async function main(){
  assert.ok(process.argv.length===2||publicCandidate);await publish({completed:false,phase,converterInvoked:publicCandidate,approvedImagePolicy:false,imageConformanceClaim:false});
  const evidence=await loadLabelledBorderEvidence(),location=JSON.parse(await readFile(path.join(root,'artifacts/labelled-border-ink-calibration/latest.json')));assert.equal(location.completed,true);assert.match(location.report,/^run-[a-f0-9-]+\/report.json$/);
  const folder=path.dirname(path.join(root,'artifacts/labelled-border-ink-calibration',location.report)),bytes=await readFile(path.join(folder,'report.json'));assert.equal(sha256(bytes),location.sha256);const source=JSON.parse(bytes);
  assert.equal(source.completed,true);assert.equal(source.converterInvoked,false);assert.equal(source.approvedImagePolicy,false);assert.equal(source.snapshotSha256,evidence.snapshotSha256);
  validateLabelledInkCalibration(source,source.cases.map(c=>c.frame));
  for(const[p,h]of Object.entries(source.artifacts)){const b=await readFile(await outputPath(folder,p));assert.equal(sha256(b),h);await save('calibration/'+p,b);}await save('calibration/report.json',bytes);
  for(const[p,h]of Object.entries(source.toolHashes))assert.equal(sha256(Buffer.from((await readFile(path.join(root,p),'utf8')).replaceAll('\r\n','\n'))),h);
  for(const c of source.cases)assert.deepEqual(deriveShapeTrialPolicy(c.observations.map(r=>({...r,...r.metrics})),c.caseId+' labeled-border native-ink trial'),c.policy);
  for(const file of['check-labelled-border-sensitivity.mjs','labelled-border-coverage.mjs','labelled-border-image-defects.mjs','labelled-border-evidence.mjs','labelled-border-research.mjs','shape-frame-math.mjs','shape-oracle-bundle.mjs','shape-image-pair.mjs','shape-raster-metrics.mjs','shape-primary-trial-policy.mjs','compare.mjs','browser-profile.json','package-lock.json']){
    const p='tools/TikzVisual/'+file,b=Buffer.from((await readFile(path.join(root,p),'utf8')).replaceAll('\r\n','\n'));toolHashes[p]=sha256(b);await save('tool-sources/'+p,b);}
  const numeric=publicCandidate?await runLabelledResearchTool(output,'TikzLabelledBorderComparison','candidate',save,artifacts):null;if(numeric)assert.equal(numeric.numericPassed,true);
  const renderer=await createRenderer();try{
    assert.deepEqual(renderer.identity,source.renderer);await installShapeMetrics(renderer);const baseline=new Map(),baselines=[];
    for(const c of source.cases){const actual=publicCandidate?(await read('candidate/'+c.caseId+'/actual.svg')).toString('utf8'):(await readFile(path.join(folder,c.svg))).toString('utf8');baseline.set(c.caseId,{actual,rows:new Map()});
      const reference=evidence.files.get('tests/Reference/LabelledBorders/'+c.caseId+'/probed-reference.svg').toString('utf8');
      const views=[];for(const view of shapeViews.filter(v=>v.background==='white')){const m=await measureShapePair(renderer,{reference,actual,leftIsDriver:true,origin:c.frame.origin,camera:c.frame.camera,regions:c.frame.regions,...view,cropLimit:0});
        const evaluation=evaluateShapeTrial(c.policy,view,m);assert.equal(evaluation.passed,true,'Unchanged baseline failed frozen limits.');assert.equal(m.repeat.rawChangedPixels,0);baseline.get(c.caseId).rows.set(view.frame+'-'+view.scale,sha256(Buffer.from(m.images.actual,'base64')));
        views.push({...view,...await saveLabelledImages(save,c.caseId+'/baseline/'+view.frame+'-'+view.scale+'x-white',m),evaluation});}
      baselines.push({caseId:c.caseId,views});
    }
    for(const defect of labelledBorderDefects()){
      phase=defect.caseId+'/'+defect.name;const c=source.cases.find(c=>c.caseId===defect.caseId),actual=baseline.get(c.caseId).actual,changed=await renderer.page.evaluate(mutateLabelledBorderSvg,{source:actual,defect,publicCandidate,rootBox:c.ink.root});await save(phase+'.svg',changed);
      const reference=evidence.files.get('tests/Reference/LabelledBorders/'+c.caseId+'/probed-reference.svg').toString('utf8'),rows=[];
      for(const view of shapeViews.filter(v=>v.background==='white'&&(!defect.naturalOnly||v.frame==='natural'))){const m=await measureShapePair(renderer,{reference,actual:changed,leftIsDriver:true,origin:c.frame.origin,camera:c.frame.camera,regions:c.frame.regions,...view,cropLimit:defect.target?1:0,cropRegionIds:defect.target?[defect.target]:[],rightLabel:defect.name});
        assert.equal(m.repeat.rawChangedPixels,0);const evaluation=evaluateShapeTrial(c.policy,view,m),target=defect.target?evaluation.checks.find(q=>q.id===defect.target):evaluation.checks[0],exactPixels=sha256(Buffer.from(m.images.actual,'base64'))===baseline.get(c.caseId).rows.get(view.frame+'-'+view.scale);
        assert.ok(target);const expectedImageOutcome=labelledDefectExpectation(defect,view),expectedOutcomePassed=expectedImageOutcome==='pixel-identical'?evaluation.passed&&exactPixels:!evaluation.passed&&!target.passed&&!exactPixels;
        rows.push({...view,...await saveLabelledImages(save,phase+'/'+view.frame+'-'+view.scale+'x-white',m),evaluation,targetRejected:!target.passed,exactBaselinePixels:exactPixels,expectedImageOutcome,expectedOutcomePassed});
      }
      const passed=rows.every(r=>r.expectedOutcomePassed);
      controls.push({...defect,passed,numericGatesBypassed:true,views:rows});console.log(phase+': '+(passed?'expected image outcome':'UNEXPECTED outcome retained'));
    }
    for(const[p,h]of Object.entries(artifacts))assert.equal(sha256(await read(p)),h);for(const[p,h]of Object.entries(toolHashes))assert.equal(sha256(Buffer.from((await readFile(path.join(root,p),'utf8')).replaceAll('\r\n','\n'))),h);
    const after=await loadLabelledBorderEvidence();assert.equal(after.snapshotSha256,evidence.snapshotSha256);const passed=controls.every(c=>c.passed);
    await save('index.html','<!doctype html><meta charset="utf-8"><h1>Labeled-border image sensitivity</h1><p>Numeric gates bypassed; admission pending.</p><a href="report.json">Report</a>'+controls.map(c=>'<h2>'+c.caseId+'/'+c.name+': '+(c.passed?'expected':'UNEXPECTED')+'</h2>'+c.views.map(r=>'<p>'+r.frame+' '+r.scale+'x</p>'+r.regions.filter(q=>q.crops).map(q=>'<img src="'+q.crops.sheet+'">').join('')).join('')).join(''));
    const report={schemaVersion:1,comparisonKind:'labelled-border-image-only-sensitivity',completed:true,converterInvoked:publicCandidate,sourceKind:publicCandidate?'fresh-public':'independent-native',sensitivityPassed:passed,overallVerdict:'pending',approvedImagePolicy:false,imageConformanceClaim:false,
      calibrationSha256:location.sha256,snapshotSha256:evidence.snapshotSha256,renderer:renderer.identity,toolHashes,baselines,controls,coverage:{controls:controls.length,views:controls.reduce((n,c)=>n+c.views.length,0)},artifacts};
    validateLabelledSensitivity(report,source);await publish(report);process.exitCode=passed?0:1;
  }finally{await renderer.browser.close();}
}
await main().catch(async error=>{process.exitCode=2;console.error(error.stack);await publish({completed:false,phase,converterInvoked:publicCandidate,approvedImagePolicy:false,imageConformanceClaim:false,error:error.message.replaceAll(root,'<repo>'),completedControls:controls.map(c=>({name:c.caseId+'/'+c.name,passed:c.passed})),artifacts});});
