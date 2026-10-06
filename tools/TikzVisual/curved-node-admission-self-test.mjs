// Cached evidence/coverage controls. Fresh emitted-SVG controls run in the
// public combined comparison; these probes never invoke a converter or TeX.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {createRenderer} from './compare.mjs';
import {loadCurvedPolicy,validateCurvedCalibration,combineCurvedNodes,evaluateCurvedPrimary,
  requireCurvedRenderer,curvedCanonical,curvedProfileFile,curvedCalibrationFile,curvedGuardTools} from './curved-node-admission-policy.mjs';

const base=path.join(root,'artifacts/curved-node-admission-controls'),output=path.join(base,'run-'+randomUUID()),artifacts={},controls=[];
const relative=p=>path.relative(root,p).split(path.sep).join('/');let phase='immutable-evidence';
async function publish(report){
  const b=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',b);
  await writeArtifact(base,'latest.json',JSON.stringify({completed:report.completed,report:relative(path.join(output,'report.json')).slice('artifacts/curved-node-admission-controls/'.length),sha256:sha256(b)},null,2)+'\n');
}
async function main(){
  assert.equal(process.argv.length,2);const renderer=await createRenderer();try{
    const workspace=path.join(output,'oracle'),e=await loadCurvedPolicy(renderer,workspace),c=e.calibration;
    const record=(name,category)=>controls.push({name,category,passed:true});
    const reject=async(name,fn,category)=>{await assert.rejects(fn);record(name,category);};
    const files=[...new Set([curvedProfileFile,curvedCalibrationFile,...Object.keys(c.inputs),...Object.keys(c.toolHashes),...curvedGuardTools])];
    const cached=new Map();for(const file of files)cached.set(file,await readFile(path.join(root,file)));
    const read=p=>{const b=cached.get(relative(p));assert.ok(b,'Unexpected evidence path.');return Promise.resolve(b);};
    phase='input-corruption';
    for(const file of files){
      await reject('missing/'+file,()=>loadCurvedPolicy(renderer,workspace,p=>relative(p)===file?Promise.reject(new Error('Controlled missing input')):read(p)),'missing evidence');
      await reject('changed/'+file,()=>loadCurvedPolicy(renderer,workspace,async p=>relative(p)===file?Buffer.concat([await read(p),Buffer.from(file===curvedProfileFile?'\0':' ')]):read(p)),'changed evidence');
    }
    console.log('Missing/changed evidence: '+controls.length+' controls passed.');
    phase='profile-corruption';
    for(const[name,change]of[
      ['borrowed-id',p=>p.id='different-family'],['borrowed-scope',p=>p.scope='All TikZ'],['unapproved',p=>p.approvedImagePolicy=false],
      ['partial-numeric',p=>p.counts.numeric--],['partial-frame',p=>p.counts.frame--],['partial-primary',p=>p.counts.primary--],['partial-PDF',p=>p.counts.pdfPerRoute--],
      ['partial-regions',p=>p.counts.regions--],['partial-sensitivity',p=>p.counts.sensitivity--],['partial-serialization',p=>p.counts.serialization--],
      ['missing-primary-view',p=>p.requiredViews.primary.pop()],['missing-PDF-view',p=>p.requiredViews.pdf.pop()],
      ['changed-compressed-digest',p=>p.calibration.sha256='0'.repeat(64)],['changed-decoded-digest',p=>p.calibration.decodedSha256='0'.repeat(64)],
      ['missing-guard',p=>delete p.guardToolHashes[curvedGuardTools[0]]],['changed-guard',p=>p.guardToolHashes[curvedGuardTools[0]]='0'.repeat(64)],
      ['fitted-primary-camera',p=>p.camera.primary.x++],['fitted-PDF-camera',p=>p.camera.pdf.origin.x++],
      ['chosen-primary-region',p=>p.regions.primary.pop()],['chosen-PDF-region',p=>p.regions.pdf.pop()],
      ['widened-primary',p=>p.limits.primary.rows[0].whole.rawChangedPixels++],['widened-PDF',p=>p.limits.nativePdf.rows[0].regions[0].limits.rawChangedPixels++],
      ['widened-native-ink',p=>p.limits.nativePdf.inkRows[0].regions[0].actual[0]++],['widened-original-PDF',p=>p.limits.originalPdf.rows[0].regions[0].limits.maxRawChannelError++]
    ]){
      const p=structuredClone(e.profile);change(p);const bytes=Buffer.from(JSON.stringify(p));
      await reject(name,()=>loadCurvedPolicy(renderer,workspace,f=>relative(f)===curvedProfileFile?Promise.resolve(bytes):read(f)),'profile mutation');
    }
    const replacement=structuredClone(c);replacement.policies.primary.rows[0].whole.rawChangedPixels++;
    const bytes=Buffer.from(JSON.stringify(replacement)),compressed=gzipSync(bytes),profile=structuredClone(e.profile);
    profile.calibration.sha256=sha256(compressed);profile.calibration.decodedSha256=sha256(bytes);profile.limits=replacement.policies;
    await reject('consistently-rehashed-unreviewed-replacement',()=>loadCurvedPolicy(renderer,workspace,p=>relative(p)===curvedProfileFile?
      Promise.resolve(Buffer.from(JSON.stringify(profile))):relative(p)===curvedCalibrationFile?Promise.resolve(compressed):read(p)),'reviewed digests');
    for(const key of Object.keys(renderer.identity).filter(k=>k!=='osRelease')){
      const identity=structuredClone(renderer.identity);identity[key]=null;assert.throws(()=>requireCurvedRenderer(identity,c.renderer));record('different-renderer/'+key,'renderer contract');
    }
    requireCurvedRenderer({...renderer.identity,osRelease:'different host patch release'},c.renderer);record('host-release-is-provenance','renderer contract');
    // The declared LF contract tolerates checkout newlines, not content changes.
    await loadCurvedPolicy(renderer,workspace,async p=>{const b=await read(p),file=relative(p);return file==='tools/TikzShapeCalibration/packages.lock.json'?Buffer.from(curvedCanonical(b).toString().replaceAll('\n','\r\n')):b;});
    record('declared-CRLF-to-LF-contract','source bytes');
    phase='calibration-corruption';
    for(const[name,change]of[
      ['candidate-in-calibration',q=>q.converterInvoked=true],['not-completed',q=>q.completed=false],['unpassed-sensitivity',q=>q.sensitivityPassed=false],
      ['wrong-calibration-kind',q=>q.comparisonKind='candidate'],['wrong-schema',q=>q.schemaVersion++],['preapproved-calibration',q=>q.approvedImagePolicy=true],
      ['false-conformance-claim',q=>q.imageConformanceClaim=true],['different-source-report',q=>q.sourceReports.calibration='0'.repeat(64)],
      ['dropped-input',q=>delete q.inputs[Object.keys(q.inputs)[0]]],['changed-input-digest',q=>q.inputs[Object.keys(q.inputs)[0]].sha256='0'.repeat(64)],
      ['fitted-derivation-origin',q=>q.derivation.originBp.x++],['changed-geometry',q=>q.geometry.frames.picture.minX++],
      ['changed-primary-camera',q=>q.geometry.camera.x++],['changed-PDF-camera',q=>q.camera.origin.x++],['changed-PDF-region',q=>q.regions[1].rectangle.x++],
      ['different-representation',q=>q.selectedRepresentation.name='css-six'],['missing-serialization',q=>q.serializationChecks.pop()],
      ['missing-primary',q=>q.observations.primary.pop()],['duplicate-primary',q=>q.observations.primary[1]=q.observations.primary[0]],
      ['missing-native-PDF',q=>q.observations.nativePdf.pop()],['duplicate-original-PDF',q=>q.observations.originalPdf[1]=q.observations.originalPdf[0]],
      ['candidate-primary-observation',q=>q.observations.primary[0].converterInvoked=true],['missing-replay',q=>q.replays.primary.pop()],
      ['changed-primary-replay',q=>q.replays.primary[0].metrics.rawChangedPixels++],['changed-PDF-replay',q=>q.replays.nativePdf[0].whole.inkCoverage.actual[0]++],
      ['changed-replay-signature',q=>q.replays.primary[0].imageHashes.actual='0'.repeat(64)],['missing-local-region',q=>q.observations.primary[0].regions.pop()],
      ['widened-independent-limit',q=>q.policies.primary.rows[0].whole.rawChangedPixels++],['changed-viewport-control',q=>q.viewport.controls[0].page.rawChangedPixels++],
      ['missing-viewport-control',q=>q.viewport.controls.pop()],['missing-defect',q=>q.controls.pop()],['changed-defect-SVG',q=>q.controls[0].inputSvg+=' '],
      ['missing-defect-view',q=>q.controls[0].primaryComparisons.pop()],['contradictory-defect-summary',q=>q.controls[0].passed=false],
      ['changed-visibility-signature',q=>q.controls.at(-1).pdfComparisons[0].imageHashes['svg-page']='0'.repeat(64)]
    ]){
      const altered=structuredClone(c);change(altered);await reject(name,()=>validateCurvedCalibration(altered,renderer,e.buffers,workspace),'calibration mutation');
    }
    console.log('Independent calibration corruption controls passed.');
    phase='combined-coverage';
    // Synthetic gate records test the combiner only; the public run supplies real numeric/frame evidence.
    const numeric={state:'passed',executedChecks:4461},frame={state:'passed',executedChecks:406};
    const args=()=>[e,structuredClone(numeric),structuredClone(frame),structuredClone(c.observations.primary),
      structuredClone(c.observations.originalPdf),structuredClone(c.observations.nativePdf),structuredClone(c.controls)];
    assert.equal(combineCurvedNodes(...args()).passed,true);record('all-required-gates','synthetic combined coverage');
    for(const[name,change,first]of[
      ['numeric-mismatch',a=>a[1].state='failed','numeric'],['frame-mismatch',a=>a[2].state='failed','frame'],
      ['primary-mismatch',a=>a[3][0].metrics.rawChangedPixels++,'primary'],['original-PDF-mismatch',a=>a[4][0].whole.rawChangedPixels++,'originalPdf'],
      ['candidate-PDF-mismatch',a=>a[5][0].whole.inkCoverage.actual[0]++,'candidatePdf']
    ]){const a=args();change(a);const verdict=combineCurvedNodes(...a);assert.equal(verdict.passed,false);assert.equal(verdict.firstFailedGate,first);assert.equal(verdict.imageConformanceClaim,false);record(name,'synthetic combined coverage');}
    for(const[name,change]of[
      ['empty-numeric',a=>a[1].executedChecks=0],['pending-frame',a=>a[2].state='pending'],['missing-primary-view',a=>a[3].pop()],
      ['duplicate-primary-view',a=>a[3][1]=a[3][0]],['missing-original-PDF-view',a=>a[4].pop()],['duplicate-candidate-PDF-view',a=>a[5][1]=a[5][0]],
      ['chosen-candidate-region',a=>a[5][0].regions.pop()],['missing-fresh-defect',a=>a[6].pop()],['duplicate-fresh-defect',a=>a[6][1]=a[6][0]]
    ]){const a=args();change(a);assert.throws(()=>combineCurvedNodes(...a));record(name,'synthetic combined coverage');}
    for(const[name,change]of[
      ['NaN-count',q=>q.metrics.rawChangedPixels=NaN],['negative-count',q=>q.metrics.rawChangedPixels=-1],['fractional-count',q=>q.metrics.rawChangedPixels=.5],
      ['excessive-count',q=>q.metrics.foregroundPixels=20000001],['impossible-channel',q=>q.metrics.maxRawChannelError=256],
      ['false-exact-label',q=>q.metrics.exactRgbaMatch=true],['negative-foreground-mean',q=>q.metrics.meanForegroundChannelError=-1],
      ['contradictory-components',q=>q.metrics.topology.componentDifference++],['contradictory-edge-state',q=>q.metrics.topology.edgeState='both-empty'],
      ['missing-regions',q=>q.regions.pop()],['changed-region',q=>q.regions[0].rectangle.x++],['nonrepeatable-reference',q=>q.repeat.rawChangedPixels++]
    ]){const row=structuredClone(c.observations.primary[0]);change(row);assert.throws(()=>evaluateCurvedPrimary(c,row));record(name,'primary metric integrity');}
    // All linked evidence is checked again after the controls, including exact current tool sources.
    for(const file of files)assert.equal(sha256(await readFile(path.join(root,file))),sha256(cached.get(file)),'Evidence changed during controls.');
    await writeArtifact(output,'profile.json',e.profileBytes,artifacts);
    await publish({schemaVersion:1,comparisonKind:'cached-curved-node-admission-controls',completed:true,passed:true,
      converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,profileSha256:e.profileSha256,
      renderer:renderer.identity,requiredFiles:files,controls,artifacts});console.log('Curved-node admission controls: '+controls.length+' passed; '+relative(output));
  }finally{await renderer.browser.close();}
}
await main().catch(async error=>{process.exitCode=2;console.error(error.stack?.slice(0,5000)??error.message);await publish({completed:false,passed:false,phase,error:error.message.slice(0,5000),converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,controls,artifacts});});
