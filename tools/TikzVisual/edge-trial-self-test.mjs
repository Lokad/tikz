// Focused declared-envelope and public SVG mutation controls.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root, writeArtifact} from './shape-oracle-bundle.mjs';
import {edgePtToCss} from './edge-oracle.mjs';
import {edgeConservativeStroke, evaluateEdgeDeclaredFrame} from './edge-trial-frame.mjs';
import {edgeNativePageVerdict} from './edge-trial-policy.mjs';
import {mutateEdgeTrial} from './edge-trial-defects.mjs';
import {createRenderer} from './compare.mjs';

const controls = [], radius = edgePtToCss, paint = {widthSp: 2 * 65536, cap: 0, join: 0, miter: 10};
const move = (x, y) => ({kind: 'move', from: null, to: {x, y}}), line = (a, b) => ({kind: 'line', from: a, to: b});
const horizontal = [move(0, 0), line({x: 0, y: 0}, {x: 10, y: 0})];
function check(name, action) { action(); controls.push({name, passed: true}); }
function near(a, b) { assert.ok(Math.abs(a - b) <= 1e-11, a + ' differs from ' + b); }
check('declared circular envelope retains conservative butt-cap padding', () => { const b = edgeConservativeStroke(horizontal, paint).bound;
  near(b.minX, -radius); near(b.maxX, 10 + radius); near(b.minY, -radius); near(b.maxY, radius); });
check('square-cap declaration covers diagonal extension', () => { const b = edgeConservativeStroke(horizontal, {...paint, cap: 2}).bound; near(b.minX, -radius * Math.SQRT2); near(b.maxX, 10 + radius * Math.SQRT2); });
const turn = [...horizontal, line({x: 10, y: 0}, {x: 0, y: 1})];
check('miter limit excludes intersections beyond the declared pen', () => assert.equal(edgeConservativeStroke(turn, paint).joins.length, 0));
check('large miter declaration retains both conservative intersections', () => { const r = edgeConservativeStroke(turn, {...paint, miter: 100}); assert.equal(r.joins.length, 2);
  near(r.bound.minX, 10 - radius * (Math.sqrt(101) + 10)); near(r.bound.maxX, 10 + radius * (Math.sqrt(101) + 10)); });
check('separate subpaths never invent a connecting join', () => assert.equal(edgeConservativeStroke([...horizontal, move(10, 0), line({x: 10, y: 0}, {x: 0, y: 1})], {...paint, miter: 100}).joins.length, 0));
const bounds = {minX: 0, minY: 0, maxX: 10, maxY: 10}, declared = {basis: 'synthetic', picture: bounds, ink: bounds, root: bounds, paths: [{id: 'path-1', bound: bounds}]};
const scene = {paths: [{inkBounds: {...bounds, isEmpty: false}}], pictureBounds: {...bounds, isEmpty: false}, inkBounds: {...bounds, isEmpty: false}}, rootFrame = {x: 0, y: 0, width: 10, height: 10}, nativeFrame = {records: [{id: 'path-1', bound: bounds}]};
check('independent declared frame passes without candidate calibration', () => assert.equal(evaluateEdgeDeclaredFrame(declared, scene, rootFrame, nativeFrame).passed, true));
for (const [name, mutation] of [
  ['wrong path envelope', s => s.paths[0].inkBounds.maxX++], ['false empty ink', s => s.inkBounds.isEmpty = true],
  ['wrong picture', s => s.pictureBounds.minX--]
]) check('reject ' + name, () => { const s = structuredClone(scene); mutation(s); assert.equal(evaluateEdgeDeclaredFrame(declared, s, rootFrame, nativeFrame).passed, false); });
check('root crop fails independent serialization', () => assert.equal(evaluateEdgeDeclaredFrame(declared, scene, {...rootFrame, width: 1}, nativeFrame).passed, false));
check('native ink outside declared root fails', () => assert.equal(evaluateEdgeDeclaredFrame(declared, scene, rootFrame, {records: [{id: 'outside', bound: {...bounds, maxX: 11}}]}).passed, false));
const exact = {fullPage: {exactRgbaMatch: true, rawChangedPixels: 0, maxRawChannelError: 0}, metrics: [{exactRgbaMatch: true, rawChangedPixels: 0, maxRawChannelError: 0}]};
check('native page zero gate accepts identical samples', () => assert.equal(edgeNativePageVerdict(exact, [{id: 'whole-picture'}]).passed, true));
check('native full-page disagreement fails beyond exact local crops', () => assert.equal(edgeNativePageVerdict({...exact, fullPage: {exactRgbaMatch: false, rawChangedPixels: 1, maxRawChannelError: 1}}, [{id: 'whole-picture'}]).passed, false));
check('incomplete native region coverage cannot pass', () => assert.throws(() => edgeNativePageVerdict(exact, [])));
let renderer;
try {
  renderer = await createRenderer();
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 16 16"><defs><clipPath id="c"><path d="M0 0H8V16H0Z"/></clipPath><path id="g" d="M0 0h1v1h-1Z"/></defs><g clip-path="url(#c)"><path id="candidate-p0" d="M1 8H15" stroke="blue" stroke-width="1" stroke-dasharray="1 1"/></g><g><use id="candidate-g0" href="#g"/></g></svg>';
  const metrics = {caseId: 'synthetic', driverState: {paints: [{pathId: 1}]}};
  const changes = ['remove', 'width', 'color', 'dash', 'cap', 'opacity', 'clip', 'shift', 'baseline', 'root'];
  for (const change of changes) { const target = change === 'baseline' ? 'glyph-0' : 'path-1';
    const changed = await mutateEdgeTrial(renderer, svg, metrics, {caseId: 'synthetic', target, change});
    const inspected = await renderer.page.evaluate(({changed, change}) => { const d = new DOMParser().parseFromString(changed, 'image/svg+xml'), p = d.getElementById('candidate-p0');
      const result = {valid: !d.querySelector('parsererror'), glyphPresent: !!d.getElementById('candidate-g0')};
      result.expected = change === 'remove' ? !p : change === 'width' ? p.getAttribute('stroke-width') === '2' : change === 'color' ? p.getAttribute('stroke') === '#0f0'
        : change === 'dash' ? p.getAttribute('stroke-dasharray') === 'none' : change === 'cap' ? p.getAttribute('stroke-linecap') === 'butt' : change === 'opacity' ? p.getAttribute('stroke-opacity') === '0'
          : change === 'clip' ? !p.parentElement.hasAttribute('clip-path') : change === 'shift' ? p.parentElement.getAttribute('transform') === 'translate(.25 0)'
            : change === 'baseline' ? d.getElementById('candidate-g0').parentElement.getAttribute('transform') === 'translate(0 .25)' : d.documentElement.getAttribute('width') === '1px'; return result;
    }, {changed, change}); check('public SVG mutation ' + change + ' reaches its mapped target', () => assert.deepEqual(inspected, {valid: true, glyphPresent: true, expected: true})); }
  await assert.rejects(() => mutateEdgeTrial(renderer, svg, metrics, {caseId: 'synthetic', target: 'path-2', change: 'remove'})); controls.push({name: 'reject unmapped native target', passed: true});
  const output = path.join(root, 'artifacts/edge-public-controls/run-' + randomUUID());
  await writeArtifact(output, 'report.json', JSON.stringify({schemaVersion: 1, completed: true, converterInvoked: false, approvedImagePolicy: false, imageConformanceClaim: false, scope: 'Synthetic declaration and SVG mutation controls only.', controls}, null, 2) + '\n');
  console.log('Public edge focused controls: ' + controls.length + ' passed.');
} finally { await renderer?.browser.close(); }
