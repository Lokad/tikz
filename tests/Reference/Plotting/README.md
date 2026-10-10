# Sharp coordinate-list plot observations

These two repository-authored fixtures are independently observed with PGF
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

The JSON files contain unchanged native arrow/path observations. Ordinary tests
pin their bytes and fixture hashes, then reuse the independent numeric checker.
Live native regeneration remains separate from `dotnet test`.

This is coordinate-list iteration evidence. Function sampling, smooth handlers,
marks, file/gnuplot input, PGFPlots and full plotting image qualification are
outside this snapshot's claim.
