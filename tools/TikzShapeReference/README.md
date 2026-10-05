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

This is independent reference preparation. Circle/ellipse nodes are still
unsupported by the public converter. No candidate numeric pass, primary/PDF
conformance, or raster tolerance is claimed. These cases need their own public
conversion, focused/interaction measurements, independent precision and PDF
calibration, defect controls, and agent-viewable comparison bundles.
