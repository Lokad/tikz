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

Node transform/state/clip interactions, rotated/sheared stroke ink bounds,
border intersections, additional shapes/inline labels, and PDF node comparisons
remain pending. The public report labels its primary-only scope. It does not
authorize using this fixture's tolerance for other labeled diagrams.
