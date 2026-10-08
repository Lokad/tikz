// Preserve public IDs after mutations; attribution comes from the checked trace.
import assert from 'node:assert/strict';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {mutateArrowPrimary,arrowVisibilityInputs} from './arrow-primary-defects.mjs';

export function arrowPublicControlCase(input,caseId) {
  const b=input.bundle,svg=b.read('numeric/'+caseId+'/candidate.svg').toString(),scene=b.json('numeric/'+caseId+'/scene.json');
  const source=b.read('numeric/input-captures/tests/Reference/Arrows/'+caseId+'/source.tikz').toString();
  assertNativeEqual([...svg.matchAll(/<path id="candidate-p(\d+)"/g)].map(m=>Number(m[1])+1),scene.paths.map(p=>p.ordinal));
  return {caseId,svg,scene,source};
}

export function arrowPublicControlAttribution(c,control) {
  if(!control)return null;
  const ordinal=Number(control.target.slice('paint-'.length)),p=c.scene.paths.find(p=>p.ordinal===ordinal);assert.ok(p);
  assert.ok(Number.isSafeInteger(p.source.offset)&&Number.isSafeInteger(p.source.length)&&p.source.offset>=0&&p.source.length>0&&p.source.offset+p.source.length<=c.source.length);
  return {nativeRegion:control.target,publicElement:'candidate-p'+(ordinal-1),ordinal,role:p.role,source:p.source,
    sourceFile:'tests/Reference/Arrows/'+c.caseId+'/source.tikz',sourceFragment:c.source.slice(p.source.offset,p.source.offset+p.source.length),shaftSource:p.arrow?.shaftSource??null};
}

export function arrowPublicControlSvg(c,control,kind) {
  if(kind==='calibration')return c.svg;
  const alias=c.svg.replaceAll(/candidate-p(\d+)/g,(_,n)=>'paint-'+(Number(n)+1)).replaceAll(/candidate-c(\d+)/g,(_,n)=>'native-clip-'+n);
  const restore=s=>s.replaceAll(/paint-(\d+)/g,(_,n)=>'candidate-p'+(Number(n)-1)).replaceAll(/native-clip-(\d+)/g,(_,n)=>'candidate-c'+n);
  let changed;
  if(kind==='defect')changed=mutateArrowPrimary(alias,control);
  else{assert.ok(['visibility-calibration','visibility-missing'].includes(kind));const pair=arrowVisibilityInputs(alias,control);changed=kind==='visibility-missing'?pair.missing:pair.actual;}
  const svg=restore(changed);assert.notEqual(svg,c.svg);return svg;
}
