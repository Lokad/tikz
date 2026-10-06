import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { root, sha256, outputPath, writeArtifact } from './shape-oracle-bundle.mjs';
import { shapeViews, deriveShapeTrialPolicy, evaluateShapeTrial } from './shape-primary-trial-policy.mjs';
import { measureDashGeometryPair } from './dash-geometry-image-pair.mjs';

export const dashLinesPrimaryScope = 'Forty fixed horizontal dash lines; original-SVG primary trial only; independent PDF/interaction admission pending.';
export const dashLinesPrimaryNames = ['native-box', 'printed-pen-hull'].flatMap(frame => ['driver', 'native'].flatMap(width =>
  ['group', 'elements'].map(placement => frame + '-' + width + '-width-' + placement)));
export const dashLinesPrimaryTools = ['calibrate-dash-lines-primary.mjs', 'dash-lines-primary-common.mjs', 'dash-lines-oracle.mjs',
  'dash-lines-image-defects.mjs', 'dash-geometry-image-pair.mjs', 'shape-raster-metrics.mjs', 'shape-primary-trial-policy.mjs',
  'shape-oracle-bundle.mjs', 'shape-pdf-camera.mjs', 'shape-frame-math.mjs', 'dash-pdf-vector.mjs', 'compare.mjs',
  'browser-profile.json', 'text-profile.json', 'node-profile.json', 'package.json', 'package-lock.json'].map(p => 'tools/TikzVisual/' + p);
export const dashLinesViewKey = v => v.frame + '-' + v.scale + 'x-' + v.background;
export const dashLinesRegionSchema = regions => regions.map(({ id, nodeId, kind, caseId, rectangle }) => ({ id, nodeId, kind, caseId, rectangle }));

export async function captureDashLinesPrimary(renderer, { native, reconstruction, variant, views = shapeViews, policy = null, output, artifacts, cropIds = [] }) {
  const rows = [];
  for (const view of views) {
    const result = await measureDashGeometryPair(renderer, { reference: native.reference, actual: variant.svg, leftIsDriver: true,
      origin: native.metrics.driverOriginBp, camera: reconstruction.camera, regions: reconstruction.regions, ...view,
      rightLabel: variant.name, cropLimit: variant.name === 'candidate' ? 40 : Math.max(1, cropIds.length), cropRegionIds: cropIds });
    assert.equal(result.repeat.exactRgbaMatch, true, 'Unstable reference capture.');
    const prefix = variant.name + '/' + dashLinesViewKey(view), links = {}, imageHashes = {}, crops = new Map();
    for (const [kind, png] of Object.entries(result.images)) {
      const p = prefix + '-' + kind + '.png', bytes = Buffer.from(png, 'base64');
      await writeArtifact(output, p, bytes, artifacts); links[kind] = p; imageHashes[kind] = sha256(bytes);
    }
    for (const crop of result.crops) {
      const links = {};
      for (const [kind, png] of Object.entries({ ...crop.paired, sheet: crop.sheet })) {
        const p = prefix + '-' + crop.id + '-' + kind + '.png'; await writeArtifact(output, p, Buffer.from(png, 'base64'), artifacts); links[kind] = p;
      }
      crops.set(crop.id, links);
    }
    rows.push({ name: variant.name, converterInvoked: variant.converterInvoked ?? false, ...view, ...result, images: undefined, crops: undefined,
      artifacts: links, imageHashes, regions: result.regions.map(r => ({ ...r, crops: crops.get(r.id) ?? null })),
      evaluation: policy ? evaluateShapeTrial(policy, view, result) : null });
  }
  return rows;
}

export function deriveDashLinesPrimary(rows, regions) {
  assert.equal(regions.length, 40); assert.equal(rows.length, 96, 'Incomplete representation/view coverage.');
  assert.equal(new Set(rows.map(r => r.name + '/' + dashLinesViewKey(r))).size, 96, 'Duplicate oracle representation/view.');
  assert.deepEqual([...new Set(rows.map(r => r.name))].sort(), [...dashLinesPrimaryNames].sort());
  const fields = ['rawChangedPixels', 'maxRawChannelError', 'premultipliedChangedPixels', 'maxPremultipliedChannelError', 'meanForegroundChannelError'];
  function merge(items) {
    assert.ok(items.every(m => m.topology.componentDifference === 0), 'Independent primary representation changed component counts.');
    assert.ok(items.every(m => ['both-empty', 'measured'].includes(m.topology.edgeState)));
    return { ...Object.fromEntries(fields.map(k => {
      assert.ok(items.every(m => Number.isFinite(m[k]) && m[k] >= 0), 'Invalid oracle metric: ' + k); return [k, Math.max(...items.map(m => m[k]))];
    })), topology: { ...items[0].topology, componentDifference: 0,
      maxEdgeDisplacementRasterPixels: Math.max(...items.map(m => m.topology.maxEdgeDisplacementRasterPixels)) } };
  }
  const measurements = shapeViews.map(view => {
    const same = rows.filter(r => dashLinesViewKey(r) === dashLinesViewKey(view));
    assert.deepEqual(same.map(r => r.name).sort(), [...dashLinesPrimaryNames].sort());
    for (const row of same) {
      assert.equal(row.converterInvoked, false); assert.equal(row.repeat.exactRgbaMatch, true);
      assert.equal(row.repeat.rawChangedPixels, 0); assert.equal(row.repeat.premultipliedChangedPixels, 0);
      assert.deepEqual(dashLinesRegionSchema(row.regions), dashLinesRegionSchema(regions), 'Changed native regions.');
    }
    return { ...view, ...merge(same.map(r => r.metrics)), regions: regions.map((r, i) => ({ ...r, ...merge(same.map(v => v.regions[i])) })) };
  });
  return { measurements, policy: deriveShapeTrialPolicy(measurements, dashLinesPrimaryScope) };
}
export const compactDashLinesRows = rows => rows.map(({ artifacts, evaluation, ...row }) => ({ ...row, regions: row.regions.map(({ crops, ...r }) => r) }));
export async function verifyDashLinesAssets(output, artifacts) {
  for (const [p, h] of Object.entries(artifacts)) assert.equal(sha256(await readFile(await outputPath(output, p))), h, 'Changed line evidence: ' + p);
}
