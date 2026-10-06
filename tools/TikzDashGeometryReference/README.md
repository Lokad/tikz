# Native dash geometry reference

This development-only, framework-only tool measures the fixed
[geometry fixture](../../tests/Fixtures/Dashes/geometry.tikz) independently
with PGF 3.1.11a. It accepts no arbitrary source and never invokes Lokad.TikZ.
Its separate snapshot preserves the existing forty-line dash reference.

Run from the repository root:

    dotnet run --project tools/TikzDashGeometryReference -c Release -- check-cached
    dotnet run --project tools/TikzDashComparison -c Release -- geometry

The first command validates the external snapshot, source/artifact hashes,
native path records, tool/input identities, driver agreement, page frame,
and plain/probed invariance without TeX. The second invokes the public
converter and performs 1,090 numeric checks. An image verdict remains pending.

Sixteen paint cases cover cubic controls, compound subpaths, closed and filled
paths, circles/ellipses/arcs with continuation, ordered/oblique transforms,
width ordering and scope restoration. Three native clip paths cover ordinary
and nested clipping. Both DVI/SVG and ordinary PDF record path coordinates,
cubic controls, dash items, phase and width as integer scaled points.

For explicit, nonoverwriting live verification:

    dotnet run --project tools/TikzDashGeometryReference -c Release -- verify

This requires the pinned MiKTeX/PGF installation, dvisvgm 3.4.3,
pdftoppm 24.04.0 and kpsewhich. Four fresh plain/probed runs are retained
under artifacts/dash-geometry-reference. SVG, PDF and both PDF raster scales
must be byte-identical between plain and probed compilation. Recorded inputs
and tool identities must match the cache. Shell escape and automatic package
installation are disabled; processes and captured output are bounded.

The generate command deliberately replaces this family's baseline and
external snapshot. Retain prior evidence before a reference update. The
snapshot pins eight fixture/generator/build inputs and thirteen artifacts;
changing pinned sources requires regeneration. Each live run preserves its
source copies before invoking TeX and writes a completion or failure report.

See [dash grounding](../../docs/DASHES.md) for the separate browser inspection,
source-linked images and remaining primary/PDF admission work.
