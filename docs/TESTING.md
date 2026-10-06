# Grounding against TikZ

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

These fixtures establish behavior for their concrete forms. Dashes, text,
additional shape options, and other combinations still need their own oracle
evidence. Named coordinates remain stored globally; path references reproduce
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
