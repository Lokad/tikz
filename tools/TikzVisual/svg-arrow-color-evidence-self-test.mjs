// The corrected reference route must reject rehashed missing/altered originals,
// wrong fills, glyph changes and geometry changes. Reuse generic overlays.
import assert from 'node:assert/strict';
import path from 'node:path';
import {root} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport} from './calc-saved-images.mjs';
import {verifyPathLabelEvidence} from './path-label-evidence.mjs';
import {requiresSvgArrowFillCorrection} from './svg-arrow-color-evidence.mjs';
import {runPrimaryReportControls} from './primary-report-controls.mjs';

assert.equal(process.argv.length,3,'Usage: node tools/TikzVisual/svg-arrow-color-evidence-self-test.mjs <fixed native report>');
const original=await loadCalcSavedReport(path.resolve(root,process.argv[2]),'diagram-native-reference');
assert.ok(requiresSvgArrowFillCorrection(original.report.definition.id));
verifyPathLabelEvidence(original);
const corrected=(artifact,change)=>{for(const state of ['plain','probed'])artifact(state+'-reference.svg',bytes=>change(bytes.toString('utf8')));};
const defects=[
 ['missing-original',r=>delete r.artifacts['original-plain-reference.svg']],
 ['missing-correction',r=>delete r.nativeSvgCorrection],
 ['rehashed-wrong-correction',(r,json)=>{const change=v=>v.changedPaintIndices.pop();change(r.nativeSvgCorrection);json('native-svg-correction.json',change);}],
 ['rehashed-original-replaced-with-corrected',(r,json,artifact)=>{
  for(const state of ['plain','probed'])artifact('original-'+state+'-reference.svg',()=>original.files.get(state+'-reference.svg'));}],
 ['rehashed-wrong-tip-fill',(r,json,artifact)=>corrected(artifact,text=>text.replaceAll("fill='#008080'","fill='#ff0000'"))],
 ['rehashed-glyph-placement',(r,json,artifact)=>corrected(artifact,text=>text.replace(/(<use\b[^>]*\bx=')([^']+)(')/,(all,a,n,b)=>a+(Number(n)+1)+b))],
 ['rehashed-glyph-paint',(r,json,artifact)=>corrected(artifact,text=>text.replace('<use ',"<use fill='#ff0000' "))],
 ['rehashed-glyph-contour',(r,json,artifact)=>corrected(artifact,text=>text.replace(/(<defs>[\s\S]*?\bd=')M/,"$1M1 1L"))],
 ['rehashed-path-geometry',(r,json,artifact)=>corrected(artifact,text=>text.replace(/(<\/defs>[\s\S]*?<path\b[^>]*\bd=')M/,"$1M1 1L"))],
 ['rehashed-root',(r,json,artifact)=>corrected(artifact,text=>text.replace(/viewBox='([^']+)'/,"viewBox='0 0 1 1'"))],
 ['rehashed-wrapper',(r,json,artifact)=>artifact('svg-wrapper.tex',bytes=>bytes.toString('utf8').replace('pgfsetfillcolor','pgfsetstrokecolor'))]
];
const controls=runPrimaryReportControls(original,verifyPathLabelEvidence,defects);
console.log(JSON.stringify({validated:true,fixture:original.report.definition.id,reportSha256:original.sha256,controls:controls.length,names:controls}));
