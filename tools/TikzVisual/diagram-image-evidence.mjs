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
 'flowchart-transformed':'3c6fae434443c59204a653e6656c4e581644d6eb693c139d6d565ddfb008f43a'
};
export async function loadLabelImageEvidence(input){
 if(['placement','interactions'].includes(input))return loadPathLabelEvidence(input);
 const b=await loadCalcSavedReport(path.resolve(root,input),'diagram-arrow-native-reference'),id=b.report.definition.id;
 assert.equal(b.sha256,frozen[id],'Expected the frozen trusted diagram arrow bundle.');
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
