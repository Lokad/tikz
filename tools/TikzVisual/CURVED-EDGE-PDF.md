# Native curved-connection PDF qualification

```text
node tools/TikzVisual/curved-edge-pdf-self-test.mjs
node tools/TikzVisual/calibrate-curved-edge-pdf.mjs
node tools/TikzVisual/check-curved-edge-pdf.mjs artifacts/curved-edge-pdf-calibration/run-<GUID>/report.json
```

The synthetic controls need Node and the pinned Playwright/Chromium renderer.
Calibration and checking also need .NET 10 for an independent DVI/TFM reader.
These commands launch no converter, TeX or PDF process. Only tracked native
evidence and the declared development environment are required.

The two SVG routes are the unchanged original driver and the preselected
native-semantic encoding from [primary calibration](CURVED-EDGE-PRIMARY.md).
No curved driver correction is applied. Both routes retain separate PDF
limits derived without candidate input. The original ordinary TikZ PDF pages
remain fixed, with page origins and dimensions measured in native scaled points.
No image alignment is fitted.

Each of five cases measures natural/expanded framing at 1x/4x on white paper.
All 389 native path, cubic-sample, endpoint, glyph and clip regions remain
measured, with independently outward-rounded integer crops. Forty initial
observations and forty complete replays establish the selected limits and
repeatability. Raw PDF/browser errors remain visible. Exact regional SVG RGB
ink sums supplement the generic PDF metrics; this strict representation check
does not establish identical PDF pixels.

Padding and eight signed root-boundary changes, each by four native scaled
points, must preserve drawing instructions and registered expanded-page
samples at both resolutions. These 180 controls use absolute page coordinates.
Changing root dimensions cannot silently move or rescale the drawing.

Eighteen image-only defects exercise bent geometry, control points, oblique
shifts, connection paint, dashes, clipping, caps, compound fill, node outlines,
period/ligature, baselines and natural-root cropping. Numeric gates are bypassed.
PDF-grid visibility is declared separately from primary SVG visibility. Every
visible fault must fail its named native region; an invisible fault must retain
the unchanged SVG page samples. Every required view stays in the report.

Removing the rectangle clip is invisible in both natural PDF views, including
4x; all expanded views must reject it. Both faint curve and faint period losses
are visible in all four PDF-grid views. Subquantum curve loss is invisible in
all four. These observations are specific to this page placement and renderer.

Three controlled paint probes measure faint-curve, faint-period and subquantum
losses on the PDF page grid. Their unchanged SVGs have separate exact regional
ink expectations before removing the target. Ordinary opaque PDF remains the
reference page: these probes qualify SVG renderer sensitivity, and establish
no additional native opacity compatibility or PDF fidelity policy. Raw PDF
errors are retained even when mark removal improves them.

The complete matrix has 174 observations: forty calibration, forty replay,
seventy ordinary-defect and twenty-four paint-probe views. The checker obtains
glyphs afresh, reconstructs 124 SVGs including viewport variants, replays all
180 viewport controls, and independently decodes full pages to recompute 13,714
whole/local measurements and 82,284 RGB sums. It also checks 2,610 saved crop,
raw-difference, amplified-difference and overlay panels pixel by pixel against
the full pages, including nearest-neighbor enlargement. Corruption controls
reject wrong roles, coverage, cameras, limits, ink, visibility and summaries.

Each completed GUID directory retains full SVG pages, PDF/SVG whole pairs,
selected local crops, raw/amplified differences, overlays, a local `index.html`,
source captures and native provenance. Check the exact completed report; retain
failed/incomplete runs and never substitute an older successful result.

These commands produce independent unapproved calibration evidence. Public
combined trials, immutable admission, wider interactions and hosted/release
verification remain required. Existing straight-edge profiles and production
dependencies are unchanged.
