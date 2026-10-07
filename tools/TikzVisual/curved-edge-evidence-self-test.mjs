// Cache and native-reader controls; neither the converter nor a renderer runs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadEdgeEvidence,edgeReference} from './curved-edge-evidence.mjs';
import {parseCurvedEdgeLog,edgeCanonical,edgePhysicalOrder} from './curved-edge-log.mjs';
import {edgeSvgPaints,edgePdfPaints,verifyEdgeDriverState} from './curved-edge-driver-state.mjs';

const output=path.join(root,'artifacts/curved-edge-evidence-controls/run-'+randomUUID()),controls=[],artifacts={},sourceHashes={};
let evidence;
async function check(name,expected,action){
  let error=null;try{await action();}catch(e){error=e.message;}
  assert.equal(error===null,expected==='pass',name+': unexpected outcome: '+error);
  controls.push({name,expected,passed:true,error});
}
const reader=changes=>async file=>{const bytes=changes.has(file)?changes.get(file):evidence.files.get(file);assert.ok(bytes,'Missing '+file);return bytes;};
async function publish(completed,error){
  const report={schemaVersion:1,comparisonKind:'curved-edge-native-cache-controls',completed,passed:completed,
    converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',
    snapshotSha256:evidence?.snapshotSha256,sourceHashes,controls,artifacts,...(error?{error}:{})};
  const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',bytes);
  console.log(JSON.stringify({completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));
}
try{
  assert.equal(process.argv.length,2);
  for(const file of ['tools/TikzVisual/curved-edge-evidence-self-test.mjs','tools/TikzVisual/curved-edge-evidence.mjs',
    'tools/TikzVisual/curved-edge-log.mjs','tools/TikzVisual/curved-edge-driver-state.mjs']){
    const bytes=edgeCanonical(await readFile(path.join(root,file)));sourceHashes[file]=sha256(bytes);
    await writeArtifact(output,'source-captures/'+file,bytes,artifacts);
  }
  evidence=await loadEdgeEvidence();
  await check('unchanged-cache','pass',()=>loadEdgeEvidence(reader(new Map())));
  await check('all-70-native-paths','pass',()=>assert.equal(evidence.metrics.reduce((n,m)=>n+m.paths.length,0),70));
  for(const id of evidence.manifest.cases.map(c=>c.id))for(const name of ['metrics.json','svg-probed.log','plain-reference.svg','plain-reference.pdf','plain-pdf-page-4x.png']){
    const file=edgeReference+id+'/'+name,changed=Buffer.from(evidence.files.get(file));changed[0]^=1;
    await check('changed/'+id+'/'+name,'reject',()=>loadEdgeEvidence(reader(new Map([[file,changed]]))));
  }
  for(const file of [edgeReference+'snapshot.json',edgeReference+'fonts/ec-lmr10.tfm','tests/Fixtures/CurvedEdges/nodes.tikz'])
    await check('missing/'+file,'reject',()=>loadEdgeEvidence(reader(new Map([[file,null]]))));
  const snapshotFile=edgeReference+'snapshot.json',replacement=structuredClone(evidence.snapshot);
  const metricFile='continuation/metrics.json',metric=structuredClone(evidence.metrics[0]);metric.paths[0].segments[1].xSp++;
  const bytes=Buffer.from(JSON.stringify(metric,null,2)+'\n');replacement.artifacts[metricFile]=sha256(bytes);
  replacement.cases[0].nativeMetricsSha256=sha256(bytes);
  await check('rehashed-replacement','reject',()=>loadEdgeEvidence(reader(new Map([[edgeReference+metricFile,bytes],
    [snapshotFile,Buffer.from(JSON.stringify(replacement,null,2)+'\n')]]))));
  const fixture=evidence.manifest.cases[0],log=evidence.files.get(edgeReference+'continuation/svg-probed.log').toString('utf8');
  for(const [name,mutate]of [
    ['nonfinite-coordinate',s=>s.replace(/(LOKAD-SEG 1\|move\|)-?\d+/, '$1NaN')],
    ['unknown-segment',s=>s.replace('|control1|','|invented|')],
    ['missing-path',s=>s.replace(/^LOKAD-PATH 1\|[^\n]*\n/m,'')]
  ])await check('native-parser/'+name,'reject',()=>{const changed=mutate(log);assert.notEqual(changed,log);parseCurvedEdgeLog(changed,fixture);});
  const positions=evidence.files.get(edgeReference+'continuation/native-positions.log').toString('utf8');
  await check('missing-physical-marker','reject',()=>edgePhysicalOrder(evidence.metrics[0],log,positions.replace('lokad-edge-path 1','lost-marker 1')));
  const nodes=evidence.metrics[3],svg=evidence.files.get(edgeReference+'nodes/plain-reference.svg'),pdf=evidence.files.get(edgeReference+'nodes/plain-reference.pdf');
  await check('empty-native-strokes-retain-move-only-path','pass',()=>{
    const actual=edgeSvgPaints(svg);assert.equal(actual.emptyPaints,2);assert.equal(actual.paints.length,13);
    assert.equal(actual.paints.filter(p=>/^M[^CLZ]*$/.test(p.data)).length,1);
    assert.equal(edgePdfPaints(pdf).paints.length,13);
  });
  await check('svg-pdf-color-disagreement','reject',()=>{
    const changed=svg.toString('utf8').replace("fill='#f00' stroke='#f00'","fill='#0f0' stroke='#0f0'");
    assert.notEqual(changed,svg.toString('utf8'));verifyEdgeDriverState(nodes,Buffer.from(changed),pdf);
  });
  for(const [file,hash]of Object.entries(sourceHashes))assert.equal(sha256(edgeCanonical(await readFile(path.join(root,file)))),hash,'Source changed during controls.');
  await loadEdgeEvidence();await publish(true);
  console.log('Curved-edge native cache: '+controls.length+' controls passed; image conformance pending.');
}catch(error){process.exitCode=2;await publish(false,error.message);console.error(error.stack);}
