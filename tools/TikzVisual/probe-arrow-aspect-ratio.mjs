// Native geometry is held fixed; only the root aspect-ratio declaration changes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadArrowImageCache} from './arrow-image-cache.mjs';
import {loadArrowPublicBaseline} from './arrow-public-source-reader.mjs';
import {arrowPublicSourceTools} from './arrow-public-source-contract.mjs';
import {arrowCanonical,arrowMetrics} from './arrow-native-contract.mjs';
import {arrowPrimaryRegions} from './arrow-primary-contract.mjs';
import {measureEdgeTrialPrimary} from './edge-trial-images.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

const output=await outputPath(path.join(root,'artifacts/arrow-aspect-ratio-probes/run-'+randomUUID())),artifacts={},rows=[],sourceHashes={};
const save=(p,b)=>writeArtifact(output,p,b,artifacts);let renderer,phase='arguments',inputReportSha256;
async function publish(completed,error){
  const r={schemaVersion:1,comparisonKind:'native-arrow-aspect-ratio-diagnostic',completed,phase,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
    inputReport:process.argv[2],inputReportSha256,renderer:renderer?.identity,sourceHashes,views:rows.length,
    nativeEncodingDifferences:rows.filter(r=>!r.encoding.exactRgbaMatch).length,
    unchangedDrawingProofs:rows.filter(r=>r.bodyUnchanged&&r.rootPaintUnchanged).length,
    recordedPublicErrorMatches:rows.filter(r=>r.publicErrorMatches).length,
    exactPublicDiagnosticMatches:rows.filter(r=>r.publicPixels.exactRgbaMatch).length,
    interpretation:'Native geometry and paint are unchanged. Public pixels are diagnostic evidence only; no policy or tolerance is derived or replaced.',artifacts,...(error?{error}:{})};
  const bytes=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(output,'report.json',bytes);console.log(JSON.stringify({completed,phase,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));
}
try{
  assert.equal(process.argv.length,3);const e=await loadArrowImageCache(),b=await loadArrowPublicBaseline(process.argv[2],e);inputReportSha256=b.inputReportSha256;
  const sources=await arrowPublicSourceTools();
  for(const p of ['tools/TikzVisual/probe-arrow-aspect-ratio.mjs','tools/TikzVisual/arrow-public-source-reader.mjs']){
    const bytes=arrowCanonical(await readFile(path.join(root,p)));sourceHashes[p]=sha256(bytes);await save('source-captures/'+p,bytes);
  }
  renderer=await createRenderer();assert.deepEqual(renderer.identity,b.report.renderer);await installShapeMetrics(renderer);
  for(const r of b.primary.filter(r=>r.view.route==='native-source')){
    const v=r.view,f=e.frames.find(f=>f.caseId===v.caseId),reference=b.read(r.files.reference).toString();phase=v.id;
    const variant=await renderer.page.evaluate(svg=>{
      const d=new DOMParser().parseFromString(svg,'image/svg+xml'),s=d.documentElement,xml=new XMLSerializer();
      if(d.querySelector('parsererror')||s.getAttribute('preserveAspectRatio')!=='none')throw Error('Unexpected native root');
      const body=()=>[...s.childNodes].map(n=>xml.serializeToString(n)).join(''),paint=()=>[...s.attributes].filter(a=>a.name!=='preserveAspectRatio').map(a=>[a.namespaceURI,a.name,a.value]);
      const before=body(),attributes=JSON.stringify(paint());s.removeAttribute('preserveAspectRatio');
      if(body()!==before||JSON.stringify(paint())!==attributes)throw Error('Aspect probe changed drawing or framing');
      return {svg:xml.serializeToString(d),body:before,bodyUnchanged:true,rootPaintUnchanged:true};
    },reference);
    const raw=await measureEdgeTrialPrimary(renderer,{reference,actual:variant.svg,leftIsDriver:false,origin:{x:0,y:0},camera:f.camera,...v,regions:arrowPrimaryRegions(f),cropLimit:0,
      referenceLabel:'Native SVG none',rightLabel:'Native SVG default'}),{images,crops,...numbers}=raw;
    assert.equal(crops.length,0);const folder='views/'+v.id;
    await save(folder+'/none.svg',reference);await save(folder+'/default.svg',variant.svg);
    for(const[k,png]of Object.entries(images))await save(folder+'/'+k+'.png',Buffer.from(png,'base64'));
    const size={width:f.camera.width*v.scale,height:f.camera.height*v.scale},publicPixels=(await decodeEdgeOraclePngPair(renderer,
      [Buffer.from(images.actual,'base64'),b.read(r.files.images.actual)],size,[{x:0,y:0,...size}],v.scale,v.background)).metrics[0];
    const publicErrorMatches=JSON.stringify(arrowMetrics(numbers.metrics))===JSON.stringify(arrowMetrics(r.numbers.metrics))
      && numbers.regions.every((q,i)=>JSON.stringify(arrowMetrics(q))===JSON.stringify(arrowMetrics(r.numbers.regions[i])));
    const row={view:v,bodySha256:sha256(variant.body),bodyUnchanged:variant.bodyUnchanged,rootPaintUnchanged:variant.rootPaintUnchanged,
      encoding:arrowMetrics(numbers.metrics),publicPixels,publicErrorMatches};rows.push(row);
    await save(folder+'/numbers.json',JSON.stringify(numbers)+'\n');await save(folder+'/record.json',JSON.stringify(row)+'\n');
  }
  assert.equal(rows.length,72);assert.ok(rows.every(r=>r.publicErrorMatches&&r.publicPixels.exactRgbaMatch));
  assert.deepEqual(await arrowPublicSourceTools(),sources);
  for(const[p,h]of Object.entries(sourceHashes))assert.equal(sha256(arrowCanonical(await readFile(path.join(root,p)))),h);
  phase='complete';await publish(true);
}catch(error){process.exitCode=2;await publish(false,error.message.replaceAll(root,'<repo>'));console.error(error.stack);}finally{await renderer?.browser.close();}
