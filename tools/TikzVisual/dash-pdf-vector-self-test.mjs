import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { parseDashPdf, pgfPdfPoint, dashIntervals } from './dash-pdf-vector.mjs';

const bytes = await readFile(new URL('../../tests/Reference/Dashes/native/reference.pdf', import.meta.url)), parsed = parseDashPdf(bytes);
assert.equal(parsed.records[2].dash.length, 2); assert.equal(parsed.records[19].cap, 1);
assert.equal(parsed.records[21].dash[2], 1.99255); assert.equal(parsed.records[22].dash[2], .3985);
assert.equal(parsed.records[38].width, 2.98883); assert.equal(parsed.records[38].dash[0], 1.99255);
assert.equal(parsed.records[39].dash[0], 2.98883);
function pdf(content) {
  const packed = deflateSync(Buffer.from(content));
  return Buffer.concat([Buffer.from('%PDF-1.5\n/MediaBox [0 0 597.758 797.011]\n6 0 obj\n<<\n/Length ' + packed.length + '\n/Filter /FlateDecode\n>>\nstream\n'),
    packed, Buffer.from('\nendstream\nendobj\n')]);
}
const negatives = [
  parsed.content.replace('69.73938 -27.89575 l', '68.0 -27.0 l'),
  parsed.content.replace('0.0 0.0 m', '0.0 0.0 l'),
  parsed.content.replace('0.3985 w', '-1 w'),
  parsed.content.replace('[ 2.98883 1.99255 ]', '[ 0 0 ]'),
  parsed.content.replace('1 J', '3 J'),
  parsed.content.replace('1 0 0 1 135.263 672.01 cm', '2 0 0 2 135.263 672.01 cm'),
  parsed.content.replace('0 g 0 G', '1 g 0 G'),
  parsed.content.replace('0.0 0.0 m', '0.0 0.0 m\n0.0 0.0 m'),
  parsed.content.replace('69.73938 0.0 l', '0.0 0.0 l'),
  parsed.content.replace('S \nQ', 'n \nQ'),
  parsed.content + 'Q\n',
  'q\n' + parsed.content,
  parsed.content + 'BX\n',
  parsed.content.replace('69.73938 0.0 l', '9'.repeat(400) + ' 0.0 l'),
  parsed.content.replace('[ 2.98883 1.99255 ]', '[ ' + '9'.repeat(400) + ' 1 ]'),
  parsed.content.replace('[ 2.98883 1.99255 ] 0.0 d', '[ 2.98883 1.99255 ] ' + '9'.repeat(400) + ' d'),
  'q\n'.repeat(65) + parsed.content
];
for (const content of negatives) assert.throws(() => parseDashPdf(pdf(content)));
assert.throws(() => parseDashPdf(Buffer.alloc(1000001)));
assert.throws(() => parseDashPdf(bytes.subarray(0, 300)));
assert.throws(() => parseDashPdf(pdf('x'.repeat(1000001))));
assert.throws(() => parseDashPdf(Buffer.from(bytes.toString('latin1').replace('/Length 713', '/Length 714'), 'latin1')));
assert.throws(() => parseDashPdf(Buffer.from(bytes.toString('latin1').replace('/FlateDecode', '/OtherDecode'), 'latin1')));
assert.equal(pgfPdfPoint(1), 0); assert.equal(pgfPdfPoint(196608), 195876 / 65536);
assert.equal(Math.round(3.9851 * 65536), pgfPdfPoint(4 * 65536) * 65536);
assert.throws(() => pgfPdfPoint(Infinity));
assert.deepEqual(dashIntervals(10, [3, 2], 0), [{ start: 0, end: 3 }, { start: 5, end: 8 }]);
assert.deepEqual(dashIntervals(10, [3], 2), [{ start: 0, end: 1 }, { start: 4, end: 7 }]);
assert.deepEqual(dashIntervals(10, [0, 4], 0), [{ start: 0, end: 0 }, { start: 4, end: 4 }, { start: 8, end: 8 }]);
assert.deepEqual(dashIntervals(5, [1, 2], -1), [{ start: 1, end: 2 }, { start: 4, end: 5 }]);
assert.throws(() => dashIntervals(10, [0, 0], 0));
assert.throws(() => dashIntervals(10, [-1, 2], 0));
const native = dashIntervals(70 * 65536, [3 * 65536, 2 * 65536], 0);
const printed = dashIntervals(6973938, [298883, 199255], 0);
assert.equal(native.length, 14); assert.equal(printed.length, 15);
assert.deepEqual(printed.at(-1), { start: 6973932, end: 6973938 });
console.log('Fixed PDF vector controls pass: 40 paints, 22 malformed PDFs, finite conversion, odd/zero/phase intervals and terminal fragment.');
