// Separate trusted corpus configuration; existing straight evidence is unchanged.
import assert from 'node:assert/strict';
import {edgeAnchors, edgeWrapper, edgeInputFiles, parseEdgeLog} from './edge-log.mjs';
export {edgeAnchors, edgeWrapper, edgeCanonical, edgeSanitize, edgeBox, edgePdfPage, edgePhysicalOrder} from './edge-log.mjs';
export const edgeHooks = 'tools/TikzCurvedEdgeReference/curved-edge-hooks.tex';
export const edgeProfile = 'pgf-3.1.11a-curved-to-edge-v1';
export const edgeIds = ['continuation', 'styles', 'coordinates', 'nodes', 'clipping'];
export const edgeManifest = 'tests/Reference/CurvedEdges/cases.json';
export const curvedReference = 'tests/Reference/CurvedEdges/';
export const curvedInputFiles = [...new Set([edgeManifest, edgeWrapper, edgeHooks, 'tools/TikzVisual/curved-edge-reference.mjs',
  'tools/TikzVisual/curved-edge-log.mjs', 'tools/TikzVisual/curved-edge-driver-state.mjs', ...edgeInputFiles.filter(p => !p.endsWith('/cases.json') && !p.endsWith('/edge-reference.mjs'))])];
export function validateEdgeManifest(m) {
  assert.equal(m.schemaVersion, 1); assert.equal(m.profile, edgeProfile); assert.equal(m.fontProfile, 'latin-modern-ec-10-12-v1'); assert.equal(m.colorProfile, 'xcolor-rgb-v1');
  assert.deepEqual(m.libraries, ['shapes.geometric']); assert.deepEqual(m.anchors, edgeAnchors); assert.deepEqual(m.cases.map(c => c.id), edgeIds);
  for (const c of m.cases) {
    assert.equal(c.source, 'tests/Fixtures/CurvedEdges/' + c.id + '.tikz'); assert.ok(c.features.length > 0 && new Set(c.features).size === c.features.length);
    assert.deepEqual(c.coordinates ?? [], c.id === 'coordinates' ? ['target'] : []);
    assert.deepEqual(c.nodes, c.id === 'nodes' ? [{id: 'input', shape: 'rectangle'}, {id: 'output', shape: 'rectangle'}, {id: 'round', shape: 'circle'}, {id: 'wide', shape: 'ellipse'}] : []);
  }
}
export function parseCurvedEdgeLog(log, c) {return {...parseEdgeLog(log, c), profile: edgeProfile};}
