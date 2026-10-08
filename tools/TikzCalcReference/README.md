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
and reproducibility. Native-only primary calibration and sensitivity follow
below; public/PDF qualification, broader interactions and integration remain
pending.

For native-only primary calibration and image sensitivity, without invoking the
converter or native TeX executables:

```powershell
node tools/TikzVisual/calibrate-calc-primary.mjs <native-layout/report.json>
node tools/TikzVisual/check-calc-primary.mjs <completed-primary-calibration/report.json>
node tools/TikzVisual/calc-primary-self-test.mjs <completed-primary-check/report.json>
```

The calibrator builds three independent encodings from the original native
paths: a local origin with the recorded driver scale, a local origin with the
exact physical scale, and separate physically scaled paths inside rounded
native picture bounds. It preserves the native paths, 0.4-pt black stroke,
paint order and root proportions. Neither candidate SVG nor converter geometry
supplies calibration data. The unchanged original driver remains the reference.

Each encoding runs through both intrinsic-image and explicit-viewport capture
routes over natural/expanded frames, 1x/4x and transparent/white/black: 72
native-only views. Limits are the per-quantity maxima across the three native
representations in each exact view and region. Only foreground means round
upward to 1e-9; component changes remain forbidden. A further 24 independent
captures repeat the last representation, requiring identical PNGs and metrics.

Twelve defect families each run all 24 views: missing mark/circle, quarter-pixel
movement, wrong width/opacity/color/cap/unit scale, altered curve control,
lost clipping, cropped root and ink outside the diagram. Every prescribed
visible defect must fail its intended region with numeric checks bypassed.
Black-on-black changes and frame-hidden changes must preserve the unchanged
PNG samples. Clipping and faint-opacity probes are explicitly renderer-only
controls; they establish no new native TikZ paint/clip compatibility.

Two exact-encoding visibility matrices remove a mark at 1% and 0.1% opacity.
They preserve losses hidden by raster quantization rather than declaring them
detected. These controls keep numeric agreement mandatory and do not supply
an opacity allowance to the ordinary opaque policy.

The main report contains bounded view indexes; complete metrics, evaluations
and paired crops live in hash-bound per-view records. `agent-inspection.json`
and `index.html` link white-backed 1x/4x defect sheets. The independent checker
decodes every indexed and invisible-control pair, derives the policy again,
reconstructs native page evidence and recaptures the complete calibration from
owned inputs. The corruption tests use these actual verifiers, including a
PNG substitution with recomputed metrics and policy that must fail source
reconstruction. A completed native calibration is research evidence: PDF
qualification, a fresh public-candidate trial and reviewed combined admission
remain separate requirements.

Native-only ordinary-PDF calibration has its own commands and policy:

```powershell
node tools/TikzVisual/calibrate-calc-pdf.mjs <native-layout/report.json>
node tools/TikzVisual/check-calc-pdf.mjs <completed-pdf-calibration/report.json>
node tools/TikzVisual/calc-pdf-self-test.mjs <completed-pdf-check/report.json>
```

The ordinary native PDF remains the reference. The original SVG driver and
three independently selected native encodings each render natural/expanded
views at 1x/4x on white, without converter input: sixteen calibration views.
Registration comes from the native page-position logs. The fixed 27 regions
cover the page, diagram, each of 24 native paints and a page corner outside
the diagram. A further sixteen separately rendered views require unchanged
PNG bytes and measurements for all four routes.

Per-view and per-region limits take the native-only maxima of ordinary pixel,
foreground and edge errors. Additional integer ranges cover each RGB channel's
ink mass and horizontal/vertical first moments across the four native routes,
with no candidate input or added margin. These retain low-contrast evidence
below the edge-mask threshold. Eleven image-only defect families exercise all
four PDF views; every visible defect must fail its intended region, and
frame-hidden controls must preserve decoded samples. The page-corner control
exposes extra ink in expanded views.

Lost-half-clip and 1%/0.1% opacity controls use separately derived exact native-
encoding ink profiles. They never loosen the opaque PDF pixel allowance and
establish no new native clipping/opacity compatibility. Actual visibility is
recorded, including losses hidden by raster quantization.

The independent checker decodes all 100 pairs and 2,700 regional measurements,
recomputes ink/moments and both policy types, verifies native registration and
source pins, then recaptures the complete bundle from owned native inputs.
Every PNG and presentation artifact must reproduce; only declared native input
paths and the resulting agent digest are normalized. Actual-verifier controls
include independently falsified ink mass and x/y moments, changed images,
regions, cameras, coverage, policies and summaries. A PDF-for-SVG PNG
substitution updates its replay, measurements, policy and defect verdicts;
it must pass saved-pixel recomputation and fail source reconstruction.

Bound per-view records, `agent-inspection.json` and `index.html` retain identical
paired crops and 1x/4x defect sheets. The ordinary PDF and SVG edges remain
visibly different; a completed calibration/check is reproducible research,
not a pixel-perfect claim or an admitted image policy. Fresh public candidate
qualification, combined admission, interactions and root integration remain
open. None of these development tools becomes a production dependency.

For a current public SVG trial against these frozen research policies:

```powershell
node tools/TikzVisual/prepare-calc-trial-reference.mjs <primary-check/report.json> <pdf-check/report.json> <primary-controls/report.json> <pdf-controls/report.json>
dotnet run --project tools/TikzReference -c Release -- export-calc-coordinates
node tools/TikzVisual/trial-calc.mjs <candidate-export/report.json> <prepared-native-reference/report.json>
node tools/TikzVisual/check-calc-trial.mjs <completed-public-trial/report.json>
node tools/TikzVisual/calc-trial-self-test.mjs <completed-public-check/report.json>
```

Preparation accepts the exact previously verified native research digests in
`calc-trial-reference.mjs`. It copies the original native inputs, complete proof
manifests and selected calibration records into a compact owned projection.
The original calibration PNGs stay in their source bundles. Each selected
artifact must match its pinned manifest; policies are derived again from the
native records. This research pin supplies no image admission and has no
candidate-derived camera, region, limit or refresh option.

The public trial requires 50 anchor quantities, 416 native path/state checks,
six picture-bound quantities and four serialized root dimensions. It runs
24 primary views and four ordinary-PDF views for each of original/public SVG,
followed by 32 separately captured replays. Eleven opaque image-only defect
families each run all 24 primary and four PDF views. Visible changes must fail
their intended region, and invisible changes must preserve decoded samples.

Lost-half-clip and 1%/0.1% opacity controls separately compare unchanged and
altered public encodings in all primary/PDF views. These candidate-only
comparator baselines cannot change any native allowance or establish native
clipping/opacity compatibility. Controlled PDF records link both SVG page PNGs
for direct inspection; the ordinary opaque PDF remains a separate reference.

The checker independently decodes all 540 pairs and recomputes 13,212 regional
observations, policies, defect visibility and all combined gates. It requires
a fresh public conversion to reproduce every functional export artifact and
compiler source guard. New commit/build provenance is retained separately.
The owned original export and compact native projection then recapture the
entire trial; PNGs and presentation artifacts must reproduce exactly, with
only declared input-path provenance normalized. It needs the pinned browser
and .NET development tools, and invokes no native TeX/PDF executable.

Actual-verifier corruption controls cover manifests, completion, coverage,
native pins/camera, candidate anchors, pixels, RGB ink/moments, gate summaries
and agent source attribution. A primary PNG substitution updates its replay,
hidden-frame control, whole/local metrics and verdicts while retaining the
native policy. Saved-pixel verification must accept the consistent forgery,
and source reconstruction must reject it. Mutation evidence remains a hashed
overlay on its bound baseline.

`agent-inspection.json` links native agreement, declared frames, every selected
paired image, 1x/4x crops, differences and verified path-to-source identities.
The static `index.html` gallery focuses on defect crops. A `trial-pass` is
fixed-fixture research evidence. Reviewed combined admission,
broader interactions, root integration and release qualification remain open.

## Portable public-trial evidence

The pinned `tests/Reference/CalcCoordinates/public-trial.bin.gz` preserves the
completed public trial, the independent check, its owned source recapture,
fresh functional export, corruption overlays and captured source bytes. The
development archive stores each distinct byte sequence once. Its bounded
decoder rejects unsafe paths, unused/missing blobs, altered metadata, changed
artifact bytes and trailing content. Compressed and decoded hashes have separate
external pins; preparation never updates those pins or the tracked cache.

```powershell
node tools/TikzVisual/calc-trial-cache-self-test.mjs
node tools/TikzVisual/prepare-calc-trial-cache.mjs --replay
```

The first command independently recomputes the 540 image pairs and 13,212
regional observations, verifies the complete owned recapture and fresh export
bindings, and replays the eighteen saved corruption overlays through the actual
pixel or source-binding verifier. It also exercises the archive decoder and
external pin checks. The second command recreates the same archive from its
tracked evidence. Both emit fresh owned receipts. Neither invokes TeX, a browser
or the converter. Initial preparation without `--replay` consumes only the exact
completed local proof paths and hashes in `calc-trial-cache-pin.mjs`.

Historical production hashes remain evidence of the qualified snapshot. Loader
guards check the current evidence tools separately; checking this cache cannot
prove that a changed production compiler conforms. Structural-only loading is
explicitly labeled and supplies no pixel qualification. Current image admission
still requires a separately reviewed combined profile and a new public trial
with the pinned renderer. The compact native projection preserves selected
native calibration records and complete source manifests; it does not contain
the original full calibration PNG bundles or claim to replay them.
