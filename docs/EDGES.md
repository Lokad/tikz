# Straight connections

The public converter implements a bounded straight `to` and `edge` prototype.
Five [trusted fixtures](../tests/Fixtures/Edges) match 2,585 independent native
assertions for geometry, effective paint, physical paint order, clip chains,
picture bounds, node measurements, anchors and glyph positions. Their original
PGF SVG and ordinary TikZ PDF images are retained. Image calibration and
conformance remain pending; numeric agreement is a separate result.

The [independent native reconstruction](../tools/TikzEdgeOracle/README.md)
preserves original driver comparisons and separately renders retained PGF paths,
effective paint/clips and original glyph outlines. It does not call the public
converter. Its complete scale/background matrix, ordinary-PDF pairs and saved
PNG checker ground future image policies. The original SVG's missing round-cap
dot remains visible; a reconstructed-reference match does not replace it.

```tex
\begin{tikzpicture}
  \node[draw] (a) at (0,0) {Input};
  \node[draw] (b) at (3,0) {Output};
  \draw[blue] (a) to (b);
  \draw[red] (0,-1) edge[blue] (1,-2) -- (3,-1);
\end{tikzpicture}
```

`to` continues the enclosing path. Its local option groups and `every to`
style affect coordinate resolution without changing the enclosing path's final
paint. `edge` resolves a separate path, preserves the parent's position and
relative-coordinate base, and paints after the parent. Repeated edges branch
from the same position. Both accept Cartesian, polar, named and relative targets.
Relative targets are scanned before local options. Numeric edge starts receive
the edge's local frame; named coordinates and node centers use their global
positions through the bounded PGF frame round trip.

The default `every edge` style enables drawing. Replacing it with an empty
style removes that mode; appending preserves it. A separate edge reapplies
`every path`, then `every edge`, then its local option groups in order. It
resets the parent's fill/stroke modes. Effective backend paint settings such as
dash, colors, alpha and caps/joins inherit the parent's finished state unless
the edge explicitly sets them. Width and fill rule are construction registers.
Clipping established by the parent applies to its deferred edges. Unpainted
edge geometry still contributes picture bounds when the current clip scope
permits picture-size updates.

Measured rectangle/circle/ellipse nodes use their existing implicit border
resolution. Explicit `(n.center)` or cardinal anchors keep their named points.
Node metrics, transformed border connections and sixteen original DVI glyph
positions are included in the fixed corpus. Ellipse nodes require the
`shapes.geometric` library as documented in [NODES.md](NODES.md).

Unsupported bends, `in`/`out`, custom `to path`, path labels, arrows, edge loops
and general TeX expansion fail with diagnostics. Generated edge segments and
option expansion share the conversion budget and cancellation token. A resource
failure during edge generation identifies the complete operation source span.
Broader combinations still need independent fixtures.

The [comparison tooling](../tools/TikzEdgeComparison/README.md) emits candidates
through the public conversion entry point and produces an agent inspection
gallery. Every image uses fixed physical placement; no alignment is fitted.
In the current experiment the coordinate fixture's primary pages have zero
decoded differences at both scales. Other fixtures retain differences, including
a semantic dot that native PDF and the candidate paint while the original SVG
driver drops its zero-length line. This is a recorded backend disagreement,
without a newly approved tolerance or pixel-perfect claim.
