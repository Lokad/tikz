import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadLabelledBorderEvidence} from './labelled-border-evidence.mjs';
import {buildLabelledBorderFrame} from './labelled-border-frame.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics,measureShapePair} from './shape-image-pair.mjs';
import {sanitizeLabelledBorderLog} from './labelled-border-log.mjs';
import {validateLabelledBorderInspectionCoverage} from './labelled-border-inspection-coverage.mjs';

const base=path.join(root,'artifacts/labelled-border-inspection'),output=path.join(base,'run-'+randomUUID()),artifacts={};let phase='arguments';
const save=(p,b)=>writeArtifact(output,p,b,artifacts),read=p=>readFile(path.join(output,p));
async function publish(r){const b=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(output,'report.json',b);await writeArtifact(base,'latest.json',JSON.stringify({completed:r.completed,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');}
async function candidate(){
  const text=[];let size=0;
  const status=await new Promise((resolve,reject)=>{
    const child=spawn('dotnet',['run','--project','tools/TikzLabelledBorderComparison','-c','Release','--','--out',path.relative(root,path.join(output,'candidate'))],{cwd:root,shell:false,windowsHide:true});let settled=false;
    const finish=(error,code)=>{if(settled)return;settled=true;clearTimeout(timer);if(error){child.kill();reject(error);}else resolve(code);};
    const timer=setTimeout(()=>finish(Error('Public numeric exporter timed out.')),180000);
    const capture=b=>{size+=b.length;if(size>1000000)finish(Error('Public exporter output bound.'));else text.push(b);};
    child.stdout.on('data',capture);child.stderr.on('data',capture);child.on('error',e=>finish(e));child.on('close',code=>finish(null,code));
  });await save('candidate-command.log',sanitizeLabelledBorderLog(Buffer.concat(text).toString('utf8')));assert.ok(status===0||status===1,'Public numeric exporter failed.');return JSON.parse(await read('candidate/report.json'));
}
async function main(){
  assert.ok(process.argv.length===2||process.argv.length===4&&process.argv[2]==='--crop-region');const focus=process.argv.length===4?process.argv[3]:null;
  phase='frozen-native-evidence';const evidence=await loadLabelledBorderEvidence();
  for(const[file,bytes]of evidence.files)await save('evidence/'+file,bytes);
  const toolHashes={};for(const file of['tools/TikzVisual/inspect-labelled-borders.mjs','tools/TikzVisual/labelled-border-frame.mjs','tools/TikzVisual/labelled-border-evidence.mjs',
    'tools/TikzVisual/shape-image-pair.mjs','tools/TikzVisual/shape-raster-metrics.mjs','tools/TikzVisual/shape-frame-math.mjs','tools/TikzVisual/compare.mjs',
    'tools/TikzVisual/shape-oracle-bundle.mjs','tools/TikzVisual/labelled-border-log.mjs','tools/TikzVisual/labelled-border-inspection-coverage.mjs',
    'tools/TikzVisual/browser-profile.json','tools/TikzVisual/package-lock.json']){
    const b=Buffer.from((await readFile(path.join(root,file),'utf8')).replaceAll('\r\n','\n'));toolHashes[file]=sha256(b);await save('tool-sources/'+file,b);
  }
  const renderer=await createRenderer();
  try{
    await installShapeMetrics(renderer);phase='independent-cameras';const frames=[];
    for(const c of evidence.cases){const reference=evidence.files.get('tests/Reference/LabelledBorders/'+c.fixture.id+'/probed-reference.svg').toString('utf8');
      const frame=await buildLabelledBorderFrame(renderer,c,reference);frames.push({...frame,reference});await save(c.fixture.id+'/reference-frame.json',JSON.stringify(frame,null,2)+'\n');}
    if(focus!==null)assert.ok(frames.some(f=>f.regions.some(r=>f.caseId+':'+r.id===focus)),'Unknown fixed crop region.');
    phase='public-numeric';const numeric=await candidate();assert.equal(numeric.completed,true);assert.equal(numeric.checks,1624);assert.deepEqual(numeric.cases.map(c=>c.caseId),['lines','paths','transforms']);assert.deepEqual(numeric.cases.map(c=>c.checks),[512,578,534]);
    for(const[file,digest]of Object.entries(numeric.artifacts)){assert.ok(!path.isAbsolute(file)&&!file.split(/[\\/]/).includes('..'));const b=await read('candidate/'+file);assert.equal(sha256(b),digest);artifacts['candidate/'+file]=digest;}
    artifacts['candidate/report.json']=sha256(await read('candidate/report.json'));
    const comparisons=[],sources=[],expectedViews=[];phase='paired-images';
    for(const f of frames){const actual=await read('candidate/'+f.caseId+'/actual.svg'),scene=JSON.parse(await read('candidate/'+f.caseId+'/actual-scene.json'));
      assert.equal(scene.paths.length,evidence.cases.find(c=>c.fixture.id===f.caseId).metrics.paths.length);assert.equal(scene.glyphs.length,f.glyphs);
      const mapping=f.regions.map(r=>{const op=r.kind==='glyph'?scene.glyphs[r.glyphIndex]:scene.paths[r.nativePathIndex];
        return{caseId:f.caseId,regionId:r.id,semanticId:op?.semanticId??null,svgElementId:op?.svgElementId??null,source:op?.source??null,attribution:'corresponding public scene operation; native correspondence checked separately'};});sources.push(...mapping);
      for(const frame of['natural','expanded'])for(const scale of[1,4])for(const background of['transparent','white','black']){
        const key=f.caseId+'/'+frame+'-'+scale+'x-'+background;expectedViews.push(key);
        const m=await measureShapePair(renderer,{reference:f.reference,actual:actual.toString('utf8'),leftIsDriver:true,origin:f.origin,camera:f.camera,regions:f.regions,frame,scale,background,
          rightLabel:'Public candidate',cropLimit:8,cropRegionIds:focus&&focus.startsWith(f.caseId+':')?[focus.slice(f.caseId.length+1)]:[]});
        assert.equal(m.repeat.rawChangedPixels,0,'Original capture must repeat exactly.');assert.equal(m.regions.length,f.regions.length);
        const images={};for(const[k,b]of Object.entries(m.images)){images[k]=key+'-'+k+'.png';await save(images[k],Buffer.from(b,'base64'));}
        const crops=new Map();for(const crop of m.crops){const links={};for(const[k,b]of Object.entries({...crop.paired,sheet:crop.sheet})){links[k]=key+'-'+crop.id+'-'+k+'.png';await save(links[k],Buffer.from(b,'base64'));}crops.set(crop.id,{...links,presentation:crop.presentation});}
        comparisons.push({caseId:f.caseId,view:key,frame,scale,background,metrics:m.metrics,repeat:m.repeat,naturalFrames:m.naturalFrames,images,
          regions:m.regions.map(r=>({...r,crops:crops.get(r.id)??null})),cropCoverage:{measured:f.regions.length,saved:crops.size,truncated:crops.size<f.regions.length},approvedImagePolicy:false});
        console.log(key+': '+m.metrics.rawChangedPixels+' changed samples; research observation.');
      }
    }
    assert.equal(comparisons.length,36);assert.deepEqual(comparisons.map(c=>c.view),expectedViews);
    const rankedRegions=comparisons.flatMap(c=>c.regions.map(r=>({caseId:c.caseId,view:c.view,regionId:r.id,rawChangedPixels:r.rawChangedPixels,maxChannelError:r.maxRawChannelError,crops:r.crops,
      source:sources.find(s=>s.caseId===c.caseId&&s.regionId===r.id),focusedRerun:'node tools/TikzVisual/inspect-labelled-borders.mjs --crop-region '+c.caseId+':'+r.id}))).sort((a,b)=>b.rawChangedPixels-a.rawChangedPixels||a.view.localeCompare(b.view)||a.regionId.localeCompare(b.regionId));
    const html='<!doctype html><meta charset="utf-8"><title>Labeled-border inspection</title><h1>Independent labeled-border observations</h1><p>Numeric evidence plus raw primary images. Image/PDF admission pending.</p><a href="report.json">Report</a>'+comparisons.map(c=>'<h2>'+c.view+'</h2>'+Object.values(c.images).filter(p=>p.endsWith('-comparison.png')).map(p=>'<img src="'+p+'">').join('')+c.regions.filter(r=>r.crops).map(r=>'<p>'+r.id+'</p><img loading="lazy" src="'+r.crops.sheet+'">').join('')).join('');await save('index.html',html);
    for(const[file,digest]of Object.entries(artifacts))assert.equal(sha256(await read(file)),digest,'Changed inspection artifact.');
    const after=await loadLabelledBorderEvidence();assert.equal(after.snapshotSha256,evidence.snapshotSha256);
    const numericPassed=numeric.numericPassed;const report={schemaVersion:1,comparisonKind:'public-labelled-border-image-inspection',completed:true,overallVerdict:'pending',approvedImagePolicy:false,imageConformanceClaim:false,
      snapshotSha256:evidence.snapshotSha256,renderer:renderer.identity,toolHashes,presentation:{cropLimit:8,requestedRegion:focus},numeric:{state:numericPassed?'passed':'failed',executedChecks:1624,report:'candidate/report.json'},
      primary:{state:'pending',reason:'No oracle-only image calibration or admitted policy for this family.',observedExact:comparisons.every(c=>c.metrics.rawChangedPixels===0)},
      pdf:{state:'pending',reason:'Native page evidence retained; image comparisons and policy not yet executed.'},coverage:{expectedViews,executedViews:comparisons.map(c=>c.view),localObservations:comparisons.reduce((n,c)=>n+c.regions.length,0)},
      frames:frames.map(({reference,...f})=>f),sources,comparisons,artifacts,agent:{firstRequiredFailure:numericPassed?'primary-image-admission-pending':'native-numeric',viewer:'index.html',contactSheet:comparisons.find(c=>c.caseId==='lines'&&c.frame==='natural'&&c.scale===1&&c.background==='white').images.comparison,
        rankedRegions,focusedRerun:'node tools/TikzVisual/inspect-labelled-borders.mjs',followUpCommands:['dotnet test Lokad.TikZ.slnx','node tools/TikzVisual/labelled-border-evidence-self-test.mjs']}};
    validateLabelledBorderInspectionCoverage(report,frames);await publish(report);
    process.exitCode=numericPassed?0:1;
  }finally{await renderer.browser.close();}
}
await main().catch(async error=>{process.exitCode=2;console.error(error.stack);await publish({schemaVersion:1,completed:false,phase,overallVerdict:'infrastructure-error',approvedImagePolicy:false,imageConformanceClaim:false,error:error.message,artifacts});});
