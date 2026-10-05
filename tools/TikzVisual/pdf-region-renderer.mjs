// White-paper PDF comparisons on the native page lattice. This isolated
// development renderer measures only supplied, fixed physical regions.
export async function measurePdfRegions(page, input) {
  return page.evaluate(renderPdfRegions, input);
}

export async function renderPdfRegions(input) {
  const canvas = (width, height) => {
    if (![width, height].every(Number.isSafeInteger) || width < 1 || height < 1 || width * height > 20000000)
      throw new Error('PDF region exceeds the canvas limit.');
    const c = document.createElement('canvas'); c.width = width; c.height = height; return c;
  };
  const context = c => {
    const x = c.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
    if (!x) throw new Error('PDF region canvas unavailable.'); return x;
  };
  const load = async url => { const i = new Image(); i.src = url; await i.decode(); return i; };
  const dimensions = value => {
    const m = /^([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)(px|pt)?$/i.exec(value ?? '');
    if (!m) throw new Error('Unsupported PDF comparison SVG dimension.');
    return Number(m[1]) * (m[2] === 'pt' ? 4 / 3 : 1);
  };
  const doc = new DOMParser().parseFromString(input.svg, 'image/svg+xml'), root = doc.documentElement;
  if (doc.querySelector('parsererror') || doc.doctype || root.localName !== 'svg') throw new Error('Invalid PDF comparison SVG.');
  for (const element of doc.querySelectorAll('*')) {
    if (!['svg', 'defs', 'g', 'path', 'use', 'clipPath', 'title', 'desc'].includes(element.localName))
      throw new Error('Unsupported PDF comparison SVG vocabulary.');
    for (const a of element.attributes)
      if (a.name.startsWith('on') || a.localName === 'href' && !a.value.startsWith('#')
        || a.value.includes('url(') && !/^url\(#[\w.-]+\)$/.test(a.value)) throw new Error('External or executable SVG reference.');
  }
  const view = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  if (view.length !== 4 || !view.every(Number.isFinite) || view[2] <= 0 || view[3] <= 0
    || !['cssPixels', 'bp'].includes(input.units)) throw new Error('Invalid PDF comparison SVG frame.');
  const factor = input.units === 'bp' ? 4 / 3 : 1, origin = input.svgOriginBp ?? { x: 0, y: 0 };
  const box = { x: view[0] * factor - origin.x * 4 / 3, y: view[1] * factor - origin.y * 4 / 3,
    width: dimensions(root.getAttribute('width')), height: dimensions(root.getAttribute('height')) };
  if (![box.x, box.y, box.width, box.height, input.pdfOriginPixels?.x, input.pdfOriginPixels?.y].every(Number.isFinite)
    || box.width <= 0 || box.height <= 0) throw new Error('Invalid measured PDF registration.');
  if (!Array.isArray(input.regions) || input.regions.length < 1 || input.regions.length > 2048
    || new Set(input.regions.map(r => r.id)).size !== input.regions.length) throw new Error('Invalid PDF region manifest.');
  const svg = await load('data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(input.svg))));
  const components = (mask, width, height) => {
    const seen = new Uint8Array(mask.length); let count = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i] && !seen[i]) {
      count++; const queue = [i]; seen[i] = 1;
      for (let head = 0; head < queue.length; head++) {
        const p = queue[head], x = p % width, y = Math.floor(p / width);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy, next = ny * width + nx;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && mask[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
        }
      }
    }
    return count;
  };
  const edges = (mask, width, height) => {
    const result = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i++) if (mask[i]) {
      const x = i % width, y = Math.floor(i / width);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1 || !mask[i - 1] || !mask[i + 1]
        || !mask[i - width] || !mask[i + width]) result[i] = 1;
    }
    return result;
  };
  const distance = (a, b, width, height) => {
    if (!a.some(Boolean) || !b.some(Boolean)) return a.some(Boolean) === b.some(Boolean) ? 0 : null;
    const d = new Float32Array(b.length); d.fill(width + height);
    for (let i = 0; i < b.length; i++) if (b[i]) d[i] = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x) d[i] = Math.min(d[i], d[i - 1] + 1);
      if (y) d[i] = Math.min(d[i], d[i - width] + 1);
      if (x && y) d[i] = Math.min(d[i], d[i - width - 1] + Math.SQRT2);
      if (y && x < width - 1) d[i] = Math.min(d[i], d[i - width + 1] + Math.SQRT2);
    }
    for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (x < width - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
      if (y < height - 1) d[i] = Math.min(d[i], d[i + width] + 1);
      if (x < width - 1 && y < height - 1) d[i] = Math.min(d[i], d[i + width + 1] + Math.SQRT2);
      if (x && y < height - 1) d[i] = Math.min(d[i], d[i + width - 1] + Math.SQRT2);
    }
    let maximum = 0;
    for (let i = 0; i < a.length; i++) if (a[i]) maximum = Math.max(maximum, d[i]);
    return maximum;
  };
  const results = [], images = {};
  for (const scale of [1, 4]) {
    const pdf = await load(input.pdfPages[scale]);
    // Render once on the full measured page. Drawing the same SVG directly
    // into a small negative-offset crop can change browser quantization by a
    // channel sample. Both sides subsequently use native integer crops.
    const svgPage = canvas(pdf.width, pdf.height), pageContext = context(svgPage);
    pageContext.fillStyle = 'white'; pageContext.fillRect(0, 0, svgPage.width, svgPage.height);
    pageContext.drawImage(svg, (input.pdfOriginPixels.x + box.x) * scale,
      (input.pdfOriginPixels.y + box.y) * scale, box.width * scale, box.height * scale);
    for (const region of input.regions) {
      const r = region.rectanglePixels;
      if (!/^[a-z0-9-]{1,128}$/.test(region.id) || !r || ![r.x, r.y, r.width, r.height].every(Number.isFinite)
        || r.width <= 0 || r.height <= 0) throw new Error('Invalid fixed PDF region.');
      const left = Math.floor((input.pdfOriginPixels.x + r.x) * scale), top = Math.floor((input.pdfOriginPixels.y + r.y) * scale);
      if (![left, top].every(Number.isSafeInteger)) throw new Error('PDF region page position exceeds native precision.');
      const width = Math.ceil((input.pdfOriginPixels.x + r.x + r.width) * scale) - left;
      const height = Math.ceil((input.pdfOriginPixels.y + r.y + r.height) * scale) - top;
      const reference = canvas(width, height), actual = canvas(width, height), a = context(reference), b = context(actual);
      a.fillStyle = b.fillStyle = 'white'; a.fillRect(0, 0, width, height); b.fillRect(0, 0, width, height);
      // Original Poppler and full-page SVG pixels are copied at an integer
      // offset. Neither raster receives a fractional resampling pass.
      a.drawImage(pdf, -left, -top);
      b.drawImage(svgPage, -left, -top);
      const ap = a.getImageData(0, 0, width, height).data, bp = b.getImageData(0, 0, width, height).data;
      const am = new Uint8Array(width * height), bm = new Uint8Array(width * height);
      const capture = (input.captureIds ?? []).includes(region.id);
      const diff = capture ? canvas(width, height) : null, dc = diff ? context(diff) : null, dp = dc?.createImageData(width, height);
      let changedPixels = 0, maxChannelError = 0, foregroundPixels = 0, sum = 0;
      for (let p = 0; p < am.length; p++) {
        const i = p * 4; let error = 0, total = 0;
        am[p] = Math.min(ap[i], ap[i + 1], ap[i + 2]) < 239;
        bm[p] = Math.min(bp[i], bp[i + 1], bp[i + 2]) < 239;
        for (let c = 0; c < 4; c++) { const d = Math.abs(ap[i + c] - bp[i + c]); error = Math.max(error, d); total += d; }
        if (error) changedPixels++;
        maxChannelError = Math.max(maxChannelError, error);
        if (Math.min(ap[i], ap[i + 1], ap[i + 2], bp[i], bp[i + 1], bp[i + 2]) < 255) { foregroundPixels++; sum += total; }
        if (dp) { dp.data[i] = 255; dp.data[i + 1] = dp.data[i + 2] = 255 - Math.min(255, error * 16); dp.data[i + 3] = 255; }
      }
      const ae = edges(am, width, height), be = edges(bm, width, height);
      const ab = distance(ae, be, width, height), ba = distance(be, ae, width, height);
      const result = { id: region.id, scale, background: 'white', pageCropPixels: { left, top, width, height },
        changedPixels, exactMatch: changedPixels === 0, maxChannelError,
        meanForegroundError: foregroundPixels ? sum / (foregroundPixels * 4) : 0, foregroundPixels,
        maxEdgeDisplacementPixels: ab === null || ba === null ? null : Math.max(ab, ba) / scale,
        referenceComponents: components(am, width, height), actualComponents: components(bm, width, height) };
      results.push(result);
      if (capture) {
        dc.putImageData(dp, 0, 0);
        for (const [label, c] of [['pdf', reference], ['svg', actual], ['difference', diff]])
          images[region.id + '-' + scale + 'x-' + label + '.png'] = c.toDataURL('image/png').split(',')[1];
      }
    }
  }
  return { box, results, images };
}
