// Independent PDF instructions, finite text/path conversion and page diagnostics.
// No converter, production resource, candidate scene or image allowance.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadLabelledBorderEvidence} from './labelled-border-evidence.mjs';
import {buildLabelledBorderFrame} from './labelled-border-frame.mjs';
import {labelledOracleVariants,readLabelledOriginal,labelledOracleInstructions,makeLabelledOracleSvg} from './labelled-border-oracle.mjs';
import {buildLabelledInk,applyLabelledInkRoot} from './labelled-border-ink.mjs';
import {runLabelledResearchTool} from './labelled-border-research.mjs';
import {parseLabelledPdf,verifyLabelledPdf,reconstructLabelledPdf} from './labelled-border-pdf-vector.mjs';
import {labelledPdfViewportControls,saveLabelledPdfImages} from './labelled-border-pdf-viewport.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';
import {shapePdfPageCamera,shapePdfRasterRectangle} from './shape-pdf-camera.mjs';
import {measureShapePdfPair} from './shape-pdf-image-pair.mjs';

const base=path.join(root,'artifacts/labelled-border-pdf'),output=path.join(base,'run-'+randomUUID()),artifacts={},toolHashes={},cases=[];let phase='arguments';
const save=(p,b)=>writeArtifact(output,p,b,artifacts),read=p=>readFile(path.join(output,p));
async function publish(r){const b=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(output,'report.json',b);await writeArtifact(base,'latest.json',JSON.stringify({completed:r.completed,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');}
async function main(){
  assert.equal(process.argv.length,2);await publish({completed:false,phase,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false});const evidence=await loadLabelledBorderEvidence();for(const[p,b]of evidence.files)await save('evidence/'+p,b);
  for(const file of['inspect-labelled-border-pdf.mjs','labelled-border-pdf-vector.mjs','labelled-border-pdf-viewport.mjs','labelled-border-evidence.mjs','labelled-border-frame.mjs','labelled-border-ink.mjs','labelled-border-oracle.mjs','labelled-border-research.mjs','labelled-border-log.mjs',
    'curved-node-path-units.mjs','dash-pdf-vector.mjs','shape-oracle-bundle.mjs','shape-frame-math.mjs','shape-image-pair.mjs','shape-raster-metrics.mjs','shape-pdf-camera.mjs','shape-pdf-image-pair.mjs','compare.mjs','browser-profile.json','package-lock.json','package.json','text-profile.json','node-profile.json']){
    const p='tools/TikzVisual/'+file,b=Buffer.from((await readFile(path.join(root,p),'utf8')).replaceAll('\r\n','\n'));toolHashes[p]=sha256(b);await save('tool-sources/'+p,b);}
  phase='native-glyphs';const oracle=await runLabelledResearchTool(output,'TikzLabelledBorderOracle','oracle',save,artifacts);assert.equal(oracle.snapshotSha256,evidence.snapshotSha256);const renderer=await createRenderer();
  try{
    await installShapeMetrics(renderer);const tfms=new Map([...evidence.files].filter(([p])=>p.endsWith('.tfm')).map(([p,b])=>[p.split('/').at(-1),b]));
    for(const c of evidence.cases){const id=c.fixture.id,reference=evidence.files.get('tests/Reference/LabelledBorders/'+id+'/probed-reference.svg').toString('utf8'),glyphs=JSON.parse(await read('oracle/'+id+'/native-glyphs.json'));
      phase=id+'/native-geometry';const frame=await buildLabelledBorderFrame(renderer,c,reference),original=await readLabelledOriginal(renderer,reference,c.metrics,glyphs,frame),ink=await buildLabelledInk(renderer,reference,c.metrics,glyphs,original,frame),instructions=labelledOracleInstructions(c.metrics,glyphs,original,labelledOracleVariants.find(v=>v.name==='native-pt-short-glyph-six'));
      const picture=await makeLabelledOracleSvg(renderer,reference,original,instructions,frame,'native-picture-six'),native=await applyLabelledInkRoot(renderer,picture.svg,ink),parsed=parseLabelledPdf(evidence.files.get('tests/Reference/LabelledBorders/'+id+'/plain-reference.pdf')),numeric=verifyLabelledPdf(parsed,c.metrics,glyphs,original,tfms);
      await save(id+'/pdf-content.txt',parsed.content);await save(id+'/pdf-records.json',JSON.stringify(parsed,null,2)+'\n');await save(id+'/pdf-numeric.json',JSON.stringify(numeric,null,2)+'\n');await save(id+'/original-operations.json',JSON.stringify(original,null,2)+'\n');await save(id+'/ink.json',JSON.stringify(ink,null,2)+'\n');await save(id+'/instructions.json',JSON.stringify(instructions,null,2)+'\n');
      assert.equal(numeric.passed,true,'Original PDF instructions differ from native finite conversion.');console.log(id+': '+numeric.checks.length+' native PDF instruction checks passed.');
      const camera=shapePdfPageCamera({...c.metrics,pdfOriginPixels:c.metrics.pdfCamera.origin,page:c.metrics.pdfCamera.page},c.metrics.pdfCamera.rasterSizes);
      assert.deepEqual(camera.picture,frame.picture);const regions=[{id:'whole-picture',nodeId:null,kind:'picture',rectangle:{...frame.camera}},...frame.regions.map(r=>({...r,rectangle:{...r.rectangle,x:r.rectangle.x+frame.camera.x,y:r.rectangle.y+frame.camera.y}}))].map(r=>({...r,rasterRectangles:Object.fromEntries([1,4].map(scale=>[scale+'x',shapePdfRasterRectangle(r.rectangle,camera,scale)]))}));
      const pdfSvg=await reconstructLabelledPdf(renderer,reference,parsed,original,ink,camera.origin),variants=[{mode:'original-svg',svg:reference,units:'bp',origin:frame.origin},{mode:'native-ink',svg:native.svg,units:'cssPixels',origin:{x:0,y:0}},{mode:'pdf-instructions',svg:pdfSvg,units:'cssPixels',origin:{x:0,y:0}}];
      for(const v of variants)await save(id+'/'+v.mode+'.svg',v.svg);const pdfPages=Object.fromEntries([1,4].map(scale=>[scale,'data:image/png;base64,'+evidence.files.get('tests/Reference/LabelledBorders/'+id+'/plain-pdf-page-'+scale+'x.png').toString('base64')]));
      phase=id+'/viewport-controls';const viewport=await labelledPdfViewportControls(renderer,{caseId:id,variants,camera,regions,pdfPages},(p,b)=>save(id+'/'+p,b));await save(id+'/viewport.json',JSON.stringify(viewport,null,2)+'\n');assert.equal(viewport.passed,true,'Natural-root changes moved painted page pixels.');
      phase=id+'/raw-pdf-observations';const observations=[];
      for(const v of variants)for(const frameMode of['natural','expanded'])for(const scale of[1,4]){const result=await measureShapePdfPair(renderer,{svg:v.svg,units:v.units,svgOriginBp:v.origin,camera,regions,frame:frameMode,scale,pdfPage:pdfPages[scale],rightLabel:v.mode,cropLimit:2,cropRegionIds:[id==='lines'?'glyph-6':'glyph-0','path-'+(c.metrics.paths.length-1)]});
        assert.ok(result.repeat.pdf.exactRgbaMatch&&result.repeat.svg.exactRgbaMatch);assert.equal(result.outsideWholeChangedPixels,0);observations.push({mode:v.mode,svg:id+'/'+v.mode+'.svg',svgSha256:sha256(v.svg),units:v.units,...await saveLabelledPdfImages(save,id+'/'+v.mode+'/'+frameMode+'-'+scale+'x',result)});
        console.log(id+'/'+v.mode+'/'+frameMode+'/'+scale+'x: '+result.whole.rawChangedPixels+' pixels, '+result.whole.maxRawChannelError+' max channel.');}
      cases.push({caseId:id,frame,ink,camera,regions,variants:variants.map(v=>({mode:v.mode,svg:id+'/'+v.mode+'.svg',units:v.units,origin:v.origin})),numeric:{passed:true,checks:numeric.checks.length,report:id+'/pdf-numeric.json'},viewport,observations});
    }
    for(const[p,h]of Object.entries(artifacts))assert.equal(sha256(await read(p)),h);for(const[p,h]of Object.entries({...toolHashes,...oracle.toolHashes}))assert.equal(sha256(Buffer.from((await readFile(path.join(root,p),'utf8')).replaceAll('\r\n','\n'))),h);
    const after=await loadLabelledBorderEvidence();assert.equal(after.snapshotSha256,evidence.snapshotSha256);
    await save('index.html','<!doctype html><meta charset="utf-8"><h1>Independent labeled-border PDF observations</h1><p>No converter, candidate or image allowance. Admission pending.</p><a href="report.json">Report</a>'+cases.map(c=>'<h2>'+c.caseId+'</h2>'+c.observations.filter(v=>v.frame==='expanded'&&v.scale===1).map(v=>'<h3>'+v.mode+'</h3><img src="'+v.artifacts.sheet+'">'+v.regions.filter(r=>r.crops).map(r=>'<p>'+r.id+'</p><img src="'+r.crops.sheet+'">').join('')).join('')).join(''));
    await publish({schemaVersion:1,comparisonKind:'oracle-only-labelled-border-pdf-investigation',completed:true,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',snapshotSha256:evidence.snapshotSha256,renderer:renderer.identity,toolHashes,
      oracle:{report:'oracle/report.json',assemblySha256:oracle.oracleAssemblySha256,assemblyReferences:oracle.oracleAssemblyReferences},cases,coverage:{cases:3,paths:26,glyphs:40,numericChecks:cases.reduce((n,c)=>n+c.numeric.checks,0),viewportChecks:162,views:36,localObservations:1944},agent:{viewer:'index.html',command:'node tools/TikzVisual/inspect-labelled-border-pdf.mjs'},artifacts});
    console.log('Independent labeled-border PDF investigation completed; no image admission.');
  }finally{await renderer.browser.close();}
}
await main().catch(async error=>{process.exitCode=2;console.error(error.stack);await publish({schemaVersion:1,completed:false,phase,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,error:error.message.replaceAll(root,'<repo>'),completedCases:cases.map(c=>c.caseId),toolHashes,artifacts});});
