// Native edge SVGs require local clip references; the older shape-only reader stays unchanged.
import assert from 'node:assert/strict';
// Cameras/regions must be established from independent evidence by the caller.
export async function measureEdgeOraclePair(renderer, input) {
  assert.ok(['natural', 'expanded'].includes(input.frame)); assert.ok([1, 4].includes(input.scale));
  assert.ok(['transparent', 'white', 'black'].includes(input.background));
  assert.ok(input.allowMathMarks===undefined||input.allowMathMarks===true);
  assert.ok(Number.isFinite(input.camera.x) && Number.isFinite(input.camera.y));
  assert.ok(Number.isSafeInteger(input.camera.width) && input.camera.width > 0 && Number.isSafeInteger(input.camera.height) && input.camera.height > 0);
  assert.ok(input.camera.width * input.camera.height * input.scale ** 2 <= 20000000);
  assert.ok(input.regions.length > 0 && input.regions.length <= 512 && new Set(input.regions.map(r => r.id)).size === input.regions.length);
  assert.ok(input.regions.every(r => Object.values(r.rectangle).every(Number.isSafeInteger) && r.rectangle.x >= 0 && r.rectangle.y >= 0
    && r.rectangle.width > 0 && r.rectangle.height > 0 && r.rectangle.x + r.rectangle.width <= input.camera.width && r.rectangle.y + r.rectangle.height <= input.camera.height));
  assert.ok(Number.isSafeInteger(input.cropLimit ?? 4) && (input.cropLimit ?? 4) >= 0 && (input.cropLimit ?? 4) <= 16);
  return renderer.page.evaluate(async ({ reference, actual, leftIsDriver, origin, camera, frame, scale, background, regions, allowMathMarks=false, rightLabel = 'Actual', cropLimit = 4, cropRegionIds = [] }) => {
    const width = camera.width * scale, height = camera.height * scale, ns = 'http://www.w3.org/2000/svg';
    const make = (w = width, h = height) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const png = c => c.toDataURL('image/png').split(',')[1];
    function dimension(value) { const m = /^([-\d.e+]+)(px|pt)$/.exec(value ?? ''); if (!m) throw new Error('Unknown SVG dimension.'); return Number(m[1]) * (m[2] === 'pt' ? 4 / 3 : 1); }
    async function render(source, driver) {
      const doc = new DOMParser().parseFromString(source, 'image/svg+xml'), svg = doc.documentElement;
      if (doc.querySelector('parsererror') || doc.doctype || svg.localName !== 'svg') throw new Error('Invalid outlined SVG.');
      const ids = new Map();
      for (const e of doc.querySelectorAll('*')) {
        if (e.namespaceURI !== ns || (e.id && ids.has(e.id))) throw new Error('Invalid SVG namespace or repeated identity.');
        if (e.id) ids.set(e.id, e);
        if (!['svg', 'g', 'defs', 'path', 'use', 'title', 'desc', 'clipPath', ...(allowMathMarks?['rect']:[])].includes(e.localName)) throw new Error('Out-of-scope SVG element.');
        if(e.localName==='rect')for(const key of['x','y','width','height']){
          const text=e.getAttribute(key)??(['x','y'].includes(key)?'0':null),n=Number(text);
          if(text===null||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(text)||!Number.isFinite(n)||Math.abs(n)>1000000||(['width','height'].includes(key)&&n<=0))throw new Error('Invalid math rule rectangle.');
        }
        for (const a of e.attributes) if (a.name.toLowerCase().startsWith('on') || ['style', 'base'].includes(a.localName)
          || (a.localName === 'href' && !/^#[\w.-]+$/.test(a.value)) || (a.value.includes('url(') && !(a.localName === 'clip-path' && /^url\(#[\w.-]+\)$/.test(a.value)))) throw new Error('External or executable SVG reference.');
      }
      for (const e of doc.querySelectorAll('*')) for (const a of e.attributes) {
        if (a.localName === 'href') {
          if(e.localName!=='use')throw new Error('Missing or invalid glyph reference.');
          let target=ids.get(a.value.slice(1)),chain=[];
          while(allowMathMarks&&target?.localName==='use'){
            const scaleText=/^scale\(([\d.]+)\)$/.exec(target.getAttribute('transform')??'')?.[1],aliasScale=Number(scaleText);
            if(!target.closest('defs')||chain.includes(target.id)||chain.length>=4||!Number.isFinite(aliasScale)||aliasScale<=0||aliasScale>16)throw new Error('Invalid math outline alias.');
            chain.push(target.id);target=ids.get([...target.attributes].find(a=>a.localName==='href')?.value.slice(1));
          }
          if(target?.localName!=='path')throw new Error('Missing or invalid glyph reference.');
        }
        if (a.localName === 'clip-path' && ids.get(/^url\(#([\w.-]+)\)$/.exec(a.value)?.[1])?.localName !== 'clipPath') throw new Error('Missing or invalid clip reference.');
      }
      const view = (svg.getAttribute('viewBox') ?? '').split(/[ ,]+/).map(Number);
      if (view.length !== 4 || !view.every(Number.isFinite) || view[2] <= 0 || view[3] <= 0) throw new Error('Invalid SVG frame.');
      const natural = { x: driver ? (view[0] - origin.x) * 4 / 3 : view[0], y: driver ? (view[1] - origin.y) * 4 / 3 : view[1],
        width: dimension(svg.getAttribute('width')), height: dimension(svg.getAttribute('height')) };
      if (!Object.values(natural).every(Number.isFinite) || natural.width <= 0 || natural.height <= 0) throw new Error('Invalid physical SVG size.');
      if (frame === 'expanded') {
        if (driver) { const g = doc.createElementNS(ns, 'g'); g.setAttribute('transform', `matrix(${4 / 3} 0 0 ${4 / 3} ${-origin.x * 4 / 3} ${-origin.y * 4 / 3})`); while (svg.firstChild) g.append(svg.firstChild); svg.append(g); }
        svg.setAttribute('width', width + 'px'); svg.setAttribute('height', height + 'px'); svg.setAttribute('viewBox', `${camera.x} ${camera.y} ${camera.width} ${camera.height}`);
      }
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
      try {
        const image = new Image(); image.src = url; await image.decode(); const canvas = make(), ctx = canvas.getContext('2d');
        if (background !== 'transparent') { ctx.fillStyle = background; ctx.fillRect(0, 0, width, height); }
        if (frame === 'expanded') ctx.drawImage(image, 0, 0);
        else ctx.drawImage(image, (natural.x - camera.x) * scale, (natural.y - camera.y) * scale, natural.width * scale, natural.height * scale);
        return { canvas, data: ctx.getImageData(0, 0, width, height).data, natural };
      } finally { URL.revokeObjectURL(url); }
    }
    const left = await render(reference, leftIsDriver), right = await render(actual, false), repeated = await render(reference, leftIsDriver), repeatedRight = await render(actual, false);
    const options = { width, height, scale, background, maskThreshold: 16 }, compare = globalThis.shapeRasterMetrics.compare;
    const local = regions.map(r => ({ ...r, ...compare(left.data, right.data, { ...options, rectangle: {
      x: r.rectangle.x * scale, y: r.rectangle.y * scale, width: r.rectangle.width * scale, height: r.rectangle.height * scale } }) }));
    const difference = make(), amplified = make(), alphaDifference = make(), overlay = make();
    const dc = difference.getContext('2d'), ac = amplified.getContext('2d'), lc = alphaDifference.getContext('2d'), oc = overlay.getContext('2d');
    const d = dc.createImageData(width, height), a = ac.createImageData(width, height), l = lc.createImageData(width, height), o = oc.createImageData(width, height);
    for (let i = 0; i < left.data.length; i += 4) {
      let maximum = 0;
      for (let c = 0; c < 4; c++) { const error = Math.abs(left.data[i + c] - right.data[i + c]); maximum = Math.max(maximum, error); if (c < 3) d.data[i + c] = error; o.data[i + c] = Math.round((left.data[i + c] + right.data[i + c]) / 2); }
      d.data[i + 3] = 255; a.data[i] = 255; a.data[i + 1] = a.data[i + 2] = 255 - Math.min(255, maximum * 16); a.data[i + 3] = 255;
      l.data[i] = l.data[i + 1] = l.data[i + 2] = Math.abs(left.data[i + 3] - right.data[i + 3]); l.data[i + 3] = 255;
    }
    dc.putImageData(d, 0, 0); ac.putImageData(a, 0, 0); lc.putImageData(l, 0, 0); oc.putImageData(o, 0, 0);
    const images = { reference: png(left.canvas), actual: png(right.canvas), difference: png(difference), 'alpha-difference': png(alphaDifference), amplified: png(amplified), overlay: png(overlay) };
    if (background === 'white' && scale === 1) {
      const c = make(3 * width, height + 28), ctx = c.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = 'black'; ctx.font = '16px sans-serif';
      [[left.canvas, 'Original oracle'], [right.canvas, rightLabel], [amplified, 'Raw difference ×16']].forEach(([image, label], i) => { ctx.fillText(label, i * width + 8, 20); ctx.drawImage(image, i * width, 28); }); images.comparison = png(c);
    }
    const crops = local.slice().sort((a, b) => Number(cropRegionIds.includes(b.id)) - Number(cropRegionIds.includes(a.id)) || b.rawChangedPixels - a.rawChangedPixels || a.id.localeCompare(b.id)).slice(0, cropLimit).map(r => {
      const rect = r.rectangle, w = rect.width * scale, h = rect.height * scale, factor = scale === 1 ? 4 : 1, panel = Math.max(w * factor, 160), paired = {};
      for (const [name, image] of [['reference', left.canvas], ['actual', right.canvas], ['difference', difference], ['amplified', amplified]]) {
        const c = make(w * factor, h * factor), ctx = c.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, c.width, c.height); ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, rect.x * scale, rect.y * scale, w, h, 0, 0, w * factor, h * factor); paired[name] = png(c);
      }
      const c = make(3 * panel, h * factor + 50), ctx = c.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = 'black'; ctx.font = '14px sans-serif'; ctx.fillText(r.id + ` · integer enlargement ×${factor}`, 6, 18); ctx.imageSmoothingEnabled = false;
      [[left.canvas, 'reference'], [right.canvas, rightLabel], [amplified, 'raw difference ×16']].forEach(([image, label], i) => { ctx.fillText(label, i * panel + 6, 40); ctx.drawImage(image, rect.x * scale, rect.y * scale, w, h, i * panel + (panel - w * factor) / 2, 50, w * factor, h * factor); });
      return { id: r.id, paired, sheet: png(c), presentation: { background: 'white', integerEnlargement: factor, rawDifferenceAmplification: 16,
        rasterRectangle: { x: rect.x * scale, y: rect.y * scale, width: w, height: h } } };
    });
    return { metrics: compare(left.data, right.data, options), regions: local, repeat: compare(left.data, repeated.data, options), actualRepeat: compare(right.data, repeatedRight.data, options), images, crops,
      naturalFrames: { reference: left.natural, actual: right.natural } };
  }, input);
}
