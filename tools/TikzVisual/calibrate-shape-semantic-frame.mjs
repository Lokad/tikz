import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRenderer } from './compare.mjs';
import { root, sha256, writeArtifact, outputPath } from './shape-oracle-bundle.mjs';
import { unionBounds } from './shape-frame-math.mjs';
import { createShapeRasterMetrics } from './shape-raster-metrics.mjs';

const output = path.join(root, 'artifacts/node-shape-semantic-frame');
const oracleFolder = path.join(output, 'oracle');
const toolFiles = ['tools/TikzVisual/calibrate-shape-semantic-frame.mjs', 'tools/TikzVisual/shape-raster-metrics.mjs',
  'tools/TikzVisual/shape-frame-math.mjs', 'tools/TikzVisual/shape-oracle-bundle.mjs', 'tools/TikzVisual/compare.mjs',
  'tools/TikzVisual/browser-profile.json', 'tools/TikzVisual/package.json', 'tools/TikzVisual/package-lock.json'];

async function inspectNativeFrames() {
  await new Promise((resolve, reject) => {
    const child = spawn('node', ['tools/TikzVisual/inspect-shape-frames.mjs', '--out', path.relative(root, oracleFolder)], { cwd: root, shell: false, windowsHide: true });
    let captured = '', settled = false;
    const finish = error => { if (settled) return; settled = true; clearTimeout(timer); if (error) { child.kill(); reject(error); } else resolve(); };
    const timer = setTimeout(() => finish(new Error('Independent shape frame inspection timed out.')), 240000);
    const capture = bytes => { captured += bytes.toString(); if (captured.length > 1048576) finish(new Error('Frame inspection output limit exceeded.')); };
    child.stdout.on('data', capture); child.stderr.on('data', capture); child.on('error', finish);
    child.on('close', code => { process.stdout.write(captured); finish(code === 0 ? null : new Error('Independent shape frame inspection failed: exit ' + code)); });
  });
}

async function main() {
  assert.equal(process.argv.length, 2, 'Usage: node tools/TikzVisual/calibrate-shape-semantic-frame.mjs');
  await outputPath(output);
  const tools = Object.fromEntries(await Promise.all(toolFiles.map(async file => [file, sha256(await readFile(path.join(root, file)))])));
  await inspectNativeFrames();
  const frameBytes = await readFile(path.join(oracleFolder, 'frames.json')), frames = JSON.parse(frameBytes);
  const derivationBytes = await readFile(path.join(oracleFolder, 'derivation.json')), derivation = JSON.parse(derivationBytes);
  assert.equal(frames.comparisonKind, 'oracle-only-shape-framing'); assert.equal(frames.completed, true);
  assert.equal(frames.converterInvoked, false); assert.equal(frames.conformanceClaim, false); assert.equal(frames.approvedImagePolicy, false);
  assert.equal(frames.analyticBrowserValidation.passed, true); assert.equal(frames.checks.length, 98);
  assert.ok(frames.checks.every(c => c.nativeInPicture.passed));
  assert.equal(sha256(derivationBytes), frames.derivation.sha256); assert.equal(derivation.converterInvoked, false);
  assert.deepEqual(derivation.counts, { nodes: 28, pathTokens: 420, glyphs: 70 });
  async function verify() {
    assert.equal(sha256(await readFile(path.join(oracleFolder, 'frames.json'))), sha256(frameBytes), 'Independent frame report changed.');
    assert.equal(sha256(await readFile(path.join(oracleFolder, 'derivation.json'))), sha256(derivationBytes), 'Independent derivation changed.');
    for (const [file, hash] of Object.entries({ ...derivation.evidence.artifacts, ...frames.artifacts })) {
      assert.ok(!path.isAbsolute(file) && !file.split(/[\\/]/).includes('..'), 'Invalid oracle artifact path.');
      assert.equal(sha256(await readFile(await outputPath(oracleFolder, file))), hash, 'Changed oracle artifact: ' + file);
    }
    for (const [file, hash] of Object.entries({ ...derivation.evidence.toolHashes, ...frames.toolHashes, ...tools }))
      assert.equal(sha256(await readFile(path.join(root, file))), hash, 'Changed experiment source: ' + file);
  }
  await verify();
  const semantic = unionBounds([frames.frames.picture, frames.frames.nativeInk]);
  const values = [semantic.minX, semantic.minY, semantic.maxX - semantic.minX, semantic.maxY - semantic.minY];
  const serialized = values.map(v => v.toFixed(6));
  const rootChecks = values.map((value, i) => ({ quantity: 'declaredRoot.' + ['x', 'y', 'width', 'height'][i],
    expected: value, serialized: Number(serialized[i]), error: Math.abs(value - Number(serialized[i])), limit: .000000500001, unit: 'CSS px' }));
  for (const c of rootChecks) { c.passed = c.error <= c.limit; assert.equal(c.passed, true); }
  const camera = frames.camera;
  assert.ok(Number.isInteger(camera.width) && Number.isInteger(camera.height) && camera.width * camera.height * 16 <= 20000000);
  const regions = frames.checks.map(c => {
    const b = unionBounds([c.native, c.driver]), x = Math.max(0, Math.floor(b.minX - camera.x - 3)), y = Math.max(0, Math.floor(b.minY - camera.y - 3));
    const rectangle = { x, y, width: Math.min(camera.width, Math.ceil(b.maxX - camera.x + 3)) - x,
      height: Math.min(camera.height, Math.ceil(b.maxY - camera.y + 3)) - y };
    assert.ok(rectangle.width > 0 && rectangle.height > 0);
    return { id: c.id, nodeId: c.nodeId, kind: c.kind, font: c.font ?? null, slot: c.slot ?? null, rectangle,
      basis: 'Union of independently evaluated original-driver and native tight ink bounds plus three CSS pixels; fixed before comparisons.' };
  });
  assert.equal(new Set(regions.map(r => r.id)).size, 98);
  const original = await readFile(path.join(oracleFolder, 'reference.svg'), 'utf8');
  const nativeSix = await readFile(path.join(oracleFolder, 'native-css-6.svg'), 'utf8');
  const metricSource = await readFile(path.join(root, 'tools/TikzVisual/shape-raster-metrics.mjs'), 'utf8');
  const renderer = await createRenderer(), artifacts = {}, measurements = [], repeats = [];
  try {
    assert.deepEqual(renderer.identity, frames.renderer, 'Oracle and experiment renderer identities differ.');
    await renderer.page.addScriptTag({ content: metricSource.replace(/^export /gm, '') + '\nglobalThis.shapeRasterMetrics = createShapeRasterMetrics();' });
    // Cross-check the browser implementation against Node using raw samples.
    const synthetic = new Uint8ClampedArray(16 * 16 * 4), moved = synthetic.slice();
    synthetic[4 * (2 * 16 + 2) + 3] = 255; moved[4 * (6 * 16 + 5) + 3] = 255;
    const syntheticOptions = { width: 16, height: 16, background: 'transparent', scale: 4 };
    const browserMetrics = await renderer.page.evaluate(({ a, b, options }) => globalThis.shapeRasterMetrics.compare(new Uint8ClampedArray(a), new Uint8ClampedArray(b), options),
      { a: [...synthetic], b: [...moved], options: syntheticOptions });
    assert.deepEqual(browserMetrics, createShapeRasterMetrics().compare(synthetic, moved, syntheticOptions));
    const rewrite = await renderer.page.evaluate(({ source, rootValues }) => {
      const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
      if (doc.querySelector('parsererror') || doc.doctype) throw new Error('Invalid native SVG.');
      const svg = doc.documentElement, before = svg.innerHTML;
      svg.setAttribute('width', rootValues[2] + 'px'); svg.setAttribute('height', rootValues[3] + 'px'); svg.setAttribute('viewBox', rootValues.join(' '));
      if (before !== svg.innerHTML) throw new Error('Root experiment changed native drawing instructions.');
      return { svg: new XMLSerializer().serializeToString(svg), drawingInstructionsUnchanged: true,
        counts: { paths: [...svg.querySelectorAll('path')].filter(p => !p.closest('defs')).length, glyphs: svg.querySelectorAll('use').length } };
    }, { source: nativeSix, rootValues: serialized });
    assert.deepEqual(rewrite.counts, { paths: 28, glyphs: 70 });
    await writeArtifact(output, 'native-semantic-css-6.svg', rewrite.svg, artifacts);
    for (const pair of ['original-primary', 'root-only']) for (const frame of ['natural', 'expanded']) for (const scale of [1, 4]) for (const background of ['transparent', 'white', 'black']) {
      const result = await renderer.page.evaluate(async ({ left, right, isDriver, origin, camera, regions, frame, scale, background }) => {
        const width = camera.width * scale, height = camera.height * scale, ns = 'http://www.w3.org/2000/svg';
        const make = (w = width, h = height) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
        const png = c => c.toDataURL('image/png').split(',')[1];
        function dimension(value) { const m = /^([-\d.e+]+)(px|pt)$/.exec(value ?? ''); if (!m) throw new Error('Unknown physical SVG dimension.'); return Number(m[1]) * (m[2] === 'pt' ? 4 / 3 : 1); }
        async function render(source, driver) {
          const doc = new DOMParser().parseFromString(source, 'image/svg+xml'), svg = doc.documentElement;
          if (doc.querySelector('parsererror') || doc.doctype || svg.localName !== 'svg') throw new Error('Invalid outlined SVG.');
          for (const e of doc.querySelectorAll('*')) {
            if (!['svg', 'g', 'defs', 'path', 'use', 'title', 'desc'].includes(e.localName)) throw new Error('Out-of-scope SVG element.');
            for (const a of e.attributes) if (a.name.startsWith('on') || (a.localName === 'href' && !/^#[\w.-]+$/.test(a.value))
              || a.value.includes('url(')) throw new Error('External or executable SVG reference.');
          }
          const view = (svg.getAttribute('viewBox') ?? '').split(/[ ,]+/).map(Number);
          if (view.length !== 4 || !view.every(Number.isFinite) || view[2] <= 0 || view[3] <= 0) throw new Error('Invalid SVG frame.');
          const natural = { x: driver ? (view[0] - origin.x) * 4 / 3 : view[0], y: driver ? (view[1] - origin.y) * 4 / 3 : view[1],
            width: dimension(svg.getAttribute('width')), height: dimension(svg.getAttribute('height')) };
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
        const reference = await render(left, isDriver), derived = await render(right, false), repeated = await render(left, isDriver);
        const options = { width, height, background, scale, maskThreshold: 16 }, compare = globalThis.shapeRasterMetrics.compare;
        const local = regions.map(r => ({ ...r, ...compare(reference.data, derived.data, { ...options, rectangle: {
          x: r.rectangle.x * scale, y: r.rectangle.y * scale, width: r.rectangle.width * scale, height: r.rectangle.height * scale } }) }));
        const difference = make(), amplified = make(), alphaDifference = make(), overlay = make();
        const dc = difference.getContext('2d'), ac = amplified.getContext('2d'), lc = alphaDifference.getContext('2d'), oc = overlay.getContext('2d');
        const d = dc.createImageData(width, height), a = ac.createImageData(width, height), l = lc.createImageData(width, height), o = oc.createImageData(width, height);
        for (let i = 0; i < reference.data.length; i += 4) {
          let maximum = 0;
          for (let c = 0; c < 4; c++) {
            const error = Math.abs(reference.data[i + c] - derived.data[i + c]); maximum = Math.max(maximum, error);
            if (c < 3) d.data[i + c] = error;
            o.data[i + c] = Math.round((reference.data[i + c] + derived.data[i + c]) / 2);
          }
          d.data[i + 3] = 255; a.data[i] = 255; a.data[i + 1] = a.data[i + 2] = 255 - Math.min(255, maximum * 16); a.data[i + 3] = 255;
          l.data[i] = l.data[i + 1] = l.data[i + 2] = Math.abs(reference.data[i + 3] - derived.data[i + 3]); l.data[i + 3] = 255;
        }
        dc.putImageData(d, 0, 0); ac.putImageData(a, 0, 0); lc.putImageData(l, 0, 0); oc.putImageData(o, 0, 0);
        const images = { reference: png(reference.canvas), derived: png(derived.canvas), difference: png(difference), 'alpha-difference': png(alphaDifference), amplified: png(amplified), overlay: png(overlay) };
        if (background === 'white' && scale === 1) {
          const c = make(3 * width, height + 28), ctx = c.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = 'black'; ctx.font = '16px sans-serif';
          [[reference.canvas, 'Reference'], [derived.canvas, 'Native semantic frame'], [amplified, 'Raw difference ×16']].forEach(([image, label], i) => { ctx.fillText(label, i * width + 8, 20); ctx.drawImage(image, i * width, 28); }); images.comparison = png(c);
        }
        const crops = local.slice().sort((a, b) => b.rawChangedPixels - a.rawChangedPixels || a.id.localeCompare(b.id)).slice(0, 4).map(r => {
          const rect = r.rectangle, w = rect.width * scale, h = rect.height * scale, panel = Math.max(w, 160), factor = scale === 1 ? 4 : 1;
          const paired = {};
          for (const [name, image] of [['reference', reference.canvas], ['derived', derived.canvas], ['difference', difference], ['amplified', amplified]]) {
            const c = make(w * factor, h * factor), ctx = c.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, c.width, c.height); ctx.imageSmoothingEnabled = false;
            ctx.drawImage(image, rect.x * scale, rect.y * scale, w, h, 0, 0, w * factor, h * factor); paired[name] = png(c);
          }
          const c = make(3 * panel, h + 50), ctx = c.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = 'black'; ctx.font = '14px sans-serif'; ctx.fillText(r.id, 6, 18);
          [[reference.canvas, 'reference'], [derived.canvas, 'native frame'], [amplified, 'raw difference ×16']].forEach(([image, label], i) => { ctx.fillText(label, i * panel + 6, 40); ctx.drawImage(image, rect.x * scale, rect.y * scale, w, h, i * panel + (panel - w) / 2, 50, w, h); });
          return { id: r.id, paired, sheet: png(c), presentation: { background: 'white', integerEnlargement: factor, rawDifferenceAmplification: 16, rasterRectangle: { x: rect.x * scale, y: rect.y * scale, width: w, height: h } } };
        });
        return { metrics: compare(reference.data, derived.data, options), regions: local, repeat: compare(reference.data, repeated.data, options), images, crops,
          naturalFrames: { reference: reference.natural, derived: derived.natural } };
      }, { left: pair === 'original-primary' ? original : nativeSix, right: rewrite.svg, isDriver: pair === 'original-primary', origin: derivation.originBp, camera, regions, frame, scale, background });
      assert.equal(result.repeat.exactRgbaMatch, true, 'Separately decoded unchanged images differ.');
      if (pair === 'root-only' && frame === 'expanded') assert.equal(result.metrics.exactRgbaMatch, true, 'Changing only the natural root changed expanded drawing pixels.');
      const prefix = `${pair}-${frame}-${scale}x-${background}`, links = {};
      for (const [name, image] of Object.entries(result.images)) { const file = prefix + '-' + name + '.png'; await writeArtifact(output, file, Buffer.from(image, 'base64'), artifacts); links[name] = file; }
      const cropLinks = new Map();
      for (const crop of result.crops) {
        const links = {};
        for (const [name, image] of Object.entries({ ...crop.paired, sheet: crop.sheet })) { const file = `crops/${prefix}-${crop.id}-${name}.png`; await writeArtifact(output, file, Buffer.from(image, 'base64'), artifacts); links[name] = file; }
        cropLinks.set(crop.id, { ...links, presentation: crop.presentation });
      }
      measurements.push({ pair, frame, scale, background, ...result.metrics, naturalFrames: result.naturalFrames,
        regions: result.regions.map(r => ({ ...r, crops: cropLinks.get(r.id) ?? null })), artifacts: links });
      repeats.push({ pair, frame, scale, background, ...result.repeat });
      console.log(prefix + ': ' + result.metrics.rawChangedPixels + ' changed RGBA pixels, maximum ' + result.metrics.maxRawChannelError + '/255.');
    }
    assert.equal(measurements.length, 24); assert.equal(measurements.reduce((sum, m) => sum + m.regions.length, 0), 2352); assert.equal(repeats.length, 24);
    await verify();
    for (const [file, hash] of Object.entries(artifacts)) assert.equal(sha256(await readFile(await outputPath(output, file))), hash);
    const contacts = measurements.filter(m => m.background === 'white' && m.scale === 1);
    const worst = measurements.flatMap(m => m.regions.filter(r => r.crops).map(r => ({ pair: m.pair, frame: m.frame, scale: m.scale, background: m.background, ...r })))
      .sort((a, b) => b.rawChangedPixels - a.rawChangedPixels || a.id.localeCompare(b.id)).slice(0, 32);
    const html = '<!doctype html><meta charset="utf-8"><title>Native semantic-frame calibration</title><h1>Circle/ellipse semantic-frame calibration — admission pending</h1>'
      + '<p>No candidate invoked. Natural roots and fixed expanded cameras are distinct experiments. Edge/component observations use a threshold of 16; all visible samples enter foreground channel error.</p><p><a href="report.json">Report</a> · <a href="oracle/source.tikz">Source</a> · <a href="oracle/frames.json">Independent ink and frames</a></p>'
      + contacts.map(m => `<h2>${m.pair} · ${m.frame}</h2><img style="max-width:100%" src="${m.artifacts.comparison}">`).join('')
      + '<h2>Largest retained regional differences</h2><ul>' + worst.map(r => `<li><a href="${r.crops.sheet}">${r.id} · ${r.pair} · ${r.frame} · ${r.scale}x · ${r.background}</a></li>`).join('') + '</ul>';
    await writeArtifact(output, 'index.html', html, artifacts);
    const report = { schemaVersion: 1, comparisonKind: 'oracle-only-shape-semantic-frame-calibration', completed: true, verdict: 'pending',
      converterInvoked: false, conformanceClaim: false, approvedImagePolicy: false, generatedUtc: new Date().toISOString(),
      scope: 'One trusted 28-node corpus; independently measured native picture and tight glyph/stroke ink union. Six-decimal root origin and size, zero padding. All drawing instructions retained from native-css-6. No candidate-derived data or acceptance thresholds.',
      independentEvidence: { frames: 'oracle/frames.json', framesSha256: sha256(frameBytes), derivation: 'oracle/derivation.json', derivationSha256: sha256(derivationBytes) },
      tools, renderer: renderer.identity, semanticFrame: semantic, serializedRoot: serialized.map(Number), rootSerialization: { passed: true, checks: rootChecks },
      drawingInstructionsUnchanged: rewrite.drawingInstructionsUnchanged, camera, regionBasis: 'Independent original/native tight bounds, with three CSS pixels of padding, fixed before rendering.',
      metricConvention: 'Exact equality and difference PNGs use unmodified RGBA. Foreground means use rounded premultiplied RGBA and every visible sample, excluding blank pixels. Topology uses a 16/255 foreground mask, eight-neighbor components, four-neighbor boundaries and symmetric Euclidean boundary distance; missing edges are explicit null distances with an absent-edge state. Distances are reported in raster and CSS pixels. These are observations, not tolerances.',
      measurements, repeatability: { passed: true, captures: repeats }, artifacts,
      agent: { state: 'pending', firstPendingRequiredGate: 'reviewed-regional-image-policy', report: 'report.json', viewer: 'index.html', source: 'oracle/source.tikz',
        focusedRerun: 'node tools/TikzVisual/calibrate-shape-semantic-frame.mjs', controls: 'node tools/TikzVisual/shape-raster-self-test.mjs',
        worstRegions: worst.map(r => ({ id: r.id, nodeId: r.nodeId, pair: r.pair, frame: r.frame, scale: r.scale, background: r.background, rawChangedPixels: r.rawChangedPixels, crops: r.crops })) },
      remaining: ['Focused/interaction reference coverage.', 'Oracle-only per-region acceptance policy and image-only missing/faint-content controls.',
        'Combined candidate numeric/frame/global/local gates.', 'Ordinary PDF reference and independent cross-renderer calibration.', 'Reviewed admission and hosted execution.'] };
    await writeArtifact(output, 'report.json', JSON.stringify(report, null, 2) + '\n');
    console.log('Native semantic-frame calibration: 24 whole-picture, 2,352 regional observations and 24 exact repeats. Image/PDF admission remains pending.');
  } finally { await renderer.browser.close(); }
}
await main().catch(async error => {
  console.error(error.stack ?? String(error)); process.exitCode = 2;
  try { await writeArtifact(output, 'report.json', JSON.stringify({ schemaVersion: 1, completed: false, verdict: 'infrastructure-error', converterInvoked: false, conformanceClaim: false, error: error.message }, null, 2) + '\n'); } catch { }
});
