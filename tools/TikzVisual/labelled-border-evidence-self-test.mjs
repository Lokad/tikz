import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadLabelledBorderEvidence} from './labelled-border-evidence.mjs';
import {sanitizeLabelledBorderLog} from './labelled-border-log.mjs';

const base=path.join(root,'artifacts/labelled-border-cache-controls'),output=path.join(base,'run-'+randomUUID()),controls=[];
let baseline;
const report=()=>({schemaVersion:1,comparisonKind:'labelled-border-native-cache-controls',converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
  snapshotSha256:baseline?.snapshotSha256,controls,toolHashes:{'tools/TikzVisual/labelled-border-evidence.mjs':null,'tools/TikzVisual/labelled-border-evidence-self-test.mjs':null}});
async function check(name,changed,expected){
  let failure=null;
  try{await loadLabelledBorderEvidence(async file=>{
    const bytes=changed.has(file)?changed.get(file):baseline.files.get(file);if(bytes===null||bytes===undefined)throw Error('Missing native input: '+file);return bytes;
  });}catch(error){failure=error.message;}
  assert.equal(failure===null,expected==='pass',name+': unexpected native-cache outcome.');controls.push({name,expected,passed:true,error:failure});
}
try{
  assert.equal(process.argv.length,2);
  for(const[input,expected]of[
    ['(C:/local/fonts/lm.enc)','(<local>/lm.enc)'],
    ['{C:/\nlocal/fonts/lm.en\nc}','{<local>/lm.enc}'],
    ['<C:\\local\\fonts\\lm.pfb>','<<local>/lm.pfb>'],
    ['https://example.org/manual','https://example.org/manual'],
    ["' TeX output 2026.10.06:1234'","' TeX output <timestamp>'"],
    ['LOKAD-SEG 1|line|-42|101|END\r\n','LOKAD-SEG 1|line|-42|101|END\n']
  ]){assert.equal(sanitizeLabelledBorderLog(input),expected);controls.push({name:'log-sanitization/'+controls.length,expected:'pass',passed:true,error:null});}
  baseline=await loadLabelledBorderEvidence();await check('unchanged',new Map(),'pass');
  for(const[file,bytes]of baseline.files){
    await check('missing/'+file,new Map([[file,null]]),'reject');
    const changed=Buffer.from(bytes);changed[0]^=1;await check('changed/'+file,new Map([[file,changed]]),'reject');
  }
  const snapshotFile='tests/Reference/LabelledBorders/snapshot.json';
  const snapshot=structuredClone(baseline.snapshot),metricFile='tests/Reference/LabelledBorders/lines/metrics.json',metric=JSON.parse(baseline.files.get(metricFile));
  metric.paths[0].segments[0].point.xSp++;const bytes=Buffer.from(JSON.stringify(metric,null,2)+'\n'),relative='lines/metrics.json';
  const provenanceFile='tests/Reference/LabelledBorders/lines/provenance.json',provenance=JSON.parse(baseline.files.get(provenanceFile));provenance.artifacts[relative]=sha256(bytes);
  const pBytes=Buffer.from(JSON.stringify(provenance,null,2)+'\n');snapshot.artifacts[relative]=sha256(bytes);snapshot.artifacts['lines/provenance.json']=sha256(pBytes);snapshot.cases[0].nativeMetricsSha256=sha256(bytes);
  await check('consistently-rehashed-native-replacement',new Map([[metricFile,bytes],[provenanceFile,pBytes],[snapshotFile,Buffer.from(JSON.stringify(snapshot,null,2)+'\n')]]),'reject');
  for(const name of['dropped-case','duplicate-case','false-invariance','image-admission-claim','dropped-artifact']){
    const s=structuredClone(baseline.snapshot);
    if(name==='dropped-case')s.cases.pop();if(name==='duplicate-case')s.cases[1]=s.cases[0];if(name==='false-invariance')s.cases[0].invariance.pdfPixels=false;
    if(name==='image-admission-claim')s.imageConformanceClaim=true;if(name==='dropped-artifact')delete s.artifacts['paths/native-positions.log'];
    await check(name,new Map([[snapshotFile,Buffer.from(JSON.stringify(s,null,2)+'\n')]]),'reject');
  }
  const source='tests/Fixtures/Nodes/labelled-border-lines.tikz',canonical=baseline.files.get(source).toString('utf8').replaceAll('\r\n','\n');
  await check('canonical-source-crlf',new Map([[source,Buffer.from(canonical.replaceAll('\n','\r\n'))]]),'pass');
  const after=await loadLabelledBorderEvidence();assert.equal(after.snapshotSha256,baseline.snapshotSha256);
  for(const[file,bytes]of baseline.files)assert.equal(sha256(after.files.get(file)),sha256(bytes),'Original evidence changed.');
  const r={...report(),completed:true,passed:true,checkedFiles:baseline.files.size,byteCount:baseline.byteCount};
  for(const file of Object.keys(r.toolHashes))r.toolHashes[file]=sha256(Buffer.from((await readFile(path.join(root,file),'utf8')).replaceAll('\r\n','\n')));
  const b=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(output,'report.json',b);await writeArtifact(base,'latest.json',JSON.stringify({completed:true,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');
  console.log('Labelled-border native cache: '+controls.length+' controls passed; image conformance pending.');
}catch(error){process.exitCode=2;await writeArtifact(output,'report.json',JSON.stringify({...report(),completed:false,passed:false,error:error.message},null,2)+'\n');console.error(error.stack);}
