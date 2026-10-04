# Lokad.TikZ

A standalone C#/.NET 10 compiler for a documented TikZ subset, producing
self-contained SVG without TeX, native libraries, or runtime package dependencies.

The project is in active development. Nine geometry fixtures are grounded
against PGF 3.1.11a with independent numeric measurements and SVG comparisons
at 1x and 4x. Lines, relative coordinates, and scoped clipping have exact
primary pixels; transformed coordinates, curves, ellipses/arcs, and rectangle cropping use
small, independently calibrated allowances. This evidence covers the listed
fixtures. Nodes, labels, arrows, and libraries remain to be implemented.
Unsupported source constructs produce diagnostics.

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

Build and run the ordinary tests with `dotnet test Lokad.TikZ.slnx`. These tests
do not require a TeX installation. Release packages are produced explicitly with
`dotnet pack src/Lokad.TikZ -c Release`.

The [reference and visual harness](docs/TESTING.md) is development tooling.
It produces comparison PNGs, failure crops, machine-readable metrics, source
traces, and a local inspection viewer. Its browser and TeX dependencies are
isolated from the production library.

The code is MIT licensed. Upstream reference implementations are not bundled.
