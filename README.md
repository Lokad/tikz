# Lokad.TikZ

A standalone C#/.NET 10 compiler for a bounded TikZ subset, producing
self-contained SVG. The production library depends only on .NET: conversion
uses no TeX engine, installed fonts, files, processes or network services.

The project is a preview. The [public contract](SPEC.md) and
[compatibility index](docs/compatibility.md) describe supported forms and limits;
feature guides retain their independently grounded scopes. General TeX/TikZ and
arbitrary-renderer pixel compatibility are outside those claims.

## Convert a picture

```csharp
using Lokad.TikZ;

var result = TikzConverter.Convert(
    @"\begin{tikzpicture}\draw (0,0)--(1,0);\end{tikzpicture}",
    TikzOptions.Default,
    CancellationToken.None);

if (result is TikzSuccess success)
    Console.WriteLine(success.Svg);
else if (result is TikzFailure failure)
    foreach (var diagnostic in failure.Diagnostics)
        Console.WriteLine($"{diagnostic.Code}: {diagnostic.Message}");
```

Use `TikzInputKind.PictureBody` in the options for statements without a picture
wrapper. Conversion is synchronous; cancellation throws with the supplied token.
Failures contain source diagnostics and no SVG. The [diagnostics guide](docs/diagnostics.md)
explains original UTF-16 spans, caller errors and cancellation.

Labels use measured bundled glyph outlines. Output includes local definitions,
clips and XML-escaped readable titles, so rendering needs no installed font.
The viewport encloses picture and ink bounds. Use a different valid `IdPrefix`
for each SVG when combining repeated conversions into one document.

## Supported feature guides

| Area | Bounded contracts |
| --- | --- |
| Geometry and paint | [Base grammar](docs/compatibility.md#statements-and-base-geometry), [RGB colors](docs/COLORS.md), [dash state and geometry](docs/DASHES.md) |
| Nodes and labels | [Nodes/anchors/borders](docs/NODES.md), [prose/multiline text](docs/TEXT.md), [inline math](docs/MATH-LABELS.md) |
| Connections | [Straight edges](docs/EDGES.md), [curved edges](docs/CURVED-EDGES.md), [arrows](docs/ARROWS.md), [attached path labels](docs/PATH-LABELS.md) |
| Libraries | [Positioning](docs/POSITIONING.md), [calculated coordinates](docs/CALC.md), plus the declared `arrows.meta` and `shapes.geometric` subsets |
| Scoped computation | [Parameterized styles](docs/STYLES.md), [statement loops](docs/FOREACH.md), [numeric assignments](docs/MATH-MACROS.md), [selected functions](docs/MATH-FUNCTIONS.md) |
| Plots | [Sharp/smooth coordinate and finite function plots](docs/PLOTTING.md) |

The [complete diagram corpus](tests/Fixtures/Diagrams/README.md) combines these
features in small flowcharts and networks. Supported syntax does not imply
full upstream-library behavior or every combination of implemented primitives.
Unknown or unsupported constructs fail explicitly; there is no production fallback.

## Grounding and development

The [reference/testing guide](docs/TESTING.md) describes independent native
measurements, original/corrected SVG and ordinary PDF routes, whole/local image
comparisons, visible defect controls, traces and agent-readable inspection images.
Exact and independently calibrated policies apply to concrete fixtures under
pinned renderers. Broader interaction and hosted/release qualification remains
separate. Native generation accepts only trusted repository fixtures.

The [verification coverage mapping](docs/VERIFICATION.md) separates affected
iteration from final qualification and explains the distinct requirements behind
retained checks. Unchanged native evidence is reused; new converter output is
checked independently. Run ordinary tests with:

```text
dotnet test Lokad.TikZ.slnx
```

Ordinary tests need no TeX installation or browser. Explicit Release packages use
`dotnet pack src/Lokad.TikZ -c Release`. Native/browser tooling is development-only
and isolated from the production dependency graph.

[Performance measurements](docs/performance.md) define phase boundaries,
startup/warm behavior, allocations, cancellation and resource-limit calibration.
BenchmarkDotNet is confined to the [development project](benchmarks/Lokad.TikZ.Benchmarks/README.md).
The [changelog](CHANGELOG.md) records the current development preview.

Library code is MIT licensed. Bundled font resources retain their separate
[GUST Font License / LPPL notices](THIRD-PARTY-NOTICES.md). Upstream reference
implementations are not bundled.
