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

The [iteration workflow](../tools/TikzPathLabelComparison/README.md) reuses frozen
native evidence and always compares fresh converter output. SVG/PDF observations
agree, and probes leave the native SVG drawing, PDF and PDF pixels unchanged.
Full path-label image qualification, continuation/style/clip interaction evidence,
ordinary-PDF image gates and final-tree fresh-export acceptance remain open.
Focused numeric agreement and paired-image inspection establish no
approved image tolerance or general pixel-identity claim.
