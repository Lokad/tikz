# Sharp plot observations

These four repository-authored fixtures are independently observed with PGF
3.1.11a, the pinned local MiKTeX tools, outlined dvisvgm SVG and ordinary PDF.
The existing path-label producer and arrow supplement capture points, paint,
node/label geometry, arrow lowering, picture bounds and physical paint order.
Probes preserve native SVG drawing, PDF bytes and rasterized PDF images.

`network-coordinate-plot` combines positioning, parameterized node styles,
path labels, four Stealth arrows, calculated coordinates and plotted samples
under a named-coordinate shift and changed basis vectors.
`coordinate-plot-contract` checks connected/new subpaths, empty/single streams,
relative samples, every-plot/local options, named/calc/polar samples and transformed
continuation. In particular, relative samples all use the entry reference;
completion updates the path position once, independent of sample `+`/`++`.

`network-function-plot` adds finite function sampling, a scoped sample variable,
trigonometry and a numeric assignment to the complete network interactions.
`function-plot-contract` checks initial/recomputed defaults, ascending/descending
decimal ranges, equal/tiny domains, clamped/fractional sample counts, explicit
lists, option order, variable shadowing/restoration, styles, physical/polar
coordinates, integer powers and distinct-variable foreach interaction.

An equal domain has two coincident native samples. PGF's SVG driver omits the
line from that isolated butt stroke; the PDF retains both segments. The native
checker admits this specific SVG serialization only with an explicit opt-in,
while ordinary numeric tests still compare both original PGF segments. Controls
reject a lost nonzero line, a lost round-cap dot and a longer omitted stream.

The JSON files contain unchanged native arrow/path observations. Ordinary tests
pin their bytes and fixture hashes, then reuse the independent numeric checker.
Live native regeneration remains separate from `dotnet test`.

This is sharp coordinate-list and finite-function iteration evidence. Smooth
handlers, marks, file/gnuplot input, PGFPlots and full plotting image qualification
are outside this snapshot's claim.
