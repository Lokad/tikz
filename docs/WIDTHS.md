# Stroke widths

`line width` accepts a nonnegative physical dimension. Named thickness presets
use TikZ's TeX-point values and pass through the same scaled-point quantization
as physical dimensions. One TeX point contains 65,536 scaled points (sp).

| Preset | TeX pt | Native width, sp |
| --- | ---: | ---: |
| `ultra thin` | 0.1 | 6,554 |
| `very thin` | 0.2 | 13,107 |
| `thin` | 0.4 | 26,214 |
| `semithick` | 0.6 | 39,322 |
| `thick` | 0.8 | 52,429 |
| `very thick` | 1.2 | 78,643 |
| `ultra thick` | 1.6 | 104,858 |

Options apply in source order. For example, `ultra thick,line width=0.3pt`
ends at 19,661 sp, while `line width=0.3pt,ultra thick` ends at 104,858 sp.
Styles use the same ordering; leaving a scope restores the enclosing width.
Widths are physical paint dimensions: changing coordinate basis or applying a
path transform does not multiply the line width.

The [focused native corpus](../tests/Reference/width-presets/README.md) measures
all seven presets and seven ordering/style/scope interactions. Ordinary tests
compare the resolved scene and independently parsed emitted SVG to exact native
sp widths and picture bounds. The general primitive test separately checks the
source/reference identities, path geometry, anchors and paint. This closes
the missing width-grid coverage without a preset-by-transform-by-arrow product.

Existing complete paint diagrams cover a styled 0.8pt route, a local 1pt override,
caps/joins, clipping, measured labels, arrows, positioning and calc together.
The curved-edge corpus separately exercises `thick` with clipped curved paths.
Their qualified evidence remains unchanged; these interactions do not require
another complete diagram for every preset.

The width corpus has its own native-only [calibration](../tests/Reference/width-presets/calibration.json)
and [pixel policy](../tools/TikzVisual/width-profile.json). It keeps exact primary
SVG agreement at 1x/4x and exact integer-sp widths. Ordinary PDF uses recorded
Poppler `-thinlinemode shape`, which preserves fractional stroke intensity rather
than promoting subpixel pens to opaque pixels. The nine older geometry fixtures
retain their existing rasterization and policies.

| PDF scale | Channel bound | Mean foreground bound | Edge bound, native pixels | Component difference |
| --- | ---: | ---: | ---: | ---: |
| 1x | 145 | 28 | 4 | 2 |
| 4x | 129 | 23 | 1.5 | 0 |

These bounds come from converter-free canonical and ±4sp native representations:
one channel level of serialization margin, the next integer foreground mean,
the next half native pixel for the chamfer edge, and the measured component
difference. No converter output selects an allowance. The calibration and
reference provenance/assets are authenticated before comparison; altered policy
limits must match that fixed derivation.

At 1x, native SVG viewport clipping leaves the two boundary hairlines below the
16/255 edge-mask threshold during PDF registration. All raw samples still enter
foreground error and exact primary checking; all fourteen components must agree
at 4x. The shared comparator controls independently reject quarter/half-pixel
translation, doubled widths and omitted boundary/interior thin strokes in both
primary and PDF comparisons. Native SVG/PDF vector readers also agree on every
pen width. This is scoped antialiasing agreement, with no exact-PDF-pixel claim.
