# Public straight connection comparison

Run the fixed public numeric comparison from the repository root:

```text
dotnet run --project tools/TikzEdgeComparison -c Release
```

The command requires .NET 10 and checked-in evidence; it needs neither TeX nor
a browser. It pins the native snapshot independently, validates all 116 native
artifacts and nineteen reference sources, then converts the five trusted
fixtures using the public entry point. Independent native soft paths establish
geometry; actual shipped SVG/PDF records establish effective paint and physical
order. The retained original DVI/TFMs establish glyph metrics and positions.
It removes only redundant native moves without subsequent drawing segments;
zero-length lines remain semantic segments.

| Fixture | Numeric assertions |
| --- | --- |
| continuation | 441 |
| styles | 462 |
| coordinates | 435 |
| nodes | 957 |
| clipping | 290 |

The GUID output under `artifacts/edge-numeric` contains the emitted SVG,
resolved scene with source spans/element IDs, individual assertions and native
glyph evidence. Its report captures production code/resources, tool sources,
reference artifacts, options, converter assembly hash and framework references.
It verifies source/input stability again after conversion. A custom `--out`
must select a fresh directory inside `artifacts/`. Failures retain their report
and partial outputs. Fourteen ordinary test controls reject changed candidate
geometry, missing edges, reordered paint, color/width/alpha/dash/cap, clipping,
picture bounds, glyph placement/order and node frames.

The native snapshot keeps its historical source hashes. The same revision
validator used by `TikzEdgeOracle` accepts only three separately pinned reader
updates; fixture, wrapper and artifact equality remains required. Current
comparison sources and the revision record belong to the fresh report.

For paired images and an HTML inspection viewer:

```text
node tools/TikzVisual/edge-candidate-inspect.mjs
```

This requires the existing pinned development Playwright/Chromium installation.
It owns a fresh numeric run and validates the frozen native evidence again.
The report selected by `artifacts/edge-candidate-inspection/latest.json`
identifies a completed GUID directory. Its `index.html` links TikZ source,
native and candidate SVG, original PDF, measurements and source traces.
Full native pages and common integer crops at 1x/4x retain reference/candidate
contact sheets, raw/amplified differences and overlays. Native-size zoom is
available. Actual source spans map physical path order to native construction
IDs and emitted SVG element IDs. All viewer links and captured files are checked.

Registration uses the measured native page origin and declared TeX-point,
big-point and CSS-pixel conversions. Candidate natural viewBox coordinates are
placed at that physical origin. No fit, translation search or image matching
adjustment is applied. Reports measure decoded whole/crop and foreground error;
they assign no acceptance thresholds. Numeric success is required to complete
an inspection run; the overall image verdict remains pending.

The coordinate fixture has zero observed primary-page differences at 1x/4x.
Other fixtures retain raw differences. A degenerate round-capped edge paints a
blue dot in ordinary native PDF and the candidate SVG, while original native
SVG reduces the path to a move and omits it. Independent framing/raster
qualification and image-only defect controls now supply a separate
[fixed combined admission](../TikzVisual/EDGE-CONFORMANCE.md). This inspection
keeps its original diagnostic role; profiles for other corpora grant no allowance.

Everything here is development-only. The runtime assembly references .NET
framework assemblies only; no TeX, browser or comparison code is packaged.

For the prospective combined image gates, use the
[public trial](../TikzVisual/EDGE-TRIAL.md). It validates four explicitly selected
native qualification/checker reports, owns fresh conversion and image-only
defects, and writes source-attributed paired images under a new GUID directory.
Its independent checker reconstructs the SVG mutations and frames, reconverts
and remeasures saved samples. The earlier original-driver gallery remains
diagnostic. A completed combined trial still awaits immutable admission.
