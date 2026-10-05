import assert from 'node:assert/strict';

// A complete global-plus-local verdict. This function sets no limits; callers
// must pin their independent experiment or label a prospective trial.
export function pdfRegionVerdict(measurements, regions) {
  assert.ok(Array.isArray(regions) && regions.length > 0);
  assert.equal(new Set(regions.map(r => r.id)).size, regions.length);
  assert.equal(measurements.length, regions.length * 2, 'Missing PDF measurement coverage.');
  assert.equal(new Set(measurements.map(m => m.id + '/' + m.scale)).size, measurements.length);
  const checks = [];
  for (const region of regions) {
    assert.equal(region.limits.length, 2);
    assert.deepEqual(region.limits.map(l => l.scale), [1, 4]);
    for (const limit of region.limits) {
      assert.equal(limit.background, 'white');
      assert.ok([limit.maxChannelError, limit.maxMeanForegroundError, limit.maxEdgeDisplacementPixels,
        limit.maxComponentDifference].every(v => Number.isFinite(v) && v >= 0), 'Unresolved PDF limit.');
      assert.ok(limit.maxChannelError <= 255 && limit.maxMeanForegroundError <= 255 && Number.isSafeInteger(limit.maxComponentDifference));
      const m = measurements.find(m => m.id === region.id && m.scale === limit.scale);
      assert.ok(m); assert.equal(m.background, 'white');
      const passed = m.maxChannelError <= limit.maxChannelError && m.meanForegroundError <= limit.maxMeanForegroundError
        && m.maxEdgeDisplacementPixels !== null && m.maxEdgeDisplacementPixels <= limit.maxEdgeDisplacementPixels
        && Math.abs(m.referenceComponents - m.actualComponents) <= limit.maxComponentDifference;
      checks.push({ ...m, thresholds: limit, passed });
    }
  }
  return { passed: checks.every(c => c.passed), checks };
}
