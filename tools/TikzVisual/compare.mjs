import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
export const profile = JSON.parse(await readFile(path.join(directory, 'browser-profile.json'), 'utf8'));
const textProfileBytes = await readFile(path.join(directory, 'text-profile.json'));
const textProfile = JSON.parse(textProfileBytes);
const nodeProfileBytes = await readFile(path.join(directory, 'node-profile.json'));
const nodeProfile = JSON.parse(nodeProfileBytes);
const hash = value => createHash('sha256').update(value).digest('hex');

export async function createRenderer() {
  const packageInfo = JSON.parse(await readFile(path.join(directory, 'node_modules/playwright/package.json'), 'utf8'));
  if (packageInfo.version !== profile.playwrightVersion) throw new Error('Playwright version does not match the pinned profile.');
  const executable = chromium.executablePath();
  const browser = await chromium.launch({ executablePath: executable, headless: true, args: profile.launchArguments });
  if (browser.version() !== profile.browserVersion) { await browser.close(); throw new Error('Browser version does not match the pinned profile.'); }
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce' });
  await page.route('**/*', route => route.abort());
  await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
  const identity = {
    profile: profile.id, playwright: packageInfo.version, browser: browser.version(),
    browserSha256: hash(await readFile(executable)), os: os.platform(), osRelease: os.release(), architecture: os.arch(),
    node: process.version, headless: true, deviceScaleFactor: 1, viewport: { width: 1200, height: 900 },
    launchArguments: profile.launchArguments, profileSha256: hash(await readFile(path.join(directory, 'browser-profile.json')))
  };
  return { browser, page, identity };
}

export async function compareBundle(bundle, renderer) {
  const input = JSON.parse(await readFile(path.join(bundle, 'comparison-input.json'), 'utf8'));
  const referenceSvg = await readFile(path.join(bundle, 'reference.svg'), 'utf8');
  const actualSvg = await readFile(path.join(bundle, 'actual.svg'), 'utf8');
  const scene = JSON.parse(await readFile(path.join(bundle, 'actual-scene.json'), 'utf8'));
  const pdfImages = input.pdf ? Object.fromEntries(await Promise.all(profile.scales.map(async scale => [scale,
    'data:image/png;base64,' + (await readFile(path.join(bundle, `pdf-page-${scale}x.png`))).toString('base64')]))) : null;
  if (input.rasterProfile && !['text', 'node'].includes(input.rasterProfile)) throw new Error('Unknown raster profile.');
  const profileKey = input.toleranceProfile ?? input.caseId;
  const widthProfileBytes = !input.rasterProfile && profileKey === 'width-presets'
    ? await readFile(path.join(directory, 'width-profile.json')) : null;
  const rasterProfile = input.rasterProfile === 'text' ? textProfile : input.rasterProfile === 'node' ? nodeProfile
    : widthProfileBytes ? JSON.parse(widthProfileBytes) : profile;
  if (widthProfileBytes) {
    if (rasterProfile.schemaVersion !== 1 || Object.keys(rasterProfile.cases).join() !== 'width-presets'
      || Object.keys(rasterProfile.cases['width-presets'].pdf.byScale).join() !== profile.scales.join())
      throw new Error('Incomplete independently calibrated width policy.');
    const bytes = await readFile(path.resolve(directory, rasterProfile.calibrationFile));
    if (hash(bytes) !== rasterProfile.calibrationSha256) throw new Error('Width calibration evidence hash differs from its reviewed policy.');
    const provenanceBytes = await readFile(path.join(bundle, 'provenance.json'));
    if (hash(provenanceBytes) !== rasterProfile.referenceProvenanceSha256) throw new Error('Width reference provenance differs from the native calibration.');
    for (const [name, digest] of Object.entries(JSON.parse(provenanceBytes).artifacts))
      if (path.basename(name) !== name || hash(await readFile(path.join(bundle, name))) !== digest)
        throw new Error('Width native reference asset differs: ' + name);
    const calibration = JSON.parse(bytes), native = calibration.cases?.[0];
    if (calibration.converterInvoked !== false || calibration.cases.length !== 1 || native.caseId !== 'width-presets'
      || native.sourceSha256 !== hash(await readFile(path.join(bundle, 'source.tikz')))
      || JSON.stringify(calibration.renderer) !== JSON.stringify(renderer.identity)
      || native.variants.length !== 3 || native.variants.some(v => !v.numeric.passed || !v.dimensions.passed))
      throw new Error('Width calibration inputs or renderer differ from the current comparison.');
    for (const [name, digest] of [['reference.svg', native.referenceSvgSha256], ['reference.pdf', native.referencePdfSha256], ['reference-metrics.json', native.referenceMetricsSha256]])
      if (hash(await readFile(path.join(bundle, name))) !== digest) throw new Error('Width calibration reference artifact differs: ' + name);
    if (Object.values(rasterProfile.primary).some(value => value !== 0) || Object.keys(rasterProfile.primary).length !== 4)
      throw new Error('Width primary comparison must remain exact.');
    for (const scale of profile.scales) {
      const measured = native.variants.flatMap(v => v.oracleSvgVersusPdf.filter(c => c.scale === scale));
      if (measured.length !== 3) throw new Error('Incomplete native width PDF scale evidence.');
      const expected = {
        maxChannelError: Math.max(...measured.map(c => c.maxChannelError)) + 1,
        maxMeanForegroundError: Math.ceil(Math.max(...measured.map(c => c.meanForegroundError))),
        maxEdgeDisplacementRasterPixels: Math.ceil(Math.max(...measured.map(c => c.maxEdgeDisplacementPixels)) * scale * 2) / 2,
        maxComponentDifference: Math.max(...measured.map(c => Math.abs(c.referenceComponents - c.actualComponents)))
      };
      if (JSON.stringify(rasterProfile.cases['width-presets'].pdf.byScale[scale]) !== JSON.stringify(expected))
        throw new Error('Width PDF limits differ from the fixed native-only rounding policy.');
    }
  }
  if (input.rasterProfile === 'text' && (textProfile.schemaVersion !== 1 || !textProfile.cases[profileKey]))
    throw new Error('Text case has no independently calibrated policy.');
  if (input.rasterProfile === 'node' && (nodeProfile.schemaVersion !== 1 || !nodeProfile.cases[profileKey]))
    throw new Error('Node case has no independently calibrated policy.');
  // Exact oracle experiments can establish a new snapshot before any reviewed
  // allowance exists. Candidate conformance must consume the pinned evidence.
  if (input.rasterProfile === 'node' && input.exactPrimary !== true) {
    const evidence = await readFile(path.resolve(directory, nodeProfile.calibrationFile));
    if (hash(evidence) !== nodeProfile.calibrationSha256) throw new Error('Node calibration evidence hash differs from the reviewed policy.');
    const declared = JSON.parse(evidence);
    if (declared.converterInvoked !== false || declared.numeric.passed !== true
      || declared.outlineContainment.passed !== true) throw new Error('Invalid independent node calibration evidence.');
    if (input.pdf && !nodeProfile.cases[profileKey].pdf) throw new Error('Node PDF policy has not been independently calibrated.');
  }
  const selected = rasterProfile.cases?.[profileKey] ?? {};
  const policy = { ...profile, primary: selected.primary ?? rasterProfile.primary, pdf: selected.pdf ?? profile.pdf };
  if (input.exactPrimary === true) policy.primary = {
    maxChannelError: 0, maxMeanForegroundError: 0, maxEdgeDisplacementPixels: 0, maxComponentDifference: 0
  };
  if (input.exactPdf === true) policy.pdf = {
    maxChannelError: 0, maxMeanForegroundError: 0, maxEdgeDisplacementRasterPixels: 0, maxComponentDifference: 0
  };
  const inspectionRegions = input.regionalChecks ?? [];
  if (!Array.isArray(inspectionRegions) || inspectionRegions.length > 2048
    || inspectionRegions.some(r => !r || typeof r !== 'object')
    || new Set(inspectionRegions.map(r => r.id)).size !== inspectionRegions.length)
    throw new Error('Invalid independent inspection region manifest.');
  for (const region of inspectionRegions) {
    const box = region.rectanglePixels;
    if (typeof region.id !== 'string' || !/^[a-z0-9-]{1,128}$/.test(region.id) || !box || ![box.x, box.y, box.width, box.height].every(Number.isFinite)
      || box.width <= 0 || box.height <= 0 || !Array.isArray(region.limits) || region.limits.length !== policy.scales.length * 3)
      throw new Error('Invalid independent inspection region.');
    const identities = new Set();
    for (const limit of region.limits) {
      if (!limit || typeof limit !== 'object') throw new Error('Invalid independent regional limit.');
      const key = limit.scale + '/' + limit.background;
      if (!policy.scales.includes(limit.scale) || !['transparent', 'white', 'black'].includes(limit.background) || identities.has(key)
        || ![limit.maxChannelError, limit.maxMeanForegroundError, limit.maxEdgeDisplacementPixels, limit.maxComponentDifference].every(Number.isFinite)
        || limit.maxChannelError < 0 || limit.maxChannelError > 255 || limit.maxMeanForegroundError < 0
        || limit.maxMeanForegroundError > 255 || limit.maxEdgeDisplacementPixels < 0
        || !Number.isSafeInteger(limit.maxComponentDifference) || limit.maxComponentDifference < 0)
        throw new Error('Invalid independent regional limit.');
      identities.add(key);
    }
  }
  const result = await renderer.page.evaluate(async ({ input, scene, referenceSvg, actualSvg, pdfImages, policy }) => {
    const makeCanvas = (width, height) => {
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > policy.maxCanvasPixels)
        throw new Error('Comparison canvas exceeds the harness limit.');
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas;
    };
    const context = canvas => {
      const value = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
      if (!value) throw new Error('Canvas rendering is unavailable.'); return value;
    };
    const dimension = text => {
      const match = /^([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)(px|pt|bp|in|cm|mm)?$/i.exec(text ?? '');
      if (!match) throw new Error('Unsupported SVG dimension.');
      return Number(match[1]) * ({ px: 1, pt: 4 / 3, bp: 4 / 3, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 }[match[2] ?? 'px']);
    };
    const svgInfo = text => {
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      if (doc.querySelector('parsererror') || doc.doctype || doc.documentElement.localName !== 'svg') throw new Error('Invalid SVG artifact.');
      for (const element of doc.querySelectorAll('*')) {
        if (!['svg', 'g', 'defs', 'path', 'rect', 'clipPath', 'use', 'title', 'desc'].includes(element.localName)) throw new Error('Unsupported reference SVG vocabulary.');
        for (const a of element.attributes) {
          if (a.name.startsWith('on') || (a.localName === 'href' && !a.value.startsWith('#'))
            || (a.value.includes('url(') && !/^url\(#[\w.-]+\)$/.test(a.value))) throw new Error('SVG contains an external or executable reference.');
        }
      }
      const root = doc.documentElement;
      const viewBox = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
      if (viewBox.length !== 4 || viewBox.some(v => !Number.isFinite(v)) || viewBox[2] <= 0 || viewBox[3] <= 0) throw new Error('Invalid SVG viewBox.');
      return { viewBox, width: dimension(root.getAttribute('width')), height: dimension(root.getAttribute('height')) };
    };
    const referenceInfo = svgInfo(referenceSvg), actualInfo = svgInfo(actualSvg);
    const referenceBox = {
      x: (referenceInfo.viewBox[0] - input.referenceOriginBp.x) * 4 / 3,
      y: (referenceInfo.viewBox[1] - input.referenceOriginBp.y) * 4 / 3,
      width: referenceInfo.width, height: referenceInfo.height
    };
    if (input.actualUnits && !['cssPixels', 'bp'].includes(input.actualUnits)) throw new Error('Unsupported actual SVG coordinate units.');
    const actualUnitScale = input.actualUnits === 'bp' ? 4 / 3 : 1;
    const actualBox = { x: actualInfo.viewBox[0] * actualUnitScale, y: actualInfo.viewBox[1] * actualUnitScale, width: actualInfo.width, height: actualInfo.height };
    const padding = 8;
    const minX = Math.floor(Math.min(referenceBox.x, actualBox.x)) - padding;
    const minY = Math.floor(Math.min(referenceBox.y, actualBox.y)) - padding;
    const width = Math.ceil(Math.max(referenceBox.x + referenceBox.width, actualBox.x + actualBox.width)) + padding - minX;
    const height = Math.ceil(Math.max(referenceBox.y + referenceBox.height, actualBox.y + actualBox.height)) + padding - minY;
    const load = async url => { const image = new Image(); image.src = url; await image.decode(); return image; };
    const svgUrl = text => 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(text)));
    const referenceImage = await load(svgUrl(referenceSvg)), actualImage = await load(svgUrl(actualSvg));
    const render = (image, box, scale, background) => {
      const canvas = makeCanvas(width * scale, height * scale), ctx = context(canvas);
      if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.drawImage(image, (box.x - minX) * scale, (box.y - minY) * scale, box.width * scale, box.height * scale);
      return canvas;
    };
    const pixels = canvas => context(canvas).getImageData(0, 0, canvas.width, canvas.height).data;
    const files = {};
    const save = (name, canvas) => { files[name] = canvas.toDataURL('image/png').split(',')[1]; };
    const channel = (p, offset, c) => c === 3 ? p[offset + 3] : Math.round(p[offset + c] * p[offset + 3] / 255);
    const regions = (mask, w, h) => {
      const seen = new Uint8Array(mask.length), output = [];
      for (let i = 0; i < mask.length; i++) {
        if (!mask[i] || seen[i]) continue;
        const queue = [i]; seen[i] = 1;
        let minX = i % w, maxX = minX, minY = Math.floor(i / w), maxY = minY;
        for (let n = 0; n < queue.length; n++) {
          const p = queue[n], x = p % w, y = Math.floor(p / w);
          minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nx = x + dx, ny = y + dy, next = ny * w + nx;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
          }
        }
        output.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, changedPixels: queue.length });
      }
      return output.sort((a, b) => b.changedPixels - a.changedPixels || a.y - b.y || a.x - b.x);
    };
    const edges = (mask, w, h) => {
      const result = new Uint8Array(mask.length);
      for (let i = 0; i < mask.length; i++) if (mask[i]) {
        const x = i % w, y = Math.floor(i / w);
        if (x === 0 || x === w - 1 || y === 0 || y === h - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w]) result[i] = 1;
      }
      return result;
    };
    const edgeDistance = (a, b, w, h) => {
      if (!a.some(Boolean) || !b.some(Boolean)) return a.some(Boolean) === b.some(Boolean) ? 0 : null;
      const distance = new Float32Array(b.length); distance.fill(w + h);
      for (let i = 0; i < b.length; i++) if (b[i]) distance[i] = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (x) distance[i] = Math.min(distance[i], distance[i - 1] + 1);
        if (y) distance[i] = Math.min(distance[i], distance[i - w] + 1);
        if (x && y) distance[i] = Math.min(distance[i], distance[i - w - 1] + Math.SQRT2);
        if (y && x < w - 1) distance[i] = Math.min(distance[i], distance[i - w + 1] + Math.SQRT2);
      }
      for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        if (x < w - 1) distance[i] = Math.min(distance[i], distance[i + 1] + 1);
        if (y < h - 1) distance[i] = Math.min(distance[i], distance[i + w] + 1);
        if (x < w - 1 && y < h - 1) distance[i] = Math.min(distance[i], distance[i + w + 1] + Math.SQRT2);
        if (x && y < h - 1) distance[i] = Math.min(distance[i], distance[i + w - 1] + Math.SQRT2);
      }
      let maximum = 0;
      for (let i = 0; i < a.length; i++) if (a[i]) maximum = Math.max(maximum, distance[i]);
      return maximum;
    };
    const compare = (aCanvas, bCanvas, scale, limits, background) => {
      const a = pixels(aCanvas), b = pixels(bCanvas), w = aCanvas.width, h = aCanvas.height;
      const differences = new Uint8Array(w * h), foregroundA = new Uint8Array(w * h), foregroundB = new Uint8Array(w * h);
      let changedPixels = 0, maxChannelError = 0, sum = 0, foregroundPixels = 0;
      const raw = makeCanvas(w, h), amplified = makeCanvas(w, h), rawData = context(raw).createImageData(w, h), amplifiedData = context(amplified).createImageData(w, h);
      for (let i = 0; i < differences.length; i++) {
        const p = i * 4;
        const foreground = values => background === 'white' ? Math.min(values[p], values[p + 1], values[p + 2]) < 239
          : background === 'black' ? Math.max(values[p], values[p + 1], values[p + 2]) >= 16 : values[p + 3] >= 16;
        foregroundA[i] = foreground(a);
        foregroundB[i] = foreground(b);
        let error = 0, total = 0;
        for (let c = 0; c < 4; c++) { const delta = Math.abs(channel(a, p, c) - channel(b, p, c)); error = Math.max(error, delta); total += delta; if (c < 3) rawData.data[p + c] = delta; }
        rawData.data[p + 3] = 255;
        amplifiedData.data[p] = 255; amplifiedData.data[p + 1] = amplifiedData.data[p + 2] = 255 - Math.min(255, error * 16); amplifiedData.data[p + 3] = 255;
        if (error) { differences[i] = 1; changedPixels++; }
        maxChannelError = Math.max(maxChannelError, error);
        const visible = values => background === 'white' ? Math.min(values[p], values[p + 1], values[p + 2]) < 255
          : background === 'black' ? Math.max(values[p], values[p + 1], values[p + 2]) > 0 : values[p + 3] > 0;
        if (visible(a) || visible(b)) { foregroundPixels++; sum += total; }
      }
      context(raw).putImageData(rawData, 0, 0); context(amplified).putImageData(amplifiedData, 0, 0);
      const aEdges = edges(foregroundA, w, h), bEdges = edges(foregroundB, w, h);
      const ab = edgeDistance(aEdges, bEdges, w, h), ba = edgeDistance(bEdges, aEdges, w, h);
      const maximum = ab === null || ba === null ? null : Math.max(ab, ba) / scale;
      const aComponents = regions(foregroundA, w, h).length, bComponents = regions(foregroundB, w, h).length;
      const thresholds = { ...limits, maxEdgeDisplacementPixels: limits.maxEdgeDisplacementPixels ?? limits.maxEdgeDisplacementRasterPixels / scale };
      const metrics = { scale, changedPixels, exactMatch: changedPixels === 0, maxChannelError,
        meanForegroundError: foregroundPixels ? sum / (foregroundPixels * 4) : 0, foregroundPixels,
        maxEdgeDisplacementPixels: maximum, edgeMetric: 'symmetric 8-neighbour chamfer distance / render scale',
        referenceComponents: aComponents, actualComponents: bComponents,
        thresholds };
      metrics.passed = maxChannelError <= thresholds.maxChannelError && metrics.meanForegroundError <= thresholds.maxMeanForegroundError
        && maximum !== null && maximum <= thresholds.maxEdgeDisplacementPixels && Math.abs(aComponents - bComponents) <= thresholds.maxComponentDifference;
      return { metrics, raw, amplified, regions: regions(differences, w, h) };
    };
    const checks = [], pdfChecks = [], driverChecks = [], regional = [], pdfCameras = [], regionChecks = [], regionCrops = [];
    const regionPixels = new WeakMap();
    const cropPixels = (canvas, left, top, width, height) => {
      if (!regionPixels.has(canvas)) regionPixels.set(canvas, pixels(canvas));
      const source = regionPixels.get(canvas), target = makeCanvas(width, height), c = context(target);
      const data = c.createImageData(width, height);
      for (let row = 0; row < height; row++) {
        const start = ((top + row) * canvas.width + left) * 4;
        data.data.set(source.subarray(start, start + width * 4), row * width * 4);
      }
      // Native integer-pixel crop; no image fitting, interpolation, or resizing.
      c.putImageData(data, 0, 0);
      return target;
    };
    let largeReference, largeActual, largeDiff;
    for (const scale of policy.scales) {
      const primaryThresholds = { ...policy.primary, maxEdgeDisplacementPixels:
        policy.primary.maxEdgeDisplacementRasterPixels === undefined ? policy.primary.maxEdgeDisplacementPixels
          : policy.primary.maxEdgeDisplacementRasterPixels / scale };
      const a = render(referenceImage, referenceBox, scale), b = render(actualImage, actualBox, scale);
      const repeatA = render(referenceImage, referenceBox, scale), repeatB = render(actualImage, actualBox, scale);
      const repeatedA = pixels(repeatA), repeatedB = pixels(repeatB);
      if (pixels(a).some((v, i) => v !== repeatedA[i]) || pixels(b).some((v, i) => v !== repeatedB[i])) throw new Error('Repeated captures are not deterministic.');
      const result = compare(a, b, scale, primaryThresholds, null);
      const suffix = scale === 1 ? '' : `-${scale}x`;
      save(`reference${suffix}.png`, a); save(`actual${suffix}.png`, b);
      save(`diff${suffix}.png`, result.raw); save(`diff-amplified${suffix}.png`, result.amplified);
      checks.push(result.metrics);
      const surfaces = [{ background: 'transparent', a, b }];
      for (const background of ['white', 'black']) {
        const surfaceA = render(referenceImage, referenceBox, scale, background), surfaceB = render(actualImage, actualBox, scale, background);
        const composite = compare(surfaceA, surfaceB, scale, primaryThresholds, background);
        checks.push({ ...composite.metrics, background });
        surfaces.push({ background, a: surfaceA, b: surfaceB });
      }
      for (const definition of input.regionalChecks ?? []) {
        const box = definition.rectanglePixels;
        const left = Math.max(0, Math.floor((box.x - minX) * scale)), top = Math.max(0, Math.floor((box.y - minY) * scale));
        const right = Math.min(a.width, Math.ceil((box.x + box.width - minX) * scale));
        const bottom = Math.min(a.height, Math.ceil((box.y + box.height - minY) * scale));
        if (right <= left || bottom <= top) throw new Error('Required independent region lies outside the comparison camera.');
        for (const surface of surfaces) {
          const limit = definition.limits.find(l => l.scale === scale && l.background === surface.background);
          const cropA = cropPixels(surface.a, left, top, right - left, bottom - top);
          const cropB = cropPixels(surface.b, left, top, right - left, bottom - top);
          const compared = compare(cropA, cropB, scale, limit, surface.background === 'transparent' ? null : surface.background);
          regionChecks.push({ id: definition.id, basis: definition.basis, actualElementId: definition.actualElementId,
            background: surface.background, rectanglePixels: box,
            pixelCrop: { left, top, width: right - left, height: bottom - top }, ...compared.metrics });
          const prior = regionCrops.findIndex(c => c.id === definition.id);
          if (!compared.metrics.passed && (prior < 0 ? regionCrops.length < policy.maxCrops : scale > regionCrops[prior].scale)) {
            // Keep the largest failing scale; a display-only failure still gets
            // inspectable crops when its supersampled comparison passes.
            const index = prior < 0 ? regionCrops.length : prior, prefix = 'region-crops/' + index;
            const opaque = canvas => {
              const out = makeCanvas(canvas.width, canvas.height), c = context(out);
              c.fillStyle = 'white'; c.fillRect(0, 0, out.width, out.height); c.drawImage(canvas, 0, 0); return out;
            };
            save(prefix + '-reference.png', opaque(cropA)); save(prefix + '-actual.png', opaque(cropB));
            save(prefix + '-difference.png', compared.amplified);
            const source = (scene.paths ?? []).find(p => p.svgElementId === definition.actualElementId);
            regionCrops[index] = { id: definition.id, rectanglePixels: box, background: surface.background, scale,
              source: source?.source, semanticId: source?.semanticId, attribution: 'declared independent region and candidate trace identity',
              cropBackground: surface.background === 'transparent' ? 'white' : surface.background,
              reference: prefix + '-reference.png', actual: prefix + '-actual.png', difference: prefix + '-difference.png' };
          }
        }
      }
      if (scale === Math.max(...policy.scales)) {
        largeReference = a; largeActual = b; largeDiff = result.amplified;
        for (const region of result.regions.slice(0, policy.maxCrops - regionCrops.length)) {
          const rectangle = { x: region.x / scale + minX, y: region.y / scale + minY, width: region.width / scale, height: region.height / scale };
          const attribution = (scene.paths ?? []).filter(p => {
            const box = p.inkBounds;
            return box && box.minX <= rectangle.x + rectangle.width && box.maxX >= rectangle.x && box.minY <= rectangle.y + rectangle.height && box.maxY >= rectangle.y;
          }).map(p => ({ semanticId: p.semanticId, svgElementId: p.svgElementId, source: p.source, attribution: 'geometric intersection' }));
          const index = regional.length;
          const crop = (canvas, name) => {
            const margin = 4 * scale, x = Math.max(0, region.x - margin), y = Math.max(0, region.y - margin);
            const w = Math.min(canvas.width - x, region.width + 2 * margin), h = Math.min(canvas.height - y, region.height + 2 * margin);
            const out = makeCanvas(w, h), ctx = context(out);
            // Inspection crops must remain legible when an image tool displays
            // transparency on a dark background. Raw comparison PNGs retain it.
            ctx.fillStyle = 'white'; ctx.fillRect(0, 0, w, h);
            ctx.drawImage(canvas, x, y, w, h, 0, 0, w, h); save(`crops/${index}-${name}.png`, out);
          };
          crop(a, 'reference'); crop(b, 'actual'); crop(result.amplified, 'difference');
          regional.push({ ...region, rectanglePixels: rectangle, scale, attribution, cropBackground: 'white' });
        }
      }
      if (pdfImages) {
        const pdf = await load(pdfImages[scale]);
        // Crop on the PDF rasterizer's native pixel lattice. Repositioning an already
        // rasterized page by fractional pixels would add a second antialiasing pass.
        const left = Math.floor((input.pdf.originPixels.x + minX) * scale);
        const top = Math.floor((input.pdf.originPixels.y + minY) * scale);
        const pdfCanvas = makeCanvas(width * scale, height * scale), ctx = context(pdfCanvas);
        ctx.fillStyle = 'white'; ctx.fillRect(0, 0, pdfCanvas.width, pdfCanvas.height);
        ctx.drawImage(pdf, -left, -top);
        const pdfAligned = (image, box) => {
          const canvas = makeCanvas(width * scale, height * scale), c = context(canvas);
          c.fillStyle = 'white'; c.fillRect(0, 0, canvas.width, canvas.height);
          c.drawImage(image, (input.pdf.originPixels.x + box.x) * scale - left,
            (input.pdf.originPixels.y + box.y) * scale - top, box.width * scale, box.height * scale);
          return canvas;
        };
        const pdfActual = pdfAligned(actualImage, actualBox);
        const pdfLimits = policy.pdf.byScale?.[scale] ?? policy.pdf;
        const pdfResult = compare(pdfCanvas, pdfActual, scale, pdfLimits, 'white');
        const driverResult = compare(pdfCanvas, pdfAligned(referenceImage, referenceBox), scale, pdfLimits, 'white');
        save(`reference-pdf${suffix}.png`, pdfCanvas); save(`actual-pdf${suffix}.png`, pdfActual); save(`diff-pdf${suffix}.png`, pdfResult.amplified);
        pdfChecks.push(pdfResult.metrics);
        driverChecks.push(driverResult.metrics);
        pdfCameras.push({ scale, pageCropPixels: { left, top }, registration: 'measured PDF page origin; integer native-pixel crop; no fitting or resampling' });
      }
    }
    const sheet = makeCanvas(largeReference.width * 3 + 40, largeReference.height + 40), ctx = context(sheet);
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, sheet.width, sheet.height); ctx.font = '14px sans-serif'; ctx.fillStyle = 'black';
    for (const [index, [title, canvas]] of [['TikZ reference (4x)', largeReference], [`${input.actualLabel ?? 'Lokad.TikZ'} (4x)`, largeActual], ['Difference (16x gain)', largeDiff]].entries()) {
      const x = 10 + index * (largeReference.width + 10); ctx.fillText(title, x, 18); ctx.drawImage(canvas, x, 28);
    }
    save('comparison.png', sheet);
    const overlay = makeCanvas(largeReference.width, largeReference.height), over = context(overlay);
    over.fillStyle = 'white'; over.fillRect(0, 0, overlay.width, overlay.height); over.globalAlpha = .5;
    over.drawImage(largeReference, 0, 0); over.drawImage(largeActual, 0, 0); save('overlay.png', overlay);
    const sizeErrors = [Math.abs(referenceInfo.width - actualInfo.width), Math.abs(referenceInfo.height - actualInfo.height)];
    return { files, primary: { passed: checks.every(c => c.passed) && regionChecks.every(c => c.passed), checks,
        ...(regionChecks.length ? { regionalChecks: regionChecks } : {}) },
      pdf: { required: Boolean(input.pdf), passed: pdfChecks.length > 0 && pdfChecks.every(c => c.passed) && driverChecks.every(c => c.passed), checks: pdfChecks, driverChecks, cameras: pdfCameras },
      dimensions: { reference: referenceInfo, actual: actualInfo, maxErrorPixels: Math.max(...sizeErrors), passed: sizeErrors.every(e => e <= input.numericTolerancePixels) },
      camera: { minX, minY, width, height, referenceBox, actualBox }, regions: regional,
      ...(regionChecks.length ? { regionalRegions: regionCrops, regionalCropLimit: policy.maxCrops,
        regionalCropsTruncated: new Set(regionChecks.filter(c => !c.passed).map(c => c.id)).size > regionCrops.length } : {}),
      pixelConvention: '8-bit sRGB samples; RGB premultiplied by alpha for errors; alpha channel included; mean error over all visible samples; edge/component masks threshold 16/255' };
  }, { input, scene, referenceSvg, actualSvg, pdfImages, policy });
  for (const [name, base64] of Object.entries(result.files)) {
    const output = path.join(bundle, name); await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, Buffer.from(base64, 'base64'));
  }
  delete result.files;
  const verdict = input.numeric.passed && result.primary.passed && result.dimensions.passed && (!input.pdf || result.pdf.passed);
  const artifacts = {};
  async function collect(folder, relative = '') {
    for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = path.posix.join(relative, entry.name), full = path.join(folder, entry.name);
      if (entry.isDirectory()) await collect(full, name);
      else if (!['report.json', 'index.html'].includes(name)) artifacts[name] = hash(await readFile(full));
    }
  }
  await collect(bundle);
  const report = { schemaVersion: 1, caseId: input.caseId, verdict: verdict ? 'pass' : 'mismatch', referenceMode: input.referenceMode,
    scope: input.scope,
    numeric: input.numeric, actualLabel: input.actualLabel ?? 'Lokad.TikZ', toleranceProfile: input.toleranceProfile ?? input.caseId,
    rasterPolicy: { id: rasterProfile.id, sha256: input.rasterProfile === 'text' ? hash(textProfileBytes)
      : input.rasterProfile === 'node' ? hash(nodeProfileBytes) : widthProfileBytes ? hash(widthProfileBytes) : renderer.identity.profileSha256 },
    renderer: renderer.identity, ...result, artifacts, sourceHash: hash(await readFile(path.join(bundle, 'source.tikz'))) };
  await writeFile(path.join(bundle, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(path.join(bundle, 'index.html'), viewer(report, await readFile(path.join(bundle, 'source.tikz'), 'utf8')));
  return report;
}

function viewer(report, source) {
  const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const embedded = JSON.stringify(report).replaceAll('<', '\\u003c');
  const independent = (report.regionalRegions ?? []).map(r => '<p>Independent region ' + escape(r.id)
    + ' (' + r.scale + 'x, ' + escape(r.background) + '): '
    + (r.source ? '<a href="#line-' + r.source.line + '">' + escape(r.semanticId) + ' at ' + r.source.line + ':' + r.source.column + '</a>' : 'No source attribution')
    + ' (' + escape(r.attribution) + ')</p><div class="regions"><img alt="Reference" src="' + escape(r.reference)
    + '"><img alt="Actual" src="' + escape(r.actual) + '"><img alt="Amplified difference" src="' + escape(r.difference) + '"></div>').join('');
  const regionalSection = report.primary.regionalChecks ? '<h2>Independent inspection regions</h2><p>Fixed oracle regions; raw native pixel crops. '
    + (report.regionalCropsTruncated ? 'Crop limit reached; all failures remain in the report.' : '') + '</p>' + independent : '';
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${escape(report.caseId)} comparison</title>
  <style>body{font:16px system-ui;margin:24px;background:#eee;color:#222}button,input{margin:8px}pre{white-space:pre-wrap;background:white;padding:16px}#frame{position:relative;overflow:auto;background:white;border:1px solid #999;height:360px}#camera{position:relative;transform-origin:0 0;width:${report.camera.width * 4}px;height:${report.camera.height * 4}px}#camera img{position:absolute;left:0;top:0}#actual{opacity:.5}.regions{display:flex;gap:12px;flex-wrap:wrap}.regions img{background:white;max-width:100%}a{color:#124c8e}</style>
  <h1>${escape(report.caseId)}: ${escape(report.verdict)}</h1>
  <p>Same physical origin and framing. Reference: MiKTeX/PGF. Actual: ${escape(report.actualLabel)}. Displayed at 4x.</p>
  <label>Zoom <input id="zoom" type="range" min=".5" max="8" step=".5" value="1"></label>
  <label>Actual opacity <input id="opacity" type="range" min="0" max="1" step=".05" value=".5"></label>
  <button id="blink">Blink</button><button id="reference">Reference</button><button id="candidate">Actual</button><button id="difference">Difference</button>
  <div id="frame"><div id="camera"><img id="expected" src="reference-4x.png"><img id="actual" src="actual-4x.png"></div></div>
  <p><a href="report.json">Machine-readable report</a> · <a href="actual-scene.json">Scene trace</a> · <a href="provenance.json">Provenance</a> · <a href="comparison.png">Comparison PNG</a></p>
  <pre id="metrics"></pre><h2>Source</h2><pre>${source.split('\n').map((line, i) => `<span id="line-${i + 1}"><a href="#line-${i + 1}">${i + 1}</a> ${escape(line)}</span>`).join('\n')}</pre><h2>Worst regions</h2>
  ${report.regions.map((r, i) => `<p>Region ${i}: ${r.attribution.map(a => `<a href="#line-${a.source.line}">${escape(a.semanticId)} at ${a.source.line}:${a.source.column}</a> (${escape(a.attribution)})`).join(', ') || 'No source attribution'}</p><div class="regions"><img src="crops/${i}-reference.png"><img src="crops/${i}-actual.png"><img src="crops/${i}-difference.png"></div>`).join('')}
  ${regionalSection}
  <script>const report=${embedded};const actual=document.getElementById('actual');const expected=document.getElementById('expected');let timer;
  function stop(){clearInterval(timer);timer=undefined;actual.src='actual-4x.png';expected.style.display='block';}
  document.getElementById('zoom').oninput=e=>document.getElementById('camera').style.transform='scale('+e.target.value+')';
  document.getElementById('opacity').oninput=e=>{stop();actual.style.opacity=e.target.value;};
  document.getElementById('reference').onclick=()=>{stop();actual.style.opacity=0;};
  document.getElementById('candidate').onclick=()=>{stop();actual.style.opacity=1;};
  document.getElementById('difference').onclick=()=>{stop();actual.src='diff-amplified-4x.png';actual.style.opacity=1;};
  document.getElementById('blink').onclick=()=>{stop();timer=setInterval(()=>actual.style.opacity=actual.style.opacity==='1'?'0':'1',500);};
  document.getElementById('metrics').textContent=JSON.stringify({numeric:report.numeric,primary:report.primary,pdf:report.pdf,dimensions:report.dimensions},null,2);</script></html>`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let renderer;
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node compare.mjs <comparison-directory>');
    renderer = await createRenderer();
    const report = await compareBundle(path.resolve(process.argv[2]), renderer);
    console.log(JSON.stringify({ caseId: report.caseId, verdict: report.verdict, numeric: report.numeric.passed, primary: report.primary.passed, pdf: report.pdf.passed, report: 'report.json' }));
    process.exitCode = report.verdict === 'pass' ? 0 : 1;
  } catch (error) { console.error(error.stack ?? error.message); process.exitCode = 2; }
  finally { if (renderer) await renderer.browser.close(); }
}
