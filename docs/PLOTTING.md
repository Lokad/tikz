# Coordinate-list plots

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

Function sampling, smooth/other handlers, marks, file data, gnuplot and PGFPlots
fail explicitly. The production converter never invokes a native reference tool.

The two fixtures in [the native snapshot](../tests/Reference/Plotting/README.md)
ground sharp streams and complete network interactions. Ordinary tests cover
frozen native path/arrow geometry, continuation, source locations, malformed
input and shared budgets/cancellation. Full plotting image qualification remains
pending while function sampling and smoothing are implemented.
