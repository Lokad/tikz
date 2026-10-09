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
these fixed repository-authored fixtures and requires the pinned local MiKTeX, dvisvgm
and Poppler tools. The portable native report is not automatically replaced.

The same producer and comparison tool also accept the three authored complete
diagrams: `flowchart-basic`, `network-bent` and `flowchart-transformed`.

```sh
node tools/TikzVisual/path-label-reference.mjs flowchart-basic
dotnet run --project tools/TikzPathLabelComparison -c Release -- <exact-native-report-path>
```

Diagram sources are fixed by their hashes. The producer adds identities to
anonymous labels only in probed runs and requires unchanged SVG drawings, PDF
bytes and 1x/4x PDF pages. Coordinates are recorded separately from text nodes.
The comparison checks their measured text/anchors, DVI/TFM glyph placements,
calculated coordinates, picture bounds, paint state and physical ordering.
Supplement the exact saved diagram report with the existing arrow probes:

```sh
node tools/TikzVisual/diagram-arrow-reference.mjs <exact-original-diagram-report>
dotnet run --project tools/TikzPathLabelComparison -c Release -- <exact-supplemental-report>
```

This checks saved originals rather than regenerating their images. The producer
accepts only the fixed source/wrapper/probe hashes, requires unchanged native
tool binaries and engine inputs, and proves unchanged SVG drawing and PDF bytes.
The comparison links the existing arrow checker for every shipped background,
shaft and tip, including curve controls, template dimensions/endpoints/hulls,
placement matrices and shortening. Glyph checking remains independent. PGF's
final move after a transformed rectangle paints no segment and is normalized
along with consecutive moves. PDF rectangles convert their position and size
operands separately; their finite serialization bounds accumulate per operand.
Original PDF frames/pages remain retained for image qualification. These
numeric checks alone do not admit complete diagrams or establish pixel identity.
Diagram numeric exports retain path/glyph source spans. The existing primary
calibrator accepts the frozen supplemental report, and the current primary
comparison links failed native regions back to those spans. Native-only cameras,
per-region limits, whole-label and tip sensitivity now have independent image
recapture. Natural roots use independently measured picture bounds union shipped
path/glyph ink; the expanded inspection camera retains its conservative padding.
All transformed-diagram primary views now pass. Ten basic/network 4x path views
still fail; those receipts drive the next work before PDF/final admission.

When only this independently justified root changes, the existing calibrator
can preserve expanded-view pixels from an exact prior report:

```sh
node tools/TikzVisual/calibrate-path-label-primary.mjs <exact-supplemental-report> --reuse <exact-prior-calibration-report>
node tools/TikzVisual/check-path-label-primary.mjs <exact-new-calibration-report>
node tools/TikzVisual/compare-path-label-primary.mjs <exact-new-calibration-report> <fresh-numeric-report>
```

Reuse requires unchanged native input, renderer, camera, regions, drawing and
control targets/drawings. Natural views are rendered again. The independent
checker still decodes and recaptures every source, including reused expanded
views. Limits derive only from native encodings, before current output is read.

Frozen references retain their original generator/checker source hashes as
provenance. Changes to the fixture, TeX wrappers or font profile require new
native evidence. A reader extension rechecks retained observations and fresh
converter output without regenerating unchanged native calibration.

The [independent oracle workflow](../TikzPathLabelOracle/README.md) supplies native-only
primary/local limits and independently checked first-glyph and complete-label
text sensitivity without loading the converter.
The PDF workflow adds independently checked native policies and fresh iteration
comparisons for original-SVG/PDF and converter-SVG/PDF. These commands establish
focused iteration evidence. A separate current checker decodes metrics, verifies
framing/provenance and recaptures all images from fresh public output. Pinned
portable native archives restore the qualified inputs in fresh exports.
Final feature acceptance combines ordinary tests, controls and fresh comparisons
in a committed source export. Individual reports make no general feature or
pixel-identity claim.
