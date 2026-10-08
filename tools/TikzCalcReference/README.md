# Native calculated-coordinate reference

The trusted `tests/Fixtures/calc-coordinates.tikz` fixture covers 25 calculated
and input coordinate anchors plus an empty circle node. `wrapper.tex` compiles
the picture; `probes.tex` reads each coordinate in a reset world frame and logs
integer TeX scaled points. The probes add no paint.

The cached `tests/Reference/CalcCoordinates/points.json` records the source hash,
native coordinates, tool/font versions, observer SVG hash and TeX box. The
original outlined native SVG is cached beside it as `reference.svg`. Ordinary
xUnit tests read this cache and require no TeX installation or browser.

The native generation command requires Node, MiKTeX with PGF 3.1.11a and Latin
Modern already installed, and dvisvgm 3.4.3. Run from the repository root:

```powershell
node tools/TikzCalcReference/generate.mjs
```

Generation uses the fixed trusted fixture only, with package installation and
shell execution disabled. It creates a fresh ignored `artifacts/calc-native/`
directory containing plain/probed inputs, original logs, DVI, SVG, recorder
files and a hash-bound report. It requires identical plain/probed SVG bytes and
TeX boxes, all 25 expected anchors, and exact agreement with the cached source
and coordinate values. It never updates the cache automatically.

The converter is not invoked during native reference generation. Native
measurement is one part of grounding; candidate primary/PDF comparison and
image-only fault detection remain separate requirements.
