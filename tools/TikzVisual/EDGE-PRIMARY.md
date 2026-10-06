# Native straight-edge primary calibration

This development experiment calibrates the fixed five-fixture straight `to` and
`edge` corpus. It uses .NET 10, Node and the pinned Playwright/Chromium browser.
It invokes no converter, TeX or PDF process and cannot approve image conformance.

```text
node tools/TikzVisual/edge-primary-self-test.mjs
node tools/TikzVisual/calibrate-edge-primary.mjs
```

The preselected native representation retains shortest zero-to-five-decimal
TeX-point dimensions that recover the original integer scaled points, a declared
TeX-point-to-CSS transform, six-decimal glyph matrices/paint and a six-decimal
native picture/ink root. Native DVI positions and original glyph outlines supply
text; production code and candidate errors supply no calibration data.

Original PGF SVGs remain unchanged. One separately labeled derived-driver SVG
restores `L0 205` after the clipping fixture's original `M0 205`. Both native
backends retain the identical move and line. Effective shipped state specifies
an opaque blue three-TeX-point round cap; construction state has a different cap.
The correction validates those quantities and the exact original move, changing
only that drawing element's path data. Ordinary PDF retains the dot. Original
SVG comparisons remain diagnostic and are never relabeled as a match.

The primary matrix covers natural and expanded framing, 1x/4x, transparent,
white and black backgrounds. Cameras, dimensions and local path/endpoint/glyph
regions come from native evidence. No alignment is fitted. Each unchanged input
repeats exactly, and a separate complete replay must reproduce measurements and
PNG hashes. Limits are the selected independent observation in each view/region;
only foreground means round upward to 1e-9 channel units. Other representation
extrema and candidate images cannot widen them.

Thirteen image-only defects exercise missing branches, quarter-pixel shifts,
stroke widths/colors/dashes/caps, clips, the dot, a period/ligature, label baseline,
opacity and root cropping. Numeric gates are bypassed. A visible defect must
fail its named native region. Declared black-on-black views must have identical
actual PNG hashes to their unchanged view, rather than being counted as detected
losses. The full scale/background matrix remains present.

Separate SVG paint probes exercise a faint stroke, faint period and a stroke
below raster quantization. They alter paint on both independent SVGs and derive
their own per-opacity limits before testing removal. These are controlled
renderer experiments, not new native TikZ fixtures or proof of frontend opacity
compatibility. Visible losses must fail their target regions. Declared invisible
losses must preserve actual PNG hashes. This distinction prevents other ink in
a compound region from being mistaken for the target's visibility.

Every observation retains full reference/actual PNGs, raw/alpha/amplified
differences and overlays. White 1x views include contact sheets, and two selected
paired crops are presentation only: all native regions remain measured.
`report.json` links the inputs, regions, measurements, evaluations and images;
`index.html` provides a static gallery. Failed GUID directories preserve the
original sources, partial observations and error. A stale successful run never
overrides the current incomplete run.

After successful calibration, select its exact completed report for checking:

```powershell
$edgePrimaryRun = Get-Content artifacts/edge-primary-calibration/latest.json -Raw | ConvertFrom-Json
if (-not $edgePrimaryRun.completed) { throw 'Native primary calibration is incomplete.' }
node tools/TikzVisual/check-edge-primary.mjs ('artifacts/edge-primary-calibration/' + $edgePrimaryRun.report)
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
```

The checker recovers glyphs afresh, reconstructs reference/control SVGs and
limits, validates native/source/artifact identities, checks complete coverage
and independently re-decodes saved PNG metrics. It also rejects corrupted report
roles, limits, targets, visibility, coverage and links. Completed calibration and
checking remain unapproved. Separately qualified PDF gates, a public-converter
combined trial, reviewed immutable admission and hosted CI execution remain
required. Existing admitted profiles and runtime dependencies are unchanged.
