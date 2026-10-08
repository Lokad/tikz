# Native path-label iteration checks

From the repository root, run:

```sh
dotnet test Lokad.TikZ.slnx
node tools/TikzVisual/qualification-process-self-test.mjs
node tools/TikzVisual/path-label-evidence-self-test.mjs
node tools/TikzVisual/compare-path-label-numeric.mjs
```

The numeric command validates the frozen trusted placement fixture, reparses its
original SVG/PDF observations, owns the native bundle and compares fresh public
and traced conversion. It saves an exact report path and digest under `artifacts/`.
No live TeX or PDF tools run during this iteration check.

The BCL-only comparison tool links the existing independent DVI/TFM glyph reader.
It compares 13 text boxes, 208 anchors, 42 glyphs and their transformed baselines,
effective glyph/path paint and physical paint order. The xUnit controls deliberately
shift, remove, recolor and reorder candidate output. The native-reader controls
reject changed observations, including rehashed measurements. Artifact transport,
process receipts and generic report validation reuse the existing machinery.

The retained native fixture has distinct construction calls and shipped paints:
PGF can paint an arrow template while caching its box. The native reader checks
the original SVG and PDF drivers independently of the converter. It also keeps
measured wrapper glue separate from picture geometry.

Only regenerate changed native inputs with
`node tools/TikzVisual/path-label-reference.mjs`. This producer accepts the fixed
repository-authored fixture only and requires the pinned local MiKTeX, dvisvgm
and Poppler tools. The portable native report is not automatically replaced.

These commands establish focused iteration evidence. Native image policies,
continuation/style/clip interactions and final-tree fresh-export acceptance remain
open; the reports deliberately make no image or complete-feature conformance claim.
