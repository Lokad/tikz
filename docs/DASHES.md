# Dash semantics and grounding

The current prototype handles solid, dashed, dotted, dashdotted, and
dashdotdotted styles, their dense/loose variants, and the corresponding
spaced aliases. Custom alternating on/off lengths and dash phase are
supported, including empty and odd-length patterns and zero-length on
segments with positive gaps. Negative lengths and all-zero patterns fail
with source diagnostics.

Dash options follow measured PGF 3.1.11a ordering. The configured pattern
and phase are separate from the last emitted graphics state. A phase
option reapplies the configured pattern. Solid emits an empty pattern
without erasing the configured phase. Dotted styles resolve the live
line-width register after the path options; dashdotted styles capture
the width when their dash command is scheduled. Reapplying the pattern
can capture a later width. Inherited painted patterns remain unchanged
by a child width option until a dash or phase option reapplies them.

These rules have independent native evidence for the forty horizontal
lines in [dashes.tikz](../tests/Fixtures/Dashes/dashes.tikz). They cover
style/option order, width registers, phase, physical literals, inline
options, and scope restoration. General TeX register expansion is outside
the supported profile.

## Independent evidence

[TikzDashReference](../tools/TikzDashReference/README.md) compiles the
trusted fixture with latex/dvisvgm and ordinary pdfLaTeX. Both drivers
produce the same integer scaled-point dash, phase, width, and picture-box
records. Plain and probed output is byte-identical for the SVG, PDF, and
the PDF rasters at 96 and 384 dpi. A measured page position registers
the PDF independently of candidate output.

An external snapshot pins the original artifacts, trusted fixture and
generator sources, tool identities, and recorded TeX inputs. Cached
validation needs no TeX installation:

    dotnet run --project tools/TikzDashReference -c Release -- check-cached
    dotnet run --project tools/TikzDashComparison -c Release

The public comparison executes 927 numeric checks, including serialized
dash lengths and phases, line geometry, caps, and root dimensions. Its
source spans and SVG element IDs link each line back to its case.

## Image trial and inspection

With the pinned development browser installed, run from the repository root:

    node tools/TikzVisual/trial-dashes.mjs

The command creates a fresh GUID directory under artifacts/dash-image-trial.
Its latest.json pointer identifies and hashes report.json; index.html links
paired images, amplified differences, overlays, and contact sheets.
The report includes exact tool-source copies, numeric evidence, source
mapping, cameras, regions, artifact hashes, and the focused rerun command.
An agent can open the PNG paths directly without using the HTML viewer.

Two candidate-independent SVG representations distinguish integer native
widths from the original SVG driver's printed width precision. The trial
derives provisional limits from those representations before running the
public converter. It checks natural/expanded framing at 1x/4x over
transparent, white, and black backgrounds, with all forty local regions.
Seven image-only defects are rejected at both scales: missing pattern,
wrong phase, missing line, doubled width, shifted line, reduced opacity,
and root cropping.

The local trial passes, and all twelve candidate captures equal the
independent printed-width representation. Small differences remain
against the original SVG. This is an unapproved primary trial, with no
pixel-identity claim against the original oracle.

Sixteen separately registered SVG/PDF observations retain raw differences
for the original driver, both independent representations, and the
candidate at both scales and frames. Some pattern boundary distances
reach four CSS pixels. Repeat captures are exact, and there is no changed
ink outside the declared whole region. A reviewed PDF policy and its
defect controls remain pending; no other corpus's tolerance applies here.

The separate geometry corpus below adds numeric evidence for curves,
compound paths, closed shapes, transforms and clipping. Labels and nodes,
broader interactions and reviewed image policies remain. Neither corpus
nor the trial establishes general dash conformance.

## Cache controls and PDF instruction investigation

The independent cache validator also has thirty executable controls:

    dotnet build tools/TikzDashReference -c Release
    pwsh -NoProfile -File tools/TikzDashReference/check-cached.ps1

Two positive copies pass and twenty-eight missing/tampered/rehashed copies
are rejected. Each check uses a disposable repository subset and PATH
empty; the real snapshot, artifacts and pinned sources remain unchanged.
This tests cached integrity, separately from image-policy admission.

The fixed PDF corpus has an oracle-only vector/raster diagnostic:

    node tools/TikzVisual/dash-pdf-vector-self-test.mjs
    node tools/TikzVisual/inspect-dash-pdf.mjs

The decoder supports only this geometry-only reference's operations and
has twenty-two malformed-PDF controls. Its interval analysis uses integer
grids so floating-point remainders cannot invent terminal fragments.
The full command validates the cache, retains original PDF instructions,
and compares native state with PDF state: 444 checks pass. Dash dimensions
and coordinates must round-trip to exact converted scaled-point integers;
page dimensions and position have their separate primitive serialization
budgets. These numeric budgets authorize no image allowance.

PGF's PDF backend uses the finite factor 0.99627, represented in TeX as
65292/65536, followed by scaled-point truncation and shortest decimal
serialization. Its emitted values differ from SVG's physical unit ratio.
For dense dashes, the printed PDF pattern leaves a final 0.00008 CSS-pixel
fragment where the original SVG pattern ends in a gap. Dense dots have
fifty original-SVG intervals versus fifty-one native/PDF intervals,
including a tiny terminal fragment. Interval counts are geometric
observations; they are distinct from thresholded raster component counts.

Rendering reconstructed PDF instructions through the SVG browser retains
the same four-CSS-pixel maximum boundary difference against the original
PDF raster. Finite conversion alone does not explain those raster errors.
The fresh GUID bundle under artifacts/dash-pdf-vector contains eight raw
observations, exact tool copies, paired crops/contact sheets, interval
records and numeric evidence. Its report records both independently
measured and PDF-printed origins; no image fitting or candidate is used.
The rasterizer's handling of thin strokes and subpixel terminal fragments
still needs investigation before adopting a PDF policy.

## Curved, closed and clipped dash paths

[TikzDashGeometryReference](../tools/TikzDashGeometryReference/README.md)
has a separate, independently authored sixteen-paint/three-clip corpus.
It records exact native path coordinates and cubic controls along with dash
state. Plain and probed DVI/SVG, PDF and both PDF rasters are byte-identical;
both drivers agree on the integer path records and picture box. Fresh
nonoverwriting live verification passes. No older image allowance applies.

    dotnet run --project tools/TikzDashGeometryReference -c Release -- check-cached
    dotnet run --project tools/TikzDashComparison -c Release -- geometry
    node tools/TikzVisual/dash-geometry-image-self-test.mjs
    node tools/TikzVisual/inspect-dash-geometry.mjs

The public numeric comparison passes 1,090 checks for normalized path segments,
control points, dash arrays/phase, width, stroke/fill, caps/joins, opacity,
clip bindings and picture bounds, including the emitted SVG. Geometry agrees at the native integer
scaled-point grid. Eight malformed-record controls reject incomplete paths.
The initial run exposed 38 incorrect circle/ellipse/quarter-arc control
coordinates. The converter now uses PGF's finite quarter-curve coefficient
36195/65536 and scaled-point multiplication rather than ideal real arithmetic.
The existing nine geometry conformance cases still pass unchanged.

The browser command fixes cameras and sixteen regions from native evidence
before invoking the converter. It preserves original paths and independently
reconstructs SVG from native integer geometry, native dash state and the
original driver's printed paint width. Natural/expanded framing, 1x/4x and
transparent/white/black backgrounds give 24 views and 384 local observations.
Repeated original captures are exact. There are no image limits in this route.
Six unchanged-pair and six negative controls test clipped rendering and reject
missing clipping, unresolved/external clips, executable attributes and duplicate IDs.

Fresh GUID bundles under artifacts/dash-geometry-images retain the source,
numeric report, complete scene/paint trace, reference snapshot, exact tool
copies and hashes. report.json and index.html expose paired images, raw and
amplified differences, overlays and source-linked regions. Focused crops
include the filled rectangle, circle with continuation and oblique ellipse.
latest.json identifies and hashes the completed report.

The original CSS-coordinate representation retains full-channel differences
and a 0.75 CSS-pixel boundary displacement at dashed rectangle corners.
Keeping native path units through rasterization resolves that discrepancy.
The separate, reproducible experiment compares seven candidate-independent
representations before running the public converter:

    node tools/TikzVisual/trial-dash-path-units.mjs

It checks six/twelve-decimal and short native-point representations, with
both native and original printed widths, across all sixteen paths and three
clips. There are 3,054 serialization checks, 96 primary views and 1,536 local
observations. The short decimals must restore the exact native scaled-point
integer; this numeric rule grants no image allowance.

The SVG writer now emits geometric paths and clips in native TeX points
under a physical scale, with matching width, dash and phase units. It uses
short decimals for integer-grid quantities and twelve decimals for values
between scaled points. Root dimensions, glyph placements and public bounds
use CSS pixels. The separate emitted-SVG reader verifies native coordinates,
dimensions, physical transforms, paint/clip state and root framing; ten
malformed-primitive controls prevent invalid output becoming numeric evidence.

The full corpus matches the original expanded-frame oracle exactly at 1x.
At 4x, one pixel differs by one channel level. Natural-frame observations
retain 14/24 changed pixels at 1x/4x over white, with maximum channel errors
2/4 and zero measured edge displacement. This evidence covers these concrete
views. All nine existing geometry conformance cases, the 22-node SVG gate,
and the admitted RGB/rectangle-border primary/PDF gates still pass their
unchanged profiles. No original reference or allowance was modified.

The prospective primary trial is a separate development command:

    node tools/TikzVisual/trial-dash-geometry-primary.mjs

It fixes the camera and sixteen local regions from native evidence, then
measures eight representations before invoking the converter. These combine
native picture bounds or native control hulls expanded by the original
printed pen width, printed or native stroke widths, and physical scaling on
a group or individual paths. The two roots agree within half a scaled point
in all four extents and both dimensions. Clipped paths do not contribute to
the reconstructed picture box, following the independently observed PGF
picture-size behavior. Each representation preserves native path integers;
the trial performs 4,072 serialization checks.

Limits are the component-wise maxima of oracle-only observations in each
exact region/frame/scale/background, with explicit upward rounding of the
foreground mean. No candidate measurements select a camera or allowance.
Every representation must replay successfully. The public candidate then
requires all 1,090 numeric checks and all twelve primary views.

Nineteen visible image defects bypass numeric gates and must be rejected at
both 1x and 4x in their affected regions, over white with natural/expanded
frames. Root cropping uses the natural frame. Defects cover pattern/phase,
captured width, cubic controls, subpaths, closure and continuation, caps,
joins, physical transforms, faint strokes and fill, clips, and dimensions.
Thirteen coverage/consistency controls reject missing or duplicate views,
missing or chosen regions, nonfinite measurements, lost components, empty
numeric evidence, contradictory summaries, and attempts to override failed
numeric/frame gates with matching images.

Independent visibility controls retain two limits of raster comparisons.
The filled rectangle has dash gaps at its corners, so changing its join
produces identical sampled pixels. An additional one-percent-opacity
0.4pt-wide, 4pt-long line disappears at 1x and is detected at 4x. These are
proved against independent geometry before conversion, with exact encoded
PNG comparisons. A visible join on the triangle and a one-percent-opacity
1pt-wide line separately test rejection at both resolutions. Semantic
differences still require numeric checks even when images agree.

Fresh GUID bundles under `artifacts/dash-geometry-primary-trial/` retain
original, independent, candidate and defect SVGs; tool source copies;
numeric/scene evidence; fixed regions; raw and amplified differences;
overlays; enlarged crops; and a local viewer. The report links candidate
regions and defects to their source spans and SVG elements. `latest.json`
hashes the completed report. Earlier failed policies, stale-assembly guard
failures, and resolution-dependent defect experiments remain inspectable.

The retained research trial remains unapproved. A separately guarded primary
policy now consumes checked-in oracle-only calibration:

    node tools/TikzVisual/compare-dash-geometry-primary.mjs
    node tools/TikzVisual/dash-geometry-primary-self-test.mjs

`chromium-153-dash-geometry-primary-v1` is limited to these sixteen paints and
three clips. The loader pins the native and calibration digests in code,
validates original sources/artifacts and all calibration/guard tool hashes,
reconstructs geometry, frames and regions from the original evidence,
recomputes every allowance from the 96 independent observations, validates
96 replay views, and rechecks all independent visible-defect and visibility
controls. It requires the exact browser binary, Node/Playwright versions,
platform/architecture, launch state and viewport. OS release is recorded;
hosted execution still needs verification.

The fresh public comparison passes all 1,090 native checks, six frame checks,
twelve whole-picture views and 192 local comparisons. Its primary label is
`calibrated-primary-match`, retaining the raw original-SVG differences. All
twelve candidate PNGs also match the independent per-element reconstruction
exactly. The report sets the primary claim separately and leaves the combined
image/PDF claim pending. All sixteen regions have paired enlarged crops and
source-span/element links, including regions with zero measured error.

The controls exercise missing/changed evidence, modified guard code,
consistently rehashed unreviewed calibration, widened limits, fitted cameras,
selected/dropped regions or views, renderer mismatches, incomplete or
candidate-derived calibration, accepted or untargeted defects, incorrect
visibility, and failed numeric/frame gates with matching pixels. Nineteen
fresh candidate image defects bypass numeric gates and must fail in every
affected view and target region. They use the immutable allowances.

Explicit oracle-only reference work is separate from comparison:

    node tools/TikzVisual/calibrate-dash-geometry-primary.mjs
    node tools/TikzVisual/promote-dash-geometry-primary.mjs

Calibration invokes no converter and reads no production resource or
candidate bounds. It preserves 274 views and their immutable tool/input
provenance under `artifacts/dash-geometry-primary-calibration/`. Promotion
requires its independently reviewed digest to be updated explicitly in the
guard; ordinary comparison cannot write or silently refresh a baseline.
Previous failed experiments and the original native oracle remain unchanged.

The primary policy does not admit ordinary PDF rendering, labels, nodes,
other fixtures or future library behavior. Independent PDF image admission
and defect controls, and label/node interactions, remain required before
combined conformance can pass.

The independent PDF investigation now retains the complete geometry corpus:

    node tools/TikzVisual/dash-geometry-pdf-vector-self-test.mjs
    node tools/TikzVisual/inspect-dash-geometry-pdf.mjs

Its bounded reader accepts only the trusted fixture's small PDF grammar. It
preserves original operations for inspection and reconstruction while using
the oracle's normalization of consecutive/unpainted moves for numeric checks.
All line/cubic coordinates, widths, dash items and phases recover PGF's finite
PDF conversion. Caps, joins, fill/stroke opacity, clip chains, page size and
the independently measured origin are also checked: 446 quantities and 35
positive/negative controls. This is a diagnostic reader, not a general PDF
interpreter or a runtime dependency.

The camera and sixteen local regions come from native measurements before
rendering. Original SVG, eight independently grounded SVG representations,
and the literal PDF instructions reconstructed as SVG are registered on the
PDF page at 1x and 4x, with natural and expanded frames. Fifty-four viewport
controls show exact pixels when each source's unchanged drawing is padded or
its root boundaries are perturbed by four scaled points. The investigation
retains 40 whole-picture and 640 local observations, exact repeat captures,
raw/amplified differences, overlays, paired crops and tool/input hashes under
`artifacts/dash-geometry-pdf/`. Every local region has inspectable image pairs.

Literal PDF instructions still produce substantial cross-renderer errors,
including the odd-length pattern with negative phase. These observations
grant no allowance. PDF image admission needs an explanation of this behavior
and independent defect sensitivity before a combined gate can pass. Primary
SVG admission and its immutable limits remain unchanged.

An explicit local diagnosis also compares the two installed PDF rasterizers:

    node tools/TikzVisual/inspect-dash-geometry-pdf-rasterizers.mjs

First run the ordinary-PDF investigation above. This research command also
requires pdftoppm/pdftocairo 24.04.0 and the ignored upstream source directory
`external/poppler-24.04.0/`. Download the [official Poppler 24.04.0 archive](https://poppler.freedesktop.org/poppler-24.04.0.tar.xz)
there as `poppler-24.04.0.tar.xz`; its SHA-256 must be
`1e804ec565acf7126eb2e9bb3b56422ab2039f7e05863a5dfabdd1ffd1bb77a7`.
Extract its `splash/Splash.cc`, `poppler/SplashOutputDev.cc` and
`utils/pdftoppm.cc` into the corresponding paths below that directory.

The diagnosis records upstream sources, exact binary hashes and commands,
unchanged original PDF rasters and repeat captures. Four diagnostic PDFs
preserve all graphics instructions while changing only the spelling of the
odd dash pattern. The unchanged-instruction wrapper must reproduce the
original pixels. Sixteen equivalence controls verify both scales: Cairo
preserves pixels under all spellings; Splash changes placement when the odd
array is explicitly doubled. The upstream Splash source normalizes phase
over the supplied array sum, which is half the complete odd-array cycle.
The [SVG stroke-dashing rule](https://www.w3.org/TR/SVG2/painting.html#StrokeDashing)
uses the repeated even array.

At 4x, explicit repetition reduces this region's Splash/SVG mean error from
121.215 to 10.362 channel levels; its measured edge displacement falls from
about 2.016 to 0.25 CSS pixels. Cairo's unchanged original PDF has mean error
7.151 and displacement 0.25 in that region. Other measured raster/topology
differences remain. The fresh diagnosis bundle owns all observations and
paired crops; it never rewrites references or selects a tolerance. This
isolates a reference-renderer discrepancy and grants no Cairo, PDF or combined
admission. The converter's dash semantics and primary profile are unchanged.
