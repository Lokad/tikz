# Geometry profile calibration

The versioned `chromium-153-geometry-v2` profile covers six concrete geometry
fixtures. It establishes no text or general TikZ compatibility claim.
Raw measurements, tool hashes, renderer identity, source/reference hashes,
and derived SVG hashes are recorded in
[`tests/Reference/calibration.json`](../../tests/Reference/calibration.json).
All channel and foreground-error values below use the 0–255 channel scale.
Numeric geometry has a separate 0.02 CSS pixel bound in the case manifest.

## Independent primary measurements

`calibrate-reference` never calls the converter. It takes the oracle's PGF
soft-path measurements and paint/clip groups, expresses them in CSS pixels,
flattens the known physical transform, and serializes to six decimal places.
It preserves painting order, clips, and physical registration. Where the
manifest declares a named-anchor binding, it uses the independently measured
global anchor for that endpoint. No parameter comes from image fitting.

Two additional variants perturb all coordinates by ±4 TeX sp
(±4/65536 TeX pt) and expand the native frame on both sides by the absolute
physical perturbation. These are controlled precision experiments, not
identity claims. Coordinate and frame changes remain below the numeric bound;
serialization rounding is checked separately against 0.000001 CSS pixel.
All variants render at 1x and 4x, over transparent, white, and black backgrounds.

| Fixture | Flattened oracle max channel error | Worst max channel across three variants | Worst mean foreground error | Worst edge displacement, CSS px | Primary policy |
| --- | ---: | ---: | ---: | ---: | --- |
| `line-units` | 0 | 2 | 0.008224 | 0 | Exact |
| `relative-coordinates` | 0 | 7 | 0.017633 | 0 | Exact |
| `ordered-transforms` | 10 | 10 | 0.095401 | 0.25 | Channel ≤12, mean ≤0.125, edge ≤0.25 |
| `cubic-controls` | 8 | 9 | 0.032945 | 0.25 | Channel ≤10, mean ≤0.05, edge ≤0.25 |
| `rotated-rectangle` | 0 | 1 | 0.019607 | 0 | Channel ≤1, mean ≤0.025, edge =0 |
| `clip-scope` | 0 | 9 | 0.012528 | 0 | Exact |

The transformed fixture independently measures a 0.006521 CSS pixel discrepancy
between a global named anchor and the painted endpoint after PGF's transform
inverse/forward round trip. Lokad.TikZ stores global coordinates in doubles;
the compatibility allowance covers this measured TeX precision effect. It
does not claim to reproduce every intermediate fixed-point rounding operation.

The cubic's flattened equivalent already differs by 8 channel levels at
boundary pixels at 4x. Transform factoring, coordinate serialization, and
curve rasterization can expose this difference without any candidate code.
The rectangle experiment exposes one channel level at a cropped fill boundary.
These independently observed effects justify the three specific allowances.
They do not justify applying a general tolerance to all features.

Lines, relative coordinates, and the clip fixture remain exact. Their deliberate
perturbations that change pixels correctly mismatch: four line/relative
variants and the clip's positive perturbation. Consequently the whole
calibration command returns `1` even though it completed its measurements.
The six unperturbed converter fixtures pass the separate conformance command.
Every profile requires unchanged connected component counts and repeatable
captures. Reports retain all raw and amplified differences, including those
accepted by policy.

## Ordinary PDF cross-check

The secondary route uses ordinary pdfLaTeX and Poppler 24.04.0. Register it
through measured TeX page positions, crop on its native integer pixel lattice,
and render each SVG at the same page position. Never interpolate an already
rasterized PDF to align it with an integer picture origin.

Comparing the **oracle SVG with the oracle PDF**, independently of the
converter, gives the following worst values across 1x and 4x:

| Fixture | Maximum channel error | Mean foreground error | Edge displacement, native raster px | PDF limits: channel / mean / raster px |
| --- | ---: | ---: | ---: | --- |
| `line-units` | 90 | 18.315 | 1 | 128 / 24 / 1 |
| `relative-coordinates` | 123 | 17.957 | 1 | 128 / 24 / 1 |
| `ordered-transforms` | 215 | 27.778 | 1.414214 | 224 / 32 / 1.5 |
| `cubic-controls` | 130 | 10.044 | 1 | 144 / 24 / 1 |
| `rotated-rectangle` | 115 | 1.205 | 1 | 128 / 24 / 1 |
| `clip-scope` | 147 | 1.888 | 1 | 160 / 24 / 1 |

An allowance of one native raster pixel tightens to 0.25 CSS pixel at 4x;
the transformed fixture's diagonal chamfer step needs 1.5 native pixels.
Component counts agree in all six oracle comparisons. Candidate-versus-PDF
errors are reported and gated alongside these driver differences. Chromium
and Poppler have distinct antialiasing behavior; this route has no exact-pixel
claim.

## Comparator validation and scope

Thirty comparator self-tests include unchanged repeats, unit/geometry/stroke/
color/opacity/clipping/canvas defects, missing content, synthetic glyph/minus/
arrow/baseline defects, mostly blank images, and missing artifacts. Every
fixture-specific policy must reject a 0.5/0.25 CSS pixel displacement, doubled
stroke width, and removal of a 1%-opacity stroke from a mostly blank canvas.
Mean foreground error includes all visible samples, including alpha below the
edge-mask threshold, so faint content cannot disappear under a precision
allowance.

Adding arcs, new transform combinations, nodes, or text requires new numeric
and oracle-only calibration evidence plus reviewed profiles. Local results
identify the OS and browser binary. A complete authoritative hosted rendering
environment and its repeatability remain to be verified.
