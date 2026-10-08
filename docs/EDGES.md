# Straight connections

The public converter implements a bounded straight `to` and `edge` prototype.
Curved forms have a separate [prototype and reference corpus](CURVED-EDGES.md).
Five [trusted fixtures](../tests/Fixtures/Edges) match 2,585 independent native
assertions for geometry, effective paint, physical paint order, clip chains,
picture bounds, node measurements, anchors and glyph positions. Their original
PGF SVG and ordinary TikZ PDF images are retained. Separate native primary/PDF
qualifications supply the public image trial and its separately scoped
[fixed conformance admission](../tools/TikzVisual/EDGE-CONFORMANCE.md).

The [independent native reconstruction](../tools/TikzEdgeOracle/README.md)
preserves original driver comparisons and separately renders retained PGF paths,
effective paint/clips and original glyph outlines. It does not call the public
converter. Its complete scale/background matrix, ordinary-PDF pairs and saved
PNG checker ground future image policies. The original SVG's missing round-cap
dot remains visible; a reconstructed-reference match does not replace it.
Separate [operation diagnostics](../tools/TikzVisual/EDGE-OPERATIONS.md) preserve
full cameras and effective state while isolating each native paint and glyph.
They distinguish driver transform arithmetic from missing ink, without granting
a converter tolerance.
The [primary calibration](../tools/TikzVisual/EDGE-PRIMARY.md) retains a labeled
derived-driver reference that restores only the independently verified omitted
zero-length line. It preserves original-driver differences and tests local
image-only sensitivity under a preselected native encoding. It grants no public
conformance claim or PDF allowance.

The [native-page PDF qualification](../tools/TikzVisual/EDGE-PDF.md) compares
original, corrected and reconstructed references with ordinary TikZ PDF pages.
Native positions and integer crops fix registration. Independent local error
limits, exact RGB ink sums, unchanged viewport controls and image-only defects
prepare the secondary gate without granting a general PDF pixel-identity claim.

The [public combined trial](../tools/TikzVisual/EDGE-TRIAL.md) owns a fresh
conversion and requires numeric, conservative frame, primary, both PDF routes,
exact reconstructed-page and fresh image-only sensitivity gates together.
Thirteen public SVG mutations exercise small missing marks, displaced labels,
paint, clipping and root sizing with numeric checks bypassed. Its independent
checker reconverts, reconstructs expected frames and remeasures the saved PNGs.
Completed trial passes retain an unapproved role. A separate fixed profile
admits an owned fresh trial/checker only when all eight gates pass. Broader
connection interactions remain separate work.

A [portable cached command](../tools/TikzVisual/EDGE-CACHED.md) supplies those
independent qualification bundles entirely from tracked evidence, then owns
the same public trial and checker. It requires no ignored research folders,
TeX or PDF executable. Cached transport changes no image gate or fidelity claim.

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

Custom `to path`, separate `edge` labels, edge loops and general TeX expansion
fail with diagnostics. Attached `--`/`to` labels have a separately scoped
[prototype](PATH-LABELS.md); its image qualification remains open. Generated edge segments and
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
