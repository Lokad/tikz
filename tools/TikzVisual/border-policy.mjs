import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPdfNativeGeometry } from './pdf-native-geometry.mjs';
import { pdfRegionVerdict } from './pdf-region-verdict.mjs';

export const borderIds = ['node-border-lines', 'node-border-paths', 'node-border-transforms'];
export const borderCounts = { 'node-border-lines': [284, 14, 40], 'node-border-paths': [302, 11, 51], 'node-border-transforms': [249, 11, 49] };
export const borderPolicyId = 'chromium-153-rectangle-borders-ink-pdf-v1';
export const borderScope = 'Three unlabelled rectangle-border path fixtures only; independent stroke-ink frame; calibrated primary SVG and white-paper ordinary PDF; native numeric, ink/frame, whole-picture and all regional gates required';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const scales = [1, 4], backgrounds = ['transparent', 'white', 'black'];
const snapshots = { frame: 'framing.json', primary: 'primary-regions.json', pdf: 'pdf-regions.json',
  primaryTrial: 'primary-region-trial.json', pdfTrial: 'pdf-region-trial.json' };
const tools = {
  frame: ['tests/Reference/NodeBorders/path-cases.json', 'tools/TikzReference/BorderFraming.cs', 'tools/TikzReference/OracleStrokeFrame.cs',
    'tools/TikzReference/ReferenceMeasurements.cs', 'tools/TikzReference/Program.cs', 'tools/TikzVisual/compare.mjs', 'tools/TikzVisual/browser-profile.json'],
  primary: ['tools/TikzVisual/calibrate-border-regions.mjs', 'tools/TikzVisual/compare.mjs', 'tools/TikzVisual/browser-profile.json', 'tools/TikzReference/ReferenceCalibration.cs'],
  pdf: ['tools/TikzVisual/calibrate-border-pdf-regions.mjs', 'tools/TikzVisual/compare.mjs', 'tools/TikzVisual/browser-profile.json',
    'tools/TikzVisual/pdf-region-renderer.mjs', 'tools/TikzVisual/pdf-native-geometry.mjs', 'tools/TikzVisual/pdf-region-viewer.mjs'],
  primaryTrial: ['tools/TikzVisual/trial-border-regions.mjs', 'tools/TikzVisual/compare.mjs'],
  pdfTrial: ['tools/TikzVisual/trial-border-pdf-regions.mjs', 'tools/TikzVisual/compare.mjs', 'tools/TikzVisual/pdf-region-renderer.mjs', 'tools/TikzVisual/pdf-region-viewer.mjs']
};
export const borderGuardTools = ['tools/TikzVisual/border-policy.mjs', 'tools/TikzVisual/border-numeric.mjs',
  'tools/TikzVisual/border-conformance.mjs', 'tools/TikzVisual/compare-border-conformance.mjs', 'tools/TikzVisual/border-self-test.mjs',
  'tools/TikzVisual/compare.mjs', 'tools/TikzVisual/browser-profile.json',
  'tools/TikzVisual/pdf-region-renderer.mjs', 'tools/TikzVisual/pdf-region-verdict.mjs', 'tools/TikzVisual/pdf-native-geometry.mjs'];

export function requireBorderRenderer(actual, expected) {
  for (const key of ['profile', 'playwright', 'browser', 'browserSha256', 'profileSha256', 'os', 'architecture', 'node'])
    assert.equal(actual[key], expected[key], 'Border renderer differs: ' + key);
}
const validMeasurement = m => Number.isFinite(m.maxChannelError) && m.maxChannelError >= 0 && m.maxChannelError <= 255
  && Number.isFinite(m.meanForegroundError) && m.meanForegroundError >= 0 && m.meanForegroundError <= 255
  && Number.isFinite(m.maxEdgeDisplacementPixels) && m.maxEdgeDisplacementPixels >= 0
  && [m.changedPixels, m.foregroundPixels, m.referenceComponents, m.actualComponents].every(n => Number.isSafeInteger(n) && n >= 0)
  && m.exactMatch === (m.changedPixels === 0);
const regionKey = c => c.id + '/' + c.scale + '/' + c.background;
function requireCoverage(checks, ids, requiredBackgrounds, allowMissingEdges = false) {
  assert.equal(checks.length, ids.length * scales.length * requiredBackgrounds.length);
  const keys = checks.map(regionKey);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(keys.toSorted(), scales.flatMap(scale => ids.flatMap(id => requiredBackgrounds.map(background =>
    id + '/' + scale + '/' + background))).toSorted());
  assert.ok(checks.every(c => validMeasurement(allowMissingEdges && c.maxEdgeDisplacementPixels === null
    ? { ...c, maxEdgeDisplacementPixels: 0 } : c)), 'Invalid or unresolved independent measurements.');
}
export function borderLimits(checks) {
  assert.ok(checks.length > 0 && checks.every(validMeasurement));
  return { maxChannelError: Math.max(...checks.map(c => c.maxChannelError)),
    maxMeanForegroundError: Math.ceil(Math.max(...checks.map(c => c.meanForegroundError)) * 1e6) / 1e6,
    maxEdgeDisplacementPixels: Math.max(...checks.map(c => c.maxEdgeDisplacementPixels)),
    maxComponentDifference: Math.max(...checks.map(c => Math.abs(c.referenceComponents - c.actualComponents))) };
}
export function borderGlobalLimits(checks) {
  const { maxEdgeDisplacementPixels: unused, ...limits } = borderLimits(checks);
  return { ...limits, maxEdgeDisplacementRasterPixels: Math.max(...checks.map(c => c.maxEdgeDisplacementPixels * c.scale)) };
}
export function borderMutations(id) {
  const result = ['unchanged-1', 'unchanged-2', 'missing-border', 'quarter-pixel-shift', 'double-stroke', 'half-opacity', 'round-caps'];
  if (id === 'node-border-lines') result.push('joined-border-gap', 'missing-short-line');
  if (id === 'node-border-paths') result.push('bevel-triangle', 'open-triangle', 'height-crop', 'numeric-failure');
  return result;
}

export async function loadBorderPolicy(read = readFile) {
  const policyBytes = await read(path.join(root, 'tools/TikzVisual/border-profile.json')), declared = JSON.parse(policyBytes);
  assert.equal(declared.schemaVersion, 1); assert.equal(declared.id, borderPolicyId); assert.equal(declared.scope, borderScope);
  assert.equal(declared.approvedPrimaryPolicy, true); assert.equal(declared.approvedPdfPolicy, true);
  assert.equal(declared.renderMode, 'page-coordinates'); assert.equal(declared.numericTolerancePixels, 0.00004);
  assert.deepEqual(declared.scales, scales); assert.deepEqual(declared.backgrounds, backgrounds);
  assert.deepEqual(Object.keys(declared.cases), borderIds);
  assert.deepEqual(Object.keys(declared.evidence), Object.keys(snapshots));
  const evidence = {};
  for (const [key, name] of Object.entries(snapshots)) {
    const pin = declared.evidence[key]; assert.equal(pin.file, 'tests/Reference/NodeBorders/' + name);
    const bytes = await read(path.join(root, pin.file)); assert.equal(hash(bytes), pin.sha256, 'Changed independent border snapshot: ' + name);
    const value = evidence[key] = JSON.parse(bytes);
    assert.equal(value.schemaVersion, 1); assert.equal(value.completed, true); assert.equal(value.approvedPolicy, false);
    assert.equal(value.conformanceClaim, false); assert.deepEqual(value.expectedCases, borderIds);
    if (!key.endsWith('Trial')) { assert.equal(value.converterInvoked, false); assert.deepEqual(value.cases.map(c => c.caseId), borderIds); }
    else { assert.equal(value.passed, true); assert.equal(value.trials.length, 27); }
    assert.deepEqual(Object.keys(value.toolHashes).toSorted(), tools[key].toSorted(), 'Missing calibration tool provenance.');
    for (const [file, sha256] of Object.entries(value.toolHashes))
      assert.equal(hash(await read(path.join(root, file))), sha256, 'Changed border calibration tool: ' + file);
  }
  assert.deepEqual(Object.keys(declared.guardToolHashes).toSorted(), borderGuardTools.toSorted());
  for (const [file, sha256] of Object.entries(declared.guardToolHashes))
    assert.equal(hash(await read(path.join(root, file))), sha256, 'Changed border gate tool: ' + file);
  const { frame, primary, pdf, primaryTrial, pdfTrial } = evidence;
  assert.equal(primary.nativeFrameSnapshotSha256, declared.evidence.frame.sha256);
  assert.equal(pdf.nativeFrameSnapshotSha256, declared.evidence.frame.sha256);
  assert.equal(pdf.primaryCalibrationSha256, declared.evidence.primary.sha256);
  assert.equal(primaryTrial.calibrationSha256, declared.evidence.primary.sha256);
  assert.equal(pdfTrial.pdfCalibrationSha256, declared.evidence.pdf.sha256);
  assert.equal(pdfTrial.primaryTrialSha256, declared.evidence.primaryTrial.sha256);
  assert.deepEqual(primary.scales, scales); assert.deepEqual(primary.backgrounds, backgrounds);
  assert.deepEqual(pdf.scales, scales); assert.deepEqual(pdf.backgrounds, ['white']); assert.equal(pdf.renderMode, declared.renderMode);
  assert.equal(primary.basePrecisionEvidence.converterInvoked, false);
  assert.deepEqual(primary.basePrecisionEvidence.cases.map(c => c.caseId), borderIds);
  const base = primary.basePrecisionEvidence;
  const baseTools = ['tools/TikzVisual/browser-profile.json', 'tools/TikzVisual/compare.mjs', 'tools/TikzReference/Program.cs',
    'tools/TikzReference/ReferenceCalibration.cs', 'tests/Reference/NodeBorders/path-cases.json'];
  assert.deepEqual(Object.keys(base.toolHashes).toSorted(), baseTools.toSorted());
  for (const [file, sha256] of Object.entries(base.toolHashes)) assert.equal(hash(await read(path.join(root, file))), sha256);
  const manifest = JSON.parse(await read(path.join(root, 'tests/Reference/NodeBorders/path-cases.json')));
  assert.deepEqual(manifest.cases.map(c => c.id), borderIds);
  for (const id of borderIds) {
    const f = frame.cases.find(c => c.caseId === id), p = primary.cases.find(c => c.caseId === id), d = pdf.cases.find(c => c.caseId === id);
    const [nativeCount, pathCount, localCount] = borderCounts[id];
    assert.equal(f.frame.paths.length, pathCount); assert.equal(f.regions.length, localCount);
    assert.equal(p.regions.length, localCount); assert.equal(d.regions.length, localCount + 1);
    assert.deepEqual(p.frame, f.frame); assert.deepEqual(p.originalProvenance, f.originalProvenance); assert.deepEqual(d.originalProvenance, f.originalProvenance);
    assert.equal(p.sourceSha256, f.sourceSha256); assert.equal(d.sourceSha256, f.sourceSha256);
    assert.equal(p.referenceSha256, f.expandedOracleSha256); assert.equal(hash(p.referenceSvg), p.referenceSha256);
    const definition = manifest.cases.find(c => c.id === id);
    assert.equal(definition.numericTolerancePixels, 0.00004);
    assert.equal(hash(await read(path.join(root, definition.source))), f.sourceSha256);
    assert.deepEqual(JSON.parse(f.originalProvenance.caseDefinition), definition);
    for (const [file, sha256] of Object.entries(f.originalProvenance.artifacts)) {
      assert.equal(path.basename(file), file);
      assert.equal(hash(await read(path.join(root, 'tests/Reference', id, file))), sha256, 'Changed native artifact: ' + file);
    }
    assert.equal(hash(await read(path.join(root, 'tests/Reference/wrapper.tex'))), f.originalProvenance.wrapperSha256);
    assert.equal(hash(await read(path.join(root, 'tests/Reference/oracle-profile.json'))), f.originalProvenance.profileSha256);
    const metrics = JSON.parse(await read(path.join(root, 'tests/Reference', id, 'reference-metrics.json')));
    assert.deepEqual(d.pdfOriginPixels, metrics.pdfOriginPixels);
    assert.deepEqual(d.native, verifyPdfNativeGeometry((await read(path.join(root, 'tests/Reference', id, 'oracle.log'))).toString()));
    for (const value of [p, d]) assert.equal(new Set(value.regions.map(r => r.id)).size, value.regions.length);
    assert.deepEqual(p.regions.map(({ limits, ...region }) => region), f.regions.map(({ limits, ...region }) => region));
    const b = f.frame.expandedPixels;
    assert.deepEqual(d.regions[0], { id: 'whole-picture', basis: 'Independent native stroke frame plus fixed eight CSS pixel padding',
      rectanglePixels: { x: b.minX - 8, y: b.minY - 8, width: b.maxX - b.minX + 16, height: b.maxY - b.minY + 16 }, limits: d.regions[0].limits });
    assert.deepEqual(d.regions.slice(1).map(({ limits, ...r }) => r), f.regions.map(({ id, basis, rectanglePixels }) => ({ id, basis, rectanglePixels })));
    assert.deepEqual(p.variants.map(v => v.mode), ['flattened', 'precision-plus', 'precision-minus']);
    requireBorderRenderer(primary.renderer, primary.basePrecisionEvidence.renderer); requireBorderRenderer(pdf.renderer, primary.renderer);
    requireBorderRenderer(primaryTrial.renderer, primary.renderer); requireBorderRenderer(pdfTrial.renderer, primary.renderer);
    const precision = base.cases.find(c => c.caseId === id);
    assert.equal(precision.sourceSha256, f.sourceSha256);
    assert.equal(precision.referenceSvgSha256, f.originalProvenance.artifacts['reference.svg']);
    assert.equal(precision.referenceMetricsSha256, f.originalProvenance.artifacts['reference-metrics.json']);
    assert.deepEqual(precision.variants.map(v => v.mode), p.variants.map(v => v.mode));
    for (const v of p.variants) {
      const original = precision.variants.find(c => c.mode === v.mode);
      assert.deepEqual(v.precisionProvenance, original.provenance); assert.deepEqual(v.numeric, original.numeric);
      assert.equal(v.sourceRepresentationSha256, original.oracleRepresentationSha256);
      assert.equal(v.repeatedMeasurements, true); assert.equal(v.repeatedCaptures, true);
      assert.equal(v.numeric.passed, true); assert.equal(v.dimensions.passed, true);
      assert.equal(v.precisionProvenance.converterInvoked, false); assert.equal(hash(v.svg), v.representationSha256);
      assert.equal(v.perturbationPt, v.mode === 'flattened' ? 0 : (v.mode === 'precision-plus' ? 4 : -4) / 65536);
      const frameConversionErrorPixels = Math.max(Math.abs(b.maxX - b.minX - f.frame.camera.expanded[2] * 4 / 3),
        Math.abs(b.maxY - b.minY - f.frame.camera.expanded[3] * 4 / 3));
      const frameExpansionPixels = 2 * Math.abs(v.perturbationPt) * 96 / 72.27;
      const dimensionErrorBoundPixels = frameConversionErrorPixels + frameExpansionPixels + 0.0000005 + 1e-12;
      assert.deepEqual(v.framePrecision, { frameConversionErrorPixels, frameExpansionPixels, serializationErrorPixels: 0.0000005,
        dimensionErrorBoundPixels, calibrationDimensionTolerancePixels: Math.max(original.provenance.calibrationNumericTolerancePixels, dimensionErrorBoundPixels) });
      assert.ok(v.dimensions.maxErrorPixels <= v.framePrecision.calibrationDimensionTolerancePixels);
      requireCoverage(v.regions, f.regions.map(r => r.id), backgrounds);
      requireCoverage(v.primary.map(c => ({ ...c, id: 'whole-picture', background: c.background ?? 'transparent' })), ['whole-picture'], backgrounds);
    }
    for (const region of p.regions) {
      assert.deepEqual(region.limits.map(l => [l.scale, l.background]), scales.flatMap(s => backgrounds.map(bg => [s, bg])));
      for (const l of region.limits) assert.deepEqual(l, { scale: l.scale, background: l.background,
        ...borderLimits(p.variants.flatMap(v => v.regions).filter(c => regionKey(c) === regionKey({ id: region.id, ...l }))) });
    }
    assert.deepEqual(declared.cases[id], { nativeChecks: nativeCount, inkChecks: pathCount * 4, primaryRegions: localCount,
      pdfRegions: localCount + 1, primary: borderGlobalLimits(p.variants.flatMap(v => v.primary)) });
    assert.deepEqual(d.variants.map(v => v.mode), ['expanded-native-driver', 'flattened', 'precision-plus', 'precision-minus']);
    for (const [index, v] of d.variants.entries()) {
      assert.equal(v.svgSha256, index === 0 ? p.referenceSha256 : p.variants[index - 1].representationSha256);
      assert.equal(v.units, index === 0 ? 'bp' : 'cssPixels');
      assert.equal(v.repeatedMeasurements, true); assert.equal(v.repeatedWholePictureCaptures, true);
      requireCoverage(v.measurements, d.regions.map(r => r.id), ['white']);
    }
    for (const region of d.regions) {
      assert.deepEqual(region.limits.map(l => l.scale), scales);
      for (const l of region.limits) assert.deepEqual(l, { scale: l.scale, background: 'white',
        ...borderLimits(d.variants.flatMap(v => v.measurements).filter(c => c.id === region.id && c.scale === l.scale)) });
    }
    assert.ok(d.variants.every(v => pdfRegionVerdict(v.measurements, d.regions).passed));
    for (const trial of [primaryTrial, pdfTrial]) {
      const records = trial.trials.filter(t => t.caseId === id);
      assert.deepEqual(records.map(t => t.mutation), borderMutations(id));
      assert.ok(records.every(t => t.requirementMet && t.targetedRegionRejected && t.sourceSha256 === f.sourceSha256));
      for (const t of records) {
        const expected = t.mutation.startsWith('unchanged') || trial === pdfTrial && t.mutation === 'numeric-failure' ? 'pass' : 'mismatch';
        assert.equal(t.expected, expected); assert.equal(t.verdict, expected);
        assert.equal(t.artifacts['actual.svg'], t.actualSha256);
        const target = t.mutation === 'missing-border' ? 'path-0' : t.mutation === 'joined-border-gap' ? 'path-3'
          : t.mutation === 'missing-short-line' ? 'path-9' : ['bevel-triangle', 'open-triangle'].includes(t.mutation) ? 'path-8-miter-' : null;
        const targeted = c => target.endsWith('-') ? c.id.startsWith(target) : c.id === target;
        if (trial === pdfTrial) { assert.equal(t.pdfPassed, expected === 'pass'); assert.equal(t.repeatedMeasurements, true);
          assert.equal(t.numericBypassed, true); requireCoverage(t.checks, d.regions.map(r => r.id), ['white'], true);
          const verdict = pdfRegionVerdict(t.checks, d.regions); assert.equal(verdict.passed, t.pdfPassed);
          assert.equal(t.actualSha256, primaryTrial.trials.find(p => p.caseId === id && p.mutation === t.mutation).actualSha256);
          if (target) assert.ok(verdict.checks.some(c => !c.passed && targeted(c)), 'Target PDF defect was not rejected.');
        } else {
          assert.equal(t.targetPrefix, target);
          if (target) assert.ok(t.failedRegions.some(targeted), 'Target primary defect was not rejected.');
          if (!['numeric-failure', 'height-crop'].includes(t.mutation)) assert.equal(t.primary, expected === 'pass');
        }
      }
    }
  }
  return { declared, sha256: hash(policyBytes), ...evidence };
}
