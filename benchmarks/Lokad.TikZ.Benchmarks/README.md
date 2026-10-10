# Conversion benchmarks

This development-only BenchmarkDotNet project uses the public .NET 10
converter. The production package has no BenchmarkDotNet dependency.

```powershell
dotnet restore benchmarks/Lokad.TikZ.Benchmarks --locked-mode
dotnet build benchmarks/Lokad.TikZ.Benchmarks -c Release --no-restore
dotnet run --project benchmarks/Lokad.TikZ.Benchmarks -c Release --no-build -- --check
dotnet run --project benchmarks/Lokad.TikZ.Benchmarks -c Release --no-build -- --filter '*' --job short --exporters json --artifacts artifacts/benchmarks
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

Phase timings, cold process/font startup, working-set and cache experiments,
ongoing-work cancellation, measured goals and default-limit calibration remain
required performance work. The evaluator includes label layout. The parser uses
a character cursor without a token stream; token/expansion metrics need explicit
definitions before reporting them.
