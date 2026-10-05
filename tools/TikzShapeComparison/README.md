# Public circle and ellipse comparison

```text
dotnet run --project tools/TikzShapeComparison -c Release -- compare-numeric
node tools/TikzVisual/inspect-shapes.mjs
```

The numeric command converts the fixed [trusted fixture](../../tests/Fixtures/Nodes/shapes.tikz)
through the public API and exports its resolved scene. It first runs the
[independent oracle's](../TikzShapeReference/README.md) cached verifier in a
separate process. It invokes no TeX or browser and accepts only an optional
`--out artifacts/...` directory. Its project builds the independent verifier
without referencing that assembly. Production dependencies remain unchanged.

The command writes `artifacts/node-shape-comparisons/report.json` with 4,461
checks: native text/default dimensions, shape identities, affine frames,
448 anchors, complete typed background paths, 70 glyphs and their emitted
placement, picture bounds, and 448 border queries. Each check records expected
and actual quantities, units, error, tolerance, and the related node/source
span. Physical coordinates require an error below 1e-9 bp; integer quantities
and frame coefficients match exactly. Reports say `numeric-pass` rather than
overall image conformance; primary/PDF gates remain pending.

`NativeGlyphTrace.cs` uses retained DVItype movements for exact TeX glyph
positions. It independently reconstructs dvisvgm's fractional character
advances from two [unmodified, hash-verified TFM inputs](../../tests/Reference/NodeShapes/fonts/README.md).
These advances differ from TeX's integer registers. Both state stacks are
preserved; original SVG glyph definitions, font/slot order, label origins, and
driver coordinates agree within six-decimal serialization precision. Candidate
font resources, layout, and arithmetic supply none of the native measurements.
Ordinary tests check all glyphs and eighteen inconsistent/missing input cases.

The inspection command generates a fresh numeric pass, verifies its bundle
hashes, then uses the pinned development browser. It fixes its camera from
native picture bounds and the retained driver's translation. It preserves
natural root cropping and separately produces expanded views for diagnosis.
Both variants run at 1x/4x on transparent/white/black backgrounds. All 98 regions
come from original native backgrounds/glyph outlines, never candidate bounds.
The command records 12 whole-picture and 1,176 regional raw measurements,
premultiplied RGBA differences, amplified differences, overlays, white-backed
contact sheets, and eight largest paired crops per variant/scale/background.
Source links follow the node/glyph order established by the numeric comparison;
they identify the associated operation, not a proven cause of an image error.

Open `artifacts/node-shape-comparisons/inspection.html`, or read
`inspection.json` and open its saved PNGs directly. The bundle includes original
SVG/logs/native glyph diagnostics, font inputs, manifests/profiles, actual
SVG/scene/source, separate candidate-only border query source and output, and
source/assembly/artifact hashes. The border exercise never enters TeX or changes
the baseline. Runtime sources and the actual loaded assemblies are identified.

Exit codes for `compare-numeric` are 0 for a numeric pass, 1 for a numeric
mismatch, 2 for infrastructure failure, and 3 for candidate conversion failure.
The inspector returns 0 when its required numeric gate and artifact generation
succeed, and 2 for infrastructure failure. It reports image conformance as
pending even when a particular raster happens to match exactly. It declares
no image thresholds and inherits no rectangle/path tolerance. Independent
precision calibration, focused/interaction corpora, image-only defects,
secondary PDF evidence, and a reviewed combined admission remain required.

The separate [oracle-only calibration](../TikzShapeCalibration/README.md) now
reconstructs native PGF/DVI geometry and labels, measures five independent SVG
representations and retains framing/serialization/sensitivity observations.
It neither references nor invokes this candidate assembly. Its measurements
remain pending evidence, with no approved candidate image policy.

Numeric comparison and inspection generation are prepared CI steps with
uploaded bundles. Hosted execution remains unverified. Earlier ignored debug
previews are historical observations, not the current comparison command.
