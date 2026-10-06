// A bounded diagnostic reader for the one trusted geometry-only PDF fixture.
// It deliberately rejects unsupported PDF syntax instead of interpreting it.
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { pgfPdfPoint } from './dash-pdf-vector.mjs';

const number = '([+-]?(?:\\d+(?:\\.\\d{1,5})?|\\.\\d{1,5}))';
const grammar = pattern => new RegExp('^' + pattern + '$');
const point = (m, offset = 1) => {
  const p = { x: Number(m[offset]), y: Number(m[offset + 1]) };
  assert.ok(Object.values(p).every(n => Number.isFinite(n) && Math.abs(n) <= 10000), 'Coordinate limit.'); return p;
};

export function parseDashGeometryPdfContent(content, resources = { 'pgf@ca.1': { fillOpacity: .1 } }) {
  assert.ok(typeof content === 'string' && content.length <= 1000000);
  let state = { width: 1, dash: [], phase: 0, cap: 0, join: 0, miter: 10, fillOpacity: 1, strokeOpacity: 1, clips: [] };
  let origin = null, segments = [], pendingClip = false;
  const stack = [], records = [], clips = [], paints = [];
  const move = grammar(number + ' ' + number + ' m'), line = grammar(number + ' ' + number + ' l');
  const cubic = grammar(Array(6).fill(number).join(' ') + ' c');
  const width = grammar(number + ' w'), miter = grammar(number + ' M');
  const dash = grammar('\\[\\s*([^\\]]*)\\s*\\] ' + number + ' d');
  const matrix = grammar('1 0 0 1 ' + number + ' ' + number + ' cm');
  const copyState = () => ({ ...state, dash: [...state.dash], clips: [...state.clips] });
  const requireIdle = () => assert.ok(segments.length === 0 && !pendingClip, 'State changed inside an active path.');
  for (const op of content.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
    let m;
    if (['0 g', '0 G', '0 g 0 G'].includes(op)) { requireIdle(); continue; }
    if (op === 'q') { requireIdle(); assert.ok(stack.length < 64); stack.push(copyState()); continue; }
    if (op === 'Q') { requireIdle(); assert.ok(stack.length > 0, 'Unbalanced PDF restore.'); state = stack.pop(); continue; }
    if ((m = matrix.exec(op))) { requireIdle(); assert.equal(origin, null, 'Multiple page origins.'); assert.equal(stack.length, 0); origin = point(m); continue; }
    if ((m = width.exec(op))) { requireIdle(); state.width = Number(m[1]); assert.ok(state.width > 0 && state.width < 1000); continue; }
    if ((m = miter.exec(op))) { requireIdle(); state.miter = Number(m[1]); assert.ok(state.miter >= 1 && state.miter <= 1000); continue; }
    if ((m = dash.exec(op))) {
      requireIdle(); const text = m[1].trim(), tokens = text ? text.split(/\s+/) : [];
      assert.ok(tokens.every(n => grammar(number).test(n))); state.dash = tokens.map(Number); state.phase = Number(m[2]);
      assert.ok(state.dash.length <= 64 && state.dash.every(n => Number.isFinite(n) && n >= 0) && (!state.dash.length || state.dash.some(n => n > 0)));
      assert.ok(Number.isFinite(state.phase)); continue;
    }
    if (/^[012] [Jj]$/.test(op)) { requireIdle(); state[op[2] === 'J' ? 'cap' : 'join'] = Number(op[0]); continue; }
    if ((m = /^\/([\w@.]+) gs$/.exec(op))) {
      requireIdle(); assert.ok(Object.hasOwn(resources, m[1]), 'Unknown graphics resource.');
      const values = resources[m[1]]; assert.ok(Object.keys(values).every(k => ['fillOpacity', 'strokeOpacity'].includes(k)));
      assert.ok(Object.values(values).every(n => Number.isFinite(n) && n >= 0 && n <= 1)); Object.assign(state, values); continue;
    }
    if ((m = move.exec(op))) { assert.equal(pendingClip, false); segments.push({ kind: 'Move', end: point(m) }); }
    else if ((m = line.exec(op))) { assert.ok(segments.length > 0 && !pendingClip, 'Line without a current path.'); segments.push({ kind: 'Line', end: point(m) }); }
    else if ((m = cubic.exec(op))) { assert.ok(segments.length > 0 && !pendingClip, 'Cubic without a current path.'); segments.push({ kind: 'Cubic', a: point(m), b: point(m, 3), end: point(m, 5) }); }
    else if (op === 'h') { assert.ok(segments.length > 0 && !pendingClip); segments.push({ kind: 'Close' }); }
    else if (op === 'W' || op === 'W*') { assert.ok(segments.length > 0 && !pendingClip); pendingClip = op === 'W*' ? 'evenodd' : 'nonzero'; }
    else if (op === 'n') {
      if (pendingClip) {
        assert.ok(clips.length < 3); const clip = { index: clips.length, kind: 'clip', rule: pendingClip, segments, state: copyState() };
        clips.push(clip); records.push(clip); state.clips.push(clip.index);
      } else assert.equal(segments.length, 0, 'Unexpected discarded path.');
      segments = []; pendingClip = false;
    } else if (['S', 'B', 'B*', 'f', 'f*'].includes(op)) {
      assert.ok(origin && segments.length > 0 && !pendingClip && paints.length < 16, 'Invalid/incomplete paint.');
      const paint = { index: paints.length, kind: 'paint', stroke: ['S', 'B', 'B*'].includes(op), fill: op !== 'S',
        rule: op.endsWith('*') ? 'evenodd' : 'nonzero', segments, state: copyState() };
      paints.push(paint); records.push(paint); segments = [];
    } else assert.fail('Unsupported fixed PDF instruction: ' + op);
    assert.ok(segments.length <= 512, 'Path segment budget.');
  }
  requireIdle(); assert.equal(stack.length, 0); assert.ok(origin);
  assert.equal(paints.length, 16, 'Incomplete paint coverage.'); assert.equal(clips.length, 3, 'Incomplete clip coverage.');
  return { origin, paints, clips, records };
}

export function parseDashGeometryPdf(bytes) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length <= 1000000, 'PDF input limit.');
  const pdf = bytes.toString('latin1'); assert.ok(pdf.startsWith('%PDF-1.5'));
  const boxes = [...pdf.matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)]; assert.equal(boxes.length, 1);
  const mediaBox = boxes[0][1].trim().split(/\s+/).map(Number);
  assert.ok(mediaBox.length === 4 && mediaBox.every(Number.isFinite) && mediaBox[0] === 0 && mediaBox[1] === 0 && mediaBox[2] > 0 && mediaBox[3] > 0);
  const streams = [...pdf.matchAll(/(\d+) 0 obj\s*<<\s*\/Length (\d+)\s*\/Filter \/FlateDecode\s*>>\s*stream\r?\n/g)]; assert.equal(streams.length, 1);
  const m = streams[0], start = m.index + m[0].length, length = Number(m[2]);
  assert.ok(length > 0 && start + length <= bytes.length && /^\r?\nendstream/.test(pdf.slice(start + length)));
  const content = inflateSync(bytes.subarray(start, start + length), { maxOutputLength: 1000000 }).toString('ascii'), resources = {};
  for (const m of pdf.matchAll(/\/(pgf@[cC][aA][\d.]+)\s*<<\s*\/(ca|CA)\s+([\d.]+)\s*>>/g)) {
    assert.ok(!Object.hasOwn(resources, m[1])); const value = Number(m[3]); assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
    resources[m[1]] = { [m[2] === 'ca' ? 'fillOpacity' : 'strokeOpacity']: value };
  }
  const parsed = parseDashGeometryPdfContent(content, resources);
  return { ...parsed, mediaBox, content, resources, objectId: Number(m[1]), compressedLength: length };
}

// PGF's native record reader uses the same semantic normalization: empty
// consecutive moves and a final unpainted move do not add drawn segments.
// Original PDF operations remain intact for reconstruction and inspection.
export function normalizeDashGeometryPdfSegments(input) {
  const result = [];
  for (const segment of input) {
    if (segment.kind === 'Move' && result.at(-1)?.kind === 'Move') result.pop();
    result.push(segment);
  }
  if (result.at(-1)?.kind === 'Move') result.pop(); return result;
}

export function verifyDashGeometryPdf(parsed, native, styles) {
  const checks = [], records = native.metrics.pdf.records;
  assert.equal(parsed.records.length, records.length); assert.equal(styles.length, parsed.paints.length);
  function scalar(id, quantity, expected, observed, tolerance = 0, unit = 'integer') {
    const error = Math.abs(expected - observed); checks.push({ id, quantity, expected, observed, tolerance, unit, error, passed: Number.isFinite(error) && error <= tolerance });
  }
  function dimension(id, quantity, sourceSp, printedBp) {
    const converted = pgfPdfPoint(sourceSp); scalar(id, quantity, converted * 65536, Math.round(printedBp * 65536));
    Object.assign(checks.at(-1), { sourceSp, convertedBp: converted, printedBp, unit: 'converted scaled points' });
  }
  records.forEach((r, index) => {
    const p = parsed.records[index], id = r.id;
    const segments = normalizeDashGeometryPdfSegments(p.segments);
    assert.equal(p.kind === 'clip', r.actions === 'clip'); scalar(id, 'segment-count', r.segments.length, segments.length);
    r.segments.forEach((s, i) => {
      const actual = segments[i]; assert.ok(actual); assert.equal(actual.kind, s.kind, id + ' segment ' + i);
      for (const k of s.kind === 'Cubic' ? ['a', 'b', 'end'] : s.kind === 'Close' ? [] : ['end'])
        for (const axis of ['x', 'y']) dimension(id, 'segment.' + i + '.' + k + '.' + axis, s[k][axis], actual[k][axis]);
    });
    if (p.kind === 'clip') assert.equal(p.rule, 'nonzero', 'Unexpected fixed clip rule.');
    if (p.kind === 'paint') {
      const style = styles[p.index], state = p.state;
      dimension(id, 'width', r.widthSp, state.width); dimension(id, 'phase', r.phaseSp, state.phase);
      scalar(id, 'dash-count', r.lengthsSp.length, state.dash.length);
      r.lengthsSp.forEach((sp, i) => dimension(id, 'dash.' + i, sp, state.dash[i]));
      scalar(id, 'cap', { butt: 0, round: 1, square: 2 }[style.cap], state.cap);
      scalar(id, 'join', { miter: 0, round: 1, bevel: 2 }[style.join], state.join);
      scalar(id, 'miter', style.miter, state.miter); scalar(id, 'stroke-opacity', style.strokeOpacity, state.strokeOpacity);
      scalar(id, 'fill-opacity', style.fillOpacity, state.fillOpacity); scalar(id, 'stroke', Number(style.stroke !== 'none'), Number(p.stroke));
      scalar(id, 'fill', Number(style.fill !== 'none'), Number(p.fill));
      assert.equal(style.rule, p.rule); assert.deepEqual(style.clips, state.clips, id + ' inherited clips');
    }
  });
  const { page } = native.metrics.pdf, ptToBpSp = 72 / (72.27 * 65536);
  scalar('page', 'width', page.width * ptToBpSp, parsed.mediaBox[2], .000500000001, 'bp');
  scalar('page', 'height', page.height * ptToBpSp, parsed.mediaBox[3], .000500000001, 'bp');
  scalar('page', 'origin.x', native.metrics.pdfOriginCss.x * 3 / 4, parsed.origin.x, .000500000001, 'bp');
  scalar('page', 'origin.y', native.metrics.pdfOriginCss.y * 3 / 4, parsed.mediaBox[3] - parsed.origin.y, .001000000001, 'bp');
  return { passed: checks.every(c => c.passed), checks };
}

export function reconstructDashGeometryPdf(parsed, picture, originCss) {
  const printed = { x: parsed.origin.x * 4 / 3, y: (parsed.mediaBox[3] - parsed.origin.y) * 4 / 3 };
  const shift = { x: printed.x - originCss.x, y: printed.y - originCss.y };
  const data = p => p.segments.map(s => ({ Move: 'M', Line: 'L', Cubic: 'C', Close: 'Z' }[s.kind])
    + (s.kind === 'Close' ? '' : s.kind === 'Cubic' ? [s.a, s.b, s.end].map(p => p.x + ' ' + p.y).join(' ') : s.end.x + ' ' + s.end.y)).join(' ');
  const transform = 'matrix(' + 4 / 3 + ' 0 0 ' + -4 / 3 + ' ' + shift.x + ' ' + shift.y + ')';
  const defs = '<defs>' + parsed.clips.map(p => '<clipPath id="pdf-clip' + p.index + '" clipPathUnits="userSpaceOnUse"><path transform="' + transform + '" d="'
    + data(p) + '" clip-rule="' + p.rule + '"/></clipPath>').join('') + '</defs>';
  const paths = parsed.paints.map(p => {
    const s = p.state;
    let svg = '<path id="pdf-p' + p.index + '" transform="' + transform + '" d="' + data(p) + '" fill="' + (p.fill ? '#000' : 'none')
      + '" stroke="' + (p.stroke ? '#000' : 'none') + '" stroke-width="' + s.width + '" stroke-linecap="' + ['butt', 'round', 'square'][s.cap]
      + '" stroke-linejoin="' + ['miter', 'round', 'bevel'][s.join] + '" stroke-miterlimit="' + s.miter + '" stroke-opacity="' + s.strokeOpacity
      + '" fill-opacity="' + s.fillOpacity + '" fill-rule="' + p.rule + '"'
      + (s.dash.length ? ' stroke-dasharray="' + s.dash.join(' ') + '" stroke-dashoffset="' + s.phase + '"' : '') + '/>';
    for (const index of [...s.clips].reverse()) svg = '<g clip-path="url(#pdf-clip' + index + ')">' + svg + '</g>'; return svg;
  }).join('');
  const width = picture.maxX - picture.minX, height = picture.maxY - picture.minY;
  return { printedOriginCss: printed, nativeOriginCss: originCss, shift,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + 'px" height="' + height + 'px" viewBox="'
      + [picture.minX, picture.minY, width, height].join(' ') + '">' + defs + paths + '</svg>' };
}
