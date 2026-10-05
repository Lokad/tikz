import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { root,sha256,writeArtifact } from './shape-oracle-bundle.mjs';
import { unionBounds } from './shape-frame-math.mjs';

const output=path.join(root,'artifacts/node-shape-frame-comparisons');
async function command(executable,args,candidate=false){
  await new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{cwd:root,windowsHide:true,shell:false});let captured='',settled=false;
    const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);if(error){child.kill();reject(error);}else resolve();};
    const timer=setTimeout(()=>finish(new Error('Required shape command timed out.')),240000);
    const capture=bytes=>{captured+=bytes.toString();if(captured.length>1048576)finish(new Error('Shape command exceeded its output bound.'));};
    child.stdout.on('data',capture);child.stderr.on('data',capture);child.on('error',finish);
    child.on('close',code=>{process.stdout.write(captured);const error=code===0?null:new Error('Required shape command failed, exit '+code);
      if(error&&candidate&&[1,3].includes(code))error.exitCode=code;finish(error);});
  });
}
async function main(){
  assert.equal(process.argv.length,2,'Usage: node tools/TikzVisual/compare-shape-frames.mjs');
  // Establish all expected ink and frame quantities before invoking the
  // candidate. The oracle command has no converter reference or invocation.
  await command('node',['tools/TikzVisual/inspect-shape-frames.mjs']);
  const frameBytes=await readFile(path.join(root,'artifacts/node-shape-frames/frames.json')),reference=JSON.parse(frameBytes);
  assert.equal(reference.completed,true);assert.equal(reference.converterInvoked,false);assert.equal(reference.conformanceClaim,false);
  assert.equal(reference.approvedImagePolicy,false);assert.equal(reference.analyticBrowserValidation.passed,true);assert.equal(reference.checks.length,98);
  const expected=reference.checks.map(c=>({id:c.id,nodeId:c.nodeId,kind:c.kind,bounds:c.native}));
  const expectedInk=reference.frames.nativeInk,expectedPicture=reference.frames.picture,expectedRoot=unionBounds([expectedInk,expectedPicture]);
  const numericFolder=path.join(output,'candidate');
  await command('dotnet',['run','--project','tools/TikzShapeComparison','-c','Release','--','compare-numeric','--out',path.relative(root,numericFolder)],true);
  const numericBytes=await readFile(path.join(numericFolder,'report.json')),numeric=JSON.parse(numericBytes);
  assert.equal(numeric.completed,true);assert.equal(numeric.verdict,'numeric-pass');assert.equal(numeric.numeric.passed,true);assert.equal(numeric.imageConformanceClaim,false);
  const provenanceBytes=await readFile(path.join(numericFolder,numeric.provenance)),provenance=JSON.parse(provenanceBytes);
  assert.equal(sha256(provenanceBytes),numeric.provenanceSha256);
  for(const[file,hash]of Object.entries(provenance.artifacts)){
    assert.ok(!path.isAbsolute(file)&&!file.split(/[\\/]/).includes('..'));
    assert.equal(sha256(await readFile(path.join(numericFolder,file))),hash,'Changed candidate artifact: '+file);
  }
  const scene=JSON.parse(await readFile(path.join(numericFolder,'actual-scene.json'))),svg=await readFile(path.join(numericFolder,'actual.svg'),'utf8');
  const checks=[];
  function scalar(quantity,expected,actual,tolerance,unit,source=null){
    const error=Math.abs(expected-actual);checks.push({quantity,expected,actual,tolerance,unit,absoluteError:error,passed:Number.isFinite(error)&&error<=tolerance,source});
  }
  function bounds(prefix,wanted,actual,source=null){assert.equal(actual.isEmpty,false,'Missing actual ink.');for(const key of ['minX','minY','maxX','maxY'])scalar(prefix+'.'+key,wanted[key],actual[key],4/3*1e-9,'CSS px; independent native quantities',source);}
  assert.equal(scene.paths.length,28);assert.equal(scene.glyphs.length,70);
  for(const r of expected){
    const actual=r.kind==='background'?scene.paths[scene.nodes.findIndex(n=>n.name===r.nodeId)]:scene.glyphs[Number(r.id.slice(6))];
    assert.ok(actual,'Missing source-aware candidate operation.');bounds(r.id+'.ink',r.bounds,actual.inkBounds,actual.source);
  }
  bounds('public.picture',expectedPicture,scene.pictureBounds);bounds('public.ink',expectedInk,scene.inkBounds);
  const attributes=svg.match(/^<svg\s[^>]+>/)?.[0];assert.ok(attributes,'Missing candidate SVG root.');
  const attribute=name=>new RegExp('\\b'+name+'="([^"]+)"').exec(attributes)?.[1];
  const width=attribute('width'),height=attribute('height');assert.match(width,/^[\d.]+px$/);assert.match(height,/^[\d.]+px$/);
  const view=attribute('viewBox').split(/[ ,]+/).map(Number);assert.equal(view.length,4);assert.ok(view.every(Number.isFinite));
  const rootValues=[expectedRoot.minX,expectedRoot.minY,expectedRoot.maxX-expectedRoot.minX,expectedRoot.maxY-expectedRoot.minY];
  // Origin, width and height are independently serialized to six decimals.
  // This is a decimal serialization bound, not a candidate raster allowance.
  for(let i=0;i<4;i++)scalar('svg.viewBox.'+i,rootValues[i],view[i],.000000500001,'CSS px; six decimal serialization');
  scalar('svg.width',view[2],Number(width.slice(0,-2)),0,'CSS px');scalar('svg.height',view[3],Number(height.slice(0,-2)),0,'CSS px');
  assert.equal(sha256(await readFile(path.join(root,'artifacts/node-shape-frames/frames.json'))),sha256(frameBytes),'Independent frame evidence changed during the candidate run.');
  for(const[file,hash]of Object.entries(reference.toolHashes))assert.equal(sha256(await readFile(path.join(root,file))),hash,'Changed independent frame tool.');
  const passed=checks.every(c=>c.passed),report={schemaVersion:1,comparisonKind:'public-shape-ink-frame-numeric',completed:true,verdict:passed?'frame-pass':'numeric-mismatch',overallVerdict:'pending',imageConformanceClaim:false,
    expectedScope:'Independently evaluated native path/stroke and original outlined glyph extents; 28 backgrounds, 70 glyphs, public picture/ink bounds, zero-padding root dimensions. Expected quantities fixed before the candidate invocation.',
    reference:{path:'artifacts/node-shape-frames/frames.json',sha256:sha256(frameBytes)},candidate:{report:'candidate/report.json',sha256:sha256(numericBytes),provenanceSha256:numeric.provenanceSha256},
    toolHashes:Object.fromEntries(await Promise.all(['tools/TikzVisual/compare-shape-frames.mjs','tools/TikzVisual/shape-frame-math.mjs','tools/TikzVisual/shape-oracle-bundle.mjs'].map(async file=>[file,sha256(await readFile(path.join(root,file)))]))),
    expected:{picture:expectedPicture,ink:expectedInk,semanticRoot:expectedRoot},numeric:{passed,checks},primary:{state:'pending'},pdf:{state:'pending'}};
  await writeArtifact(output,'report.json',JSON.stringify(report,null,2)+'\n');
  console.log('Public shape ink/root comparison: '+checks.length+' checks; '+(passed?'pass':'numeric mismatch')+'. Image/PDF conformance remains pending.');
  if(!passed){for(const c of checks.filter(c=>!c.passed).slice(0,8))console.log(JSON.stringify(c));process.exitCode=1;}
}
await main().catch(async error=>{console.error(error.stack??String(error));process.exitCode=error.exitCode??2;const verdict=process.exitCode===1?'numeric-mismatch':process.exitCode===3?'candidate-conversion-failure':'infrastructure-error';
  try{await writeArtifact(output,'report.json',JSON.stringify({schemaVersion:1,completed:false,verdict,imageConformanceClaim:false,error:error.message},null,2)+'\n');}catch{}});
