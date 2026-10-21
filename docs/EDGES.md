# Straight connections

The converter supports bounded straight `to` and `edge` operations. Curved forms
have a separate [contract and reference corpus](CURVED-EDGES.md).

```tex
\begin{tikzpicture}
  \node[draw] (a) at (0,0) {Input};
  \node[draw] (b) at (3,0) {Output};
  \draw[blue] (a) to (b);
  \draw[red] (0,-1) edge[blue] (1,-2) -- (3,-1);
\end{tikzpicture}
```

`to` continues the enclosing path. Its local option groups and `every to` style
affect coordinate resolution; the enclosing path keeps its final paint.
`edge` resolves a separate path, preserves the parent's position and relative
coordinate base, and paints after the parent. Repeated edges branch from the
same position. Both accept Cartesian, polar, named and relative targets.

Relative targets are scanned before local options. Numeric edge starts receive
the edge's local frame. Named coordinates and node centers use their global
positions through the bounded PGF frame round trip.

The default `every edge` style enables drawing. Replacing it with an empty style
removes that mode; appending preserves it. A separate edge reapplies `every path`,
then `every edge`, then local option groups in order. It resets the parent's
fill/stroke modes. Backend paint settings such as dashes, colors, alpha and
caps/joins inherit the parent's finished state unless the edge sets them. Width
and fill rule are construction registers. Parent clips apply to deferred edges.
Unpainted edge geometry contributes picture bounds when the current clip scope
permits picture-size updates.

Measured rectangle/circle/ellipse nodes use their existing implicit border
resolution. Explicit `(n.center)` and cardinal anchors retain their named points.
Ellipse nodes require `shapes.geometric`; see [nodes](NODES.md).

Custom `to path`, separate `edge` labels and edge loops fail explicitly.
Attached `--`/`to` labels and token definitions have their own
[path-label](PATH-LABELS.md) and [definition](DEFINITIONS.md) contracts. Generated
segments and option expansion share work limits and cancellation. An edge
resource failure identifies the complete operation source span.

## Grounding and validation

Five [trusted fixtures](../tests/Fixtures/Edges) exercise geometry, effective
paint, paint order, clips, picture bounds, node measurements, anchors and glyph
positions. The [public numeric tool](../tools/TikzEdgeComparison/README.md)
checks 2,585 independently measured quantities and writes inspection bundles.

The [native reconstruction](../tools/TikzEdgeOracle/README.md) reads retained
PGF paths, paint/clips and original glyph outlines without invoking the
converter. The original SVG driver's omitted round-cap dot remains recorded.
The separately labelled corrected-driver reference restores only the verified
zero-length line; original-driver comparisons remain available.
[Operation diagnostics](../tools/TikzVisual/EDGE-OPERATIONS.md),
[primary](../tools/TikzVisual/EDGE-PRIMARY.md) and
[native-page PDF](../tools/TikzVisual/EDGE-PDF.md) qualifications retain distinct
encodings, fixed registration and visible-defect controls.

Current output uses the [fixed eight-gate admission](../tools/TikzVisual/EDGE-CONFORMANCE.md)
and its [portable cached entrypoint](../tools/TikzVisual/EDGE-CACHED.md).
It requires fresh conversion, numeric/frame checks, primary and both PDF routes,
independent saved-pixel checking, current source binding and image-only controls.
The [underlying trial](../tools/TikzVisual/EDGE-TRIAL.md) keeps its historical
unapproved role. Tracked reference transport changes no policy or tolerance.

These policies qualify the fixed corpus. Additional connection interactions,
arbitrary backends and general PDF pixel identity remain outside that scope.
See [testing](TESTING.md) and [verification](VERIFICATION.md).
