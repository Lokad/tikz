// Acceptance gap: reference-only default-fill correction must preserve original
// SVG/PDF evidence, glyphs, geometry and every paint except the declared tips.
import assert from 'node:assert/strict';
import {calcHash} from './calc-saved-images.mjs';
import {edgeSvgPaints,edgePdfPaints} from './edge-driver-state.mjs';
import {arrowSvgVectors} from './arrow-driver-state.mjs';
import {canonicalEdgeSvg} from './edge-replay.mjs';
import {pathLabelDriverState} from './path-label-native.mjs';
import {svgDefaultArrowFillWorkaround,svgDefaultArrowFillWorkaroundKind} from './svg-arrow-color-workaround.mjs';

const cases=Object.freeze({
 'flowchart-draw-color':{paints:14,tips:[5,7,9,11,13],changed:[7,11,13],glyphs:45},
 'arrow-color-contract':{paints:8,tips:[1,3,5,7],changed:[3],glyphs:14}
});
export const requiresSvgArrowFillCorrection=id=>Object.hasOwn(cases,id);
export const svgArrowFillChangedPaintIndices=id=>[...cases[id].changed];
export const correctedArrowFillWrapper=wrapper=>{
 assert.ok(wrapper.includes('\\begin{document}'));
 return wrapper.replace('\\begin{document}',svgDefaultArrowFillWorkaround+'\n\\makeatletter%\n\\begin{document}');
};
export function verifySvgArrowFillCorrection(bundle){
 const {report,files}=bundle,id=report.definition.id,expected=cases[id];
 if(!expected){assert.equal(report.nativeSvgCorrection,undefined);return null;}
 const owned=file=>{const bytes=files.get(file);assert.ok(Buffer.isBuffer(bytes),'Missing original/correction evidence: '+file);
  assert.equal(calcHash(bytes),report.artifacts[file],'Unowned correction evidence: '+file);return bytes;};
 const evidence=JSON.parse(owned('native-svg-correction.json'));
 assert.deepEqual(report.nativeSvgCorrection,evidence);
 assert.equal(evidence.kind,svgDefaultArrowFillWorkaroundKind);
 assert.deepEqual(evidence.changedPaintIndices,expected.changed);
 assert.equal(evidence.pdfUnmodified,true);
 const originalWrapper=owned('original-svg-wrapper.tex').toString('utf8');
 assert.equal(calcHash(owned('original-svg-wrapper.tex')),'3d76e71ce8bb5df4e395d9ffb34063c64f00f7237ece5ac69cbd868b3cdc7868','Untrusted original SVG wrapper.');
 assert.equal(calcHash(owned('pdf-wrapper.tex')),'789f0ad2d515e51a7d79bb456f1f186ce3dc49be9035514df4e6b38751110893','Untrusted/unmodified PDF wrapper.');
 assert.equal(owned('svg-wrapper.tex').toString('utf8'),correctedArrowFillWrapper(originalWrapper));
 assert.equal(owned('pdf-wrapper.tex').includes(Buffer.from(svgDefaultArrowFillWorkaround)),false);
 // Keep the exact reviewed hook as provenance, alongside its emitted wrapper.
 const hookFile='tools/TikzVisual/svg-arrow-color-workaround.mjs';
 assert.equal(calcHash(owned('source-captures/'+hookFile)),report.sourceHashes[hookFile]);
 assert.equal(canonicalEdgeSvg(owned('original-plain-reference.svg')),canonicalEdgeSvg(owned('original-probed-reference.svg')));
 const before=owned('original-probed-reference.svg'),after=owned('probed-reference.svg');
 assert.equal(canonicalEdgeSvg(owned('plain-reference.svg')),canonicalEdgeSvg(after));
 assert.deepEqual(arrowSvgVectors(before,{allowText:true}),arrowSvgVectors(after,{allowText:true}),'Correction changed geometry/clips.');
 const original=edgeSvgPaints(before,{includeGlyphs:true}),corrected=edgeSvgPaints(after,{includeGlyphs:true}),wanted=structuredClone(original);
 const pdfBytes=owned('probed-reference.pdf'),pdf=edgePdfPaints(pdfBytes).paints;
 // Reuse the existing cross-backend color quantization policy. Comparing
 // rounded bytes directly is ambiguous at .3*255 (76.5), for example.
 pathLabelDriverState(after,pdfBytes);
 assert.equal(original.paints.length,expected.paints);assert.equal(pdf.length,expected.paints);
 assert.equal(original.glyphs.length,expected.glyphs);
 for(const index of expected.tips){
  assert.deepEqual(corrected.paints[index].fill,original.paints[index].stroke,'Corrected SVG default fill differs from stroke.');
  assert.deepEqual(pdf[index].fill,pdf[index].stroke,'Default PDF fill differs from stroke.');
  if(expected.changed.includes(index)){
   assert.deepEqual(original.paints[index].fill,[0,0,0]);
   assert.notDeepEqual(original.paints[index].fill,corrected.paints[index].fill);
   wanted.paints[index].fill=corrected.paints[index].fill;
  }
 }
 assert.deepEqual(corrected,wanted,'Correction changed other paint, glyphs, contours or root.');
 for(const suffix of ['reference.pdf','pdf-page-1x.png','pdf-page-4x.png'])
  assert.ok(owned('plain-'+suffix).equals(owned('probed-'+suffix)),'Native probes changed '+suffix);
 return evidence;
}
