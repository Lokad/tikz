// Portable native observations; shared transport, label-specific semantics.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root} from './shape-oracle-bundle.mjs';
import {calcHash,calcEqual,loadCalcSavedReport} from './calc-saved-images.mjs';
import {parsePathLabelNative,pathLabelPhysicalCalls,pathLabelDriverState} from './path-label-native.mjs';
import {canonicalEdgeSvg} from './edge-replay.mjs';
import {edgeCanonical} from './edge-log.mjs';
export const pathLabelReference='tests/Reference/PathLabels/native/report.json';
export const pathLabelReferenceSha256='52cb8efe3ff4eed3801cee0623189ec95749c00f72f31a52f2b781d8d8c6b1df';
export async function loadPathLabelEvidence(){
 const b=await loadCalcSavedReport(path.join(root,pathLabelReference),'path-label-native-reference');
 assert.equal(b.sha256,pathLabelReferenceSha256,'Frozen path-label native report changed.');
 assert.equal(b.report.converterInvoked,false);assert.equal(b.report.nativeToolInvoked,true);
 assert.deepEqual(b.report.counts,{nodes:13,pathCalls:23,paintedPaths:13,anchors:208});
 for(const [file,hash]of Object.entries(b.report.sourceHashes)){
  assert.equal(calcHash(edgeCanonical(await readFile(path.join(root,file)))),hash,'Native reference source changed: '+file);
  assert.equal(calcHash(b.files.get('source-captures/'+file)),hash);
 }
 return verifyPathLabelEvidence(b);
}
export function verifyPathLabelEvidence(b){
 const ids=b.report.definition.nodes.map(n=>n.id),text=f=>b.files.get(f).toString('utf8');
 const m=parsePathLabelNative(text('svg-probed.log'),ids),p=parsePathLabelNative(text('pdf-probed.log'),ids);calcEqual(m,p,'SVG/PDF native observations differ.');
 m.physicalOrder=pathLabelPhysicalCalls(m,text('native-positions.log'),text('pdf-probed.log'));
 m.driverState=pathLabelDriverState(b.files.get('probed-reference.svg'),b.files.get('probed-reference.pdf'));
 calcEqual(m,b.json('metrics.json'),'Reparsed native measurements differ.');
 assert.equal(canonicalEdgeSvg(b.files.get('plain-reference.svg')),canonicalEdgeSvg(b.files.get('probed-reference.svg')));
 for(const suffix of ['reference.pdf','pdf-page-1x.png','pdf-page-4x.png'])assert.ok(b.files.get('plain-'+suffix).equals(b.files.get('probed-'+suffix)),'Native probes changed '+suffix);
 return{...b,metrics:m};
}
