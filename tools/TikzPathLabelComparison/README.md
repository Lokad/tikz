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
The parameterized-style iteration adds `flowchart-parameterized` and the
rectangle-only `style-contract` under `tests/Fixtures/Styles`. Both reuse the
existing native producer, glyph reader and numeric comparison. The flowchart
also accepts the arrow supplement below; the rectangle-only contract retains
its node/glyph/paint observations without an arrow-template calibration claim.

`flowchart-foreach` uses the same trusted diagram producer and arrow supplement
for the declared bounded loop subset. Repeated anonymous path labels receive
distinct probe identities at runtime. Its 1,765 numeric checks cover nine text
nodes, 48 glyphs, calculated coordinates, five arrow tips and paint/frame order.
The focused loop grammar/scope fixture uses the node measurements under
`tests/Reference/Positioning/Foreach`; numeric iteration evidence remains separate
from image-policy and final clean-source acceptance.

`flowchart-math-macros` and `math-macro-contract` use the same fixed diagram
producer and independent comparison. The flowchart uses the arrow supplement;
the focused arithmetic fixture uses measured rectangle backgrounds. They check
1,768 and 1,459 quantities respectively. Scalar printed values are additionally
checked by the ordinary tests against `tests/Reference/MathMacros`. The DVI
glyph reader accepts mixed-case declared node identities while retaining its
exact identity whitelist and repeated-origin checks. Numeric/image iteration
does not imply calibrated image/PDF admission or final source qualification.

The numeric-macro fixtures now retain independently checked native primary/PDF
bundles under [`tests/Reference/MathMacros`](../../tests/Reference/MathMacros/README.md).
Their 48 current primary and 16 PDF views pass the separate native-only policies.
The existing materializer restores both archives without native execution.
Final clean-source comparisons and integration pass both fixtures, including
64 independent fresh-output image views and the required existing-family
regressions. These completed checks remain separate from archive restoration.

`network-math-functions` and `math-functions-contract` reuse the same fixed
producer and independent numeric reader. The network uses the arrow supplement;
the focused corpus uses measured rectangle backgrounds. They pass 1,995 and
3,871 numeric checks respectively, including 47 text nodes and 234 glyphs in
total. Fresh output also has paired whole/local 1x/4x iteration images and passes
48 primary/16 PDF views under checked native-only policies. The independent
native checkers reproduce 788 sources, including 612 visible defect views that
are all rejected. Both portable reference archives now restore every original
asset byte; final clean-source acceptance remains open. Control captures retain
full image pairs, local metrics and paired crop sheets within the unchanged
shared artifact bound.
Separate scalar snapshots include the complete-turn boundary fixture under
[`tests/Reference/MathFunctions`](../../tests/Reference/MathFunctions/README.md).
The focused archive's versioned record packing uses bounded gzip inflation;
existing archive bytes and their codec representation remain unchanged.

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
The three diagram encodings retain the two native decimal matrix variants and
add the existing arrow encoder's short TeX-point path representation. Its finite
decimals recover the original scaled-point coordinates, widths and translations.
This closes the retained path calibration gap: all 72 current diagram primary
views now pass. Both diagram PDF gates now pass their 24 required current views.
Feature acceptance additionally requires a clean committed source export.

`flowchart-parameterized` uses the same arrow route. `style-contract` instead
uses its seven measured global rectangle paths and the existing primitive
path/paint/order reader and scaled-point serialization guards. Its natural
root contains measured picture bounds and native rectangle/glyph ink; no arrow
template is fabricated. Both cases have first-glyph and whole-label sensitivity,
native-only primary/local and separate PDF policies, and fresh-output replay.
The two style bundles are retained losslessly under `tests/Reference/Styles`.
`materialize-path-label-cache.mjs <fixture-id>` restores them with the existing
bounded transport, ownership and corruption checks, without running native tools.

`flowchart-foreach` uses the same arrow route. `foreach-contract` uses measured
rectangle backgrounds, including nodes that construct a background without
painting it. The primitive adapter maps shipped paint ordinals to observed
construction IDs and checks glyph order for every node. Its first-glyph and
whole-label controls remain visible in both captures at 1x/4x. The two qualified
native bundles are retained under
[`tests/Reference/Foreach`](../../tests/Reference/Foreach/README.md), using the
same lossless materializer and corruption controls. Fresh converter output and
final clean-source acceptance remain separate from archive restoration.

When a root changes or an independent encoding is added, the existing calibrator
can preserve unchanged samples from an exact prior report:

```sh
node tools/TikzVisual/calibrate-path-label-primary.mjs <exact-supplemental-report> --reuse <exact-prior-calibration-report>
node tools/TikzVisual/check-path-label-primary.mjs <exact-new-calibration-report>
node tools/TikzVisual/compare-path-label-primary.mjs <exact-new-calibration-report> <fresh-numeric-report>
```

Reuse requires unchanged native input, renderer, camera, regions, drawing and
control targets/drawings. An unchanged source can reuse all its views; a root
change can reuse expanded views only. New encodings are rendered. The independent
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
The [three diagram archives](../../tests/Reference/Diagrams/README.md) use the same
materializer and bounded codec, with four native reports per fixture; legacy
families retain their six reports and unchanged archive bytes. When the C#
native observation reader changes, the existing DVI/TFM oracle must reproduce
the frozen glyph evidence exactly before qualified calibration can be reused.
Fresh current checking retains that replay and its current source captures.
For complete diagrams, the same PDF commands use the checked primary frame's
three native encodings and the owned original PDF pages. Registration still
uses native save-position, measured wrapper glue and physical page/raster sizes.
The diagram's independently computed picture-plus-ink root supplies natural
clipping; the conservative camera supplies expanded inspection. Legacy families
keep their two encodings and picture-only root. Every diagram's current checker
recreates public output and replays 24 primary plus eight PDF views.
Final feature acceptance combines ordinary tests, controls and fresh comparisons
in a committed source export. Individual reports make no general feature or
pixel-identity claim.
