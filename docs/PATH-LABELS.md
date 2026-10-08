# Attached path labels: prototype

The converter parses measured nodes before the target of straight `--` and
straight or supported curved `to` segments:

```tex
\begin{tikzpicture}
  \draw (0,0) -- node[midway,above] {read} (3,0);
  \draw[bend left=20] (0,-1) to node[pos=.45,sloped,above] {send} (3,-1);
\end{tikzpicture}
```

Grouped text, optional node names, existing node shape/text options, `midway`,
dimensionless `pos` in `[0,1]`, `sloped=true|false`, `allow upside down=true|false`
and unvalued `above`, `below`, `left`, `right` are implemented. Position defaults
to `.5`. Curve positions use the cubic parameter, rather than arc length.
Placement uses the resolved segment before arrow shortening. Slopes use the
local tangent, PGF's finite normalization and its default upright policy.
`transform shape` retains the enclosing linear transform; otherwise placement
resets that transform before applying the local slope and node transforms.

Labels reuse measured text, shape layout, anchors and embedded glyph outlines.
They register their names while evaluating the path and paint after that path.
Fill/stroke modes start disabled for a label; its options can enable them.
All parsing, geometry, glyphs and SVG output share conversion limits and
cancellation. Diagnostics retain the original label and option spans.

Separate `edge` labels, labels after a target, explicit label `at`, label nodes
on other path operators, distance-valued directional options, `auto`/`swap`,
out-of-range positions and paths combining labels with a new clip or separate
edges fail explicitly. These forms require additional native interaction
evidence before extending the contract.

The [focused native corpus](../tests/Fixtures/PathLabels/placement.tikz) has
13 measured nodes, 208 anchors and 42 glyphs under Latin Modern T1 10pt.
Ordinary tests compare text boxes and retained anchors exactly in scaled points,
and independently check glyph slots, positions, transformed baselines, effective
paint and physical order. Original diagram sources also parse their attached labels.
The three complete diagrams currently fail later at the `positioning` library.

The [interaction fixture](../tests/Fixtures/PathLabels/interactions.tikz) adds
continued segments, reuse of named-label anchors, bold `every node` styling,
colored label backgrounds/text, and two nested existing clips. Its 8 nodes,
128 anchors and 25 glyphs match independent native observations, including
inherited clip chains and clip restoration after a scope. Cancellation tests
cover public entry and the shared-token boundaries before resolution and SVG output.

The [iteration workflow](../tools/TikzPathLabelComparison/README.md) reuses frozen
native evidence and always compares fresh converter output. SVG/PDF observations
agree, and probes leave the native SVG drawing, PDF and PDF pixels unchanged.
Native-only primary/local policies now cover both fixed fixtures, with separate
intrinsic-image and explicit-viewport captures, natural/expanded frames, 1x/4x
density and three backgrounds. Their
[independent checking workflow](../tools/TikzPathLabelOracle/README.md) recomputes saved
pixel metrics and recaptures original sources. Fresh converter images are checked
against these prospective policies; limits never come from candidate pixels.
Complete-label text controls independently check loss/displacement of every
glyph, using the frozen primary limits. Visible controls must fail a local text
region; fully clipped text and black-on-black samples remain explicit.
Native-only ordinary-PDF policies separately register the original SVG and
independent encodings against the unchanged PDF raster. Their natural frames
use measured native picture bounds; the larger miter envelope remains an
inspection camera. Registration includes measured wrapper glue and uses no fit.
Fresh output is compared through both PDF gates.
The current-output checker independently decodes all required primary/PDF views,
checks verdicts and intrinsic framing, verifies common numeric provenance, and
recaptures them from a fresh public conversion. Its frame check allows one native
scaled point plus six-decimal SVG serialization rounding; pixel limits remain
unchanged. Full image qualification, portable calibration and final-tree
fresh-export acceptance remain open.
Focused numeric agreement and paired-image inspection establish no
approved image tolerance or general pixel-identity claim.
