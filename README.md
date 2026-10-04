# Lokad.TikZ

A standalone C#/.NET 10 compiler for a documented TikZ subset, producing
self-contained SVG without TeX, native libraries, or runtime package dependencies.

The project is in active development. Compatibility is established by focused
semantic tests and independently authored reference cases against PGF 3.1.11a.
Unsupported source constructs produce diagnostics.

Build and run the ordinary tests with `dotnet test Lokad.TikZ.slnx`. These tests
do not require a TeX installation. Release packages are produced explicitly with
`dotnet pack src/Lokad.TikZ -c Release`.

The code is MIT licensed. Upstream reference implementations are not bundled.
