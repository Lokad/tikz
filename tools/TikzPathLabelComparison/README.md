# Native path-label iteration checks

From the repository root, run:

```sh
dotnet test Lokad.TikZ.slnx
node tools/TikzVisual/qualification-process-self-test.mjs
node tools/TikzVisual/path-label-evidence-self-test.mjs
node tools/TikzVisual/compare-path-label-numeric.mjs
node tools/TikzVisual/compare-path-label-numeric.mjs interactions
```

The numeric command validates a frozen trusted fixture, reparses its
original SVG/PDF observations, owns the native bundle and compares fresh public
and traced conversion. It saves an exact report path and digest under `artifacts/`.
No live TeX or PDF tools run during this iteration check.

The BCL-only comparison tool links the existing independent DVI/TFM glyph reader.
The placement case compares 13 text boxes, 208 anchors and 42 glyphs; the interaction
case adds 8 boxes, 128 anchors and 25 glyphs under continuation, styles and two
nested existing clips. Both compare transformed baselines, effective glyph/path
paint, glyph/path clip chains and physical paint order. The xUnit controls deliberately
shift, remove, recolor and reorder candidate output. The native-reader controls
reject changed observations, including rehashed measurements and omitted clips. Artifact transport,
process receipts and generic report validation reuse the existing machinery.

The retained native fixture has distinct construction calls and shipped paints:
PGF can paint an arrow template while caching its box. The native reader checks
the original SVG and PDF drivers independently of the converter. It also keeps
measured wrapper glue separate from picture geometry.

Only regenerate changed native inputs with
`node tools/TikzVisual/path-label-reference.mjs [placement|interactions]`. This producer accepts
only these two fixed repository-authored fixtures and requires the pinned local MiKTeX, dvisvgm
and Poppler tools. The portable native report is not automatically replaced.

The [independent oracle workflow](../TikzPathLabelOracle/README.md) supplies native-only
primary/local limits and independently checked first-glyph and complete-label
text sensitivity without loading the converter.
The PDF workflow adds independently checked native policies and fresh iteration
comparisons for original-SVG/PDF and converter-SVG/PDF. These commands establish
focused iteration evidence. A separate current checker decodes metrics, verifies
framing/provenance and recaptures all images from fresh public output. Pinned
portable native archives restore the qualified inputs in fresh exports.
Final-tree fresh-export acceptance remains open;
the reports deliberately make no complete-feature conformance claim.
