# RGB color profile

Lokad.TikZ's declared color profile is `xcolor-rgb-v1`: TikZ/PGF 3.1.11a with
`\usepackage[rgb]{xcolor}` loaded before TikZ. SVG output uses RGB. This explicit
setup makes the reference PDF and SVG routes use the same color model; no ICC
profile, installed color service, or native conversion is needed at runtime.

Supported names are `black`, `white`, `red`, `green`, `blue`, `cyan`, `magenta`,
`yellow`, `gray`, `darkgray`, `lightgray`, `orange`, `violet`, `purple`, `brown`,
`pink`, `lime`, `olive`, and `teal`. Names are case-sensitive. A mixture such as
`red!30!blue` retains 30% of the current color and 70% of the next color.
`red!30` uses white as the second color. Chained mixtures evaluate from left to
right. Percentages must be finite and between 0 and 100. Unknown names and
malformed/nonfinite mixtures fail with source diagnostics and no SVG.

PGF's path backend and text-color specials have different byte conversion:

| Use | Conversion | Example component 0.75 |
| --- | --- | --- |
| Path fill/stroke | Round to integer TeX sp at 65536 units, truncate division by 256, clamp to 255 | 192 (`c0`) |
| Outlined glyph fill | Round the RGB component times 255 | 191 (`bf`) |

The converter preserves this measured distinction. For example, `lightgray`
produces a `#c0c0c0` border and `#bfbfbf` label under the pinned SVG route.
Mixing happens before byte conversion. The resolved color remains RGB; SVG
emission applies the appropriate path or glyph byte conversion.

The trusted [palette fixture](../tests/Fixtures/Nodes/colors.tikz) checks all
nineteen names, five mixtures, and a scoped color/opacity through actual nodes
and a connecting path. Its independent RGB oracle has 25 nodes; all emitted
path/glyph colors agree exactly, alongside native text and node measurements.
The state/paint fixture's former seven magenta glyph mismatches also disappear
under RGB, with native layout/frames/glyph positions unchanged. Ordinary tests
consume these measurements without TeX or a browser.

Default TeX color handling can use CMYK for cyan, magenta, and yellow. In that
setup, the direct SVG path route, DVI text specials, and PDF rasterizer can
produce different RGB samples. Original default-color references remain under
`tests/Reference/NodeInteractions/`; RGB references are separate under
`tests/Reference/NodeInteractionsRgb/`. The default-color discrepancy remains
visible. This profile makes no ICC-managed CMYK compatibility claim. General
color definitions, color-model selection in source, and arbitrary TeX color
packages remain outside the current subset.

Color equality is a semantic/emission gate. Complete image compatibility still
requires independent coordinate/viewport calibration and the PDF raster gate;
the RGB palette does not authorize a wider pixel allowance. See the
[interaction experiment](../tools/TikzReference/NODE-INTERACTIONS.md).
