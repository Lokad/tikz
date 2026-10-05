import assert from 'node:assert/strict';

const factor = 96 / 72.27, tolerance = 0.00004;
const normalize = segments => {
  const result = [];
  for (const segment of segments) {
    if (segment.kind === 'Move' && result.at(-1)?.kind === 'Move') result.pop();
    result.push(segment);
  }
  if (result.at(-1)?.kind === 'Move') result.pop();
  return result;
};

// Independently validate the reference runner's numeric evidence against its
// native measurements and actual exported scene. Never accept a boolean alone.
export function borderNativeChecks(reference, scene) {
  assert.equal(reference.schemaVersion, 2); assert.equal(scene.schemaVersion, 1);
  const checks = [];
  const number = (name, expected, actual, units = 'CSS pixels', allowed = tolerance) => {
    assert.ok(Number.isFinite(expected) && Number.isFinite(actual), 'Nonfinite numeric quantity: ' + name);
    const absoluteError = Math.abs(expected - actual);
    checks.push({ name, expected, actual, units, absoluteError, tolerance: allowed, passed: absoluteError <= allowed });
  };
  const equal = (name, expected, actual, units = 'value') =>
    checks.push({ name, expected, actual, units, absoluteError: null, tolerance: 0, passed: expected === actual });
  const b = reference.pictureBoundsPt, a = scene.pictureBounds;
  number('picture.minX', b.minX * factor, a.minX); number('picture.minY', -b.maxY * factor, a.minY);
  number('picture.maxX', b.maxX * factor, a.maxX); number('picture.maxY', -b.minY * factor, a.maxY);
  number('box.width', reference.boxPt.width * factor, a.width);
  number('box.height+depth', (reference.boxPt.height + reference.boxPt.depth) * factor, a.height);
  for (const [name, expected] of Object.entries(reference.anchorsPt)) {
    const actual = scene.coordinates[name]; assert.ok(actual, 'Missing required scene anchor: ' + name);
    number('anchor.' + name + '.x', expected.x * factor, actual.x);
    number('anchor.' + name + '.y', -expected.y * factor, actual.y);
  }
  number('paintedPathCount', reference.paths.length, scene.paths.length, 'count', 0);
  assert.equal(scene.paths.length, reference.paths.length, 'Incomplete scene path coverage.');
  for (const [index, expected] of reference.paths.entries()) {
    const actual = scene.paths[index], name = 'path.' + index, paint = actual.paint;
    assert.equal(actual.semanticId, 'path-' + index); assert.equal(actual.svgElementId, 'candidate-p' + index);
    const segments = normalize(actual.segments);
    number(name + '.segmentCount', expected.segments.length, segments.length, 'count', 0);
    assert.equal(segments.length, expected.segments.length, 'Incomplete scene segment coverage.');
    for (const [i, segment] of expected.segments.entries()) {
      const candidate = segments[i], prefix = name + '.segment.' + i;
      equal(prefix + '.kind', segment.kind, candidate.kind);
      for (const field of segment.kind === 'Cubic' && candidate.kind === 'Cubic' ? ['end', 'control1', 'control2'] : ['end']) {
        number(prefix + '.' + field + '.x', segment[field].x * factor, candidate[field].x);
        number(prefix + '.' + field + '.y', segment[field].y * factor, -candidate[field].y);
      }
    }
    equal(name + '.stroke', expected.stroke, paint.stroke); equal(name + '.fill', expected.fill, paint.fill);
    if (expected.stroke) {
      number(name + '.stroke.width', expected.widthPt * factor, paint.strokeWidthPixels);
      number(name + '.stroke.opacity', expected.strokeOpacity, paint.strokeOpacity, 'unit interval', 0.000001);
      equal(name + '.stroke.color', expected.strokeColor, paint.strokeColor, 'sRGB hex');
      equal(name + '.stroke.cap', expected.cap, paint.cap); equal(name + '.stroke.join', expected.join, paint.join);
      number(name + '.dash.count', expected.dashPt.length, paint.dashPixels.length, 'count', 0);
      assert.equal(expected.dashPt.length, paint.dashPixels.length);
      for (const [i, dash] of expected.dashPt.entries()) number(name + '.dash.' + i, dash * factor, paint.dashPixels[i]);
      number(name + '.dash.phase', expected.dashPhasePt * factor, paint.dashPhasePixels);
    }
    if (expected.fill) {
      number(name + '.fill.opacity', expected.fillOpacity, paint.fillOpacity, 'unit interval', 0.000001);
      equal(name + '.fill.color', expected.fillColor, paint.fillColor, 'sRGB hex');
      equal(name + '.fill.rule', expected.fillRule, paint.fillRule);
    }
  }
  number('clipCount', reference.clips.length, scene.clips.length, 'count', 0);
  assert.equal(reference.clips.length, 0); assert.equal(scene.clips.length, 0);
  return checks;
}

export function requireBorderNumeric(reported, reference, scene, expectedCount) {
  const checks = borderNativeChecks(reference, scene);
  assert.equal(checks.length, expectedCount); assert.equal(reported.checks.length, checks.length);
  assert.equal(new Set(reported.checks.map(c => c.name)).size, checks.length);
  for (const [i, check] of checks.entries()) {
    const supplied = reported.checks[i];
    for (const key of ['name', 'units', 'tolerance', 'passed']) assert.deepEqual(supplied[key], check[key], 'Numeric evidence differs: ' + check.name + '/' + key);
    for (const key of ['expected', 'actual', 'absoluteError']) {
      if (typeof check[key] === 'number') assert.ok(Number.isFinite(supplied[key]) && Math.abs(supplied[key] - check[key]) < 1e-10,
        'Numeric evidence differs from the native scene: ' + check.name + '/' + key);
      else assert.deepEqual(supplied[key], check[key]);
    }
  }
  assert.equal(reported.passed, checks.every(c => c.passed), 'Inconsistent numeric verdict.');
  return checks;
}

export function borderInkChecks(frame, scene) {
  assert.equal(frame.paths.length, scene.paths.length);
  return frame.paths.flatMap((path, index) => {
    assert.equal(path.pathIndex, index);
    const b = path.boundsPt, actual = scene.paths[index].inkBounds;
    return Object.entries({ minX: b.minX * factor, minY: -b.maxY * factor, maxX: b.maxX * factor, maxY: -b.minY * factor })
      .map(([key, expected]) => {
        assert.ok(Number.isFinite(actual[key])); const absoluteError = Math.abs(expected - actual[key]);
        return { name: 'path.' + index + '.ink.' + key, expected, actual: actual[key], units: 'CSS pixels',
          absoluteError, tolerance, passed: absoluteError <= tolerance };
      });
  });
}
