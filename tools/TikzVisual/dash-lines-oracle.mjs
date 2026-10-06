// Independent forty-line reconstruction. No converter or production resource.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { root, sha256 } from './shape-oracle-bundle.mjs';
import { shapePdfRasterRectangle } from './shape-pdf-camera.mjs';
import { pgfPdfPoint } from './dash-pdf-vector.mjs';

export async function readDashLinesNative(read = readFile) {
  const folder = path.join(root, 'tests/Reference/Dashes/native'), snapshotBytes = await read(path.join(root, 'tests/Reference/Dashes/snapshot.json'));
  const snapshot = JSON.parse(snapshotBytes); assert.equal(snapshot.id, 'pgf-3.1.11a-native-dash-v1');
  for (const [p, h] of Object.entries(snapshot.sourceHashes)) assert.equal(sha256(await read(path.join(root, p))), h, 'Changed line source: ' + p);
  for (const [p, h] of Object.entries(snapshot.artifacts)) { assert.equal(path.basename(p), p); assert.equal(sha256(await read(path.join(folder, p))), h, 'Changed line artifact: ' + p); }
  const metricsBytes = await read(path.join(folder, 'metrics.json')), referenceBytes = await read(path.join(folder, 'reference.svg')), metrics = JSON.parse(metricsBytes);
  assert.equal(metrics.converterInvoked, false); assert.equal(metrics.approvedImagePolicy, false); assert.deepEqual(metrics.svg.records, metrics.pdf.records);
  assert.equal(metrics.svg.records.length, 40); assert.equal(new Set(metrics.svg.records.map(r => r.id)).size, 40);
  return { snapshot, snapshotBytes, snapshotSha256: sha256(snapshotBytes), metrics, metricsBytes, reference: referenceBytes.toString('utf8'), referenceBytes };
}
export async function reconstructDashLines(renderer, native) {
  const lines = await renderer.page.evaluate(({ reference, records }) => {
    const doc = new DOMParser().parseFromString(reference, 'image/svg+xml'), paths = [...doc.querySelectorAll('path')];
    if (doc.querySelector('parsererror') || paths.length !== 40) throw new Error('Incomplete forty-line SVG.');
    const attr = (p, k, fallback) => { for (let e = p; e; e = e.parentElement) if (e.hasAttribute(k)) return e.getAttribute(k); return fallback; };
    return paths.map((p, i) => {
      const m = /^M([+-]?(?:\d+(?:\.\d*)?|\.\d+))[ ,]*([+-]?(?:\d+(?:\.\d*)?|\.\d+))H([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/.exec(p.getAttribute('d'));
      if (!m || p.hasAttribute('transform')) throw new Error('Unsupported fixed line geometry.');
      const start = { x: Number(m[1]), y: Number(m[2]) }, end = { x: Number(m[3]), y: Number(m[2]) };
      for (const n of [...Object.values(start), ...Object.values(end)]) if (!Number.isFinite(n) || Math.abs(Math.round(n * 65536) / 65536 - n) > 1e-10) throw new Error('Line coordinate is not native scaled points.');
      const dash = attr(p, 'stroke-dasharray', 'none');
      return { index: i, id: records[i].id, start, end, driverWidth: Number(attr(p, 'stroke-width', '1')), cap: attr(p, 'stroke-linecap', 'butt'),
        join: attr(p, 'stroke-linejoin', 'miter'), miter: Number(attr(p, 'stroke-miterlimit', '4')),
        driverDash: dash === 'none' ? [] : dash.split(/[ ,]+/).map(Number), driverPhase: Number(attr(p, 'stroke-dashoffset', '0')),
        fill: attr(p, 'fill', '#000'), stroke: attr(p, 'stroke', '#000') };
    });
  }, { reference: native.reference, records: native.metrics.svg.records });
  const spToCss = 96 / (72.27 * 65536), ptToCss = 96 / 72.27, records = native.metrics.svg.records, b = native.metrics.svg.bounds;
  const picture = { minX: b.minX * spToCss, minY: -b.maxY * spToCss, maxX: b.maxX * spToCss, maxY: -b.minY * spToCss };
  const camera = { x: Math.floor(picture.minX - 4), y: Math.floor(picture.minY - 4), width: Math.ceil(picture.maxX + 4) - Math.floor(picture.minX - 4),
    height: Math.ceil(picture.maxY + 4) - Math.floor(picture.minY - 4) };
  const penBounds = widthSource => {
    const q = lines.map((l, i) => { const radius = (widthSource === 'native' ? records[i].widthSp / 65536 : l.driverWidth) * ptToCss / 2;
      return { minX: l.start.x * ptToCss - radius, maxX: l.end.x * ptToCss + radius, minY: -l.start.y * ptToCss - radius, maxY: -l.start.y * ptToCss + radius }; });
    return Object.fromEntries(['minX', 'minY', 'maxX', 'maxY'].map(k => [k, Math[k.startsWith('min') ? 'min' : 'max'](...q.map(b => b[k]))]));
  };
  const roots = [{ name: 'native-box', picture }, { name: 'printed-pen-hull', picture: penBounds('driver') }], rootChecks = [];
  for (const key of ['minX', 'minY', 'maxX', 'maxY']) assert.ok(Math.abs(penBounds('native')[key] - picture[key]) <= 1e-9);
  for (const [key, actual] of Object.entries(roots[1].picture)) {
    const errorSp = Math.abs(actual - picture[key]) / spToCss; assert.ok(errorSp <= .5 + 1e-7); rootChecks.push({ key, errorSp, limitSp: .5, passed: true });
  }
  const regions = lines.map((l, i) => {
    assert.equal(l.fill, 'none'); assert.equal(l.stroke, '#000'); assert.ok(['butt', 'round', 'square'].includes(l.cap));
    assert.equal(l.join, 'miter'); assert.equal(l.miter, 10);
    assert.ok(Number.isFinite(l.driverWidth) && l.driverWidth > 0);
    assert.equal(Math.round(l.driverWidth * 65536), records[i].widthSp);
    assert.deepEqual(l.driverDash.map(v => Math.round(v * 65536)), records[i].lengthsSp);
    assert.equal(Math.round(l.driverPhase * 65536), records[i].phaseSp);
    const radius = Math.max(records[i].widthSp * spToCss, l.driverWidth * ptToCss) / 2;
    const x = Math.floor(l.start.x * ptToCss - radius - camera.x - 3), y = Math.floor(-l.start.y * ptToCss - radius - camera.y - 3);
    return { id: 'path-' + i, nodeId: null, kind: 'path', caseId: l.id, rectangle: { x, y,
      width: Math.ceil(l.end.x * ptToCss + radius - camera.x + 3) - x, height: Math.ceil(-l.start.y * ptToCss + radius - camera.y + 3) - y } };
  });
  const n = v => Number(v.toFixed(6)), representations = [], serialization = [];
  for (const r of roots) for (const widthSource of ['driver', 'native']) for (const placement of ['group', 'elements']) {
    const name = r.name + '-' + widthSource + '-width-' + placement;
    const short = (value, id) => {
      const sp = Math.round(value * 65536); let chosen;
      for (let digits = 0; digits <= 5; digits++) { const v = Number(value.toFixed(digits)); if (Math.round(v * 65536) === sp) { chosen = v; break; } }
      assert.notEqual(chosen, undefined); serialization.push({ representation: name, id, expectedSp: sp, serialized: chosen, recoveredSp: Math.round(chosen * 65536), passed: true }); return chosen;
    };
    const scale = placement === 'elements' ? Number(ptToCss.toPrecision(15)) : ptToCss, transform = 'scale(' + scale + ' ' + -scale + ')';
    const body = lines.map((l, i) => '<path id="native-p' + i + '"' + (placement === 'elements' ? ' transform="' + transform + '"' : '')
      + ' d="M' + short(l.start.x, l.id + '.x') + ' ' + short(l.start.y, l.id + '.y') + 'H' + short(l.end.x, l.id + '.end')
      + '" fill="none" stroke="#000" stroke-width="' + short(widthSource === 'driver' ? l.driverWidth : records[i].widthSp / 65536, l.id + '.width')
      + '" stroke-linecap="' + l.cap + '" stroke-linejoin="' + l.join + '" stroke-miterlimit="' + l.miter + '"'
      + (records[i].lengthsSp.length ? ' stroke-dasharray="' + records[i].lengthsSp.map((s, j) => short(s / 65536, l.id + '.dash.' + j)).join(' ')
        + '" stroke-dashoffset="' + short(records[i].phaseSp / 65536, l.id + '.phase') + '"' : '') + '/>').join('');
    const b = r.picture;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + n(b.maxX - b.minX) + 'px" height="' + n(b.maxY - b.minY) + 'px" viewBox="'
      + [b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY].map(n).join(' ') + '">' + (placement === 'group' ? '<g transform="' + transform + '">' + body + '</g>' : body) + '</svg>';
    representations.push({ mode: name, svg, sha256: sha256(svg), widthSource, placement, root: r.name });
  }
  return { lines, picture, camera, roots, rootChecks, regions, representations, serialization };
}
export function verifyDashLinesPdf(parsed, native, lines) {
  assert.equal(parsed.records.length, 40); const checks = [];
  const scalar = (id, quantity, expected, observed, tolerance = 0) => { const error = Math.abs(expected - observed); checks.push({ id, quantity, expected, observed, tolerance, error, passed: Number.isFinite(error) && error <= tolerance }); };
  const dimension = (id, quantity, sp, printed) => scalar(id, quantity, pgfPdfPoint(sp) * 65536, Math.round(printed * 65536));
  for (const [i, p] of parsed.records.entries()) {
    const r = native.metrics.pdf.records[i], l = lines[i]; scalar(r.id, 'dash-count', r.lengthsSp.length, p.dash.length);
    dimension(r.id, 'width', r.widthSp, p.width); dimension(r.id, 'phase', r.phaseSp, p.phase);
    r.lengthsSp.forEach((sp, j) => dimension(r.id, 'dash.' + j, sp, p.dash[j]));
    scalar(r.id, 'cap', { butt: 0, round: 1, square: 2 }[l.cap], p.cap);
    for (const end of ['start', 'end']) for (const axis of ['x', 'y']) dimension(r.id, end + '.' + axis, Math.round(l[end][axis] * 65536), p[end][axis]);
  }
  const page = native.metrics.pdf.page, f = 72 / (72.27 * 65536);
  scalar('page', 'width', page.width * f, parsed.mediaBox[2], .000500000001); scalar('page', 'height', page.height * f, parsed.mediaBox[3], .000500000001);
  scalar('page', 'origin.x', native.metrics.pdfOriginCss.x * 3 / 4, parsed.origin.x, .000500000001);
  scalar('page', 'origin.y', native.metrics.pdfOriginCss.y * 3 / 4, parsed.mediaBox[3] - parsed.origin.y, .001000000001);
  assert.equal(checks.length, 444); return { passed: checks.every(c => c.passed), checks };
}
export function dashLinesPdfCamera(native, reconstruction) {
  const f = 96 / (72.27 * 65536), { page, bounds: b, box } = native.metrics.pdf;
  assert.equal(box.depth, 0);
  const origin = { x: (page.x - b.minX) * f, y: (page.height - page.baselineY + b.minY) * f }; assert.deepEqual(origin, native.metrics.pdfOriginCss);
  const camera = { origin, picture: reconstruction.picture, physicalPage: { width: page.width * f, height: page.height * f },
    rasterSizes: Object.fromEntries([1, 4].map(s => [s + 'x', { width: Math.ceil(page.width * f * s), height: Math.ceil(page.height * f * s) }])) };
  const regions = [{ id: 'whole-picture', nodeId: null, kind: 'picture', rectangle: reconstruction.camera }, ...reconstruction.regions.map(r => ({ ...r,
    rectangle: { ...r.rectangle, x: r.rectangle.x + reconstruction.camera.x, y: r.rectangle.y + reconstruction.camera.y } }))]
    .map(r => ({ ...r, rasterRectangles: Object.fromEntries([1, 4].map(s => [s + 'x', shapePdfRasterRectangle(r.rectangle, camera, s)])) }));
  return { camera, regions };
}
