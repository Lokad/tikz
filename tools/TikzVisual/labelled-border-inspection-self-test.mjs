import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadLabelledBorderEvidence} from './labelled-border-evidence.mjs';
import {buildLabelledBorderFrame} from './labelled-border-frame.mjs';
import {createRenderer} from './compare.mjs';
import {validateLabelledBorderInspectionCoverage} from './labelled-border-inspection-coverage.mjs';

const base=path.join(root,'artifacts/labelled-border-inspection-controls'),output=path.join(base,'run-'+randomUUID()),controls=[];
try{
  assert.equal(process.argv.length,2);const evidence=await loadLabelledBorderEvidence(),renderer=await createRenderer(),frames=[];
  try{for(const c of evidence.cases)frames.push(await buildLabelledBorderFrame(renderer,c,evidence.files.get('tests/Reference/LabelledBorders/'+c.fixture.id+'/probed-reference.svg').toString('utf8')));}finally{await renderer.browser.close();}
  const location=JSON.parse(await readFile(path.join(root,'artifacts/labelled-border-inspection/latest.json')));assert.equal(location.completed,true);
  assert.ok(/^run-[a-f0-9-]+\/report.json$/.test(location.report));const reportPath=path.join(root,'artifacts/labelled-border-inspection',location.report),bytes=await readFile(reportPath);assert.equal(sha256(bytes),location.sha256);
  const original=JSON.parse(bytes);assert.equal(original.snapshotSha256,evidence.snapshotSha256);
  validateLabelledBorderInspectionCoverage(original,frames);
  for(const[file,digest]of Object.entries(original.artifacts))assert.equal(sha256(await readFile(path.join(path.dirname(reportPath),file))),digest);
  function check(name,change,reject){const r=structuredClone(original);change(r);let error=null;try{validateLabelledBorderInspectionCoverage(r,frames);}catch(e){error=e.message;}
    assert.equal(error!==null,reject,name+': unexpected coverage outcome.');controls.push({name,expected:reject?'reject':'pass',passed:true,error});}
  check('unchanged',()=>{},false);
  const tests={
    'unfinished-run':r=>r.completed=false,'image-admission-claim':r=>r.imageConformanceClaim=true,'approved-policy-claim':r=>r.approvedImagePolicy=true,
    'dropped-view':r=>r.comparisons.pop(),'duplicate-view':r=>r.comparisons[1]=r.comparisons[0],'dropped-region':r=>r.comparisons[0].regions.pop(),
    'duplicate-region':r=>r.comparisons[0].regions[1]=r.comparisons[0].regions[0],'shifted-camera':r=>r.frames[0].camera.x++,
    'changed-region-rectangle':r=>r.comparisons[0].regions[0].rectangle.x++,'missing-repeat':r=>delete r.comparisons[0].repeat,
    'nonrepeatable-reference':r=>{r.comparisons[0].repeat.rawChangedPixels=1;r.comparisons[0].repeat.exactRgbaMatch=false;},
    'invalid-metric':r=>r.comparisons[0].metrics.rawChangedPixels=-1,'dropped-source-mapping':r=>r.sources.pop(),
    'missing-numeric-checks':r=>r.numeric.executedChecks--,'missing-artifact':r=>delete r.artifacts[r.agent.contactSheet],
    'outside-artifact-path':r=>r.agent.contactSheet='../outside.png','false-exact-claim':r=>r.primary.observedExact=true,
    'false-local-coverage':r=>r.coverage.localObservations--,'wrong-crop-lattice':r=>{r.comparisons.find(c=>c.regions.some(r=>r.crops)).regions.find(r=>r.crops).crops.presentation.rasterRectangle.x++;},
    'stale-agent-gate':r=>r.agent.firstRequiredFailure='passed','dropped-ranked-region':r=>r.agent.rankedRegions.pop(),
    'wrong-ranked-error':r=>r.agent.rankedRegions[0].maxChannelError++,
    'unknown-focused-region':r=>r.presentation.requestedRegion='lines:unknown',
    'missing-focused-crop':r=>r.presentation.requestedRegion='lines:'+r.comparisons[0].regions.find(g=>!g.crops).id,
    'changed-crop-limit':r=>r.presentation.cropLimit++
  };
  for(const[name,mutate]of Object.entries(tests))check(name,mutate,true);
  check('numeric-mismatch-remains-explicit',r=>{r.numeric.state='failed';r.agent.firstRequiredFailure='native-numeric';},false);
  const after=await loadLabelledBorderEvidence();assert.equal(after.snapshotSha256,evidence.snapshotSha256);
  const b=Buffer.from(JSON.stringify({schemaVersion:1,completed:true,passed:true,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
    inputReportSha256:location.sha256,snapshotSha256:evidence.snapshotSha256,controls,coverage:validateLabelledBorderInspectionCoverage(original,frames)},null,2)+'\n');
  await writeArtifact(output,'report.json',b);await writeArtifact(base,'latest.json',JSON.stringify({completed:true,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');
  console.log('Labeled-border inspection coverage: '+controls.length+' controls passed; image admission pending.');
}catch(error){process.exitCode=2;await writeArtifact(output,'report.json',JSON.stringify({completed:false,passed:false,controls,error:error.message},null,2)+'\n');console.error(error.stack);}
