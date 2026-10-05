import assert from 'node:assert/strict';

export function verifyPdfNativeGeometry(text) {
  const parts = text.replaceAll('\r\n', '\n').split('\n--- Ordinary PDF oracle ---\n');
  assert.equal(parts.length, 2, 'Missing independent PDF log.');
  const paths = log => [...log.matchAll(/LOKAD-PATH-BEGIN([\s\S]*?)LOKAD-PATH-END/g)].map(m => m[1].replace(/\s+/g, ''));
  const svgPaths = paths(parts[0]), pdfPaths = paths(parts[1]);
  assert.ok(svgPaths.length > 0); assert.deepEqual(pdfPaths, svgPaths, 'SVG/PDF native path operations differ.');
  // Join TeX's wrapped lines, then isolate numeric records from engine chatter.
  for (const pattern of [/LOKAD-BOUNDSminx=([-\d.]+)pt;miny=([-\d.]+)pt;maxx=([-\d.]+)pt;maxy=([-\d.]+)pt/,
    /LOKAD-BOXwidth=([-\d.]+)pt;height=([-\d.]+)pt;depth=([-\d.]+)pt/,
    /LOKAD-ANCHOR-startx=([-\d.]+)pt;y=([-\d.]+)pt/,
    /LOKAD-ANCHOR-endx=([-\d.]+)pt;y=([-\d.]+)pt/]) {
    const records = parts.map(p => [...p.replace(/\s+/g, '').matchAll(new RegExp(pattern.source, 'g'))]);
    assert.ok(records.every(r => r.length === 1), 'Missing or duplicated native numeric record.');
    const values = records.map(r => r[0].slice(1));
    assert.ok(values.flat().every(v => Number.isFinite(Number(v))));
    assert.deepEqual(values[0], values[1], 'SVG/PDF native bounds/anchors differ.');
  }
  return { passed: true, pathRecords: svgPaths.length, boundsBoxAndExplicitAnchorsEqual: true };
}
