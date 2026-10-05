# Node interaction experiment

Two trusted, authored fixtures under `tests/Fixtures/Nodes/` exercise nine
state/paint nodes and seven transformed nodes. They extend the actual-node
oracle without changing the established rectangle fixture or its tolerance.
These default-color cases retain diagnostic failures; their full visual gates
do not yet pass. The separate reviewed RGB/ink route is described below.
The separate `--profile rgb` manifest adds a 25-node palette fixture and retains
the same state/transform sources. Default-color references remain unchanged.

The dedicated wrapper records native text dimensions, font-relative defaults,
separation, line width, sixteen anchors, background corners, and the text frame
immediately before PGF inserts its assembled text box. Native DVItype supplies
glyph fonts, slots, and local integer positions. PGF soft paths supply the
painted geometry. Original SVG elements independently supply glyph colors,
opacities, clips, and paint order.

Reference generation compiles plain and instrumented SVG routes, then an
ordinary PDF route with the same font setup. It requires unchanged visible SVG
(definition order alone may differ), identical TeX boxes, and identical native
node layouts/frames across SVG and PDF. It pins executable and font identities,
records TeX inputs, and retains the original SVG/PDF, native trace, measurements,
and 96/384-DPI PDF pages. Only manifest-selected repository sources may
enter TeX; neither live command accepts submitted TikZ.

```text
dotnet run --project tools/TikzReference -c Release -- generate-node-interactions
dotnet run --project tools/TikzReference -c Release -- verify-node-interactions
dotnet run --project tools/TikzReference -c Release -- compare-node-interactions
dotnet run --project tools/TikzReference -c Release -- calibrate-node-interaction-pdf
dotnet run --project tools/TikzReference -c Release -- compare-node-interactions --profile rgb
dotnet run --project tools/TikzReference -c Release -- calibrate-node-interaction-framing --profile rgb --case transforms
dotnet run --project tools/TikzReference -c Release -- compare-node-interactions --profile rgb --framing ink
dotnet run --project tools/TikzReference -c Release -- calibrate-node-interaction-svg --profile rgb --framing ink
```

Every command accepts `--case state-paint` or `--case transforms`. Comparison,
verification, and PDF experiments also accept `--out artifacts/...`. Generation
alone writes the explicit baseline locations. Verification regenerates in an
ignored directory and compares measurements, visible SVG, PDF raster pages,
and pinned tool/input identities without overwriting baselines. Cached commands
validate hashes and the native trace and need neither TeX nor Poppler.
Every command also accepts `--profile native` (the default) or `--profile rgb`.
The RGB profile additionally admits `--case colors`, uses the hashed
`rgb-color-profile.tex` setup, and writes to separate baseline/artifact folders.
Live RGB verification passes for all 41 nodes without rewriting references.

The candidate comparison uses the public API, preserves its source-aware scene,
and emits the ordinary agent inspection bundle under
`artifacts/node-interactions/<case>/`. It compares native boxes/defaults and local
glyph positions exactly, global geometry at the manifest's provisional 0.02 CSS
pixel bound, exact frame coefficients, 1e-9-CSS-pixel native frame/anchor/glyph
origins, and paint/order/clip identities.
Primary image comparisons force exact pixels at 1x/4x over transparent, white,
and black backgrounds. These exact commands apply no raster allowance; the
rectangle fixture's allowance cannot be applied here.

The reviewed [primary interaction route](../TikzVisual/INTERACTION-PRIMARY.md)
now covers all three RGB fixtures with independent ink framing and required
global/regional gates. It always selects RGB/ink, accepts only `--case` and
`--out`, and preserves the raw exact comparison before applying its own pinned
policy. Its cached command needs no TeX or Poppler:

```text
dotnet run --project tools/TikzReference -c Release -- compare-node-interaction-primary
```

All 5,273 native numeric and 1,044 regional checks pass. The ordinary PDF route
remains an independently measured experiment without an approved allowance.

The PDF experiment never invokes candidate parsing, layout, glyph resources,
or SVG emission. It copies the original oracle geometry and rebases only the
known wrapper translation, preserving original dimensions, paths, outlines,
paint, and clips. It renders on the measured PDF page lattice, without fitting
or resampling the PDF. Both primary and PDF gates force exact pixels so raw
cross-renderer errors remain measurement results. Output lives under
`artifacts/node-interaction-pdf-calibration/<case>/`, including hashed
`calibration-evidence.json`. No policy or baseline is written by this experiment.
An empty numeric-check list in the PDF/framing representation experiments makes no
candidate layout claim; the independent measurements remain in `metrics.json`.

The additional [CSS experiment](INTERACTION-SVG-CALIBRATION.md) reconstructs
all paths, clips, glyph frames/positions, paint, and order using only native
PGF/DVI measurements and original outlines. Its original-driver and independent
ink-frame routes each have three variants per case, 4,260 passing
serialization/containment checks, versioned snapshots, and raw primary/PDF results.
The ten new containment tests reject overflow, missing clips/glyphs, and
unhandled transforms. These are independent measurement results, with no
policy changes. The separately reviewed primary route consumes their pinned
evidence; PDF allowances remain unapproved.

Current findings:

- Under the [declared RGB profile](../../docs/COLORS.md), all 5,273 numeric
  checks pass across state/paint, transforms, and colors. The palette uncovered
  PGF's path-component conversion (integer sp divided by 256) versus conventional
  8-bit RGB text-special rounding. Production emission now follows both routes;
  every palette path and glyph color agrees exactly with its independent oracle.
  RGB selection preserves the original native layout, frames, and glyph positions.

- The transform case passes all 953 numeric checks. Nonidentity node frames
  select PGF's NE-to-NW-to-SW-to-SE rectangle construction; the identity linear
  frame uses SW-to-SE-to-NE-to-NW. This matters for subsequent dash support and
  phase, even when a solid closed border looks the same.
- Rotated/sheared rectangle ink now includes miter tips with the declared join
  and miter limit. PGF picture bounds remain separate. The candidate natural
  canvas is about 0.735 CSS pixel taller than the original transform SVG crop.
  The original driver crop cuts the sheared border's tip; ordinary PDF retains
  it. The native-dimension/raster experiment continues to report failure.
  A separate oracle-only framing experiment intersects the offset native polygon
  edge lines, respects the original join/miter limit and clip bounds, and expands
  only the original viewport to contain that measured ink. It invokes no candidate
  stroke helper, outline resource, or SVG writer. `--framing ink` explicitly uses
  this derived reference, retains `original-driver.svg`, and records its hashes,
  geometry contributions, and source in `reference-frame.json`. The candidate's
  native dimensions agree within 0.0001 CSS pixel. Remaining primary precision
  differences are now at most 2/255 after the finite-transform repair. The
  independent experiment measured up to 32/255 across fixed perturbations;
  the reviewed primary route uses that independent evidence plus every local
  region. Driver framing remains the exact command's default, and its original failure stays
  reproducible. The independent framing command also records both SVGs against
  PDF on the native page lattice; exact gates intentionally mismatch.
- State/opacity/paint-order/clip measurements agree except for seven glyph
  color checks. In this default color setup, PGF's SVG path route emits magenta
  as RGB `#ff00ff`; a text box emits a CMYK DVI color special that dvisvgm maps
  to `#ec008c`. The production converter currently uses RGB. Ordinary PDF also
  exposes color-model differences for the cyan fills. These original-profile
  mismatches remain visible. The RGB profile is the explicit compatibility
  contract, with separately pinned
  references and a broad palette test; it does not rewrite the default-color
  baseline or claim ICC-managed CMYK fidelity.
- Exact PDF experiments mismatch as expected. Raw primary/PDF errors, cameras,
  and paired images are retained. No cross-renderer allowance is approved.

Exit codes follow the main harness: 0 pass, 1 measured mismatch, 2 harness error,
3 candidate conversion error. A PDF calibration exit of 1 is a completed
measurement run, not a conformance pass. The scoped primary route now passes
oracle-only production-coordinate calibration, localized defect mutations,
and the reviewed framing contract. Full node fidelity still requires separately
reviewed PDF evidence. The independent
stroke-frame helper currently admits only the trusted rectangle polygons and
ordinary butt-capped lines; its clip-bound intersection is for these fixtures,
not a general SVG ink-bounds implementation. Ordinary .NET tests cover
the measured geometry/layout/order/opacity/clip quantities and the miter repair;
they do not conceal the retained exact comparator failures.

The separate [combined RGB/ink PDF policy](../TikzVisual/INTERACTION-PDF.md)
now admits all three trusted RGB fixtures. `compare-node-interaction-pdf` makes
a fresh public conversion, preserves exact/primary reports, and requires all
5,273 native numeric checks, natural dimensions, 1,044 primary regional checks,
and 354 region/scale checks per SVG side against ordinary PDF. Its separately
pinned limits come from the independent page-coordinate calibration and
viewport controls. Forty-one policy/failure checks pass; both commands join
required cached visual CI. Original default-color/driver-crop failures and
exact experiments remain unchanged. Wider node/label/arrow families and hosted
execution still need their own evidence.
