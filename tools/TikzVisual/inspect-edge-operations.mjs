// Qualify encoding differences operation by operation, without a converter or image allowance.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadEdgeEvidence,edgeReference} from './edge-evidence.mjs';
import {edgeCanonical} from './edge-log.mjs';
import {edgeOracleVariants,readEdgeOriginal,edgeOracleInstructions,makeEdgeOracleSvg} from './edge-oracle.mjs';
import {buildEdgeOracleFrame} from './edge-oracle-frame.mjs';
import {measureEdgeOraclePair} from './edge-oracle-pair.mjs';
import {edgeOperationVariants,edgeOperationTargets,withEdgeDriverFrame,isolateEdgeOperation} from './edge-operation-svg.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

const base=path.join(root,'artifacts/edge-operation-inspection'),output=path.join(base,'run-'+randomUUID()),artifacts={},sourceHashes={},cases=[];
let phase='arguments',renderer,evidence;const save=(p,b)=>writeArtifact(output,p,b,artifacts),read=p=>readFile(path.join(output,p)),json=(p,v)=>save(p,JSON.stringify(v,null,2)+'\n');
const views=[1,4].flatMap(scale=>['transparent','white','black'].map(background=>({scale,background})));
const inputs=['inspect-edge-operations.mjs','edge-operation-svg.mjs','edge-oracle.mjs','edge-oracle-frame.mjs','edge-oracle-pair.mjs','edge-evidence.mjs','curved-node-path-units.mjs',
  'shape-frame-math.mjs','shape-image-pair.mjs','shape-raster-metrics.mjs','shape-oracle-bundle.mjs','compare.mjs','browser-profile.json','text-profile.json','node-profile.json','package.json','package-lock.json'].map(p=>'tools/TikzVisual/'+p)
  .concat(['tools/TikzEdgeOracle/Program.cs','tools/TikzEdgeOracle/TikzEdgeOracle.csproj','tools/TikzEdgeOracle/packages.lock.json','tools/TikzShapeComparison/NativeGlyphTrace.cs','Directory.Build.props','global.json','Lokad.TikZ.slnx']);
async function publish(completed,error){const report={schemaVersion:1,comparisonKind:'oracle-only-edge-operation-precision',completed,phase,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
  overallVerdict:'pending-calibration',snapshotSha256:evidence?.snapshotSha256,renderer:renderer?.identity,sourceHashes,variants:edgeOperationVariants,views,cases,artifacts,...(error?{error}:{})};
  const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',bytes);await writeArtifact(base,'latest.json',JSON.stringify({completed,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)},null,2)+'\n');
  console.log(JSON.stringify({kind:'edge-operation-inspection',completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));}
async function images(prefix,data){const links={};for(const[k,png]of Object.entries(data)){const file=prefix+'-'+k+'.png';await save(file,Buffer.from(png,'base64'));links[k]=file;}return links;}
async function observe(prefix,reference,actual,frame,regions,view,variant,target){
  const result=await measureEdgeOraclePair(renderer,{reference,actual,leftIsDriver:true,origin:frame.origin,camera:frame.camera,regions,frame:'expanded',...view,cropLimit:1,rightLabel:variant});
  assert.equal(result.repeat.rawChangedPixels,0);assert.equal(result.actualRepeat.rawChangedPixels,0);
  const links=await images(prefix,result.images),crops=[];for(const c of result.crops)crops.push({id:c.id,presentation:c.presentation,images:await images(prefix+'-'+c.id,{...c.paired,sheet:c.sheet})});
  const row={id:prefix,variant,target:target??null,...view,metrics:result.metrics,repeat:result.repeat,actualRepeat:result.actualRepeat,regions:result.regions,images:links,crops};await json(prefix+'.json',row);return row;
}
try{
  assert.equal(process.argv.length,2);await publish(false);phase='sources';for(const p of inputs){const b=edgeCanonical(await readFile(path.join(root,p)));sourceHashes[p]=sha256(b);await save('source-captures/'+p,b);}
  evidence=await loadEdgeEvidence();for(const[p,b]of evidence.files)await save('evidence/'+p,b);phase='independent-glyph-reader';let command;
  try{command=await promisify(execFile)('dotnet',['run','--project','tools/TikzEdgeOracle','-c','Release','--','--out',path.relative(root,path.join(output,'oracle'))],{cwd:root,windowsHide:true,timeout:180000,maxBuffer:1000000});}
  catch(e){await save('oracle-command.log',(String(e.stdout??'')+String(e.stderr??'')).replaceAll(root,'<repo>'));throw e;}
  await save('oracle-command.log',(command.stdout+command.stderr).replaceAll(root,'<repo>'));const glyphReport=JSON.parse(await read('oracle/report.json'));assert.equal(glyphReport.completed,true);assert.equal(glyphReport.glyphs,16);
  assert.equal(glyphReport.converterInvoked,false);assert.equal(glyphReport.approvedImagePolicy,false);assert.equal(glyphReport.imageConformanceClaim,false);assert.equal(glyphReport.snapshotSha256,evidence.snapshotSha256);
  assert.ok(glyphReport.oracleAssemblyReferences.length>0&&glyphReport.oracleAssemblyReferences.every(n=>n==='System'||n.startsWith('System.')));
  for(const[p,h]of Object.entries(glyphReport.artifacts)){assert.equal(sha256(await read('oracle/'+p)),h);artifacts['oracle/'+p]=h;}artifacts['oracle/report.json']=sha256(await read('oracle/report.json'));
  renderer=await createRenderer();await installShapeMetrics(renderer);
  for(const c of evidence.cases){const id=c.fixture.id,reference=evidence.files.get(edgeReference+id+'/plain-reference.svg').toString('utf8'),glyphs=JSON.parse(await read('oracle/'+id+'/native-glyphs.json'));
    const original=await readEdgeOriginal(renderer,reference,c.metrics,glyphs),frame=await buildEdgeOracleFrame(renderer,reference,c.metrics,glyphs,original),targets=edgeOperationTargets(c.metrics,original);
    const row={id,frame,targets,whole:[],operations:[],derivations:[]};cases.push(row);await json(id+'/original.json',original);await json(id+'/frame.json',frame);
    for(const variant of edgeOperationVariants){phase=id+'/'+variant;const v=edgeOracleVariants.find(v=>v.name===(variant==='native-driver-frame'?'native-pt-short-glyph-six':variant));
      const instructions=edgeOracleInstructions(c.metrics,glyphs,original,v),derived=await makeEdgeOracleSvg(renderer,reference,original,instructions,frame,'native-ink-six');let actual=derived.svg,numerical=null;
      if(variant==='native-driver-frame'){const transformed=await withEdgeDriverFrame(renderer,actual,frame);actual=transformed.svg;numerical=transformed.numerical;}
      await save(id+'/'+variant+'.svg',actual);row.derivations.push({variant,svg:id+'/'+variant+'.svg',numerical,serializationChecks:instructions.checks});
      for(const view of views)row.whole.push(await observe(id+'/'+variant+'/whole/'+view.scale+'x-'+view.background,reference,actual,frame,frame.regions,view,variant));
      for(const target of targets){const left=await isolateEdgeOperation(renderer,reference,target,{driver:true}),right=await isolateEdgeOperation(renderer,actual,target);
        assert.equal(left.originalDrawingCount,targets.length);assert.equal(right.originalDrawingCount,targets.length);assert.equal(left.definitionCount,right.definitionCount);
        const regions=frame.regions.filter(r=>r.id===target.id||r.id.startsWith(target.id+'.'));assert.ok(regions.length>0);const prefix=id+'/'+variant+'/'+target.id;
        await save(prefix+'-reference.svg',left.svg);await save(prefix+'-actual.svg',right.svg);
        for(const view of views)row.operations.push(await observe(prefix+'/'+view.scale+'x-'+view.background,left.svg,right.svg,frame,regions,view,variant,target));
      }
      console.log(id+'/'+variant+': '+targets.length+' isolated operations at both scales and all backgrounds.');
    }
  }
  phase='coverage';assert.deepEqual(cases.map(c=>c.id),['continuation','styles','coordinates','nodes','clipping']);assert.equal(cases.reduce((n,c)=>n+c.targets.length,0),106);
  assert.equal(cases.reduce((n,c)=>n+c.whole.length,0),90);assert.equal(cases.reduce((n,c)=>n+c.operations.length,0),1908);
  const html='<!doctype html><html lang="en"><meta charset="utf-8"><title>Native edge operation precision</title><style>body{font:16px sans-serif;margin:24px}img{max-width:100%}section{border-top:1px solid #aaa}</style><h1>Independent operation precision</h1><p>No converter; no tolerance or conformance claim. Full native cameras and original driver differences are retained.</p><a href="report.json">Report</a>'+cases.map(c=>'<h1>'+c.id+'</h1>'+c.whole.filter(o=>o.scale===1&&o.background==='white').map(o=>'<h2>'+o.variant+'</h2><img src="'+o.images.comparison+'">').join('')+
    c.operations.filter(o=>o.scale===4&&o.background==='white'&&o.metrics.rawChangedPixels).map(o=>'<section><h3>'+o.variant+' / '+o.target.id+'</h3><p>'+o.metrics.rawChangedPixels+' changed pixels; maximum '+o.metrics.maxRawChannelError+'/255.</p><img src="'+o.crops[0].images.sheet+'"></section>').join('')).join('')+'</html>';
  for(const m of html.matchAll(/(?:href|src)="([^"]+)"/g))assert.ok(m[1]==='report.json'||artifacts[m[1]]);await save('index.html',html);
  phase='integrity';for(const[p,h]of Object.entries({...sourceHashes,...glyphReport.sourceHashes}))assert.equal(sha256(edgeCanonical(await readFile(path.join(root,p)))),h);
  const after=await loadEdgeEvidence();for(const[p,b]of evidence.files)assert.ok(b.equals(after.files.get(p)));for(const[p,h]of Object.entries(artifacts))assert.equal(sha256(await read(p)),h);
  await publish(true);
}catch(error){process.exitCode=2;await publish(false,error.message.replaceAll(root,'<repo>'));console.error(error.stack);}
finally{await renderer?.browser.close();}
