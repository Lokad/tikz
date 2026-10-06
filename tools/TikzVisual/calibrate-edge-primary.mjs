// Native-only calibration and image-only sensitivity. This command cannot admit a policy.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {edgeCanonical} from './edge-log.mjs';
import {loadEdgeEvidence,edgeReference} from './edge-evidence.mjs';
import {readEdgeOriginal} from './edge-oracle.mjs';
import {buildEdgeOracleFrame} from './edge-oracle-frame.mjs';
import {measureEdgeOraclePair} from './edge-oracle-pair.mjs';
import {buildEdgePrimaryReference,edgePrimaryContract} from './edge-primary-reference.mjs';
import {deriveEdgePrimaryPolicy,evaluateEdgePrimary,edgePrimaryViews,edgePrimaryViewKey} from './edge-primary-policy.mjs';
import {edgePrimaryDefects,mutateEdgePrimary} from './edge-primary-defects.mjs';
import {edgePrimaryVisibility,edgeVisibilityPair} from './edge-primary-visibility.mjs';
import {deriveShapeTrialPolicy,evaluateShapeTrial} from './shape-primary-trial-policy.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';

const base=path.join(root,'artifacts/edge-primary-calibration'),output=path.join(base,'run-'+randomUUID()),artifacts={},sourceHashes={},cases=[],defects=[],visibility=[];
let phase='arguments',renderer,evidence,policy;const save=(p,b)=>writeArtifact(output,p,b,artifacts),read=p=>readFile(path.join(output,p)),json=(p,o)=>save(p,JSON.stringify(o,null,2)+'\n');
const inputs=['calibrate-edge-primary.mjs','edge-primary-reference.mjs','edge-primary-policy.mjs','edge-primary-defects.mjs','edge-primary-visibility.mjs','shape-primary-trial-policy.mjs','edge-oracle.mjs','edge-oracle-frame.mjs','edge-oracle-pair.mjs','edge-evidence.mjs','curved-node-path-units.mjs',
  'shape-frame-math.mjs','shape-image-pair.mjs','shape-raster-metrics.mjs','shape-oracle-bundle.mjs','compare.mjs','browser-profile.json','text-profile.json','node-profile.json','package.json','package-lock.json'].map(p=>'tools/TikzVisual/'+p)
  .concat(['tools/TikzEdgeOracle/Program.cs','tools/TikzEdgeOracle/TikzEdgeOracle.csproj','tools/TikzEdgeOracle/packages.lock.json','tools/TikzShapeComparison/NativeGlyphTrace.cs','Directory.Build.props','global.json','Lokad.TikZ.slnx']);
async function publish(completed,error){const report={schemaVersion:1,comparisonKind:'oracle-only-edge-primary-calibration',completed,phase,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
  overallVerdict:'pending',contract:edgePrimaryContract,requiredViews:edgePrimaryViews,snapshotSha256:evidence?.snapshotSha256,renderer:renderer?.identity,sourceHashes,cases,policy,defects,visibility,artifacts,...(error?{error}:{})};
  const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',bytes);await writeArtifact(base,'latest.json',JSON.stringify({completed,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)},null,2)+'\n');
  console.log(JSON.stringify({kind:'edge-primary-calibration',completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));}
async function images(prefix,data){const links={};for(const[k,png]of Object.entries(data)){const file=prefix+'-'+k+'.png';await save(file,Buffer.from(png,'base64'));links[k]=file;}return links;}
async function observe(prefix,reference,actual,frame,view,cropRegionIds=[]){
  const result=await measureEdgeOraclePair(renderer,{reference,actual,leftIsDriver:true,origin:frame.origin,camera:frame.camera,regions:frame.regions,...view,cropLimit:2,cropRegionIds,rightLabel:'Native short pt / glyph six'});
  assert.equal(result.repeat.rawChangedPixels,0);assert.equal(result.actualRepeat.rawChangedPixels,0);
  if(result.images.comparison){result.images.comparison=await renderer.page.evaluate(async({images,label})=>{
    const decoded=[];for(const k of['reference','actual','amplified']){const image=new Image();image.src='data:image/png;base64,'+images[k];await image.decode();decoded.push(image);}
    const width=decoded[0].width,height=decoded[0].height,canvas=document.createElement('canvas');canvas.width=3*width;canvas.height=height+48;const ctx=canvas.getContext('2d');
    ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='black';ctx.font='12px sans-serif';
    [label,'Native short pt\nGlyph matrix six','Raw difference\nAmplified ×16'].forEach((text,i)=>{text.split('\n').forEach((line,j)=>ctx.fillText(line,i*width+4,16+j*16));ctx.drawImage(decoded[i],i*width,48);});
    return canvas.toDataURL('image/png').split(',')[1];
  },{images:result.images,label:prefix.includes('/original-driver/')?'Original driver':'Derived driver\nRestored line if noted'});}
  const row={id:prefix,converterInvoked:false,...view,metrics:result.metrics,repeat:result.repeat,actualRepeat:result.actualRepeat,naturalFrames:result.naturalFrames,regions:result.regions,images:await images(prefix,result.images),crops:[]};
  for(const c of result.crops)row.crops.push({id:c.id,presentation:c.presentation,images:await images(prefix+'-'+c.id,{...c.paired,sheet:c.sheet})});await json(prefix+'.json',row);return row;
}
try{
  assert.equal(process.argv.length,2);await publish(false);phase='sources';for(const p of inputs){const b=edgeCanonical(await readFile(path.join(root,p)));sourceHashes[p]=sha256(b);await save('source-captures/'+p,b);}
  evidence=await loadEdgeEvidence();for(const[p,b]of evidence.files)await save('evidence/'+p,b);phase='native-glyphs';let command;
  try{command=await promisify(execFile)('dotnet',['run','--project','tools/TikzEdgeOracle','-c','Release','--','--out',path.relative(root,path.join(output,'oracle'))],{cwd:root,windowsHide:true,timeout:180000,maxBuffer:1000000});}
  catch(e){await save('oracle-command.log',(String(e.stdout??'')+String(e.stderr??'')).replaceAll(root,'<repo>'));throw e;}
  await save('oracle-command.log',(command.stdout+command.stderr).replaceAll(root,'<repo>'));const glyphReport=JSON.parse(await read('oracle/report.json'));assert.equal(glyphReport.completed,true);assert.equal(glyphReport.glyphs,16);
  for(const k of['converterInvoked','approvedImagePolicy','imageConformanceClaim'])assert.equal(glyphReport[k],false);assert.equal(glyphReport.snapshotSha256,evidence.snapshotSha256);
  assert.ok(glyphReport.oracleAssemblyReferences.length>0&&glyphReport.oracleAssemblyReferences.every(n=>n==='System'||n.startsWith('System.')));
  for(const[p,h]of Object.entries(glyphReport.artifacts)){assert.equal(sha256(await read('oracle/'+p)),h);artifacts['oracle/'+p]=h;}artifacts['oracle/report.json']=sha256(await read('oracle/report.json'));
  renderer=await createRenderer();await installShapeMetrics(renderer);
  for(const c of evidence.cases){const id=c.fixture.id;assert.equal(c.metrics.caseId,id);const reference=evidence.files.get(edgeReference+id+'/plain-reference.svg').toString('utf8'),glyphs=JSON.parse(await read('oracle/'+id+'/native-glyphs.json'));
    const original=await readEdgeOriginal(renderer,reference,c.metrics,glyphs),frame=await buildEdgeOracleFrame(renderer,reference,c.metrics,glyphs,original);frame.regions=frame.regions.map(r=>({...r,nodeId:r.nodeId??null}));
    const built=await buildEdgePrimaryReference(renderer,reference,c.metrics,glyphs,original,frame),row={id,frame,corrections:built.corrections,serializationChecks:built.serializationChecks,paintChecks:built.paintChecks,rootChecks:built.rootChecks,
      svg:{original:id+'/original.svg',reference:id+'/derived-driver.svg',native:id+'/native.svg'},measurements:[],replays:[],originalDiagnostics:[]};cases.push(row);
    await json(id+'/original.json',original);await json(id+'/frame.json',frame);for(const[k,s]of Object.entries({original:reference,reference:built.referenceSvg,native:built.nativeSvg}))await save(row.svg[k],s);
    phase=id+'/measurements';for(const view of edgePrimaryViews)row.measurements.push(await observe(id+'/calibration/'+edgePrimaryViewKey(view),built.referenceSvg,built.nativeSvg,frame,view,id==='clipping'?['path-15']:[]));
    if(built.corrections.length){for(const view of edgePrimaryViews)row.originalDiagnostics.push(await observe(id+'/original-driver/'+edgePrimaryViewKey(view),reference,built.nativeSvg,frame,view,['path-15']));}
    console.log(id+': all native-only primary calibration views saved.');
  }
  phase='derive-policy';policy=deriveEdgePrimaryPolicy(cases);await json('trial-policy.json',policy);
  for(const c of cases){phase=c.id+'/replays';for(const view of edgePrimaryViews){const row=await observe(c.id+'/replay/'+edgePrimaryViewKey(view),(await read(c.svg.reference)).toString('utf8'),(await read(c.svg.native)).toString('utf8'),c.frame,view),first=c.measurements.find(r=>edgePrimaryViewKey(r)===edgePrimaryViewKey(view));
      assert.deepEqual(row.metrics,first.metrics);assert.deepEqual(row.regions,first.regions);assert.deepEqual(row.naturalFrames,first.naturalFrames);assert.equal(evaluateEdgePrimary(policy,c.id,row).passed,true);c.replays.push(row);
      for(const k of['reference','actual','difference','alpha-difference','amplified','overlay'])assert.equal(artifacts[row.images[k]],artifacts[first.images[k]]);
    }}
  for(const defect of edgePrimaryDefects){phase='defect/'+defect.name;const c=cases.find(c=>c.id===defect.caseId),native=evidence.cases.find(n=>n.fixture.id===c.id),original=JSON.parse(await read(c.id+'/original.json'));
    const input=await mutateEdgePrimary(renderer,(await read(c.svg.native)).toString('utf8'),original,native.metrics,defect),row={...defect,numericGatesBypassed:true,converterInvoked:false,input:c.id+'/defects/'+defect.name+'.svg',comparisons:[]};defects.push(row);await save(row.input,input);
    for(const view of edgePrimaryViews.filter(v=>!defect.frames||defect.frames.includes(v.frame))){const observation=await observe(c.id+'/defects/'+defect.name+'/'+edgePrimaryViewKey(view),(await read(c.svg.reference)).toString('utf8'),input,c.frame,view,[defect.target]);
      observation.evaluation=evaluateEdgePrimary(policy,c.id,observation);row.comparisons.push(observation);const invisible=(defect.invisibleBackgrounds??[]).includes(view.background);
      assert.equal(observation.evaluation.passed,invisible,'Incorrect visible-defect outcome: '+defect.name+' '+edgePrimaryViewKey(view));
      if(invisible){const unchanged=c.measurements.find(q=>edgePrimaryViewKey(q)===edgePrimaryViewKey(view));assert.equal(artifacts[observation.images.actual],artifacts[unchanged.images.actual],'Declared background-invisible change altered samples.');}
      else assert.ok(observation.evaluation.checks.some(q=>q.id===defect.target&&!q.passed),'Defect rejected outside its native target: '+defect.name);
    }console.log(defect.name+': visible target views rejected; declared background-invisible views unchanged.');
  }
  for(const control of edgePrimaryVisibility){phase='visibility/'+control.name;const c=cases.find(c=>c.id===control.caseId),native=evidence.cases.find(n=>n.fixture.id===c.id),
    pair=await edgeVisibilityPair(renderer,(await read(c.svg.reference)).toString('utf8'),(await read(c.svg.native)).toString('utf8'),native.metrics,control),row={...control,
      converterInvoked:false,numericGatesBypassed:true,fidelity:'Controlled renderer-only paint perturbation; not a new native TikZ fixture.',inputs:{},unchanged:[],comparisons:[]};visibility.push(row);
    for(const[k,s]of Object.entries(pair)){row.inputs[k]=c.id+'/visibility/'+control.name+'-'+k+'.svg';await save(row.inputs[k],s);}
    for(const view of edgePrimaryViews)row.unchanged.push(await observe(c.id+'/visibility/'+control.name+'/unchanged/'+edgePrimaryViewKey(view),pair.reference,pair.native,c.frame,view,[control.target]));
    row.policy=deriveShapeTrialPolicy(row.unchanged.map(o=>({...o,...o.metrics})),control.name+'; controlled renderer-only opacity '+control.opacity,edgePrimaryViews);
    for(const view of edgePrimaryViews){const unchanged=row.unchanged.find(q=>edgePrimaryViewKey(q)===edgePrimaryViewKey(view));
      unchanged.evaluation=evaluateShapeTrial(row.policy,view,unchanged);assert.equal(unchanged.evaluation.passed,true,'Independently calibrated unchanged control failed.');
      const observation=await observe(c.id+'/visibility/'+control.name+'/missing/'+edgePrimaryViewKey(view),pair.reference,pair.missing,c.frame,view,[control.target]);observation.evaluation=evaluateEdgePrimary(policy,c.id,observation);row.comparisons.push(observation);
      observation.evaluation=evaluateShapeTrial(row.policy,view,observation);
      const expectedPassed=control.expectedPassed||(control.invisibleBackgrounds??[]).includes(view.background);assert.equal(observation.evaluation.passed,expectedPassed,'Incorrect faint-content sensitivity: '+control.name+' '+edgePrimaryViewKey(view));
      observation.observedVisible=artifacts[observation.images.actual]!==artifacts[unchanged.images.actual];assert.equal(observation.observedVisible,!expectedPassed,'Declared visibility differs from raster samples.');
      if(!expectedPassed)assert.ok(observation.evaluation.checks.some(q=>q.id===control.target&&!q.passed),'Faint loss rejected outside target.');
    }console.log(control.name+': controlled visibility expectations verified.');
  }
  phase='viewer';const links=cases.flatMap(c=>c.measurements.filter(o=>o.scale===1&&o.background==='white').map(o=>o.images.comparison)).concat(defects.flatMap(d=>d.comparisons.filter(o=>o.scale===1&&o.background==='white').map(o=>o.crops.find(c=>c.id===d.target).images.sheet)));
  links.push(...visibility.flatMap(d=>d.comparisons.filter(o=>o.scale===1&&o.background==='white').map(o=>o.crops.find(c=>c.id===d.target).images.sheet)));
  const html='<!doctype html><html lang="en"><meta charset="utf-8"><title>Native edge primary calibration</title><style>body{font:16px sans-serif;margin:24px}img{max-width:100%;display:block}</style><h1>Native primary calibration; admission pending</h1><p>No converter or approved image policy. Original-driver missing-dot comparisons remain diagnostic.</p><a href="report.json">Report</a>'+links.map(p=>'<h2>'+p+'</h2><img src="'+p+'">').join('')+'</html>';for(const p of links)assert.ok(artifacts[p]);await save('index.html',html);
  phase='final-integrity';for(const[p,h]of Object.entries({...sourceHashes,...glyphReport.sourceHashes}))assert.equal(sha256(edgeCanonical(await readFile(path.join(root,p)))),h);
  const after=await loadEdgeEvidence();for(const[p,b]of evidence.files)assert.ok(b.equals(after.files.get(p)));for(const[p,h]of Object.entries(artifacts))assert.equal(sha256(await read(p)),h);await publish(true);
}catch(error){process.exitCode=2;await publish(false,error.message.replaceAll(root,'<repo>'));console.error(error.stack);}
finally{await renderer?.browser.close();}
