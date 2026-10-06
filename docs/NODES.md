# Node prototypes

The public converter accepts standalone `\node` statements with an optional
name and `at` coordinate, rectangle/circle/ellipse geometry, and the
[bounded text profile](TEXT.md).
It measures the label before resolving shape dimensions and anchors, then emits
an ordered background path and self-contained glyph outlines. No TeX, browser,
installed font, or filesystem is used during conversion.

```tex
\begin{tikzpicture}
  \node[draw,font=\bfseries,inner sep=3pt] (label) at (0,0) {AV ffi.};
\end{tikzpicture}
```

The [manifest](../tests/Reference/Nodes/cases.json) has 22 independently authored
nodes in an [actual TikZ fixture](../tests/Fixtures/Nodes/rectangles.tikz). The
[wrapper](../tools/TikzReference/nodes.tex) measures native integer sp text boxes,
font-relative defaults, separation, minimum sizes, line width, sixteen global
anchors, painted rectangle corners, and every glyph's font/slot/position.
The DVItype trace marks the baseline of the already completed text box; it
does not use candidate font metrics or layout to produce reference positions.

Ordinary tests need neither TeX nor a browser. The internal cached report checks
1,322 exact layout/glyph quantities. The public comparison checks 2,347 node,
layout, physical coordinate, background, and glyph quantities, plus native SVG
dimensions and pixels at 1x/4x over transparent, white, and black backgrounds.
Native physical coordinates require error below 1e-9 bp; rounding a displaced
coordinate back to an integer sp cannot hide an error.

Coverage includes empty labels, a period, capitals/descenders, all six bundled
font faces, different label and node fonts, mixed-size and empty multiline rows,
default and explicit separation, negative separation, minimum sizes, different
line widths, center/north/base/mid placement, and one-sp minimum dimensions.
Glyph definitions are deduplicated per conversion. Readable `<title>` metadata
is XML-escaped, and output quotas count UTF-8 bytes.

PGF halves individual scaled-point operands by truncating toward zero. Its
default `.3333em` inner separation multiplies a fixed-point fraction by the
node font's quad. `font` selects text inside the label; `node font` also changes
the context used for shape defaults. Outer separation changes anchors while
the painted rectangle excludes it. Stroke paint and bounds use the same native
integer-sp line width as shape defaults.

Base anchors use the label baseline. Mid anchors evaluate `.5ex` in the querying
font context, which can differ from the node font. The large mid-anchored case
checks placement and subsequent queries. Unknown anchors fail explicitly.
Node/glyph counts, work, dimensions, generated outline segments, output size,
and cancellation share the conversion budget.

The [node raster policy](../tools/TikzVisual/NODE-CALIBRATION.md) has its own
oracle-only evidence. It re-expresses original oracle outlines at native DVI
positions in CSS units and derives the natural frame from independent native
borders, stroke widths, and text boxes. Original outline containment is checked
separately. The candidate PNGs match that independently derived representation
exactly. The bounded differences from the original SVG driver remain reported;
this is not an exact-pixel claim against the original driver.

These results establish the fixture's concrete rectangle/label forms. Inherited
and local transforms, text color/opacity and style interactions, clipping,
overlapping node/path paint order, rotated/sheared stroke extents, implicit node
border endpoints, circle/ellipse image conformance, path/inline labels, and secondary PDF
fidelity still require their own grounding. Some keys are implemented for the
next interaction fixtures; acceptance by the parser is not a compatibility claim.
The [interaction experiment](../tools/TikzReference/NODE-INTERACTIONS.md) now has
sixteen native node references and numeric evidence for these interactions.
It repairs transformed rectangle traversal and miter ink bounds, but preserves
failing color, native-crop, and raster results. It adds no visual compatibility
claim or general node tolerance.
The separately reviewed RGB/ink corpus now adds 41 rectangle nodes across
state/paint, affine transforms, and the color palette. Its
[primary](../tools/TikzVisual/INTERACTION-PRIMARY.md) and
[combined PDF](../tools/TikzVisual/INTERACTION-PDF.md) policies pass all native
numeric, dimension, global/local primary, and ordinary PDF gates for those
fixtures. Original default-color and driver-crop failures remain reproducible.
This scoped evidence covers the named interactions; broader shape/label forms
and the separate 22-node fixture's own PDF admission remain pending.
Bare rectangle-node endpoints now resolve borders for straight, orthogonal,
and explicit-control cubic segments. A chain starts a separate outgoing subpath
at each implicit node; explicit anchors retain their specified positions.
The [border experiment](../tools/TikzReference/NODE-BORDERS.md) has independent
native arithmetic/path evidence, including transformed queries. Its separate
[combined image policy](../tools/TikzVisual/BORDER-CONFORMANCE.md) now admits the
three unlabelled fixtures with native, stroke-frame, primary, and PDF gates;
original driver mismatches remain retained. Labeled border interactions still
need their own fixtures. Math,
text wrapping, unsupported fonts/shapes, and `outer sep=auto` fail with diagnostics.

See [testing instructions](TESTING.md) for cached public comparisons, image
mutations, and explicit live verification. The original SVG, log, native trace,
measurements, tool/font/input hashes, and probe-invariance evidence are retained.

## Circle and ellipse numeric prototype

`circle` is built in. `ellipse` requires `shapes.geometric`, loaded before use
through `\usetikzlibrary{shapes.geometric}` or `TikzOptions.Libraries`.
The module currently enables ellipse alone; other geometric shapes fail
explicitly. Library declarations inside a scope persist for that conversion,
and separate conversions do not share their library state. Shape aliases and
`shape=...` select the same layout. `every circle node` and `every ellipse node`
styles follow the existing node style order.

The separate [shape oracle](../tools/TikzShapeReference/README.md) provides
independent native measurements for 28 nodes. Ordinary
[tests](../tests/Lokad.TikZ.Tests/CurvedNodeTests.cs) compare the public converter's
text boxes, 448 global named anchors, all 420 background soft-path tokens,
native picture bounds, and 448 border endpoints at physical precision below
1e-9 bp. Sixteen primitive normalized directions and directly resolved shape
layouts are checked separately. The original fixture and native measurements
remain unchanged; additional candidate-only paths exercise its border queries.

The shared shape layout contract runs after label measurement. Circle radii
use finite PGF normalization and division; ellipse axes use the native fixed
square-root-of-two coefficient. Diagonal anchors and quarter-curve controls
also use finite coefficients. Painted radii exclude outer separation. Native
border arithmetic retains the multiplication and truncation order of each
ellipse branch, including near-center directions. Background paths preserve
PGF's final move back to the center and enter the ordinary graphics/SVG pipeline.

The [public comparison command](../tools/TikzShapeComparison/README.md) now adds
direct assertions for all 70 native glyphs and their emitted affine placement,
with independent DVI/TFM-to-original-SVG consistency checks. It exports source
traces and agent-viewable images at 1x/4x over transparent/white/black backgrounds,
preserving original root framing and separate expanded inspection views.

These numeric results cover the named fixtures. They do not establish image
or PDF conformance. A separate [oracle-only reconstruction](../tools/TikzShapeCalibration/README.md)
now measures native CSS serialization, driver framing and fixed scaled-point
sensitivity without invoking the converter. Its five variants retain raw
differences and twelve exact unchanged-pair repeats; no image policy is
approved. The [independent ink/frame workflow](../tools/TikzShapeCalibration/FRAMING.md)
also establishes native stroke and tight transformed-glyph extents; all 98
contributions and the natural root now pass 406 additional public numeric
checks. Original viewport overruns and clip-rendering effects remain visible.
The [semantic-frame raster experiment](../tools/TikzShapeCalibration/SEMANTIC-FRAME.md)
also reconstructs the declared natural root independently and records global
and per-region channel, foreground, edge and component observations. Its
root-only controls separate framing from changing drawing instructions;
successful evidence generation retains pending image/PDF admission.
The [primary image trial](../tools/TikzShapeCalibration/PRIMARY-TRIAL.md) now
passes independently derived global/local limits in all twelve candidate views
and rejects eleven image-only defects at both tested white natural scales.
Candidate PNGs match the independent native reconstruction; original-driver
differences remain retained. Prospective limits stay unapproved and these
results do not establish general shape or PDF compatibility.
The [ordinary PDF reference](../tools/TikzShapePdfReference/README.md) now
reproduces all 1,810 native records and retains a shipped-out page camera,
two embedded font identities and exact plain/probed PDF/PNG invariance.
It has cached evidence controls and separately executed live verification;
SVG-versus-PDF image calibration and admission remain pending.
Further focused and interaction corpora, reviewed image policies and ordinary
PDF image evidence are still required. No rectangle/path raster tolerance
applies to these new shapes. A degenerate unequal-axis border that
cannot be computed at native scaled-point precision fails at its source
coordinate; callers can still use a supported explicit anchor.
