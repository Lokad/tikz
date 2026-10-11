// Development-only raster observations. No candidate policy or converter code.
// A factory keeps exactly the same implementation usable in Node and Chromium.
export function createShapeRasterMetrics() {
  const require = (condition, message) => { if (!condition) throw new Error(message); };
  function foreground(data, i, background) {
    if (background === 'transparent') return data[i + 3];
    if (background === 'white') return 255 - Math.min(data[i], data[i + 1], data[i + 2]);
    return Math.max(data[i], data[i + 1], data[i + 2]);
  }
  function topology(mask, width, height) {
    const seen = new Uint8Array(mask.length), queue = new Int32Array(mask.length), edges = new Uint8Array(mask.length);
    let components = 0, edgePixels = 0;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const x = i % width, y = Math.floor(i / width);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1
          || !mask[i - 1] || !mask[i + 1] || !mask[i - width] || !mask[i + width]) { edges[i] = 1; edgePixels++; }
      if (seen[i]) continue;
      components++; let head = 0, tail = 1; queue[0] = i; seen[i] = 1;
      while (head < tail) {
        const p = queue[head++], px = p % width, py = Math.floor(p / width);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if ((dx === 0 && dy === 0) || px + dx < 0 || px + dx >= width || py + dy < 0 || py + dy >= height) continue;
          const q = p + dy * width + dx;
          if (mask[q] && !seen[q]) { seen[q] = 1; queue[tail++] = q; }
        }
      }
    }
    return { components, edges, edgePixels };
  }
  // Lower envelope of squared-distance parabolas; infinite inputs are omitted.
  function distanceLine(input, length, output, sites, breaks) {
    let last = -1;
    for (let q = 0; q < length; q++) {
      if (!Number.isFinite(input[q])) continue;
      let intersection = -Infinity;
      while (last >= 0) {
        const p = sites[last]; intersection = ((input[q] + q * q) - (input[p] + p * p)) / (2 * (q - p));
        if (intersection > breaks[last]) break;
        last--;
      }
      sites[++last] = q; breaks[last] = last === 0 ? -Infinity : intersection; breaks[last + 1] = Infinity;
    }
    if (last < 0) { output.fill(Infinity, 0, length); return; }
    let current = 0;
    for (let q = 0; q < length; q++) {
      while (current < last && breaks[current + 1] < q) current++;
      const p = sites[current]; output[q] = (q - p) * (q - p) + input[p];
    }
  }
  function directedEdgeDistance(from, to, width, height) {
    const distance = new Float64Array(to.length), length = Math.max(width, height);
    const input = new Float64Array(length), output = new Float64Array(length), sites = new Int32Array(length), breaks = new Float64Array(length + 1);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) input[x] = to[y * width + x] ? 0 : Infinity;
      distanceLine(input, width, output, sites, breaks);
      distance.set(output.subarray(0, width), y * width);
    }
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) input[y] = distance[y * width + x];
      distanceLine(input, height, output, sites, breaks);
      for (let y = 0; y < height; y++) distance[y * width + x] = output[y];
    }
    let maximum = 0;
    for (let i = 0; i < from.length; i++) if (from[i]) maximum = Math.max(maximum, distance[i]);
    return Math.sqrt(maximum);
  }
  function compare(reference, actual, options) {
    const { width, height, background, scale = 1, maskThreshold = 16 } = options;
    require(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width * height <= 20_000_000, 'Invalid raster dimensions.');
    require(['transparent', 'white', 'black'].includes(background), 'Invalid comparison background.');
    require(Number.isFinite(scale) && scale > 0 && scale <= 16, 'Invalid raster scale.');
    require(Number.isInteger(maskThreshold) && maskThreshold >= 1 && maskThreshold <= 255, 'Invalid foreground mask threshold.');
    for (const data of [reference, actual]) require(ArrayBuffer.isView(data) && data.BYTES_PER_ELEMENT === 1 && data.length === 4 * width * height
      && (data instanceof Uint8Array || data instanceof Uint8ClampedArray), 'Invalid RGBA buffer.');
    const box = options.rectangle ?? { x: 0, y: 0, width, height };
    require(['x', 'y', 'width', 'height'].every(k => Number.isInteger(box[k])) && box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0
      && box.x + box.width <= width && box.y + box.height <= height, 'Invalid integer raster region.');
    const referenceMask = new Uint8Array(box.width * box.height), actualMask = new Uint8Array(referenceMask.length);
    let masksEqual = true;
    let rawChanged = 0, rawMax = 0, premultipliedChanged = 0, premultipliedMax = 0, sum = 0, foregroundPixels = 0, referencePixels = 0, actualPixels = 0;
    for (let y = 0; y < box.height; y++) for (let x = 0; x < box.width; x++) {
      const i = 4 * ((y + box.y) * width + x + box.x), p = y * box.width + x;
      const identical = reference[i] === actual[i] && reference[i + 1] === actual[i + 1] && reference[i + 2] === actual[i + 2] && reference[i + 3] === actual[i + 3];
      const rf = foreground(reference, i, background), af = identical ? rf : foreground(actual, i, background);
      referenceMask[p] = Number(rf >= maskThreshold); actualMask[p] = Number(af >= maskThreshold);
      masksEqual &&= referenceMask[p] === actualMask[p];
      referencePixels += rf > 0; actualPixels += af > 0; foregroundPixels += rf > 0 || af > 0;
      if (identical) continue;
      let raw = 0, premultiplied = 0;
      for (let c = 0; c < 4; c++) {
        raw = Math.max(raw, Math.abs(reference[i + c] - actual[i + c]));
        const a = c === 3 ? reference[i + c] : Math.round(reference[i + c] * reference[i + 3] / 255);
        const b = c === 3 ? actual[i + c] : Math.round(actual[i + c] * actual[i + 3] / 255);
        const error = Math.abs(a - b); premultiplied = Math.max(premultiplied, error);
        if (rf > 0 || af > 0) sum += error;
      }
      rawChanged += raw !== 0; rawMax = Math.max(rawMax, raw);
      premultipliedChanged += premultiplied !== 0; premultipliedMax = Math.max(premultipliedMax, premultiplied);
    }
    const r = topology(referenceMask, box.width, box.height), a = masksEqual ? r : topology(actualMask, box.width, box.height);
    const edgeState = !r.edgePixels && !a.edgePixels ? 'both-empty' : !r.edgePixels ? 'reference-empty' : !a.edgePixels ? 'actual-empty' : 'measured';
    const sameEdges = masksEqual || r.edgePixels === a.edgePixels && r.edges.every((value, i) => value === a.edges[i]);
    const distance = sameEdges ? 0 : edgeState !== 'measured' ? null
      : Math.max(directedEdgeDistance(r.edges, a.edges, box.width, box.height), directedEdgeDistance(a.edges, r.edges, box.width, box.height));
    return { exactRgbaMatch: rawChanged === 0, rawChangedPixels: rawChanged, maxRawChannelError: rawMax,
      premultipliedChangedPixels: premultipliedChanged, maxPremultipliedChannelError: premultipliedMax,
      foregroundPixels, referenceForegroundPixels: referencePixels, actualForegroundPixels: actualPixels,
      meanForegroundChannelError: foregroundPixels ? sum / (4 * foregroundPixels) : 0,
      topology: { threshold: maskThreshold, connectivity: 8, edgeNeighborhood: 4, referenceComponents: r.components, actualComponents: a.components,
        componentDifference: Math.abs(r.components - a.components), referenceEdgePixels: r.edgePixels, actualEdgePixels: a.edgePixels,
        edgeState, maxEdgeDisplacementRasterPixels: distance, maxEdgeDisplacementCssPixels: distance === null ? null : distance / scale } };
  }
  return { compare };
}
