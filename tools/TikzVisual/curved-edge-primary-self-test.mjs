// Hand-derived path edits and policy controls; no browser, native engine or converter.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {edgeCanonical} from './curved-edge-log.mjs';
import {edgePrimaryContract} from './curved-edge-primary-reference.mjs';
import {edgePrimaryDefects,mutateFirstCubic,edgePrimaryDefectInvisible} from './curved-edge-primary-defects.mjs';
import {edgePrimaryVisibility,edgeVisibilityExpectedPassed} from './curved-edge-primary-visibility.mjs';
import {deriveEdgePrimaryPolicy,evaluateEdgePrimary,edgePrimaryViews} from './curved-edge-primary-policy.mjs';

const output=path.join(root,'artifacts/curved-edge-primary-controls/run-'+randomUUID()),checks=[],artifacts={},sourceHashes={};
const passed=name=>checks.push({name,passed:true});
function equal(name,a,b){assert.deepEqual(a,b,name);passed(name);}
function reject(name,action){assert.throws(action,undefined,name);passed(name);}
try{
  assert.equal(process.argv.length,2);
  for(const name of ['curved-edge-primary-self-test.mjs','curved-edge-primary-reference.mjs','curved-edge-primary-defects.mjs','curved-edge-primary-visibility.mjs',
    'curved-edge-primary-policy.mjs','shape-primary-trial-policy.mjs','edge-oracle.mjs']){
    const p='tools/TikzVisual/'+name,b=edgeCanonical(await readFile(path.join(root,p)));sourceHashes[p]=sha256(b);await writeArtifact(output,'source-captures/'+p,b,artifacts);
  }
  const source='M0 20 C1 22 7 24 10 20 L15 20 C17 22 19 24 21 20 Z';
  equal('only first control y changes by one native pt',mutateFirstCubic(source,'control'),'M0 20 C1 23 7 24 10 20 L15 20 C17 22 19 24 21 20 Z');
  equal('controls exchange while endpoints and suffix remain',mutateFirstCubic(source,'swap'),'M0 20 C7 24 1 22 10 20 L15 20 C17 22 19 24 21 20 Z');
  equal('straightening retains first endpoint and continuation',mutateFirstCubic(source,'straight'),'M0 20 L10 20 L15 20 C17 22 19 24 21 20 Z');
  equal('signed control displacement',mutateFirstCubic('M0 0 C-2 -3 4 5 6 7','control',-.5),'M0 0 C-2 -3.5 4 5 6 7');
  equal('decimal and exponent controls',mutateFirstCubic('M0 0 C.5 -1e-2 2 3 4 5','control',.25),'M0 0 C.5 0.24 2 3 4 5');
  for(const [name,action]of [
    ['no cubic',()=>mutateFirstCubic('M0 0 L1 1','control')],['unsupported edit',()=>mutateFirstCubic(source,'noop')],
    ['nonfinite displacement',()=>mutateFirstCubic(source,'control',NaN)],['zero displacement',()=>mutateFirstCubic(source,'control',0)],
    ['nonfinite native operand',()=>mutateFirstCubic('M0 0 C1e999 0 1 1 2 2','control')]
  ])reject(name,action);
  equal('eighteen unique defects',new Set(edgePrimaryDefects.map(d=>d.name)).size,18);
  equal('three separate opacity visibility probes',edgePrimaryVisibility.length,3);
  equal('curved controls name native local bend regions',edgePrimaryDefects.filter(d=>['control','straight','swap'].includes(d.change)).length,3);
  const clipDefect=edgePrimaryDefects.find(d=>d.name==='disabled-rectangle-clip');
  equal('only natural 1x clip losses are declared invisible',edgePrimaryViews.filter(v=>edgePrimaryDefectInvisible(clipDefect,v)).map(v=>v.frame+'/'+v.scale+'x-'+v.background),
    ['natural/1x-transparent','natural/1x-white','natural/1x-black']);
  equal('black curve loss is a background-specific expectation',edgePrimaryDefectInvisible(edgePrimaryDefects[0],{frame:'expanded',scale:4,background:'black'}),true);
  equal('faint curve preserves five measured invisible views',edgePrimaryViews.filter(v=>edgeVisibilityExpectedPassed(edgePrimaryVisibility[0],v)).map(v=>v.frame+'/'+v.scale+'x-'+v.background),
    ['natural/1x-transparent','natural/1x-white','natural/1x-black','expanded/1x-transparent','expanded/1x-black']);
  equal('faint period is invisible in four black views',edgePrimaryViews.filter(v=>edgeVisibilityExpectedPassed(edgePrimaryVisibility[1],v)).map(v=>v.background),['black','black','black','black']);
  equal('subquantum curve is invisible in every view',edgePrimaryViews.filter(v=>edgeVisibilityExpectedPassed(edgePrimaryVisibility[2],v)).length,12);
  const metric={exactRgbaMatch:true,rawChangedPixels:0,maxRawChannelError:0,premultipliedChangedPixels:0,maxPremultipliedChannelError:0,
    foregroundPixels:0,referenceForegroundPixels:0,actualForegroundPixels:0,meanForegroundChannelError:0,
    topology:{threshold:16,connectivity:8,edgeNeighborhood:4,referenceComponents:0,actualComponents:0,componentDifference:0,
      referenceEdgePixels:0,actualEdgePixels:0,edgeState:'both-empty',maxEdgeDisplacementRasterPixels:0,maxEdgeDisplacementCssPixels:0}};
  const cases=['continuation','styles','coordinates','nodes','clipping'].map(id=>({id,measurements:edgePrimaryViews.map(view=>({...view,converterInvoked:false,
    metrics:structuredClone(metric),repeat:structuredClone(metric),actualRepeat:structuredClone(metric),
    regions:[{id:'path-2.curve-1.t-0.5',kind:'curve-sample',nodeId:null,rectangle:{x:0,y:0,width:2,height:2},...structuredClone(metric)}]}))}));
  const policy=deriveEdgePrimaryPolicy(cases),row=structuredClone(cases[0].measurements[0]);row.id='saved/observation';
  const evaluation=evaluateEdgePrimary(policy,'continuation',row);
  equal('native check identity survives saved observation ID',evaluation.checks.map(c=>c.id),['whole-picture','path-2.curve-1.t-0.5']);
  equal('unchanged independent observation passes',evaluation.passed,true);
  row.regions[0].rawChangedPixels=1;const altered=evaluateEdgePrimary(policy,'continuation',row);
  equal('local defect is rejected with a passing whole image',[altered.globalPassed,altered.regionalPassed],[true,false]);
  for(const [name,mutate]of [
    ['missing case',c=>c.pop()],['missing view',c=>c[0].measurements.pop()],['duplicate view',c=>c[0].measurements[1]=structuredClone(c[0].measurements[0])],
    ['candidate input',c=>c[0].measurements[0].converterInvoked=true],['unstable reference',c=>c[0].measurements[0].repeat.rawChangedPixels=1],
    ['unstable reconstruction',c=>c[0].measurements[0].actualRepeat.rawChangedPixels=1],['different regions',c=>c[0].measurements[1].regions[0].rectangle.x=1],
    ['lost reference component',c=>c[0].measurements[0].metrics.topology.componentDifference=1]
  ]){const modified=structuredClone(cases);mutate(modified);reject(name,()=>deriveEdgePrimaryPolicy(modified));}
  for(const [name,key,value]of [['wrong family','comparisonKind','unapproved-native-edge-primary-policy'],['approved policy','approvedImagePolicy',true],
    ['conformance claim','imageConformanceClaim',true],['converter policy','converterInvoked',true],['wrong contract','contract',{}]]){
    const modified=structuredClone(policy);modified[key]=value;reject(name,()=>evaluateEdgePrimary(modified,'continuation',row));
  }
  equal('reference contract names unchanged original bytes',edgePrimaryContract.reference,'Original immutable PGF SVG, including two empty backend strokes. No drawing correction.');
  for(const [p,h]of Object.entries(sourceHashes))assert.equal(sha256(edgeCanonical(await readFile(path.join(root,p)))),h);
  const bytes=Buffer.from(JSON.stringify({schemaVersion:1,completed:true,converterInvoked:false,rendererInvoked:false,approvedImagePolicy:false,
    imageConformanceClaim:false,checks,sourceHashes,artifacts},null,2)+'\n');await writeArtifact(output,'report.json',bytes);
  console.log(JSON.stringify({completed:true,controls:checks.length,report:path.relative(root,path.join(output,'report.json')).replaceAll('\\','/'),sha256:sha256(bytes)}));
}catch(error){process.exitCode=2;await writeArtifact(output,'report.json',JSON.stringify({completed:false,error:error.message,checks,artifacts},null,2)+'\n');console.error(error.stack);}
