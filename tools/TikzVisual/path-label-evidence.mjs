// Portable native observations; shared transport, label-specific semantics.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root} from './shape-oracle-bundle.mjs';
import {calcHash,calcEqual,loadCalcSavedReport} from './calc-saved-images.mjs';
import {parsePathLabelNative,parseDiagramNative,pathLabelPhysicalCalls,pathLabelDriverState} from './path-label-native.mjs';
import {canonicalEdgeSvg} from './edge-replay.mjs';
import {edgeCanonical} from './edge-log.mjs';
import {verifySvgArrowFillCorrection} from './svg-arrow-color-evidence.mjs';
import {verifySvgClipRuleCorrection} from './fill-rule-evidence.mjs';
export const pathLabelReference='tests/Reference/PathLabels/native/report.json';
export const pathLabelReferenceSha256='e8a8e511265aab232f33054dd810536fec236c9a6e2e43a34025ff59f99f6eb3';
const cases={
 placement:{file:pathLabelReference,sha256:pathLabelReferenceSha256,counts:{nodes:13,pathCalls:23,paintedPaths:13,anchors:208}},
 interactions:{file:'tests/Reference/PathLabels/interactions-native/report.json',sha256:'d361241a94334310ae8b575a92527415d2891fcccc096d92ddf66f29ded81d62',counts:{nodes:8,pathCalls:15,paintedPaths:11,anchors:128}}
};
export async function loadPathLabelEvidence(id='placement'){
 assert.ok(Object.hasOwn(cases,id),'Only fixed trusted repository fixtures are accepted.');const expected=cases[id];
 const b=await loadCalcSavedReport(path.join(root,expected.file),'path-label-native-reference');
 assert.equal(b.sha256,expected.sha256,'Frozen path-label native report changed.');
 assert.equal(b.report.definition.id,id);
 assert.equal(b.report.converterInvoked,false);assert.equal(b.report.nativeToolInvoked,true);
 assert.deepEqual(b.report.counts,expected.counts);
 for(const [file,hash]of Object.entries(b.report.sourceHashes)){
  assert.equal(calcHash(b.files.get('source-captures/'+file)),hash);
  // Keep the original generator/checker source as provenance. Extending a
  // reader for another family does not invalidate unchanged TeX/font inputs;
  // current readers must still reproduce all retained measurements below.
  if(file.startsWith('tests/Fixtures/')||file.endsWith('.tex')||file==='tools/TikzFontData/font-profile.json')
   assert.equal(calcHash(edgeCanonical(await readFile(path.join(root,file)))),hash,'Native engine input changed: '+file);
 }
 return verifyPathLabelEvidence(b);
}
export function verifyPathLabelEvidence(b){
 verifySvgArrowFillCorrection(b);
 verifySvgClipRuleCorrection(b);
 const ids=b.report.definition.nodes.map(n=>n.id),text=f=>b.files.get(f).toString('utf8');
 const parse=log=>b.report.role==='diagram-native-reference'?parseDiagramNative(log,b.report.definition):parsePathLabelNative(log,ids);
 const m=parse(text('svg-probed.log')),p=parse(text('pdf-probed.log'));calcEqual(m,p,'SVG/PDF native observations differ.');
 m.physicalOrder=pathLabelPhysicalCalls(m,text('native-positions.log'),text('pdf-probed.log'));
 m.driverState=pathLabelDriverState(b.files.get('probed-reference.svg'),b.files.get('probed-reference.pdf'));
 calcEqual(m,b.json('metrics.json'),'Reparsed native measurements differ.');
 assert.equal(canonicalEdgeSvg(b.files.get('plain-reference.svg')),canonicalEdgeSvg(b.files.get('probed-reference.svg')));
 for(const suffix of ['reference.pdf','pdf-page-1x.png','pdf-page-4x.png'])assert.ok(b.files.get('plain-'+suffix).equals(b.files.get('probed-'+suffix)),'Native probes changed '+suffix);
 return{...b,metrics:m};
}
