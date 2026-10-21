# Performance measurements

The .NET 10 converter has a development-only measurement project at
[`benchmarks/Lokad.TikZ.Benchmarks`](../benchmarks/Lokad.TikZ.Benchmarks/README.md).
BenchmarkDotNet is absent from the production package. Internal phase access uses
the same friend-assembly mechanism as repository tests and reference tools;
production adds no timestamp, observer, process or ambient-environment dependency.

The warm suite contains fifty cases: fourteen public conversions, parser,
evaluator and SVG writing on all ten successful workloads, and parse/layout for
three representative labels. The accepted complete paint, styled-label,
math-label and smooth-plot pictures retain their separate image qualification.
The other performance inputs establish workload volume and explicit rejection.

| Operation | Timed work | Prepared outside timing |
| --- | --- | --- |
| Public conversion | Validation, shared-budget parsing/evaluation/writing and result; expected pre-call cancellation handling | Fixed source/options, admitted outcome, warm JIT/fonts |
| Parser | Fresh budget/parser and character-cursor semantic IR construction | Fixed source/options |
| Evaluator | Fresh budget/evaluator, expansion, label parsing/layout, outlines, node/path resolution | Parsed semantic program |
| SVG writer | Fresh budget, formatting, XML, IDs and output limits | Resolved scene and source |
| Label parser | Fresh budget/parser, prose/math label IR | Label source |
| Label layout | Fresh budget/layout, text/math boxes and placed glyphs/rules | Label IR and warm font resources |

Label layout is part of evaluation. Adding the separate label measurements to
evaluator time would count overlapping work twice. Isolated phase budgets begin
fresh; full public conversion keeps one shared budget. Admission reconciles
shared-budget phase counters and whole results, repeats prepared phase inputs
against exact public SVG, and compares standalone label boxes/marks to public
node layout. Phases are measured on admitted successes; rejection remains a
public-converter operation.

`--first-warm ID 100` runs in a fresh child process for each of fourteen inputs.
Its first converter call includes first-use JIT and embedded-font loading;
fixture IO, process launch and report work are outside the converter timer.
Parent process wall time is recorded separately. Subsequent outputs, diagnostics
and counters must equal the first result. Font census uses lazy-value creation
flags, never loads a face, and checks same-input cache stability. The six prose
and nineteen math faces are bounded process caches. Parsed glyph geometry shares
a lazy cache limited to validated bundled face/slot pairs. It retains font paths
and segments; conversion sources, used definitions and SVG IDs stay local.
Every conversion admits its used outlines against the same source-aware work and
segment limits, regardless of cache warmth. Distinct definitions are deduplicated
within each evaluator. The 25 bundled faces contain 4,748 glyph slots in total.

Allocation probes count bytes allocated by the converter's calling thread.
BenchmarkDotNet's MemoryDiagnoser independently measures each warm operation.
Peak working-set observations include the entire process, runtime, harness and
untimed checking; they are not managed allocation or an isolated library memory
limit. Counter inspection occurs after the process-memory snapshot.

`--cancel-ongoing 20` admits its source without cancellation, then runs the
actual internal phases on a worker with one supplied token/budget. Cancellation
is requested only after at least 10,000 observed charged units. Latency ends at
the worker's matching cancellation exception and includes scheduling, signalling
and exception handling. This is separate from public pre-call cancellation.

| Counter | Definition |
| --- | --- |
| SourceCharacters | UTF-16 code units in the caller's source |
| ParsedStatements / ParsedPathOperations | Initial semantic IR, including nested scopes; foreach templates are parsed later |
| ExpandedCharacters | Actual generated-source-character budget; these are `MaxExpandedTokens` units |
| LoopIterations | Executed foreach iterations, including nested loops |
| Work | Charged parser/evaluator/writer operations; phase deltas reconcile with the public total |
| Nodes | Charged node and coordinate declarations, including generated path labels |
| Segments | Charged moves/lines/curves/closures and generated glyph/arrow geometry |
| Glyphs | Glyph budget consumed by layout |
| Drawables / Coordinates | Resolved graphic commands and final named-coordinate entries |
| PlacedGlyphs / PlacedRules / UniqueOutlines | Painted marks and distinct per-conversion outline-cache entries |
| OutputBytes | UTF-8 SVG bytes on success; zero on failure |

The parser has no lexical token stream, so no lexical-token count is reported.
Expansion, executed loops and resolved graphic commands describe different
volumes; none is presented as a TeX token count.

Reference observations on 2026-10-11 used an Intel Xeon W-2223 (four cores/eight
logical processors), Windows x64, .NET 10 and SDK 10.0.401, Release builds.
Each row is one fresh process followed by 100 same-input calls. Warm columns are
the median of those calls, rather than BenchmarkDotNet throughput estimates.
First-call and process-memory observations are single-process experiments.

| Workload | First call ms | Warm median ms | Warm allocation MiB | Process peak MiB |
| --- | ---: | ---: | ---: | ---: |
| Complete paint diagram | 191.72 | 3.41 | 0.66 | 45.79 |
| Complete styled-label diagram | 300.88 | 5.73 | 0.97 | 67.91 |
| Complete math-label network | 242.69 | 4.31 | 0.69 | 50.82 |
| Complete smooth-plot network | 203.32 | 2.83 | 0.53 | 45.57 |
| Small primitives | 66.24 | 0.20 | 0.06 | 37.83 |
| 100-node dense network | 213.81 | 18.63 | 7.21 | 65.72 |
| 1,000-segment path | 69.54 | 6.50 | 1.82 | 48.08 |
| 200-sample expression plot | 80.68 | 4.59 | 1.17 | 41.97 |
| 100 repeated-text labels | 168.37 | 10.51 | 2.62 | 56.22 |
| Nested styles | 210.94 | 2.48 | 0.54 | 46.76 |

Unsupported/work-limited/glyph-limited rejection warmed to medians of
0.006/0.015/0.822 ms; the glyph-limited case first loads text resources.
Public pre-call cancellation warmed to 0.005 ms. These boundaries differ from
ongoing cancellation: exploratory charged-work samples observed the supplied
token during evaluation, with first-catch/JIT cost visible in the first sample.
Keep the full cancellation distribution and scheduling context, rather than
presenting the shortest sample as a guaranteed response time.

The next representative warm baseline, recorded on 2026-10-13 at `4ffb002`, uses
the existing public-conversion BenchmarkDotNet suite on the same reference
machine, .NET 10.0.12 / SDK 10.0.401 and Release builds. Each workload has three
warmups and eight measured iterations, with outliers retained. Setup admits the
source and warms fonts/JIT. These means and caller allocations are distinct from
the earlier first/warm probe medians above; they do not establish a speedup over
that different measurement method.

| Representative workload | Mean ms | Allocated bytes/conversion |
| --- | ---: | ---: |
| 100-node dense network | 8.807 | 6,096,684 |
| Complete paint diagram | 0.706 | 459,587 |
| Complete styled-label diagram | 1.017 | 621,843 |
| Nested styles | 0.454 | 388,081 |
| Complete math-label network | 0.803 | 520,741 |
| Complete smooth-plot network | 0.870 | 405,309 |
| 100 repeated-text labels | 5.764 | 2,407,824 |

This corpus prioritizes ordinary and moderately complex supported pictures.
Phase/label measurements locate residual costs; their overlapping times are not
additive. Use matching input/build/runtime/cache boundaries for subsequent paired
comparisons. Accept clear allocation savings from simpler ownership without a
required percentage speedup, and investigate credible representative regressions.
Do not use these measurements as performance or timing CI gates.

A follow-up label-result experiment replaced four growing lists/final copies
with exact arrays. Emission counts reduced representative allocations by roughly
2.5–41.6 KB, but the initial and reverse comparisons showed slower paint, styled,
math and dense conversions. Counting existing marks instead retained allocation
savings but did not remove the isolated prose/math layout regression. Both
prototypes preserved ordinary tests, output and counters and were reverted.
This is a deferred optimization, not a shipped gain; simpler ownership must not
be claimed from allocation savings while representative execution regresses.

A style-provenance change replaces iterator wrappers and a capturing duplicate
search with direct ordered loops. Representative allocation falls from 388,081
to 344,076 bytes for nested styles (11.3%) and by about 4.4% for the dense network.
The ordinary tests, public/phase parity and affected style pictures pass. Initial
and reverse timing comparisons vary, including an unchanged control; no throughput
gain is established. The change adds no cache or new provenance representation.

Bounded attribution identifies repeated body/coordinate parsing as a residual
cost: the dense network reparses 309 foreach bodies and the expression plot
parses 200 sample coordinates. General syntax reuse remains deferred because
bindings are substituted as text before parsing; names, options, source mapping
and negative-sample precedence can change. A minimal invariant template boundary
must preserve those semantics before a reuse optimization is justified.

Repeated-label parsing/layout also offers potential in the repetition workload,
while the ordinary complete pictures have distinct label signatures. A label
cache needs current-use source binding and logical glyph/work admission; no
whole-workload benefit justifying that lifetime complexity is established.
Math copying is modest in the complete pictures. A transient value-entry
prototype saves about 736 bytes per math-network conversion and 224 bytes per
isolated math-rules layout, but timing varies and a later layout observation
slows. It was reverted; these are experiment results, not shipped gains. Deeper
layout representations, pooling and content caches remain deferred.

Initial goals on this reference class are warm conversion below 20 ms and
allocation below 2 MiB for the four ordinary complete diagrams, and below 50 ms/
16 MiB for the larger stress inputs. First-call conversion targets below 500 ms
for this corpus. These are provisional engineering goals with measured headroom;
they are not an SLA, a guarantee for arbitrary accepted input or timing CI gates.

Default limits remain unchanged. Largest observed successful usage is 806,248
work units (8.06% of 10,000,000), 3,248 segments (3.25% of 100,000), 100 nodes
(1% of 10,000), 700 glyphs (0.7% of 100,000), 309 loop iterations (0.31% of
100,000), 19,251 generated characters (1.93% of 1,000,000), and 188,750 output
bytes (1.13% of 16 MiB). These ceilings leave room beyond the calibration corpus;
maximum accepted inputs may exceed the ordinary-diagram latency/allocation goals.
Callers can choose lower limits for their workload.

`--check-limits` calibrates all ten successes: each nonzero counter limit admits
the identical SVG/statistics at exact usage and rejects one unit below with
`TIKZ005`. Zero-use resources also succeed with a zero cap. It finds the minimum
successful positive integer nesting/expression/expansion limits and coordinate
pixel ceiling by bounded search, checking the adjacent rejection where valid.
Coordinate calibration is an integer ceiling, not a claimed exact fractional
maximum. Conversion stops at its first explicit failure. Related diagnostic
locations consume remaining work; primary reporting stays available after
exhaustion and continues to observe cancellation.
The measured inputs need nesting depths 1–4, expression depths 1–9 and expansion
depths 1–4; their minimum integer coordinate ceilings range from 152 to 451 pixels.
The larger defaults are bounded headroom, rather than measured interactive targets
at those maxima.

Preserve raw JSON, machine/runtime identity, source/workload hashes and benchmark
configuration. A Dry job executes generated code once and is only a smoke check.
The full warm BenchmarkDotNet command uses three warmups/eight measured iterations
with outliers retained. Machine-dependent timing is not an ordinary CI gate.
Performance comparisons need the same machine, runtime, inputs, job and cache
boundary; rerun before attributing differences to an implementation change.
