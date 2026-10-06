import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { root, sha256, outputPath, writeArtifact } from './shape-oracle-bundle.mjs';
import { shapeViews, deriveShapeTrialPolicy, evaluateShapeTrial } from './shape-primary-trial-policy.mjs';
import { measureDashGeometryPair } from './dash-geometry-image-pair.mjs';

export const dashPrimaryScope = 'Sixteen fixed dash geometry paints and three clips; numeric and original-SVG primary gates; ordinary PDF and label/node interactions pending.';
export const dashPrimaryCalibrationTools = ['calibrate-dash-geometry-primary.mjs', 'dash-geometry-primary-common.mjs',
  'dash-geometry-primary-reconstruction.mjs', 'dash-geometry-image-pair.mjs', 'dash-geometry-image-defects.mjs',
  'shape-raster-metrics.mjs', 'shape-primary-trial-policy.mjs', 'shape-oracle-bundle.mjs', 'compare.mjs',
  'browser-profile.json', 'package.json', 'package-lock.json'].map(p => 'tools/TikzVisual/' + p);
export const dashPrimaryNames = ['native-box', 'printed-pen-hull'].flatMap(frame => ['driver', 'native'].flatMap(width =>
  ['group', 'elements'].map(placement => frame + '-' + width + '-width-' + placement)));
export const dashViewKey = v => v.frame + '-' + v.scale + 'x-' + v.background;
export const dashPrimaryRegionSchema = regions => regions.map(({ id, nodeId, kind, caseId, rectangle }) => ({ id, nodeId, kind, caseId, rectangle }));

export async function readDashGeometryNative(read = readFile) {
  const snapshotFile = 'tests/Reference/DashGeometry/snapshot.json', folder = path.join(root, 'tests/Reference/DashGeometry/native');
  const snapshotBytes = await read(path.join(root, snapshotFile)), snapshot = JSON.parse(snapshotBytes);
  assert.equal(snapshot.id, 'pgf-3.1.11a-dash-geometry-v1');
  for (const [p, h] of Object.entries(snapshot.sourceHashes)) assert.equal(sha256(await read(path.join(root, p))), h, 'Changed native source: ' + p);
  for (const [p, h] of Object.entries(snapshot.artifacts)) {
    assert.equal(path.basename(p), p); assert.equal(sha256(await read(path.join(folder, p))), h, 'Changed native artifact: ' + p);
  }
  const metricsBytes = await read(path.join(folder, 'metrics.json')), referenceBytes = await read(path.join(folder, 'reference.svg'));
  const metrics = JSON.parse(metricsBytes), reference = referenceBytes.toString('utf8');
  assert.equal(metrics.converterInvoked, false); assert.equal(metrics.approvedImagePolicy, false);
  assert.deepEqual(metrics.svg.records, metrics.pdf.records);
  return { snapshot, snapshotBytes, metrics, metricsBytes, reference, referenceBytes,
    snapshotSha256: sha256(snapshotBytes), metricsSha256: sha256(metricsBytes), referenceSha256: sha256(referenceBytes) };
}

export async function captureDashPrimary(renderer, { native, reconstruction, variant, views = shapeViews, policy = null,
  output, artifacts, cropIds = [] }) {
  const rows = [];
  for (const view of views) {
    const result = await measureDashGeometryPair(renderer, { reference: native.reference, actual: variant.svg, leftIsDriver: true,
      origin: native.metrics.driverOriginBp, camera: reconstruction.camera, regions: reconstruction.regions, ...view,
      rightLabel: variant.name, cropLimit: variant.name === 'candidate' ? 16 : Math.max(1, cropIds.length), cropRegionIds: cropIds });
    assert.equal(result.repeat.exactRgbaMatch, true, 'Unstable reference captures.');
    const prefix = variant.name + '/' + dashViewKey(view), links = {}, imageHashes = {}, crops = new Map();
    for (const [kind, png] of Object.entries(result.images)) {
      const file = prefix + '-' + kind + '.png', bytes = Buffer.from(png, 'base64');
      await writeArtifact(output, file, bytes, artifacts); links[kind] = file; imageHashes[kind] = sha256(bytes);
    }
    for (const crop of result.crops) {
      const links = {};
      for (const [kind, png] of Object.entries({ ...crop.paired, sheet: crop.sheet })) {
        const file = prefix + '-' + crop.id + '-' + kind + '.png'; await writeArtifact(output, file, Buffer.from(png, 'base64'), artifacts); links[kind] = file;
      }
      crops.set(crop.id, links);
    }
    rows.push({ name: variant.name, converterInvoked: variant.converterInvoked ?? false, ...view, ...result, images: undefined, crops: undefined,
      artifacts: links, imageHashes, regions: result.regions.map(r => ({ ...r, crops: crops.get(r.id) ?? null })),
      evaluation: policy ? evaluateShapeTrial(policy, view, result) : null });
  }
  return rows;
}

export function deriveDashPrimary(rows, regions) {
  assert.equal(rows.length, 96, 'Incomplete oracle representation/view coverage.');
  assert.equal(new Set(rows.map(r => r.name + '/' + dashViewKey(r))).size, 96, 'Duplicate oracle representation/view.');
  assert.deepEqual([...new Set(rows.map(r => r.name))].sort(), [...dashPrimaryNames].sort());
  const fields = ['rawChangedPixels', 'maxRawChannelError', 'premultipliedChangedPixels', 'maxPremultipliedChannelError', 'meanForegroundChannelError'];
  function merge(items) {
    assert.ok(items.every(m => m.topology.componentDifference === 0));
    assert.ok(items.every(m => ['both-empty', 'measured'].includes(m.topology.edgeState)));
    return { ...Object.fromEntries(fields.map(k => {
      assert.ok(items.every(m => Number.isFinite(m[k]) && m[k] >= 0), 'Invalid oracle metric: ' + k);
      return [k, Math.max(...items.map(m => m[k]))];
    })), topology: { ...items[0].topology, componentDifference: 0,
      maxEdgeDisplacementRasterPixels: Math.max(...items.map(m => m.topology.maxEdgeDisplacementRasterPixels)) } };
  }
  const measurements = shapeViews.map(view => {
    const same = rows.filter(r => dashViewKey(r) === dashViewKey(view));
    assert.deepEqual(same.map(r => r.name).sort(), [...dashPrimaryNames].sort(), 'Incomplete oracle view.');
    for (const row of same) {
      assert.equal(row.converterInvoked, false); assert.equal(row.repeat.exactRgbaMatch, true);
      assert.equal(row.repeat.rawChangedPixels, 0); assert.equal(row.repeat.premultipliedChangedPixels, 0);
      assert.deepEqual(dashPrimaryRegionSchema(row.regions), dashPrimaryRegionSchema(regions), 'Oracle regions changed.');
    }
    return { ...view, ...merge(same.map(r => r.metrics)), regions: regions.map((r, i) => ({ ...r, ...merge(same.map(v => v.regions[i])) })) };
  });
  return { measurements, policy: deriveShapeTrialPolicy(measurements, dashPrimaryScope) };
}

export function compactDashRows(rows) {
  return rows.map(({ artifacts, evaluation, ...row }) => ({ ...row, regions: row.regions.map(({ crops, ...r }) => r) }));
}

export async function verifyDashAssets(output, artifacts) {
  for (const [p, h] of Object.entries(artifacts)) assert.equal(sha256(await readFile(await outputPath(output, p))), h, p);
}
