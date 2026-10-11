# Conversion benchmarks

This development-only BenchmarkDotNet project measures the public .NET 10
converter and internal phases through friend-assembly access. The production
package has no BenchmarkDotNet dependency or measurement instrumentation.

```powershell
dotnet restore benchmarks/Lokad.TikZ.Benchmarks --locked-mode
dotnet build benchmarks/Lokad.TikZ.Benchmarks -c Release --no-restore
dotnet run --project benchmarks/Lokad.TikZ.Benchmarks -c Release --no-build -- --check
dotnet run --project benchmarks/Lokad.TikZ.Benchmarks -c Release --no-build -- --check-phases
dotnet run --project benchmarks/Lokad.TikZ.Benchmarks -c Release --no-build -- --check-limits
dotnet run --project benchmarks/Lokad.TikZ.Benchmarks -c Release --no-build -- --filter '*' --job short --iterationCount 8 --warmupCount 3 --outliers DontRemove --exporters json --artifacts artifacts/benchmarks
dotnet benchmarks/Lokad.TikZ.Benchmarks/bin/Release/net10.0/Lokad.TikZ.Benchmarks.dll --first-warm flowchart-styled-labels 100
dotnet benchmarks/Lokad.TikZ.Benchmarks/bin/Release/net10.0/Lokad.TikZ.Benchmarks.dll --cancel-ongoing 20
```

`--check` admits all fourteen workloads before measurement. It records source
SHA-256, UTF-16 source length, expected outcome, public statistics and any
diagnostic. It verifies ten successful pictures, three explicit failures and
the supplied token for pre-call cancellation. It invokes no TeX or renderer.

| Workload | Input contract |
| --- | --- |
| `flowchart-draw-color` | Accepted complete paint/positioning/path-label/calc diagram |
| `flowchart-styled-labels` | Accepted multiline, prose-face and inline-math diagram |
| `network-math-labels` | Accepted math-label, macro/function/loop network |
| `network-smooth-plot` | Accepted smoothing/plotting/positioning network |
| `small-primitives` | Lines, fill, circle and cubic geometry |
| `dense-network` | 100 labeled grid nodes and 180 directed links |
| `long-path` | One path with 1,000 line operations |
| `expression-plot` | 200 degree-trigonometric samples |
| `repeated-glyphs` | 100 labels with repeated kerned/ligatured text |
| `nested-styles` | Nested/parameterized styles in a labeled flowchart |
| `reject-unsupported` | Explicit `TIKZ002` for unsupported input |
| `reject-work` | Explicit `TIKZ005` with work limited to 100 units |
| `reject-glyphs` | Explicit `TIKZ005` with glyphs limited to 32 |
| `cancelled-before-call` | Caller cancellation requested before conversion |

Setup loads the fixed source and checks admission, intentionally warming JIT
and font resources. The timed operation calls the public converter and catches
only the expected pre-call cancellation with its supplied token. Source IO,
admission checks and report serialization are outside the timed operation.
MemoryDiagnoser reports managed allocations for that operation. The returned
conversion result is consumed by BenchmarkDotNet.

Use `--job dry` to check generated-executable execution. Its single measurement
is a smoke check and does not establish a steady-state performance baseline.
Keep raw results with the workload/source identity and machine/runtime details.

Public statistics are budget counters. Nodes include coordinate declarations;
segments include moves and generated geometry such as glyph outlines and arrow
tips, so they differ from the source's line count. OutputBytes counts UTF-8 SVG
bytes on success and is zero on failure. Work counts charged parser/evaluator/
writer operations, and LoopIterations counts executed statement-loop iterations.

The four existing complete diagrams retain their separately scoped native/image
evidence. The new performance-only sources establish supported conversion and
workload volume; they carry no new image-conformance claim.

The full warm matrix has fifty cases: fourteen public conversions, ten successful
workloads times three internal phases, and three labels times parse/layout.
`--check-phases` verifies whole-result/shared-budget parity for ten successes and
three failures; all phase work partitions reconcile with public counters. Phase
setup repeats parse/evaluate/write against the exact public SVG, and label setup
checks boxes, line metrics, glyphs and rules against public node layout.

Isolated phase benchmarks include a fresh budget and phase object. Evaluator
timing includes label parsing/layout, outline resolution and geometry. The label
layout benchmark uses prepared label IR and measures text/math boxes and placed
marks, excluding parsing, glyph-outline decoding, node geometry and SVG. These
timings overlap the evaluator and must not be added to it. Parsed/evaluated inputs,
source IO and admission checks happen in setup; fonts/JIT are deliberately warmed.

`--first-warm` requires a new process for each workload. It times the first public
call before conversion admission or a font census, then checks subsequent output,
counters and bounded lazy-font cache stability. Converter times exclude process
launch, source IO and report work. Managed allocations cover the caller thread's
conversion; peak working set covers the entire process including runtime/harness
and untimed checking. The font census can initialize lazy maps but never loads a
face value. Outline deduplication is local to each evaluator/conversion. Pipeline
counters are collected after the memory snapshot.

`--cancel-ongoing` first admits its 10,000-iteration source without cancellation.
Each sample starts the actual internal pipeline on a worker and observes at least
10,000 charged units before requesting the supplied token. Latency ends at the
worker's matching cancellation exception. It includes cancellation signalling,
scheduling and exception handling; public pre-call cancellation remains a separate
warm benchmark. No production timestamp, callback or ambient dependency is added.

Source length counts UTF-16 code units. Parser IR counts include nested scopes
but exclude foreach templates parsed during evaluation. ExpandedCharacters reads
the existing generated-source-character budget outside the timed operations;
`MaxExpandedTokens` uses those units. No lexical token stream/count exists.
LoopIterations counts executed loop iterations; Drawables counts resolved graphic
commands, and placed glyph/rule counts differ from distinct cached outlines.
See [performance measurement contract](../../docs/performance.md) for reference
observations, goals and limit calibration; raw measurement output remains ignored.

`--check-limits` checks each success at its exact counter usage and one unit below;
successful SVG/statistics must stay identical and bounded rejection must produce
one `TIKZ005` with zero output bytes. It separately finds minimum positive integer
depth limits and coordinate ceiling. Zero-use resources remain valid at zero;
invalid option values are not presented as resource-limit failures.
