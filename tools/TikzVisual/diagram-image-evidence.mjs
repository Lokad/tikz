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
export const rectangleImageCounts=Object.freeze({'style-contract':7,'foreach-contract':29,'math-macro-contract':25});
export const isRectangleImageCase=id=>Object.hasOwn(rectangleImageCounts,id);
export const labelImageSourceFile=id=>'tests/Fixtures/'+(id==='style-contract'?'Styles':id==='foreach-contract'?'Foreach':id==='math-macro-contract'?'MathMacros':'Diagrams')+'/'+id+'.tikz';
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
 const arrows=parseArrowLog(text('svg-probed.log'),{allowWrapperGlue:true});calcEqual(arrows,parseArrowLog(text('pdf-probed.log'),{allowWrapperGlue:true}));
 arrows.driverState=verifyArrowDriverState(arrows,b.files.get('supplemental-reference.svg'),b.files.get('supplemental-reference.pdf'),edgePdfPage(text('pdf-probed.log')),
  {allowText:true,wrapperExtraWidthSp:b.report.wrapperExtraWidthSp});calcEqual(arrows,b.json('arrow-metrics.json'));
 // Supply the original backend files to existing image/PDF readers. Ownership
 // still covers the outer frozen bundle, including every original artifact.
 for(const[f,bytes]of files)if(!b.files.has(f))b.files.set(f,bytes);
 calcEqual(b.json('metrics.json'),original.metrics);return{...b,metrics:original.metrics,arrowMetrics:arrows,pdfPage:original.report.pdfPage};
}
