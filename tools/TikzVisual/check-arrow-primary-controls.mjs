// Check original public SVG bytes, recaptured images and independently decoded data.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {arrowCanonical,arrowMetrics} from './arrow-native-contract.mjs';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {loadArrowMeetImageCache} from './arrow-meet-image-cache.mjs';
import {loadArrowPublicPrimaryOwned,validateArrowPublicPrimaryBundle} from './arrow-public-primary-reader.mjs';
import {captureArrowPublicPrimaryControl,arrowPublicPrimaryBaseline,arrowPublicPrimaryDelta,summarizeArrowPublicPrimaryControls} from './arrow-public-primary-controls.mjs';
import {arrowPrimaryRegions} from './arrow-primary-contract.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

assert.equal(process.argv.length,3);
const out=await outputPath(path.join(root,'artifacts/arrow-public-primary-checks/run-'+randomUUID())),controls=[],records=[],ownSources={};
let renderer,phase='owned-input',inputReportSha256,summary,measurements=0,images=0,deltas=0;
async function publish(completed,error){const bytes=Buffer.from(JSON.stringify({schemaVersion:1,completed,phase,comparisonKind:'independent-public-arrow-primary-control-check',
  inputReport:process.argv[2],inputReportSha256,converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',
  renderer:renderer?.identity,ownSources,views:records.length,measurements,images,deltas,summary,controls,...(error?{error}:{})},null,2)+'\n');await writeArtifact(out,'report.json',bytes);
  console.log(JSON.stringify({completed,phase,report:path.relative(root,path.join(out,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes),views:records.length}));}
async function reject(name,action){let rejection;await assert.rejects(action,e=>{assert.ok(e instanceof assert.AssertionError);rejection=e.message.slice(0,500);return true;});controls.push({name,passed:true,rejection});}
function matchCapture(record,capture,read){
  assert.equal(capture.reference,read(record.files.reference).toString());assert.equal(capture.actual,read(record.files.actual).toString());
  assertNativeEqual(capture.record.sourceFrame,record.sourceFrame);assertNativeEqual(capture.record.attribution,record.attribution);
  assertNativeEqual(capture.numbers,record.numbers,'Changed captured public control quantities: '+record.view.id);
  for(const [name,image]of Object.entries(capture.images))assert.ok(read(record.files.images[name]).equals(Buffer.from(image,'base64')),'Public control SVG/image binding: '+record.view.id+'/'+name);
  for(const [i,crop]of capture.crops.entries())for(const [name,image]of Object.entries({...crop.paired,sheet:crop.sheet}))assert.ok(read(record.files.crops[i].images[name]).equals(Buffer.from(image,'base64')),'Public control crop binding: '+record.view.id+'/'+crop.id+'/'+name);
}
try{
  const codeName='tools/TikzVisual/check-arrow-primary-controls.mjs',code=arrowCanonical(await readFile(path.join(root,codeName)));ownSources[codeName]=sha256(code);await writeArtifact(out,'source-captures/'+codeName,code);
  const e=await loadArrowMeetImageCache(),b=await loadArrowPublicPrimaryOwned(process.argv[2],e);inputReportSha256=b.inputReportSha256;
  renderer=await createRenderer();assertNativeEqual(renderer.identity,b.report.renderer);await installShapeMetrics(renderer);
  for(const record of b.records){
    phase=record.view.id;const capture=await captureArrowPublicPrimaryControl(renderer,e,b.input,record.view);matchCapture(record,capture,b.read);
    const view=record.view,frame=capture.frame,regions=arrowPrimaryRegions(frame),size={width:frame.camera.width*view.scale,height:frame.camera.height*view.scale};
    const rectangles=regions.map(r=>Object.fromEntries(Object.entries(r.rectangle).map(([k,n])=>[k,n*view.scale])));
    const decoded=await decodeEdgeOraclePngPair(renderer,[b.read(record.files.images.reference),b.read(record.files.images.actual)],size,rectangles,view.scale,view.background);
    assertNativeEqual(decoded.metrics[0],record.numbers.metrics);assert.equal(decoded.metrics.length,record.numbers.regions.length);
    for(const [i,row]of record.numbers.regions.entries()){for(const [k,n]of Object.entries(regions[i]))assertNativeEqual(row[k],n);assertNativeEqual(arrowMetrics(row),decoded.metrics[i]);}
    measurements+=decoded.metrics.length;images+=Object.keys(capture.images).length+capture.crops.reduce((n,c)=>n+Object.keys(c.paired).length+1,0);
    if(['defect','visibility-missing'].includes(view.kind)){
      const baseline=arrowPublicPrimaryBaseline(records,view),delta=await arrowPublicPrimaryDelta(renderer,frame,view,b.read(baseline.files.images.actual),b.read(record.files.images.actual));
      assertNativeEqual(delta,record.delta);deltas++;
    }
    records.push(record);if(view.scale===4&&view.background==='black')console.log('Public primary control checked: '+view.id);
  }
  summary=summarizeArrowPublicPrimaryControls(e,records).summary;assertNativeEqual(summary,b.report.summary);
  phase='corruption-controls';
  const validate=(report=b.report,manifestBytes=b.manifestBytes,assets=b.assets)=>validateArrowPublicPrimaryBundle(Buffer.from(JSON.stringify(report)+'\n'),manifestBytes,assets,e);
  for(const [name,change]of [['false complete',r=>r.completed=false],['false approval',r=>r.approvedImagePolicy=true],['false image claim',r=>r.imageConformanceClaim=true],
    ['false public admission',r=>r.imageAdmission='passed'],['numeric gates falsely enabled',r=>r.numericGatesBypassedForMutations=false],['lost pending gate',r=>r.pendingGates.pop()],
    ['changed renderer',r=>r.renderer.browser='different'],['changed qualification',r=>r.inputBindings.qualification.commit='0'.repeat(40)],
    ['lost proof pin',r=>delete r.inputBindings.reports.reader],['lost source guard',r=>delete r.sourceHashes[Object.keys(r.sourceHashes)[0]]]]){
    const report=structuredClone(b.report);change(report);await reject(name,()=>validate(report));
  }
  for(const [name,change]of [['missing image',a=>a.delete(records[0].files.images.actual)],['changed image',a=>a.set(records[0].files.images.actual,Buffer.from('different'))],
    ['missing qualified reader',a=>a.delete('proofs/baseline-reader.json')]]){const assets=new Map(b.assets);change(assets);await reject(name,()=>validate(b.report,b.manifestBytes,assets));}
  const rehash=changes=>{
    const assets=new Map(b.assets),manifest=structuredClone(b.manifest);for(const [file,bytes]of changes){assets.set(file,bytes);manifest.artifacts[file]=sha256(bytes);}
    const mb=Buffer.from(JSON.stringify(manifest,null,2)+'\n'),report=structuredClone(b.report);report.manifest.sha256=sha256(mb);
    return {report,manifestBytes:mb,assets};
  };
  const first=records[0];
  const attributionRecord=structuredClone(records.find(r=>r.attribution!==null));const {numbers:unused,...raw}=attributionRecord;raw.attribution.source.offset++;
  let forgery=rehash([[raw.files.record,Buffer.from(JSON.stringify(raw)+'\n')]]);
  await reject('fully rehashed source attribution',()=>validate(forgery.report,forgery.manifestBytes,forgery.assets));
  forgery=rehash([[first.files.actual,Buffer.from('<svg/>')]]);await reject('fully rehashed public SVG substitution',()=>validate(forgery.report,forgery.manifestBytes,forgery.assets));
  const bindings=b.json('native-limit-bindings.json');bindings.primaryPolicies.pop();forgery=rehash([['native-limit-bindings.json',Buffer.from(JSON.stringify(bindings)+'\n')]]);
  await reject('fully rehashed lost native policy binding',()=>validate(forgery.report,forgery.manifestBytes,forgery.assets));
  const changed=records.find(r=>r.view.kind==='defect'&&r.delta.rawChangedPixels>0);assert.ok(changed);
  forgery=rehash([[changed.files.images.actual,b.read(changed.files.images.reference)]]);
  const structurallyValid=await validate(forgery.report,forgery.manifestBytes,forgery.assets);
  const expected=await captureArrowPublicPrimaryControl(renderer,e,b.input,changed.view);
  await reject('fully rehashed PNG substitution through actual SVG/image binding',async()=>matchCapture(changed,expected,structurallyValid.read));
  assert.equal(controls.length,17);assert.ok(controls.every(c=>c.passed===true));
  assert.equal(sha256(arrowCanonical(await readFile(path.join(root,codeName)))),ownSources[codeName]);
  await loadArrowPublicPrimaryOwned(process.argv[2],e);phase='complete';await publish(true);
}catch(error){process.exitCode=2;await publish(false,error.message.slice(0,1000).replaceAll(root,'<repo>'));console.error(error.stack);}finally{await renderer?.browser.close();}
