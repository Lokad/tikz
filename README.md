# Lokad.TikZ

A standalone C#/.NET 10 compiler for a documented TikZ subset, producing
self-contained SVG without TeX, native libraries, or runtime package dependencies.

The project is in active development. Nine geometry fixtures are grounded
against PGF 3.1.11a with independent numeric measurements and SVG comparisons
at 1x and 4x. Lines, relative coordinates, and scoped clipping have exact
primary pixels; transformed coordinates, curves, ellipses/arcs, and rectangle cropping use
small, independently calibrated allowances. This evidence covers the listed
fixtures. A [rectangle-node prototype](docs/NODES.md) now emits outlined labels
and passes native layout and primary SVG checks for 22 actual TikZ nodes.
Broader node/shape coverage, arrows, and libraries remain.
Unsupported source constructs produce diagnostics.
The declared [RGB color profile](docs/COLORS.md) has independent path/glyph
checks for all nineteen supported names and selected mixtures.

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

The [bundled font-data prototype](tools/TikzFontData/README.md) has six
Latin Modern faces with independent TeX metric checks and exact atlas
comparisons. Its resources now supply the rectangle-node prototype's labels.
The internal [label layout](docs/TEXT.md) also matches sixteen native TeX
box/glyph-position cases exactly, with independently calibrated image checks.
The node corpus also has native glyph-position measurements and its own
oracle-calibrated CSS raster policy. This scope covers the concrete fixtures;
The [primary interaction policy](tools/TikzVisual/INTERACTION-PRIMARY.md) now
requires native numeric and global/local image gates for 41 RGB nodes, including
transformed and clipped labels. A separately calibrated
[combined PDF gate](tools/TikzVisual/INTERACTION-PDF.md) now passes those three
fixtures against ordinary TikZ PDF, with all numeric/primary checks required.
Wider labeled-diagram coverage remains pending.

The code is MIT licensed. Bundled font data retains its separate
[GUST Font License / LPPL notices](THIRD-PARTY-NOTICES.md).
Upstream reference implementations are not bundled.
