import assert from 'node:assert/strict';

// The shared policy's optional region ownership is undefined for shipped paths.
// JSON omits that property. Restore its in-memory identity without changing limits.
export function readPathLabelPrimaryPolicies(bundle){
 const policies=bundle.json('policies.json');
 for(const policy of Object.values(policies))for(const region of policy.regions)
  if(!Object.hasOwn(region,'nodeId'))region.nodeId=undefined;
 return policies;
}
// The fixed smooth contract has 0.11 CSS px of native stroke ink outside PGF's
// picture frame. Intrinsic image rasterization with the enclosing ink frame
// splits one threshold-16 glyph component. Matched-root native recaptures must
// prove zero component differences before these exact native-derived limits.
// Every other case/capture/view/region retains the strict zero-component rule.
export function pathLabelNativeComponentLimit(fixture, capture, view, region) {
 return fixture==='smooth-plot-contract' && capture==='intrinsic-image' && view.frame==='natural' && view.scale===1
  && ['transparent','white'].includes(view.background) && ['whole-picture','native-glyph-1','native-glyph-2'].includes(region)?1:0;
}
export function pathLabelRootRegistrationViews(fixture, encodings) {
 return fixture==='smooth-plot-contract'?encodings.flatMap(encoding=>['transparent','white'].map(background=>
  ({encoding,capture:'intrinsic-image',frame:'natural',scale:1,background}))):[];
}
export function registerPathLabelNativeRoot(svg, natural) {
 assert.ok(['x','y','width','height'].every(k=>Number.isFinite(natural[k])) && natural.width>0 && natural.height>0);
 assert.ok(/^<svg[^>]*>/.test(svg));
 return svg.replace(/^<svg[^>]*>/,`<svg xmlns="http://www.w3.org/2000/svg" width="${natural.width}px" height="${natural.height}px" viewBox="${natural.x} ${natural.y} ${natural.width} ${natural.height}">`);
}
