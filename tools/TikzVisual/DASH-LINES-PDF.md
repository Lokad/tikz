# Forty-line PDF rasterizer investigation

This development-only investigation consumes the unchanged trusted
[forty-line fixture](../../tests/Fixtures/Dashes/dashes.tikz) and its pinned
[native snapshot](../../tests/Reference/Dashes/snapshot.json). It invokes no
converter or production resources and writes only fresh ignored artifacts.
It establishes numeric evidence and a scoped rasterizer qualification;
primary/PDF image admission for this family remains pending.

Run from the repository root:

    node tools/TikzVisual/dash-lines-oracle-self-test.mjs
    node tools/TikzVisual/inspect-dash-lines-pdf-rasterizers.mjs

The first command uses the checked-in oracle and the pinned development
browser. Its 78 controls cover unchanged/equivalent instructions, all source
and artifact hash failures, snapshot identity, every line's coordinate
checks, dash/width/phase/cap/page mutations and diagnostic-wrapper budgets.
Visual CI runs these cached controls and uploads their report.

The second command also requires `pdftoppm` and `pdftocairo` 24.04.0 on PATH.
The Splash executable must match the native snapshot; the independently
selected Cairo executable SHA-256 is
`35e9a069589d52ad9e2b2ce3eb28b00dee2555c4ee72c1335242a4842f9b10e5`.
It validates the cached reference with the separate .NET tool, pins all
tool/source/browser identities and retains exact renderer commands.
It does not run TeX, regenerate references or change any tolerance.

The fixed PDF reader verifies 444 original quantities: native finite point
conversion, dash arrays/phase/width, caps, line endpoints, page size and
measured origin. A minimal diagnostic PDF must reproduce the original
pixels exactly. Four further diagnostics change only equivalent dash
spellings: explicit repetition of the odd and single-item arrays, positive
normalization of the negative phase over its full cycle, and all three
rewrites together. Both occurrences of the physical-literal state are
rewritten. All forty exact integer-grid dash interval lists must agree in
each diagnostic; page, origin and other paint instructions stay unchanged.

Both installed rasterizers preserve exact PNG bytes under all five
diagnostic encodings at 1x and 4x. All 24 page renders repeat exactly; the
original Splash pages reproduce the existing snapshot. This line-family
result is separate from the geometry corpus's odd-array/negative-phase
renderer discrepancy.

The SVG camera comes from native scaled-point bounds. The PDF camera comes
from measured box position and page dimensions. Neither is fitted to ink.
Eight native SVG representations cover native/printed widths, group/element
transforms and independently bounded root choices, with 2,536 integer
serialization checks. Three routes are observed on each PDF page: original
driver SVG, one preselected native representation and literal PDF
instructions reconstructed as SVG. The last route retains the measured
printed-origin difference explicitly and supplies no candidate allowance.

Fifty-four padded-root/boundary controls produce identical pixels on the
native page lattice at both scales. Twenty-four raw observations cover
both rasterizers, three SVG routes, natural/expanded framing and both
scales, with 960 local measurements. Every observation retains all forty
paired path crops, contact sheets, raw/amplified differences and overlays.
Three bounded crop batches must produce identical full measurements and
cover every region exactly once.

At 4x with expanded framing, the original SVG has these raw measurements:

| PDF rasterizer | Maximum edge distance (CSS px) | Mean foreground channel error (0–255) |
| --- | ---: | ---: |
| Splash | 4 | 21.3201 |
| Cairo | 0.25 | 3.8970 |

The literal PDF-instruction route also retains maximum distances of 4 and
0.25 CSS pixels respectively. Exact instruction reconstruction therefore
does not explain the Splash discrepancy through finite coordinate
conversion alone. Cairo also has nonzero raw differences. These are
observations, not acceptance limits or a proof of pixel identity.

The fresh bundle lives under `artifacts/dash-lines-pdf-rasterizers/run-*/`.
`latest.json` identifies the run and hashes `report.json`; the report hashes
all 6,097 assets and links every crop to its independently named native case.
Open `index.html` or a `*-path-2-sheet.png`, `*-path-5-sheet.png` or
`*-path-30-sheet.png` directly with an image viewer. The report also retains
every other path's crops, raw errors, fixed camera, numeric checks and
qualification controls. Source spans belong to the separate public
candidate comparison, not this oracle-only investigation.

Exit zero means complete evidence and the stated Cairo qualification, one
means completed evidence with failed qualification, and two means a failed
input/tool/measurement phase. Reports retain `overallVerdict: pending`,
`approvedImagePolicy: false` and `imageConformanceClaim: false` even on zero.
Failed runs remain retained. The initial command-spelling experiment is
also retained; PGF's `0.0` and `1.0` spellings must be matched by decoded
numeric state before preserving and rewriting their original text.

Next derive separate primary/PDF limits from independent representations,
prove relevant image-only defect sensitivity, compare the fresh public
converter and review immutable admission. No geometry-family policy,
candidate extrema or literal-instruction measurements supply these limits.
Hosted CI execution and broader path/label/node interactions remain open.
