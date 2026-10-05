# Internal rectangle node layout

Rectangle layout is internal preparation for node conversion. The public
converter still rejects nodes and labels. It consumes already measured labels
and resolves shape dimensions in integer TeX scaled points before creating a
background path. SVG glyph emission and node frontend integration remain pending.

The dedicated [manifest](../tests/Reference/Nodes/cases.json) has 22 nodes in an
independently authored [actual TikZ fixture](../tests/Fixtures/Nodes/rectangles.tikz).
The [wrapper](../tools/TikzReference/nodes.tex) measures text box dimensions,
font-relative defaults, separation, minimum sizes, line width, sixteen anchors,
and the painted rectangle corners. Ordinary tests and cached comparison require
exact integer agreement for 1,056 measurements. They use no TeX or browser.

Coverage includes empty labels, a period, capitals/descenders, all six bundled
font faces, different label and node fonts, mixed-size and empty multiline rows,
default and explicit separation, negative separation, minimum sizes, different
line widths, center/north/base/mid placement, and one-sp minimum dimensions.
Multiline box agreement does not establish every glyph position inside an
actual TikZ node; those positions require their own native trace.

PGF halves individual scaled-point operands by truncating toward zero. Its
default `.3333em` inner separation multiplies a fixed-point fraction by the
node font's quad. `font` selects text inside the label; `node font` also changes
the context used for shape defaults. A 12pt face's quad need not be exactly
12pt. Outer separation changes anchors while the painted rectangle excludes it.

Base anchors use the label baseline. Mid anchors evaluate `.5ex` in the querying
font context. That context can differ from the font that originally sized the
node; the large mid-anchored fixture checks both placement and subsequent queries.
Unknown anchors fail explicitly. Node count, work, coordinate/dimension limits,
generated path segments, and cancellation use the shared budget.

These results establish the enumerated rectangle layout forms. They do not
establish public node parsing, implicit endpoint border intersections, circles,
ellipses, inherited/local transform policy, outline ink bounds, clipping or paint
order, CSS glyph placement, natural SVG cropping, or secondary PDF fidelity.
Those remain required parts of end-to-end node grounding.

See [testing instructions](TESTING.md) for cached reports and explicit live
generation/verification. The original oracle SVG and logs remain available for
inspection. The node profile is separate from the geometry and bp label profiles.
