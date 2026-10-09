// Edge-specific fork of shape-pdf-image-pair. Keep old admitted renderers intact.
// Absolute viewport vertices avoid accumulated relative-edge rounding changing
// Chromium's rectangle clipping path. No clipping coordinate is snapped/fitted.
export async function measureEdgePdfPair(renderer, input) {
  return renderer.page.evaluate(async input => {
    const require = (value, message) => { if (!value) throw new Error(message); };
    const { scale, camera, regions, frame, units, svgOriginBp, capture = true, cropLimit = 4, allowMathMarks = false } = input;
    require(typeof allowMathMarks === 'boolean', 'Invalid math mark opt-in.');
    require([1, 4].includes(scale) && ['natural', 'expanded'].includes(frame), 'Invalid PDF scale/frame.');
    require(['cssPixels', 'bp'].includes(units), 'Unknown physical SVG units.');
    require(Number.isInteger(cropLimit) && cropLimit >= 0 && cropLimit <= 16, 'Invalid PDF crop limit.');
    const pageSize = camera.rasterSizes[scale + 'x'], width = pageSize.width, height = pageSize.height;
    require([width, height].every(Number.isSafeInteger) && width > 0 && height > 0 && width * height <= 20000000, 'Invalid native page raster.');
    require(regions.length >= 1 && regions.length <= 2048 && regions[0].id === 'whole-picture'
      && new Set(regions.map(r => r.id)).size === regions.length, 'Invalid region coverage.');
    const make = (w = width, h = height) => {
      require([w, h].every(Number.isSafeInteger) && w > 0 && h > 0 && w * h <= 20000000, 'Canvas exceeds its pixel bound.');
      const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
    };
    const ctx = c => c.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
    const load = async url => { const i = new Image(); i.src = url; await i.decode(); return i; };
    const png = c => c.toDataURL('image/png').split(',')[1];
    const sourceDoc = new DOMParser().parseFromString(input.svg, 'image/svg+xml'), source = sourceDoc.documentElement;
    require(!sourceDoc.querySelector('parsererror') && !sourceDoc.doctype && source.localName === 'svg'
      && sourceDoc.querySelectorAll('svg').length === 1, 'Invalid outlined SVG.');
    for (const e of sourceDoc.querySelectorAll('*')) {
      require(['svg', 'g', 'defs', 'path', 'use', 'clipPath', 'title', 'desc', ...(allowMathMarks ? ['rect'] : [])].includes(e.localName), 'Unsupported PDF comparison element.');
      if (e.localName === 'rect') for (const key of ['x', 'y', 'width', 'height']) {
        const text = e.getAttribute(key) ?? (['x', 'y'].includes(key) ? '0' : null), n = Number(text);
        require(text !== null && /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(text) && Number.isFinite(n)
          && Math.abs(n) <= 1000000 && (!['width', 'height'].includes(key) || n > 0), 'Invalid math rule rectangle.');
      }
      for (const a of e.attributes) require(!a.name.toLowerCase().startsWith('on') && !['style', 'base'].includes(a.localName)
        && (a.localName !== 'href' || /^#[\w.-]+$/.test(a.value))
        && (!a.value.includes('url(') || /^url\(#[\w.-]+\)$/.test(a.value)), 'External or executable SVG reference.');
    }
    const dimension = value => { const m = /^([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)(px|pt)?$/i.exec(value ?? '');
      require(m, 'Invalid physical SVG dimension.'); return Number(m[1]) * (m[2] === 'pt' ? 4 / 3 : 1); };
    const view = (source.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number), factor = units === 'bp' ? 4 / 3 : 1;
    require(view.length === 4 && view.every(Number.isFinite) && view[2] > 0 && view[3] > 0, 'Invalid SVG viewBox.');
    const sourceFrame = { x: view[0] * factor - svgOriginBp.x * 4 / 3, y: view[1] * factor - svgOriginBp.y * 4 / 3,
      width: dimension(source.getAttribute('width')), height: dimension(source.getAttribute('height')) };
    require(Object.values(sourceFrame).every(Number.isFinite) && Object.values(camera.origin).every(Number.isFinite)
      && Object.values(svgOriginBp).every(Number.isFinite), 'Invalid native registration.');
    require(Math.abs(sourceFrame.width - view[2] * factor) <= 1e-9 && Math.abs(sourceFrame.height - view[3] * factor) <= 1e-9
      && [null, 'none', 'xMidYMid meet'].includes(source.getAttribute('preserveAspectRatio')), 'SVG dimensions/aspect ratio disagree with native units.');
    const clipFrame = frame === 'natural' ? sourceFrame : regions[0].rectangle;
    const ns = 'http://www.w3.org/2000/svg', outer = sourceDoc.implementation.createDocument(ns, 'svg', null), root = outer.documentElement;
    root.setAttribute('width', width + 'px'); root.setAttribute('height', height + 'px'); root.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    let id = 'shape-pdf-native-viewport'; while (sourceDoc.getElementById(id)) id += '-';
    const defs = outer.createElementNS(ns, 'defs'), clip = outer.createElementNS(ns, 'clipPath'), border = outer.createElementNS(ns, 'path');
    clip.setAttribute('id', id); clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
    const left = (camera.origin.x + clipFrame.x) * scale, top = (camera.origin.y + clipFrame.y) * scale;
    border.setAttribute('d', 'M' + left + ' ' + top + 'H' + (left + clipFrame.width * scale)
      + 'V' + (top + clipFrame.height * scale) + 'H' + left + 'Z');
    clip.append(border); defs.append(clip); root.append(defs);
    const clipped = outer.createElementNS(ns, 'g'), mapping = outer.createElementNS(ns, 'g'), content = outer.createElementNS(ns, 'g');
    clipped.setAttribute('clip-path', 'url(#' + id + ')');
    mapping.setAttribute('transform', 'matrix(' + factor * scale + ' 0 0 ' + factor * scale + ' '
      + (camera.origin.x - svgOriginBp.x * 4 / 3) * scale + ' ' + (camera.origin.y - svgOriginBp.y * 4 / 3) * scale + ')');
    for (const a of source.attributes) if (!['width', 'height', 'viewBox', 'x', 'y', 'preserveAspectRatio'].includes(a.name)
      && a.prefix !== 'xmlns' && a.name !== 'xmlns') content.setAttributeNS(a.namespaceURI, a.name, a.value);
    for (const child of source.childNodes) content.append(outer.importNode(child, true));
    mapping.append(content); clipped.append(mapping); root.append(clipped);
    const xml = new XMLSerializer().serializeToString(outer), svgUrl = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
    async function render(url) {
      const image = await load(url);
      require(image.width === width && image.height === height, 'Image dimensions differ from the native page.');
      const c = make(), context = ctx(c); context.fillStyle = 'white'; context.fillRect(0, 0, width, height); context.drawImage(image, 0, 0);
      return c;
    }
    const raw = (a, b) => {
      const x = ctx(a).getImageData(0, 0, width, height).data, y = ctx(b).getImageData(0, 0, width, height).data;
      let changed = 0, maximum = 0;
      for (let i = 0; i < x.length; i += 4) { let error = 0; for (let c = 0; c < 4; c++) error = Math.max(error, Math.abs(x[i + c] - y[i + c]));
        changed += error !== 0; maximum = Math.max(maximum, error); }
      return { exactRgbaMatch: changed === 0, rawChangedPixels: changed, maxRawChannelError: maximum };
    };
    try {
      const pdf = await render(input.pdfPage), actual = await render(svgUrl);
      const repeat = { pdf: raw(pdf, await render(input.pdfPage)), svg: raw(actual, await render(svgUrl)) };
      const page = raw(pdf, actual);
      const cut = (canvas, rectangle) => { const c = make(rectangle.width, rectangle.height); ctx(c).drawImage(canvas, -rectangle.x, -rectangle.y); return c; };
      const pairs = regions.map(r => {
        const q = r.rasterRectangles[scale + 'x'], expected = { x: Math.floor((camera.origin.x + r.rectangle.x) * scale),
          y: Math.floor((camera.origin.y + r.rectangle.y) * scale) };
        expected.width = Math.ceil((camera.origin.x + r.rectangle.x + r.rectangle.width) * scale) - expected.x;
        expected.height = Math.ceil((camera.origin.y + r.rectangle.y + r.rectangle.height) * scale) - expected.y;
        require(['x', 'y', 'width', 'height'].every(k => q[k] === expected[k] && Number.isSafeInteger(q[k]))
          && q.x >= 0 && q.y >= 0 && q.width > 0 && q.height > 0 && q.x + q.width <= width && q.y + q.height <= height, 'Changed or invalid native crop.');
        const a = cut(pdf, q), b = cut(actual, q);
        const metrics = globalThis.shapeRasterMetrics.compare(ctx(a).getImageData(0, 0, q.width, q.height).data,
          ctx(b).getImageData(0, 0, q.width, q.height).data, { width: q.width, height: q.height, scale, background: 'white', maskThreshold: 16 });
        return { region: r, metrics, pdf: a, svg: b };
      });
      require(page.rawChangedPixels >= pairs[0].metrics.rawChangedPixels, 'Whole crop exceeds page differences.');
      const differences = (a, b) => {
        const c = make(a.width, a.height), amplified = make(a.width, a.height), overlay = make(a.width, a.height);
        const x = ctx(a).getImageData(0, 0, a.width, a.height), y = ctx(b).getImageData(0, 0, b.width, b.height);
        const d = ctx(c).createImageData(a.width, a.height), amp = ctx(amplified).createImageData(a.width, a.height), mix = ctx(overlay).createImageData(a.width, a.height);
        for (let i = 0; i < x.data.length; i += 4) {
          let error = 0; for (let k = 0; k < 4; k++) { const e = Math.abs(x.data[i + k] - y.data[i + k]); error = Math.max(error, e);
            if (k < 3) { d.data[i + k] = e; mix.data[i + k] = Math.round((x.data[i + k] + y.data[i + k]) / 2); } }
          d.data[i + 3] = mix.data[i + 3] = amp.data[i + 3] = 255; amp.data[i] = 255; amp.data[i + 1] = amp.data[i + 2] = 255 - Math.min(255, error * 16);
        }
        ctx(c).putImageData(d, 0, 0); ctx(amplified).putImageData(amp, 0, 0); ctx(overlay).putImageData(mix, 0, 0);
        return { difference: c, amplified, overlay };
      };
      const presented = (pair, enlargement, rightLabel, includeSheet = true) => {
        const q = pair.region.rasterRectangles[scale + 'x'], panels = { pdf: pair.pdf, svg: pair.svg, ...differences(pair.pdf, pair.svg) };
        const images = {};
        for (const [name, canvas] of Object.entries(panels)) {
          const c = make(q.width * enlargement, q.height * enlargement), context = ctx(c); context.fillStyle = 'white'; context.fillRect(0, 0, c.width, c.height);
          context.imageSmoothingEnabled = false; context.drawImage(canvas, 0, 0, c.width, c.height); images[name] = png(c);
        }
        if (!includeSheet) return { images, presentation: { background: 'white', integerEnlargement: enlargement, rawDifferenceAmplification: 16, rasterRectangle: q } };
        const panelWidth = Math.max(160, q.width * enlargement), sheet = make(3 * panelWidth, q.height * enlargement + 50), context = ctx(sheet);
        context.fillStyle = 'white'; context.fillRect(0, 0, sheet.width, sheet.height); context.fillStyle = 'black'; context.font = '14px sans-serif';
        context.fillText(pair.region.id + ' / ' + scale + 'x / enlargement ' + enlargement + 'x', 6, 18); context.imageSmoothingEnabled = false;
        [[pair.pdf, 'Ordinary PDF'], [pair.svg, rightLabel], [panels.amplified, 'Raw difference x16']].forEach(([canvas, label], i) => {
          context.fillText(label, i * panelWidth + 6, 40); context.drawImage(canvas, i * panelWidth + (panelWidth - q.width * enlargement) / 2, 50, q.width * enlargement, q.height * enlargement);
        });
        images.sheet = png(sheet); return { images, presentation: { background: 'white', integerEnlargement: enlargement, rawDifferenceAmplification: 16, rasterRectangle: q } };
      };
      const result = { sourceFrame, clipFrame, scale, frame, background: 'white', pageSize, fullPage: page,
        outsideWholeChangedPixels: page.rawChangedPixels - pairs[0].metrics.rawChangedPixels, repeat,
        whole: { ...pairs[0].region, ...pairs[0].metrics }, regions: pairs.slice(1).map(p => ({ ...p.region, ...p.metrics })) };
      if (capture) {
        const preferred = input.cropRegionIds ?? [];
        const chosen = pairs.slice(1).sort((a, b) => Number(preferred.includes(b.region.id)) - Number(preferred.includes(a.region.id))
          || b.metrics.rawChangedPixels - a.metrics.rawChangedPixels || a.region.id.localeCompare(b.region.id)).slice(0, cropLimit);
        result.images = { 'svg-page': png(actual), ...presented(pairs[0], 1, input.rightLabel ?? 'SVG', scale === 1).images };
        result.crops = chosen.map(p => ({ id: p.region.id, ...presented(p, scale === 1 ? 4 : 1, input.rightLabel ?? 'SVG') }));
      }
      return result;
    } finally { URL.revokeObjectURL(svgUrl); }
  }, input);
}
