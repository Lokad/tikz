import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {createRenderer} from './compare.mjs';
import {deriveCurvedNodeInkPolicy,evaluateCurvedNodeInkPolicy,measureCurvedNodeInk} from './curved-node-ink-policy.mjs';
import {evaluateShapePdfTrial} from './shape-pdf-trial-policy.mjs';
const base=path.join(root,'artifacts/curved-node-ink-controls'),output=path.join(base,'run-'+randomUUID()),controls=[],artifacts={};
const save=(p,b)=>writeArtifact(output,p,b,artifacts);
async function main(){
  assert.equal(process.argv.length,2);const folder=path.join(root,'artifacts/curved-node-ink-calibration'),pointerBytes=await readFile(path.join(folder,'latest.json')),pointer=JSON.parse(pointerBytes);
  assert.equal(pointer.completed,true);assert.match(pointer.report,/^run-[\da-f-]+\/report\.json$/);const filename=await outputPath(folder,pointer.report),bytes=await readFile(filename),r=JSON.parse(bytes);
  assert.equal(sha256(bytes),pointer.sha256);assert.equal(r.completed,true);assert.equal(r.sensitivityPassed,true);assert.equal(r.converterInvoked,false);assert.equal(r.approvedImagePolicy,false);assert.equal(r.overallVerdict,'pending');
  for(const[p,h]of Object.entries(r.artifacts))assert.equal(sha256(await readFile(await outputPath(path.dirname(filename),p))),h);
  for(const[p,h]of Object.entries(r.toolHashes))assert.equal(sha256(await readFile(path.join(root,p))),h);
  const pass=name=>controls.push({name,passed:true}),throws=(name,fn)=>{assert.throws(fn);pass(name);};
  for(const[name,mode]of[['original','original-driver'],['native','native-semantic-css-6']]){
    assert.deepEqual(deriveCurvedNodeInkPolicy(r.observations[name],r.camera,r.regions,mode),r.policies[name]);pass('independent-'+name+'-policy-rederived');
    for(const row of r.observations[name]){assert.equal(evaluateCurvedNodeInkPolicy(r.policies[name],row,row).passed,true);pass(name+'-'+row.frame+'-'+row.scale+'-positive');}
  }
  for(const row of r.observations.native){const changed=structuredClone(row);
    for(const region of[changed.whole,...changed.regions])for(let channel=0;channel<3;channel++){
      region.inkCoverage.actual[channel]++;const e=evaluateCurvedNodeInkPolicy(r.policies.native,changed,changed);assert.equal(e.passed,false);assert.equal(e.checks.find(q=>q.id===region.id).passed,false);region.inkCoverage.actual[channel]--;
      pass('required-ink-'+row.frame+'-'+row.scale+'-'+region.id+'-'+channel);
    }
  }
  for(const[name,change]of[
    ['missing-view',v=>v.pop()],['duplicate-view',v=>v[0]=v[1]],['candidate-input',v=>v[0].converterInvoked=true],
    ['missing-region',v=>v[0].regions.pop()],['nonfinite-ink',v=>v[0].whole.inkCoverage.actual[0]=NaN],
    ['negative-ink',v=>v[0].whole.inkCoverage.actual[0]=-1],['fractional-ink',v=>v[0].whole.inkCoverage.actual[0]+=.5],
    ['too-large-ink',v=>v[0].whole.inkCoverage.actual[0]=Number.MAX_SAFE_INTEGER],
    ['missing-channel',v=>v[0].whole.inkCoverage.actual.pop()],['wrong-ink-region',v=>v[0].whole.inkCoverage.id='different'],
    ['missing-ink',v=>delete v[0].whole.inkCoverage],['wrong-mode',v=>v[0].mode='candidate']
  ]){const rows=structuredClone(r.observations.native);change(rows);throws(name,()=>deriveCurvedNodeInkPolicy(rows,r.camera,r.regions,'native-semantic-css-6'));}
  const changed=structuredClone(r.observations.native[0]);changed.whole.inkCoverage.reference[0]++;throws('changed-PDF-ink-signature',()=>evaluateCurvedNodeInkPolicy(r.policies.native,changed,changed));
  const c=r.controls.find(c=>c.name==='faint-glyph-loss');for(const row of c.pdfComparisons){const e=evaluateCurvedNodeInkPolicy(r.policies.native,row,row);assert.equal(e.passed,false);assert.equal(e.checks.find(q=>q.id==='glyph-5').passed,false);
    if(row.scale===1)assert.equal(evaluateShapePdfTrial(r.policies.native,row,row).passed,true);pass('faint-period-new-gate-'+row.frame+'-'+row.scale);
  }
  const renderer=await createRenderer();try{
    assert.deepEqual(renderer.identity,r.renderer);
    const images=await renderer.page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=16;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,16,16);const reference=c.toDataURL('image/png'),d=ctx.getImageData(0,0,16,16),i=4*(2*16+3);d.data[i]=252;d.data[i+1]=254;d.data[i+2]=250;ctx.putImageData(d,0,0);return{reference,actual:c.toDataURL('image/png')};});
    const regions=[{id:'whole-picture',rasterRectangles:{'1x':{x:0,y:0,width:16,height:16}}},...Array.from({length:98},(_,i)=>({id:'r'+i,rasterRectangles:{'1x':{x:i%8,y:Math.floor(i/8),width:1,height:1}}}))];
    const input={...images,regions,scale:1,pageSize:{width:16,height:16}},coverage=await measureCurvedNodeInk(renderer,input);
    assert.deepEqual(coverage[0],{id:'whole-picture',reference:[0,0,0],actual:[3,1,5]});assert.deepEqual(coverage.find(r=>r.id==='r19').actual,[3,1,5]);
    assert.ok(coverage.filter(r=>!['whole-picture','r19'].includes(r.id)).every(r=>r.actual.every(n=>n===0)));pass('manually-authored-RGB-subthreshold-samples-and-empty-crops');
    for(const[name,change]of[['missing-fixed-region',v=>v.regions.pop()],['duplicate-fixed-region',v=>v.regions[1].id='whole-picture'],['wrong-size',v=>v.pageSize.width=17],['wrong-scale',v=>v.scale=2],['out-of-page-crop',v=>v.regions[1].rasterRectangles['1x'].x=-1]]){
      const v=structuredClone(input);change(v);await assert.rejects(()=>measureCurvedNodeInk(renderer,v));pass(name);
    }
  }finally{await renderer.browser.close();}
  await save('calibration-pointer.json',pointerBytes);
  for(const[p,h]of Object.entries(r.toolHashes)){const b=await readFile(path.join(root,p));assert.equal(sha256(b),h);await save('tool-sources/'+p,b);}
  const own='tools/TikzVisual/curved-node-ink-self-test.mjs';await save('tool-sources/'+own,await readFile(path.join(root,own)));
  const report={completed:true,passed:true,converterInvoked:false,approvedImagePolicy:false,overallVerdict:'pending',sourceCalibrationSha256:sha256(bytes),controls,artifacts};
  const b=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',b);await writeArtifact(base,'latest.json',JSON.stringify({completed:true,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');
  console.log('Curved-node ink controls: '+controls.length+' pass. Admission remains pending.');
}
await main().catch(async error=>{process.exitCode=2;console.error(error.stack?.slice(0,3000)??error.message);await writeArtifact(output,'report.json',JSON.stringify({completed:false,passed:false,error:error.message.slice(0,3000),controls,artifacts},null,2)+'\n');});
