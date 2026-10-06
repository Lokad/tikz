// Oracle-only diagnostics for the fixed forty-line PDF, never candidate limits.
import assert from 'node:assert/strict';
import { parseDashPdf, dashIntervals } from './dash-pdf-vector.mjs';
import { writeFixedDiagnosticPdf } from './fixed-pdf-diagnostics.mjs';

const grid = value => {
  const n = Math.round(value * 100000);
  assert.ok(Number.isSafeInteger(n) && Math.abs(n / 100000 - value) <= 1e-10);
  return n;
};
const intervals = p => dashIntervals(grid(p.end.x - p.start.x), p.dash.map(grid), grid(p.phase));

export function dashLinesPdfDiagnostics(parsed) {
  assert.equal(parsed.records.length, 40);
  const rewrites = [28, 29, 31].map(index => {
    const p = parsed.records[index], pattern = p.dash.map(grid), phase = grid(p.phase);
    const replacement = index === 31 ? pattern : [...pattern, ...pattern];
    if (index === 31) { assert.equal(pattern.length, 4); assert.ok(phase < 0); }
    else { assert.equal(pattern.length % 2, 1); assert.equal(phase, 0); }
    const period = replacement.reduce((a, b) => a + b, 0);
    const positive = ((phase % period) + period) % period;
    const matches = [...new Set(parsed.content.split(/\r?\n/).map(l => l.trim()).filter(line => {
      const m = /^\[\s*([^\]]*)\s*\] ([+-]?(?:\d+(?:\.\d*)?|\.\d+)) d$/.exec(line);
      return m && Number(m[2]) === p.phase && JSON.stringify(m[1].trim().split(/\s+/).map(Number)) === JSON.stringify(p.dash);
    }))];
    assert.equal(matches.length, 1, 'Ambiguous equivalent numeric dash command.');
    const from = matches[0];
    const to = '[' + replacement.map(n => n / 100000).join(' ') + '] ' + positive / 100000 + ' d';
    const occurrences = parsed.content.split(from).length - 1;
    assert.ok(occurrences >= 1 && occurrences <= 8, 'Missing/ambiguous fixed dash command.');
    return { index, name: { 28: 'odd-explicit-even', 29: 'single-explicit-even', 31: 'negative-positive-phase' }[index], from, to, occurrences };
  });
  const definitions = [{ name: 'original-instructions', changes: [] },
    ...rewrites.map(r => ({ name: r.name, changes: [r] })), { name: 'all-equivalent-spellings', changes: rewrites }];
  return definitions.map(d => {
    let content = parsed.content;
    for (const r of d.changes) content = content.replaceAll(r.from, r.to);
    const bytes = writeFixedDiagnosticPdf(parsed.mediaBox, content), restored = parseDashPdf(bytes);
    assert.equal(restored.content, content); assert.deepEqual(restored.mediaBox, parsed.mediaBox); assert.deepEqual(restored.origin, parsed.origin);
    const changedIndices = [], intervalChecks = [];
    for (const [index, expected] of parsed.records.entries()) {
      const observed = restored.records[index];
      if (JSON.stringify(expected) !== JSON.stringify(observed)) changedIndices.push(index);
      assert.deepEqual({ ...observed, dash: expected.dash, phase: expected.phase }, expected, 'Changed non-dash instructions.');
      const original = intervals(expected), equivalent = intervals(observed);
      assert.deepEqual(equivalent, original, 'Changed exact printed-PDF intervals.');
      intervalChecks.push({ index, intervalCount: original.length, passed: true });
    }
    assert.deepEqual(changedIndices, d.changes.map(r => r.index));
    return { name: d.name, bytes, content, rewrites: d.changes, changedIndices, intervalChecks };
  });
}

// Printed origin is an independent PDF serialization measurement. The native
// page camera stays fixed; no image is fitted, translated or rescaled to match.
export function dashLinesPdfInstructionSvg(parsed, camera) {
  const printedOrigin = { x: parsed.origin.x * 4 / 3, y: (parsed.mediaBox[3] - parsed.origin.y) * 4 / 3 };
  const translation = { x: printedOrigin.x - camera.origin.x, y: printedOrigin.y - camera.origin.y };
  const b = camera.picture, width = b.maxX - b.minX, height = b.maxY - b.minY;
  const body = parsed.records.map((p, i) => '<path id="pdf-p' + i + '" d="M' + p.start.x * 4 / 3 + ' ' + -p.start.y * 4 / 3 + 'H' + p.end.x * 4 / 3
    + '" fill="none" stroke="#000" stroke-width="' + p.width * 4 / 3 + '" stroke-linecap="' + ['butt', 'round', 'square'][p.cap] + '"'
    + (p.dash.length ? ' stroke-dasharray="' + p.dash.map(n => n * 4 / 3).join(' ') + '" stroke-dashoffset="' + p.phase * 4 / 3 + '"' : '') + '/>').join('');
  return { printedOrigin, translation, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + 'px" height="' + height + 'px" viewBox="'
    + [b.minX, b.minY, width, height].join(' ') + '"><g transform="translate(' + translation.x + ' ' + translation.y + ')">' + body + '</g></svg>' };
}
