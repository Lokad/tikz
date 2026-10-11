# Arc path operations

Legacy syntax is `arc (start:end:radius)`. Modern syntax requires explicit
`start angle` and `end angle` plus either `radius` or both axis radii:

```tex
\begin{tikzpicture}
  \draw (0,0) arc[start angle=0,end angle=90,radius=4mm,x radius=8mm];
\end{tikzpicture}
```

Angles use degrees. An arc begins at the current path position and updates that
position to its endpoint; it does not interpret the current position as its
center. Subsequent supported path operations continue from that endpoint.

Modern radius assignments are ordered. `radius` assigns both axes; `x radius`
and `y radius` assign one axis. Each axis uses its final assignment. Thus the
example has 8mm/4mm axes; reversing its radius keys produces 4mm/4mm axes.
Repeated shared radii use the last value.

The shared `radius` key evaluates its expression when assigned, including values
later overwritten. For example, `radius=1/0,radius=4mm` fails explicitly. Axis
keys store their expressions until the final values are used; overwritten axis
expressions are not evaluated. Diagnostics for evaluated expressions preserve
their original source locations.

Physical radii use their declared dimensions. Unitless radii use the current
`x`/`y` coordinate basis, including nonuniform bases. The final axes must both be
physical or both unitless; mixing these forms produces `TIKZ001`. Ordered affine
coordinate transforms apply to the resulting axes. Stroke width follows the
ordinary paint contract.

The local modern option list accepts `start angle`, `end angle`, `radius`,
`x radius` and `y radius` only. Missing required values diagnose; other keys,
including `delta angle`, are unsupported. Scope-wide radius defaults, arbitrary
TikZ hooks and general TeX expansion are outside this local syntax contract.
Arc subdivision and generated segments share conversion work/geometry limits
and cancellation; extreme sweeps cannot allocate unbounded geometry.

The [focused tests](../tests/Lokad.TikZ.Tests/ArcOptionTests.cs) distinguish ordered
axes, eager shared values, deferred overwritten axis values, mixed units and
unsupported keys. The [complete flowchart](../tests/Fixtures/Diagrams/flowchart-arc-order.tikz)
combines these radius mechanisms with positioning, labels, arrows and calculated
coordinates. Its independent native/image acceptance is recorded separately;
successful parsing alone does not establish general TikZ compatibility.
