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
converter and performs 1,090 numeric checks. These commands do not run the
separately pinned primary SVG gate:

    node tools/TikzVisual/compare-dash-geometry-primary.mjs
    node tools/TikzVisual/dash-geometry-primary-self-test.mjs

The primary gate requires twelve whole-picture and 192 local comparisons
alongside the native/frame checks. Its 106 controls include nineteen fresh
image-only defects with numeric checks bypassed. The combined gate now uses a
separately qualified, immutable Cairo PDF profile:

    node tools/TikzVisual/compare-dash-geometry-conformance.mjs
    node tools/TikzVisual/dash-geometry-pdf-policy-self-test.mjs

It requires the fresh native/frame/primary gates and four PDF views on each
SVG side with whole-picture and sixteen local gates. Normal comparison uses
checked-in reference rasters and needs no installed PDF engine. Its limits
come from independent observations, exact replays, viewport controls and
nineteen rejected defects; the original Splash references stay unchanged.
Primary success alone does not assert combined conformance. Labels/nodes and
other fixtures retain their separate admission states.

Independent ordinary-PDF diagnostics are separate from the primary gate:

    node tools/TikzVisual/dash-geometry-pdf-vector-self-test.mjs
    node tools/TikzVisual/inspect-dash-geometry-pdf.mjs

These development commands require the pinned browser, read only this trusted
fixture's original PDF/SVG/native evidence, and invoke no converter. The
bounded PDF reader checks 446 finite-coordinate/paint/page quantities and
35 parser/numeric controls. The image investigation checks 54 exact native
page-viewport controls, then retains 40 whole-picture and 640 regional
observations, including literal PDF instructions rendered as SVG. Fresh
artifact bundles expose paired crops, differences, original instructions,
native measurements and source/tool hashes. They grant no PDF tolerance or
combined admission.

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

See [dash grounding](../../docs/DASHES.md) for source-linked images, independent
calibration and provenance guards, and remaining PDF/interaction work.
