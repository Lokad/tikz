// Independent reconstruction from original PGF records and original SVG paint.
// This module never reads a candidate, production assembly or candidate bounds.
import assert from 'node:assert/strict';

export async function reconstructDashGeometryPrimary(renderer, { metrics, reference }) {
  assert.equal(metrics.converterInvoked, false);
  assert.equal(metrics.approvedImagePolicy, false);
  assert.deepEqual(metrics.svg.records, metrics.pdf.records);
  const paints = metrics.svg.records.filter(r => r.actions !== 'clip'), clips = metrics.svg.records.filter(r => r.actions === 'clip');
  assert.equal(paints.length, 16); assert.equal(clips.length, 3);
    const styles = await renderer.page.evaluate(reference => {
      const doc = new DOMParser().parseFromString(reference, 'image/svg+xml'), paths = [...doc.querySelectorAll('path')].filter(p => !p.closest('defs,clipPath'));
      const clips = [...doc.querySelectorAll('clipPath')]; if (paths.length !== 16 || clips.length !== 3) throw new Error('Incomplete source paint/clip coverage.');
      const attr = (p, k, fallback) => { for (let e = p; e; e = e.parentElement) if (e.hasAttribute(k)) return e.getAttribute(k); return fallback; };
      return paths.map(p => ({ widthPt: Number(attr(p, 'stroke-width', '1')), cap: attr(p, 'stroke-linecap', 'butt'), join: attr(p, 'stroke-linejoin', 'miter'),
        stroke: attr(p, 'stroke', '#000'), fill: attr(p, 'fill', '#000'), miter: Number(attr(p, 'stroke-miterlimit', '4')),
        strokeOpacity: Number(attr(p, 'stroke-opacity', '1')), fillOpacity: Number(attr(p, 'fill-opacity', '1')),
        rule: attr(p, 'fill-rule', 'nonzero'), clips: [...(function* () { for (let e = p; e; e = e.parentElement) yield e; })()].reverse()
          .filter(e => e.hasAttribute('clip-path')).map(e => {
            const m = /^url\(#([-\w]+)\)$/.exec(e.getAttribute('clip-path')); if (!m) throw new Error('Unexpected source clip.');
            const i = clips.findIndex(c => c.id === m[1]); if (i < 0) throw new Error('Unknown source clip.'); return i;
          }) }));
    }, reference);
    const spToCss = 96 / (72.27 * 65536), b = metrics.svg.bounds;
    const picture = { minX: b.minX * spToCss, minY: -b.maxY * spToCss, maxX: b.maxX * spToCss, maxY: -b.minY * spToCss };
    const camera = { x: Math.floor(picture.minX - 4), y: Math.floor(picture.minY - 4), width: 0, height: 0 };
    camera.width = Math.ceil(picture.maxX + 4) - camera.x; camera.height = Math.ceil(picture.maxY + 4) - camera.y;
    const n = x => Number(x.toFixed(6));
    function bounds(r) {
      const points = r.segments.flatMap(s => s.kind === 'Cubic' ? [s.end, s.a, s.b] : [s.end]);
      return { minX: Math.min(...points.map(p => p.x * spToCss)), maxX: Math.max(...points.map(p => p.x * spToCss)),
        minY: Math.min(...points.map(p => -p.y * spToCss)), maxY: Math.max(...points.map(p => -p.y * spToCss)) };
    }
    const regions = paints.map((p, i) => {
      const box = bounds(p), radius = Math.max(p.widthSp * spToCss, styles[i].widthPt * 96 / 72.27) / 2;
      box.minX -= radius; box.maxX += radius; box.minY -= radius; box.maxY += radius;
      for (const j of styles[i].clips) { const c = bounds(clips[j]); box.minX = Math.max(box.minX, c.minX); box.maxX = Math.min(box.maxX, c.maxX);
        box.minY = Math.max(box.minY, c.minY); box.maxY = Math.min(box.maxY, c.maxY); }
      const x = Math.max(0, Math.floor(box.minX - camera.x - 3)), y = Math.max(0, Math.floor(box.minY - camera.y - 3));
      return { id: 'path-' + i, nodeId: null, kind: 'path', caseId: p.id, rectangle: { x, y, width: Math.min(camera.width, Math.ceil(box.maxX - camera.x + 3)) - x,
        height: Math.min(camera.height, Math.ceil(box.maxY - camera.y + 3)) - y } };
    });
    assert.ok(regions.every(r => r.rectangle.width > 0 && r.rectangle.height > 0));
    // Picture registration comes from native PGF bounds. The second root is
    // independently reconstructed from native control hulls and original
    // printed pen widths, excluding paints suppressed by native clipping.
    const contributors = paints.map((p, i) => ({ p, i })).filter(({ i }) => styles[i].clips.length === 0);
    const envelopes = contributors.map(({ p, i }) => {
      const h = bounds(p), r = styles[i].widthPt * 96 / 72.27 / 2;
      return { minX: h.minX - r, minY: h.minY - r, maxX: h.maxX + r, maxY: h.maxY + r };
    });
    const printedPicture = { minX: Math.min(...envelopes.map(b => b.minX)), minY: Math.min(...envelopes.map(b => b.minY)),
      maxX: Math.max(...envelopes.map(b => b.maxX)), maxY: Math.max(...envelopes.map(b => b.maxY)) };
    const rootChecks = Object.keys(picture).map(k => ({ quantity: k, native: picture[k], printedPen: printedPicture[k],
      error: Math.abs(picture[k] - printedPicture[k]), limit: .5 * spToCss, passed: Math.abs(picture[k] - printedPicture[k]) <= .5 * spToCss }));
    for (const [quantity, lo, hi] of [['width', 'minX', 'maxX'], ['height', 'minY', 'maxY']]) {
      const native = picture[hi] - picture[lo], printedPen = printedPicture[hi] - printedPicture[lo], error = Math.abs(native - printedPen);
      rootChecks.push({ quantity, native, printedPen, error, limit: .5 * spToCss, passed: error <= .5 * spToCss });
    }
    assert.ok(rootChecks.every(c => c.passed));
    const roots = [{ name: 'native-box', picture }, { name: 'printed-pen-hull', picture: printedPicture }], serialization = [], representations = [];
    for (const declared of roots) for (const widthSource of ['driver', 'native']) for (const transformPlacement of ['group', 'elements']) {
      const digits = 'short', name = declared.name + '-' + widthSource + '-width-' + transformPlacement;
      const physicalScale = transformPlacement === 'group' ? 96 / 72.27 : Number((96 / 72.27).toPrecision(15));
      assert.ok(Math.abs(physicalScale - 96 / 72.27) <= 1e-14);
      const physicalTransform = 'scale(' + physicalScale + ' ' + -physicalScale + ')';
      const elementTransform = transformPlacement === 'elements' ? ' transform="' + physicalTransform + '"' : '';
      const numeric = (value, id) => {
        let serialized;
        if (digits === 'short') {
          const sp = Math.round(value * 65536);
          for (let places = 0; places <= 5; places++) {
            const candidate = Number(value.toFixed(places));
            if (Math.round(candidate * 65536) === sp) { serialized = candidate; break; }
          }
          assert.notEqual(serialized, undefined, 'No decimal recovering the native scaled point.');
        } else serialized = Number(value.toFixed(digits));
        const error = Math.abs(value - serialized), limit = (digits === 'short' ? .5 / 65536 : .5 * 10 ** -digits) + 1e-10;
        serialization.push({ representation: name, id, expected: value, serialized, units: 'TeX points', error, limit, passed: Number.isFinite(error) && error <= limit });
        assert.ok(Number.isFinite(serialized) && error <= limit); return serialized;
      };
      const nativePoint = (p, id) => {
        for (const coordinate of ['x', 'y']) {
          assert.ok(Number.isSafeInteger(p[coordinate]));
          assert.equal(Math.round(numeric(p[coordinate] / 65536, id + '.' + coordinate) * 65536), p[coordinate]);
        }
        return numeric(p.x / 65536, id + '.x.emit') + ' ' + numeric(p.y / 65536, id + '.y.emit');
      };
      const nativeData = r => r.segments.map((s, i) => ({ Move: 'M', Line: 'L', Cubic: 'C', Close: 'Z' }[s.kind])
        + (s.kind === 'Close' ? '' : s.kind === 'Cubic' ? nativePoint(s.a, r.id + '.' + i + '.a') + ' ' + nativePoint(s.b, r.id + '.' + i + '.b')
          + ' ' + nativePoint(s.end, r.id + '.' + i + '.end') : nativePoint(s.end, r.id + '.' + i + '.end'))).join(' ');
      const nativeDefs = '<defs>' + clips.map((r, i) => '<clipPath id="native-clip' + i + '" clipPathUnits="userSpaceOnUse"><path' + elementTransform + ' d="' + nativeData(r) + '"/></clipPath>').join('') + '</defs>';
      const nativeBody = paints.map((r, i) => {
        const s = styles[i], width = widthSource === 'driver' ? s.widthPt : r.widthSp / 65536;
        let item = '<path id="native-p' + i + '"' + elementTransform + ' d="' + nativeData(r) + '" stroke="' + s.stroke + '" fill="' + s.fill + '" stroke-width="' + numeric(width, r.id + '.width')
          + '" stroke-linecap="' + s.cap + '" stroke-linejoin="' + s.join + '" stroke-opacity="' + s.strokeOpacity + '" fill-opacity="' + s.fillOpacity + '" fill-rule="' + s.rule + '"'
          + ' stroke-miterlimit="' + s.miter + '"'
          + (r.lengthsSp.length ? ' stroke-dasharray="' + r.lengthsSp.map((x, j) => numeric(x / 65536, r.id + '.dash.' + j)).join(' ')
            + '" stroke-dashoffset="' + numeric(r.phaseSp / 65536, r.id + '.phase') + '"' : '') + '/>';
        for (const j of [...s.clips].reverse()) item = '<g clip-path="url(#native-clip' + j + ')">' + item + '</g>'; return item;
      }).join('');
      const frame = declared.picture;
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + n(frame.maxX - frame.minX) + 'px" height="' + n(frame.maxY - frame.minY)
        + 'px" viewBox="' + [frame.minX, frame.minY, frame.maxX - frame.minX, frame.maxY - frame.minY].map(n).join(' ') + '">'
        + nativeDefs + (transformPlacement === 'group' ? '<g transform="' + physicalTransform + '">' + nativeBody + '</g>' : nativeBody) + '</svg>';
      representations.push({ name, svg, converterInvoked: false, units: 'TeX points under physical scale', precision: digits, widthSource,
        transformPlacement, physicalScale, frame: declared.name });
    }
    assert.ok(serialization.length > 1000 && serialization.every(c => c.passed));
  return { camera, regions, roots, rootChecks, styles, representations, serialization,
    rootContributors: contributors.map(({ p }) => p.id) };
}