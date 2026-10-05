# Independent shape ink and frame checks

```text
node tools/TikzVisual/shape-frame-self-test.mjs
node tools/TikzVisual/inspect-shape-frames.mjs
node tools/TikzVisual/compare-shape-frames.mjs
```

The first command runs 44 analytic, parser, transform, stroke and containment
controls. The second generates a fresh independent oracle reconstruction under
`artifacts/node-shape-frames/`, computes expected extents, and saves a paired
inspection gallery. It does not reference or invoke the candidate converter.
The third establishes fresh independent evidence first, then runs the public
converter's required 4,461-check numeric comparison in a separate directory,
and compares its ink and frame quantities with those fixed expectations.

The independent evaluator reads native PGF soft paths and line widths, measured
node frames and integer DVI glyph positions, and the original outlined glyph
definitions. It finds quadratic/cubic extrema after applying each affine
transform. Transforming the corners of an untransformed glyph box would
overstate some rotated glyph extents by as much as 3.8171 CSS pixels in this
corpus. No production parser, resource, layout, stroke-bounds helper or SVG
writer computes the expected quantities.

The background stroke calculation accepts this fixture's regular closed
four-quarter-cubic family only. It checks the joins and includes the uniform
circular pen and finite miter intersections. It explicitly rejects degenerate
or unrelated path families. Forty-four controls cover known Bézier extrema,
transform order, shorthand/relative outlines, smooth strokes, tiny viewport
overflows, malformed inputs and unsupported geometry.

The pinned browser independently checks 214 outline and transformed-path
geometry boxes. Its observed x/y/width/height values have Float32 quantization;
the report retains those values and a corresponding numerical cross-validation
bound. This validates the analytic evaluator and does not set a compiler or
raster tolerance. Native frame comparisons retain the much stricter physical
precision of the existing numeric profile.

All 98 native stroke/glyph contributions fit PGF's measured picture box in this
trusted 28-node corpus. The original driver's root is slightly smaller than
its declared vector ink at the top of `c-regular` and right of `e-regular`:
the largest overrun is about 0.000012918 CSS pixels. Native ink reaches beyond
that original root by about 0.000006437 CSS pixels. Original SVGs and these
negative margins remain preserved. They are not rounded away into passing
containment claims.

The independent semantic frame is the union of the native picture and visible
stroke/outline bounds. The gallery's full-ink inspection frame rounds its
edges outward at six CSS decimals; this is a diagnostic framing choice.
The candidate gate separately checks its documented zero-padding root origin,
width and height with six-decimal serialization bounds. It does not require
the candidate to adopt the gallery's outward-rounding choice.

The framing gallery retains twelve SVG-clip experiments on a common camera,
at 1x/4x over transparent/white/black backgrounds. Adding a root-sized clip
changes many pixels far from the clipping boundary. Even a clip covering the
entire camera changes some original-driver pixels. Those results cannot be
interpreted as a count of missing or cropped ink. The initial experiment and
its matching sources are retained under
`artifacts/node-shape-frames-initial-clip/`.

Controls separate this rendering effect from clipping an already rasterized
image. Twelve unchanged SVG repeats and twelve integer bitmap copies must
remain exact. Post-raster clipping alters only boundary pixels: the white
captures change 17 pixels at 1x and 11 at 4x, with none farther than two raster
pixels from the frame. This diagnoses boundary coverage; it does not prove
reference-engine clipping fidelity or grant a raster allowance.

`frames.json` retains all extents, margins, finite joins, browser checks,
clip/control measurements, 1,176 regional observations, 148 PNGs, provenance
and source/tool hashes. `frames.html` links the SVG and post-raster contact
sheets. The camera and all 98 regions come from independent original/native
evidence, never candidate content.

`artifacts/node-shape-frame-comparisons/report.json` now passes 406 additional
checks: four ink extents for each background/glyph, public picture/ink extents,
and natural SVG dimensions. Source spans accompany each candidate operation.
Physical quantities require an error below 1e-9 bp; root origin/size numbers
have an explicit half-unit bound at the sixth CSS decimal. Root width/height
must equal the viewBox size exactly. Expected values are established before
candidate conversion, and both original and candidate evidence are hashed.

Exit 0 means evidence generation or numeric frame comparison passed; numeric
mismatch exits 1, infrastructure failure 2, and candidate conversion failure 3.
All reports retain overall image/PDF conformance as pending. Focused and
interaction references, per-region image gates, image-only defect controls
with numeric checks bypassed, PDF calibration and reviewed admission remain
required. Existing rectangle/path raster allowances do not apply.
