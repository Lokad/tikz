// Native-derived declaration of public conservative ink bounds, separate from
// the tighter reference camera. No scene, SVG size or candidate error supplies
// an expected bound. Circular-pen envelopes deliberately include unpainted dash
// gaps and zero-opacity painted paths; convex rectangle nodes use offset corners.
import assert from 'node:assert/strict';
import {edgeCssSegments} from './edge-oracle-frame.mjs';
import {edgeSpToCss} from './edge-oracle.mjs';
import {pathBounds, unionBounds} from './shape-frame-math.mjs';

const pointBox = p => ({minX: p.x, minY: p.y, maxX: p.x, maxY: p.y});
const inflate = (b, r) => ({minX: b.minX - r, minY: b.minY - r, maxX: b.maxX + r, maxY: b.maxY + r});
function unit(a, b) { const x = b.x - a.x, y = b.y - a.y, d = Math.hypot(x, y); return d ? {x: x / d, y: y / d} : null; }
function tangent(s, end) {
  const from = end ? s.to : s.from;
  const points = s.kind === 'cubic' ? end ? [s.c2, s.c1, s.from] : [s.c1, s.c2, s.to] : [end ? s.from : s.to];
  const to = points.find(p => p.x !== from.x || p.y !== from.y);
  return to ? end ? unit(to, from) : unit(from, to) : null;
}
function clipped(bound, clips, frame) {
  for (const id of clips) { const c = frame.clips[id].bound; bound = {minX: Math.max(bound.minX, c.minX), minY: Math.max(bound.minY, c.minY), maxX: Math.min(bound.maxX, c.maxX), maxY: Math.min(bound.maxY, c.maxY)};
    if (bound.minX > bound.maxX || bound.minY > bound.maxY) return null; }
  return bound;
}
export function edgeConservativeStroke(segments, paint) {
  const radius = paint.widthSp * edgeSpToCss / 2;
  const boxes = [inflate(pathBounds(segments), radius * (paint.cap === 2 ? Math.SQRT2 : 1))], joins = [];
  if (paint.join !== 0) return {bound: unionBounds(boxes), joins};
  let group = [];
  const join = (left, right) => {
    const u = tangent(left, true), v = tangent(right, false); if (!u || !v) return;
    const determinant = u.x * v.y - u.y * v.x; if (Math.abs(determinant) < 1e-14) return;
    const p = left.to;
    // Both offset-line intersections declare a conservative pen envelope.
    // They are not relabeled as two visible miter tips.
    for (const sign of [-1, 1]) {
      const a = {x: p.x - sign * u.y * radius, y: p.y + sign * u.x * radius};
      const b = {x: p.x - sign * v.y * radius, y: p.y + sign * v.x * radius};
      const t = ((b.x - a.x) * v.y - (b.y - a.y) * v.x) / determinant;
      const q = {x: a.x + t * u.x, y: a.y + t * u.y};
      if (Math.hypot(q.x - p.x, q.y - p.y) <= radius * paint.miter) { boxes.push(pointBox(q)); joins.push({point: p, intersection: q}); }
    }
  };
  for (const s of segments) {
    if (s.kind === 'move') { group = []; continue; }
    if (tangent(s, false) || tangent(s, true)) { if (group.length) join(group.at(-1), s); group.push(s); }
    if (s.kind === 'close') { if (group.length) join(group.at(-1), group[0]); group = []; }
  }
  return {bound: unionBounds(boxes), joins};
}

export function buildEdgeDeclaredFrame(metrics, frame) {
  assert.equal(metrics.caseId, frame.caseId);
  const paths = new Map(metrics.paths.map(p => [p.index, p]));
  const records = metrics.driverState.paints.map((paint, i) => {
    const native = paths.get(paint.pathId), record = frame.records.find(r => r.id === 'path-' + paint.pathId), segments = edgeCssSegments(native);
    const node = metrics.nodes.find(n => native.owner === 'node-' + n.id);
    const rectangular = node?.shape === 'rectangle';
    const hasStroke = paint.operation !== 'fill';
    const stroke = hasStroke ? rectangular ? {bound: record.stroke?.stroke, joins: []} : edgeConservativeStroke(segments, paint) : null;
    assert.ok(!hasStroke || stroke.bound, 'Missing native pen declaration.');
    const bound = clipped(stroke?.bound ?? pathBounds(segments), paint.clips, frame);
    return {id: record.id, svgElementId: 'candidate-p' + i, nativePathId: paint.pathId, bound, declaredStroke: stroke,
      contract: rectangular ? 'Convex rectangle offset corners.' : 'Circular-pen envelope and bounded offset intersections; cap square uses sqrt(2) radius.'};
  });
  const glyphs = frame.records.filter(r => r.kind === 'glyph');
  const ink = unionBounds([...records.map(r => r.bound), ...glyphs.map(r => r.bound)].filter(Boolean));
  const root = unionBounds([frame.picture, ink]);
  return {id: metrics.caseId, picture: frame.picture, ink, root, paths: records, glyphs: glyphs.map(r => ({id: r.id, bound: r.bound})),
    converterInvoked: false, basis: 'Frozen native PGF geometry/shipped paint, original glyph outlines and DVI positions; declared conservative pen contract.'};
}

export function evaluateEdgeDeclaredFrame(declared, scene, sourceFrame, nativeFrame) {
  const checks = [], limit = 4 / 3 * 1e-9;
  const scalar = (id, expected, actual, tolerance) => checks.push({id, expected, actual, limit: tolerance,
    passed: Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance});
  const bound = (id, expected, actual) => {
    if (expected === null) { checks.push({id: id + '.empty', expected: true, actual: actual.isEmpty, limit: 0, passed: actual.isEmpty === true}); return; }
    checks.push({id: id + '.nonempty', expected: false, actual: actual.isEmpty, limit: 0, passed: actual.isEmpty === false});
    for (const key of ['minX', 'minY', 'maxX', 'maxY']) scalar(id + '.' + key, expected[key], actual[key], limit);
  };
  scalar('path-count', declared.paths.length, scene.paths.length, 0);
  declared.paths.forEach((p, i) => bound(p.id, p.bound, scene.paths[i]?.inkBounds ?? {isEmpty: true}));
  bound('public.picture', declared.picture, scene.pictureBounds); bound('public.ink', declared.ink, scene.inkBounds);
  const view = {x: declared.root.minX, y: declared.root.minY, width: declared.root.maxX - declared.root.minX, height: declared.root.maxY - declared.root.minY};
  for (const key of Object.keys(view)) scalar('svg.root.' + key, view[key], sourceFrame[key], .000000500001);
  for (const r of nativeFrame.records.filter(r => r.bound)) {
    const b = r.bound, margins = [b.minX - declared.root.minX, b.minY - declared.root.minY, declared.root.maxX - b.maxX, declared.root.maxY - b.maxY];
    checks.push({id: r.id + '.native-ink-contained', margins, limit, passed: margins.every(n => n >= -limit)});
  }
  return {passed: checks.every(c => c.passed), checks, contract: declared.basis};
}
