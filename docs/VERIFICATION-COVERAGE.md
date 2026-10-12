# Verification coverage index

Keep a check when it observes a supported requirement, an independent failure
boundary or a demonstrated regression. Consolidate equivalent executions within
the same verifier. The [detailed mapping](VERIFICATION.md) records the policies,
camera choices, execution commands and limits of each conformance claim.

| Coverage | Decision | Evidence that must remain |
| --- | --- | --- |
| Ordinary feature, diagnostic and resource tests | Retain all 222 methods / 875 expanded cases across 40 classes | Native quantities, returned SVG, UTF-16 spans, explicit rejection, shared limits, ongoing cancellation and call isolation observe different boundaries |
| Width-preset native grid and images | One whole-corpus conversion observes seven presets and seven ordered/style/scope mechanisms | Exact scene/emitted sp widths/bounds, primary SVG and native-only scale-specific PDF policies; shared mutation/artifact handling. Quarter/half-pixel shifts, doubled strokes, omitted thin content and native-page substitution remain distinct controls |
| Fixed malformed-input corpus | Preserve the original 5,746 exact UTF-16 inputs in the public development workflow | Conversion invariants and a separate current-input replay; two semantic saved-source/result faults, with shared artifact/process controls reused. Focused ordinary feature limits remain separate |
| Native scene measurements and returned SVG checking | Retain separately | A correct trace can accompany incorrect serialized output; glyph, border, arrow, dash and math references have distinct quantities and owners |
| Straight/curved-edge historical/current source provenance | Share the byte/source guard and three reviewed native-reader revisions; retain distinct capture ownership and policies | Exact frozen reports/assets; current guards reject before conversion; raw qualifications require current sources; curved checker inheritance stays explicit; fresh owned conversion receives independent numeric/primary/PDF checking |
| Unlabelled rectangle-border producer/current source provenance | Preserve frozen producer identities and consolidate current tool/configuration checks into one guard set | Five snapshots and nested precision evidence retain original hashes; consistently rehashed historical-source substitutions fail; current runner/SVG changes fail before conversion; native ink/frame, primary and both PDF gates and image-only defects remain separate |
| Curved-node historical/current source provenance | Preserve the pinned calibration's producer hashes; bind every current tool in the existing profile guard set | Six historical/current identities stay distinct; missing/changed tools and historical guard substitutions reject. Native geometry, original SVG/PDF, frame/primary/candidate-PDF gates and fresh glyph/shape/image-only defects remain separate |
| Arrow historical/current source provenance | Authenticate frozen source captures behind exact report/archive pins; guard actual current tools separately | Missing/changed captures and changed report pins fail; raw meet qualifiers require current sources. Comparator/checker byte controls run once in admission, with native fixture checking retained. Fresh conversion and an independent current build/checker retain native geometry, returned SVG, original-driver/native/PDF policies, mass/moments and visible defects |
| Primary/PDF/current/text generic corruption checks | Run 16/6/17/5 controls once per verifier/identity; retain the original consolidation and new policy/reference-ownership faults | Each representative fixture exposes its branch; every fixture keeps its positive checks |
| Archive transport corruption | Consolidate 56 invocations to two | The shared archive digest rejects before family interpretation; keep the original 28 plus two definition, one arc and one fill-rule positive roundtrips, and all 19 distinct cache controls |
| Artifact/process machinery | Share existing helpers; run common controls once per matrix | Hashes, ownership, path bounds, timeout, output bound, spawn failure and partial logs; saved-report loading uses eight bounded read/hash workers and settles in-flight reads on failure. Native policy semantics remain in their family readers |
| Current-output cameras | Eight mechanism/interaction views replace the 24-view product in routine qualification as well as iteration | Both capture mechanisms, natural/expanded frames, 1x/4x, alpha and contrast; smooth plotting adds its measured transparent topology branch. Historical reports retain their original 24-view interpretation |
| Visible image negatives | Full view-selection audit preserves every original witness; routine execution maps repeated nameless glyph/label absence and translation to representatives by fixture/font/glyph class/placement/topology | Named defects, paths, math marks, positioning/transformed interactions, punctuation, radius reduction, clipping rules, implicit arrow fill and smooth topology remain. Every fresh region is independently checked; aliases preserve links to qualified original controls |
| Complete-diagram qualification | Keep all 30 diagrams; 241 focused primary and 240 PDF observations, including 120 unchanged original-reference observations | Independently decode every selected whole/local region and both PDF routes; fresh conversion and 361 source recaptures. Frozen native qualification keeps its complete original matrices and pixel limits |
| Math/styled, arrow correction and other family admission controls | Retain where semantics differ | Font/rule ownership, PDF registration, corrected/original SVG evidence, geometry and admission policies are separate requirements |
| Release archive and isolated consumer | Retain four payload faults once on Windows; positive consumers on both platforms | Missing API XML, added dependency, changed DLL and unexpected asset fail; actual package restore and source/packed output parity close separate packaging requirements |
| Duplicate raster/PNG work | Share equal-operand arithmetic; assign one full independent decoded pass to its checker; avoid repeating local metrics when recapture proves complete PNG identity | All independently decoded local metrics, images, regions, repeat renders and decisions remain; altered pixels and forged checking ownership still fail |
| Positive evidence inside corruption runs | Reuse an exact fresh checked baseline | Bind receipt hashes, inputs and unchanged sources; reject false/incomplete/mismatched baselines; standalone commands retain full validation |
| Unchanged original SVG/PDF observations | Reuse qualified original-route observations in routine qualification | Exact owned calibration/check hashes, source inputs, renderer, frames, PNG bytes and decoded policies still bind the reference. Every candidate PDF view remains freshly rendered and independently checked; changed reuse flags or observations fail |
| Duplicate calibration copies/loads | Reference exact frozen calibration from current path-label reports; reuse the existing validated bundle | Every calibration asset still passes the existing reader and independent qualification/source checks. Missing/hash-changed/split references or mixed ownership fail; fresh converter and raster evidence remains owned |

Run `node tools/TikzVisual/verify.mjs iterate` during implementation, selecting an
affected feature or case when appropriate. At completion run `qualify` and the
required family checks on the final source export. Iteration cannot claim final
qualification. Frozen native evidence is reusable only while its reviewed inputs,
tools, renderer, fonts and pixel policies remain unchanged. Always check fresh
converter output independently.

| Historical defect | Retained witness |
| --- | --- |
| Shortest-decimal PDF dimensions (`c3682f8`) | `edge-oracle-self-test.mjs`: printed decimal recovers exact pen/dash/phase; one scaled-point corruption fails |
| PDF text paint (`57c7ce7`) | `arrow-native-self-test.mjs`: permitted text paint preserves path geometry; illegal text operations fail |
| Unequal-leg orthogonal label timing (`5bf5a9d`) | `PathLabelTests.Orthogonal_labels_split_the_timer_between_unequal_legs_and_use_the_selected_slope`: both turn orders, five times and selected tangent |

Current checks pass and restoring each defect fails its witness, including all
ten timer cases. This establishes these three regressions. Advertised feature
coverage also retains focused and complete-diagram checks beyond this replay.

The initial orthogonalization pass completed in **3h50m**, within four hours. Observed full qualification
fell **77m35s → 56m56s → 36m14s**; core iteration fell **4m24s → 3m08s**, with a
later **3m32s** observation. Later reductions are separate accepted work units.
These are host wall times, not controlled benchmarks. The detailed mapping keeps
the counts, scope and timing caveats; hosted/release acceptance remains separate.

The earlier 30-diagram review reduced complete routine qualification from
**46m14s → 35m50s → 21m09s → 15m58s → 13m59s**. The best accepted
configuration is `df0d257`, restored byte for byte at `9a7e827`; a slower
15m43s scheduling trial was withdrawn. The affected four-diagram loop took
**4m47s**, which is a separate scope. These are observed current-machine wall
times, not controlled benchmarks.

This review closed after **3h45m33s**, within its four-hour limit. The complete
routine at that checkpoint exceeded 600s by **238.533s**. All 873 ordinary cases, 30 fixtures,
241 primary and 240 PDF observations, 361 fresh source recaptures and retained
controls pass. All 481 observations, 722 source rasters and 56 returned SVGs
match the previous accepted output. Historical-defect witnesses and the full
unchanged 895-visible-control audit remain applicable.

Independent checking and raster generation dominate the remaining costs. The
[detailed mapping](VERIFICATION.md#recorded-outcomes) records their measured
costs and the unchanged family-admission requirements. Native regeneration is
separate; no required scope or pixel policy was removed to claim ten minutes.

The subsequent bounded saved-report read change at `996e085` passes complete
fresh qualification in **595.844s (9m56s)**, external 596.511s. All 875 ordinary
cases, 30 diagrams, 241 primary/240 PDF observations and 361 fresh source
recaptures pass. All 481 observations, 722 source/reference rasters and 56
returned SVGs match the accepted baseline exactly. Eight bounded read/hash
workers retain every asset and check; a shared failure-settlement control
detects deliberately early rejection with reads still active. Required affected
calc admission, independent replay and all 84 bound controls also pass. Native
calibration, pixel policies and historical-defect coverage remain unchanged.

This observed run meets 600s with only 4.156s internal/3.489s external margin;
it does not guarantee every subsequent run stays below ten minutes. The scoped
read-cost review closed in 56m44s, within two hours. Independent checking and
raster generation remain the largest costs; fresh family admission and hosted
release requirements retain their distinct scopes.
