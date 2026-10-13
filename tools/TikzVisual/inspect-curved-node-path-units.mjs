import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Independent representation experiment. No converter, candidate-derived
// allowance or admission. Existing references and policies remain fixed.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact,readFreshOracle} from './shape-oracle-bundle.mjs';
import {createRenderer} from './compare.mjs';
import {reconstructCurvedNodes} from './curved-node-oracle.mjs';
import {curvedPathRepresentations,curvedPathInstructions,applyCurvedPathInstructions,shortNativeDimension} from './curved-node-path-units.mjs';
import {installShapeMetrics,measureShapePair} from './shape-image-pair.mjs';
import {shapeViews,evaluateShapeTrial} from './shape-primary-trial-policy.mjs';
import {shapePdfViews} from './shape-pdf-trial-policy.mjs';
import {measureCurvedNodePdfPair,evaluateCurvedNodeInkPolicy,curvedInkViewKey} from './curved-node-ink-policy.mjs';
const sourceFile='artifacts/curved-node-conformance-calibration/run-e4ca121b-1a2a-4eaf-ba6c-d1b72a21bcf0/report.json',sourceSha256='13741713b66dac5cf4b414cededebd31bbeba8773d87a97aace5f3a2211d1745';
const inkFile='artifacts/curved-node-ink-calibration/run-f7373f00-0436-4348-83e7-9739382eb5e2/report.json',inkSha256='9cf1b9c7182888f6f4c0843707f6541abc948316185e80b0c7e29a3c5d65436b';
const base=path.join(root,'artifacts/curved-node-path-units'),output=path.join(base,'run-'+randomUUID()),artifacts={},toolHashes={},sourceBytes=[],results=[];
const save=(p,b)=>writeArtifact(output,p,b,artifacts),canonical=b=>Buffer.from(b.toString('utf8').replaceAll('\r\n','\n'));let phase='independent-inputs';
async function publish(r){const b=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(output,'report.json',b);await writeArtifact(base,'latest.json',JSON.stringify({completed:r.completed,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');}
async function input(file,digest){const b=await readFile(path.join(root,file));assert.equal(sha256(b),digest);const r=JSON.parse(b);assert.equal(r.completed,true);assert.equal(r.converterInvoked,false);assert.equal(r.approvedImagePolicy,false);
  const folder=path.dirname(path.join(root,file));for(const[p,h]of Object.entries(r.artifacts))assert.equal(sha256(await readFile(await outputPath(folder,p))),h,'Changed historical asset '+p);return{r,b,folder};}
async function rawDifference(renderer,left,right){return renderer.page.evaluate(async({left,right})=>{
  const pixels=async s=>{const i=new Image();i.src='data:image/png;base64,'+s;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);return{width:i.width,height:i.height,data:x.getImageData(0,0,i.width,i.height).data};};
  const a=await pixels(left),b=await pixels(right);if(a.width!==b.width||a.height!==b.height)throw Error('Baseline raster dimensions changed.');let changed=0,maximum=0;
  for(let i=0;i<a.data.length;i+=4){let e=0;for(let c=0;c<4;c++)e=Math.max(e,Math.abs(a.data[i+c]-b.data[i+c]));changed+=e!==0;maximum=Math.max(maximum,e);}return{exactRgbaMatch:changed===0,rawChangedPixels:changed,maxRawChannelError:maximum};
},{left,right});}
async function saveImages(prefix,m,pdf){const links={},crops=new Map();for(const[k,png]of Object.entries(m.images)){links[k]=prefix+'-'+k+'.png';await save(links[k],Buffer.from(png,'base64'));}
  for(const crop of m.crops){const q={};for(const[k,png]of Object.entries(pdf?crop.images:{...crop.paired,sheet:crop.sheet})){q[k]=prefix+'-'+crop.id+'-'+k+'.png';await save(q[k],Buffer.from(png,'base64'));}crops.set(crop.id,q);}return{artifacts:links,regions:m.regions.map(q=>({...q,crops:crops.get(q.id)??null})),cropCoverage:{saved:crops.size,required:m.regions.length,truncated:crops.size<m.regions.length}};}
async function main(){
  assert.equal(process.argv.length,2);await publish({completed:false,phase,converterInvoked:false,approvedImagePolicy:false});
  const source=await input(sourceFile,sourceSha256),ink=await input(inkFile,inkSha256);assert.equal(ink.r.sourceCalibration.sha256,sourceSha256);await save('source-calibration.json',source.b);await save('source-ink-calibration.json',ink.b);
  // Historical bundles retain their raw sources. This new source contract
  // stores declared LF text bytes, while keeping both raw hashes explicit.
  for(const[p,h]of Object.entries(ink.r.toolHashes)){const historical=await readFile(await outputPath(ink.folder,'tool-sources/'+p));assert.equal(sha256(historical),h);const current=await readFile(path.join(root,p)),normalized=canonical(current);
    assert.equal(sha256(normalized),sha256(canonical(historical)),'Changed historical source content '+p);toolHashes[p]=sha256(normalized);sourceBytes.push({file:p,historicalRawSha256:h,workingRawSha256:sha256(current),canonicalLfSha256:toolHashes[p]});await save('tool-sources/'+p,normalized);}
  for(const p of['tools/TikzVisual/curved-node-path-units.mjs','tools/TikzVisual/inspect-curved-node-path-units.mjs']){const raw=await readFile(path.join(root,p)),normalized=canonical(raw);toolHashes[p]=sha256(normalized);sourceBytes.push({file:p,workingRawSha256:sha256(raw),canonicalLfSha256:toolHashes[p]});await save('tool-sources/'+p,normalized);}
  for(const sp of[0,1,-1,26214,-26214,65536,-65536,2048,-2048,3942960,-3942960])assert.equal(Math.sign(sp)*Math.round(Math.abs(Number(shortNativeDimension(sp))*65536)),sp);
  assert.throws(()=>shortNativeDimension(.5));
  phase='fresh-independent-reconstruction';const oracleFolder=path.join(output,'oracle'),oracle=await readFreshOracle(oracleFolder),native=JSON.parse(await readFile(path.join(oracleFolder,'metrics.json')));
  const renderer=await createRenderer();try{
    requireRenderer(renderer.identity, source.r.renderer);await installShapeMetrics(renderer);const r=await reconstructCurvedNodes(renderer,oracleFolder,oracle.derivation);assert.deepEqual(r,source.r.geometry);
    await save('native-semantic.svg',r.semanticSvg);for(const[p,h]of Object.entries(oracle.derivation.evidence.artifacts))artifacts['oracle/'+p]=h;artifacts['oracle/derivation.json']=sha256(oracle.bytes);
    const pages={};for(const scale of[1,4]){const b=await readFile(path.join(source.folder,'pdf-page-'+scale+'x.png'));await save('pdf-page-'+scale+'x.png',b);pages[scale]='data:image/png;base64,'+b.toString('base64');}
    const primaryBaseline=new Map(),pdfBaseline=new Map();
    for(const variant of curvedPathRepresentations){
      phase=variant.name;const instructions=curvedPathInstructions(native,variant),svg=await applyCurvedPathInstructions(renderer,r.semanticSvg,instructions);await save(variant.name+'.svg',svg);
      const primary=[],pdf=[];
      for(const view of shapeViews){const m=await measureShapePair(renderer,{reference:r.reference,actual:svg,leftIsDriver:true,origin:r.origin,camera:r.camera,regions:r.regions,...view,cropLimit:3,cropRegionIds:['shape-c-negative','glyph-22','glyph-5'],rightLabel:variant.name}),evaluation=evaluateShapeTrial(source.r.primary.policy,view,m);
        if(variant.name==='css-six'){primaryBaseline.set(curvedInkViewKey(view),m.images.actual);const old=source.r.primary.observations.find(q=>curvedInkViewKey(q)===curvedInkViewKey(view));assert.ok(old);assert.deepEqual(m.metrics,old.metrics);assert.deepEqual(m.regions,old.regions.map(({crops,...q})=>q));}
        const baselineDifference=await rawDifference(renderer,primaryBaseline.get(curvedInkViewKey(view)),m.images.actual);primary.push({...view,...m,images:undefined,crops:undefined,...await saveImages(variant.name+'/primary/'+curvedInkViewKey(view),m,false),evaluation,baselineDifference});
      }
      console.log(variant.name+' primary: '+primary.filter(q=>q.evaluation.passed).length+'/12 old-policy views.');
      for(const view of shapePdfViews){const m=await measureCurvedNodePdfPair(renderer,{svg,units:'cssPixels',svgOriginBp:{x:0,y:0},camera:ink.r.camera,regions:ink.r.regions,...view,pdfPage:pages[view.scale],cropLimit:3,cropRegionIds:['shape-c-negative','glyph-22','glyph-5']}),evaluation=evaluateCurvedNodeInkPolicy(ink.r.policies.native,view,m);
        if(variant.name==='css-six'){pdfBaseline.set(curvedInkViewKey(view),m.images['svg-page']);const old=ink.r.observations.native.find(q=>curvedInkViewKey(q)===curvedInkViewKey(view));assert.deepEqual(m.whole,old.whole);assert.deepEqual(m.regions,old.regions.map(({crops,...q})=>q));assert.equal(evaluation.passed,true);}
        const baselineDifference=await rawDifference(renderer,pdfBaseline.get(curvedInkViewKey(view)),m.images['svg-page']);pdf.push({...m,images:undefined,crops:undefined,...await saveImages(variant.name+'/PDF/'+curvedInkViewKey(view),m,true),evaluation,baselineDifference});
      }
      results.push({variant,svg:variant.name+'.svg',serializationChecks:instructions.checks,primaryComparisons:primary,pdfComparisons:pdf});
      console.log(variant.name+' PDF: '+pdf.filter(q=>q.evaluation.passed).length+'/4 old-policy views; native values and glyphs fixed.');
    }
    phase='final-integrity';await oracle.verify();for(const[p,h]of Object.entries(toolHashes))assert.equal(sha256(canonical(await readFile(path.join(root,p)))),h);
    for(const[p,h]of Object.entries(artifacts))assert.equal(sha256(await readFile(await outputPath(output,p))),h);
    assert.equal(sha256(await readFile(path.join(root,sourceFile))),sourceSha256);assert.equal(sha256(await readFile(path.join(root,inkFile))),inkSha256);
    await save('index.html','<!doctype html><meta charset="utf-8"><h1>Independent curved-node path units</h1><p>Fixed glyphs, root, camera and old limits. No admission.</p><a href="report.json">Report</a>'+results.map(v=>'<h2>'+v.variant.name+'</h2>'+[...v.primaryComparisons,...v.pdfComparisons].filter(r=>r.scale===4&&r.background==='white').map(row=>'<h3>'+curvedInkViewKey(row)+'</h3>'+row.regions.filter(q=>q.crops).map(q=>'<p>'+q.id+'</p><img loading="lazy" src="'+q.crops.sheet+'">').join('')).join('')).join(''));
    await publish({schemaVersion:1,comparisonKind:'oracle-only-curved-node-path-unit-experiment',completed:true,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',sourceCalibration:{file:sourceFile,sha256:sourceSha256},sourceInkCalibration:{file:inkFile,sha256:inkSha256},sourceByteContract:'UTF-8 source text with CRLF normalized to LF; historical raw bytes and current raw hashes retained explicitly. No historical hash is changed.',sourceBytes,toolHashes,renderer:renderer.identity,geometry:r,camera:ink.r.camera,regions:ink.r.regions,oldLimitsUnchanged:true,results,artifacts});
    console.log('Independent path-unit experiment completed: '+path.relative(root,output));
  }finally{await renderer.browser.close();}
}
await main().catch(async error=>{process.exitCode=2;console.error(error.stack?.slice(0,5000)??error.message);await publish({completed:false,phase,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',error:error.message.slice(0,5000),toolHashes,sourceBytes,completedVariants:results.map(v=>v.variant.name),artifacts});});
