# Styled multiline flowchart: numeric grounding

The repository-authored `flowchart-styled-labels.tikz` combines four measured
nodes, five path labels, five Stealth arrows, positioning and a calculated
return coordinate. It uses all six existing EC prose faces (regular, bold and
italic at 10/12pt), normal inline math, left/center/right alignment, mixed-size
two/three-row labels, grouped font changes and a sloped two-row path label.

The frozen observation has nine boxes, 144 anchors, 75 glyphs and two rules.
Ordinary tests check every box, anchor, font/slot/position, rule and paint order
using independent native TFM widths and DVI movements. The original outlined
SVG is bound to 176 origin/glyph/rule quantities. Plain/probed SVG bytes agree.
The selected EC TFM bytes use the existing text profile; no new production
font resources or runtime dependencies are introduced.

PGF's rectangle `mid` anchor uses the querying font's `.5ex`. These probes
query after the picture in the surrounding default font, including the node
constructed with `node font={\large\bfseries}`. The trace exporter uses that
same querying context. Node-font metrics still determine construction geometry.

```sh
dotnet test Lokad.TikZ.slnx
dotnet run --project tools/TikzReference -c Release -- export-math-labels --case flowchart-styled-labels --out artifacts/styled-labels-public
```

Trusted live regeneration, separate from ordinary tests:

```sh
node tools/TikzVisual/diagram-positioning-reference.mjs flowchart-styled-labels
```

The selector checks the fixed source digest before launching MiKTeX. Frozen
references are retained separately and are not overwritten by this command.
The original three math fixtures remain the default export/reference corpus.

Paired image inspection at 1x/4x on transparent/white/black backgrounds shows
zero measured edge displacement and equal component counts. Strict zero-error
comparison fails: the largest sample error is 6/255, with 150 changed pixels
in the 4x white view. The natural size difference is below 0.000005 CSS pixels.
These are iteration observations. Native-only calibration, source-attributed
local checks, original/candidate PDF checks and final current-source image
qualification remain required before admitting this additional diagram.
