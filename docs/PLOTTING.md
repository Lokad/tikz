# Plotting

The current plotting slice supports `plot [options] coordinates { ... }` and
`-- plot [options] coordinates { ... }` with the default sharp handler, also
selected by `sharp plot`. The first form starts a subpath; the second connects
the existing path to the first sample. Existing Cartesian, physical, polar,
named and calculated coordinates retain their normal source locations and limits.

```tex
\draw plot coordinates {(0,0) (1,1) (2,0.5)};
\draw (0,0) -- plot coordinates {(1,1) (2,0.5)} -- (3,0);
```

TikZ scans the list before emitting its geometry. Relative `+` and `++` samples
all use the position at plot entry. On completion, the final sample becomes the
path's last position; an empty list sets that position to the origin. A single
sample is allowed. Subsequent operations and arrows use the resulting path.

Plot-local options and `every plot` run in a group. Geometry options affect
sample coordinates, while paint belongs to the enclosing path. Named/calc
coordinates can supply `shift` values. Changes to local geometry options do not
persist into following path operations. Existing path labels can attach to a
following `--` or `to` operation; labels on plot segments are outside this slice.

Finite function plots also accept an explicit Cartesian or polar coordinate:

```tex
\draw[domain=-2:2,samples=9] plot (\x,{(\x)^2/4});
\draw[variable=\t,samples at={0,30,...,90}] plot (\t:1cm);
```

The declared expression subset is ordinary decimal literals, numeric bindings,
physical units, `+ - * /`, `abs`, `min`, `max`, degree-based `sin`/`cos`, and
whole-number powers through `^` or `pow`. Function coordinates use PGF's finite
scaled-point arithmetic. Numeric assignments retain their separately declared
subset; support for powers here does not widen `\pgfmathsetmacro`.

`domain=start:end`, `samples=count`, `samples at={...}` and `variable=\x` can
appear in enclosing options, styles, `every plot` or plot-local options. Later
`domain` or `samples` recomputes the list and replaces an earlier `samples at`.
Explicit lists accept ordinary decimal values and `start,...,end` or
`start,next,...,end` ranges. Numeric bindings expand before list parsing.

The defaults are domain `-5:5`, samples 25 and variable `\x`. PGF's initial
literal list `-5,-4.5833333,...,5` produces 24 points at finite precision;
explicit `domain=-5:5` recomputes it and produces 25. Sample counts clamp to two
but retain fractional values. Very small steps produce the two endpoints;
equal domains produce two coincident points. Range advancement follows native
register arithmetic and endpoint comparison, without snapping an endpoint or
forcing the nominal count.

The sample variable expands textually and shadows an existing numeric binding
only during the plot. For a sample of `-2`, `\x^2` becomes `-2^2`; use `(\x)^2`
or `pow(\x,2)` to square the signed sample. A distinct plot variable can be used
inside a bounded `\foreach`. Bindings and local geometry settings restore after
the plot. Sampling shares expansion, work, loop, coordinate and segment limits,
and cancellation with the rest of conversion.

Malformed domains/lists/variables, unknown variables, undeclared functions,
fractional powers and arithmetic overflow fail explicitly. Smooth/other
handlers, marks, file data, gnuplot and PGFPlots remain unsupported. The production
converter never invokes a native reference tool.

The four fixtures in [the native snapshot](../tests/Reference/Plotting/README.md)
ground sharp coordinate streams, finite function sampling and complete network
interactions. Ordinary tests cover frozen native path/arrow geometry,
continuation, source locations, malformed input and shared budgets/cancellation.
Full plotting image qualification remains pending until smoothing and the final
feature acceptance are complete.
