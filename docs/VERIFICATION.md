# Verification coverage and execution

The [concise coverage index](VERIFICATION-COVERAGE.md) lists retained and
consolidated checks, their acceptance boundaries and historical witnesses.

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
node tools/TikzVisual/verify.mjs iterate --feature definitions
node tools/TikzVisual/verify.mjs iterate --feature arcs
node tools/TikzVisual/verify.mjs iterate --feature fillrules
node tools/TikzVisual/verify.mjs iterate --case flowchart-draw-color

# All 30 diagrams, focused current views, independent checking and controls.
node tools/TikzVisual/verify.mjs qualify
# A selected fixture has selected-scope qualification, never full-matrix status.
node tools/TikzVisual/verify.mjs qualify --case smooth-plot-contract

# Actual Release archive and isolated .NET-only consumer; no browser or TeX.
dotnet pack src/Lokad.TikZ -c Release --output artifacts/nuget
node tools/TikzPackageCheck/verify.mjs artifacts/nuget --controls
```

Features are `core`, `labels`, `positioning`, `styles`, `foreach`, `macros`,
`functions`, `plots`, `paint`, `math`, `styled`, `definitions`, `arcs` and `fillrules`. Core exercises four complete
diagrams: implicit paint/clips, bent network, transformed nodes and smooth plots.
These cover positioning, path labels, arrows and calc together, including curved
and transformed interactions. Math and styled labels have separate affected
commands; their native ownership/font work is not repeated on every geometry
iteration. Math's frozen three-case contract remains together, including its
focused cases. Definitions retain a focused mechanism corpus and complete
flowchart. Arc ordering adds one complete diagram with independent axis assignment
and historical radius-shrink evidence. Fill rules add one complete diagram with
compound contour winding and captured clip state, independent PGF/SVG/PDF rule
checking and visible wrong-fill/clip-rule controls. All 30 fixtures remain in final qualification.
Iteration runs the entire ordinary suite before the affected comparisons.
No command above runs TeX. Only pinned repository fixtures are materialized.

Routine current-output qualification uses the `mechanisms-v1` view policy.
It replaces repeated camera products with the following eight interactions on
every fixture; the smooth-plot contract additionally keeps natural 1x alpha,
where its native topology policy has a demonstrated special branch.

| Capture | Frame | Scale | Background | Requirement exercised |
| --- | --- | ---: | --- | --- |
| Intrinsic image | Natural | 1 | White | Natural dimensions and ordinary presentation |
| Intrinsic image | Natural | 4 | White | Fine glyph, tip, stroke and punctuation differences |
| Intrinsic image | Expanded | 1 | Transparent | Alpha, enclosing ink and overflow |
| Intrinsic image | Expanded | 4 | Black | High-resolution contrast and expanded framing |
| Explicit viewport | Natural | 1 | White | Independent viewport units and origin |
| Explicit viewport | Natural | 4 | Black | High-resolution viewport sizing and contrast |
| Explicit viewport | Expanded | 1 | Transparent | Viewport/alpha/overflow interaction |
| Explicit viewport | Expanded | 4 | White | Fine viewport geometry with expanded ink |

Both capture mechanisms independently exercise every frame, scale and
background value. Extra products repeat those mechanisms; their removal must
preserve a decoded rejecting witness for every previously visible negative.
The view-selection control covers the full fixture corpus, including focused
contracts, rather than sampling only complete diagrams. Its `--all` audit decodes
one witness for every original negative. Routine execution consolidates nameless
glyph absence, translation and label absence by fixture, font, punctuation/digit/
letter class, node/path-label role and the smooth topology branch. Each alias
names its retained representative. Named defects, non-glyph controls, math marks
and positioning/transformed interaction controls remain individually checked.
Every region of fresh output still receives independent checking; the alias
mapping affects only repeated frozen sensitivity probes. Native calibration,
original/corrected encodings and per-view pixel limits remain frozen. Historical
reports without the policy marker retain their 24-view meaning; missing, split
or unknown policy markers reject instead of silently changing interpretation.

Both PDF frames and both scales remain on every diagram. Original native
SVG/PDF observations are reused from their exact independently qualified
calibration, with byte, source, renderer, registration and decoded-pixel checks.
Routine path-label reports reference that calibration's exact artifact path and
hash instead of copying its entire immutable image matrix into both reports.
The existing owned-report reader validates every referenced byte; the checker
reuses the resulting validated object. Missing/changed references and mixed
owned/reference calibration reject. Historical reports retain their owned inputs.
Fresh converter output is rendered on every candidate view and independently
checked, including source recapture. This saves reference rerenders without
substituting old converter output. The new matrix has 241 current primary
views, 240 PDF observations and 361 fresh source recaptures. The larger frozen
reference matrices continue to establish reference policies and sensitivity.

The existing runner limits restoration to three fixture jobs and comparison
work to six jobs, builds numeric/export/native-observation tools once and runs
fresh conversions without repeated
builds. It still awaits all in-flight children on failure and retains their logs.
Shared report, process, archive and arrow-correction corruption identities run
once; native numeric, math/styled ownership and reference policies keep their
distinct checks. Live native-reference regeneration is a separate development
operation and never part of this routine command.

The independent shared process/cache/negative controls and the math/styled
families use the same comparison queue. This overlaps independent mechanisms
without removing their executions; per-family dependency order and native
policy/control deduplication remain separate. Every in-flight job is awaited
before aggregate success or failure is published.

Materialization restores disjoint assets with eight bounded filesystem workers
per fixture and awaits every in-flight operation before reporting a failure.
Path checks, refusal to replace different existing bytes, canonical roundtrips
and all owned-report checks still run. The independent PDF reader decodes each
unchanged native page once within that reader, as the primary reader already
does for reference images; all candidate images, full-page metrics, regions and
verdicts are still independently checked on every observation.

The report retains exact commands, child receipts, wall times, source hashes,
failed regions and links to paired PNGs/crops. Changed source during a run is a
failure. An iteration report cannot establish final qualification. At feature
completion, run required qualification on a clean committed source export;
check that its files match the final tree and run existing family/release checks
required by the change. The 30-case runner does not replace the other families'
admission policies or the hosted workflow.

Package acceptance checks the actual nupkg/snupkg against current Release
DLL/XML, README, licenses and font data. An isolated consumer restores only
from that checked local feed into a fresh cache, compiles the README sample,
and converts seven complete diagrams, including token definitions, arc ordering
and fill/clip rules. SVG hashes/statistics and loaded assembly
must equal a separate source consumer. Missing XML, added dependency, changed
DLL and unexpected payload controls run once on the Windows ordinary job;
both ordinary platforms run positive package acceptance. This checks package
parity, independently of native/image conformance. Hosted execution remains
unverified until the hosted jobs run.

## Ordinary requirement mapping

All ordinary tests remain: 222 methods and 875 expanded cases across 40 classes.
The initial audit covered 199 methods and 821 cases. Overlapping
conversion calls below have different observations, failure boundaries or
native witnesses, and do not justify removing assertions.

| Test classes | Distinct requirement or failure |
| --- | --- |
| Conversion, DiagnosticPosition | Public result/zero-output contract, physical units, UTF-16 spans, cancellation and resource limits |
| Geometry, TransformPrecision | Affine composition/reflection, PGF integer precision, physical-unit conversion and overflow |
| ArcOption | Ordered independent x/y radius assignment versus final geometry; eager validation of overwritten values and explicit unsupported-option rejection |
| FillRule | Ordered/default fill rules, scope restoration, clip capture independent of later paint, and native-invalid local clip-rule options |
| Reference, EmittedSvg | Independent primitive measurements versus scene; returned SVG serialization versus scene/native evidence; malformed SVG rejection |
| WidthPreset | Seven named thicknesses and seven ordered/style/scope mechanisms; exact integer-sp scene/emitted widths and bounds detect errors within the generic primitive numeric allowance. Image admission remains open |
| FontData, TextLayout | Independent font boxes, spaces/ligatures/overhangs, every glyph position, unsupported text and bounded layout |
| MathFontData, MathParser | Declared font slots/styles/radicals; atom grammar, groups/scripts, exact unsupported diagnostics and mapped provenance |
| MathLayout | Native integer boxes/glyphs/rules, their order/paint/clips, corrupt native traces, deterministic cache charges and concurrent layout |
| NodeLayout, NodeConversion | Rectangle geometry/anchors versus native integers; public mode reset, styles, glyph/output budgets and unsupported nodes |
| RectangleBorder, NativeStrokeBounds | Border intersections and singular transforms; independent stroke ink/natural frame rather than layout boxes |
| NodeInteraction, CurvedNode | Transformed paint/clip order and miter ink; circle/ellipse geometry, anchors, borders, shape-library scope and bounds; explicit diamond rejection |
| ShapeGlyphTrace, ShapePdfEvidence | Independent glyph affine placement and damaged evidence; ordinary PDF registration/operand agreement and bounded raster headers |
| LabelledBorderInteraction, Edge, CurvedEdge | Independent border crossings, straight/curved controls, paint/continuation, returned-public parity, one-sp defects and edge budgets |
| Dash, DashGeometry | Native dash state versus curved/compound/clip geometry; malformed native input and excessive patterns |
| Arrow | Native tip/shaft placement, shortening and paint; serialized SVG corruption, scope/limits and the historical implicit-fill error |
| RgbColor | Independent byte-channel rounding and emitted glyph/path paint while preserving layout; nonfinite mixture rejection |
| CalcCoordinate | Calculated integer anchors and picture bounds, relative-reference updates, explicit unsupported forms, library scope and shared limits |
| PathLabel, PathLabelNative | Measured label frames/anchors/tangents and unequal orthogonal-leg timer; physical paint order, glyph/shaft clips and candidate corruptions |
| Positioning, ParameterizedStyle | Directional placement and native anchors; parameter forwarding/append/scope, provenance and expansion limits |
| Definition | Lazy scoped token templates and aliases, source-order statements, delimiter handling and foreach binding; reserved/unsupported/cyclic invocation, mapped UTF-16 origins, call isolation and bounded/cancellable expansion |
| Foreach, MathMacro, MathFunction | Scoped/lazy expansion and continuation overflow; finite native scalar/anchor results, sequential definitions, function arity/degrees, provenance and work limits |
| Plot | Sharp/function/smooth geometry, option precedence, continuation/last-position, variable restoration, complete networks and sample/lowering limits |
| CompleteDiagramCall | Mixed successes, public-limit failures and caller cancellations across cultures/prefixes; whole-result equality and call-local state/references |

## Harness control mapping

| Checks | Disposition and reason |
| --- | --- |
| Primary report's six generic corruptions | Run once per primary verifier: candidate-fed calibration, omitted/duplicate views, missing control, rehashed policy and false decoded metric |
| Nonmath native-path encoding, whole-label, implicit-fill and smooth-root controls | Each distinct control runs once on a fixture exposing its branch; all fixtures retain their own frozen policies/positive comparisons |
| Nonmath PDF's five common corruptions plus native-path omission | Each control runs once per PDF verifier; both native/candidate gates remain required |
| Nonmath current-report 17 corruptions | Run once per current verifier; retain the original eight faults plus five view/reference-reuse and four calibration-reference ownership faults; every diagram still receives its own numeric, decoded-pixel, framing and fresh-source checks |
| Complete-text five corruptions | Run once on the common text verifier; both path-label fixtures retain complete-text reference evidence |
| Shared process and portable-cache controls | Run once per matrix. Canonical positive roundtrips run during materialization of all 32 archive groups. The two faults rejected by the common archive digest run once, replacing 28 identical original repetitions each. Math/styled ownership corruption stays separate; process time/output/spawn failures retain partial logs |
| View selection and negative mechanism controls | Run once per matrix over all 28 bundles: 368 visible and two originally invisible decoded witnesses, plus 527 explicit aliases. The full `--all` audit checks all 895 visible original controls when the view selection or its verifier changes. It extends the original ten-bundle/247-control sample; reuse unchanged independently checked reference evidence between such changes |
| Native measurements, arrow-color correction, math/styled controls | Retain separately where ownership, fonts, rules, native SVG correction or policy semantics differ |
| Existing shape/border/edge/curve/dash/arrow/calc suites | Retain their own independent references, image policies, negatives, admissions and inspection tests. Matching test names alone do not prove equivalent semantics |

The three unlabelled rectangle-border fixtures preserve five frozen calibration
snapshots and their nested precision evidence. Historical producer source
identities are checked separately from the unique current tool/configuration
guards. This removes repeated producer/current equality checks without changing
native ink/frame, cameras, primary/PDF thresholds or defect policies. Existing
structural rehash positives and semantic negatives remain; rehashed historical
source changes and changed current runner/SVG sources reject explicitly. The
former numeric-source and PDF-renderer byte controls exercise the same current
guard loop; one reference-runner byte control covers that loop and its newly
promoted producer source. Exact guard membership and the independent numeric/PDF
semantic faults preserve their distinct coverage. The ordinary affected-feature
loop and final border conformance/negative controls
remain separate, and the comparison uses frozen native artifacts without TeX.

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

Straight-edge cached admission preserves the exact four historical qualification
reports, their source captures and all 10,200 assets. Those captures describe the
tools used to produce frozen evidence; current tools have separate admission
guards. The native snapshot retains its original hashes. Three explicitly pinned
reader revisions permit later glyph auditing, starred PDF operators, exact
scaled-point dimension checking and local glyph aliases; fixtures, wrappers,
native outputs and limits remain exact. Both .NET development readers share the
same revision validator. An arbitrary changed or rehashed revision record fails.
Uncached qualifications still require current source equality. Every current
admission runs fresh conversion and independent frame, numeric, primary/PDF,
native-page and visible-defect checking before a conformance claim.

Curved-edge admission uses the same small qualification-source guard and the
same three reviewed native-reader revisions. It preserves its own four reports,
11,507 assets, uncorrected original-driver policy, PDF registration and eight
gates. Its primary checker records inherited parent/oracle source hashes; those
captures remain owned by their pinned parent reports. Straight-edge reports
retain their own-capture requirement. Shared raw-source and byte/metadata
corruptions run once in the straight-edge source controls; the curved native
reader, reference ownership, visible defects and agent checks remain separate.
Both trial reports capture the shared guard's source before fresh conversion.

Arrow admission preserves the four exact native, meet, public and combined
qualification archives. Captured tools establish historical provenance behind
pinned reports, manifests and byte hashes; they need not equal current tools.
The small arrow capture helper serves the nested meet and combined readers.
Raw meet qualifications still require current source equality. Current
admission guards cover the actual tool graph and numeric comparison/build
inputs; native engine fixtures and outputs remain independently pinned.
Duplicate comparator/checker byte probes run once in admission controls.
Missing or changed captures, forged report pins and stale raw qualifications
have separate controls. Every current claim requires fresh public conversion,
an independent numeric build and image checker, all 16 gates, 306 primary and
396 PDF controls. Original-driver SVG, independent native presentation, source
and scene PDF registration, RGB mass/moments and image-only defects keep their
distinct policies and negative controls.

The calc coordinator prepares provisional details from its independent checker.
Before writing a completed report, the saved-receipt validator independently
recomputes all trial pixels, policy decisions, source recapture and admission
details. This avoids a second invocation of that same computation inside the
coordinator. Standalone receipt validation and the checker retain their full
passes; a fully rehashed false checker measurement still fails.

After fresh calc admission passes, its control command may use `--checked-sha`
with the exact successful child receipt hash. It still checks artifact bounds,
hashes, ownership, current sources, profile and agent links. Only the repeated
positive pixel pass is supplied by the caller. Bound control reports explicitly
require that positive check and keep image claims false; callers must verify
the receipt binding under the unchanged source snapshot. Standalone controls
retain full positive validation. A mismatched checked receipt is tested once;
all previous corruption controls remain.

Math primary checks validate every owned frame and fault contract before
decoding pixels. Structural faults in a later case therefore fail immediately;
well-formed reports retain the full independent pixel and policy checks.

Math primary source recapture checks complete reference/candidate PNG identity
and whole-image metrics. It keeps every view and avoids regenerating local
metrics already checked by initial capture and independent PNG decoding.
Calibration and targeted sensitivity captures retain their full region sets.

Nonmath current-source recapture uses the same whole-picture approach for both
primary and PDF images. Its independent readers first decode every required local
region and derive its policy verdict. Recapture then checks complete PNG identity,
whole metrics, frames and repeats without calculating those local metrics again.
All views, native policies, source captures and corruption checks remain required.

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

Frozen math/styled PDF checking rejects inconsistent aggregate policy metadata
and missing or misowned rule crops before decoding PNGs. This closes the
demonstrated cost of three malformed-policy controls: deriving unrelated image
metrics before rejecting their metadata. Valid reports still independently
decode all reference and fault images and derive every policy, including styled
per-pixel rule limits. Rehashed pixel metrics and altered rule limits retain their
independent checks; all 19 math and 22 styled PDF controls remain.

## Recorded outcomes

The first pass completed in 3h50m within its four-hour limit at `71f9e03`.
Later cost reductions are separate accepted work units. These are observed
development wall times on the same host, with overlap documented in local
receipts, rather than controlled benchmark results.

| Check | Before | First-pass result | Later accepted observation |
| --- | ---: | ---: | ---: |
| Full 26-diagram qualification | 77m35s | 56m56s | 36m14s at `bfc87c8` |
| Default affected iteration | Initial eight-diagram attempt: 13m21s | Four complete diagrams: 4m24s | 3m08s at `bfc87c8`; latest 3m32s at `4254cb0` |
| Single paint-flowchart workflow | 2m51s | 59s | — |
| Shared portable-cache controls | 3m30s | 21.3s | — |
| Nonmath corruption invocations | 495 | 33 | Same distinct controls retained |
| Identical archive transport faults | 56 | 2 | All 28 positive roundtrips retained |

The historical pre-feature matrix had 26 diagrams, 624 primary views, 208 PDF views,
832 source recaptures and 821 ordinary cases. All 126 visible
negatives remain detected. The later matrix's 832 records and 5,008 PNGs match
the prior accepted output byte for byte.

The current 30-diagram review reduced observed complete routine qualification
from **46m14s → 35m50s → 21m09s → 15m58s → 13m59s**. The last run took
**838.533s** at `df0d257`; `9a7e827` restores its exact tracked tree after a
slower four-job/metadata trial (943.230s) was withdrawn. All 2,083 source files
match the qualified export. The final affected four-diagram loop took **4m47s**,
which does not establish the complete-routine target.

The review closed after **3h45m33s**, within four hours; the 600s target remains
unmet by **238.533s**. The last two accepted full runs began without another
acceptance process active. Earlier runs overlapped other acceptance work. These
are observed host wall times, not controlled attribution of every saving.
Native-reference regeneration and completed performance calibration were not
reopened. Further optimization must address a measured cost and retain the
required checks through the existing machinery.

All 873 ordinary cases and 30 fixtures remain. The full frozen-fault audit
covers all 28 bundles and 895 visible controls; the routine basis has 368 visible
and two originally invisible witnesses plus 527 explicit aliases. This extends
the earlier ten-bundle/247-control sample. Native and current pixel policies
remain unchanged. The accepted run retains 241 primary and 240 PDF observations,
361 fresh source recaptures and all family/harness control identities. Its 481
observations, 722 source rasters and 56 returned SVGs match the previous accepted
export exactly. Reusing unchanged reference evidence never substitutes old
converter output.

| Remaining stage | Executions | Aggregate child seconds |
| --- | ---: | ---: |
| Independent current checking | 28 | 1,345.792 |
| PDF production | 28 | 576.989 |
| Primary production | 28 | 548.238 |
| Frozen-reference materialization/roundtrip | 32 | 298.760 |
| Negative mechanism basis | 1 | 222.026 |
| Family/harness corruption controls | 18 | 185.597 |
| Numeric comparison | 26 | 129.446 |
| Ordinary tests | 1 | 20.629 |

Parallel child costs overlap and are not additive parent wall time. Independent
decoded checking and raster generation are the largest remaining costs; higher
parallelism also increases individual child times. The slower trial does not
justify another scheduling change in this time-boxed review.

Fresh family admissions remain additional required costs when their dependencies
or coverage gaps change: observed straight/curved/border admissions were
11m38s/15m56s/1m57s, and arrow admission was 2h35m. These have not been removed
from their required scopes to satisfy the routine target.

Historical replay covers three named defects: the shortest-decimal PDF dimension
reader (`c3682f8`), PDF text paint (`57c7ce7`) and unequal-leg orthogonal label
timing (`5bf5a9d`). Current checks pass; restoring each defect fails the retained
check, including all ten timer cases. This establishes those three regressions;
it does not claim replay of every historical defect or hosted qualification.
