import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadLabelledBorderEvidence} from './labelled-border-evidence.mjs';
import {buildLabelledBorderFrame} from './labelled-border-frame.mjs';
import {labelledOracleVariants,labelledOracleRoots,readLabelledOriginal,labelledOracleInstructions,makeLabelledOracleSvg} from './labelled-border-oracle.mjs';
import {validateLabelledOracleCoverage} from './labelled-border-oracle-coverage.mjs';
import {createRenderer} from './compare.mjs';

const base=path.join(root,'artifacts/labelled-border-oracle-controls'),output=path.join(base,'run-'+randomUUID()),controls=[];
try{
  assert.equal(process.argv.length,2);const evidence=await loadLabelledBorderEvidence(),renderer=await createRenderer(),frames=[];
  try{
    for(const c of evidence.cases)frames.push(await buildLabelledBorderFrame(renderer,c,evidence.files.get('tests/Reference/LabelledBorders/'+c.fixture.id+'/probed-reference.svg').toString('utf8')));
    const location=JSON.parse(await readFile(path.join(root,'artifacts/labelled-border-oracle-inspection/latest.json')));assert.equal(location.completed,true);assert.match(location.report,/^run-[a-f0-9-]+\/report.json$/);
    const folder=path.join(root,'artifacts/labelled-border-oracle-inspection',path.dirname(location.report)),bytes=await readFile(path.join(folder,'report.json'));assert.equal(sha256(bytes),location.sha256);const original=JSON.parse(bytes);
    validateLabelledOracleCoverage(original,frames);
    for(const[p,h]of Object.entries(original.artifacts))assert.equal(sha256(await readFile(path.join(folder,p))),h);
    for(const[p,h]of Object.entries(original.toolHashes))assert.equal(sha256(Buffer.from((await readFile(path.join(root,p),'utf8')).replaceAll('\r\n','\n'))),h);
    let serializationChecks=0,rootChecks=0;
    for(const c of evidence.cases){const id=c.fixture.id,frame=frames.find(f=>f.caseId===id),reference=evidence.files.get('tests/Reference/LabelledBorders/'+id+'/probed-reference.svg').toString('utf8');
      const glyphs=JSON.parse(await readFile(path.join(folder,'oracle',id,'native-glyphs.json'))),ops=await readLabelledOriginal(renderer,reference,c.metrics,glyphs,frame);
      assert.deepEqual(ops,JSON.parse(await readFile(path.join(folder,id,'original-operations.json'))));
      for(const v of labelledOracleVariants){const instructions=labelledOracleInstructions(c.metrics,glyphs,ops,v),expected=JSON.parse(await readFile(path.join(folder,id,v.name,'instructions.json')));assert.deepEqual(JSON.parse(JSON.stringify(instructions)),expected);serializationChecks+=instructions.checks.length;
        for(const rootMode of labelledOracleRoots){const svg=await makeLabelledOracleSvg(renderer,reference,ops,instructions,frame,rootMode),d=original.derivations.find(d=>d.id===id+'/'+v.name+'/'+rootMode);assert.equal(sha256(svg.svg),original.artifacts[d.svg]);assert.equal(sha256(svg.drawing),d.drawingSha256);assert.deepEqual(svg.rootChecks,d.rootChecks);rootChecks+=svg.rootChecks.length;}}
    }
    assert.equal(serializationChecks,2340);assert.equal(rootChecks,120);
    function check(name,change,reject){const r=structuredClone(original);change(r);let error=null;try{validateLabelledOracleCoverage(r,frames);}catch(e){error=e.message;}assert.equal(error!==null,reject,name);controls.push({name,expected:reject?'reject':'pass',passed:true,error});}
    check('unchanged',()=>{},false);
    const mutations={
      'unfinished':r=>r.completed=false,'converter-invoked':r=>r.converterInvoked=true,'image-admission-claim':r=>r.imageConformanceClaim=true,'approved-policy':r=>r.approvedImagePolicy=true,
      'changed-snapshot':r=>r.snapshotSha256='0'.repeat(64),'missing-variant':r=>r.variants.pop(),'changed-root-modes':r=>r.roots.reverse(),'missing-view':r=>r.observations.pop(),
      'duplicate-view':r=>r.observations[1]=r.observations[0],'missing-region':r=>r.observations[0].regions.pop(),'changed-camera':r=>r.frames[0].camera.x++,
      'changed-root-value':r=>r.derivations[0].root.values[0]++,'changed-root-expected':r=>r.derivations[0].rootChecks[0].expected++,'relaxed-root-limit':r=>r.derivations[0].rootChecks[0].limit++,
      'missing-serialization':r=>r.derivations.find(d=>d.serializationChecks>0).serializationChecks--,'changed-drawing':r=>r.derivations[1].drawingSha256='0'.repeat(64),
      'non-framework-reader':r=>r.oracle.assemblyReferences.push('Lokad.TikZ'),'nonrepeatable-reference':r=>{r.observations[0].repeat.rawChangedPixels=1;r.observations[0].repeat.exactRgbaMatch=false;},
      'false-exact-claim':r=>r.observations.find(o=>o.metrics.rawChangedPixels>0).metrics.exactRgbaMatch=true,'invalid-metric':r=>r.observations[0].metrics.rawChangedPixels=-1,
      'missing-artifact':r=>delete r.artifacts[r.agent.contactSheet],'outside-artifact':r=>r.agent.viewer='../outside','missing-crop':r=>r.observations[0].regions.find(g=>g.crops).crops=null,
      'incorrect-coverage':r=>r.coverage.localObservations--
    };
    for(const[name,mutation]of Object.entries(mutations))check(name,mutation,true);
    const after=await loadLabelledBorderEvidence();assert.equal(after.snapshotSha256,evidence.snapshotSha256);
    const b=Buffer.from(JSON.stringify({schemaVersion:1,completed:true,passed:true,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,inputReportSha256:location.sha256,
      serializationChecks,rootChecks,controls,coverage:validateLabelledOracleCoverage(original,frames)},null,2)+'\n');
    await writeArtifact(output,'report.json',b);await writeArtifact(base,'latest.json',JSON.stringify({completed:true,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');
    console.log('Independent labeled-border oracle: '+controls.length+' controls, '+serializationChecks+' serialization and '+rootChecks+' root checks passed.');
  }finally{await renderer.browser.close();}
}catch(error){process.exitCode=2;await writeArtifact(output,'report.json',JSON.stringify({completed:false,passed:false,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,controls,error:error.message},null,2)+'\n');console.error(error.stack);}
