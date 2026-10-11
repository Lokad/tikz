# Verification coverage index

Keep a check when it observes a supported requirement, an independent failure
boundary or a demonstrated regression. Consolidate equivalent executions within
the same verifier. The [detailed mapping](VERIFICATION.md) records the policies,
camera choices, execution commands and limits of each conformance claim.

| Coverage | Decision | Evidence that must remain |
| --- | --- | --- |
| Ordinary feature, diagnostic and resource tests | Retain the original 199 methods / 821 expanded cases; add tests with new features | Native quantities, returned SVG, UTF-16 spans, explicit rejection, shared limits, ongoing cancellation and call isolation observe different boundaries |
| Fixed malformed-input corpus | Preserve the original 5,746 exact UTF-16 inputs in the public development workflow | Conversion invariants and a separate current-input replay; two semantic saved-source/result faults, with shared artifact/process controls reused. Focused ordinary feature limits remain separate |
| Native scene measurements and returned SVG checking | Retain separately | A correct trace can accompany incorrect serialized output; glyph, border, arrow, dash and math references have distinct quantities and owners |
| Straight-edge historical/current source provenance | Keep immutable historical captures separate from reviewed current guards | Exact frozen qualification reports and assets; three pinned native-reader revisions; current guards reject before conversion, raw qualifications still require current sources, and fresh owned conversion receives independent numeric/primary/PDF checking |
| Primary/PDF/current/text generic corruption checks | Consolidate 495 nonmath invocations to 33 existing identities, plus two fill/clip control-omission checks: 16/6/8/5 | Run each verifier/control identity once on a fixture exposing its branch; every fixture keeps its positive checks |
| Archive transport corruption | Consolidate 56 invocations to two | The shared archive digest rejects before family interpretation; keep the original 28 plus two definition, one arc and one fill-rule positive roundtrips, and all 19 distinct cache controls |
| Artifact/process machinery | Share existing helpers; run common controls once per matrix | Hashes, ownership, path bounds, timeout, output bound, spawn failure and partial logs; keep native policy semantics in their family readers |
| Iteration cameras | Eight mechanism/interaction views replace the 24-view product | Both capture mechanisms, natural/expanded frames, 1x/4x, alpha and contrast; smooth plotting adds its measured transparent topology branch |
| Visible image negatives | Keep all original 126 plus 53 definition, 32 arc-diagram and 36 fill-rule controls: 247 total; independently decode one selected visible witness per negative for iteration selection | Missing glyphs/labels/tips/arcs, shifted ink, historical radius reduction, clipping rules, implicit arrow fill, smooth topology and math/styled rules must still fail |
| Final complete-diagram qualification | Keep the original 26 diagrams and add the definition pair/arc/fill-rule flowcharts: 30 diagrams, 720 primary / 240 PDF views and 960 source recaptures | Every originally required view and per-region policy; complete diagrams retain positioning, labels, arrows, calc, definition, arc and winding-rule interactions |
| Math/styled, arrow correction and other family admission controls | Retain where semantics differ | Font/rule ownership, PDF registration, corrected/original SVG evidence, geometry and admission policies are separate requirements |
| Release archive and isolated consumer | Retain four payload faults once on Windows; positive consumers on both platforms | Missing API XML, added dependency, changed DLL and unexpected asset fail; actual package restore and source/packed output parity close separate packaging requirements |
| Duplicate raster/PNG work | Share equal-operand arithmetic; assign one full independent decoded pass to its checker; avoid repeating local metrics when recapture proves complete PNG identity | All independently decoded local metrics, images, regions, repeat renders and decisions remain; altered pixels and forged checking ownership still fail |
| Positive evidence inside corruption runs | Reuse an exact fresh checked baseline | Bind receipt hashes, inputs and unchanged sources; reject false/incomplete/mismatched baselines; standalone commands retain full validation |

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

The first pass completed in **3h50m**, within four hours. Observed full qualification
fell **77m35s → 56m56s → 36m14s**; core iteration fell **4m24s → 3m08s**, with a
later **3m32s** observation. Later reductions are separate accepted work units.
These are host wall times, not controlled benchmarks. The detailed mapping keeps
the counts, scope and timing caveats; hosted/release acceptance remains separate.
