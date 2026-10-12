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

Image admission of the new width corpus remains **open**. Its fresh primary SVG
is pixel-identical to native dvisvgm at 1x and 4x, but the ordinary PDF raster
comparison exceeds the existing geometry policy. The same failure occurs in
converter-free native-SVG/PDF calibration. Independent SVG/PDF vector readers
agree on all fourteen pen widths, so this is an unresolved reference-policy
boundary, not evidence of a converter width discrepancy.

The required cached comparison still reports that PDF failure. No pixel limits
have been relaxed and no PDF agreement or complete width qualification is
claimed. Preserve the failing evidence while resolving its admission policy.
