// Bounded development PDF wrapper for already decoded trusted instructions.
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
export function writeFixedDiagnosticPdf(mediaBox, content) {
  assert.deepEqual(mediaBox.slice(0, 2), [0, 0]); assert.equal(mediaBox.length, 4);
  assert.ok(mediaBox.every(n => Number.isFinite(n) && n >= 0 && n <= 10000));
  assert.ok(typeof content === 'string' && content.length <= 1000000 && /^[\x09\x0a\x0d\x20-\x7e]*$/.test(content));
  const data = deflateSync(Buffer.from(content, 'ascii'));
  const objects = [Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'), Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [' + mediaBox.join(' ') + '] /Resources << >> /Contents 4 0 R >>'),
    Buffer.concat([Buffer.from('<< /Length ' + data.length + ' /Filter /FlateDecode >>\nstream\n'), data, Buffer.from('\nendstream')])];
  const parts = [Buffer.from('%PDF-1.5\n')], offsets = [0]; let size = parts[0].length;
  objects.forEach((body, i) => { offsets.push(size); const b = Buffer.concat([Buffer.from((i + 1) + ' 0 obj\n'), body, Buffer.from('\nendobj\n')]); parts.push(b); size += b.length; });
  parts.push(Buffer.from('xref\n0 5\n0000000000 65535 f \n' + offsets.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')
    + 'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n' + size + '\n%%EOF\n'));
  return Buffer.concat(parts);
}
