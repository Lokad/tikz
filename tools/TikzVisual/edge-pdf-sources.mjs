// Exact development source closure captured by calibration and checking.
export const edgePdfSources = ['calibrate-edge-pdf.mjs', 'check-edge-pdf.mjs', 'edge-pdf-sources.mjs', 'edge-pdf-policy.mjs',
  'edge-pdf-ink.mjs', 'edge-pdf-viewport.mjs', 'edge-pdf-image-pair.mjs', 'edge-pdf-registration.mjs', 'edge-primary-reference.mjs', 'edge-primary-defects.mjs', 'edge-oracle.mjs', 'edge-oracle-frame.mjs',
  'edge-oracle-pdf.mjs', 'edge-oracle-png-pair.mjs', 'edge-evidence.mjs', 'curved-node-path-units.mjs', 'shape-frame-math.mjs',
  'shape-pdf-camera.mjs', 'shape-pdf-image-pair.mjs', 'shape-pdf-trial-policy.mjs', 'shape-image-pair.mjs', 'shape-raster-metrics.mjs',
  'shape-oracle-bundle.mjs', 'compare.mjs', 'browser-profile.json', 'text-profile.json', 'node-profile.json', 'package.json', 'package-lock.json']
  .map(p => 'tools/TikzVisual/' + p).concat(['tools/TikzEdgeOracle/Program.cs', 'tools/TikzEdgeOracle/TikzEdgeOracle.csproj',
    'tools/TikzEdgeOracle/packages.lock.json', 'tools/TikzShapeComparison/NativeGlyphTrace.cs', 'Directory.Build.props', 'global.json', 'Lokad.TikZ.slnx']).sort();
