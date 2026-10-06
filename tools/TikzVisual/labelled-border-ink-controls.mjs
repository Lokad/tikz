// Reconstruct independent evidence and audit fresh public/image-only trials.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadLabelledBorderEvidence} from './labelled-border-evidence.mjs';
import {buildLabelledBorderFrame} from './labelled-border-frame.mjs';
import {labelledOracleVariants,readLabelledOriginal,labelledOracleInstructions,makeLabelledOracleSvg} from './labelled-border-oracle.mjs';
import {buildLabelledInk,applyLabelledInkRoot} from './labelled-border-ink.mjs';
import {validateLabelledInkCalibration,validateLabelledInkTrial,validateLabelledSensitivity} from './labelled-border-coverage.mjs';
import {combineShapeTrial} from './shape-primary-trial-policy.mjs';
import {createRenderer} from './compare.mjs';

const base=path.join(root,'artifacts/labelled-border-ink-controls'),output=path.join(base,'run-'+randomUUID()),controls=[];
const normal=v=>JSON.parse(JSON.stringify(v));
async function load(name){const folder=path.join(root,'artifacts/labelled-border-'+name),where=JSON.parse(await readFile(path.join(folder,'latest.json')));
  assert.equal(where.completed,true);assert.match(where.report,/^run-[a-f0-9-]+\/report.json$/);const directory=path.dirname(path.join(folder,where.report)),bytes=await readFile(path.join(directory,'report.json'));assert.equal(sha256(bytes),where.sha256);
  const r=JSON.parse(bytes);for(const[p,h]of Object.entries(r.artifacts))assert.equal(sha256(await readFile(await outputPath(directory,p))),h);
  for(const[p,h]of Object.entries(r.toolHashes))assert.equal(sha256(Buffer.from((await readFile(path.join(root,p),'utf8')).replaceAll('\r\n','\n'))),h);
  return{report:r,directory,sha256:where.sha256};}
function check(group,name,source,validate,change,reject=true){const r=structuredClone(source);change(r);let error=null;try{validate(r);}catch(e){error=e.message;}assert.equal(error!==null,reject,group+'/'+name);controls.push({group,name,expected:reject?'reject':'pass',passed:true,error});}

try{
  assert.equal(process.argv.length,2);const calibration=await load('ink-calibration'),trial=await load('primary-trial'),native=await load('oracle-sensitivity'),publicTrial=await load('public-sensitivity'),evidence=await loadLabelledBorderEvidence();
  const renderer=await createRenderer();try{
    assert.deepEqual(renderer.identity,calibration.report.renderer);const frames=[];
    for(const c of evidence.cases)frames.push(await buildLabelledBorderFrame(renderer,c,evidence.files.get('tests/Reference/LabelledBorders/'+c.fixture.id+'/probed-reference.svg').toString('utf8')));
    const validate=r=>validateLabelledInkCalibration(r,frames);validate(calibration.report);
    const oracle=JSON.parse(await readFile(path.join(calibration.directory,'oracle/report.json')));assert.equal(oracle.completed,true);assert.equal(oracle.converterInvoked,false);assert.equal(oracle.glyphs,40);assert.equal(oracle.snapshotSha256,evidence.snapshotSha256);
    for(const[p,h]of Object.entries(oracle.toolHashes))assert.equal(sha256(Buffer.from((await readFile(path.join(root,p),'utf8')).replaceAll('\r\n','\n'))),h);
    let regeneratedBounds=0,serializationChecks=0,rootChecks=0;
    for(const c of evidence.cases){const id=c.fixture.id,frame=frames.find(f=>f.caseId===id),reference=evidence.files.get('tests/Reference/LabelledBorders/'+id+'/probed-reference.svg').toString('utf8'),saved=calibration.report.cases.find(c=>c.caseId===id);
      const glyphs=JSON.parse(await readFile(path.join(calibration.directory,'oracle',id,'native-glyphs.json'))),original=await readLabelledOriginal(renderer,reference,c.metrics,glyphs,frame),ink=await buildLabelledInk(renderer,reference,c.metrics,glyphs,original,frame);
      assert.deepEqual(ink,saved.ink);assert.deepEqual(ink,JSON.parse(await readFile(path.join(calibration.directory,id,'ink.json'))));regeneratedBounds+=ink.records.length;
      const instructions=labelledOracleInstructions(c.metrics,glyphs,original,labelledOracleVariants.find(v=>v.name==='native-pt-short-glyph-six'));
      assert.deepEqual(normal(instructions),JSON.parse(await readFile(path.join(calibration.directory,id,'instructions.json'))));serializationChecks+=instructions.checks.length;
      const picture=await makeLabelledOracleSvg(renderer,reference,original,instructions,frame,'native-picture-six'),derived=await applyLabelledInkRoot(renderer,picture.svg,ink);
      assert.equal(sha256(derived.svg),calibration.report.artifacts[saved.svg]);assert.deepEqual(derived.rootChecks,saved.rootChecks);rootChecks+=derived.rootChecks.length;
      assert.deepEqual(saved.policy,JSON.parse(await readFile(path.join(calibration.directory,id,'policy.json'))));
    }
    assert.equal(regeneratedBounds,66);assert.equal(serializationChecks,578);assert.equal(rootChecks,12);
    check('calibration','unchanged',calibration.report,validate,()=>{},false);
    const mutations={
      unfinished:r=>r.completed=false,converter:r=>r.converterInvoked=true,claim:r=>r.imageConformanceClaim=true,approval:r=>r.approvedImagePolicy=true,verdict:r=>r.overallVerdict='passed',snapshot:r=>r.snapshotSha256='0'.repeat(64),
      representation:r=>r.selectedRepresentation='native-css-six-glyph-six',case:r=>r.cases.pop(),camera:r=>r.cases[0].frame.camera.x++,view:r=>r.cases[0].observations.pop(),duplicate:r=>r.cases[0].observations[1]=r.cases[0].observations[0],region:r=>r.cases[0].observations[0].regions.pop(),
      rectangle:r=>r.cases[0].observations[0].regions[0].rectangle.x++,repeat:r=>{r.cases[0].observations[0].repeat.rawChangedPixels=1;r.cases[0].observations[0].repeat.exactRgbaMatch=false;},metric:r=>r.cases[0].observations[0].metrics.meanForegroundChannelError=-1,
      exact:r=>r.cases[0].observations[0].metrics.exactRgbaMatch=true,topology:r=>r.cases[0].observations[0].metrics.topology.componentDifference++,missingBound:r=>r.cases[0].ink.records.pop(),root:r=>r.cases[0].ink.root.maxX++,containment:r=>r.cases[0].ink.containmentChecks[0].passed=false,
      browserLimit:r=>r.cases[0].ink.browserChecks[0].limit++,browserBox:r=>r.cases[0].ink.browserChecks[0].actual.minX++,rootLimit:r=>r.cases[0].rootChecks[0].limit++,rootValue:r=>r.cases[0].rootChecks[0].serialized++,
      serialization:r=>r.cases[0].serializationChecks--,relaxedPolicy:r=>r.cases[0].policy.rows[0].whole.rawChangedPixels++,nonframework:r=>r.oracle.assemblyReferences.push('Lokad.TikZ'),artifact:r=>delete r.artifacts[r.cases[0].svg],outside:r=>r.cases[0].svg='../outside',
      crop:r=>r.cases[0].observations[0].regions.find(q=>q.crops).crops=null,cropLattice:r=>r.cases[0].observations[0].regions.find(q=>q.crops).crops.presentation.rasterRectangle.x++,coverage:r=>r.coverage.localObservations--
    };for(const[name,change]of Object.entries(mutations))check('calibration',name,calibration.report,validate,change);
    const validateTrial=r=>validateLabelledInkTrial(r,calibration.report);validateTrial(trial.report);assert.equal(trial.report.calibrationSha256,calibration.sha256);assert.equal(trial.report.trialPassed,true);
    let equalViews=0,equalLocalObservations=0;
    for(let i=0;i<3;i++)for(let j=0;j<12;j++){const a=calibration.report.cases[i].observations[j],b=trial.report.cases[i].comparisons[j];assert.equal(calibration.report.artifacts[a.images.actual],trial.report.artifacts[b.images.actual]);assert.deepEqual(a.metrics,b.metrics);assert.deepEqual(a.repeat,b.repeat);
      for(let k=0;k<a.regions.length;k++){const withoutCrops=({crops,...r})=>r;assert.deepEqual(withoutCrops(a.regions[k]),withoutCrops(b.regions[k]));equalLocalObservations++;}equalViews++;}
    check('trial','unchanged',trial.report,validateTrial,()=>{},false);
    const trialMutations={claim:r=>r.imageConformanceClaim=true,view:r=>r.cases[0].comparisons.pop(),missingBound:r=>r.cases[0].nativeInkChecks.pop(),boundExpected:r=>r.cases[0].nativeInkChecks[0].expected++,boundLimit:r=>r.cases[0].nativeInkChecks[0].limit++,boundVerdict:r=>r.cases[0].nativeInkChecks[0].passed=false,
      imageVerdict:r=>r.cases[0].comparisons[0].evaluation.passed=false,numericCount:r=>r.cases[0].combined.numeric.executedChecks--,numericVerdict:r=>r.numeric.passed=false,pdf:r=>r.pdf.state='passed',falseSummary:r=>r.trialPassed=false};
    for(const[name,change]of Object.entries(trialMutations))check('trial',name,trial.report,validateTrial,change);
    check('trial','correct-pixels-with-failed-numeric',trial.report,validateTrial,r=>{const c=r.cases[0];c.combined=combineShapeTrial({state:'failed',executedChecks:512},c.combined.frame,c.comparisons);r.numeric.passed=false;r.trialPassed=false;assert.equal(c.combined.firstFailedGate,'numeric');},false);
    check('trial','correct-pixels-with-failed-bounds',trial.report,validateTrial,r=>{const c=r.cases[0],q=c.nativeInkChecks[0];q.observed=q.expected+1;q.delta=Math.abs(q.observed-q.expected);q.passed=false;c.combined=combineShapeTrial(c.combined.numeric,{state:'failed',executedChecks:c.nativeInkChecks.length},c.comparisons);r.trialPassed=false;assert.equal(c.combined.firstFailedGate,'frame');},false);
    for(const[group,input]of[['native-sensitivity',native],['public-sensitivity',publicTrial]]){
      const validateSensitivity=r=>validateLabelledSensitivity(r,calibration.report);validateSensitivity(input.report);assert.equal(input.report.calibrationSha256,calibration.sha256);assert.equal(input.report.sensitivityPassed,true);assert.equal(input.report.converterInvoked,group==='public-sensitivity');
      check(group,'unchanged',input.report,validateSensitivity,()=>{},false);
      const sensitivityMutations={control:r=>r.controls.pop(),view:r=>r.controls[0].views.pop(),baseline:r=>r.baselines.pop(),kind:r=>r.controls[0].kind='other',numericBypass:r=>r.controls[0].numericGatesBypassed=false,
        outcome:r=>r.controls[0].views[0].expectedImageOutcome='pixel-identical',target:r=>r.controls[0].views[0].targetRejected=false,identity:r=>r.controls[0].views[0].exactBaselinePixels=true,summary:r=>r.controls[0].passed=false,overall:r=>r.sensitivityPassed=false,
        weakenedBevel:r=>r.controls.find(c=>c.kind==='bevel-join').exactAtScales.push(4),closedCap:r=>r.controls.find(c=>c.kind==='closed-cap').views[0].exactBaselinePixels=false};
      for(const[name,change]of Object.entries(sensitivityMutations))check(group,name,input.report,validateSensitivity,change);
    }
    const after=await loadLabelledBorderEvidence();assert.equal(after.snapshotSha256,evidence.snapshotSha256);
    const toolHashes={};for(const p of['tools/TikzVisual/labelled-border-ink-controls.mjs','tools/TikzVisual/labelled-border-coverage.mjs'])toolHashes[p]=sha256(Buffer.from((await readFile(path.join(root,p),'utf8')).replaceAll('\r\n','\n')));
    const bytes=Buffer.from(JSON.stringify({schemaVersion:1,completed:true,passed:true,approvedImagePolicy:false,imageConformanceClaim:false,toolHashes,inputs:{calibration:calibration.sha256,trial:trial.sha256,nativeSensitivity:native.sha256,publicSensitivity:publicTrial.sha256},
      regeneratedBounds,serializationChecks,rootChecks,equalViews,equalLocalObservations,controls},null,2)+'\n');
    await writeArtifact(output,'report.json',bytes);await writeArtifact(base,'latest.json',JSON.stringify({completed:true,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)},null,2)+'\n');
    console.log('Labeled-border research: '+controls.length+' controls; '+regeneratedBounds+' envelopes, '+equalViews+' exact public/native views, '+equalLocalObservations+' equal local observations.');
  }finally{await renderer.browser.close();}
}catch(error){process.exitCode=2;await writeArtifact(output,'report.json',JSON.stringify({completed:false,passed:false,approvedImagePolicy:false,imageConformanceClaim:false,controls,error:error.message},null,2)+'\n');console.error(error.stack);}
