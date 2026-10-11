// Acceptance gap: reducing iteration views must retain the existing visible
// historical negatives, including clips/implicit fill and math/styled rules.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {root,sha256} from './shape-oracle-bundle.mjs';
import {loadPathLabelCache} from './path-label-cache.mjs';
import {pathLabelPrimaryPixelReader} from './path-label-primary-pixels.mjs';
import {readPathLabelPrimaryPolicies} from './path-label-primary-policy.mjs';
import {evaluateShapeTrial} from './shape-primary-trial-policy.mjs';
import {evaluateMathPrimary} from './math-label-primary.mjs';
import {currentPrimaryViews,verificationMode,reportVerificationMode,qualificationViewPolicy} from './verification-views.mjs';

const started=performance.now(),key=v=>[v.capture,v.frame,v.scale,v.background].join('/'),selected=new Set(currentPrimaryViews('iteration').map(key));
assert.ok(process.argv.length===2||(process.argv.length===3&&process.argv[2]==='--all'),'Usage: verification-views-self-test.mjs [--all]');
const fullAudit=process.argv[2]==='--all';
assert.equal(selected.size,8);assert.equal(currentPrimaryViews('qualification').length,24);
assert.deepEqual(currentPrimaryViews('qualification',undefined,qualificationViewPolicy),currentPrimaryViews('iteration'));
assert.equal(currentPrimaryViews('iteration','smooth-plot-contract').length,9);
assert.ok(currentPrimaryViews('iteration','smooth-plot-contract').some(v=>key(v)==='intrinsic-image/natural/1/transparent'));
for(const capture of ['intrinsic-image','explicit-viewport']){
 const views=currentPrimaryViews('iteration').filter(v=>v.capture===capture);
 for(const [field,values]of [['frame',['natural','expanded']],['scale',[1,4]],['background',['transparent','white','black']]])
  for(const value of values)assert.ok(views.some(v=>v[field]===value),'Missing iteration mechanism: '+capture+'/'+field+'/'+value);
}
assert.throws(()=>verificationMode('--quick-and-qualify'));
assert.throws(()=>reportVerificationMode({report:{verificationMode:'iteration'}},{report:{verificationMode:'qualification'}}));
assert.throws(()=>currentPrimaryViews('qualification',undefined,'unreviewed'));
assert.throws(()=>reportVerificationMode({report:{verificationMode:'qualification',viewPolicy:qualificationViewPolicy}},{report:{verificationMode:'qualification'}}));
const controls=['eight-distinct-mechanism-views','smooth-root-transparent-policy-interaction','all-capture-frame-scale-background-mechanisms','historical-qualification-keeps-24-views','focused-qualification-mechanisms','unknown-mode-rejected','split-mode-rejected','unknown-view-policy-rejected','split-view-policy-rejected'],fixtures=[];
async function bundle(fixture){
 const {cache,manifest}=await loadPathLabelCache(root,fixture),descriptor=manifest.reports.find(r=>r.role.endsWith('native-primary-calibration'));assert.ok(descriptor);
 const bytes=cache.files.get(descriptor.file),report=JSON.parse(bytes),files=new Map(Object.keys(report.artifacts).map(f=>[f,cache.files.get(path.posix.dirname(descriptor.file)+'/'+f)]));
 const checkedDescriptor=manifest.reports.find(r=>r.role.includes('independent-primary-check'));assert.ok(checkedDescriptor);
 const checkedBytes=cache.files.get(checkedDescriptor.file),checked=JSON.parse(checkedBytes);
 assert.equal(checked.inputSha256,descriptor.sha256);
 assert.ok(cache.files.get(path.posix.dirname(checkedDescriptor.file)+'/input-report.json').equals(bytes));
 return{bytes,sha256:sha256(bytes),report,files,json:f=>JSON.parse(files.get(f)),
  qualification:{inputSha256:descriptor.sha256,checkedSha256:sha256(checkedBytes),sourceRecaptures:checked.sourceRecaptures}};
}
const corpus=[];
for(const directory of ['Diagrams','PathLabels','Styles','Foreach','MathMacros','MathFunctions','Plotting','PaintDiagrams','ArrowColors','Definitions']){
 const profile=JSON.parse(await readFile(path.join(root,'tests/Reference/'+directory+'/image-profile.json')));
 corpus.push(...Object.keys(profile.fixtures));
}
assert.equal(corpus.length,26);
for(const fixture of [...corpus,'math-labels-primary','styled-labels-primary']){
 const b=await bundle(fixture),math=b.report.role==='math-label-native-primary-calibration';
 // Reuse unchanged independent qualification and decode the selected negative
 // pairs. Replaying every original calibration view would test another gap.
 const independent=b.qualification;
 let visible=0,invisible=0,selectedViews=0;const checked=[],shared=new Map();
 for(const control of b.report.controls){assert.equal(control.numericChecksBypassed,true);
  const id=control.caseId,frame=b.json(math?id+'/frame.json':'frame.json'),policies=math?b.json(id+'/policies.json'):readPathLabelPrimaryPolicies(b),read=pathLabelPrimaryPixelReader(b,frame);
  const caseViews=new Set(currentPrimaryViews('iteration',frame.caseId).map(key)),eligible=control.comparisons.filter(v=>caseViews.has(key(v))),hadVisible=control.comparisons.some(v=>v.observedVisible);let rejected=0;
  // The requirement is a visible rejection per negative, not every product
  // of that negative with the retained camera combinations.
  const witness=eligible.find(v=>v.observedVisible)??eligible[0];
  const target=control.region??control.target,region=frame.regions.find(r=>r.id===target);
  // The reader uniformly decodes every region. Repeating a nameless glyph
  // absence/translation at every loop/function-contract node adds no mechanism.
  // Keep named defects, paths, math marks and placement/transform interactions.
  const shareable=!math&&!control.name&&region?.kind==='glyph'
   &&['missing','quarter-pixel-shift','missing-label'].includes(control.kind)
   &&!['placement','interactions','network-bent','flowchart-transformed'].includes(fixture);
  const glyphClass=[33,34,39,40,41,44,45,46,47,58,59,91,93,96,123,125].includes(region?.slot)?'punctuation'
   :region?.slot>=48&&region?.slot<=57?'digit':'letter';
  const special=fixture==='smooth-plot-contract'&&['native-glyph-1','native-glyph-2'].includes(target)?'native-topology':'ordinary';
  const mechanism=shareable?[control.kind,region.font,glyphClass,/^(path|diagram)-label-/.test(control.nodeId??'')?'path-label':'node',special,hadVisible].join('/') : undefined;
  if(!fullAudit&&mechanism&&shared.has(mechanism)){
   checked.push({name:control.nodeId,kind:control.kind,target,originallyVisible:hadVisible,consolidatedInto:shared.get(mechanism),mechanism});
   continue;
  }
  for(const view of witness?[witness]:[]){const row=read(view.file),evaluation=math?evaluateMathPrimary(policies,row):evaluateShapeTrial(policies[view.capture],view,row);
   if(view.observedVisible){assert.equal(evaluation.passed,false);assert.ok(evaluation.checks.some(c=>c.id===(control.region??control.target)&&!c.passed));rejected++;}
   selectedViews++;
  }
  if(hadVisible){assert.ok(rejected>0,'Focused views lost visible negative: '+fixture+'/'+(control.name??control.nodeId)+'/'+control.kind);visible++;}
  else invisible++;
  checked.push({name:control.name??control.nodeId,kind:control.kind,target:control.region??control.target,retainedVisibleRejections:rejected,originallyVisible:hadVisible});
  if(mechanism)shared.set(mechanism,{name:control.nodeId,kind:control.kind,target});
 }
 fixtures.push({fixture,independent,visibleControls:visible,invisibleControls:invisible,selectedControlViews:selectedViews,consolidatedControls:checked.filter(c=>c.consolidatedInto).length,controls:checked});
 console.error(JSON.stringify({phase:'retained-negatives',fixture,visibleControls:visible,selectedControlViews:selectedViews}));
 controls.push('retained-visible-negatives-'+fixture);
}
console.log(JSON.stringify({validated:true,fullAudit,wallSeconds:(performance.now()-started)/1000,controls,fixtures,nativeToolInvoked:false,converterInvoked:false,policyChanged:false}));
