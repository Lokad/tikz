# Native circle and ellipse node references

This independent development executable compiles only the repository's
[trusted fixture](../../tests/Fixtures/Nodes/shapes.tikz) and
[manifest](../../tests/Reference/NodeShapes/cases.json). It has no reference to
the converter assembly and adds no runtime dependency. A separate executable
preserves the tool-source hashes pinned by the existing admitted policies.

```text
dotnet run --project tools/TikzShapeReference -c Release -- generate
dotnet run --project tools/TikzShapeReference -c Release -- verify
dotnet run --project tools/TikzShapeReference -c Release -- check-cached
pwsh -NoProfile -File tools/TikzShapeReference/check-cached.ps1
```

`generate` explicitly writes the native baseline. `verify` regenerates into
ignored `artifacts/node-shape-reference/` and compares measurements, visible SVG,
native DVI diagnostics, tools, and inputs without rewriting that baseline.
Only the DVI header's compilation timestamp is excluded from the diagnostic
comparison; the original traces remain intact. `check-cached` needs only .NET,
reconstructs every measurement from the retained native log, and verifies
artifact/source hashes, coverage, probe invariance, and declared fonts.
The PowerShell controls require the Release build produced by the preceding
command. They operate on isolated copies under `artifacts/` and check sixteen
unchanged/missing/tampered/rehashed evidence cases without invoking TeX.

The [native profile](../../tests/Reference/NodeShapes/oracle-profile.json) pins
MiKTeX, PGF, dvisvgm, DVItype, and the existing six-face Latin Modern font
profile. Live commands also verify every pinned font/data input, disable shell
escape and installation, and bound execution time and captured process output.
They accept no source, fixture, wrapper, or baseline paths from the caller.

The 28 nodes cover circles and ellipses with regular, empty, period, descender,
multiline, minimum-size, width/height-dominated, separated, negatively separated,
odd-scaled-point, distinct node/label font, rotated, and sheared layouts.
For each node the wrapper records twelve native text/default/dimension quantities,
sixteen global anchors, sixteen global border queries, local painted axes and
center, the effective affine frame, and every native soft-path token. The
normalization primitives use the same sixteen direction vectors, including zero
and near-center cases. Native PGF picture bounds and the enclosing TeX box are
recorded separately. Border queries use offsets from independently measured
centers, never coordinates supplied by the candidate.

Both plain and instrumented outlined SVGs and logs are retained in
`tests/Reference/NodeShapes/native/`. Instrumentation must preserve the TeX
picture box and the visible SVG. The sole SVG canonicalization sorts definitions
by their unique IDs; painted content and definition contents are preserved.
The wrapper's large page avoids an empty first-page reference, and generation
checks that all 28 painted backgrounds are present. Unknown DVI specials mark
the original text-box baselines without changing the picture. The raw DVItype
trace retains glyph slots, fonts, and integer positions for subsequent layout
comparisons; it has not yet been parsed into candidate glyph assertions.

PGF uses finite angle/trigonometric calculations for circle sizing and border
intersection, fixed constants for ellipse sizing and diagonal anchors, and a
trailing move back to the center after a closed background path. Ideal Euclidean
circles and analytic ray intersections cannot replace those rules without
checking their measured differences.

The [public numeric prototype](../../docs/NODES.md#circle-and-ellipse-numeric-prototype)
now implements these shapes without changing the original fixture or native
evidence. [Ordinary tests](../../tests/Lokad.TikZ.Tests/CurvedNodeTests.cs) check
the measured text boxes, named anchors, complete soft paths, picture bounds,
all 448 border queries, and sixteen normalized primitives. The standalone
oracle remains independent and cannot invoke the candidate.

The trusted [precision diagnostic](../../tests/Fixtures/Nodes/direction-precision.tex)
isolates a small-direction division/angle calculation and an ellipse-border
query. Native logs show that the horizontal ellipse branch reaches 599sp,
while the opposite multiplication order reaches 600sp. This is an exploratory
diagnostic; the unchanged 448-query corpus supplies the regression evidence.

Primary/PDF conformance and raster tolerance remain pending. These cases still
need focused/interaction measurements, independent precision and PDF
calibration, and defect controls. The separate
[candidate harness](../TikzShapeComparison/README.md) now supplies direct glyph
assertions, source-aware numeric reports, and reproducible agent-viewable
bundles without changing this oracle or its native evidence. Inspection establishes
no image policy, and no existing rectangle/path policy is inherited.
