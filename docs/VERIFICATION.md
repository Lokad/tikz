# Verification coverage and execution

Every check should close a supported-feature requirement or detect a named
failure. Frozen reference qualification and checking current converter output
are different tasks. Cached evidence is reusable only with its reviewed hashes,
native inputs, fonts, renderer and per-view pixel policies intact.

```sh
# Ordinary tests plus affected numeric/images and independent pixel checking.
node tools/TikzVisual/verify.mjs iterate
node tools/TikzVisual/verify.mjs iterate --feature plots
node tools/TikzVisual/verify.mjs iterate --feature math
node tools/TikzVisual/verify.mjs iterate --feature styled
node tools/TikzVisual/verify.mjs iterate --case flowchart-draw-color

# All 26 diagrams, all original image views, independent checking and controls.
node tools/TikzVisual/verify.mjs qualify
# A selected fixture has selected-scope qualification, never full-matrix status.
node tools/TikzVisual/verify.mjs qualify --case smooth-plot-contract
```

Features are `core`, `labels`, `positioning`, `styles`, `foreach`, `macros`,
`functions`, `plots`, `paint`, `math` and `styled`. Core exercises four complete
diagrams: implicit paint/clips, bent network, transformed nodes and smooth plots.
These cover positioning, path labels, arrows and calc together, including curved
and transformed interactions. Math and styled labels have separate affected
commands; their native ownership/font work is not repeated on every geometry
iteration. Math's frozen three-case contract remains together, including its
focused cases. All 26 fixtures remain in final qualification.
Iteration runs the entire ordinary suite before the affected comparisons.
No command above runs TeX. Only pinned repository fixtures are materialized.

The report retains exact commands, child receipts, wall times, source hashes,
failed regions and links to paired PNGs/crops. Changed source during a run is a
failure. An iteration report cannot establish final qualification. At feature
completion, run required qualification on a clean committed source export;
check that its files match the final tree and run existing family/release checks
required by the change. The 26-case runner does not replace the other families'
admission policies or the hosted workflow.

## Ordinary requirement mapping

All ordinary tests remain. The 199 methods cover 821 expanded cases at the
initial audit; their execution was approximately two seconds. Overlapping
conversion calls below have different observations, failure boundaries or
native witnesses, and do not justify removing assertions.

| Test classes | Distinct requirement or failure |
| --- | --- |
| Conversion, DiagnosticPosition | Public result/zero-output contract, physical units, UTF-16 spans, cancellation and resource limits |
| Geometry, TransformPrecision | Affine composition/reflection, PGF integer precision, physical-unit conversion and overflow |
| Reference, EmittedSvg | Independent primitive measurements versus scene; returned SVG serialization versus scene/native evidence; malformed SVG rejection |
| FontData, TextLayout | Independent font boxes, spaces/ligatures/overhangs, every glyph position, unsupported text and bounded layout |
| MathFontData, MathParser | Declared font slots/styles/radicals; atom grammar, groups/scripts, exact unsupported diagnostics and mapped provenance |
| MathLayout | Native integer boxes/glyphs/rules, their order/paint/clips, corrupt native traces, deterministic cache charges and concurrent layout |
| NodeLayout, NodeConversion | Rectangle geometry/anchors versus native integers; public mode reset, styles, glyph/output budgets and unsupported nodes |
| RectangleBorder, NativeStrokeBounds | Border intersections and singular transforms; independent stroke ink/natural frame rather than layout boxes |
| NodeInteraction, CurvedNode | Transformed paint/clip order and miter ink; ellipse/diamond geometry, anchors, borders, shape-library scope and bounds |
| ShapeGlyphTrace, ShapePdfEvidence | Independent glyph affine placement and damaged evidence; ordinary PDF registration/operand agreement and bounded raster headers |
| LabelledBorderInteraction, Edge, CurvedEdge | Independent border crossings, straight/curved controls, paint/continuation, returned-public parity, one-sp defects and edge budgets |
| Dash, DashGeometry | Native dash state versus curved/compound/clip geometry; malformed native input and excessive patterns |
| Arrow | Native tip/shaft placement, shortening and paint; serialized SVG corruption, scope/limits and the historical implicit-fill error |
| RgbColor | Independent byte-channel rounding and emitted glyph/path paint while preserving layout; nonfinite mixture rejection |
| CalcCoordinate | Calculated integer anchors and picture bounds, relative-reference updates, explicit unsupported forms, library scope and shared limits |
| PathLabel, PathLabelNative | Measured label frames/anchors/tangents and unequal orthogonal-leg timer; physical paint order, glyph/shaft clips and candidate corruptions |
| Positioning, ParameterizedStyle | Directional placement and native anchors; parameter forwarding/append/scope, provenance and expansion limits |
| Foreach, MathMacro, MathFunction | Scoped/lazy expansion and continuation overflow; finite native scalar/anchor results, sequential definitions, function arity/degrees, provenance and work limits |
| Plot | Sharp/function/smooth geometry, option precedence, continuation/last-position, variable restoration, complete networks and sample/lowering limits |
| CompleteDiagramCall | Mixed successes, public-limit failures and caller cancellations across cultures/prefixes; whole-result equality and call-local state/references |

## Harness control mapping

| Checks | Disposition and reason |
| --- | --- |
| Primary report's six generic corruptions | Run once per primary verifier: candidate-fed calibration, omitted/duplicate views, missing control, rehashed policy and false decoded metric |
| Nonmath native-path encoding, whole-label, implicit-fill and smooth-root controls | Each distinct control runs once on a fixture exposing its branch; all fixtures retain their own frozen policies/positive comparisons |
| Nonmath PDF's five common corruptions plus native-path omission | Each control runs once per PDF verifier; both native/candidate gates remain required |
| Nonmath current-report eight corruptions | Run once per current verifier; every diagram still receives its own numeric, decoded-pixel, framing and fresh-source checks |
| Complete-text five corruptions | Run once on the common text verifier; both path-label fixtures retain complete-text reference evidence |
| Shared process and portable-cache controls | Run once per matrix. Canonical positive roundtrips run during materialization of all 28 archive groups. The two faults rejected by the common archive digest run once, replacing 28 identical repetitions each. Math/styled ownership corruption stays separate; process time/output/spawn failures retain partial logs |
| Iteration selection controls | Run once per matrix. Reuse checked native qualification and independently decode one visible selected witness for each of 126 retained negatives; repeated negative × camera combinations add no value to this criterion |
| Native measurements, arrow-color correction, math/styled controls | Retain separately where ownership, fonts, rules, native SVG correction or policy semantics differ |
| Existing shape/border/edge/curve/dash/arrow/calc suites | Retain their own independent references, image policies, negatives, admissions and inspection tests. Matching test names alone do not prove equivalent semantics |

The nonmath suite consolidates by **verifier and control identity**. Reports
record the representative fixture for each omitted repetition. The underlying
standalone self-tests remain callable without a selector and still run all their
controls. PDF/current overlays reuse the existing rehashed-artifact helper.
No native calibration, image-negative fixture or per-region threshold is removed.

The shared raster comparator retains every observation and repeat render. Equal
RGBA pixels skip zero channel-error arithmetic; identical foreground masks share
one topology calculation. Different colors/alpha with the same mask still have
their own raw and premultiplied errors. Invalid inputs, faint ink, absent edges
and independent distances remain checked. Calc reviews this changed dependency
through its existing exact source-pair and admission machinery before changing
tool guards; native archives, policies, thresholds and scope remain frozen.

Calc admission checks owned sources, artifact coverage and agent image links
before its complete independent PNG pass. A substituted agent image therefore
fails without decoding unrelated pixels. The declared verdict, metrics and
recapture summary must still equal independently computed values; metadata
checks alone cannot establish conformance. All admission controls remain.

The calc coordinator prepares provisional details from its independent checker.
Before writing a completed report, the saved-receipt validator independently
recomputes all trial pixels, policy decisions, source recapture and admission
details. This avoids a second invocation of that same computation inside the
coordinator. Standalone receipt validation and the checker retain their full
passes; a fully rehashed false checker measurement still fails.

Math primary checks validate every owned frame and fault contract before
decoding pixels. Structural faults in a later case therefore fail immediately;
well-formed reports retain the full independent pixel and policy checks.

Math primary source recapture checks complete reference/candidate PNG identity
and whole-image metrics. It keeps every view and avoids regenerating local
metrics already checked by initial capture and independent PNG decoding.
Calibration and targeted sensitivity captures retain their full region sets.

Current math/styled primary producers capture all browser metrics and recapture
the complete source PNGs. Their receipts explicitly leave independent PNG
validation to the current checker, which decodes every whole/local observation.
This consolidates the same reader's duplicate pass on the same images. Missing
or forged checking ownership fails; these common controls run once on math.
Historical receipts with the producer's additional pass remain readable.

Math/styled qualification runs current corruption checks with `--controls-only`
after the fresh independent checker passes. Their four input hashes must match
that check, under the run's unchanged source snapshot. Standalone corruption
commands retain the full positive check by default. Failed/incomplete baselines
and mismatched inputs are tested once on math; every existing pixel, frame,
route, dimension and styled-rule fault remains. A controls-only result alone
does not establish positive conformance.

Current PDF production delegates its repeated PNG reader and decoded-policy
evaluation to that same independent checker. It retains initial policy checks,
styled per-pixel rule envelopes, both routes and complete source recaptures.
PDF receipts also declare checking ownership; missing/forged PDF ownership is
tested once on math. Registration, native ownership and all PDF negatives stay
separate from primary image policy. Both historical counter formats remain readable.

## Iteration view mapping

Iteration uses eight primary views rather than 24 Cartesian combinations:

| Capture | Frame | Scale | Background | Mechanism or interaction |
| --- | --- | --- | --- | --- |
| Intrinsic | Natural | 1x | White | Intrinsic root, ordinary ink/label comparison; smooth-root policy's measured white branch |
| Intrinsic | Natural | 4x | White | Fine glyph/stroke placement with natural clipping |
| Intrinsic | Expanded | 1x | Transparent | Alpha/premultiplication and padded camera |
| Intrinsic | Expanded | 4x | Black | Paint/alpha contrast at fine resolution |
| Viewport | Natural | 1x | White | Independent viewport capture and registration |
| Viewport | Natural | 4x | Black | Viewport, fine resolution and contrast interaction |
| Viewport | Expanded | 1x | Transparent | Viewport alpha and outside-picture ink |
| Viewport | Expanded | 4x | White | Fine expanded view: missing glyph/label/tip, shifted ink and dropped visible shaft/glyph clips |

The focused `smooth-plot-contract` adds one intrinsic natural 1x transparent
view. Its independently measured topology exception specifically covers that
combination; it is a justified policy interaction rather than another product.

Every view uses its original, independently derived policy; no new margin is
fitted to converter errors. Candidate PDF keeps natural/expanded frames at 1x
and 4x. Iteration reuses the four checked original native SVG/PDF observations
byte-for-byte, including decoded pixel validation and reference binding, and
rerenders all new converter views. Missing mode, false qualification, split
sources, omitted routes, forged metrics/verdicts and altered reused observations
must fail. Qualification retains all 24 primary and eight PDF views and their
complete source recaptures. Its unoptimized combinations are a separate measured
cost; reducing them requires evidence for every historical negative and policy
branch, including smooth-root transparent topology and styled rule envelopes.
