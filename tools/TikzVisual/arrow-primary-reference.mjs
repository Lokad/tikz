// An independently specified printing/viewport contract, never a candidate fit.
import assert from 'node:assert/strict';
import {makeArrowNativeSvg,arrowNativeRepresentations} from './arrow-native-svg.mjs';
export const arrowPrimaryContract={id:'native-arrow-pt-short-picture-v1',
 coordinates:'Shortest zero-to-five-decimal TeX-point dimensions recovering the original integer sp, including pen, dash and placement translations.',
 matrices:'Original continuous native coefficients, without additional decimal rounding.',
 paint:'Physical shipped order; independently decoded driver colors, opacity, caps, joins and clips.',
 root:'Native picture bounds at twelve CSS decimals. Original intrinsic natural and expanded routes remain required separately.',
 reference:'Original immutable PGF SVG, without drawing corrections or reference replacement.',
 scope:'Six frozen glyph-free arrow fixtures only. Ink-root observations are diagnostics, not alternative admission routes.'};
export function buildArrowPrimaryReference(metrics,frame,rootMode='picture'){
 assert.ok(['picture','ink'].includes(rootMode));
 return makeArrowNativeSvg(metrics,frame,arrowNativeRepresentations[0],rootMode);
}
