// Diagnostic images only. No inherited allowances or image-admission verdict.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {createRenderer,compareBundle} from './compare.mjs';
import {root,sha256,writeArtifact,outputPath} from './shape-oracle-bundle.mjs';
import {loadEdgeEvidence,edgeReference} from './curved-edge-evidence.mjs';
import {edgeCanonical} from './curved-edge-log.mjs';

const output=path.join(root,'artifacts/curved-edge-inspection/run-'+randomUUID()),artifacts={},sourceHashes={},cases=[];
let renderer,numericReportSha256,phase='arguments';
const save=(file,bytes)=>writeArtifact(output,file,bytes,artifacts);
async function json(file,value){await save(file,JSON.stringify(value,null,2)+'\n');}
async function publish(completed,error){
  const report={schemaVersion:1,comparisonKind:'curved-edge-image-diagnostics',completed,phase,
    converterInvoked:false,candidateSource:'saved-public-numeric-run',numericReportSha256,
    approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending-image-calibration',
    renderer:renderer?.identity,sourceHashes,cases,artifacts,...(error?{error}:{})};
  const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',bytes);
  console.log(JSON.stringify({completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));
}
try{
  assert.equal(process.argv.length,3,'Usage: node inspect-curved-edges.mjs artifacts/curved-edge-numeric/run-.../report.json');
  const input=path.resolve(root,process.argv[2]);assert.equal(path.basename(input),'report.json');
  assert.ok(input.startsWith(path.join(root,'artifacts','curved-edge-numeric')+path.sep));
  await outputPath(output);
  const evidence=await loadEdgeEvidence(),numericBytes=await readFile(input),numeric=JSON.parse(numericBytes),inputFolder=path.dirname(input);
  numericReportSha256=sha256(numericBytes);
  assert.equal(numeric.comparisonKind,'public-curved-edge-numeric');assert.equal(numeric.completed,true);assert.equal(numeric.numericPassed,true);
  assert.equal(numeric.snapshotSha256,evidence.snapshotSha256);assert.equal(numeric.approvedImagePolicy,false);assert.equal(numeric.imageConformanceClaim,false);
  assert.deepEqual(numeric.cases.map(c=>c.caseId),evidence.manifest.cases.map(c=>c.id));assert.ok(numeric.cases.every(c=>c.numericPassed));
  for(const [file,hash]of Object.entries({...numeric.converterSources,...numeric.toolHashes}))
    assert.equal(sha256(edgeCanonical(await readFile(path.join(root,file)))),hash,'Candidate source changed: '+file);
  for(const file of ['tools/TikzVisual/inspect-curved-edges.mjs','tools/TikzVisual/compare.mjs','tools/TikzVisual/browser-profile.json',
    'tools/TikzVisual/package-lock.json','tools/TikzVisual/curved-edge-evidence.mjs']){
    const bytes=edgeCanonical(await readFile(path.join(root,file)));sourceHashes[file]=sha256(bytes);await save('source-captures/'+file,bytes);
  }
  await save('numeric-report.json',numericBytes);
  async function candidate(file){
    assert.ok(Object.hasOwn(numeric.artifacts,file));assert.ok(!path.isAbsolute(file)&&!file.split(/[\\/]/).includes('..'));
    const bytes=await readFile(path.join(inputFolder,file));assert.equal(sha256(bytes),numeric.artifacts[file]);return bytes;
  }
  phase='renderer';renderer=await createRenderer();
  for(const c of evidence.cases){
    const id=c.fixture.id,prefix=id+'/',folder=path.join(output,id);phase='images/'+id;
    const reference=evidence.files.get(edgeReference+prefix+'plain-reference.svg');
    const origin=/transform='translate\(([-\d.]+),([-\d.]+)\)scale\(0\.996264,-0\.996264\)'/.exec(reference.toString('utf8'));
    assert.ok(origin,'Native SVG physical origin missing.');
    await save(prefix+'reference.svg',reference);await save(prefix+'actual.svg',await candidate(prefix+'actual.svg'));
    const scene=JSON.parse(await candidate(prefix+'actual-scene.json'));
    scene.paths.forEach((p,i)=>p.semanticId='path-'+i);await json(prefix+'actual-scene.json',scene);
    await save(prefix+'source.tikz',await candidate(prefix+'source.tikz'));
    for(const file of ['plain-reference.pdf','metrics.json','provenance.json','native-positions.log'])
      await save(prefix+'native/'+file,evidence.files.get(edgeReference+prefix+file));
    for(const scale of [1,4])await save(prefix+'pdf-page-'+scale+'x.png',evidence.files.get(edgeReference+prefix+'plain-pdf-page-'+scale+'x.png'));
    const row=numeric.cases.find(c=>c.caseId===id);
    await json(prefix+'comparison-input.json',{
      schemaVersion:1,caseId:'curved-'+id,referenceMode:'original-plain-TikZ',actualLabel:'Lokad.TikZ curved connection prototype',
      scope:'Diagnostic exact-pixel comparison; independent image calibration and admission remain pending.',
      referenceOriginBp:{x:Number(origin[1]),y:Number(origin[2])},actualUnits:'cssPixels',numericTolerancePixels:0,
      numeric:{passed:true,assertions:row.checks},exactPrimary:true,exactPdf:true,pdf:{originPixels:c.metrics.pdfCamera.origin}
    });
    await json(prefix+'provenance.json',{schemaVersion:1,numericReportSha256,snapshotSha256:evidence.snapshotSha256,
      approvedImagePolicy:false,imageConformanceClaim:false,registration:'Original SVG translation and independent PDF page/picture position; no fitting to candidate pixels.'});
    const compared=await compareBundle(folder,renderer);
    compared.approvedImagePolicy=false;compared.imageConformanceClaim=false;compared.overallVerdict='pending-image-calibration';
    await json(prefix+'report.json',compared);
    cases.push({id,numericChecks:row.checks,rawPrimaryExact:compared.primary.passed,rawPdfExact:compared.pdf.passed,
      rawIntrinsicSizeExact:compared.dimensions.passed,viewer:prefix+'index.html'});
    console.log(id+': paired images and raw differences saved; calibration pending.');
  }
  await renderer.browser.close();
  await save('index.html','<!doctype html><html lang="en"><meta charset="utf-8"><title>Curved connection diagnostics</title>'+
    '<style>body{font:16px system-ui;margin:24px}img{max-width:100%}</style><h1>Curved connection diagnostics</h1>'+
    '<p>Native numeric checks passed. Image calibration and admission remain pending. Case viewers provide overlay, blink, zoom and failure crops.</p>'+
    '<p><a href="report.json">Machine-readable diagnostics</a> · <a href="numeric-report.json">Native numeric report</a></p>'+
    cases.map(c=>'<h2><a href="'+c.viewer+'">'+c.id+'</a></h2><img alt="Reference, candidate and amplified difference" src="'+c.id+'/comparison.png">').join('')+'</html>');
  async function collect(folder,prefix=''){
    for(const entry of await readdir(folder,{withFileTypes:true})){
      const relative=prefix+entry.name;if(entry.isDirectory())await collect(path.join(folder,entry.name),relative+'/');
      else if(relative!=='report.json')artifacts[relative]=sha256(await readFile(path.join(folder,entry.name)));
    }
  }
  phase='final-integrity';
  assert.equal(sha256(await readFile(input)),numericReportSha256);
  for(const [file,hash]of Object.entries(sourceHashes))assert.equal(sha256(edgeCanonical(await readFile(path.join(root,file)))),hash);
  await loadEdgeEvidence();await collect(output);await publish(true);
}catch(error){process.exitCode=2;await renderer?.browser.close();await publish(false,error.message);console.error(error.stack);}
