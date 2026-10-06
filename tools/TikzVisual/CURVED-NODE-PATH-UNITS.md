# Independent curved-node path units

The trusted circle/ellipse corpus has a separate experiment for SVG path
representation. Its inputs are the completed independent sensitivity and
ink bundles. The experiment invokes a fresh framework-only reconstruction
from native PGF paths, DVI positions and original glyph outlines. It never
loads the converter or reads a candidate. No existing reference, camera,
region, ink signature or error ceiling is changed.

Run from the repository root:

    node tools/TikzVisual/inspect-curved-node-path-units.mjs

Eight predeclared representations vary only the 28 background paths and
their stroke widths. The 70 outlined glyphs, definition bytes, placement,
paint ordering and semantic root remain fixed. Each variant requires 812
independent coordinate/width checks, twelve primary views and four PDF
views. Every capture repeats; the CSS-six control must reproduce the old
complete measurements and signatures. Direct raster comparisons to that
control are retained separately from comparison with original TikZ.

| Representation | Primary views passing old limits | PDF views passing old limits |
| --- | ---: | ---: |
| CSS coordinates/width, six decimals | 12/12 | 4/4 |
| CSS coordinates/width, twelve decimals | 12/12 | 4/4 |
| Short native TeX-point coordinates/width | 10/12 | 2/4 |
| Twelve-decimal TeX-point coordinates/exact width | 8/12 | 2/4 |
| Short TeX-point coordinates/CSS-six width | 10/12 | 2/4 |
| CSS-six coordinates/printed TeX-point width | 10/12 | 2/4 |
| Short TeX-point coordinates/exact width | 10/12 | 2/4 |
| Short native coordinates/width with a group transform | 10/12 | 2/4 |

The short decimal is the first zero-to-five-place representation that
rounds back to the exact source scaled-point integer. Negative values use
the same rounding convention. Each represented point/width has its own
physical error and limit; this is no permission to quantize unrelated
analytic geometry. The scalar conversion is 96 / 72.27 CSS pixels per TeX
point, with the y-axis reversal declared explicitly.

The CSS-six and CSS-twelve PDF pages are byte-identical. Short native-unit
paths reproduce the negative-separation circle and overlapping glyph-region
primary failures at natural 4x over transparent/white backgrounds. Their
4x page ink exceeds the CSS-six sums by 89 per RGB channel. Exact rather
than printed widths reduce that whole-page difference to 44 but expose
different primary regions. Width-only substitution also changes different
regions. Moving the same transform onto a group preserves the short-unit
result. These are observations under the unchanged old policy, not new
allowances. Increasing decimal precision alone does not guarantee closer
pixels.

The completed independent bundle retains 2,881 hashed assets, 30 canonical
source hashes, all 6,496 serialization checks and all 128 view records.
Open its `index.html` or the paired crops linked from `report.json`.
The negative-separation border crosses the label; a glyph-region raster
failure therefore does not establish a glyph-layout defect. The exact
glyph/outline/order controls distinguish this case from changed text.

After that independent experiment completes, a separate diagnosis consumes
the fixed public trial:

    node tools/TikzVisual/diagnose-curved-node-path-units.mjs

It validates both entire bundles and the recorded converter assembly,
then compares the pre-existing public output with the independent short
native-unit representation. All twelve primary and four candidate-PDF
PNGs have identical hashes; all local/whole metrics and old-policy outcomes
also agree exactly. The diagnosis explicitly marks candidate evidence as
consumed and never contributes a limit to independent calibration.

This establishes the source of the mismatch: the earlier policy measured
CSS paths while the writer preserves native path units. Independent
calibration and complete sensitivity for the declared native-unit contract
remain required before any fresh public or immutable admission. Retain the
old CSS policy, failed trials and all competing representations. A renderer
representation difference does not waive numeric or missing-ink checks.

This experiment declares canonical UTF-8/LF source snapshots. Historical
raw source bytes remain verified against their original hashes, and raw,
working and canonical hashes are recorded separately. The one legacy CRLF
lock file has the same canonical LF hash as Git. This new contract changes
no historical byte or hash. Fixed local research inputs and generated
bundles remain under `artifacts/`; portable immutable preparation and
hosted CI are still pending.
