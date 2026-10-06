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

The trial remains unapproved and reports overall conformance as pending.
A reviewed immutable primary snapshot with provenance controls, independent
PDF image admission and defect controls, and label/node interactions remain
required. Raw images and recorded PDFs alone do not establish conformance.
