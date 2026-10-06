# Independent labeled-border PDF instructions and registration

This development experiment compares the three frozen `LabelledBorders` cases
with their ordinary TikZ PDF. It first checks original PDF instructions against
independent native PGF and DVI/TFM records, then measures registered page pixels.
It invokes no converter and supplies no image allowance. PDF image acceptance
and combined conformance for this family remain pending.

Run after the [visual setup](../../docs/TESTING.md):

```text
node tools/TikzVisual/inspect-labelled-border-pdf.mjs
node tools/TikzVisual/labelled-border-pdf-self-test.mjs
```

Cached runs need .NET 10, Node and the pinned development browser. They read the
unchanged PDF/page PNGs and six original TFM inputs; no live TeX or PDF executable
is invoked. The framework-only [DVI/TFM reader](../TikzLabelledBorderOracle/README.md)
supplies fresh glyph records. Production dependencies and source are unchanged.

## Original instructions before pixels

The bounded reader accepts the explicit single-page PDF 1.5 objects, Flate
streams, Type 1 font resources and operators used by these trusted fixtures.
It rejects other versions, object streams, unsupported operators, unbalanced
state, excess work and unexpected fonts. It is not a general PDF interpreter.
Literal EC byte strings, octal escapes, integer TJ adjustments, multiline Td
positions and complete saved affine frames preserve original paint order.

All 26 paths and 40 glyphs have independent comparisons. The 908 scalar checks
cover page size/origin, every path operand, frame and stroke state, glyph font,
slot, printed size and width, linear frame and baseline. Structural checks also
require colors, encoding, embedded font identity and painting order. PGF path
operands use its finite scaled-point-to-bp conversion with a half-converted-sp
rounding limit. Page and translation operands retain their three-place PDF
rounding budgets. These numeric budgets are separate from image limits.

Font sizes and widths require exact agreement. Source inspection of
[pdfTeX's font grid and text output](https://raw.githubusercontent.com/TeX-Live/texlive-source/2d38d53fe0f1c916bdef1858bc28af82e6a9c2ee/texk/web2c/pdftexdir/pdftex.web)
grounds a quantized denominator that a direct TFM-fraction calculation misses.
For this fixed positive 10/12-point profile, with `S = sizePt * 65536` and
`B = 6578176` (100 bp in scaled points):

```text
D = round(S * 1000000 / B)
F = S - trunc((S * 1000000 - D * B) / 1000000)
A = floor(tfmWidthFraction * S)
Tf = D / 10000
Widths = round(A * 10000 / F) / 10
```

The retained denominators are 655358 and 786434 sp; printed Tf sizes are 9.9626
and 11.9552 bp. Original widths agree exactly, including regular `p` and italic
`y` values of 555.6 and 485.6 in 1000/em units. The earlier direct-fraction
experiment failed just beyond its half-decimal width bound; its source and report
remain under `artifacts/labelled-border-pdf-verification/probe-798d7fdd-3d75-4443-bdca-97ab68a624c8/`.
The bound was not widened. The inspected upstream revision is recorded separately
from the frozen pdfTeX 1.40.27 engine identity.

Baseline error budgets propagate printed CM/Td, Widths, TJ and Tf rounding,
the retained denominator grid and native one-sp advances through the affine
frame. The largest observed baseline discrepancy is about 0.00535 bp; its
source-derived budget is about 0.01585 bp. Font and slot identity cannot consume
that budget. The reconstruction reuses original dvisvgm outlines; it does not
decode embedded Type 1 outlines or qualify the PDF rasterizer's font hinting.

## Registered page observations

The native shipment record fixes the drawing origin on the 600 by 800 TeX-point
page. Physical 1x/4x raster sizes are 798 by 1063 and 3189 by 4251 pixels. Original
page PNGs retain Poppler 24.04.0 provenance at 96/384 dpi. Coordinates and local
crop rectangles come from native evidence before any image comparison. Images
are not aligned by fitting their visible pixels.

Three SVG representations isolate unchanged driver output, independently
reconstructed native paths/glyphs with the full-ink root, and original printed PDF
operands/paint/text placement expressed as SVG. The last uses original outlines
and the actual printed font size. Each retains original operation order.

For every representation, padding the natural root by eight CSS pixels and
moving one boundary by plus/minus four sp must leave directly registered page
pixels exactly unchanged. All 162 full-page controls pass at 1x/4x, including
every whole/local region. The separate validator independently checks the math
and unchanged drawing content of all 81 control SVGs. Padded SVG versus ordinary
PDF observations remain separate from these exact registration controls.

The main investigation saves 36 ordinary-PDF view pairs and 1,944 local
observations: three representations, natural/expanded views, two scales and
three cases, all on white. Original PDF and SVG repeats are exact. Differences
outside the fixed whole-picture camera are zero.

The raw expanded native-ink observations currently show:

| Case | Changed pixels, 1x | Changed pixels, 4x | Whole edge discrepancy, 4x |
| --- | ---: | ---: | ---: |
| lines | 2,280 | 11,070 | 0.354 CSS px |
| paths | 3,237 | 16,529 | 0.5 CSS px |
| transforms | 2,757 | 12,856 | 0.5 CSS px |

Maximum channel differences reach 255. Local regions also expose topology and
edge differences hidden by those whole-picture values. For example, the lines
glyph-1 window reaches about 7.353 CSS px at 4x and changes one component; the
italic-period window reaches 2.5 CSS px and changes one component. These regions
include neighboring ink, so the metric is not a measured displacement of the
isolated glyph. Transformed endpoint windows reach 2.75 CSS px. Reconstructing
the exact PDF operands does not remove these observations. They are diagnostics,
not tolerances or proof of a converter defect.

## Agent inspection and integrity

Read the digest-checked `artifacts/labelled-border-pdf/latest.json` pointer, then
its `report.json` and `index.html`. The report links each case's three SVGs,
native instructions/ink, original operations, PDF content/records/numeric checks,
page registration and complete local measurements. Whole views save PDF/SVG,
raw/amplified differences, overlay and the full registered SVG page. Two regions
per view save paired crops and their exact raster rectangle and enlargement.
The selected period crop is `lines:glyph-6`; complete metrics also retain
`lines:glyph-11` and every other region. Crop selection affects presentation only.

Original fixture inputs and independent glyph records identify nodes, native
path indices and glyph indices. The separate
[public inspector](../TikzLabelledBorderComparison/README.md) provides source
spans and candidate scene/SVG IDs; this experiment contains no candidate scene.

Every attempt retains a fresh GUID bundle, source snapshots and artifact hashes.
The self-test verifies those hashes and reader dependencies, independently
rederives all native frames, ink, original operations, PDF records and three
SVGs, and checks the complete case/view/region matrix and crop lattice. Its 111
controls cover exact font grids, escaped text, saved frames, multiline cursor
reset, malformed operators/state, original-PDF numeric mutations, dropped
evidence, false roles, altered cameras, viewport pixels and artifact links.
Prepared CI runs both commands and uploads their bundles; hosted execution
remains unverified.

The next gate qualifies rasterizer and font effects independently, including
a separately pinned Cairo comparison and isolated local diagnostics. Any later
PDF calibration must retain these raw observations and prove local sensitivity
to missing/faint glyphs, endpoints, joins, cropping and extra ink at both scales.
Both original-SVG-versus-PDF and fresh-public-SVG-versus-PDF gates must then pass
alongside native, ink and primary gates before immutable combined admission.
