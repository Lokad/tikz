import assert from 'node:assert/strict';
import {buildArrowPrimaryReference} from './arrow-primary-reference.mjs';
import {normalizeArrowViewport} from './arrow-viewport-normalize.mjs';
import {arrowViewportFrameCheck} from './arrow-viewport-model.mjs';
import {arrowSourceEnvelope,arrowSourceCamera,arrowSourceEnvelopeContract} from './arrow-source-envelope.mjs';

export const arrowSourcePrimaryContract={
 id:'native-arrow-standalone-source-primary-v1',
 envelope:arrowSourceEnvelopeContract.id,
 reference:'Original immutable PGF SVG bytes are retained. Native source-envelope presentation changes only outer attributes; drawing, explicit clips, transforms and paint remain unchanged.',
 reconstruction:'Native short TeX-point path/pen/placement dimensions and continuous finite matrices remain unchanged. Source framing follows the independent conservative envelope.',
 views:'Every natural/expanded, 1x/4x, transparent/white/black view remains required.',
 coupling:'Original reference framing, prescribed source framing and primary pixel gates remain distinct. Scene normalization cannot approve a wrong original source viewport.',
 scope:'Prospective glyph-free native-only experiment; previous intrinsic observations remain diagnostics. No public conversion or policy approval.'
};

export async function arrowSourcePrimaryReference(renderer,native,frame,original){
 const envelope=arrowSourceEnvelope(native,frame),camera=arrowSourceCamera(envelope);
 const reference=await normalizeArrowViewport(renderer,original,'bp',frame.origin,camera);
 const d=frame.driverRoot;
 const originalFrame=arrowViewportFrameCheck(reference.proof.sourceFrame,{x:d.minX,y:d.minY,width:d.maxX-d.minX,height:d.maxY-d.minY});
 assert.equal(originalFrame.passed,true);
 const built=buildArrowPrimaryReference(native,{...frame,inkRoot:envelope.bounds},'ink');
 const actual=await normalizeArrowViewport(renderer,built.svg,'cssPixels',{x:0,y:0},camera);
 const actualFrame=await arrowSourcePrimaryFrame(renderer,actual.svg,envelope);
 assert.equal(actualFrame.passed,true);
 return{reference:reference.svg,actual:actual.svg,envelope,originalFrame,referenceProof:reference.proof,actualProof:actual.proof};
}

export async function arrowSourcePrimaryFrame(renderer,svg,envelope){
 const parsed=await normalizeArrowViewport(renderer,svg,'cssPixels',{x:0,y:0},arrowSourceCamera(envelope));
 return arrowViewportFrameCheck(parsed.proof.sourceFrame,envelope.root);
}
