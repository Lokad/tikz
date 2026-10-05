# Node interaction experiment

Two trusted, authored fixtures under `tests/Fixtures/Nodes/` exercise nine
state/paint nodes and seven transformed nodes. They extend the actual-node
oracle without changing the established rectangle fixture or its tolerance.
These are diagnostic cases; their full visual gates do not yet pass.

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
and 96/384-DPI PDF pages. Only the two manifest-selected repository sources may
enter TeX; neither live command accepts submitted TikZ.

```text
dotnet run --project tools/TikzReference -c Release -- generate-node-interactions
dotnet run --project tools/TikzReference -c Release -- verify-node-interactions
dotnet run --project tools/TikzReference -c Release -- compare-node-interactions
dotnet run --project tools/TikzReference -c Release -- calibrate-node-interaction-pdf
```

Every command accepts `--case state-paint` or `--case transforms`. Comparison,
verification, and PDF experiments also accept `--out artifacts/...`. Generation
alone writes the explicit baseline locations. Verification regenerates in an
ignored directory and compares measurements, visible SVG, PDF raster pages,
and pinned tool/input identities without overwriting baselines. Cached commands
validate hashes and the native trace and need neither TeX nor Poppler.

The candidate comparison uses the public API, preserves its source-aware scene,
and emits the ordinary agent inspection bundle under
`artifacts/node-interactions/<case>/`. It compares native boxes/defaults and local
glyph positions exactly, global geometry at the manifest's provisional 0.02 CSS
pixel bound, frame coefficients at 0.00002, and paint/order/clip identities.
Primary image comparisons force exact pixels at 1x/4x over transparent, white,
and black backgrounds. There is no reviewed interaction raster allowance, and
the rectangle fixture's allowance cannot be applied here.

The PDF experiment never invokes candidate parsing, layout, glyph resources,
or SVG emission. It copies the original oracle geometry and rebases only the
known wrapper translation, preserving original dimensions, paths, outlines,
paint, and clips. It renders on the measured PDF page lattice, without fitting
or resampling the PDF. Both primary and PDF gates force exact pixels so raw
cross-renderer errors remain measurement results. Output lives under
`artifacts/node-interaction-pdf-calibration/<case>/`, including hashed
`calibration-evidence.json`. No policy or baseline is written by this experiment.
An empty numeric-check list in this representation experiment makes no
candidate layout claim; the independent measurements remain in `metrics.json`.

Current findings:

- The transform case passes all 953 numeric checks. Nonidentity node frames
  select PGF's NE-to-NW-to-SW-to-SE rectangle construction; the identity linear
  frame uses SW-to-SE-to-NE-to-NW. This matters for subsequent dash support and
  phase, even when a solid closed border looks the same.
- Rotated/sheared rectangle ink now includes miter tips with the declared join
  and miter limit. PGF picture bounds remain separate. The candidate natural
  canvas is about 0.735 CSS pixel taller than the original transform SVG crop.
  The original driver crop cuts the sheared border's tip; ordinary PDF retains
  it. The native-dimension/raster experiment continues to report failure.
- State/opacity/paint-order/clip measurements agree except for seven glyph
  color checks. In this default color setup, PGF's SVG path route emits magenta
  as RGB `#ff00ff`; a text box emits a CMYK DVI color special that dvisvgm maps
  to `#ec008c`. The production converter currently uses RGB. Ordinary PDF also
  exposes color-model differences for the cyan fills. This requires an explicit
  color-profile decision and independent color evidence, rather than a wider
  antialiasing threshold.
- Exact PDF experiments mismatch as expected. Raw primary/PDF errors, cameras,
  and paired images are retained. No cross-renderer allowance is approved.

Exit codes follow the main harness: 0 pass, 1 measured mismatch, 2 harness error,
3 candidate conversion error. A PDF calibration exit of 1 is a completed
measurement run, not a conformance pass. Visual admission still requires
oracle-only production-coordinate calibration, localized defect mutations,
color/crop resolution, and reviewed PDF evidence. Ordinary .NET tests cover
the measured geometry/layout/order/opacity/clip quantities and the miter repair;
they do not conceal the pending full comparator failures.
