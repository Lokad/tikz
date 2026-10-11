# Grounding against TikZ

Use the [verification coverage and execution index](VERIFICATION.md) for fast
affected-feature checks and the separate final 29-case qualification matrix.
It maps retained requirements, consolidated corruptions and iteration views.

The required corpus currently contains nine independently authored fixtures:

| Fixture | Grounded behavior |
| --- | --- |
| `line-units` | Physical units, named coordinates, unscaled stroke, color mixture, opacity |
| `relative-coordinates` | Compound paths, distinct `+`/`++` reference updates, round joins |
| `ordered-transforms` | Basis lengths, transform order, transformed orthogonal corners, styles and scope restoration |
| `cubic-controls` | Absolute/relative cubic controls, PGF picture bounds including control points |
| `rotated-rectangle` | Rectangle order under rotation/scaling, fill and opacity |
| `clip-scope` | Clip geometry, inherited clipping, PGF picture-size suppression and scope restoration |
| `circle-ellipse` | Four cubic quadrants, unitless/physical radii, circle continuation and named-anchor precision |
| `ellipse-basis` | Oblique basis vectors, affine ellipse axes, physical radii independent of basis lengths |
| `arc-sweeps` | Clockwise/counterclockwise sweeps, PGF segment subdivision, physical/basis radii and relative continuation |

These fixtures establish behavior for their concrete forms. Separate text,
node, and dash corpora have their own scoped evidence and admission states.
Additional shape options and combinations still need oracle evidence.
Named coordinates remain stored globally; path references reproduce
PGF's bounded reciprocal/scaled-point round trip through the local frame.
Mixed physical and dimensionless radii are rejected, and generated shape
segments consume the same conversion budget as explicit path segments.

## Ordinary .NET tests

```text
dotnet test Lokad.TikZ.slnx
```

These tests consume checked-in PGF measurements and need neither TeX nor a
browser. They cover independent bounds, anchors, path segments and paint,
error behavior, limits, cancellation, culture independence, and
repeated/concurrent conversion.

The independent [straight `to`/`edge` corpus](../tools/TikzEdgeReference/README.md)
adds five trusted native fixtures, 99 path calls, 90 paints, four measured nodes,
64 node anchors and one named coordinate. The public straight connection
prototype passes 2,585 numeric assertions. Its fixed image profile requires
separate primary/PDF limits and exact independent native-page agreement;
broader connection interactions remain pending.
Its required cached CI commands use Node built-ins
and need neither TeX nor a browser:

```text
node tools/TikzVisual/edge-reference.mjs check-cached
node tools/TikzVisual/edge-evidence-self-test.mjs
```

The second command passes 334 integrity, parser, replay, state and semantic controls.

Both commands retain fresh hashed reports under ignored `artifacts/`. A separate
native SVG/PDF gallery, using the existing pinned development browser, runs with
`node tools/TikzVisual/edge-inspect.mjs`. Its paired images retain raw differences
at 1x/4x without a conformance verdict. Explicit live generation and replay
verification are documented with the corpus.

The [independent edge oracle](../tools/TikzEdgeOracle/README.md) adds a
framework-only DVI/TFM reader with no converter reference. Run
`dotnet run --project tools/TikzEdgeOracle -c Release` without TeX or a browser.
Its native-only image harness runs with
`node tools/TikzVisual/inspect-edge-oracle.mjs`; arithmetic and renderer controls
run with `node tools/TikzVisual/edge-oracle-self-test.mjs`.
The inspection retains 900 primary and 20 ordinary-PDF observations across five
fixtures, with independent cameras, original/native-semantic SVGs, complete
local measurements, repeat captures and agent-viewable PNGs. Use the explicit
saved-run checker documented with the tool to reconstruct native inputs and
remeasure the images. All reports keep calibration and image admission pending.

The [operation diagnostics](../tools/TikzVisual/EDGE-OPERATIONS.md) further
isolate ninety native paints and sixteen glyphs, preserving the same cameras,
paint inheritance and clips. Run `edge-operation-self-test.mjs`, then
`inspect-edge-operations.mjs` under `tools/TikzVisual/`. The full matrix retains
ninety whole-picture and 1,908 isolated pairs in three independent encodings.
Its explicitly selected `check-edge-operations.mjs` reconstructs all 651 SVGs
and remeasures saved PNGs. Nonempty clipped-ink controls prevent a repeated blank
pair from masquerading as a valid renderer result. These are diagnostics;
independent tolerance calibration and public image admission remain pending.

The [native primary calibration](../tools/TikzVisual/EDGE-PRIMARY.md) runs with
`node tools/TikzVisual/calibrate-edge-primary.mjs`. Its controls run with
`node tools/TikzVisual/edge-primary-self-test.mjs`, and an explicitly selected
`check-edge-primary.mjs` verifies the saved run. Short native-point paths and
six-decimal glyph matrices supply independent local limits. A derived-driver
copy restores only the independently verified missing dot; original comparisons
remain separate. Image-only controls distinguish visible losses from unchanged
black-on-black and subquantum samples. These tools cannot approve conformance;
PDF qualification and the public combined/admission gates remain required.

The [native-page PDF qualification](../tools/TikzVisual/EDGE-PDF.md) runs with
`node tools/TikzVisual/calibrate-edge-pdf.mjs`; focused controls run with
`node tools/TikzVisual/edge-pdf-self-test.mjs`. Select its completed report for
`check-edge-pdf.mjs`. The checker rebuilds native references and mutations,
replays root-boundary controls and independently measures saved page pixels
and integer RGB ink sums in every native crop. Original-driver diagnostics and
the corrected reference retain distinct roles. This is reference-only work;
the public combined trial and reviewed immutable admission remain required.

The [public combined image trial](../tools/TikzVisual/EDGE-TRIAL.md) explicitly
selects all four completed primary/PDF qualification and checker reports before
converting afresh. Run `trial-edge-images.mjs` with those four exact paths, then
`check-edge-trial.mjs` with its owned trial report path. Eight gates join the
native numeric/frame checks, primary views, both PDF routes, exact independently
reconstructed native pages and fresh public image-only defects. The independent
checker reconverts and verifies saved samples, ink sums, source attribution,
coverage and report corruption controls. `edge-trial-self-test.mjs` supplies
25 focused framing/mutation controls. Complete failed bundles remain available;
a trial pass grants no immutable image admission. Cached execution needs .NET
and the pinned development browser, without TeX or a PDF executable.

The [portable cached trial](../tools/TikzVisual/EDGE-CACHED.md) needs no old local
qualification folders. Run `edge-image-cache-self-test.mjs` for 33 archive/source
integrity controls, then `trial-edge-cached.mjs` for an owned fresh public trial
and that exact trial's independent checker. The tracked independent cache keeps
all original reports and artifacts, with compressed/decoded pins outside the
archive. Limits, views and original-driver diagnostics remain unchanged.
Renderer-environment compatibility remains explicit.

The [fixed straight-edge admission](../tools/TikzVisual/EDGE-CONFORMANCE.md)
runs with `node tools/TikzVisual/compare-edge-conformance.mjs`. It requires the
owned cached trial and checker under a separate immutable eight-gate profile,
then retains a self-contained agent gallery with source/scene links and all
proof artifacts. `edge-admission-self-test.mjs` supplies 80 browser-free policy
controls; `--report <explicit admission report>` additionally verifies saved
bytes, process/report bindings and rejected proof weakening. Raw observations
retain unapproved roles. Hosted validation and broader connection coverage
remain pending.

The [candidate numeric command](../tools/TikzEdgeComparison/README.md) runs
`dotnet run --project tools/TikzEdgeComparison -c Release` and needs no TeX or
browser. It retains emitted SVG, source spans, resolved paths/nodes/glyphs,
individual numeric assertions and captured source/reference hashes.
`node tools/TikzVisual/edge-candidate-inspect.mjs` owns a fresh numeric run and
renders candidate/original-SVG and candidate/original-PDF pairs at 1x/4x on
the measured native page. It retains full pages, common integer crops, raw and
amplified differences, overlays and an HTML viewer. No image verdict is assigned.
The native SVG drops the degenerate round-capped edge's dot, while native PDF
and the candidate paint it; this difference remains explicit.

The ordinary suite currently has 350 passing cases, including five plain/traced
public-result parity cases. Fourteen candidate mutation
controls reject geometry, order, missing edges, paint state, clips, picture bounds,
glyph positions and node frames; unsupported connection forms and generated-edge
budgets have source-attributed tests. The separate
[dash harness](DASHES.md) validates forty native dash states and executes
927 public numeric checks. Cached validation and the browser image trial
are separate commands:

    dotnet run --project tools/TikzDashReference -c Release -- check-cached
    dotnet run --project tools/TikzDashComparison -c Release
    node tools/TikzVisual/trial-dashes.mjs

The last command needs the pinned development browser and creates paired
PNGs, local crops, contact sheets, source traces, and hashed reports under
artifacts/dash-image-trial. Its primary policy is an unapproved trial,
and the independently registered PDF observations remain pending.
The live verify command belongs to separate explicit MiKTeX work.

The separate dash geometry corpus adds sixteen painted paths and three clips:

    dotnet run --project tools/TikzDashGeometryReference -c Release -- check-cached
    dotnet run --project tools/TikzDashComparison -c Release -- geometry
    node tools/TikzVisual/dash-geometry-image-self-test.mjs
    node tools/TikzVisual/inspect-dash-geometry.mjs

Its 1,090 numeric checks and 24 primary views/384 local observations have
separate provenance and admission states. Six repeated positive and six
negative controls exercise clipped image rendering. The browser inspection
retains raw differences without an approved threshold. A separate pinned
primary policy admits the sixteen-path corpus. A separate qualified Cairo
profile now also admits its combined PDF gate. Cached numeric checks belong to ordinary CI; browser
inspection and its controls belong to visual CI. These inspection commands
do not upgrade this family's evidence to combined image conformance.

The ordinary-PDF geometry investigation has its own commands:

    node tools/TikzVisual/dash-geometry-pdf-vector-self-test.mjs
    node tools/TikzVisual/inspect-dash-geometry-pdf.mjs

The bounded PDF reader checks all sixteen paints and three clips, including
cubic controls, finite PGF point conversion, state, opacity, inherited clip
chains and page registration. Its 446 numeric checks and 35 positive/negative
controls require the pinned development browser but invoke no converter.
The separate image command fixes the camera and sixteen local regions from
native measurements, verifies 54 exact page-viewport controls, and retains
40 whole-picture/640 local observations at 1x/4x. It compares original SVG,
eight independent SVG representations and literal PDF instructions in SVG
against the unchanged ordinary TikZ PDF rasters. Fresh GUID bundles contain
paired crops, differences, a viewer, numeric records and tool/input hashes.
No PDF image limit is selected by this experiment. Full-channel differences
and dash-phase discrepancies remain visible in its retained Splash results.
The separately qualified immutable Cairo profile runs with:

    node tools/TikzVisual/compare-dash-geometry-conformance.mjs
    node tools/TikzVisual/dash-geometry-pdf-policy-self-test.mjs

It requires fresh native/frame/primary gates and both original/candidate
PDF comparisons, using checked-in independent Cairo evidence. Its allowance
comes from forty oracle observations, forty exact replays and nineteen
rejected image-only defects. Cached comparison needs no installed PDF engine.
Its raw differences, source-linked crops and guard/defect evidence remain
separate from the earlier unapproved research. See [dash grounding](DASHES.md)
for its qualification, scope and explicit reference-revision workflow.

The native path-unit experiment additionally runs with:

    node tools/TikzVisual/trial-dash-path-units.mjs

It retains seven independently derived representations and public candidate
images: 3,054 serialization checks, 96 views and 1,536 local observations.
Each fresh artifacts/dash-path-units bundle owns its source/tool copies,
original/candidate SVGs, raw image differences, paired crops, scene trace
and machine-readable hashes. It derives no image policy.

Dash cache-integrity controls and independent PDF instruction diagnostics
are also separate from admission:

    pwsh -NoProfile -File tools/TikzDashReference/check-cached.ps1
    node tools/TikzVisual/dash-pdf-vector-self-test.mjs
    node tools/TikzVisual/inspect-dash-pdf.mjs

The cache controls require the Release reference tool to be built.
The full PDF investigation also needs the pinned development browser.
Its 444 numeric checks and eight raw raster observations do not invoke
the candidate or grant any image allowance.

The [circle/ellipse node oracle](../tools/TikzShapeReference/README.md) supplies
independent native references for the public numeric prototype:

```text
dotnet run --project tools/TikzShapeReference -c Release -- check-cached
pwsh -NoProfile -File tools/TikzShapeReference/check-cached.ps1
```

The first command checks retained measurements, source/artifact provenance,
probe invariance, and complete 28-node coverage. The second requires that Release
build and tests unchanged, missing, tampered, and consistently rehashed evidence
in isolated copies. Both are ordinary CI steps without TeX or a browser. Live
`generate` and `verify` commands are documented separately. Ordinary
[shape tests](../tests/Lokad.TikZ.Tests/CurvedNodeTests.cs) require exact native
layout, anchors, full background paths, picture bounds, and all 448 public
border endpoints. They also check finite normalization, library order/isolation,
diagnostics, shared limits, and cancellation. The current suite passes 212 tests,
including direct native glyph/affine placement and eighteen input-consistency
controls. A separate [candidate harness](../tools/TikzShapeComparison/README.md)
exports 4,461 source-aware numeric checks and paired inspection artifacts:

```text
dotnet run --project tools/TikzShapeComparison -c Release -- compare-numeric
node tools/TikzVisual/inspect-shapes.mjs
```

The inspector requires fresh numeric success and hashes every artifact. It saves
1x/4x transparent/white/black PNGs for natural and expanded native cameras,
98 independently derived regions, source-linked paired crops, and
`artifacts/node-shape-comparisons/inspection.html`. Both commands are prepared
CI steps. The inspector's successful artifact generation is not an image pass.
Circle/ellipse image and PDF conformance remain pending; these cases inherit no
existing node or path raster allowance.

The separate [ordinary shape PDF reference](../tools/TikzShapePdfReference/README.md)
now retains an independently measured native-page camera and 1x/4x page PNGs:

```text
dotnet run --project tools/TikzShapePdfReference -c Release -- check-cached
pwsh -NoProfile -File tools/TikzShapePdfReference/check-cached.ps1
```

These are ordinary Windows/Linux CI steps with no TeX or browser requirement.
All 1,810 native records agree with the original SVG route; plain/probed
PDF and PNG bytes match, and two expected embedded fonts are recorded.
Twenty-two new ordinary tests check native/page evidence and raster headers.
Twenty-six cached controls reject missing, false, damaged and rehashed evidence
against an external snapshot while preserving two positive cases and the
original baseline. Reports stay under artifacts/node-shape-pdf-cache-tests/.
Explicit live generate/verify commands additionally need the pinned MiKTeX
and Poppler tools. This evidence establishes registration and reproducibility;
image comparison/calibration and shape PDF admission remain pending.

The [independent shape PDF experiment](../tools/TikzShapeCalibration/PDF-CALIBRATION.md)
now measures both natural and expanded native-page framing:

```text
node tools/TikzVisual/shape-pdf-self-test.mjs
node tools/TikzVisual/calibrate-shape-pdf.mjs
```

The full command includes 59 camera/bitmap controls, fresh independent
ink/frame reconstruction, 54 exact real-fixture viewport controls, 28
whole-picture and 2,744 local SVG/PDF observations, and 56 exact unchanged
captures. Its fresh GUID bundle includes 862 PNGs and exact tool-source copies;
artifacts/node-shape-pdf-calibration/latest.json identifies the current report.
Raw differences remain pending research evidence; no candidate output supplies
a camera or limit. Both commands are prepared visual CI work, and the full
command includes the controls without a duplicate CI invocation.

The separate [prospective shape PDF trial](../tools/TikzShapeCalibration/PDF-TRIAL.md)
fixes fixture/representation/region/view limits from fresh oracle-only evidence
before invoking the converter. It requires both original-SVG/PDF and public
candidate-SVG/PDF gates, alongside fresh primary, numeric and ink/root gates:

```text
node tools/TikzVisual/shape-pdf-policy-self-test.mjs
node tools/TikzVisual/trial-shape-pdf.mjs
```

All 38 pure policy controls pass and are prepared required visual CI work.
They cover faint local losses, absent edges, coverage/reference-raster consistency,
repeat instability, outside-camera ink, contradictory summaries and bypassed
prerequisites. The full trial runs ten image-only defects at both natural
white scales and retains fresh GUID bundles under artifacts/node-shape-pdf-trial/.
Its prospective policies remain unapproved; the full research trial is an
explicit local command rather than a conformance admission gate.

The local full trial passes 13 expected cases, 32 PDF views and 3,264
region/page/repeat gates. Both PDF sides, the fresh public primary gate,
4,461 native checks and 406 ink/root checks pass. All four candidate page PNGs
match the independent native reconstruction byte for byte. The bundle owns
1,647 artifacts including 1,570 PNGs; missing-period and cropped-root 4x pairs
have been inspected. At 4x the outside-camera defect passes whole/local limits
and fails the separately required full-page check. These results retain pending
overall conformance, and hosted execution remains unverified.

Run the separate [oracle-only shape calibration](../tools/TikzShapeCalibration/README.md)
before considering any image allowance:

```text
dotnet run --project tools/TikzShapeCalibration -c Release -- derive-svg
node tools/TikzVisual/calibrate-shapes.mjs
```

This project has no converter reference. It reconstructs native paths and
glyphs, retains original outlines/paint, and compares five representations of
the independent oracle. It records 4,952 serialization checks, 60 whole-picture
and 5,880 regional observations, twelve exact unchanged-pair repeats, and
hash-identified images under `artifacts/node-shape-calibration/`.
The HTML gallery and JSON report support agent inspection. Successful evidence
generation retains a pending image verdict; the observed errors define no
candidate threshold. Natural and expanded cameras expose framing effects
separately. PDF and image-only defect evidence remain required.

The [independent ink/frame workflow](../tools/TikzShapeCalibration/FRAMING.md)
adds tight transformed-curve bounds, stroke extents, native/original viewport
containment and controlled clipping experiments:

```text
node tools/TikzVisual/shape-frame-self-test.mjs
node tools/TikzVisual/compare-shape-frames.mjs
```

The first command passes 44 mathematical and malformed-input controls. The
second first generates an independent `artifacts/node-shape-frames/frames.html`
gallery, with 214 analytic/browser checks, then requires fresh public numeric
success and passes 406 ink/root comparisons in
`artifacts/node-shape-frame-comparisons/report.json`. Twelve unchanged SVG
captures and twelve bitmap-copy controls are exact; SVG clip and post-raster
boundary effects are reported separately. These commands are prepared visual
CI steps, with pending image/PDF admission and unverified hosted execution.

The separate [semantic-frame experiment](../tools/TikzShapeCalibration/SEMANTIC-FRAME.md)
closes the oracle-only natural-root calibration gap:

```text
node tools/TikzVisual/shape-raster-self-test.mjs
node tools/TikzVisual/calibrate-shape-semantic-frame.mjs
```

Twenty-six raster metric controls pass. The calibration derives its six-decimal
root from fresh native picture/tight-ink evidence, retaining the native drawing
instructions. It records original-primary and root-only pairs, fixed regional
channel/foreground/edge/component observations and exact repeat controls under
`artifacts/node-shape-semantic-frame/`. Its JSON entry point links paired crops
and rerun commands for direct agent inspection. Evidence generation remains
distinct from candidate image/PDF admission; no new tolerance is approved.

The [primary shape trial](../tools/TikzShapeCalibration/PRIMARY-TRIAL.md) exercises
prospective limits against the public converter and deliberate image defects:

```text
node tools/TikzVisual/shape-policy-self-test.mjs
node tools/TikzVisual/trial-shape-primary.mjs
```

Twenty-three policy checks reject incomplete/contradictory evidence and prove
that local image gates can reject a faint loss that passes global metrics.
The full trial generates fresh independent calibration before candidate
conversion, requires the existing 4,461 native and 406 ink/frame checks, and
passes fourteen expected control outcomes. Eleven image defects are rejected
at both white natural scales with numeric gates bypassed. Public and independent
replay pairs run all twelve required views. Reports, source-linked crops and
784 PNGs remain under `artifacts/node-shape-primary-trial/` with unapproved
limits and pending image/PDF admission. The trial includes the separate
semantic-frame and public frame commands; CI need not invoke them again.

## Cached visual conformance

The fixed circle/ellipse family has its own
[immutable native-unit combined profile](../tools/TikzVisual/CURVED-NODE-ADMISSION.md).
The earlier local trials above retain their research status. Cached admission
uses checked-in original references and digest-pinned independent calibration:

```text
node tools/TikzVisual/compare-curved-node-conformance.mjs
node tools/TikzVisual/curved-node-admission-self-test.mjs
```

It requires 4,461 native, 406 frame, 1,188 primary and 408 checks on each PDF
route, all 98 local regions and fifteen fresh emitted-SVG controls. The
261 evidence/coverage controls reject missing, changed and rehashed inputs,
altered cameras/limits and incomplete or inconsistent measurements.
Reports and direct agent-viewable paired PNGs live in separate runs under
`artifacts/curved-node-conformance/`. `--crop-region glyph-22` selects saved
presentation crops while every required measurement still executes.
The claim is calibrated primary/PDF agreement for the fixed family;
broader compatibility and hosted execution remain separate gates.

Install the pinned development-only browser tooling once:

```text
npm ci --prefix tools/TikzVisual --ignore-scripts
npm exec --prefix tools/TikzVisual -- playwright install chromium
```

Then compare every required case and exercise the comparator itself:

```text
dotnet run --project tools/TikzReference -- compare --reference cached --out artifacts/comparisons
npm test --prefix tools/TikzVisual
```

Run one focused case with:

```text
dotnet run --project tools/TikzReference -- compare --case line-units --reference cached --out artifacts/comparisons/line-units
```

Both SVGs are rerendered in the same pinned Chromium process at 1x and 4x.
The primary profile requires exact pixels by default, including alpha and
fixed light/dark backgrounds. Six fixtures have explicit precision allowances
documented with [oracle-only calibration evidence](../tools/TikzVisual/CALIBRATION.md).
Coordinate registration uses the measured physical origin; images are never
fitted or automatically aligned. Native dimensions are checked separately.
Missing tools, incompatible manifests, and missing reference artifacts fail
instead of skipping a case.

The cached baseline also includes ordinary pdfLaTeX output rasterized by
Poppler 24.04.0 at 96 and 384 DPI. Cached comparison needs no PDF rasterizer.
The PDF cross-check has its own [calibrated antialiasing bounds](../tools/TikzVisual/CALIBRATION.md).
Reports include candidate-versus-PDF and oracle-SVG-versus-PDF measurements.

Exit codes are `0` for pass, `1` for a semantic/rendering mismatch, `2` for a
harness failure, and `3` for candidate conversion failure or unsupported
coverage. Every nonzero category fails required CI cases. Output directories
are owned by the harness, reset on comparison, and must be inside `artifacts/`.
The suite manifest lists expected and executed cases.

## Inspect a result

Read `artifacts/comparisons/<case>/report.json` first. Open `comparison.png`
to inspect the reference, actual output, and amplified difference, then open
the highest-ranked paired crops. `index.html` supplies common-camera zoom,
blink, and opacity controls. Region links jump to attributed source lines.
Attribution through geometric intersection is labeled as heuristic.

The bundle retains source, original SVGs, 1x/4x PNGs, raw/amplified differences,
overlay, numeric deltas, scene trace, oracle logs, and provenance. Reports
hash their artifacts and record browser identity and rendering settings.
Candidate provenance records its assembly hash, commit, working-tree
fingerprint, build configuration, and options. Fix the implicated compiler
stage, rerun the focused case, and then run the corpus. Do not change an
expected reference or loosen a threshold to hide a candidate defect.

The 41-case self-test requires a passing `line-units` bundle. It repeats unchanged
pairs, mutates geometry/units/stroke/color/opacity/clipping/canvas size, removes
or adds drawing, and tests mostly blank canvases. Synthetic outlined glyph,
minus, baseline, and arrowhead mutations test the comparator; they make no
claim that the converter already supports those features. Each fixture-specific
profile must also reject displacement, doubled strokes, and disappearing faint
content. Foreground error includes every visible sample, including low alpha;
edge/component masks have their own threshold. Adversarial source is never
sent to TeX.

## Explicit live reference generation

Only trusted repository fixtures from `tests/Reference/cases.json` are accepted.
The wrapper records PGF bounds, TeX box dimensions, manifest-selected anchors,
soft-path segments and stroke widths. Paint is read from the independent SVG
driver. New semantic quantities such as node text metrics require additional
probes; geometry hooks alone cannot validate them.

```text
dotnet run --project tools/TikzReference -- generate-reference --case line-units
```

This explicit command writes the checked-in baseline directory. Ordinary
comparison has no baseline-write mode. Review baseline changes and their
provenance before committing them. The pinned versions are declared in
`tests/Reference/oracle-profile.json`; executable and TeX input hashes are
recorded for each generation. Shell escape and automatic package installation
are disabled; process output and execution time are bounded. Those switches
do not make TeX safe for arbitrary submitted diagrams.

Generation compares instrumented and uninstrumented SVGs byte for byte and
checks their TeX box dimensions. The separate ordinary PDF driver supplies
measured page positions for its registration. Fixtures, wrappers, measurements,
and tool profiles have hashes; modified cached artifacts are rejected.

## Oracle-only precision calibration

```text
dotnet run --project tools/TikzReference -- calibrate-reference --out artifacts/calibration
```

This command never invokes Lokad.TikZ and never writes a baseline. It rewrites
the oracle's measured paths in CSS units, preserving paint and clipping, and
compares that representation with the original oracle SVG. Separate variants
perturb coordinates by four TeX scaled points and expand the frame by that
fixed amount. Declared anchor bindings additionally test PGF's measured anchor
against its painted endpoint after a transform round trip. No values are
chosen by fitting images.

The command produces the usual images and reports in each variant directory.
It also writes `artifacts/calibration/calibration-evidence.json`, containing
the aggregate raw metrics, numeric checks, source/reference/derived hashes,
renderer identity, complete browser profile, and tool hashes. A reviewed
snapshot is checked in as `tests/Reference/calibration.json`; the command
itself writes only under `artifacts/`.
It is a measurement experiment, not the required conformance gate: under exact
profiles, the intentional precision perturbations correctly return mismatch
and an aggregate exit code of `1`. A harness error still returns `2`. Review
the raw measurements and [recorded calibration](../tools/TikzVisual/CALIBRATION.md)
before changing a profile. Text and new geometry need new evidence.

## Font-data experiment

The [font generator](../tools/TikzFontData/README.md) has separate explicit
`generate`, live `verify`, and cached `compare` commands. Ordinary tests
check all six embedded fonts against independent TeX glyph, font-dimension,
and pair measurements. Cached atlas comparisons use the existing pinned
browser and write inspection bundles to `artifacts/font-comparisons/`.
They use exact primary pixels and a fixed physical frame, independently
checked baselines, and declared bp coordinate registration. This is an
extraction prototype; node layout, text shaping, the converter's eventual
CSS glyph placement, and secondary PDF text calibration remain separate
conformance work.

Inspection crops have an opaque white background so small black glyphs stay
visible in image tools using a dark transparency background. Full reference,
actual, and raw difference PNGs retain their original alpha; numerical and
raster verdicts use those original captures.

## Whole-label layout experiment

The internal label parser and layout engine have sixteen trusted reference
cases under `tests/Reference/Text/`. Ordinary .NET tests compare every box
dimension and every glyph's font, encoding slot, and position exactly against
native TeX integer scaled points. They also cover unsupported/malformed input,
glyph/work/source/nesting/dimension limits, cancellation, and concurrent layout.
The public rectangle-node prototype now consumes this layout. Its actual-node
CSS comparison has a separate profile. See [the text profile](TEXT.md) for the
bounded grammar.

```text
dotnet run --project tools/TikzFontData -c Release -- compare-text
npm run test:text --prefix tools/TikzVisual
```

Cached comparison requires only the pinned browser, .NET, and checked-in
references. It writes `artifacts/text-comparisons/<case>/` with exact numeric
deltas, source-attributed glyph traces, PNGs, crops, and the same inspection
viewer as geometry. The separate text raster policy comes from
[oracle-only calibration](../tools/TikzVisual/TEXT-CALIBRATION.md), not from
candidate failures or the geometry policy. All sixteen cases render at 1x/4x
over transparent/white/black backgrounds. The 83 comparator checks repeat each
unchanged label and require rejection of glyph omission, quarter-pixel baseline
displacement, thickened outlines, and faint-content omission under every text
case policy; focused checks remove a period, an ffi ligature, and the AV kern.
These checks bypass the numeric gate to verify that the image policy itself
rejects the intended defects.

Explicit live commands are:

```text
dotnet run --project tools/TikzFontData -c Release -- generate-text-reference
dotnet run --project tools/TikzFontData -c Release -- verify-text-reference
dotnet run --project tools/TikzFontData -c Release -- calibrate-text-reference
```

Generation alone writes baselines. Verification runs the pinned trusted
wrapper again without overwriting them. DVItype supplies native glyph positions;
dvisvgm supplies original outlines and its independently measured baseline.
Instrumentation preserves the TeX box and visible SVG. Definition order alone
is canonicalized for equality, since dvisvgm may reorder unused definitions.
The original natural-crop SVG is retained as `oracle.svg`.

Calibration never calls the candidate parser/layout or loads its font outlines.
It places the original oracle outlines at DVItype's integer positions and
measures the difference from the original dvisvgm positions. Its exact-policy
mismatches are expected measurement results, with exit code 1; a tooling error
is 2. It writes aggregate evidence only under `artifacts/text-calibration/`.
Converter CSS placement, natural node/ink bounds, and PDF text calibration
remain separate required work before labeled diagrams are advertised.

## Actual TikZ rectangle nodes

The [rectangle-node prototype](NODES.md) has 22 independently measured actual TikZ
nodes under `tests/Reference/Nodes/`. Its dedicated wrapper/profile leaves the
geometry and bp text baselines unchanged. It records integer sp box dimensions,
font metrics/defaults, separation, line width, sixteen global anchors, and
painted rectangle corners, and native glyph fonts/slots/positions from DVItype.
Ordinary tests require exact agreement. All six font
faces, distinct label/node fonts, multiline boxes, empty labels, small minimum
dimensions, negative separation, and center/north/base/mid placement have cases.

```text
dotnet run --project tools/TikzReference -c Release -- compare-node-layout
dotnet run --project tools/TikzReference -c Release -- compare-node-svg
npm run test:nodes --prefix tools/TikzVisual
dotnet run --project tools/TikzReference -c Release -- calibrate-node-svg
dotnet run --project tools/TikzReference -c Release -- generate-node-reference
dotnet run --project tools/TikzReference -c Release -- verify-node-reference
```

Cached layout comparison writes `artifacts/node-layout/report.json` with 1,322 exact
checks, the managed scene, original reference SVG/log/metrics, artifact hashes,
and candidate provenance. It is a numeric layout report; it does not emit or
compare candidate node SVG. Exit categories match the main harness. Missing or
modified inputs/artifacts fail. Generation alone writes baselines; verification
recompiles only the trusted repository fixture without changing them.
The ordinary Windows/Linux CI jobs run this cached command and upload its
report bundle; hosted execution remains to be verified.

The public SVG command writes `artifacts/node-comparisons/` with 2,347 numeric
checks, the actual public conversion, ordered/source-aware scene trace, paired
PNGs, crops, and viewer. It passes native dimensions and primary SVG rendering
at 1x/4x under the separate [node calibration](../tools/TikzVisual/NODE-CALIBRATION.md).
The policy pins its independent evidence snapshot. Fifteen node comparator
checks repeat correct output and reject missing glyphs/periods/ligatures,
displaced baselines/advances, outline/border/unit/canvas defects, faint content,
and incorrect paint order. Image mutations bypass numerical gates. A separate
numeric mutation verifies the combined verdict.

Node calibration never invokes the candidate compiler or bundled glyph data.
It reconstructs original oracle outlines at native positions in CSS units,
derives a frame from native stroked borders/text boxes, checks outline
containment, and forces an exact raster policy. Its expected precision
differences return 1. It writes numeric/image evidence and provenance to
`artifacts/node-calibration/`; it does not update a baseline or policy. Review
explicit snapshot changes when the representation or reference profile changes.
The current candidate PNGs match the independent native-frame representation
exactly; neither uses image fitting or copies candidate measurements into the
oracle.

Probe verification requires unchanged TeX box dimensions and identical SVG
after sorting definitions by their unique IDs. Only definition order is
canonicalized; painting order, coordinates, transforms, outlines, and dimensions
are preserved. The original SVG is retained, and provenance also records whether
the unsorted outputs were byte-identical. Native font files are checked against
the pinned font profile before live commands run.

Border intersections, additional shapes/inline labels, broader interactions,
and PDF node comparisons remain pending. The public report labels its
primary-only scope. It does not
authorize using this fixture's tolerance for other labeled diagrams.

## Node interaction experiments

The separate [interaction harness](../tools/TikzReference/NODE-INTERACTIONS.md)
now retains native references for sixteen nodes across state/paint and transform
fixtures, including ordinary PDF pages and independently measured text frames.
Live generation and nonoverwriting verification pass. Ordinary tests check the
native layout, geometry, painting order, opacity, and clips. The transform case
passes 953 numeric checks after repairing nonidentity rectangle traversal.
Rotated/sheared node ink includes miter tips separately from PGF picture bounds.

```text
dotnet run --project tools/TikzReference -c Release -- compare-node-interactions
dotnet run --project tools/TikzReference -c Release -- calibrate-node-interaction-pdf
```

These commands deliberately retain failing image/dimension/color results.
These exact experiments apply no interaction raster allowance or PDF policy. Read
`artifacts/node-interactions/<case>/report.json` and the corresponding
`artifacts/node-interaction-pdf-calibration/<case>/calibration-evidence.json`.
The latter uses only original oracle content, forces exact pixel gates, and
makes no candidate-layout claim. Default CMYK text/path color differences and
the original driver's sheared-miter crop need independent resolution before
these cases become required passing visual CI gates. Existing rectangle and
geometry policies are unchanged.

The separate `--profile rgb` interaction corpus preserves those original
references and adds the complete supported-name palette. All 5,273 numeric
checks pass for its 41 nodes; four ordinary checks cover native emitted colors
and unchanged layout/frames, plus three reject nonfinite mixtures. Full primary
and PDF gates remain exact measurement experiments without approved allowances.
The [RGB contract](COLORS.md) explains the native path/text byte conversions.

`calibrate-node-interaction-framing --profile rgb --case transforms` derives a
stroke-aware viewport using only native polygon edges, original paint/clips,
and offset-line intersections. It keeps the original driver's clipped crop and
records the difference against SVG and PDF. `compare-node-interactions --profile
rgb --framing ink` explicitly compares with that derived reference and retains
`original-driver.svg` plus frame provenance. Native dimensions then agree within
0.0001 CSS pixel. The default driver-framed comparison remains available; no
candidate coordinate fitting or reference-content change is performed.

The independent `calibrate-node-interaction-svg --profile rgb [--framing ink]`
route now reconstructs the three native cases in CSS units and measures fixed
±4-sp perturbations. It validates all serialized numbers and original glyph
containment, including rectangular clips, and reports both SVGs against ordinary
PDF. The driver/ink snapshots each retain 4,260 passing numeric checks across
nine variants; raw image differences stay visible and no policy is approved.
Run `npm --prefix tools/TikzVisual run test:interaction-crops` for its ten
containment checks. See the
[experiment and results](../tools/TikzReference/INTERACTION-SVG-CALIBRATION.md).

The [regional experiment](../tools/TikzVisual/INTERACTION-REGIONS.md) adds 174
fixed regions derived only from native glyph/path evidence. Its checked-in
snapshot retains 3,132 independent measurements and prospective limits. The
global-only mutation trial accepts a missing faint period and short faint
stroke; local gates reject both. The retained initial trial also exposes local
precision failures in unchanged transform controls, repaired by the native
arithmetic work below. Source-attributed regional crops and the viewer preserve
that historical evidence. Run `npm run test:regions --prefix tools/TikzVisual` for twenty-one required
synthetic checks, including dilution, faint-content loss, display-only failures,
repeatability, and invalid manifests. Full-corpus commands and retained trial
evidence are described in the experiment document.

The [native transform experiment](../tools/TikzReference/TRANSFORM-PRECISION.md)
now checks sixteen actual affine frames/points and ten physical dimensions.
Cached public tests cover fractional rotations, finite coefficient printing,
unit conversion, and precision-overflow diagnostics. Live verification compares
all measurements and pinned provenance without writing baselines. Native node
frame coefficients now match exactly; anchor/frame/glyph origin checks use
1e-9 CSS pixel rather than the former general geometry allowance. All twenty
post-repair regional interaction comparisons pass unchanged controls or reject
their intended defects. Original failure evidence stays available. Interaction
PDF calibration remains pending. The separately reviewed
[primary interaction policy](../tools/TikzVisual/INTERACTION-PRIMARY.md) now
requires all 5,273 numeric checks, 1,044 region/scale/background checks, global
metrics, and natural dimensions. Its pinned limits come only from the unchanged
independent snapshots. The loader validates evidence/tool hashes and recomputes
all limits; caller-supplied regions cannot weaken this route.

```text
dotnet run --project tools/TikzReference -c Release -- compare-node-interaction-primary
npm run test:interaction-primary --prefix tools/TikzVisual
```

The three cached primary cases pass. Thirty-one policy checks cover repeated
positive controls, all thirteen image defects with numeric gates bypassed,
tampered/missing evidence, widened limits, a numerical failure with correct
pixels, a natural-height defect, fitted registration, empty numeric evidence,
and unapproved PDF input. Raw exact reports remain in each primary bundle.
Both commands are required visual CI steps; hosted execution remains unverified.

The separate [PDF regional experiment](../tools/TikzVisual/INTERACTION-PDF-REGIONS.md)
now retains 1,416 oracle-only measurements over 177 fixed regions, including
three whole-picture cameras. SVG is rendered once on the full measured native
PDF page, then both sides use integer pixel crops. Ninety-three native path
records plus bounds/box/explicit anchors agree between SVG and ordinary PDF.
All six repeated native controls pass and all thirteen image defects are
rejected. The initial candidate trial also rejected defects, but two unchanged
transform controls failed the same three local 4x foreground means; no PDF policy
was approved. Paired source-linked crops, raw measurements, and hashes preserve
these failures for independent viewport/presentation investigation.

```text
npm run test:pdf-regions --prefix tools/TikzVisual
```

These thirty-six required synthetic registration/region/native-log checks run
in visual CI. The document above gives cached measurement/trial commands and
their expected exit categories. The candidate PDF trial deliberately returns
1 with the initial picture-image camera while its unchanged controls fail.
Its explicitly selected page-coordinate route now passes both native and
candidate controls and rejects all thirteen image defects, using a separately
recomputed oracle-only snapshot. The three previously failing glyph/path crops
match the independent native SVG exactly at both scales. The separately pinned
combined policy below now admits these fixtures.

The cached `node tools/TikzVisual/pdf-viewport-probe.mjs` command independently
demonstrates the camera effect without a converter or ignored setup inputs.
Four-scaled-point changes to padded oracle viewports alter 20 of 27 picture-image
controls and 3 of 27 nested-SVG controls; all 27 direct page-coordinate controls
retain identical pixels. Original viewport clipping and the fixed physical
origin remain explicit. This probe is required in visual CI, with retained raw
evidence and hashes. The original failed PDF trial stays checked in.

The [combined node PDF policy](../tools/TikzVisual/INTERACTION-PDF.md) now requires
all 5,273 numeric checks, natural dimensions, 1,044 primary regional checks,
and 354 PDF region/scale checks on each SVG side. It recomputes limits from
the pinned independent page-coordinate evidence and validates every region,
variant, native record, page origin, input/tool hash, and viewport control.
Original exact/primary reports remain in each fresh public-conversion bundle.

```text
dotnet run --project tools/TikzReference -c Release -- compare-node-interaction-pdf
npm run test:interaction-pdf --prefix tools/TikzVisual
```

All three cases and forty-one policy checks pass. Image-only checks assert the
PDF verdict independently and reject all thirteen defects; policy checks cover
missing/tampered/rehashed evidence, incomplete coverage, changed cameras/pages,
wrong dimensions, and correct pixels with failed numeric evidence. Both commands
are required visual CI steps. Wider node/arrow families and hosted execution
remain pending. The primary-only route still rejects caller PDF input.

Rectangle border arithmetic and path endpoints now have a separate
[native experiment](../tools/TikzReference/NODE-BORDERS.md). Ordinary tests
consume 29 exact primitive intersections and three original TikZ path fixtures
without TeX or a browser. `compare-border-paths` retains provisional image
failures; it does not inherit an admitted node or geometry policy.

The native border stroke-frame experiment adds 140 fixed path/miter regions
and three ordinary tests of all path ink bounds and natural SVG dimensions.
`compare-border-framed` retains the original comparison alongside the independent
stroke frame. `node tools/TikzVisual/border-pdf-frame-probe.mjs` measures both
native viewports against cached ordinary PDF on the measured page lattice;
its 572 repeated measurements select no limits or admitted policy.

The separate [border regional experiments](../tools/TikzVisual/BORDER-REGIONS.md)
retain 2,520 independent primary and 1,144 native-page PDF measurements, with
27 passing controls/defects in each trial. A missing short line passes global
primary gates but fails its local gate; PDF rejects it independently. These
remain unapproved research limits. The separately pinned
[combined border route](../tools/TikzVisual/BORDER-CONFORMANCE.md) now consumes
those unchanged snapshots, recomputes all allowances, validates complete native
and regional evidence, and requires both SVG-versus-PDF checks. Fresh conversion
and its comparator/policy checks are required visual CI steps; hosted execution
remains unverified.

The [labeled-border reference producer](../tools/TikzLabelledBorderReference/README.md)
adds three independently authored fixtures for measured labels connected through
rectangle/circle/ellipse borders, including multiline/font and affine-frame
interactions. Its cached commands need Node built-ins and repository evidence;
they install or invoke no browser, TeX, or PDF executable:

```text
node tools/TikzVisual/labelled-border-reference.mjs check-cached
node tools/TikzVisual/labelled-border-evidence-self-test.mjs
```

Ordinary .NET tests compare twelve nodes, 192 anchors, all twenty-six painted
paths, native glyph placement, stroke widths and picture bounds. Independent
plain/probed SVG/PDF invariance and original six-face TFM inputs are retained.
An external snapshot pin and mutation controls reject missing, tampered or
consistently rehashed replacements. Fresh control reports under
`artifacts/labelled-border-cache-controls/` are uploaded by the prepared ordinary
Windows/Linux jobs. Independent primary research follows below; PDF image
acceptance and combined conformance remain pending. No existing image tolerance
is inherited.

The separate [public labeled-border tool](../tools/TikzLabelledBorderComparison/README.md)
exports all 1,624 native checks and source-aware traces without a browser:

```text
dotnet run --project tools/TikzLabelledBorderComparison -c Release
node tools/TikzVisual/inspect-labelled-borders.mjs
node tools/TikzVisual/labelled-border-inspection-self-test.mjs
```

The visual commands require the pinned browser but no TeX/PDF executable.
Fresh immutable bundles retain 36 original-root/expanded view pairs, 1,944 local
observations, exact reference repeats, and source-linked paired PNG crops. Focus
selection changes presentation images while retaining the complete measurement
matrix. Coverage controls reject missing/duplicate views or regions, changed
cameras, incorrect metrics, artifact links and crop lattice, and stale agent
guidance. These commands produce research evidence with pending image/PDF
admission, and are prepared CI steps rather than conformance claims.

The [independent labeled-border experiment](../tools/TikzLabelledBorderOracle/README.md)
separates path units, glyph precision and root framing without reading candidate
artifacts or loading the production assembly:

```text
dotnet run --project tools/TikzLabelledBorderOracle -c Release
node tools/TikzVisual/inspect-labelled-border-oracle.mjs
node tools/TikzVisual/labelled-border-oracle-self-test.mjs
```

Its framework-only DVI/TFM reader supplies forty native glyphs. Five instruction
representations and two root contracts retain 360 view pairs and 19,440 local
observations. Regeneration checks all serialized quantities, outline/order
identity, exact repeated originals and root-independent expanded captures.
These are reference-only precision observations; they supply no image allowance
or primary/PDF admission. Ordinary and visual CI commands are prepared.

The separate [labeled-border ink and sensitivity harness](../tools/TikzVisual/LABELLED-BORDER-INK.md)
derives native path/glyph envelopes and a full-ink root before conversion. Its
oracle-only primary calibration freezes limits for the exact case/view/region.
A fresh public trial checks 1,624 native quantities, 276 ink/root quantities and
all 36 primary views with 1,944 local observations. Image-only commands separately
test 26 controls in 102 white views against both independent and public drawings.
The bevel corner is pixel-identical at 1x and must fail locally at 4x; both
expectations are asserted, with no relaxation of the calibration.

```text
node tools/TikzVisual/labelled-border-ink-self-test.mjs
node tools/TikzVisual/calibrate-labelled-border-ink.mjs
node tools/TikzVisual/trial-labelled-border-primary.mjs
node tools/TikzVisual/check-labelled-border-sensitivity.mjs
node tools/TikzVisual/check-labelled-border-sensitivity.mjs --public
node tools/TikzVisual/labelled-border-ink-controls.mjs
```

Run these in order. Calibration invokes no converter; the public trial and
`--public` sensitivity generate fresh actual SVGs. All commands need only cached
native evidence, .NET and the pinned development browser. Coverage validation and
independent regeneration reject altered inputs, limits, roots, cameras, regions,
crop lattices and gate summaries. The controls command also requires exact
equality of all public/native PNGs and local measurements. These are unapproved
research trials. Separate PDF qualification and fresh public sensitivity are
documented below; scoped immutable admission uses the separate portable command.
Prepared CI steps upload every fresh research/control bundle.

The separate [labeled-border PDF investigation](../tools/TikzVisual/LABELLED-BORDER-PDF.md)
checks ordinary PDF instructions against native PGF and DVI/TFM records before
comparing page pixels. It invokes the independent reader, never the converter:

```text
node tools/TikzVisual/inspect-labelled-border-pdf.mjs
node tools/TikzVisual/labelled-border-pdf-self-test.mjs
```

The 908 scalar checks include exact pdfTeX font-size/width grids and explicitly
propagated baseline rounding. Three representations isolate original SVG,
native ink and printed PDF operands. All 162 page-viewport controls must be
pixel-exact; the self-test separately rederives all 81 control SVGs. The ordinary
PDF comparisons retain 36 pairs and 1,944 local measurements on the native page
lattice, repeated originals, overlays and paired crops. The 111 controls verify
text/state handling, numeric rejection, hashes, coverage, regions and cameras.

These commands need only cached native evidence, .NET and the pinned browser.
Their fresh bundles are uploaded by prepared visual CI. Raw local differences
remain substantial in some regions; this instruction investigation grants no
PDF image tolerance. Separate rasterizer qualification, calibrated PDF gates
and fresh public defect sensitivity are documented below. Scoped immutable
admission uses the separate portable command.

The [labeled-border rasterizer experiment](../tools/TikzVisual/LABELLED-BORDER-PDF-RASTERIZERS.md)
adds an explicit local comparison through pinned Poppler/Splash and Cairo.
The producer needs both native PDF executables and inspected release sources:

```text
node tools/TikzVisual/inspect-labelled-border-pdf-rasterizers.mjs
node tools/TikzVisual/labelled-border-pdf-rasterizer-self-test.mjs
```

All 60 original/diagnostic page renders have exact repeats. Twelve original
instruction wrappers render exactly in both engines, and six fresh Splash
pages match the frozen pages byte for byte. Twelve diagnostic documents retain
embedded resources while separating text, paths, a V, an italic period and an
orthogonal path without moving the selected operations. The experiment retains
72 fresh views with 3,852 locals plus 36 imported Splash views with 1,944 locals.
The cached checker verifies 39 corruption controls and independently recomputes
all 5,904 whole/local metrics from saved PNGs, with no PDF executable required.

A portable diagnostics check is a prepared ordinary Windows/Linux CI step:

```text
node tools/TikzVisual/labelled-border-pdf-diagnostics-self-test.mjs
```

Its 72 controls need only Node and trusted repository evidence; neither browser
nor PDF engine is invoked. CI uploads `artifacts/labelled-border-pdf-diagnostic-controls/`.
Live rasterizer investigation is separate from cached CI. Raw differences and
combined-window topology effects remain. The next local research stage is the
[PDF calibration and native-page guard](../tools/TikzVisual/LABELLED-BORDER-PDF-CALIBRATION.md):

```text
node tools/TikzVisual/calibrate-labelled-border-pdf.mjs
node tools/TikzVisual/labelled-border-pdf-calibration-self-test.mjs
node tools/TikzVisual/check-labelled-border-pdf-sensitivity.mjs
node tools/TikzVisual/check-labelled-border-pdf-page-guard.mjs
node tools/TikzVisual/labelled-border-pdf-page-guard-self-test.mjs
```

These commands require the declared retained local qualification bundle, .NET,
Node and the pinned browser, without launching TeX or a PDF engine. A new clone
does not contain the ignored research bundles; these are not standalone hosted
CI steps. Finish each producer before starting its dependent command.
The PDF-only sensitivity command intentionally exits 1 with a completed failed
trial: two visible faint losses pass its fixed 1x PDF limits, and two join
changes produce identical 1x pixels. Preserve and inspect that report before
running the supplementary guard against the explicitly pinned failed trial.

Separate original/native calibration retains 24 pairs, 1,296 local observations
and 1,392 policy checks. The 62-control checker reconstructs 908 native PDF
quantities and re-decodes 1,320 whole/local measurements. The exact native-page
guard requires the original PDF verdict and zero independent RGBA difference;
it detects all 114 visible defect views and preserves twelve exact visibility
controls. Its checker independently re-decodes all 138 baseline/control pages
and 7,392 whole/local metrics, with 52 controls for conjunction, zero limits and
visibility selectors. Enlarged paired glyph/period crops expose the faint 1x differences.
Fresh public PDF/native-page defects now pass the separate harness below.
Portable profile pins and scoped immutable admission are documented below;
previously admitted profiles and runtime dependencies are unchanged.

The [public labeled-border combined trial](../tools/TikzVisual/LABELLED-BORDER-COMBINED-TRIAL.md)
now requires native numeric, ink/root, primary, both SVG-versus-PDF routes and
exact native-page gates in one fresh public invocation:

```text
node tools/TikzVisual/trial-labelled-border-combined.mjs
node tools/TikzVisual/labelled-border-combined-self-test.mjs
```

The producer pins and verifies the retained independent calibrations before
conversion, then saves 36 primary, 24 ordinary-PDF and twelve native-page pairs.
Its six gates require 1,624 numeric/identity checks, 276 ink/root checks, 1,980
primary checks, 1,392 PDF checks and 672 native-page checks. The checker
re-evaluates all gates, source/SVG attribution and actual per-quantity assertions,
and independently re-decodes 3,960 whole/local metrics plus twelve full pages.
Its 66 controls exercise wrong metadata, camera/coverage/limit changes and
each required gate's failure. These local research commands need the declared
ignored calibration bundles, .NET and the pinned browser, without TeX or a PDF
executable; they are not standalone hosted CI steps. The separate portable route
below freezes the evidence and provides the separate scoped admission command.

The [fresh public PDF/native-page sensitivity harness](../tools/TikzVisual/LABELLED-BORDER-PUBLIC-PDF-SENSITIVITY.md)
owns a new combined baseline and applies all 32 independent controls to its
actual public SVGs with numeric gates bypassed:

```text
node tools/TikzVisual/check-labelled-border-public-pdf-sensitivity.mjs
node tools/TikzVisual/labelled-border-public-pdf-self-test.mjs
node tools/TikzVisual/labelled-border-combined-self-test.mjs
```

Finish the producer before starting either checker. Verify that the combined
checker identifies the public sensitivity report's exact baseline digest.
All 126 mutated public page PNGs equal the independent control PNGs by hash.
The unchanged conjunction rejects 114 visible views at their target and retains
twelve exact visibility controls; the four faint 1x PDF-only blind spots remain
recorded. The new checker re-decodes 14,784 metrics and 138 full pages and passes
54 integrity controls. Separate fresh public primary sensitivity still runs
with `check-labelled-border-sensitivity.mjs --public` (26 controls, 102 views).
These commands consume the declared ignored bundles, .NET, Node and the pinned
browser. Reports remain unapproved research evidence; portable immutable
admission uses the separate command below. Full images, source attribution and enlarged faint-loss crops are
available in each GUID bundle's `index.html`.

The [portable labeled-border cache and public trial](../tools/TikzVisual/LABELLED-BORDER-CACHE.md)
now consume tracked independent evidence without the ignored research bundles:

```text
node tools/TikzVisual/labelled-border-cache-self-test.mjs
node tools/TikzVisual/trial-labelled-border-cached.mjs
node tools/TikzVisual/labelled-border-cached-self-test.mjs
```

Finish the trial before its saved-image checker. The cache checker reproduces
17,424 independent metrics, 138 full pages and all 126 control PNG hashes, with
44 integrity controls. The public trial requires six baseline gates plus the
26/102-view primary and 32/126-view PDF/native image-only controls. The separate
checker re-decodes 22,908 public metrics and 138 full pages, passes 50 controls
and verifies all 1,624 numeric assertions and actual source attribution. Missing or weakened
evidence fails. These commands need .NET 10, Node and the pinned browser;
they launch no TeX or PDF executable. Existing research commands keep their
original bundle requirements. Portable raw trial results remain unapproved;
hosted execution remains unverified.

The scoped immutable labeled-border admission uses the same fixed cache and
allowances, and is the prepared required visual CI route:

```text
node tools/TikzVisual/compare-labelled-border-conformance.mjs
node tools/TikzVisual/labelled-border-admission-self-test.mjs
```

The comparison owns a fresh eight-gate trial and explicitly selects its exact
report for the 50-control saved-image checker. Completion records and digests
bind both child reports; the complete copied bundles retain raw unapproved
roles. Only the outer comparison can claim conformance for the three pinned
fixtures. Its profile fixes coverage, views, original primary and separate PDF
allowances, exact native-page zero limit, independent frame/camera/region hashes,
qualification lineage and guard-tool sources. Ordinary runs never promote data.

The admission checker verifies all copied artifacts and completion logs, current
converter/tool sources and the owned numeric/source/pixel proof. It adds profile,
source and report-binding corruption controls plus forced failures of every gate.
An explicit `--report artifacts/labelled-border-conformance/run-<GUID>/report.json`
selects one retained bundle. Open its `index.html` for source/scene links, paired
defect crops, 4x primary pairs/raw differences and native full-page images. Viewer
links must identify saved artifacts before a completed report is published; the
checker rejects missing/undefined links. Four ordinary-PDF blind spots
remain exposed rather than counted as exact PDF agreement. The explicit profile
promotion command requires reviewed local qualification bundles; normal CI
consumers require only tracked evidence, .NET, Node and the pinned browser.

Curved `to`/`edge` connections have a separate native corpus and public numeric
command. Ordinary tests consume its externally pinned snapshot and reject
one-scaled-point control errors. The [native producer](../tools/TikzCurvedEdgeReference/README.md)
checks probe noninterference and original SVG/PDF state; its cache reader and
37 controls run without TeX or a browser. The
[image diagnostics](../tools/TikzVisual/CURVED-EDGE-INSPECTION.md) create paired
PNGs, raw differences and local viewers from one completed numeric report.
Independent image evidence remains unapproved; straight-edge profiles grant
no allowance to curved connections.

The [curved native-only frame experiment](../tools/TikzVisual/CURVED-EDGE-ORACLE.md)
owns an independent DVI/TFM reader with no converter reference, derives local bend
and clip regions, and compares native representations with original SVG/PDF.
Its saved-image checker reconstructs frames and SVGs and remeasures PNGs. Ordinary
CI runs the 36 pure arithmetic controls and the independent glyph reader; the
rendering experiment remains an explicit pinned-environment command.

The [curved primary calibration](../tools/TikzVisual/CURVED-EDGE-PRIMARY.md)
uses unchanged original SVG and a preselected native encoding, with complete
local-region coverage, repeat/replay checks and image-only faults. Three opacity
probes derive their own limits and record visible versus quantized/background
invisible losses. Its independent saved-image checker reconstructs inputs and
remeasures PNGs. Thirty-five browser-free path/policy controls run in ordinary CI;
primary limits remain unapproved until PDF qualification and a combined trial.

The separate [curved PDF qualification](../tools/TikzVisual/CURVED-EDGE-PDF.md)
compares original and independently reconstructed SVGs with frozen native PDF
pages at measured page origins. It owns complete replays, signed viewport
controls, eighteen defects and separate faint-ink experiments. Its independent
checker remeasures every native crop and verifies saved inspection panels against
full-page pixels. The focused synthetic controls require the pinned browser;
these explicit development commands do not approve curved candidate conformance.

The [curved public trial](../tools/TikzVisual/CURVED-EDGE-TRIAL.md) consumes four
exact qualification/checker reports before conversion, measures all eight gates,
and writes source-attributed image artifacts. Its focused controls and owned
saved-evidence checker remain explicit development commands. Ordinary curved
tests also require clip source retention and plain/traced public parity.

The [portable curved trial](../tools/TikzVisual/CURVED-EDGE-CACHED.md) consumes
tracked independent qualifications, creates fresh public evidence and owns its
exact saved-evidence checker. It needs .NET and the pinned Node/browser tools,
without old research folders or native TeX/PDF commands:

```text
node tools/TikzVisual/curved-edge-image-cache-self-test.mjs
node tools/TikzVisual/trial-curved-edge-cached.mjs
```

The first command checks original bytes, roles, provenance and corruption
controls without a browser or converter. The second requires all eight public
gates and the owned checker together. Both remain unapproved research evidence;
immutable admission and hosted/release qualification remain separate.

The [fixed curved-family admission](../tools/TikzVisual/CURVED-EDGE-CONFORMANCE.md)
consumes that evidence through an externally pinned profile and owns a fresh
cached trial/checker. Run the browser-free policy controls and the complete
comparison, then use the exact final stdout report path for saved-proof and
agent-inspection controls:

```text
node tools/TikzVisual/curved-edge-admission-self-test.mjs
node tools/TikzVisual/compare-curved-edge-conformance.mjs
node tools/TikzVisual/curved-edge-admission-self-test.mjs --report artifacts/curved-edge-conformance/run-<id>/report.json
node tools/TikzVisual/curved-edge-agent-self-test.mjs --report artifacts/curved-edge-conformance/run-<id>/report.json
```

All eight gates, every required region/view and the exact owned independent
checker are mandatory. Raw child reports keep their unapproved roles. The
agent projection ranks 6,224 local observations; its viewer uses checked
embedded PNGs and identical integer crop rectangles, with direct source and
scene links. Inspection controls independently check pixel mapping, enlargement,
empty filters, synchronized scroll, route selection and visible-defect navigation.
Only the completed parent admits these five fixtures. Hosted execution and
broader syntax/interaction coverage remain separate requirements.
