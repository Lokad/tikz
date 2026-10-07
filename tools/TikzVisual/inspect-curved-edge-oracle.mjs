// Own all native-only observations in a fresh immutable run; never load a candidate.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadEdgeEvidence,edgeReference} from './curved-edge-evidence.mjs';
import {edgeCanonical} from './curved-edge-log.mjs';
import {edgeOracleVariants,edgeOracleRoots,edgeOracleInstructions,makeEdgeOracleSvg} from './edge-oracle.mjs';
import {buildCurvedEdgeFrame} from './curved-edge-frame.mjs';
import {readCurvedEdgeOriginal} from './curved-edge-original.mjs';
import {measureEdgeOraclePair} from './edge-oracle-pair.mjs';
import {observeEdgeOraclePdf} from './edge-oracle-pdf.mjs';
import {edgeOracleViewMatrix,validateEdgeOracleCoverage} from './curved-edge-oracle-coverage.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

const base=path.join(root,'artifacts/curved-edge-oracle-inspection'),output=path.join(base,'run-'+randomUUID()),artifacts={},toolHashes={};
let phase='arguments',renderer,evidence,oracle;const frames=[],derivations=[],observations=[],expectedViews=[],pdfObservations=[];
const save=(p,b)=>writeArtifact(output,p,b,artifacts),read=p=>readFile(path.join(output,p)),json=(p,v)=>save(p,JSON.stringify(v,null,2)+'\n');
const sources=['inspect-curved-edge-oracle.mjs','edge-oracle.mjs','edge-oracle-frame.mjs','edge-oracle-pair.mjs','edge-oracle-pdf.mjs','edge-oracle-coverage.mjs',
  'curved-edge-evidence.mjs','curved-edge-original.mjs','curved-edge-frame.mjs','curved-edge-oracle-coverage.mjs','curved-node-path-units.mjs','shape-frame-math.mjs','shape-image-pair.mjs','shape-raster-metrics.mjs','shape-pdf-image-pair.mjs','shape-pdf-camera.mjs',
  'shape-oracle-bundle.mjs','compare.mjs','browser-profile.json','text-profile.json','node-profile.json','package.json','package-lock.json'].map(p=>'tools/TikzVisual/'+p)
  .concat(['tools/TikzCurvedEdgeOracle/Program.cs','tools/TikzCurvedEdgeOracle/TikzCurvedEdgeOracle.csproj','tools/TikzCurvedEdgeOracle/packages.lock.json','tools/TikzShapeComparison/NativeGlyphTrace.cs','Directory.Build.props','global.json','Lokad.TikZ.slnx']);
async function publish(report){const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',bytes);
  await writeArtifact(base,'latest.json',JSON.stringify({completed:report.completed,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)},null,2)+'\n');
  console.log(JSON.stringify({kind:'curved-edge-oracle-inspection',completed:report.completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));}
async function independentGlyphs(){
  let result;try{result=await promisify(execFile)('dotnet',['run','--project','tools/TikzCurvedEdgeOracle','-c','Release','--','--out',path.relative(root,path.join(output,'oracle'))],
    {cwd:root,windowsHide:true,timeout:180000,maxBuffer:1000000});}catch(e){await save('oracle-command.log',String(e.stdout??'')+String(e.stderr??'').replaceAll(root,'<repo>'));throw e;}
  await save('oracle-command.log',(result.stdout+result.stderr).replaceAll(root,'<repo>'));
  const bytes=await read('oracle/report.json'),report=JSON.parse(bytes);assert.equal(report.completed,true);assert.equal(report.comparisonKind,'oracle-only-curved-edge-glyphs');
  assert.equal(report.converterInvoked,false);assert.equal(report.approvedImagePolicy,false);assert.equal(report.imageConformanceClaim,false);assert.equal(report.glyphs,10);assert.equal(report.snapshotSha256,evidence.snapshotSha256);
  assert.ok(report.oracleAssemblyReferences.length>0&&report.oracleAssemblyReferences.every(n=>n==='System'||n.startsWith('System.')));
  for(const[p,h]of Object.entries(report.artifacts)){assert.ok(!path.isAbsolute(p)&&!p.includes('\\')&&!p.includes(':')&&!p.split('/').includes('..'));assert.equal(sha256(await read('oracle/'+p)),h);artifacts['oracle/'+p]=h;}
  artifacts['oracle/report.json']=sha256(bytes);return report;
}
async function saveImages(prefix,images){const links={};for(const[k,png]of Object.entries(images)){const file=prefix+'-'+k+'.png';await save(file,Buffer.from(png,'base64'));links[k]=file;}return links;}
function gallery(){return '<!doctype html><html lang="en"><meta charset="utf-8"><title>Native curved-edge grounding</title><style>body{font:16px sans-serif;margin:24px}img{max-width:100%}section{border-top:1px solid #ccc;padding:12px}</style><h1>Independent curved-edge precision and framing</h1><p>No converter invoked. Image calibration and admission are pending. Original driver losses remain visible.</p><p><a href="report.json">Complete report</a></p>'+
  '<button onclick="document.querySelectorAll(\'img\').forEach(i=>i.style.maxWidth=i.style.maxWidth===\'none\'?\'100%\':\'none\')">Toggle native-size zoom</button>'+
  observations.filter(o=>o.scale===1&&o.background==='white').map(o=>'<section><h2>'+o.id+'</h2><img src="'+o.images.comparison+'" alt="Original | independent representation | amplified difference"><p>'+o.metrics.rawChangedPixels+' changed pixels; maximum '+o.metrics.maxRawChannelError+'/255. Research observation.</p><a href="'+derivations.find(d=>d.id===o.caseId+'/'+o.variant+'/'+o.root).svg+'">Independent SVG</a></section>').join('')+
  '<h1>Ordinary native PDF</h1>'+pdfObservations.filter(o=>o.scale===1).map(o=>'<section><h2>'+o.id+'</h2><img src="'+o.images.sheet+'" alt="PDF | SVG | amplified difference">'+o.crops.map(c=>'<p>'+c.id+'</p><img src="'+c.images.sheet+'" alt="Native local PDF pair">').join('')+'</section>').join('')+'</html>';}

try{
  assert.equal(process.argv.length,2);await publish({schemaVersion:1,completed:false,phase,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false});
  phase='source-capture';for(const p of sources){const b=edgeCanonical(await readFile(path.join(root,p)));toolHashes[p]=sha256(b);await save('tool-sources/'+p,b);}
  phase='frozen-evidence';evidence=await loadEdgeEvidence();for(const[p,b]of evidence.files)await save('evidence/'+p,b);
  phase='independent-dvi-reader';oracle=await independentGlyphs();phase='renderer';renderer=await createRenderer();await installShapeMetrics(renderer);
  for(const c of evidence.cases){const id=c.fixture.id,reference=evidence.files.get(edgeReference+id+'/plain-reference.svg').toString('utf8'),glyphs=JSON.parse(await read('oracle/'+id+'/native-glyphs.json'));
    phase='native-frame/'+id;const original=await readCurvedEdgeOriginal(renderer,reference,c.metrics,glyphs),frame=await buildCurvedEdgeFrame(renderer,reference,c.metrics,glyphs,original);frames.push(frame);
    await json(id+'/original-operations.json',original);await json(id+'/frame.json',frame);let semantic;
    for(const v of edgeOracleVariants){const instructions=edgeOracleInstructions(c.metrics,glyphs,original,v),instructionFile=id+'/'+v.name+'/instructions.json';await json(instructionFile,instructions);let drawingHash;
      for(const rootMode of edgeOracleRoots){const prefix=id+'/'+v.name+'/'+rootMode;phase='primary/'+prefix;const generated=await makeEdgeOracleSvg(renderer,reference,original,instructions,frame,rootMode);
        const currentHash=sha256(generated.drawing);if(drawingHash)assert.equal(currentHash,drawingHash,'Changing a root changed the drawing.');drawingHash=currentHash;
        await save(prefix+'.svg',generated.svg);derivations.push({id:prefix,svg:prefix+'.svg',instructions:instructionFile,serializationChecks:instructions.checks.length,root:generated.root,rootChecks:generated.rootChecks,drawingSha256:drawingHash});
        if(v.name==='native-pt-short-glyph-six'&&rootMode==='native-ink-six')semantic=generated.svg;
        for(const view of edgeOracleViewMatrix){const key=prefix+'/'+view.frame+'-'+view.scale+'x-'+view.background;expectedViews.push(key);
          const m=await measureEdgeOraclePair(renderer,{reference,actual:generated.svg,leftIsDriver:true,origin:frame.origin,camera:frame.camera,regions:frame.regions,...view,
            rightLabel:v.name,cropLimit:2,cropRegionIds:id==='clipping'?['clip-1','clip-1.curve-1.t-0.5']:['glyph-0']});
          assert.equal(m.repeat.rawChangedPixels,0);assert.equal(m.actualRepeat.rawChangedPixels,0);const images=await saveImages(key,m.images),crops=new Map();
          for(const crop of m.crops)crops.set(crop.id,{links:await saveImages(key+'-'+crop.id,{...crop.paired,sheet:crop.sheet}),presentation:crop.presentation});
          const row={id:key,caseId:id,variant:v.name,root:rootMode,...view,metrics:m.metrics,repeat:m.repeat,actualRepeat:m.actualRepeat,images,naturalFrames:m.naturalFrames,
            regions:m.regions.map(r=>({...r,crops:crops.get(r.id)?.links??null,...(crops.has(r.id)?{presentation:crops.get(r.id).presentation}:{})}))};
          observations.push(row);await json(key+'.json',row);
        }
        console.log(prefix+': 12 native-only views retained.');
      }
    }
    assert.ok(semantic);for(const scale of[1,4]){phase='pdf/'+id+'/'+scale+'x';const page=evidence.files.get(edgeReference+id+'/plain-pdf-page-'+scale+'x.png');
      const observed=await observeEdgeOraclePdf(renderer,{metrics:c.metrics,frame,reference,semantic,pdfPage:'data:image/png;base64,'+page.toString('base64'),scale});await json(id+'/pdf/registration-'+scale+'x.json',{camera:observed.camera,regions:observed.regions});
      for(const o of observed.observations){const key=id+'/pdf/'+o.route+'/'+scale+'x',images=await saveImages(key,o.images),crops=[];
        for(const crop of o.crops)crops.push({...crop,images:await saveImages(key+'-'+crop.id,crop.images)});
        const {images:unusedImages,crops:unusedCrops,...measurements}=o,row={id:key,caseId:id,...measurements,images,crops,pdfPage:'evidence/'+edgeReference+id+'/plain-pdf-page-'+scale+'x.png'};
        pdfObservations.push(row);await json(key+'.json',row);
      }
    }
    console.log(id+': native frames, 180 primary views and four PDF observations retained.');
  }
  phase='final-integrity';const html=gallery();for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g))assert.ok(match[1]==='report.json'||artifacts[match[1]],'Missing gallery artifact: '+match[1]);await save('index.html',html);
  for(const[p,h]of Object.entries({...toolHashes,...oracle.sourceHashes}))assert.equal(sha256(edgeCanonical(await readFile(path.join(root,p)))),h,'Source changed during native inspection.');
  const after=await loadEdgeEvidence();for(const[p,b]of evidence.files)assert.ok(b.equals(after.files.get(p)),'Native evidence changed.');
  for(const[p,h]of Object.entries(artifacts))assert.equal(sha256(await read(p)),h,'Inspection artifact changed.');
  const contact=observations.find(o=>o.caseId==='clipping'&&o.variant==='native-pt-short-glyph-six'&&o.root==='native-ink-six'&&o.frame==='expanded'&&o.scale===1&&o.background==='white');
  const matching=observations.find(o=>o.id===contact.id.replace('1x-white','4x-white')),region=contact.regions.find(r=>r.id==='clip-1'),pair=matching.regions.find(r=>r.id===region.id);
  const report={schemaVersion:1,comparisonKind:'oracle-only-curved-edge-precision-framing',completed:true,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending-image-calibration',
    snapshotSha256:evidence.snapshotSha256,renderer:renderer.identity,toolHashes,glyphs:10,variants:edgeOracleVariants,roots:edgeOracleRoots,frames,derivations,expectedViews,observations,pdfObservations,
    oracle:{report:'oracle/report.json',assemblyReferences:oracle.oracleAssemblyReferences,assemblySha256:oracle.oracleAssemblySha256},
    coverage:{derivations:75,views:observations.length,localObservations:observations.reduce((n,o)=>n+o.regions.length,0),independentRegions:frames.reduce((n,f)=>n+f.regions.length,0),
      serializationChecks:3784,rootChecks:derivations.reduce((n,d)=>n+d.rootChecks.length,0),pdfViews:pdfObservations.length,pdfLocalObservations:pdfObservations.reduce((n,o)=>n+o.regions.length,0)},artifacts,
    agent:{viewer:'index.html',contactSheet:contact.images.comparison,nativeGlyphs:'oracle/nodes/native-glyphs.json',firstRequiredFailure:'image-calibration-pending',focusedRerun:['node','tools/TikzVisual/inspect-curved-edge-oracle.mjs'],
      rankedRegions:[{caseId:'clipping',regionId:region.id,scale:1,background:'white',fidelity:'research-observation',reference:region.crops.reference,actual:region.crops.actual,difference:region.crops.amplified,matching4x:pair.crops.sheet}]}};
  validateEdgeOracleCoverage(report,frames);await publish(report);console.log('Native-only edge observations complete; no image allowance or converter conformance claimed.');
}catch(error){process.exitCode=2;await publish({schemaVersion:1,completed:false,phase,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,error:error.message.replaceAll(root,'<repo>'),
  snapshotSha256:evidence?.snapshotSha256,renderer:renderer?.identity,toolHashes,frames,derivations,observations,pdfObservations,artifacts});console.error(error.stack);}
finally{await renderer?.browser.close();}
