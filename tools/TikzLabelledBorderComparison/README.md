# Public labeled-border comparison and inspection

The development-only numeric exporter converts all three frozen labeled-border
fixtures through the public API. It emits actual SVGs, source-aware scene traces,
independent native glyph records, and 1,624 per-quantity checks. Its matcher is
shared with ordinary xUnit tests; five candidate-scene mutations exercise wrong
widths, glyph placement/count, node frames, and painting order.

```text
dotnet run --project tools/TikzLabelledBorderComparison -c Release
node tools/TikzVisual/inspect-labelled-borders.mjs
node tools/TikzVisual/labelled-border-inspection-self-test.mjs
```

The exporter consumes the immutable [native references](../TikzLabelledBorderReference/README.md)
without TeX or a browser. It validates frozen artifact and source hashes before
conversion, writes a fresh directory under `artifacts/labelled-border-numeric/`,
and records framework-only assembly references, assembly/source/tool hashes,
configuration options, complete case/check coverage, source spans, semantic IDs,
SVG element IDs, paint order and natural bounds. `--out artifacts/...` selects
an empty directory; invalid/outside paths and symlinks/junctions are rejected.
The executable and its linked readers do not enter the production package.

The inspector additionally requires the repository's pinned development browser.
Before invoking the converter, it fixes the camera and 162 regions from original
SVG glyph outlines and native PGF paths. Path windows use conservative control
bounds and the declared maximum miter radius. Endpoint windows use native points;
glyph windows retain the original affine frame. Regions come from reference
evidence, with no image fitting or candidate-dependent camera.

Each GUID bundle under `artifacts/labelled-border-inspection/` saves original
evidence, actual SVGs and traces, numeric checks, fixed frames/regions, tools,
36 whole-picture pairs and 1,944 local observations. Every case has original-root
and expanded-camera views at 1x/4x over transparent/white/black backgrounds.
Original-root views preserve both SVGs' cropping. Expanded views diagnose drawing
instructions under a shared camera; they do not replace the original comparison.
Unchanged reference captures must repeat exactly.

Read the fresh `report.json` referenced and hashed by `latest.json`, then open
`agent.contactSheet` and a ranked region's paired PNGs. The report links each
region to native identity, public source span and scene/SVG operation. The local
`index.html` viewer adds whole-picture sheets and paired enlarged crops. Raw RGBA
metrics, differences, alpha differences and overlays remain inspectable even
when crops are truncated for presentation.

Request the period crop with:

```text
node tools/TikzVisual/inspect-labelled-borders.mjs --crop-region lines:glyph-6
```

The report records `presentation.requestedRegion` explicitly. Crop selection
affects saved presentation only. All three cases, 36 views and
1,944 local observations still execute. The coverage validator checks the
independently reconstructed cameras and complete view/region identities, repeated
captures, metrics, artifact links, crop pixel lattice, requested crops and agent
guidance. Corrupted/incomplete reports fail its 27 controls. Captured build logs remove local
absolute paths while preserving public URLs.

Successful inspection means reproducible artifact production with explicit
numeric state. It retains `overallVerdict: pending` and
`imageConformanceClaim: false`. The
[native-ink primary trial](../TikzVisual/LABELLED-BORDER-INK.md) and
[combined research trial](../TikzVisual/LABELLED-BORDER-COMBINED-TRIAL.md)
keep their historical roles. Current output has a separate
[portable eight-gate admission](../TikzVisual/LABELLED-BORDER-CACHE.md) with
independent primary/PDF/native-page policies and fresh visible-defect controls.
No existing shape, unlabelled-border or dash allowance applies.

```text
node tools/TikzVisual/compare-labelled-border-conformance.mjs
```

Use its exact completed report and saved-image checker as described by the
portable workflow. These commands are configured in CI; a hosted claim still
requires evidence from the corresponding executed job.
