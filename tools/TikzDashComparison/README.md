# Public dash comparison

This development-only tool converts the fixed forty-line dash fixture
through the production public facade and checks it against independent
PGF integer measurements and original SVG line geometry.

Run from the repository root:

    dotnet run --project tools/TikzDashComparison -c Release

The required cached-reference check runs first. Each fresh GUID bundle
under artifacts/dash-comparisons contains the source, candidate/original
SVGs, scene trace, native evidence, source spans, SVG element mapping,
tool-source copies, hashes, and a machine-readable report. latest.json
identifies and hashes the latest completed report.

The current fixture executes 927 checks for dash state, serialized
lengths/phase, width, caps, line endpoints, picture bounds, and root
dimensions. This command reports numeric evidence only; image admission
belongs to the separate combined profile. No image limits are inferred
from the candidate.

The cached combined browser command requires native/frame/primary and both
PDF gates, with agent-viewable paired crops and an independent pinned policy:

    node tools/TikzVisual/compare-dash-lines-conformance.mjs
    node tools/TikzVisual/dash-lines-policy-self-test.mjs

See the [combined profile](../TikzVisual/DASH-LINES-CONFORMANCE.md) for exact
scope, provenance, controls and the retained earlier research trials.

See [dash grounding](../../docs/DASHES.md) for the independent
representation experiment, defect controls, and remaining coverage.

The separate sixteen-path geometry corpus runs with:

    dotnet run --project tools/TikzDashComparison -c Release -- geometry
    node tools/TikzVisual/inspect-dash-geometry.mjs

It checks 1,090 quantities against native integer path/paint/clip evidence.
Fresh artifacts/dash-geometry-comparisons bundles retain source spans,
geometry-p0 through geometry-p15 mappings, clip bindings, complete paint
state, scene traces and tool/assembly hashes. The browser command compares
the original driver against an independently reconstructed representation
and the candidate, retaining 24 whole views and 384 local observations.
It reports raw differences without deriving thresholds or admitting images.

The emitted-SVG reader checks path/clip coordinates and dimensions after
serialization, as well as the physical scale, paint/clip bindings and root
frame. Short decimal values must recover the original scaled-point integer.
The separate node/font placements use their existing trace and image gates.

The frozen geometry PDF qualification retains its original
[Cairo trial](../TikzVisual/trial-dash-geometry-pdf-cairo.mjs) and
[research-policy controls](../TikzVisual/dash-geometry-pdf-trial-self-test.mjs)
as standalone reconstruction/diagnostic entrypoints. They grant no current
image admission; use the combined geometry command in [DASHES](../../docs/DASHES.md).
