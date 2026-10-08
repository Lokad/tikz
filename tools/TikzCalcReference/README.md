# Native calculated-coordinate reference

The trusted `tests/Fixtures/calc-coordinates.tikz` fixture covers 25 calculated
and input coordinate anchors plus an empty circle node. `wrapper.tex` compiles
the picture; `probes.tex` reads each coordinate in a reset world frame and logs
integer TeX scaled points. The probes add no paint.

The cached `tests/Reference/CalcCoordinates/points.json` records the source hash,
native coordinates, tool/font versions, observer SVG hash and TeX box. The
original outlined native SVG is cached beside it as `reference.svg`. Ordinary
xUnit tests read this cache and require no TeX installation or browser.

The native generation command requires Node, MiKTeX with PGF 3.1.11a and Latin
Modern already installed, and dvisvgm 3.4.3. Run from the repository root:

```powershell
node tools/TikzCalcReference/generate.mjs
```

Generation uses the fixed trusted fixture only, with package installation and
shell execution disabled. It creates a fresh ignored `artifacts/calc-native/`
directory containing plain/probed inputs, original logs, DVI, SVG, recorder
files and a hash-bound report. It requires identical plain/probed SVG bytes and
TeX boxes, all 25 expected anchors, and exact agreement with the cached source
and coordinate values. It never updates the cache automatically.

The converter is not invoked during native reference generation. Native
measurement is one part of grounding; candidate primary/PDF comparison and
image-only fault detection remain separate requirements.

For development-only candidate and primary-image research, export the same
fixture through the public converter and its trace:

```powershell
dotnet run --project tools/TikzReference -c Release -- export-calc-coordinates
```

Use the exact fresh report path printed by that command. The exporter checks
ordinary/traced SVG, diagnostics, bounds and work-statistics parity, then all
50 native anchor quantities at zero scaled-point tolerance. Its report binds
the candidate assembly, source hashes, SVG, scene and cached reference.

With the pinned development Playwright/Chromium installation available, run:

```powershell
node tools/TikzVisual/inspect-calc-coordinates.mjs <candidate-export/report.json>
```

The inspector checks export hashes and unchanged candidate sources. It derives
the origin, camera and all 24 paint regions from the original native SVG,
without fitting the candidate. It captures natural/expanded frames at 1x/4x
on transparent/white/black for both intrinsic-image and explicit-viewport
routes: 24 paired views and 576 regional observations, with unchanged repeats.
It also records 24 native-only encoding comparisons and four image-only
missing-mark/quarter-pixel-shift controls. No image allowance is selected.
All 24 native driver paths also match the public trace in segment kinds,
scaled-point endpoints/control points and the fixture's effective stroke state.

Open the fresh inspection report's `agent-inspection.json` and `index.html`.
They link the first observed difference, display-size and 4x contact sheets,
paired crops, raw/amplified differences and source/scene records. Attribution
is explicitly spatial overlap; overlapping paint can have several candidates.
The gallery is static; standalone PNGs support agent image inspection.
After a compiler change, create a new candidate export and inspect that new
report. The agent index distinguishes recapturing unchanged evidence from
exporting a changed candidate and links the ordinary follow-up test command.

Completion means evidence generation finished. Image admission remains pending:
independent primary/PDF calibration, the full defect matrix and broader
interactions remain required. Independent saved-evidence verification is
documented below. A black
stroke on an opaque black background has no visible contrast; exact samples
there do not establish detection of a missing stroke.

For independent PGF picture bounds and ordinary PDF page placement, run:

```powershell
node tools/TikzCalcReference/generate-layout.mjs
node tools/TikzVisual/inspect-calc-pdf.mjs <candidate-export/report.json> <native-layout/report.json>
```

The first command compiles plain/probed SVG and ordinary PDF wrappers. It
requires the cached SVG bytes, all 25 anchors, bounds and boxes to agree, plus
identical plain/probed PDF bytes and 96/384-DPI rasters. It uses PGF 3.1.11a,
MiKTeX 25.4, dvisvgm 3.4.3 and Poppler 24.04.0. Package installation and shell
execution are disabled. All source, wrapper, logs, recorder and page artifacts
remain in a fresh ignored research directory; the cache is never overwritten.

The wrapper observes both the outer box baseline and the start of the actual
picture. The fixed fixture produces 16.66664 pt of leading TeX glue in the
outer box. Picture width excludes this glue, and the page origin uses the
independently saved picture position. The cached `pictureBoundsSp` and
`pictureBoxSp` make this distinction an ordinary public API regression.

The inspector checks six public bounds/size quantities at zero-sp tolerance,
then compares original SVG and candidate SVG separately against ordinary PDF
in natural/expanded framing at 1x/4x. Eight views cover the full page, diagram
and 24 native paint regions: 208 regional observations. The full-page expanded
view preserves extra ink outside the diagram. Missing-mark and outside-ink
controls bypass numeric checks; an outside mark is hidden by natural root
clipping and detected by the expanded physical page capture.

Open the PDF report's `agent-inspection.json` or static `index.html` for paired
page/crop images and source records. `route-parity.json` compares the separately
registered original/candidate SVG page captures. PDF/SVG raster differences
remain raw observations with no borrowed policy or image-conformance pass.

For independent verification of the exact completed primary and PDF bundles:

```powershell
node tools/TikzVisual/check-calc-images.mjs <primary-inspection/report.json> <pdf-inspection/report.json>
node tools/TikzVisual/calc-saved-image-self-test.mjs <completed-image-check/report.json>
```

The checker validates every artifact hash and required view/region identity,
then decodes saved PNG samples in Node and recomputes the measurements. The
bounded decoder supports the pinned renderers' 8-bit noninterlaced RGB/RGBA
PNGs, checks chunk CRCs and all five row filters, and preserves RGB samples
even at zero alpha. Browser canvas readback can discard those samples.
`pdf-pin.json` binds the fixed native report, ordinary PDF and both native page
rasters to their original source; it supplies no pixel-error allowance.

The checker invokes a fresh public converter export and matches its source,
SVG, scene, numeric evidence and compiler source guards to both saved bundles.
It independently reads the native page-layout logs, materializes the bound
inputs in its own run directory, and reruns both guarded image producers. All
saved PNGs and presentation artifacts must reproduce; only the explicitly
declared rerun input paths and the resulting provenance digests are normalized.
This cached check needs .NET and the pinned Node/Playwright/Chromium tooling,
and does not invoke native TeX or PDF executables.

The corruption command uses the checker's actual saved-image and source-binding
verifiers. Its controls cover missing/duplicate coverage, false measurements,
hidden transparent RGB, changed cameras/SVGs and invalid report metadata. It
also substitutes primary and PDF PNGs and recomputes their hashes, regional
metrics and affected report summaries. These internally consistent pixel
forgeries pass decoded-metric recomputation and must fail source recapture.
Mutation artifacts are overlays on the hash-bound baseline named by each
control, rather than complete copies of the original bundle.

The PNG implementation has separate ordinary and independent-renderer checks:

```powershell
node tools/TikzVisual/calc-png-self-test.mjs
node tools/TikzVisual/calc-png-renderer-self-test.mjs
```

The first uses Node built-ins only. The second cross-checks all five filters
for both RGB and RGBA with the pinned Chromium decoder and canvas encoder, and
demonstrates canvas loss of hidden RGB at zero alpha. Both renderer and saved-
image controls retain fresh hashed evidence under ignored `artifacts/`.
Successful verification establishes the saved research evidence's integrity
and reproducibility. Primary/PDF calibration, the full visible-defect matrix,
broader interactions and integration remain pending.
