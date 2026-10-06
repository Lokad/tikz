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

The current fixture executes 647 checks for dash state, serialized
lengths/phase, width, caps, line endpoints, picture bounds, and root
dimensions. A numeric pass leaves primary and PDF admission pending.
No image limits are inferred from the candidate.

The separate browser trial produces agent-viewable images:

    node tools/TikzVisual/trial-dashes.mjs

See [dash grounding](../../docs/DASHES.md) for the independent
representation experiment, defect controls, and remaining coverage.
