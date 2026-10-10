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

`smooth` turns either coordinate or function streams into cubic curves. Endpoint
controls coincide with the first/last samples; interior controls use PGF's
finite support-vector arithmetic before the current transform. `tension` accepts
an ordinary decimal or numeric binding, with default 0.5. Zero and negative
tensions retain their native meaning. `sharp plot` restores the straight handler;
handler and tension settings follow the same scoped option order as sampling.

`smooth cycle` produces a closed cubic contour. Following PGF's construction
order, it starts at the second sample and wraps through the last, first and second
samples before closing. It starts a new subpath even with `-- plot`. Zero or one
samples emit no plot geometry; two emit only a move to the second sample. Following
path operations use the last sampled coordinate, independently of the closed
contour's endpoint. Smooth controls contribute to picture bounds, while curve
extrema and the active pen determine ink bounds.

Malformed domains/lists/variables/tensions, unknown variables, undeclared
functions, fractional powers and arithmetic overflow fail explicitly. Sharp
cycle and other handlers, marks, file data, gnuplot and PGFPlots remain unsupported.
The production converter never invokes a native reference tool.

The six fixtures in [the native snapshot](../tests/Reference/Plotting/README.md)
ground coordinate streams, finite function sampling, smooth handlers and complete
network interactions. Ordinary tests cover frozen native path/arrow geometry,
continuation, source locations, malformed input and shared budgets/cancellation.
Full plotting image qualification remains pending until final feature acceptance.

The native image harness retains both PGF's picture viewport and the independent
viewport enclosing stroke ink. In the fixed smooth contract, their 0.11 CSS pixel
height difference changes one thresholded glyph component in intrinsic 1× images
on transparent or white backgrounds. Six native captures with matching viewports
prove that the component difference disappears. Only those two views and the
whole picture/two affected glyph regions admit the observed component residual;
all channel, changed-pixel and edge limits still come from native encodings.
Missing/shifted glyph controls cover the affected views, and independent readers
reject omitted registration evidence or inflated/out-of-scope limits.
