// Complete diagrams share label/image transport. Arrow observations remain
// independently replayed and frozen; no native execution or converter loading.
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {root} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport,calcEqual,calcHash} from './calc-saved-images.mjs';
import {loadPathLabelEvidence,verifyPathLabelEvidence} from './path-label-evidence.mjs';
import {parseArrowLog} from './arrow-log.mjs';
import {verifyArrowDriverState} from './arrow-driver-state.mjs';
import {edgePdfPage,edgeCanonical} from './edge-log.mjs';
const frozen={
 'definitions-contract':'8a330cec15dc405fb700804aef3d88a5f286502278e30380d920c2ae4fac3df8',
 'flowchart-definitions':'5d9e24038b319f2c08fc080e095afa8b8c075fc216efb3dd1a34c10f2f4963e9',
 'flowchart-draw-color':'3d142d85514ee246f7c5eb87496af146af70a35b958e954ab793b5b020742218',
 'arrow-color-contract':'7e9ba8c6246ef1ce864d71552f970c8eead2cd0d75a0a903b5b5cb8411aecaea',
 'flowchart-paint':'824207226ad73f36cfee7f6cdd7a3e29409fa90e630c2085af19d96ea0140ac9',
 'network-coordinate-plot':'505873235da5ff68c746b6c1e110ace4fb8374a86c150b5cf0b3987f2eb464e2',
 'coordinate-plot-contract':'3e1914a7fb4bad411ea45e9426e875926ab0b09b34cc9af7b5c1c0edee9cd797',
 'network-function-plot':'59f688286f688e3a5e6f7dae7ba745235c64340bd54d14aed1ee3ff3bfae8c0c',
 'function-plot-contract':'a917bef6dfa229da99d975f83e896520031bf97a9b60d4fc0325517f9210f9aa',
 'network-smooth-plot':'945a7de5fb329b894c62d19d5e382aaaacf21dfccdea7bbf73dedffd492d5bd0',
 'smooth-plot-contract':'eb7d51e4c5ff6adf20430d2bec851ae564749251a21405007282e9c8345ec897',
 'network-math-functions':'91279df9a386bbb605bed4f3814b59062af5c28520caf0bb339ef6e5a9c55adb',
 'math-functions-contract':'da694557502934660cb8b4b5e43eaa770a4130975fe52e7f1e314879b12ad674',
 'flowchart-basic':'32f4efb3172f5da86c1d9436e9868773389c351d4ac0dbccafd86813b4810634',
 'network-bent':'6a64406360a4c079bedb1f5392741893b0969909f146f47fed5defc173939753',
 'flowchart-transformed':'3c6fae434443c59204a653e6656c4e581644d6eb693c139d6d565ddfb008f43a',
 'flowchart-parameterized':'bbf4b6e43e01ad3071aa554b726153721f81fe83d33d9218b24cf39e88fadd92',
 'style-contract':'aafa2cf36b1f07e935fb4b0adf3958ed4e4f4ff803d05bad2bbf3d587f4af7a4',
 'flowchart-foreach':'f336b86e533d4e47ba39ca3c5d77a85ad19ce1972e76bb16245d9774cbee2e12',
 'foreach-contract':'6f0f5f8e16cb007c98fd4dcaf6ad4a4e3098c1a1bada0037403f5560ecbcc426',
 'flowchart-math-macros':'b1ba14b15f66caf36f5f45fb314a22502c1234e06da2cb21317eb3925cc41684',
 'math-macro-contract':'0f007f9f878fd179f44205e6d1cf0806d2a33e72e86461ed1f7b77944d18b006'
};
// Shared fixed-case classification; rectangle and arrow measurements stay separate.
export const rectangleImageCounts=Object.freeze({'definitions-contract':8,'style-contract':7,'foreach-contract':29,'math-macro-contract':25,'math-functions-contract':37});
export const isRectangleImageCase=id=>Object.hasOwn(rectangleImageCounts,id);
const plottingCases=new Set(['network-coordinate-plot','coordinate-plot-contract','network-function-plot','function-plot-contract','network-smooth-plot','smooth-plot-contract']);
export const isPlotImageCase=id=>plottingCases.has(id);
export const labelImageSourceFile=id=>'tests/Fixtures/'+(['coordinate-plot-contract','function-plot-contract','smooth-plot-contract'].includes(id)?'Plotting':id==='definitions-contract'?'Definitions':id==='style-contract'?'Styles':id==='foreach-contract'?'Foreach':id==='math-macro-contract'?'MathMacros':id==='math-functions-contract'?'MathFunctions':'Diagrams')+'/'+id+'.tikz';
export async function loadLabelImageEvidence(input){
 if(['placement','interactions'].includes(input))return loadPathLabelEvidence(input);
 const file=path.resolve(root,input),role=JSON.parse(await readFile(file)).role;
 assert.ok(['diagram-arrow-native-reference','diagram-native-reference'].includes(role));
 const b=await loadCalcSavedReport(file,role),id=b.report.definition.id;
 assert.equal(b.sha256,frozen[id],'Expected the frozen trusted diagram arrow bundle.');
 if(role==='diagram-native-reference'){
  assert.ok(isRectangleImageCase(id),'Only fixed frozen rectangle contracts use this route.');
  assert.equal(b.report.counts.nodes,rectangleImageCounts[id]);
  for(const[f,h]of Object.entries(b.report.sourceHashes)){
   assert.equal(calcHash(b.files.get('source-captures/'+f)),h);
   if(f.startsWith('tests/Fixtures/')||f.endsWith('.tex')||f==='tools/TikzFontData/font-profile.json')
    assert.equal(calcHash(edgeCanonical(await readFile(path.join(root,f)))),h,'Native engine input changed: '+f);
  }
  return verifyPathLabelEvidence(b);
 }
 const bytes=b.files.get('original/report.json'),report=JSON.parse(bytes),files=new Map(Object.entries(report.artifacts).map(([f,h])=>{
  const bytes=b.files.get('original/'+f);assert.equal(calcHash(bytes),h);return[f,bytes];
 }));assert.equal(calcHash(bytes),b.report.originalInputSha256);assert.equal(report.definition.id,id);
 for(const[f,h]of Object.entries(report.sourceHashes))if(f.startsWith('tests/Fixtures/')||f.endsWith('.tex')||f==='tools/TikzFontData/font-profile.json')
  assert.equal(calcHash(edgeCanonical(await readFile(path.join(root,f)))),h,'Native engine input changed: '+f);
 const original=verifyPathLabelEvidence({bytes,report,files,json:f=>JSON.parse(files.get(f))}),text=f=>b.files.get(f).toString('utf8');
 const options={allowWrapperGlue:true,allowNoArrows:isPlotImageCase(id)&&id.endsWith('-contract')};
 const arrows=parseArrowLog(text('svg-probed.log'),options);calcEqual(arrows,parseArrowLog(text('pdf-probed.log'),options));
 arrows.driverState=verifyArrowDriverState(arrows,b.files.get('supplemental-reference.svg'),b.files.get('supplemental-reference.pdf'),edgePdfPage(text('pdf-probed.log')),
  {allowText:true,wrapperExtraWidthSp:b.report.wrapperExtraWidthSp,allowDegenerateLine:id==='function-plot-contract',allowTrailingDegenerateLine:id==='smooth-plot-contract'});calcEqual(arrows,b.json('arrow-metrics.json'));
 // Supply the original backend files to existing image/PDF readers. Ownership
 // still covers the outer frozen bundle, including every original artifact.
 for(const[f,bytes]of files)if(!b.files.has(f))b.files.set(f,bytes);
 calcEqual(b.json('metrics.json'),original.metrics);return{...b,metrics:original.metrics,arrowMetrics:arrows,pdfPage:original.report.pdfPage};
}
