// Qualify native envelopes/root and freeze primary limits before any candidate.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadLabelledBorderEvidence} from './labelled-border-evidence.mjs';
import {buildLabelledBorderFrame} from './labelled-border-frame.mjs';
import {labelledOracleVariants,readLabelledOriginal,labelledOracleInstructions,makeLabelledOracleSvg} from './labelled-border-oracle.mjs';
import {buildLabelledInk,applyLabelledInkRoot} from './labelled-border-ink.mjs';
import {runLabelledResearchTool,saveLabelledImages} from './labelled-border-research.mjs';
import {validateLabelledInkCalibration} from './labelled-border-coverage.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics,measureShapePair} from './shape-image-pair.mjs';
import {shapeViews,deriveShapeTrialPolicy,evaluateShapeTrial} from './shape-primary-trial-policy.mjs';

const base=path.join(root,'artifacts/labelled-border-ink-calibration'),output=path.join(base,'run-'+randomUUID()),artifacts={},toolHashes={};let phase='arguments';
const save=(p,b)=>writeArtifact(output,p,b,artifacts),read=p=>readFile(path.join(output,p));
async function publish(report){const b=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',b);await writeArtifact(base,'latest.json',JSON.stringify({completed:report.completed,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');}
async function main(){
  assert.equal(process.argv.length,2);await publish({completed:false,phase,converterInvoked:false,approvedImagePolicy:false});
  const evidence=await loadLabelledBorderEvidence();for(const[p,b]of evidence.files)await save('evidence/'+p,b);
  for(const file of['calibrate-labelled-border-ink.mjs','labelled-border-ink.mjs','labelled-border-coverage.mjs','labelled-border-image-defects.mjs','labelled-border-research.mjs','labelled-border-oracle.mjs','labelled-border-frame.mjs','labelled-border-evidence.mjs',
    'labelled-border-log.mjs','curved-node-path-units.mjs','shape-frame-math.mjs','shape-image-pair.mjs','shape-raster-metrics.mjs','shape-primary-trial-policy.mjs','shape-oracle-bundle.mjs',
    'compare.mjs','browser-profile.json','package-lock.json','package.json','text-profile.json','node-profile.json']){
    const p='tools/TikzVisual/'+file,b=Buffer.from((await readFile(path.join(root,p),'utf8')).replaceAll('\r\n','\n'));toolHashes[p]=sha256(b);await save('tool-sources/'+p,b);}
  const renderer=await createRenderer();try{
    await installShapeMetrics(renderer);const frames=[];phase='independent-frames';
    for(const c of evidence.cases)frames.push(await buildLabelledBorderFrame(renderer,c,evidence.files.get('tests/Reference/LabelledBorders/'+c.fixture.id+'/probed-reference.svg').toString('utf8')));
    phase='independent-glyphs';const oracle=await runLabelledResearchTool(output,'TikzLabelledBorderOracle','oracle',save,artifacts);assert.equal(oracle.snapshotSha256,evidence.snapshotSha256);
    const cases=[];
    for(const c of evidence.cases){const id=c.fixture.id,frame=frames.find(f=>f.caseId===id),reference=evidence.files.get('tests/Reference/LabelledBorders/'+id+'/probed-reference.svg').toString('utf8');
      const glyphs=JSON.parse(await read('oracle/'+id+'/native-glyphs.json')),original=await readLabelledOriginal(renderer,reference,c.metrics,glyphs,frame),variant=labelledOracleVariants.find(v=>v.name==='native-pt-short-glyph-six');
      phase='native-ink/'+id;const ink=await buildLabelledInk(renderer,reference,c.metrics,glyphs,original,frame),instructions=labelledOracleInstructions(c.metrics,glyphs,original,variant);
      const picture=await makeLabelledOracleSvg(renderer,reference,original,instructions,frame,'native-picture-six'),derived=await applyLabelledInkRoot(renderer,picture.svg,ink);
      await save(id+'/ink.json',JSON.stringify(ink,null,2)+'\n');await save(id+'/instructions.json',JSON.stringify(instructions,null,2)+'\n');await save(id+'/native.svg',derived.svg);
      const rows=[];phase='independent-primary/'+id;
      for(const view of shapeViews){const prefix=id+'/'+view.frame+'-'+view.scale+'x-'+view.background;
        const m=await measureShapePair(renderer,{reference,actual:derived.svg,leftIsDriver:true,origin:frame.origin,camera:frame.camera,regions:frame.regions,...view,rightLabel:'Independent native ink',cropLimit:2,cropRegionIds:[id==='lines'?'glyph-6':'glyph-0','path-'+(c.metrics.paths.length-1)]});
        assert.equal(m.repeat.rawChangedPixels,0);rows.push({...view,converterInvoked:false,...await saveLabelledImages(save,prefix,m)});
      }
      const policy=deriveShapeTrialPolicy(rows.map(r=>({...r,...r.metrics})),id+' labeled-border native-ink trial');
      for(const row of rows)assert.equal(evaluateShapeTrial(policy,row,row).passed,true);
      await save(id+'/policy.json',JSON.stringify(policy,null,2)+'\n');cases.push({caseId:id,frame,ink,rootChecks:derived.rootChecks,serializationChecks:instructions.checks.length,svg:id+'/native.svg',policy,observations:rows});
      console.log(id+': '+ink.records.length+' native envelopes; 12 independent primary rows frozen.');
    }
    for(const[p,h]of Object.entries(artifacts))assert.equal(sha256(await read(p)),h);
    for(const[p,h]of Object.entries({...toolHashes,...oracle.toolHashes}))assert.equal(sha256(Buffer.from((await readFile(path.join(root,p),'utf8')).replaceAll('\r\n','\n'))),h);
    const after=await loadLabelledBorderEvidence();assert.equal(after.snapshotSha256,evidence.snapshotSha256);
    await save('index.html','<!doctype html><meta charset="utf-8"><h1>Independent labeled-border ink calibration</h1><p>No converter or image admission.</p><a href="report.json">Report</a>'+cases.map(c=>'<h2>'+c.caseId+'</h2>'+c.observations.filter(r=>r.scale===1&&r.background==='white').map(r=>'<p>'+r.frame+'</p><img src="'+r.images.comparison+'">').join('')).join(''));
    const report={schemaVersion:1,comparisonKind:'oracle-only-labelled-border-ink-calibration',completed:true,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',
      snapshotSha256:evidence.snapshotSha256,renderer:renderer.identity,toolHashes,oracle:{report:'oracle/report.json',assemblySha256:oracle.oracleAssemblySha256,assemblyReferences:oracle.oracleAssemblyReferences},selectedRepresentation:'native-pt-short-glyph-six',cases,
      coverage:{cases:cases.length,views:36,localObservations:1944,inkRecords:cases.reduce((n,c)=>n+c.ink.records.length,0),geometryChecks:cases.reduce((n,c)=>n+c.ink.browserChecks.length*4,0),rootChecks:12},artifacts};
    validateLabelledInkCalibration(report,frames);await publish(report);
    console.log('Independent labeled-border ink/root calibration completed; admission pending.');
  }finally{await renderer.browser.close();}
}
await main().catch(async error=>{process.exitCode=2;console.error(error.stack);await publish({schemaVersion:1,completed:false,phase,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,error:error.message.replaceAll(root,'<repo>'),artifacts});});
