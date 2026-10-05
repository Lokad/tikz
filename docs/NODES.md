# Rectangle-node prototype

The public converter accepts standalone `\node` statements with an optional
name and `at` coordinate, rectangle geometry, and the [bounded text profile](TEXT.md).
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
border endpoints, circle/ellipse nodes, path/inline labels, and secondary PDF
fidelity still require their own grounding. Some keys are implemented for the
next interaction fixtures; acceptance by the parser is not a compatibility claim.
The [interaction experiment](../tools/TikzReference/NODE-INTERACTIONS.md) now has
sixteen native node references and numeric evidence for these interactions.
It repairs transformed rectangle traversal and miter ink bounds, but preserves
failing color, native-crop, and raster results. It adds no visual compatibility
claim or general node tolerance.
Bare node endpoints in drawing paths fail until border intersection exists;
explicit anchors are accepted. Math, text wrapping, unsupported fonts/shapes,
and `outer sep=auto` fail with diagnostics.

See [testing instructions](TESTING.md) for cached public comparisons, image
mutations, and explicit live verification. The original SVG, log, native trace,
measurements, tool/font/input hashes, and probe-invariance evidence are retained.
