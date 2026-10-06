// Explicit independent preparation. Writes ignored artifacts only; no converter.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {deriveNativeCurvedPolicies} from './curved-node-native-unit-policy.mjs';
const sourceFile='artifacts/curved-node-native-unit-calibration/run-a31e61d7-461b-46a0-a29a-14d1e74568cc/report.json',sourceSha256='d7b01d4899fd9cc4725b777187e7c0d0d3d0bc1d151e8c4c658f8c665d457e61';
const registrationFile='artifacts/node-shape-pdf-calibration/run-1da41cda-31e2-4b07-9c81-49615b2305c0/report.json',registrationSha256='370a14d497bc2d9731fdbab62cedf382fa85d4db80fdca14d2ad85c57008553b';
const base=path.join(root,'artifacts/curved-node-prepared'),output=path.join(base,'run-'+randomUUID()),artifacts={},inputs={},toolHashes={};
const canonical=b=>Buffer.from(b.toString('utf8').replaceAll('\r\n','\n')),save=(p,b)=>writeArtifact(output,p,b,artifacts);
async function evidence(file,digest){const b=await readFile(path.join(root,file));assert.equal(sha256(b),digest);const r=JSON.parse(b);assert.equal(r.completed,true);assert.equal(r.converterInvoked,false);assert.equal(r.approvedImagePolicy,false);const folder=path.dirname(path.join(root,file));for(const[p,h]of Object.entries(r.artifacts))assert.equal(sha256(await readFile(await outputPath(folder,p))),h);return{r,b,folder};}
const compact=row=>{const{artifacts,evaluation,cropCoverage,regions,...r}=row;return{...r,regions:regions.map(({crops,...q})=>q)};};
async function main(){
  assert.equal(process.argv.length,2);const e=await evidence(sourceFile,sourceSha256),q=await evidence(registrationFile,registrationSha256),c=e.r;
  assert.equal(c.sensitivityPassed,true);assert.equal(c.controls.length,15);assert.ok(c.controls.every(q=>q.passed));
  const unitBytes=await readFile(path.join(root,c.sourceCalibration.file));assert.equal(sha256(unitBytes),c.sourceCalibration.sha256);const unit=JSON.parse(unitBytes);
  assert.equal(unit.completed,true);assert.equal(unit.converterInvoked,false);
  const earlier=row=>{const r=compact(row);if(!r.imageHashes)r.imageHashes=Object.fromEntries(Object.entries(row.artifacts).map(([k,p])=>{const h=unit.artifacts[p];assert.match(h,/^[a-f0-9]{64}$/);return[k,h];}));return r;};
  const derived=deriveNativeCurvedPolicies(c.observations.primary,c.observations.nativePdf,c.camera,c.regions);assert.deepEqual(derived.primary,c.policies.primary);assert.deepEqual(derived.nativePdf,c.policies.nativePdf);
  Object.assign(toolHashes,c.toolHashes);const own='tools/TikzVisual/prepare-curved-node-admission.mjs';toolHashes[own]=sha256(canonical(await readFile(path.join(root,own))));
  for(const[p,h]of Object.entries(toolHashes)){const b=canonical(await readFile(path.join(root,p)));assert.equal(sha256(b),h);await save('tool-sources/'+p,b);}
  const native=JSON.parse(await readFile(path.join(root,'tests/Reference/NodeShapes/native/provenance.json'))),pdf=JSON.parse(await readFile(path.join(root,'tests/Reference/NodeShapes/pdf/provenance.json')));
  async function track(p,encoding){const raw=await readFile(path.join(root,p)),b=encoding==='utf8-lf'?canonical(raw):raw;inputs[p]={sha256:sha256(b),encoding};return b;}
  for(const p of new Set([...Object.keys(native.sourceHashes),...Object.keys(pdf.sourceHashes),'tests/Reference/NodeShapes/native/provenance.json','tests/Reference/NodeShapes/pdf/provenance.json'])){
    const encoding=p.endsWith('.svg')||p.endsWith('.log')?'raw':'utf8-lf';const b=await track(p,encoding),expected=native.sourceHashes[p]??pdf.sourceHashes[p];if(expected)assert.equal(sha256(b),expected);
  }
  for(const[p,h]of Object.entries(native.artifacts)){const file='tests/Reference/NodeShapes/native/'+p,b=await track(file,p.endsWith('.svg')||p.endsWith('.log')?'raw':'utf8-lf');assert.equal(sha256(b),h);}
  const pdfSnapshot=JSON.parse(await track('tests/Reference/NodeShapes/pdf-snapshot.json','utf8-lf'));assert.deepEqual(pdfSnapshot.artifacts,pdf.artifacts);
  for(const[p,h]of Object.entries(pdfSnapshot.artifacts)){const file='tests/Reference/NodeShapes/pdf/'+p,b=await track(file,/\.(pdf|png|log)$/.test(p)?'raw':'utf8-lf');assert.equal(sha256(b),h);}
  for(const name of['ec-lmr10.tfm','ec-lmri12.tfm'])await track('tests/Reference/NodeShapes/fonts/'+name,'raw');
  const frozen={};for(const p of['native-glyphs.json','native-css-6.svg']){const b=canonical(await readFile(path.join(e.folder,'oracle',p))),file='tests/Reference/NodeShapes/conformance/'+p;await save(p,b);inputs[file]={sha256:sha256(b),encoding:'utf8-lf'};frozen[p]=file;}
  const derivation=JSON.parse(await readFile(path.join(e.folder,'oracle/derivation.json')));
  const primary=c.replays.primary.map(compact),nativePdf=c.replays.nativePdf.map(compact),originalPdf=c.replays.originalPdf.map(compact);
  assert.deepEqual(deriveNativeCurvedPolicies(primary,nativePdf,c.camera,c.regions),derived);
  const cameraControls=q.r.cameraControls;assert.equal(cameraControls.passed,true);assert.equal(cameraControls.controls,54);
  const viewportBytes=await readFile(path.join(q.folder,cameraControls.report));assert.equal(sha256(viewportBytes),cameraControls.reportSha256);const viewport=JSON.parse(viewportBytes);assert.equal(viewport.passed,true);assert.equal(viewport.controls.length,54);
  const controls=[];for(const control of c.controls){const{primaryComparisons,pdfComparisons,...rest}=control,svg=await readFile(path.join(e.folder,(control.expectedExactPixels?'visibility/':'defects/')+control.name+'.svg'),'utf8');assert.equal(sha256(svg),control.inputSha256);controls.push({...rest,inputSvg:svg,primaryComparisons:primaryComparisons.map(compact),pdfComparisons:pdfComparisons.map(compact)});}
  const calibration={schemaVersion:1,comparisonKind:'oracle-only-curved-node-immutable-calibration',completed:true,sensitivityPassed:true,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
    sourceReports:{calibration:sourceSha256,registration:registrationSha256},sourceByteContract:c.sourceByteContract,sourceBytes:c.sourceBytes,toolHashes,inputs,frozen,
    renderer:c.renderer,selectedRepresentation:c.selectedRepresentation,serializationChecks:c.serializationChecks,geometry:c.geometry,camera:c.camera,regions:c.regions,
    derivation:{originBp:derivation.originBp,originalViewBoxBp:derivation.originalViewBoxBp,counts:derivation.counts,nativeGlyphsSha256:inputs[frozen['native-glyphs.json']].sha256},
    pdfRenderer:pdfSnapshot.tools.find(t=>t.name==='pdftoppm'),cameraControls,viewport,policies:c.policies,observations:{primary,nativePdf,originalPdf},
    replays:{primary:c.observations.primary.map(earlier),nativePdf:c.observations.nativePdf.map(earlier),originalPdf:c.observations.originalPdf.map(earlier)},controls};
  const bytes=Buffer.from(JSON.stringify(calibration,null,2)+'\n');assert.ok(!bytes.toString().includes('C:\\Users\\')&&!bytes.toString().includes('C:\\\\Users\\\\'),'Private path in public calibration.');
  const compressed=gzipSync(bytes,{level:9});await save('calibration.json',bytes);await save('calibration.json.gz',compressed);await save('source-calibration.json',e.b);await save('source-registration.json',q.b);
  const result={completed:true,converterInvoked:false,approvedImagePolicy:false,calibrationSha256:sha256(compressed),decodedSha256:sha256(bytes),inputs,toolHashes,artifacts},b=Buffer.from(JSON.stringify(result,null,2)+'\n');await writeArtifact(output,'report.json',b);await writeArtifact(base,'latest.json',JSON.stringify({completed:true,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');
  console.log(JSON.stringify({prepared:path.relative(root,output),calibrationSha256:result.calibrationSha256,decodedSha256:result.decodedSha256,bytes:bytes.length,compressedBytes:compressed.length,inputs:Object.keys(inputs).length}));
}
await main().catch(async error=>{process.exitCode=2;console.error(error.stack?.slice(0,5000)??error.message);await writeArtifact(output,'report.json',JSON.stringify({completed:false,converterInvoked:false,error:error.message.slice(0,5000),artifacts},null,2)+'\n');});
