# Lokad.TikZ

A standalone C#/.NET 10 compiler for a documented TikZ subset, producing
self-contained SVG without TeX, native libraries, or runtime package dependencies.

The project is in active development. Nine geometry fixtures are grounded
against PGF 3.1.11a with independent numeric measurements and SVG comparisons
at 1x and 4x. Lines, relative coordinates, and scoped clipping have exact
primary pixels; transformed coordinates, curves, ellipses/arcs, and rectangle cropping use
small, independently calibrated allowances. This evidence covers the listed
fixtures. A [node prototype](docs/NODES.md) now emits outlined labels
and passes native layout and primary SVG checks for 22 actual TikZ rectangle nodes.
Circle and ellipse nodes also match native sizing, anchors, background paths,
and border queries across 28 cases. Their separately calibrated
[cached combined profile](tools/TikzVisual/CURVED-NODE-ADMISSION.md) requires
native/frame, whole/local primary, both PDF and fresh sensitivity gates.
Broader node/shape coverage, arrows, and libraries remain.
Unsupported source constructs produce diagnostics.
The [dash prototype and differential harness](docs/DASHES.md) match
forty native dash-state cases and sixteen curved/closed/transformed/clipped
paths. Both fixed corpora now have separate immutable primary/PDF profiles;
raw differences and earlier failed trials remain available. Further
path/label/node interactions remain pending.
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

A separate [straight `to`/`edge` reference corpus](tools/TikzEdgeReference/README.md)
now retains independent native paths, node measurements, effective paint state,
physical paint order and SVG/PDF inspection images. This prepares the compiler
comparisons for the [straight connection prototype](docs/EDGES.md). The public
converter now passes 2,585 native numeric assertions across the fixed corpus.
Candidate images retain original-driver differences. A separate
[fixed conformance command](tools/TikzVisual/EDGE-CONFORMANCE.md) requires all
eight native/frame/image/sensitivity gates and an owned independent checker
under a pinned profile. Its calibrated SVG/PDF and exact native-SVG-page claims
apply only to those five fixtures; hosted validation and broader coverage remain
pending.

The [curved connection prototype](docs/CURVED-EDGES.md) adds bends, `in`/`out`
angles, looseness and distance controls. Five separate fixtures retain 70 native
path calls and pass 2,066 numeric assertions. A dedicated
[inspection command](tools/TikzVisual/CURVED-EDGE-INSPECTION.md) saves paired
PNGs, raw differences, crops and overlay viewers. The separate
[fixed-family conformance command](tools/TikzVisual/CURVED-EDGE-CONFORMANCE.md)
requires all eight numeric/image gates and its owned independent checker under
an externally pinned profile. Its agent report ranks 6,224 source-attributed
regions and exposes a local paired-image viewer. Calibrated original-SVG/PDF
and exact reconstructed-native-page claims apply only to these five fixtures;
wider interactions and hosted qualification remain pending.

Three labeled-border interaction fixtures now have independent native ink/root
calibration, a passing [prospective primary trial](tools/TikzVisual/LABELLED-BORDER-INK.md)
and image-only defect checks. Their original-driver differences remain visible.
A separate [PDF investigation](tools/TikzVisual/LABELLED-BORDER-PDF.md) now checks
native instructions and page registration and retains whole/local raw images.
Its [rasterizer investigation](tools/TikzVisual/LABELLED-BORDER-PDF-RASTERIZERS.md)
also compares pinned Cairo/Splash pages and isolated glyph/path operations.
A separate [PDF calibration and native-page guard](tools/TikzVisual/LABELLED-BORDER-PDF-CALIBRATION.md)
freeze independent limits and expose two faint 1x losses that PDF-only checks
miss. Exact native-page comparison detects them; the failed PDF-only trial
remains available. A [fresh public combined trial](tools/TikzVisual/LABELLED-BORDER-COMBINED-TRIAL.md)
passes all six numeric/image gates. Its [fresh public PDF/native-page controls](tools/TikzVisual/LABELLED-BORDER-PUBLIC-PDF-SENSITIVITY.md)
now pass the independently specified visibility expectations. A separate
[portable cache and scoped admission](tools/TikzVisual/LABELLED-BORDER-CACHE.md)
uses checked-in evidence, reproduces the independent control PNGs and owns a
fresh eight-gate trial plus its saved-image checker. Its immutable profile admits
only the three fixed labeled-border fixtures; hosted CI remains unverified.

The [bundled font-data prototype](tools/TikzFontData/README.md) has six
Latin Modern faces with independent TeX metric checks and exact atlas
comparisons. Its resources now supply the node prototypes' labels.
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
