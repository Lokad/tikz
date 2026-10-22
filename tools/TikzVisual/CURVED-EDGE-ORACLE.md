# Independent curved-connection frames and rendering

```text
node tools/TikzVisual/curved-edge-frame-self-test.mjs
node tools/TikzVisual/inspect-curved-edge-oracle.mjs
node tools/TikzVisual/check-curved-edge-oracle.mjs artifacts/curved-edge-oracle-inspection/run-<GUID>/report.json
```

The frame controls run without TeX, a browser or the converter. Inspection needs
.NET 10 and the pinned Playwright/browser installation, and owns a fresh
[DVI/TFM reader](../TikzCurvedEdgeOracle/README.md) with framework-only references.
The saved-image checker selects one exact completed report. Native production
inputs come from the separately pinned curved reference cache; ignored research
folders and earlier candidate runs are unnecessary.

All five frames and 389 local regions are derived from native paths, shipped
paint state, clipping, original glyph outlines and DVI positions. There are 183
regions at quarter, middle and three-quarter positions along cubic segments.
Endpoint, whole-path, glyph and clip regions remain measured too. Move-only
paths retain their position and contribute no ink. The two empty native backend
strokes remain in original SVG bytes and diagnostic metadata.

Cubic extrema determine clip contour boxes. Intersecting pen/glyph envelopes
with these boxes is conservative; it does not claim an exact curved-contour
intersection. Pen envelopes retain explicit caps, joins and outside miters, and
do not reduce bounds across dash gaps. Hand-derived arithmetic controls cover
these distinctions. Browser box comparisons use a documented float32 arithmetic
budget based on native operand size. That budget validates geometry
representation and grants no pixel allowance.

Inspection compares five independently serialized native representations and
three root choices across natural/expanded views, 1x/4x scales and transparent,
white and black surfaces. The matrix comprises 75 SVG derivations, 900 primary
views and 70,020 local observations. Twenty ordinary-PDF observations retain
1,556 local measurements. Their camera comes from native page/picture positions.
Changing a root must preserve drawing instructions and expanded samples;
reference and reconstructed repeat renders must be exact.

The local `index.html` links original/reconstructed pairs, raw and amplified
differences, native glyphs and local crops. Reports bind every saved artifact and
tool source. The checker rebuilds the glyphs, frames and all SVGs, decodes saved
PNGs, recomputes reported pixel/topology measurements and rejects corrupt
coverage, roles, camera, root and artifact claims.

These are native-only research observations. Reports retain
`converterInvoked: false`, `approvedImagePolicy: false` and
`imageConformanceClaim: false`. The later
[fixed curved-connection admission](CURVED-EDGE-CONFORMANCE.md) supplies independent
primary/PDF limits, image-only defect expectations and a fresh public candidate
trial/checker. These research reports retain their original pending status.
