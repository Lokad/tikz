// Fixed geometry-only reference diagnostics, not a general PDF interpreter.
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';

export function parseDashPdf(bytes) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length <= 1000000, 'PDF input limit.');
  const pdf = bytes.toString('latin1');
  assert.ok(pdf.startsWith('%PDF-1.5'), 'Unexpected fixed PDF version.');
  const boxes = [...pdf.matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)];
  assert.equal(boxes.length, 1, 'Missing/duplicate fixed page box.');
  const mediaBox = boxes[0][1].trim().split(/\s+/).map(Number);
  assert.ok(mediaBox.length === 4 && mediaBox.every(Number.isFinite) && mediaBox[0] === 0 && mediaBox[1] === 0
    && mediaBox[2] > 0 && mediaBox[3] > 0, 'Invalid fixed page box.');
  const streams = [...pdf.matchAll(/(\d+) 0 obj\s*<<\s*\/Length (\d+)\s*\/Filter \/FlateDecode\s*>>\s*stream\r?\n/g)];
  assert.equal(streams.length, 1, 'Expected one fixed Flate drawing stream.');
  const m = streams[0], start = m.index + m[0].length, length = Number(m[2]);
  assert.ok(length > 0 && length < bytes.length && /^\r?\nendstream/.test(pdf.slice(start + length)), 'Invalid stream length.');
  const content = inflateSync(bytes.subarray(start, start + length), { maxOutputLength: 1000000 }).toString('ascii');
  const number = '([+-]?(?:\\d+(?:\\.\\d{1,5})?|\\.\\d{1,5}))';
  const grammar = text => new RegExp('^' + text + '$');
  const move = grammar(number + ' ' + number + ' m'), lineTo = grammar(number + ' ' + number + ' l');
  const width = grammar(number + ' w'), dash = grammar('\\[\\s*([^\\]]*)\\s*\\] ' + number + ' d');
  const matrix = grammar('1 0 0 1 ' + number + ' ' + number + ' cm');
  let state = { width: 1, dash: [], phase: 0, cap: 0 }, origin = null, drawing = null;
  const stack = [], records = [];
  for (const line of content.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
    let match;
    if (['0 g', '0 G', '0 g 0 G', 'n'].includes(line)) { assert.equal(drawing, null, 'Unexpected active path.'); continue; }
    if (line === 'q') { assert.equal(drawing, null); assert.ok(stack.length < 64, 'Graphics stack budget.'); stack.push({ ...state, dash: [...state.dash] }); continue; }
    if (line === 'Q') { assert.equal(drawing, null); assert.ok(stack.length > 0, 'Unbalanced PDF restore.'); state = stack.pop(); continue; }
    if ((match = matrix.exec(line))) { assert.equal(origin, null, 'Multiple page origins.'); assert.equal(stack.length, 0); origin = { x: Number(match[1]), y: Number(match[2]) }; assert.ok(Object.values(origin).every(Number.isFinite)); continue; }
    if ((match = width.exec(line))) { state.width = Number(match[1]); assert.ok(state.width > 0 && state.width < 1000); continue; }
    if ((match = dash.exec(line))) {
      const values = match[1].trim(); assert.ok(values === '' || values.split(/\s+/).every(v => grammar(number).test(v)), 'Invalid dash numbers.');
      state.dash = values === '' ? [] : values.split(/\s+/).map(Number); state.phase = Number(match[2]);
      assert.ok(Number.isFinite(state.phase) && state.dash.length <= 64 && state.dash.every(n => Number.isFinite(n) && n >= 0)
        && (!state.dash.length || state.dash.some(n => n > 0)), 'Invalid PDF dash array.');
      continue;
    }
    if (/^[012] J$/.test(line)) { state.cap = Number(line[0]); continue; }
    if ((match = move.exec(line))) { assert.equal(drawing, null, 'Multiple path moves.'); drawing = { start: { x: Number(match[1]), y: Number(match[2]) }, end: null }; continue; }
    if ((match = lineTo.exec(line))) { assert.ok(drawing && !drawing.end, 'Unexpected line segment.'); drawing.end = { x: Number(match[1]), y: Number(match[2]) }; continue; }
    if (line === 'S') {
      assert.ok(origin && drawing?.end && [...Object.values(drawing.start), ...Object.values(drawing.end)].every(Number.isFinite)
        && drawing.start.x === 0 && drawing.end.x > 0 && drawing.start.y === drawing.end.y, 'Unexpected fixed line topology.');
      assert.ok(records.length < 40, 'Paint budget.');
      records.push({ ...state, dash: [...state.dash], ...drawing }); drawing = null; continue;
    }
    assert.fail('Unsupported fixed PDF instruction: ' + line);
  }
  assert.equal(drawing, null); assert.equal(stack.length, 0); assert.ok(origin); assert.equal(records.length, 40, 'Incomplete fixed PDF paints.');
  return { mediaBox, origin, records, content, objectId: Number(m[1]), compressedLength: length };
}

// TeX parses 0.99627 as 65292/65536; multiplication truncates scaled points.
export function pgfPdfPoint(sp) {
  assert.ok(Number.isSafeInteger(sp) && Math.abs(sp) <= 1073741823);
  return Math.trunc(sp * 65292 / 65536) / 65536;
}

// Work on exact integer grids (native sp or printed PDF's 1e-5 bp), so a
// floating-point remainder cannot invent an endpoint fragment.
export function dashIntervals(length, dash, phase) {
  assert.ok(Number.isSafeInteger(length) && length > 0 && Number.isSafeInteger(phase));
  assert.ok(dash.length <= 64 && dash.every(n => Number.isSafeInteger(n) && n >= 0));
  if (!dash.length) return [{ start: 0, end: length }];
  const pattern = dash.length % 2 ? [...dash, ...dash] : [...dash], cycle = pattern.reduce((a, b) => a + b, 0);
  assert.ok(cycle > 0 && Number.isSafeInteger(cycle));
  let offset = ((phase % cycle) + cycle) % cycle, index = 0, position = 0;
  for (let i = 0; i <= pattern.length; i++) {
    const value = pattern[index];
    if (offset < value || (offset === 0 && value === 0)) break;
    offset -= value; index = (index + 1) % pattern.length;
  }
  const intervals = [];
  for (let count = 0; position < length; count++) {
    assert.ok(count < 10000, 'Dash expansion budget.');
    const available = pattern[index] - offset, end = Math.min(length, position + available);
    if (index % 2 === 0) intervals.push({ start: position, end });
    if (end === length) break;
    position = end; offset = 0; index = (index + 1) % pattern.length;
  }
  return intervals;
}
