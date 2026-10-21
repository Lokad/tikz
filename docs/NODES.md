# Nodes

The converter supports standalone `\node` statements with an optional name and
`at` coordinate, rectangle/circle/ellipse geometry, and measured
[prose](TEXT.md), [multiline](TEXT.md) and [inline math](MATH-LABELS.md) labels.
Label measurement precedes shape dimensions, anchors and painted geometry.
Conversion uses bundled outlines and requires no TeX, installed font or browser.

```tex
\begin{tikzpicture}
  \node[draw,font=\bfseries,inner sep=3pt] (label) at (0,0) {AV ffi.};
\end{tikzpicture}
```

## Options and placement

Rectangle is the default. `circle` is built in; `ellipse` requires
`shapes.geometric`, loaded before use through `\usetikzlibrary` or
`TikzOptions.Libraries`. The library enables the declared ellipse subset.
Shape aliases and `shape=...` select the same layouts.

| Options | Behavior |
| --- | --- |
| `font`, `node font` | `font` selects label text; `node font` also supplies the shape's font-relative defaults |
| `inner sep`, `inner xsep`, `inner ysep` | Space between measured label and shape |
| `outer sep`, `outer xsep`, `outer ysep` | Separation used by anchors and border queries; excluded from painted geometry |
| `minimum size`, `minimum width`, `minimum height` | Lower bounds on shape dimensions |
| `anchor` | Selects the named point placed at the node's coordinate |
| `align=left`, `align=center`, `align=right` | Alignment for explicit multiline labels; no automatic paragraph wrapping |
| `draw`, `fill`, `text`, opacity and line-width options | Scoped background/text paint with separate visible ink bounds |
| `transform shape` and local transforms | Apply the declared node transform policy; positioning has its [own bounded contract](POSITIONING.md) |

Node style order is `every node`, local options, then the selected
`every rectangle node`, `every circle node` or `every ellipse node` style.
Library registration lasts for the conversion; ordinary scoped state and
separate conversions retain their documented isolation.

```tex
\begin{tikzpicture}
  \usetikzlibrary{shapes.geometric}
  \node[draw,circle] (a) at (0,0) {$x^2$};
  \node[draw,ellipse] (b) at (3,0) {Result};
  \draw (a) -- (b);
\end{tikzpicture}
```

Explicit anchors such as `(n.center)` preserve their named points. Bare node
endpoints resolve borders toward the adjoining path geometry for straight,
orthogonal and explicit-control cubic segments, as well as the declared
[connection forms](EDGES.md). A chain starts a separate outgoing subpath at each
implicit node. Additional path labels use their [separate contract](PATH-LABELS.md).

## Finite geometry

PGF halves scaled-point operands by truncating toward zero. Default `.3333em`
inner separation uses the node font's quad. Base anchors follow the label
baseline; mid anchors evaluate `.5ex` in the querying font context, which can
differ from the node font. Stroke paint and shape defaults use the same integer
scaled-point line width.

Circle radii use finite PGF normalization/division. Ellipse axes, diagonal
anchors and quarter-curve controls use native fixed coefficients. Border
arithmetic preserves each branch's multiplication/truncation order, including
near-center directions. Painted radii exclude outer separation. Background
paths preserve the native final move back to the center.

A degenerate border calculation that cannot be represented at native precision
fails at its source coordinate. A supported explicit anchor remains available.
Unknown anchors, unsupported fonts/shapes, automatic text wrapping and
`outer sep=auto` fail explicitly. Node/glyph counts, work, dimensions, outline
segments, output bytes and cancellation use the shared conversion budget.

## Grounding and validation

The reference families have distinct scopes and policies:

| Family | Current evidence and entrypoint |
| --- | --- |
| Rectangle labels and defaults | [22-node native fixture](../tests/Fixtures/Nodes/rectangles.tikz), [layout tests](../tests/Lokad.TikZ.Tests/NodeLayoutTests.cs), [SVG policy](../tools/TikzVisual/NODE-CALIBRATION.md) |
| Rectangle paint/transforms | [RGB/ink interaction workflow](../tools/TikzReference/NODE-INTERACTIONS.md), with separate [primary](../tools/TikzVisual/INTERACTION-PRIMARY.md) and [PDF](../tools/TikzVisual/INTERACTION-PDF.md) policies |
| Unlabelled borders | [Native arithmetic](../tools/TikzReference/NODE-BORDERS.md) and [combined admission](../tools/TikzVisual/BORDER-CONFORMANCE.md) for three fixed fixtures |
| Circle/ellipse labels and borders | [28-node native oracle](../tools/TikzShapeReference/README.md), [public numeric comparison](../tools/TikzShapeComparison/README.md), [immutable image admission](../tools/TikzVisual/CURVED-NODE-ADMISSION.md) |
| Labelled borders | [Native oracle](../tools/TikzLabelledBorderReference/README.md), [public comparison and current admission commands](../tools/TikzLabelledBorderComparison/README.md) |

The independent readers retain native text boxes, anchors, glyph positions,
soft paths, paint and picture bounds. Candidate geometry does not supply those
reference measurements. Original-driver SVG and ordinary PDF observations keep
their own registration and exact or independently calibrated limits.

Historical trials keep their original pending verdicts and driver differences.
Current fixed admissions do not imply arbitrary shape/label/edge combinations,
general PDF pixel identity or a PDF admission for the separate 22-node rectangle
fixture. See [testing](TESTING.md) for cached checks and trusted live generation;
[verification](VERIFICATION.md) defines current-output qualification.
