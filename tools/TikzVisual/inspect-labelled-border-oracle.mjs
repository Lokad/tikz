// Factorial precision/framing observations from independently frozen inputs.
// This command never loads the converter or any candidate artifact.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadLabelledBorderEvidence} from './labelled-border-evidence.mjs';
import {buildLabelledBorderFrame} from './labelled-border-frame.mjs';
import {labelledOracleVariants,labelledOracleRoots,readLabelledOriginal,labelledOracleInstructions,makeLabelledOracleSvg} from './labelled-border-oracle.mjs';
import {validateLabelledOracleCoverage} from './labelled-border-oracle-coverage.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics,measureShapePair} from './shape-image-pair.mjs';
import {sanitizeLabelledBorderLog} from './labelled-border-log.mjs';

const base=path.join(root,'artifacts/labelled-border-oracle-inspection'),output=path.join(base,'run-'+randomUUID()),artifacts={},toolHashes={};let phase='arguments';
const save=(p,b)=>writeArtifact(output,p,b,artifacts),read=p=>readFile(path.join(output,p));
async function publish(report){const b=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',b);await writeArtifact(base,'latest.json',JSON.stringify({completed:report.completed,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');}
async function independentGlyphs(){
  const captured=[];let bytes=0;
  const status=await new Promise((resolve,reject)=>{const child=spawn('dotnet',['run','--project','tools/TikzLabelledBorderOracle','-c','Release','--','--out',path.relative(root,path.join(output,'oracle'))],{cwd:root,windowsHide:true,shell:false});let settled=false;
    const finish=(error,code)=>{if(settled)return;settled=true;clearTimeout(timer);if(error){child.kill();reject(error);}else resolve(code);};
    const timer=setTimeout(()=>finish(Error('Independent DVI reader timed out.')),180000);
    const capture=b=>{bytes+=b.length;if(bytes>1000000)finish(Error('Independent DVI reader output bound.'));else captured.push(b);};
    child.stdout.on('data',capture);child.stderr.on('data',capture);child.on('error',e=>finish(e));child.on('close',code=>finish(null,code));});
  await save('oracle-command.log',sanitizeLabelledBorderLog(Buffer.concat(captured).toString('utf8')));assert.equal(status,0,'Independent glyph reader failed.');
  const report=JSON.parse(await read('oracle/report.json'));assert.equal(report.completed,true);assert.equal(report.converterInvoked,false);assert.equal(report.glyphs,40);
  assert.equal(report.comparisonKind,'oracle-only-labelled-border-glyphs');assert.ok(report.oracleAssemblyReferences.every(n=>n==='System'||n.startsWith('System.')));
  for(const[p,h]of Object.entries(report.artifacts)){assert.ok(!path.isAbsolute(p)&&!p.split(/[\\/]/).includes('..'));const b=await read('oracle/'+p);assert.equal(sha256(b),h);artifacts['oracle/'+p]=h;}
  artifacts['oracle/report.json']=sha256(await read('oracle/report.json'));return report;
}
async function main(){
  assert.equal(process.argv.length,2);await publish({completed:false,phase,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false});
  phase='frozen-evidence';const evidence=await loadLabelledBorderEvidence();for(const[p,b]of evidence.files)await save('evidence/'+p,b);
  for(const p of['inspect-labelled-border-oracle.mjs','labelled-border-oracle.mjs','labelled-border-oracle-coverage.mjs','labelled-border-evidence.mjs','labelled-border-frame.mjs',
    'curved-node-path-units.mjs','shape-frame-math.mjs','shape-image-pair.mjs','shape-raster-metrics.mjs','shape-oracle-bundle.mjs','labelled-border-log.mjs',
    'compare.mjs','browser-profile.json','text-profile.json','node-profile.json','package.json','package-lock.json']){
    const file='tools/TikzVisual/'+p,b=Buffer.from((await readFile(path.join(root,file),'utf8')).replaceAll('\r\n','\n'));toolHashes[file]=sha256(b);await save('tool-sources/'+file,b);}
  const renderer=await createRenderer();
  try{
    await installShapeMetrics(renderer);phase='independent-frames';const frames=[];
    for(const c of evidence.cases)frames.push(await buildLabelledBorderFrame(renderer,c,evidence.files.get('tests/Reference/LabelledBorders/'+c.fixture.id+'/probed-reference.svg').toString('utf8')));
    phase='independent-dvi-reader';const oracle=await independentGlyphs();assert.equal(oracle.snapshotSha256,evidence.snapshotSha256);
    const derivations=[],observations=[],expectedViews=[];
    for(const c of evidence.cases){const id=c.fixture.id,frame=frames.find(f=>f.caseId===id),reference=evidence.files.get('tests/Reference/LabelledBorders/'+id+'/probed-reference.svg').toString('utf8');
      const glyphs=JSON.parse(await read('oracle/'+id+'/native-glyphs.json')),original=await readLabelledOriginal(renderer,reference,c.metrics,glyphs,frame);await save(id+'/original-operations.json',JSON.stringify(original,null,2)+'\n');
      for(const v of labelledOracleVariants){phase=id+'/'+v.name;const instructions=labelledOracleInstructions(c.metrics,glyphs,original,v),instructionFile=id+'/'+v.name+'/instructions.json';
        await save(instructionFile,JSON.stringify(instructions,null,2)+'\n');let drawingHash=null;
        for(const rootMode of labelledOracleRoots){const svg=await makeLabelledOracleSvg(renderer,reference,original,instructions,frame,rootMode),prefix=id+'/'+v.name+'/'+rootMode;
          if(drawingHash===null)drawingHash=sha256(svg.drawing);else assert.equal(sha256(svg.drawing),drawingHash,'Changing root framing changed drawing instructions.');
          await save(prefix+'.svg',svg.svg);derivations.push({id:prefix,svg:prefix+'.svg',instructions:instructionFile,serializationChecks:instructions.checks.length,root:svg.root,rootChecks:svg.rootChecks,drawingSha256:drawingHash});
          const captured=[];
          for(const framing of['natural','expanded'])for(const scale of[1,4])for(const background of['transparent','white','black']){
            const view={frame:framing,scale,background},key=prefix+'/'+framing+'-'+scale+'x-'+background;expectedViews.push(key);
            const m=await measureShapePair(renderer,{reference,actual:svg.svg,leftIsDriver:true,origin:frame.origin,camera:frame.camera,regions:frame.regions,...view,
              rightLabel:v.name,cropLimit:2,cropRegionIds:[id==='lines'?'glyph-6':'glyph-0','path-'+(c.metrics.paths.length-1)]});
            assert.equal(m.repeat.rawChangedPixels,0);const images={},crops=new Map();
            for(const[k,png]of Object.entries(m.images)){images[k]=key+'-'+k+'.png';await save(images[k],Buffer.from(png,'base64'));}
            for(const crop of m.crops){const links={};for(const[k,png]of Object.entries({...crop.paired,sheet:crop.sheet})){links[k]=key+'-'+crop.id+'-'+k+'.png';await save(links[k],Buffer.from(png,'base64'));}crops.set(crop.id,links);}
            const row={id:key,caseId:id,variant:v.name,root:rootMode,...view,metrics:m.metrics,repeat:m.repeat,images,naturalFrames:m.naturalFrames,regions:m.regions.map(r=>({...r,crops:crops.get(r.id)??null}))};
            observations.push(row);captured.push(row);
          }
          console.log(prefix+': 12 reference-only views; maximum raw channel error '+Math.max(...captured.map(r=>r.metrics.maxRawChannelError))+'.');
        }
      }
    }
    phase='final-integrity';const after=await loadLabelledBorderEvidence();assert.equal(after.snapshotSha256,evidence.snapshotSha256);
    for(const[p,h]of Object.entries(artifacts))assert.equal(sha256(await read(p)),h,'Changed independent artifact.');
    for(const[p,h]of Object.entries({...toolHashes,...oracle.toolHashes}))assert.equal(sha256(Buffer.from((await readFile(path.join(root,p),'utf8')).replaceAll('\r\n','\n'))),h,'Changed independent tool.');
    const html='<!doctype html><meta charset="utf-8"><title>Labeled-border oracle precision</title><h1>Independent precision and framing observations</h1><p>No converter; no image allowance or admission.</p><a href="report.json">Report</a>'+observations.filter(o=>o.scale===1&&o.background==='white').map(o=>'<h2>'+o.id+'</h2><img src="'+o.images.comparison+'">').join('');await save('index.html',html);
    const report={schemaVersion:1,comparisonKind:'oracle-only-labelled-border-precision-framing',completed:true,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',
      snapshotSha256:evidence.snapshotSha256,renderer:renderer.identity,toolHashes,glyphs:40,variants:labelledOracleVariants,roots:labelledOracleRoots,frames,derivations,expectedViews,observations,
      oracle:{report:'oracle/report.json',assemblyReferences:oracle.oracleAssemblyReferences,assemblySha256:oracle.oracleAssemblySha256},coverage:{views:observations.length,localObservations:observations.reduce((n,o)=>n+o.regions.length,0),independentRegions:162},artifacts,
      agent:{viewer:'index.html',contactSheet:observations.find(o=>o.caseId==='lines'&&o.variant==='native-pt-short-glyph-six'&&o.root==='native-picture-six'&&o.frame==='natural'&&o.scale===1&&o.background==='white').images.comparison}};
    validateLabelledOracleCoverage(report,frames);await publish(report);
    console.log('Independent labeled-border precision: '+observations.length+' views; admission pending.');
  }finally{await renderer.browser.close();}
}
await main().catch(async error=>{process.exitCode=2;const message=error.message.replaceAll(root,'<repo>');console.error(error.stack);await publish({schemaVersion:1,completed:false,phase,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,error:message,artifacts});});
