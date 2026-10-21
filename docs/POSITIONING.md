# Bounded positioning

Load `positioning` through `\usetikzlibrary{positioning}` or `TikzOptions.Libraries`.
Load it before the picture when its keys are needed throughout the picture.
PGF registers a library once per conversion, while positioning keys declared
inside a scope remain local to that scope. Repeating the library declaration
after the scope ends does not restore those keys; valued placement then fails
explicitly. `TikzOptions.Libraries` loads the keys before picture evaluation.
The initial implementation supports measured node placement in these forms:

```tex
\usetikzlibrary{positioning}
\begin{tikzpicture}[node distance=9mm]
  \node[draw] (input) {Input};
  \node[draw,right=of input] (check) {Check};
  \node[draw,below right=10mm and 18mm of input] (retry) {Retry};
\end{tikzpicture}
```

The direction keys are `above`, `below`, `left`, `right`, `above left`,
`above right`, `below left` and `below right`. Each accepts `of name`,
`distance of name` or `vertical distance and horizontal distance of name`.
Targets must already exist as named nodes, named anchors or coordinates.
Bare node targets use the directional border anchor; the new node initially
uses the opposite anchor. A later explicit `anchor` option overrides it.

The library starts with `node distance=1cm and 1cm`. Node distance is inherited
and restored with scopes, and the value in effect at the placement key supplies
omitted distances. Physical distances use their units; unitless distances use
the coordinate bases. A single diagonal distance applies PGF's finite diagonal
normalization, while two distances specify the two components directly.

Text is measured before resolving the new node's geometry. Positioning retains
outer separation and the ordinary node transform policy, including
`transform shape`. Plain unvalued direction keys retain anchor-only behavior;
valued positioning is separate from attached path-label placement.

Standalone distance offsets without `of`, multiple valued placement keys,
positioning combined with explicit `at`, `on grid`, `base left/right`,
`mid left/right` and general TeX positioning expressions fail explicitly.
Positioning uses the same source spans, cancellation and work limits as the
other conversion phases.

The original positioning corpus includes complete flowchart, network and
transformed-node diagrams. Independent PGF measurements cover nine named nodes
and 144 anchors, including scoped transformed placement.
Focused fixtures additionally ground all directions, default/single/two
distances, named targets, skew coordinate bases, scope restoration and node
transform reset/full/local ordering. Native rejection controls cover scoped
library availability. The complete diagrams also pass independent text/anchor,
DVI/TFM glyph, coordinate, picture-bounds and effective paint-order/state checks.
Supplemental native arrow observations ground complete background/shaft/tip
geometry, template dimensions and shortening through the same comparison tool.
In the focused contract fixture, a final-glyph raster difference is independently
reproduced by native-only encodings. Integer DVI glyph positions, measured PGF
text anchors and original glyph outlines reconstruct the public output exactly
at 1x and 4x when serialized to six decimals. Original native SVG coordinate
serialization changes three pixels at the final `r` of `Anchor` at 4x, despite
matching glyph identities, outlines and TeX layout. This diagnostic establishes
the cause for that fixture; native-only calibration must still set image limits.
Native-only primary/local calibration and glyph/whole-label/tip sensitivity now
have independent decoded-image checking and source recapture. Fresh diagram
primary comparisons now use natural roots independently derived from PGF picture
bounds and shipped path/glyph ink, separate from the conservative inspection
camera. The existing native arrow encoder also supplies a short TeX-point path
representation, whose decimals recover each original scaled-point dimension.
The frozen native policies include that path representation alongside the
original SVG and ordinary PDF observations. The current
[verification workflow](VERIFICATION.md) recreates fresh public output and
independently checks its primary/PDF images and source recaptures under the
declared view policy. Historical camera products remain attached to their
original reports. Complete feature acceptance also requires clean source-export
checks, the complete diagram matrix and separate family checks. These fixed
fixtures do not establish a general pixel-perfect claim.
