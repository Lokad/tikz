# Verification coverage index

Retain a check when it observes supported behavior, an independent failure
boundary or a demonstrated regression. Consolidate equivalent executions within
the same verifier. Passing many checks does not establish an untested behavior.
The [testing guide](TESTING.md) gives commands; the [detailed mapping](VERIFICATION.md)
records view policies and execution boundaries.

| Requirement | Evidence to retain | Consolidation boundary |
| --- | --- | --- |
| Syntax and explicit failures | Feature, scope, arithmetic, original-span, cancellation and limit regressions | Prefer mechanism coverage plus demonstrated interactions over Cartesian permutations |
| Native semantic agreement | Independent integer geometry, label metrics, glyph/rule positions, paint and bounds | Reuse unchanged fixtures; keep distinct native quantities/readers |
| Returned SVG | Independently decoded paths, paint, clips, root dimensions, glyph references and transforms | Scene agreement alone misses serialization defects |
| Malformed-input handling | Exact UTF-16 corpus, result invariants, culture/concurrency checks and saved replay | Share process/artifact controls; add focused regressions for corpus gaps |
| Family behavior | Width, dash, border, arrow and math native/frame/primary/PDF/visible-defect gates | Share mechanical plumbing; retain different numeric semantics and pixel policies |
| Reference integrity | Pinned raw measurements/assets, historical provenance and current guards | Check common byte/path/archive faults once per reader; retain distinct ownership/policy checks |
| Fresh current output | Complete diagrams, independent regional pixel checks and source recapture | Reuse qualified references; freshly render/check the candidate |
| View mechanisms | Both capture routes, natural/expanded frames, 1x/4x, alpha/contrast and smooth topology | Routine `mechanisms-v1` replaces the old camera product; historical reports retain their meaning |
| Image sensitivity | Named defects, paths, math, placement/transforms, clipping, arrow fill and thin content | Repeated nameless glyph/label controls may name a qualified representative; check every fresh region |
| Process/report handling | Spawn failure, timeout, output bounds, partial logs, path/digest limits and settled reads | Exercise shared machinery once per identity; retain family interpretation |
| Package correctness | Release archive, API XML, dependency/payload audit and isolated consumer parity | Archive faults once on Windows; positive consumers on both CI platforms |
| Performance | Admitted public workloads and matched build/options/cache states | Keep allocation/time distributions; do not add overlapping phase times |

The final routine keeps all 30 selected fixtures, 241 current primary and 240 PDF
observations, including reused original-reference observations, and 361 fresh
source recaptures. Exact scope comes from the selected manifest and report.
Affected iteration and selected-case qualification cannot claim complete-matrix
qualification. Live native generation is separate.

Historical reports describe their recorded source tree and renderer. Their
counts and timings are not current test totals or promises about subsequent
runs. Read fresh results for the actual outcome. The
[recorded outcomes](VERIFICATION.md#recorded-outcomes) retain revision-specific
timings and their limits.

| Historical defect | Retained witness |
| --- | --- |
| Shortest-decimal PDF dimensions (`c3682f8`) | `edge-oracle-self-test.mjs`: exact pen/dash/phase recovery and a rejecting one-sp corruption |
| PDF text paint (`57c7ce7`) | `arrow-native-self-test.mjs`: permitted text paint preserves geometry; illegal operations reject |
| Unequal-leg orthogonal labels (`5bf5a9d`) | `PathLabelTests.Orthogonal_labels_split_the_timer_between_unequal_legs_and_use_the_selected_slope`: both orders, five positions and selected tangent |

These three established historical regressions complement the feature suite.
They do not imply replay of every past defect or hosted release qualification.
Keep a distinct rejecting witness when simplifying their checks.
