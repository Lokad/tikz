// Public prospective trial against previously frozen independent ink limits.
// A trial pass is research evidence; it does not admit a primary/PDF profile.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadLabelledBorderEvidence} from './labelled-border-evidence.mjs';
import {runLabelledResearchTool,saveLabelledImages} from './labelled-border-research.mjs';
import {validateLabelledInkCalibration,validateLabelledInkTrial} from './labelled-border-coverage.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics,measureShapePair} from './shape-image-pair.mjs';
import {shapeViews,deriveShapeTrialPolicy,evaluateShapeTrial,combineShapeTrial} from './shape-primary-trial-policy.mjs';

const base=path.join(root,'artifacts/labelled-border-primary-trial'),output=path.join(base,'run-'+randomUUID()),artifacts={},toolHashes={};let phase='arguments';
const save=(p,b)=>writeArtifact(output,p,b,artifacts),read=p=>readFile(path.join(output,p));
async function publish(r){const b=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(output,'report.json',b);await writeArtifact(base,'latest.json',JSON.stringify({completed:r.completed,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');}
async function main(){
  assert.equal(process.argv.length,2);await publish({completed:false,phase,approvedImagePolicy:false,imageConformanceClaim:false});
  phase='independent-calibration';const evidence=await loadLabelledBorderEvidence(),location=JSON.parse(await readFile(path.join(root,'artifacts/labelled-border-ink-calibration/latest.json')));
  assert.equal(location.completed,true);assert.match(location.report,/^run-[a-f0-9-]+\/report.json$/);const sourceFolder=path.dirname(path.join(root,'artifacts/labelled-border-ink-calibration',location.report)),bytes=await readFile(path.join(sourceFolder,'report.json'));
  assert.equal(sha256(bytes),location.sha256);const calibration=JSON.parse(bytes);assert.equal(calibration.completed,true);assert.equal(calibration.converterInvoked,false);assert.equal(calibration.approvedImagePolicy,false);assert.equal(calibration.imageConformanceClaim,false);
  assert.equal(calibration.snapshotSha256,evidence.snapshotSha256);assert.equal(calibration.selectedRepresentation,'native-pt-short-glyph-six');assert.deepEqual(calibration.cases.map(c=>c.caseId),['lines','paths','transforms']);
  validateLabelledInkCalibration(calibration,calibration.cases.map(c=>c.frame));
  for(const[p,h]of Object.entries(calibration.artifacts)){const b=await readFile(await outputPath(sourceFolder,p));assert.equal(sha256(b),h);await save('calibration/'+p,b);}
  await save('calibration/report.json',bytes);
  for(const[p,h]of Object.entries(calibration.toolHashes))assert.equal(sha256(Buffer.from((await readFile(path.join(root,p),'utf8')).replaceAll('\r\n','\n'))),h);
  for(const c of calibration.cases){assert.equal(c.observations.length,12);assert.deepEqual(deriveShapeTrialPolicy(c.observations.map(r=>({...r,...r.metrics})),c.caseId+' labeled-border native-ink trial'),c.policy);}
  for(const file of['trial-labelled-border-primary.mjs','labelled-border-coverage.mjs','labelled-border-image-defects.mjs','labelled-border-research.mjs','shape-primary-trial-policy.mjs','shape-frame-math.mjs','shape-image-pair.mjs','shape-raster-metrics.mjs','shape-oracle-bundle.mjs','labelled-border-evidence.mjs','compare.mjs','browser-profile.json','package-lock.json']){
    const p='tools/TikzVisual/'+file,b=Buffer.from((await readFile(path.join(root,p),'utf8')).replaceAll('\r\n','\n'));toolHashes[p]=sha256(b);await save('tool-sources/'+p,b);}
  phase='public-conversion';const numeric=await runLabelledResearchTool(output,'TikzLabelledBorderComparison','candidate',save,artifacts),renderer=await createRenderer();
  try{
    assert.deepEqual(renderer.identity,calibration.renderer);await installShapeMetrics(renderer);const cases=[];
    for(const c of calibration.cases){const id=c.caseId,frame=c.frame,reference=evidence.files.get('tests/Reference/LabelledBorders/'+id+'/probed-reference.svg').toString('utf8'),actual=(await read('candidate/'+id+'/actual.svg')).toString('utf8');
      const scene=JSON.parse(await read('candidate/'+id+'/actual-scene.json')),bounds=[];
      for(const r of c.ink.records){const candidate=r.kind==='glyph'?scene.glyphs[r.glyphIndex]:scene.paths[r.nativePathIndex];assert.ok(candidate);for(const k of['minX','minY','maxX','maxY']){
        const observed=candidate.inkBounds[k],expected=r.bound[k],delta=Math.abs(observed-expected),limit=1e-8;bounds.push({quantity:r.id+'.'+k,expected,observed,delta,limit,passed:Number.isFinite(observed)&&delta<=limit,source:candidate.source});}}
      const natural=await renderer.page.evaluate(source=>{const d=new DOMParser().parseFromString(source,'image/svg+xml'),s=d.documentElement;if(d.querySelector('parsererror')||d.doctype)throw Error('Invalid candidate SVG.');return s.getAttribute('viewBox').split(/[ ,]+/).map(Number);},actual);
      assert.equal(natural.length,4);for(let i=0;i<4;i++){const expected=c.rootChecks[i].serialized,observed=natural[i],delta=Math.abs(observed-expected),limit=.000001;bounds.push({quantity:'root.'+c.rootChecks[i].quantity,expected,observed,delta,limit,passed:Number.isFinite(observed)&&delta<=limit});}
      const rows=[];phase='public-primary/'+id;
      for(const view of shapeViews){const prefix=id+'/'+view.frame+'-'+view.scale+'x-'+view.background,m=await measureShapePair(renderer,{reference,actual,leftIsDriver:true,origin:frame.origin,camera:frame.camera,regions:frame.regions,...view,rightLabel:'Public ink trial',cropLimit:2,cropRegionIds:[id==='lines'?'glyph-6':'glyph-0','path-'+(scene.paths.length-1)]});
        assert.equal(m.repeat.rawChangedPixels,0);rows.push({...view,...await saveLabelledImages(save,prefix,m),evaluation:evaluateShapeTrial(c.policy,view,m)});}
      const passedBounds=bounds.every(b=>b.passed),numericCase=numeric.cases.find(q=>q.caseId===id);
      const combined=combineShapeTrial({state:numericCase.numericPassed?'passed':'failed',executedChecks:numericCase.checks},{state:passedBounds?'passed':'failed',executedChecks:bounds.length},rows);
      cases.push({caseId:id,nativeInkChecks:bounds,comparisons:rows,combined});console.log(id+': '+combined.verdict+'; '+bounds.filter(b=>!b.passed).length+' ink/root failures.');
    }
    for(const[p,h]of Object.entries(artifacts))assert.equal(sha256(await read(p)),h);for(const[p,h]of Object.entries(toolHashes))assert.equal(sha256(Buffer.from((await readFile(path.join(root,p),'utf8')).replaceAll('\r\n','\n'))),h);
    const after=await loadLabelledBorderEvidence();assert.equal(after.snapshotSha256,evidence.snapshotSha256);const passed=cases.every(c=>c.combined.passed);
    await save('index.html','<!doctype html><meta charset="utf-8"><h1>Public labeled-border primary trial</h1><p>Unapproved trial; PDF/combined admission pending.</p><a href="report.json">Report</a>'+cases.map(c=>'<h2>'+c.caseId+': '+c.combined.verdict+'</h2>'+c.comparisons.filter(r=>r.scale===1&&r.background==='white').map(r=>'<p>'+r.frame+'</p><img src="'+r.images.comparison+'">').join('')).join(''));
    const report={schemaVersion:1,comparisonKind:'public-labelled-border-primary-trial',completed:true,trialPassed:passed,overallVerdict:'pending',approvedImagePolicy:false,imageConformanceClaim:false,
      calibrationSha256:location.sha256,snapshotSha256:evidence.snapshotSha256,toolHashes,renderer:renderer.identity,numeric:{passed:numeric.numericPassed,checks:1624,report:'candidate/report.json'},cases,
      coverage:{views:36,localObservations:1944,inkRootChecks:cases.reduce((n,c)=>n+c.nativeInkChecks.length,0)},pdf:{state:'pending'},artifacts};
    validateLabelledInkTrial(report,calibration);await publish(report);
    process.exitCode=passed?0:1;
  }finally{await renderer.browser.close();}
}
await main().catch(async error=>{process.exitCode=2;console.error(error.stack);await publish({completed:false,phase,approvedImagePolicy:false,imageConformanceClaim:false,error:error.message.replaceAll(root,'<repo>'),artifacts});});
