// Fixed native representation; original driver bytes and empty paints remain unchanged.
import assert from 'node:assert/strict';
import {edgeOracleVariants,edgeOracleInstructions,makeEdgeOracleSvg,edgePtToCss} from './edge-oracle.mjs';

export const edgePrimaryContract={id:'native-curved-edge-pt-short-glyph-six-v1',
  paths:'Shortest zero-to-five-decimal TeX-point dimensions recovering original integer sp; half-away-from-zero rounding.',
  pathTransform:'scale(1.32835201328352 -1.32835201328352)',glyphMatrices:6,paintDecimals:6,root:'native-ink-six',
  reference:'Original immutable PGF SVG, including two empty backend strokes. No drawing correction.',
  source:'Frozen native curved PGF paths and shipped state, DVI positions and original glyph outlines. No converter input.'};

export async function buildEdgePrimaryReference(renderer,reference,metrics,glyphs,original,frame){
  const variant=edgeOracleVariants.find(v=>v.name==='native-pt-short-glyph-six'),instructions=edgeOracleInstructions(metrics,glyphs,original,variant);
  assert.ok(Math.abs(Number(edgePrimaryContract.pathTransform.match(/[\d.]+/)[0])-edgePtToCss)<2e-15);
  for(const p of [...instructions.paths,...instructions.clips])p.transform=edgePrimaryContract.pathTransform;
  const paintChecks=[];
  for(const p of instructions.paths)for(const k of ['stroke-opacity','fill-opacity','stroke-miterlimit']){
    const previous=Number(p.paint[k]),text=previous.toFixed(6).replace(/0+$/,'').replace(/\.$/,'');
    assert.ok(Math.abs(Number(text)-previous)<=.000000500001);
    p.paint[k]=text;paintChecks.push({id:p.nativePathId,quantity:k,expected:previous,serialized:text,delta:Math.abs(Number(text)-previous),limit:.000000500001});
  }
  const native=await makeEdgeOracleSvg(renderer,reference,original,instructions,frame,edgePrimaryContract.root);
  return{nativeSvg:native.svg,referenceSvg:reference,corrections:[],serializationChecks:instructions.checks,paintChecks,rootChecks:native.rootChecks,root:native.root};
}
